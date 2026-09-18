import { Router } from 'express'
import { z } from 'zod'
import { db, transaction } from './db.ts'
import { fail, id } from './security.ts'
import { publishedContent } from './content.ts'
import { rights } from './membership.ts'

export async function migrateLearningData(){await transaction(async c=>{
 await c.query('LOCK TABLE schema_versions IN EXCLUSIVE MODE')
 if((await c.query('SELECT 1 FROM schema_versions WHERE version=20')).rows.length)return
 await c.query(`CREATE TABLE learning_visits (
  id text PRIMARY KEY,user_id text NOT NULL REFERENCES users(id),exam_id text NOT NULL REFERENCES knowledge_nodes(id),
  session_id text NOT NULL,content_id text NOT NULL,title text NOT NULL,kind text NOT NULL,media_type text NOT NULL,
  path jsonb NOT NULL,started_at timestamptz NOT NULL DEFAULT now(),last_activity_at timestamptz NOT NULL DEFAULT now(),
  position_seconds integer,duration_seconds integer,progress_sequence integer NOT NULL DEFAULT 0,
  UNIQUE(user_id,session_id),CHECK(position_seconds>=0),CHECK(duration_seconds>0))`)
 await c.query('CREATE INDEX learning_visits_date ON learning_visits(started_at DESC,id)')
 await c.query('CREATE INDEX learning_visits_exam_date ON learning_visits(exam_id,started_at DESC,id)')
 await c.query('CREATE INDEX learning_visits_user_content ON learning_visits(user_id,content_id,last_activity_at DESC)')
 await c.query(`CREATE TABLE learning_daily_users(day date NOT NULL,user_id text NOT NULL REFERENCES users(id),exam_id text NOT NULL REFERENCES knowledge_nodes(id),visits bigint NOT NULL DEFAULT 0,answers bigint NOT NULL DEFAULT 0,PRIMARY KEY(day,exam_id,user_id))`)
 // Configured submissions may also generate an answers row. Count the submission once,
 // including subjective submissions still waiting for grading.
 await c.query(`INSERT INTO learning_daily_users(day,user_id,exam_id,answers)
 SELECT (created_at AT TIME ZONE 'Asia/Shanghai')::date,user_id,exam_id,count(*) FROM (
 SELECT user_id,exam_id,created_at FROM question_submissions UNION ALL
 SELECT a.user_id,a.exam_id,a.created_at FROM answers a WHERE NOT EXISTS(SELECT 1 FROM question_submissions s WHERE s.user_id=a.user_id AND s.request_id=a.request_id)
 ) submissions GROUP BY 1,2,3`)
 await c.query(`CREATE FUNCTION summarize_learning_insert() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN
  IF TG_TABLE_NAME='answers' AND EXISTS(SELECT 1 FROM question_submissions s WHERE s.user_id=NEW.user_id AND s.request_id=NEW.request_id) THEN RETURN NEW; END IF;
  INSERT INTO learning_daily_users(day,user_id,exam_id,answers) VALUES((NEW.created_at AT TIME ZONE 'Asia/Shanghai')::date,NEW.user_id,NEW.exam_id,1)
  ON CONFLICT(day,exam_id,user_id) DO UPDATE SET answers=learning_daily_users.answers+1;
  RETURN NEW;
 END $$`)
 await c.query('CREATE TRIGGER learning_answer_insert AFTER INSERT ON answers FOR EACH ROW EXECUTE FUNCTION summarize_learning_insert()')
 await c.query('CREATE TRIGGER learning_submission_insert AFTER INSERT ON question_submissions FOR EACH ROW EXECUTE FUNCTION summarize_learning_insert()')
 await c.query(`CREATE FUNCTION summarize_visit_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 INSERT INTO learning_daily_users(day,user_id,exam_id,visits) VALUES((NEW.started_at AT TIME ZONE 'Asia/Shanghai')::date,NEW.user_id,NEW.exam_id,1)
 ON CONFLICT(day,exam_id,user_id) DO UPDATE SET visits=learning_daily_users.visits+1; RETURN NEW; END $$`)
 await c.query('CREATE TRIGGER learning_visit_insert AFTER INSERT ON learning_visits FOR EACH ROW EXECUTE FUNCTION summarize_visit_insert()')
 await c.query('INSERT INTO schema_versions(version) VALUES(20)')
})}

