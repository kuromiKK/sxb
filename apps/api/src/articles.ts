import { Router } from 'express'
import { z } from 'zod'
import { db, transaction } from './db.ts'
import { fail, id } from './security.ts'
import { inspectDocument, renderText } from './rich-document.ts'
import { lockResourceReferences, validateEditorImages } from './editor-images.ts'

// Legacy FAQ rows retain their original single-exam scope until edited.
const scopeSql="coalesce(c.payload->'article'->>'scope',CASE WHEN c.exam_id IS NULL THEN 'all' ELSE 'exams' END)"
const examsSql="coalesce(c.payload->'article'->'examIds',CASE WHEN c.exam_id IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(c.exam_id) END)"
const visibleSql=`c.kind='faq' AND NOT (c.payload ? 'deletedAt')`
export async function publicFaqs(examId:string){
 const rows=(await db.query(`SELECT c.* FROM content c WHERE ${visibleSql} AND c.status='published'
 AND (${scopeSql}='all' OR ${examsSql} ? $1) ORDER BY c.created_at DESC,c.id DESC`,[examId])).rows
 return rows.map(r=>({id:r.id,title:r.title,category:'faq',content:r.payload.content||'',contentHtml:r.payload.document?renderText(r.payload.document):'',createdAt:r.created_at,updatedAt:r.updated_at}))
}
const select=`SELECT c.*,${scopeSql} AS scope,${examsSql} AS exam_ids,
 coalesce(nullif(u.nickname,''),nullif(c.payload->'article'->>'creatorName',''),'未记录') AS creator_name
 FROM content c LEFT JOIN users u ON u.id=c.payload->'article'->>'creatorId'`
const articleBody=z.object({title:z.string().trim().min(1,'请填写文章标题').max(2000),category:z.literal('faq'),scope:z.enum(['all','exams']),examIds:z.array(z.string().min(1).max(160)).max(200),status:z.enum(['published','offline']),document:z.any(),version:z.number().int().positive().optional()}).strict()
async function validateBody(b:z.infer<typeof articleBody>,c:any){
 if(b.scope==='exams'&&!b.examIds.length)fail(400,'请至少选择一个考试项目')
 if(b.scope==='all'&&b.examIds.length)fail(400,'全站文章不能同时指定考试项目')
 if(new Set(b.examIds).size!==b.examIds.length)fail(400,'考试项目不能重复')
 if(b.examIds.length&&(await c.query('SELECT id FROM exams WHERE id=ANY($1::text[])',[b.examIds])).rows.length!==b.examIds.length)fail(400,'选择的考试项目不存在')
 const checked=inspectDocument(b.document)
 if(checked.assets.length)fail(400,'文章正文仅支持文字和图片')
 if(!checked.text&&!JSON.stringify(b.document).includes('"type":"image"'))fail(400,'请填写文章正文')
 await validateEditorImages({document:b.document},c)
 return checked.text
}
export const articleManagement=Router()
articleManagement.get('/',async(req,res)=>{
 const q=z.object({title:z.string().max(2000).default(''),examId:z.string().max(160).default(''),status:z.enum(['','published','offline']).default(''),page:z.coerce.number().int().min(1).max(100000).default(1)}).parse(req.query)
 const args=[q.title.trim(),q.examId,q.status]
 const where=`WHERE ${visibleSql} AND ($1='' OR strpos(lower(c.title),lower($1))>0)
 AND ($2='' OR ($2='all' AND ${scopeSql}='all') OR ${examsSql} ? $2)
 AND ($3='' OR ($3='published' AND c.status='published') OR ($3='offline' AND c.status<>'published'))`
 const total=(await db.query('SELECT count(*)::int AS n FROM content c '+where,args)).rows[0].n
 const items=(await db.query(select+' '+where+' ORDER BY c.created_at DESC,c.id DESC LIMIT 20 OFFSET $4',[...args,(q.page-1)*20])).rows
 res.json({items,total})
})
articleManagement.get('/:id',async(req,res)=>{
 const row=(await db.query(select+` WHERE ${visibleSql} AND c.id=$1`,[req.params.id])).rows[0]
 if(!row)fail(404,'文章不存在或已删除')
 res.json(row)
})
articleManagement.put('/:id',async(req,res)=>{
 const articleId=z.string().min(1).max(160).parse(req.params.id),b=articleBody.parse(req.body)
 await transaction(async c=>{
  await lockResourceReferences(c)
  await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[articleId])
  const old=(await c.query('SELECT * FROM content WHERE id=$1',[articleId])).rows[0]
  if(old&&(old.kind!=='faq'||old.payload.deletedAt))fail(404,'文章不存在或已删除')
  if(old&&old.version!==b.version)fail(409,'文章已被修改，请重新打开后再保存')
  if(!old&&b.version)fail(404,'文章不存在')
  const content=await validateBody(b,c)
  const previous=old?.payload.article
  const metadata={category:b.category,scope:b.scope,examIds:b.examIds,creatorId:old?previous?.creatorId||null:res.locals.user.id,creatorName:old?previous?.creatorName||null:res.locals.user.nickname}
  const payload={...(old?.payload||{}),document:b.document,content,article:metadata}
  if(old)await c.query('UPDATE content SET title=$2,status=$3,payload=$4,version=version+1,updated_at=now() WHERE id=$1',[articleId,b.title,b.status,JSON.stringify(payload)])
  else await c.query("INSERT INTO content(id,kind,title,status,payload,source,is_test_data) VALUES($1,'faq',$2,$3,$4,'manual',false)",[articleId,b.title,b.status,JSON.stringify(payload)])
  await c.query('INSERT INTO audit_logs(id,actor_id,action,target_id,details) VALUES($1,$2,$3,$4,$5)',[id(),res.locals.user.id,'article.save',articleId,JSON.stringify({title:b.title,status:b.status,scope:b.scope,examIds:b.examIds})])
 })
 res.json({ok:true})
})
async function change(articleId:string,version:number,actor:string,status?:string){
 await transaction(async c=>{
  await lockResourceReferences(c)
  await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[articleId])
  const row=(await c.query("SELECT * FROM content WHERE id=$1 AND kind='faq'",[articleId])).rows[0]
  if(!row||row.payload.deletedAt)fail(404,'文章不存在或已删除')
  if(row.version!==version)fail(409,'文章已被修改，请刷新后重试')
  if(status==='published')await validateEditorImages(row.payload,c)
  const payload=status?row.payload:{...row.payload,deletedAt:new Date().toISOString()}
  await c.query('UPDATE content SET status=$2,payload=$3,version=version+1,updated_at=now() WHERE id=$1',[articleId,status||'offline',JSON.stringify(payload)])
  await c.query('INSERT INTO audit_logs(id,actor_id,action,target_id,details) VALUES($1,$2,$3,$4,$5)',[id(),actor,status?'article.status':'article.delete',articleId,JSON.stringify({title:row.title,before:row.status,after:status||'deleted'})])
 })
}
articleManagement.patch('/:id/status',async(req,res)=>{
 const b=z.object({version:z.number().int().positive(),status:z.enum(['published','offline'])}).strict().parse(req.body)
 await change(req.params.id,b.version,res.locals.user.id,b.status);res.json({ok:true})
})
articleManagement.delete('/:id',async(req,res)=>{
 const b=z.object({version:z.number().int().positive()}).strict().parse(req.body)
 await change(req.params.id,b.version,res.locals.user.id);res.json({ok:true})
})
