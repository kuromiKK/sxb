import { Router } from 'express'
import { z } from 'zod'
import { db, transaction } from './db.ts'
import { fail } from './security.ts'

export async function migrateLearningRecords(){await transaction(async c=>{
 await c.query('LOCK TABLE schema_versions IN EXCLUSIVE MODE')
 if((await c.query('SELECT 1 FROM schema_versions WHERE version=21')).rows.length)return
 // Old submissions have no reliable historical question version: deliberately leave NULL.
 await c.query('ALTER TABLE answers ADD COLUMN question_snapshot jsonb')
 await c.query('CREATE INDEX answers_learning_history ON answers(user_id,exam_id,question_id,created_at DESC,id)')
 await c.query('CREATE INDEX answers_learning_date ON answers(created_at DESC,id)')
 await c.query('CREATE INDEX submissions_learning_date ON question_submissions(created_at DESC,id)')
 await c.query('CREATE INDEX records_learning_kind_date ON user_records(kind,updated_at DESC,id)')
 // This table was introduced after the global entry-number migration.
 await c.query('CREATE SEQUENCE entry_number_question_submissions')
 await c.query("INSERT INTO record_numbers SELECT 'question_submissions',id,row_number() OVER(ORDER BY created_at,id) FROM question_submissions")
 await c.query("SELECT setval('entry_number_question_submissions',(SELECT count(*)+1 FROM question_submissions),false)")
 await c.query("CREATE TRIGGER record_number_insert AFTER INSERT OR UPDATE OF id ON question_submissions FOR EACH ROW EXECUTE FUNCTION assign_record_number('entry_number_question_submissions')")
 await c.query('INSERT INTO schema_versions(version) VALUES(21)')
})}

// Membership of the notebook depends on the most recent WRONG attempt, not the latest attempt.
export const wrongStateSql=`SELECT a.user_id,a.exam_id,a.question_id,
 count(*) FILTER(WHERE NOT a.correct)::int AS wrong_count,
 min(a.created_at) FILTER(WHERE NOT a.correct) AS first_wrong_at,
 max(a.created_at) FILTER(WHERE NOT a.correct) AS last_wrong_at,
 coalesce(max(d.updated_at)>=max(a.created_at) FILTER(WHERE NOT a.correct),false) AS wrong_hidden,
 (max(a.created_at) FILTER(WHERE NOT a.correct) IS NOT NULL AND
 (max(d.updated_at) IS NULL OR max(d.updated_at)<max(a.created_at) FILTER(WHERE NOT a.correct))) AS in_wrong_book
 FROM answers a LEFT JOIN user_records d ON d.user_id=a.user_id AND d.exam_id=a.exam_id AND d.kind='wrongDismissal' AND d.source_id=a.question_id
 GROUP BY a.user_id,a.exam_id,a.question_id`

export const attempts=`SELECT 'configured:'||s.id AS id,s.id AS record_id,'configured' AS source,s.user_id,s.exam_id,s.question_id AS content_id,
 s.created_at,s.updated_at,s.answers AS selection,s.result,s.question_snapshot
 FROM question_submissions s
 UNION ALL SELECT 'legacy:'||a.id,a.id,'legacy',a.user_id,a.exam_id,a.question_id,a.created_at,a.created_at,a.selection,
 coalesce(a.response,'{}'::jsonb)||jsonb_build_object('status','graded','correct',a.correct),a.question_snapshot
 FROM answers a WHERE NOT EXISTS(SELECT 1 FROM question_submissions s WHERE s.user_id=a.user_id AND s.request_id=a.request_id)`
const kinds=z.enum(['answers','wrong','favorites','notes'])
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>{const d=new Date(v+'T00:00:00Z');return !isNaN(+d)&&d.toISOString().slice(0,10)===v})
const filters=z.object({examId:z.string().max(160).default(''),user:z.string().max(100).default(''),title:z.string().max(150).default(''),text:z.string().max(150).default(''),typeId:z.string().max(100).default(''),kind:z.enum(['','question','knowledge','course']).default(''),result:z.enum(['','correct','wrong','ai_pending','ai_processing','ai_failed','self_review','self_graded','ai_graded']).default(''),from:date.optional(),to:date.optional(),page:z.coerce.number().int().min(1).max(100000).default(1)})
function base(kind:z.infer<typeof kinds>){
 if(kind==='answers')return `WITH raw AS (${attempts}), records AS (SELECT r.*,NULL::text AS note,NULL::int AS wrong_count,NULL::timestamptz AS first_wrong_at,NULL::timestamptz AS last_wrong_at FROM raw r)`
 if(kind==='wrong')return `WITH wrongs AS (${wrongStateSql}), raw AS (${attempts}), records AS (
 SELECT r.*,NULL::text AS note,w.wrong_count,w.first_wrong_at,w.last_wrong_at FROM wrongs w
 JOIN LATERAL (SELECT * FROM raw r WHERE r.user_id=w.user_id AND r.exam_id=w.exam_id AND r.content_id=w.question_id ORDER BY r.created_at DESC,r.id DESC LIMIT 1) r ON true WHERE w.in_wrong_book)`
 return `WITH records AS (SELECT r.id,r.id AS record_id,'record' AS source,r.user_id,r.exam_id,
 coalesce(nullif(r.payload->>'sourceId',''),regexp_replace(r.source_id,'^(question|knowledge|course):','')) AS content_id,
 r.created_at,r.updated_at,NULL::jsonb AS selection,NULL::jsonb AS result,NULL::jsonb AS question_snapshot,
 ${kind==='notes'?"coalesce(r.payload->>'content','')":"NULL::text"} AS note,NULL::int AS wrong_count,NULL::timestamptz AS first_wrong_at,NULL::timestamptz AS last_wrong_at
 FROM user_records r WHERE r.kind='${kind==='notes'?'note':'favorite'}')`
}
const joins=` FROM records r JOIN users u ON u.id=r.user_id LEFT JOIN exams e ON e.id=r.exam_id LEFT JOIN content c ON c.id=r.content_id AND c.exam_id=r.exam_id AND NOT (c.payload ? 'deletedAt')`
const titleSql="coalesce(r.question_snapshot->>'title',r.question_snapshot->>'stem',c.title,'原内容已不存在')"
const typeSql="coalesce(r.question_snapshot->>'templateId',r.question_snapshot->>'type',c.payload->>'templateId',c.payload->>'type','')"
const select=`SELECT r.id,r.record_id,r.source,r.user_id,r.exam_id,r.content_id,r.created_at,r.updated_at,r.wrong_count,r.first_wrong_at,r.last_wrong_at,
 left(r.note,120) AS note_preview,${titleSql} AS title,coalesce(c.kind,CASE WHEN r.source<>'record' THEN 'question' ELSE 'unknown' END) AS kind,
 c.status AS content_status,${typeSql} AS type_id,coalesce(r.question_snapshot->>'typeName',c.payload->>'typeName') AS type_name,
 r.result->>'status' AS grading_status,r.result->'correct' AS correct,r.result->'score' AS score,r.result->'maxScore' AS max_score,
 r.result->'containsSelfScore' AS contains_self_score,u.nickname,substring(u.phone,1,3)||'****'||right(u.phone,4) AS phone,e.name AS exam_name`