export const learningCapture=Router()
learningCapture.get('/recent-course',async(req,res)=>{
 const examId=z.string().min(1).max(160).parse(req.query.examId)
 // Join the published hierarchy: withdrawn courses and supporting knowledge courses are excluded.
 const row=(await db.query(`SELECT v.content_id AS "courseId",v.media_type AS type,
  v.position_seconds AS "positionSeconds",v.duration_seconds AS "durationSeconds",r.payload AS progress
  FROM learning_visits v JOIN content c ON c.id=v.content_id AND c.kind='course' AND c.status='published'
  JOIN content s ON s.id=c.parent_id AND s.kind='section' AND s.status='published'
  JOIN content ch ON ch.id=s.parent_id AND ch.kind='chapter' AND ch.status='published'
  JOIN content su ON su.id=ch.parent_id AND su.kind='subject' AND su.status='published'
  LEFT JOIN user_records r ON r.user_id=v.user_id AND r.exam_id=v.exam_id AND r.source_id=c.id AND r.kind='courseProgress'
  WHERE v.user_id=$1 AND v.exam_id=$2 AND c.exam_id=$2
  ORDER BY v.last_activity_at DESC,v.started_at DESC,v.id LIMIT 1`,[res.locals.user.id,examId])).rows[0]
 res.json(row||null)
})
const visitInput=z.object({examId:z.string().min(1).max(160),contentId:z.string().min(1).max(160),sessionId:z.string().min(8).max(120)}).strict()
learningCapture.post('/',async(req,res)=>{
 const b=visitInput.parse(req.body),uid=res.locals.user.id
 const source=await publishedContent(b.contentId)
 if(source.exam_id!==b.examId||!['subject','chapter','section','knowledge','course'].includes(source.kind))fail(404,'学习内容不存在或不属于当前考试')
 if(source.kind==='course'){
  const access=await rights(uid,b.examId)
  if(!access.permissions.courses||(source.payload.requiredLevel==='svip'&&access.level!=='svip'))fail(403,'当前考试课程权限不足')
 }
 const path=(await db.query(`WITH RECURSIVE parents AS (
 SELECT id,parent_id,title,0 AS depth FROM content WHERE id=$1
 UNION ALL SELECT c.id,c.parent_id,c.title,p.depth+1 FROM content c JOIN parents p ON c.id=p.parent_id WHERE p.depth<8
 ) SELECT title FROM parents ORDER BY depth DESC`,[source.id])).rows.map(r=>r.title)
 const exam=(await db.query('SELECT name FROM exams WHERE id=$1',[b.examId])).rows[0]
 const type=source.kind==='course'?source.payload.type||'article':'article'
 const row=await transaction(async c=>{
  const inserted=(await c.query(`INSERT INTO learning_visits(id,user_id,exam_id,session_id,content_id,title,kind,media_type,path)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(user_id,session_id) DO NOTHING RETURNING *`,[id(),uid,b.examId,b.sessionId,source.id,source.title,source.kind,type,JSON.stringify([exam?.name||'考试',...path])])).rows[0]
  if(inserted)await c.query('INSERT INTO learning_events(id,user_id,exam_id,kind,source_id) VALUES($1,$2,$3,$4,$5)',[id(),uid,b.examId,source.kind==='course'?'courseProgress':source.kind,source.id])
  const saved=inserted||(await c.query('SELECT * FROM learning_visits WHERE user_id=$1 AND session_id=$2',[uid,b.sessionId])).rows[0]
  if(saved.content_id!==b.contentId||saved.exam_id!==b.examId)fail(409,'同一次访问不能更换学习内容')
  return saved
 })
 res.json({id:row.id,positionSeconds:row.position_seconds,sequence:row.progress_sequence})
})
learningCapture.put('/:id/progress',async(req,res)=>{
 const b=z.object({positionSeconds:z.number().int().min(0).max(86400),durationSeconds:z.number().int().min(1).max(86400),sequence:z.number().int().positive().max(2147483647)}).strict().parse(req.body)
 if(b.positionSeconds>b.durationSeconds)fail(400,'播放位置不能超过媒体时长')
 const row=await transaction(async c=>{
  const saved=(await c.query('SELECT * FROM learning_visits WHERE id=$1 AND user_id=$2 FOR UPDATE',[req.params.id,res.locals.user.id])).rows[0]
  if(!saved)fail(404,'学习记录不存在')
  if(saved.kind!=='course'||!['video','audio'].includes(saved.media_type))fail(400,'此内容不支持播放进度')
  if(b.sequence<=saved.progress_sequence)return saved
  // Limit bursts from pause/hide events; normal clients report every 45 seconds.
  if(saved.progress_sequence>0&&Date.now()-new Date(saved.last_activity_at).getTime()<10000)return saved
  const updated=(await c.query(`UPDATE learning_visits SET position_seconds=$2,duration_seconds=$3,progress_sequence=$4,last_activity_at=now() WHERE id=$1 RETURNING *`,[saved.id,b.positionSeconds,b.durationSeconds,b.sequence])).rows[0]
  await c.query(`INSERT INTO user_records(id,user_id,exam_id,kind,source_id,payload) VALUES($1,$2,$3,'courseProgress',$4,$5)
   ON CONFLICT(user_id,exam_id,kind,source_id) DO UPDATE SET payload=user_records.payload||$5::jsonb,updated_at=now()`,
   [id(),saved.user_id,saved.exam_id,saved.content_id,JSON.stringify({positionSeconds:b.positionSeconds,durationSeconds:b.durationSeconds,currentMinute:Math.floor(b.positionSeconds/60),progress:Math.round(b.positionSeconds/b.durationSeconds*100)})])
  return updated
 })
 res.json({ok:true,sequence:row.progress_sequence})
})

