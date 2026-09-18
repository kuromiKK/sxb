import { Router } from 'express'
import { z } from 'zod'
import { db, transaction } from './db.ts'
import { fail, id } from './security.ts'

export const courseManagement=Router()
courseManagement.get('/',async(req,res)=>{
 const q=z.object({type:z.enum(['premium','supporting']).default('premium'),search:z.string().max(2000).default(''),examId:z.string().default(''),subjectId:z.string().default(''),chapterId:z.string().default(''),sectionId:z.string().default(''),knowledgeId:z.string().default(''),status:z.enum(['','draft','review','published','offline']).default(''),page:z.coerce.number().int().min(1).default(1)}).parse(req.query)
 const params=[q.type==='premium'?'section':'knowledge','%'+q.search.trim()+'%',q.examId,q.subjectId,q.chapterId,q.sectionId,q.type==='supporting'?q.knowledgeId:'',q.status]
 const from=`FROM content c JOIN content owner ON owner.id=c.parent_id
  JOIN content sec ON sec.id=CASE WHEN owner.kind='section' THEN owner.id ELSE owner.parent_id END AND sec.kind='section'
  JOIN content ch ON ch.id=sec.parent_id AND ch.kind='chapter'
  JOIN content sub ON sub.id=ch.parent_id AND sub.kind='subject'
  JOIN exams e ON e.id=c.exam_id
  WHERE c.kind='course' AND owner.kind=$1 AND NOT (c.payload ? 'deletedAt') AND (c.title ILIKE $2 OR c.id ILIKE $2)
   AND ($3='' OR c.exam_id=$3) AND ($4='' OR sub.id=$4) AND ($5='' OR ch.id=$5) AND ($6='' OR sec.id=$6) AND ($7='' OR owner.id=$7) AND ($8='' OR c.status=$8)`
 const total=(await db.query('SELECT count(*)::int AS n '+from,params)).rows[0].n
 const items=(await db.query(`SELECT c.*,owner.title AS parent_title,owner.kind AS parent_kind,e.name AS exam_name,sub.title AS subject_name,ch.title AS chapter_name,sec.title AS section_name,sub.id AS subject_id,ch.id AS chapter_id,sec.id AS section_id ${from} ORDER BY c.updated_at DESC,c.id LIMIT 20 OFFSET $9`,[...params,(q.page-1)*20])).rows
 res.json({items,total,page:q.page,limit:20})
})
courseManagement.patch('/:id/status',async(req,res)=>{
 const b=z.object({enabled:z.boolean(),version:z.number().int().positive()}).strict().parse(req.body)
 await transaction(async c=>{
  await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[req.params.id])
  const row=(await c.query("SELECT * FROM content WHERE id=$1 AND kind='course'",[req.params.id])).rows[0]
  if(!row||row.payload.deletedAt)fail(404,'课程不存在或已删除')
  if(row.version!==b.version)fail(409,'课程已被修改，请刷新后重试')
  const payload={...row.payload};let status='offline'
  if(b.enabled){status=['draft','review','published'].includes(payload.statusBeforeDisable)?payload.statusBeforeDisable:row.status==='offline'?'draft':row.status;delete payload.statusBeforeDisable}
  else if(row.status!=='offline')payload.statusBeforeDisable=row.status
  await c.query('UPDATE content SET status=$2,payload=$3,version=version+1,updated_at=now() WHERE id=$1',[row.id,status,JSON.stringify(payload)])
  await c.query('INSERT INTO audit_logs(id,actor_id,action,target_id,details) VALUES($1,$2,$3,$4,$5)',[id(),res.locals.user.id,'course.status',row.id,JSON.stringify({before:row.status,after:status})])
 })
 res.json({ok:true})
})
