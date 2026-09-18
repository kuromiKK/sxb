import {Router} from 'express'
import {z} from 'zod'
import {db,transaction} from './db.ts'
import {fail,id} from './security.ts'
import {lockResourceReferences,validateEditorImages} from './editor-images.ts'
import {validateContent,kinds} from './content.ts'
import {bulkModuleKinds,bulkActionLabel,bulkStatusesFor,type BulkAction} from '../../shared/bulk-content.ts'

export const bulkContent=Router()
const filtersSchema=z.object({search:z.string().max(200).default(''),examId:z.string().default(''),kind:z.enum(['',...kinds]).default(''),test:z.enum(['','true','false']).default(''),status:z.enum(['','draft','review','published','offline']).default(''),module:z.enum(['','knowledge','question','course','articles','cheatsheet']).default('')})
bulkContent.get('/',async(req,res)=>{
 const q=filtersSchema.extend({page:z.coerce.number().int().positive().default(1)}).parse(req.query)
 const args=[`%${q.search.trim()}%`,q.examId,q.kind,q.test===''?null:q.test==='true',q.status,bulkModuleKinds(q.module)]
 const where="FROM content WHERE NOT(payload ? 'deletedAt') AND (title ILIKE $1 OR id ILIKE $1) AND ($2='' OR exam_id=$2) AND ($3='' OR kind=$3) AND ($4::boolean IS NULL OR is_test_data=$4) AND ($5='' OR status=$5) AND ($6::text[] IS NULL OR kind=ANY($6::text[]))"
 const total=(await db.query('SELECT count(*)::int AS n '+where,args)).rows[0].n
 const items=(await db.query('SELECT * '+where+' ORDER BY updated_at DESC,id LIMIT 50 OFFSET $7',[...args,(q.page-1)*50])).rows
 res.json({items,total})
})
const inputSchema=z.object({action:z.enum(['enable','disable','publish','unpublish','draft','review']),items:z.array(z.object({id:z.string().min(1),version:z.number().int().positive()})).min(1).max(10000),filters:filtersSchema.optional(),testOnly:z.boolean().default(false)}).superRefine((v,c)=>{if(new Set(v.items.map(r=>r.id)).size!==v.items.length)c.addIssue({code:'custom',message:'同一记录不能重复提交'})})
export function nextBulkStatus(row:any,action:BulkAction){
 if(action==='enable')return row.status==='offline'?(['draft','review','published'].includes(row.payload.statusBeforeDisable)?row.payload.statusBeforeDisable:'draft'):row.status
 if(action==='disable'||action==='unpublish')return 'offline'
 if(action==='publish'){
  if(row.kind!=='faq'&&!['review','published'].includes(row.status)&&!(row.status==='offline'&&['review','published'].includes(row.payload.statusBeforeDisable)))fail(400,'草稿请先提交审核，再执行发布')
  return 'published'
 }
 if(action==='review'){
  if(!['draft','review'].includes(row.status))fail(400,'仅草稿可提交审核，请先转为草稿')
  return 'review'
 }
 return 'draft'
}
async function apply(req:any,res:any,legacy=false){
 const b=inputSchema.parse({...req.body,...(legacy?{action:'disable'}:{})})
 const result=await transaction(async c=>{
  await lockResourceReferences(c);const results:any[]=[]
  for(const item of [...b.items].sort((a,b)=>a.id.localeCompare(b.id))){
   await c.query('SAVEPOINT bulk_item')
   let row:any
   try{
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[item.id])
    row=(await c.query("SELECT * FROM content WHERE id=$1 AND NOT(payload ? 'deletedAt')",[item.id])).rows[0]
    if(!row||row.version!==item.version)fail(409,'记录已变化，请刷新后重试')
    const f=b.filters
    if(f?.module&&!bulkModuleKinds(f.module)!.includes(row.kind))fail(409,'记录不属于当前模块，请刷新后重试')
    if((b.testOnly&&!row.is_test_data)||(f&&((f.examId&&row.exam_id!==f.examId)||(f.kind&&row.kind!==f.kind)||(f.status&&row.status!==f.status)||(f.test!==''&&row.is_test_data!==(f.test==='true')))))fail(409,'记录已不符合本次筛选条件，请刷新后重试')
    const status=nextBulkStatus(row,b.action),payload={...row.payload}
    if(status==='offline'&&row.status!=='offline')payload.statusBeforeDisable=row.status
    else if(status!=='offline')delete payload.statusBeforeDisable
    const changed=status!==row.status||JSON.stringify(payload)!==JSON.stringify(row.payload)
    if(changed&&status==='published'){
     await validateEditorImages(payload,c)
     // Validate a copy: status changes must not rewrite other content fields.
     await validateContent({...row,status,payload:structuredClone(payload)},c)
    }
    if(changed)await c.query('UPDATE content SET status=$2,payload=$3,version=version+1,updated_at=now() WHERE id=$1',[row.id,status,JSON.stringify(payload)])
    await c.query('RELEASE SAVEPOINT bulk_item')
    results.push({id:row.id,title:row.title,kind:row.kind,success:true,changed,before:row.status,after:status,message:changed?'已'+bulkActionLabel(b.action,row.kind)+'（'+bulkStatusesFor(row.kind)[status]+'）':'状态无需变更'})
   }catch(e:any){
    await c.query('ROLLBACK TO SAVEPOINT bulk_item');await c.query('RELEASE SAVEPOINT bulk_item')
    results.push({id:item.id,title:row?.title||item.id,success:false,message:e.issues?.map((issue:any)=>issue.message).join('；')||(['23505','23503','23514'].includes(e.code)?'内容或关联已变化，请重新核对':e.message)})
   }
  }
  await c.query('INSERT INTO audit_logs(id,actor_id,action,details) VALUES($1,$2,$3,$4)',[id(),res.locals.user.id,'content.bulk_'+b.action,JSON.stringify({action:b.action,results})]);return results
 });res.json({results:result})
}
bulkContent.post('/apply',(req,res)=>apply(req,res))
// Keep older open clients compatible during rollout.
bulkContent.post('/disable',(req,res)=>apply(req,res,true))