const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s=>{const d=new Date(s+'T00:00:00Z');return !isNaN(d.getTime())&&d.toISOString().slice(0,10)===s},'日期无效')
function range(query:any){
 const q=z.object({from:day,to:day,examId:z.string().max(160).default('')}).parse(query)
 const days=(Date.parse(q.to)-Date.parse(q.from))/86400000+1
 if(days<1||days>366)fail(400,'请选择1至366天的时间范围')
 return {...q,days,start:q.from+'T00:00:00+08:00',end:new Date(Date.parse(q.to+'T00:00:00+08:00')+86400000).toISOString()}
}
export const learningManagement=Router()
learningManagement.get('/overview',async(req,res)=>{
 const q=range(req.query),args=[q.from,q.to,q.examId]
 const where="day BETWEEN $1::date AND $2::date AND ($3='' OR exam_id=$3)"
 const total=(await db.query(`SELECT coalesce(sum(visits),0)::int AS visits,coalesce(sum(answers),0)::int AS answers,count(DISTINCT user_id) FILTER(WHERE visits>0)::int AS visitors,count(DISTINCT user_id) FILTER(WHERE answers>0)::int AS answerers FROM learning_daily_users WHERE ${where}`,args)).rows[0]
 const daily=(await db.query(`SELECT to_char(day,'YYYY-MM-DD') AS day,sum(visits)::int AS visits,sum(answers)::int AS answers,count(DISTINCT user_id) FILTER(WHERE visits>0)::int AS visitors,count(DISTINCT user_id) FILTER(WHERE answers>0)::int AS answerers FROM learning_daily_users WHERE ${where} GROUP BY day ORDER BY day`,args)).rows
 const byDay=new Map(daily.map(r=>[r.day,r]))
 const series=Array.from({length:q.days},(_,i)=>{const date=new Date(Date.parse(q.from+'T00:00:00Z')+i*86400000).toISOString().slice(0,10);return byDay.get(date)||{day:date,visits:0,answers:0,visitors:0,answerers:0}})
 const collection=(await db.query('SELECT applied_at FROM schema_versions WHERE version=20')).rows[0].applied_at
 res.json({total,series,collectedSince:collection,generatedAt:new Date().toISOString()})
})
const listSelect=`SELECT v.*,u.nickname,substring(u.phone,1,3)||'****'||right(u.phone,4) AS phone,e.name AS exam_name FROM learning_visits v JOIN users u ON u.id=v.user_id JOIN exams e ON e.id=v.exam_id`
learningManagement.get('/visits',async(req,res)=>{
 const q=range(req.query),f=z.object({user:z.string().max(100).default(''),title:z.string().max(100).default(''),kind:z.enum(['','subject','chapter','section','knowledge','course']).default(''),page:z.coerce.number().int().min(1).max(100000).default(1)}).parse(req.query)
 const args:any[]=[q.start,q.end,q.examId,f.user.trim(),f.title.trim(),f.kind]
 const where=`v.started_at>=$1 AND v.started_at<$2 AND ($3='' OR v.exam_id=$3) AND ($4='' OR strpos(u.nickname,$4)>0 OR strpos(u.phone,$4)>0 OR strpos(u.id,$4)>0) AND ($5='' OR strpos(v.title,$5)>0 OR strpos(v.id,$5)>0 OR strpos(v.content_id,$5)>0) AND ($6='' OR v.kind=$6)`
 const total=(await db.query(`SELECT count(*)::int AS n FROM learning_visits v JOIN users u ON u.id=v.user_id WHERE ${where}`,args)).rows[0].n
 const items=(await db.query(listSelect+` WHERE ${where} ORDER BY v.started_at DESC,v.id LIMIT 20 OFFSET $7`,[...args,(f.page-1)*20])).rows
 res.json({items,total})
})
learningManagement.get('/visits/:id',async(req,res)=>{
 const row=(await db.query(listSelect+' WHERE v.id=$1',[req.params.id])).rows[0]
 if(!row)fail(404,'学习记录不存在');res.json(row)
})
