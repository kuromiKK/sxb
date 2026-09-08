import { z } from 'zod'
import { db, type Queryable } from './db.ts'
import { fail } from './security.ts'
import { validateDocument } from './rich-document.ts'

export const kinds = ['subject','chapter','section','knowledge','question','course','handout','article','announcement','faq','cheatsheet'] as const
export const contentSchema = z.object({
  id: z.string().min(1).max(160), exam_id: z.string().nullable(), kind: z.enum(kinds),
  parent_id: z.string().nullable(), title: z.string().trim().min(1).max(2000),
  status: z.enum(['draft','review','published','offline']), payload: z.record(z.string(),z.any()),
  source: z.string().min(1).max(300), is_test_data: z.boolean(), version: z.number().int().min(1).optional()
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
  if(['knowledge','cheatsheet'].includes(row.kind)) {
    if(!row.exam_id)fail(400,'请选择所属考试')
    if(row.payload.document)row.payload.content=(await validateDocument(row.payload.document,row.id,row.exam_id!,c)).text
    if(row.kind==='knowledge'&&row.payload.isKnowledgeCourse!==undefined&&typeof row.payload.isKnowledgeCourse!=='boolean')fail(400,'知识点课程标记必须为开关值')
    if(row.kind==='cheatsheet') {
      const p=z.object({intro:z.string().trim().min(1).max(500),opensAt:z.iso.datetime({offset:true}),closesAt:z.iso.datetime({offset:true})}).parse(row.payload)
      if(new Date(p.closesAt)<=new Date(p.opensAt))fail(400,'结束时间必须晚于开放时间')
      if(!row.payload.document)fail(400,'请填写考前小抄正文')
    }
  }
  if(row.status==='published'&&!row.is_test_data&&row.payload.starsPendingReview)fail(400,'请先核对正式知识点星级并清除待核对标记，再发布')
  if (row.kind === 'question') {
    validateQuestion(row.payload)
    if (row.parent_id !== row.payload.knowledgePointId) fail(400,'题目父级必须与关联知识点一致')
    const point=(await c.query(`SELECT id FROM content WHERE id=$1 AND kind='knowledge' AND exam_id=$2`,[row.payload.knowledgePointId,row.exam_id])).rows[0]
    if (!point) fail(400,'关联知识点不存在或不属于该考试')
  }
  if (row.parent_id) {
    if (row.parent_id === row.id) fail(400,'不能关联自身')
    const p=(await c.query('SELECT * FROM content WHERE id=$1',[row.parent_id])).rows[0]
    if (!p || p.exam_id !== row.exam_id) fail(400,'父级不存在或考试不一致')
    const parents: Record<string,string[]>={chapter:['subject'],section:['chapter'],knowledge:['section'],question:['knowledge'],course:['section','knowledge'],handout:['course']}
    if (!parents[row.kind]?.includes(p.kind)) fail(400,'父级类型不正确')
  } else if (['chapter','section','knowledge','course','handout'].includes(row.kind)) fail(400,'请选择所属章节、知识点或课程')
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
  const ancestry=(row:any) => {
    const result:Record<string,any>={};let node=byId.get(row.parent_id)
    while(node){result[node.kind]=node;node=byId.get(node.parent_id)}
    return {subjectId:result.subject?.id,subjectName:result.subject?.title,chapterId:result.chapter?.id,chapterName:result.chapter?.title,sectionId:result.section?.id,sectionName:row.kind==='course'?row.title:result.section?.title,knowledgePointId:result.knowledge?.id,knowledgePointTitle:result.knowledge?.title}
  }
  const children=(parent: string, kind: string) => all.filter(x=>x.parent_id===parent && x.kind===kind)
  const safePoint=(p:any)=>{const {document,...payload}=p.payload;return payload}
  const knowledgeSubjects=all.filter(x=>x.kind==='subject').map(s=>({ ...s.payload,id:s.id,name:s.title,chapters:children(s.id,'chapter').map(c=>({ ...c.payload,id:c.id,name:c.title,sections:children(c.id,'section').map(t=>({ ...t.payload,id:t.id,name:t.title,points:children(t.id,'knowledge').map(p=>({...safePoint(p),id:p.id,title:p.title,questionTotal:children(p.id,'question').length,questionDone:0,mastery:0})) })) })) }))
  const records=(kind:string) => all.filter(x=>x.kind===kind).map(x=>({...x.payload,...ancestry(x),id:x.id,title:x.title,isTestData:x.is_test_data,updatedAt:x.updated_at}))
  return { knowledgeSubjects, courseCatalog:records('course').map(({ mediaUrl, downloadUrl, content, articleSections, ...x })=>({...x,progress:0,currentMinute:0,completed:false})), practiceQuestions:records('question').map(({answer,explanation,referenceAnswer,rubric,...x})=>({...x,answer:[],explanation:''})), articles:records('article'), announcements:records('announcement'), faqs:records('faq') }
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