export const learningRecords=Router()
learningRecords.get('/collections/:kind',async(req,res)=>{
 const kind=kinds.parse(req.params.kind),q=filters.parse(req.query)
 if((q.from&&!q.to)||(!q.from&&q.to)||(q.from&&q.to&&q.from>q.to))fail(400,'请选择完整且有效的时间范围')
 const time=kind==='wrong'?'r.last_wrong_at':kind==='notes'?'r.updated_at':'r.created_at'
 const scope=res.locals.profileScope
 const args:any[]=[scope?.examId||q.examId,q.user.trim(),q.title.trim(),q.kind,q.typeId,q.result,q.text.trim(),q.from?q.from+'T00:00:00+08:00':null,q.to?new Date(Date.parse(q.to+'T00:00:00+08:00')+86400000).toISOString():null,scope?.userId||null]
 const where=` WHERE ($1='' OR r.exam_id=$1) AND ($2='' OR strpos(u.nickname,$2)>0 OR strpos(u.phone,$2)>0)
 AND ($3='' OR strpos(${titleSql},$3)>0) AND ($4='' OR c.kind=$4) AND ($5='' OR ${typeSql}=$5)
 AND ($6='' OR ($6='correct' AND r.result->>'correct'='true') OR ($6='wrong' AND r.result->>'correct'='false') OR r.result->>'status'=$6)
 AND ($7='' OR strpos(r.note,$7)>0) AND ($8::timestamptz IS NULL OR ${time}>=$8) AND ($9::timestamptz IS NULL OR ${time}<$9) AND ($10::text IS NULL OR r.user_id=$10)`
 const prefix=base(kind)
 const total=(await db.query(prefix+' SELECT count(*)::int AS n'+joins+where,args)).rows[0].n
 const items=(await db.query(prefix+' '+select+joins+where+` ORDER BY ${time} DESC,r.id LIMIT 20 OFFSET $11`,[...args,(q.page-1)*20])).rows
 res.json({items,total})
})
learningRecords.get('/collections/:kind/:id',async(req,res)=>{
 const kind=kinds.parse(req.params.kind)
 const scope=res.locals.profileScope
 const row=(await db.query(base(kind)+' '+select+`,r.note,r.selection,r.result,r.question_snapshot,c.payload AS current_payload`+joins+' WHERE r.id=$1 AND ($2::text IS NULL OR (r.user_id=$2 AND r.exam_id=$3))',[req.params.id,scope?.userId||null,scope?.examId||null])).rows[0]
 if(!row)fail(404,'记录不存在，可能已被用户移除，请刷新列表')
 const path=(await db.query(`WITH RECURSIVE p AS (SELECT id,parent_id,title,0 AS depth FROM content WHERE id=$1 AND exam_id=$2 UNION ALL SELECT c.id,c.parent_id,c.title,p.depth+1 FROM content c JOIN p ON c.id=p.parent_id WHERE p.depth<8 AND c.exam_id=$2) SELECT title FROM p ORDER BY depth DESC`,[row.content_id,row.exam_id])).rows.map(r=>r.title)
 const knowledgePoints=row.kind==='question'?(await db.query('SELECT n.id,n.title FROM question_knowledge_points k JOIN knowledge_nodes n ON n.id=k.knowledge_id WHERE k.question_id=$1 AND n.exam_id=$2 ORDER BY k.is_primary DESC,n.title',[row.content_id,row.exam_id])).rows:[]
 const history=kind==='wrong'?(await db.query(`WITH raw AS (${attempts}) SELECT id,created_at,result->>'status' AS grading_status,result->'correct' AS correct,result->'score' AS score,result->'maxScore' AS max_score FROM raw WHERE user_id=$1 AND exam_id=$2 AND content_id=$3 ORDER BY created_at DESC,id DESC LIMIT 20`,[row.user_id,row.exam_id,row.content_id])).rows:undefined
 res.json({...row,path,knowledgePoints,history})
})
