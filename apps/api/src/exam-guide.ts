import { db } from './db.ts'
import { fail } from './security.ts'
import { messageHtml } from '../../shared/message-document.ts'
import { hasExamGuide,currentExamTerm } from '../../shared/exam-guide.ts'
export async function migrateExamGuide(){
  await db.query('ALTER TABLE exam_year_entries ADD COLUMN IF NOT EXISTS guide_document jsonb')
  await db.query('ALTER TABLE exam_year_entries ADD COLUMN IF NOT EXISTS guide_updated_at timestamptz')
}
export async function examGuide(examId:string,termId?:string){
  const exam=(await db.query('SELECT id,name FROM exams WHERE id=$1 AND enabled',[examId])).rows[0]
  if(!exam)fail(404,'考试不存在或已停用')
  const terms=(await db.query(`SELECT y.id,y.year,to_char(p.ends_at AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD') AS cutoff,p.starts_at AS "startsAt",p.ends_at AS "endsAt",y.guide_document,y.guide_updated_at FROM exam_year_entries y LEFT JOIN exam_cycles p ON p.exam_id=y.exam_id AND p.year=y.year WHERE y.exam_id=$1 ORDER BY y.year DESC`,[examId])).rows
  const term=termId?terms.find(t=>t.id===termId):currentExamTerm(terms)
  if(termId&&!term)fail(404,'该考试下没有此考期')
  return {examId:exam.id,examName:exam.name,term:term?{id:term.id,year:term.year,cutoff:term.cutoff,startsAt:term.startsAt,endsAt:term.endsAt}:null,hasGuide:hasExamGuide(term?.guide_document),html:hasExamGuide(term?.guide_document)?messageHtml(term.guide_document):'',updatedAt:term?.guide_updated_at||null}
}
