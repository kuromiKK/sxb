import { db } from './db.ts'
import { fail } from './security.ts'

/** Administrative structure includes unpublished nodes; public catalog applies visibility separately. */
export async function knowledgeStructure(examId: string) {
  const exam=(await db.query('SELECT * FROM exams WHERE id=$1',[examId])).rows[0]
  if(!exam)fail(404,'考试不存在')
  const rows=(await db.query("SELECT * FROM content WHERE exam_id=$1 AND kind IN ('subject','chapter','section','knowledge','course') AND NOT (payload ? 'deletedAt') ORDER BY created_at,id",[examId])).rows
  const totals=(await db.query('SELECT knowledge_id,count(*)::int AS n FROM question_knowledge_points k JOIN questions q ON q.id=k.question_id WHERE q.exam_id=$1 GROUP BY knowledge_id',[examId])).rows
  const counts=new Map(totals.map(r=>[r.knowledge_id,r.n]))
  const questionCount=(await db.query('SELECT count(*)::int AS n FROM questions WHERE exam_id=$1',[examId])).rows[0].n
  const byParent=new Map<string|null,any[]>()
  for(const row of rows)byParent.set(row.parent_id,[...(byParent.get(row.parent_id)||[]),row])
  const children=(id:string|null,kind:string)=>(byParent.get(id)||[]).filter(r=>r.kind===kind).sort((a,b)=>(Number(a.payload.no)||0)-(Number(b.payload.no)||0)||a.title.localeCompare(b.title,'zh-CN'))
  const course=(r:any)=>({...r,type:'course',mediaType:r.payload.type||'article'})
  const subjects=children(null,'subject').map(s=>({...s,type:s.kind,chapters:children(s.id,'chapter').map(c=>({...c,type:c.kind,sections:children(c.id,'section').map(t=>({...t,type:t.kind,courses:children(t.id,'course').map(course),knowledge:children(t.id,'knowledge').map(k=>({...k,type:k.kind,questions:counts.get(k.id)||0,courses:children(k.id,'course').map(course),hasHandout:children(k.id,'course').some(r=>r.payload.hasHandout||r.payload.handouts?.length)}))}))}))}))
  return {exam,rows,subjects,counts:{...Object.fromEntries(['subject','chapter','section','knowledge','course'].map(kind=>[kind,rows.filter(r=>r.kind===kind).length])),question:questionCount}}
}
