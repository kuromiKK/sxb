import {Router} from 'express'
import {z} from 'zod'
import {db} from './db.ts'
import {fail} from './security.ts'
import {auditActionLabel,auditModuleLabel,redactAuditDetails} from '../../shared/audit.ts'
export const auditManagement=Router()
auditManagement.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');next()})
auditManagement.get('/options',async(_req,res)=>{
 const rows=(await db.query('SELECT DISTINCT action FROM audit_logs ORDER BY action')).rows
 res.json(rows.map(r=>({value:r.action,label:auditActionLabel(r.action),module:auditModuleLabel(r.action)})))
})
auditManagement.get('/records',async(req,res)=>{
 const q=z.object({action:z.string().max(150).default(''),actor:z.string().trim().max(100).default(''),target:z.string().trim().max(200).default(''),from:z.iso.datetime({offset:true}).optional(),to:z.iso.datetime({offset:true}).optional(),page:z.coerce.number().int().min(1).max(1000000).default(1),pageSize:z.coerce.number().pipe(z.union([z.literal(20),z.literal(50),z.literal(100)])).default(20)}).parse(req.query)
 if(q.from&&q.to&&Date.parse(q.from)>Date.parse(q.to))fail(400,'结束时间不能早于开始时间')
 const args=[q.action,'%'+q.actor+'%','%'+q.target+'%',q.from||null,q.to||null]
 const where="($1='' OR a.action=$1) AND (coalesce(u.nickname,'系统自动处理') ILIKE $2 OR coalesce(u.phone,'') ILIKE $2) AND (coalesce(a.target_id,'') ILIKE $3 OR a.id ILIKE $3) AND ($4::timestamptz IS NULL OR a.created_at >= $4) AND ($5::timestamptz IS NULL OR a.created_at <= $5)"
 const total=(await db.query('SELECT count(*)::int AS n FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id WHERE '+where,args)).rows[0].n
 const rows=(await db.query(`SELECT a.id,a.action,a.target_id,a.created_at,coalesce(u.nickname,CASE WHEN a.actor_id IS NULL THEN '系统自动处理' ELSE '原操作人' END) AS actor_name,u.phone FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id WHERE ${where} ORDER BY a.created_at DESC,a.id DESC LIMIT $6 OFFSET $7`,[...args,q.pageSize,(q.page-1)*q.pageSize])).rows
 res.json({items:rows.map(r=>({...r,action_label:auditActionLabel(r.action),module:auditModuleLabel(r.action)})),total,page:q.page,pageSize:q.pageSize})
})
auditManagement.get('/records/:id',async(req,res)=>{
 const row=(await db.query("SELECT a.*,coalesce(u.nickname,CASE WHEN a.actor_id IS NULL THEN '系统自动处理' ELSE '原操作人' END) AS actor_name,u.phone FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id WHERE a.id=$1",[req.params.id])).rows[0]
 if(!row)fail(404,'日志不存在')
 res.json({...row,action_label:auditActionLabel(row.action),module:auditModuleLabel(row.action),details:redactAuditDetails(row.details)})
})
