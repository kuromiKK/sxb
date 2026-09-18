import { z } from 'zod'
import { db, type Queryable } from './db.ts'
import { fail } from './security.ts'
import { validateDocument,inspectDocument,renderText } from './rich-document.ts'
import { splitKnowledgeHandouts } from '../../shared/knowledge-handouts.ts'
import { questionGrades } from './question-grades.ts'
import { validateConfiguredQuestion } from './question-types.ts'
import { publicQuestion } from '../../shared/question-types.ts'
import { publicFaqs } from './articles.ts'

export const kinds = ['subject','chapter','section','knowledge','question','course','handout','article','announcement','faq','cheatsheet'] as const
export const contentSchema = z.object({
  id: z.string().min(1).max(160), exam_id: z.string().nullable(), kind: z.enum(kinds),
  parent_id: z.string().nullable(), title: z.string().trim().min(1).max(2000),
  status: z.enum(['draft','review','published','offline']), payload: z.record(z.string(),z.any()),
  source: z.string().min(1).max(300), is_test_data: z.boolean(), version: z.number().int().min(1).optional(),
  grade:z.enum(questionGrades).nullable().optional()
})
export function validateQuestion(value: any) {
  const q = z.object({ type:z.enum(['single','multiple','subjective']), stem:z.string().trim().min(1), options:z.array(z.string()).default([]), answer:z.array(z.number().int().min(0)).default([]), explanation:z.string().default(''), knowledgePointId:z.string().min(1), year:z.string().optional(), source:z.string().optional(), referenceAnswer:z.string().optional(), maxScore:z.number().positive().optional(), rubric:z.string().optional() }).parse(value)
  if (q.type !== 'subjective') {
    if (q.options.length < 2 || q.options.some(v => !v.trim())) fail(400,'选择题至少需要两个非空选项')
    if (q.answer.some(i=>i>=q.options.length) || new Set(q.answer).size !== q.answer.length) fail(400,'答案索引超出选项范围或重复')
    if ((q.type === 'single' && q.answer.length!==1) || (q.type === 'multiple' && q.answer.length<2)) fail(400,'答案数量与题型不匹配')
  } else if (!q.referenceAnswer || !q.rubric || !q.maxScore) fail(400,'主观题需要参考答案、评分标准与满分')
  return q
}
export async function validateContent(row: z.infer<typeof contentSchema>, c: Queryable = db) {
  if(row.kind==='subject')row.payload.shortTitle=z.string().trim().max(12,'科目短标题最多12个字').default('').parse(row.payload.shortTitle)
  if(['article','announcement','faq'].includes(row.kind)&&row.payload.document){const checked=inspectDocument(row.payload.document);if(checked.assets.length)fail(400,'此正文仅支持文字和图片');row.payload.content=checked.text}
  if(row.kind!=='question'&&row.grade!=null)fail(400,'等级仅适用于题目')
  if(['subject','chapter','section','knowledge','cheatsheet'].includes(row.kind)) {
    if(!row.exam_id)fail(400,'请选择所属考试')
    if(row.payload.document)row.payload.content=(await validateDocument(row.payload.document,row.id,row.exam_id!,c)).text
    if(row.kind==='knowledge') {
      row.payload.handouts=z.array(z.object({assetId:z.string().min(1).max(160),title:z.string().trim().min(1).max(200)}).strict()).max(1,'每个知识点只能添加一份讲义').default([]).parse(row.payload.handouts)
      const separated=splitKnowledgeHandouts(row.payload)
      if(separated.handouts.length>1)fail(400,'每个知识点只能添加一份讲义')
      for(const handout of separated.handouts) {
        const asset=(await c.query("SELECT id FROM media_assets WHERE id=$1 AND content_id=$2 AND exam_id=$3 AND kind='handout'",[handout.assetId,row.id,row.exam_id])).rows[0]
        if(!asset)fail(400,'讲义不存在或不属于当前知识点与考试')
      }
      row.payload.handouts=separated.handouts
      if(separated.document)row.payload.document=separated.document
    }
    if(['section','knowledge'].includes(row.kind))row.payload[row.kind==='section'?'hasPremiumCourse':'isKnowledgeCourse']=(await c.query("SELECT 1 FROM content WHERE kind='course' AND parent_id=$1 AND NOT (payload ? 'deletedAt') LIMIT 1",[row.id])).rows.length>0
    if(row.kind==='cheatsheet') {
      const p=z.object({intro:z.string().trim().min(1).max(500),opensAt:z.iso.datetime({offset:true}),closesAt:z.iso.datetime({offset:true})}).parse(row.payload)
      if(new Date(p.closesAt)<=new Date(p.opensAt))fail(400,'结束时间必须晚于开放时间')
      if(!row.payload.document)fail(400,'请填写考前小抄正文')
    }
  }
  if(row.kind==='course') {
    if(!row.exam_id)fail(400,'请选择所属考试')
    const p=row.payload
    p.type=z.enum(['article','video','audio']).parse(p.type||'article')
    if('deletedAt' in p)fail(400,'不能通过保存接口删除课程')
    if(p.document)p.content=(await validateDocument(p.document,row.id,row.exam_id!,c)).text
    p.handouts=z.array(z.object({assetId:z.string().min(1).max(160),title:z.string().trim().min(1).max(200)}).strict()).max(1,'每门课只能添加一份讲义').default([]).parse(p.handouts)
    const assets=[...p.handouts.map((h:any)=>({id:h.assetId,kind:'handout'})),...(p.mediaAssetId?[{id:p.mediaAssetId,kind:p.type}]:[]),...(p.posterAssetId?[{id:p.posterAssetId,kind:'image'}]:[])]
    for(const a of assets)if(!(await c.query('SELECT id FROM media_assets WHERE id=$1 AND content_id=$2 AND exam_id=$3 AND kind=$4',[a.id,row.id,row.exam_id,a.kind])).rows.length)fail(400,'课程资源类型不正确或不属于当前课程')
    for(const key of ['mediaUrl','downloadUrl'])if(p[key]&&!/^https:\/\/[^\s]+$/.test(p[key]))fail(400,'资源链接必须使用HTTPS')
    if(p.type==='article'){delete p.mediaAssetId;delete p.mediaUrl;delete p.totalMinutes}
    else if(p.totalMinutes!=null)p.totalMinutes=z.number().min(0).max(100000).parse(p.totalMinutes)
    const legacy=(await c.query("SELECT 1 FROM content WHERE kind='handout' AND parent_id=$1 AND status<>'offline' LIMIT 1",[row.id])).rows.length>0
    p.hasHandout=Boolean(p.handouts.length||p.downloadUrl||(!p.removeLegacyHandout&&legacy))
  }
  if(row.status==='published'&&!row.is_test_data&&row.payload.starsPendingReview)fail(400,'请先核对正式知识点星级并清除待核对标记，再发布')
  if (row.kind === 'question') {
    if(row.payload.type==='configured'){
      const old=(await c.query("SELECT payload FROM content WHERE id=$1 AND kind='question'",[row.id])).rows[0]
      await validateConfiguredQuestion(row.payload,row.exam_id!,c,old?.payload)
    }else validateQuestion(row.payload)
    if (row.parent_id !== row.payload.knowledgePointId) fail(400,'题目父级必须与关联知识点一致')
    const ids=z.array(z.string().min(1).max(160)).min(1).max(100).parse(row.payload.knowledgePointIds??[row.parent_id])
    if(new Set(ids).size!==ids.length)fail(400,'关联知识点不能重复')
    if(!ids.includes(row.parent_id!))fail(400,'主知识点必须属于关联知识点')
    const points=(await c.query(`SELECT id FROM knowledge_nodes WHERE id=ANY($1::text[]) AND kind='knowledge' AND exam_id=$2 FOR SHARE`,[ids,row.exam_id])).rows
    if(points.length!==ids.length)fail(400,'关联知识点不存在或不属于该考试')
    row.payload.knowledgePointIds=ids
  }
  if (row.parent_id) {
    if (row.parent_id === row.id) fail(400,'不能关联自身')
    const p=(await c.query('SELECT * FROM content WHERE id=$1',[row.parent_id])).rows[0]
    if (!p || p.exam_id !== row.exam_id) fail(400,'父级不存在或考试不一致')
    const parents: Record<string,string[]>={chapter:['subject'],section:['chapter'],knowledge:['section'],question:['knowledge'],course:['section','knowledge'],handout:['course']}
    if (!parents[row.kind]?.includes(p.kind)) fail(400,'父级类型不正确')
    if(row.kind==='course'){
      const old=(await c.query('SELECT parent_id FROM content WHERE id=$1',[row.id])).rows[0]
      if(old&&old.parent_id!==row.parent_id)fail(400,'课程归属由创建位置决定，不能更换')
    }
  } else if (['chapter','section','knowledge','course','handout'].includes(row.kind)) fail(400,'请选择所属章节、知识点或课程')
}
export async function syncCourseFlag(parentId:string,c:Queryable=db){
 const node=(await c.query('SELECT * FROM content WHERE id=$1',[parentId])).rows[0];if(!node)return
 const key=node.kind==='section'?'hasPremiumCourse':'isKnowledgeCourse'
 const has=(await c.query("SELECT 1 FROM content WHERE kind='course' AND parent_id=$1 AND NOT (payload ? 'deletedAt') LIMIT 1",[parentId])).rows.length>0
 if(node.payload[key]!==has)await c.query('UPDATE content SET payload=$2,version=version+1,updated_at=now() WHERE id=$1',[parentId,JSON.stringify({...node.payload,[key]:has})])
}
export async function catalog(examId: string) {
  const published=(await db.query(`SELECT * FROM content WHERE (exam_id=$1 OR exam_id IS NULL) AND status='published' ORDER BY created_at,id`,[examId])).rows
  const byId=new Map(published.map(row=>[row.id,row]))
  const visible=(row:any,seen=new Set<string>()):boolean => {
    if(seen.has(row.id))return false
    seen.add(row.id)
    return !row.parent_id || (byId.has(row.parent_id) && visible(byId.get(row.parent_id),seen))
  }
  const all=published.filter(row=>visible(row))
  const questionLinks=(await db.query(`SELECT k.question_id,k.knowledge_id FROM question_knowledge_points k JOIN questions q ON q.id=k.question_id WHERE q.exam_id=$1`,[examId])).rows
  const visibleIds=new Set(all.map(n=>n.id)),links=new Map<string,string[]>()
  for(const k of questionLinks)if(visibleIds.has(k.knowledge_id))links.set(k.question_id,[...(links.get(k.question_id)||[]),k.knowledge_id])
  const linksFor=(id:string)=>links.get(id)||[]
  const ancestry=(row:any) => {
    const result:Record<string,any>={};let node=byId.get(row.parent_id)
    while(node){result[node.kind]=node;node=byId.get(node.parent_id)}
    return {subjectId:result.subject?.id,subjectName:result.subject?.payload.shortTitle?.trim()||result.subject?.title,chapterId:result.chapter?.id,chapterName:result.chapter?.title,chapterNo:result.subject&&result.chapter?children(result.subject.id,'chapter').findIndex(c=>c.id===result.chapter.id)+1:undefined,sectionId:result.section?.id,sectionNo:result.chapter&&result.section?children(result.chapter.id,'section').findIndex(s=>s.id===result.section.id)+1:undefined,sectionName:row.kind==='course'?row.title:result.section?.title,knowledgePointId:result.knowledge?.id,knowledgePointTitle:result.knowledge?.title}
  }
  const directoryOrder=(a:any,b:any)=>(Number(a.payload.no)||0)-(Number(b.payload.no)||0)||new Date(a.created_at).getTime()-new Date(b.created_at).getTime()||a.id.localeCompare(b.id)
  const children=(parent: string, kind: string) => all.filter(x=>x.parent_id===parent && x.kind===kind).sort(directoryOrder)
  const safePoint=(p:any)=>{const {document,handouts,...payload}=p.payload;return payload}
  const questionIdsFor=(ids:string[])=>all.filter(x=>x.kind==='question'&&linksFor(x.id).some(id=>ids.includes(id))).map(x=>x.id)
  const knowledgeSubjects=all.filter(x=>x.kind==='subject').sort(directoryOrder).map(s=>({ ...s.payload,id:s.id,name:s.payload.shortTitle?.trim()||s.title,fullName:s.title,chapters:children(s.id,'chapter').map(c=>({ ...c.payload,id:c.id,name:c.title,sections:children(c.id,'section').map(t=>({ ...t.payload,id:t.id,name:t.title,questionTotal:questionIdsFor(children(t.id,'knowledge').map(p=>p.id)).length,courseIds:children(t.id,'course').map(x=>x.id),points:children(t.id,'knowledge').map(p=>({...safePoint(p),id:p.id,title:p.title,courseIds:children(p.id,'course').map(x=>x.id),questionTotal:questionIdsFor([p.id]).length,questionDone:0,mastery:0})) })) })) }))
  for(const s of knowledgeSubjects){
    for(const ch of s.chapters)ch.questionTotal=questionIdsFor(ch.sections.flatMap((sec:any)=>sec.points.map((p:any)=>p.id))).length
    s.questionTotal=questionIdsFor(s.chapters.flatMap((ch:any)=>ch.sections.flatMap((sec:any)=>sec.points.map((p:any)=>p.id)))).length
  }
  const records=(kind:string) => all.filter(x=>x.kind===kind).map(x=>{
    const linked=kind==='question'?linksFor(x.id):[]
    const paths=linked.map(id=>ancestry(byId.get(id)))
    return {...(kind==='question'?publicQuestion(x.payload):x.payload),...(kind==='course'?{coverUrl:x.payload.posterAssetId?'/api/course-covers/'+encodeURIComponent(x.id):''}:{}),...(['article','announcement','faq'].includes(kind)&&x.payload.document?{contentHtml:renderText(x.payload.document)}:{}),...ancestry(x),...(kind==='question'?{knowledgePointIds:linked,linkedSectionIds:[...new Set(paths.map(p=>p.sectionId))],linkedChapterIds:[...new Set(paths.map(p=>p.chapterId))],linkedSubjectIds:[...new Set(paths.map(p=>p.subjectId))]}:{}),id:x.id,title:x.title,isTestData:x.is_test_data,updatedAt:x.updated_at}
  })
  return { knowledgeSubjects, courseCatalog:records('course').map(({ mediaUrl, downloadUrl, content, articleSections, document, ...x })=>({...x,type:x.type||'article',typeName:({video:'视频',audio:'音频',article:'图文'} as Record<string,string>)[x.type||'article'],totalMinutes:Number(x.totalMinutes)||0,progress:0,currentMinute:0,completed:false})), practiceQuestions:records('question').map(({answer,explanation,referenceAnswer,rubric,...x})=>({...x,answer:[],explanation:''})), articles:records('article'), announcements:records('announcement'), faqs:await publicFaqs(examId) }
}

export async function publishedContent(contentId: string, kind?: string) {
  const rows=(await db.query(`WITH RECURSIVE lineage AS (
    SELECT * FROM content WHERE id=$1
    UNION SELECT c.* FROM content c JOIN lineage l ON c.id=l.parent_id
  ) SELECT * FROM lineage`,[contentId])).rows
  const row=rows.find(r=>r.id===contentId)
  if(!row || (kind && row.kind!==kind) || rows.some(r=>r.status!=='published')) fail(404,'内容不存在或已下架')
  return row
}
