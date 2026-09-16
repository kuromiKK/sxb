import {Router} from 'express'
import {z} from 'zod'
import {db,transaction} from './db.ts'
import {fail,id} from './security.ts'
import {expireOrders} from './membership.ts'

export async function migrateOrderManagement(){await transaction(async c=>{
  await c.query('LOCK TABLE schema_versions IN EXCLUSIVE MODE')
  if((await c.query('SELECT 1 FROM schema_versions WHERE version=17')).rows.length)return
  await c.query('ALTER TABLE orders ADD COLUMN deleted_at timestamptz, ADD COLUMN refund_requested_at timestamptz, ADD COLUMN refunded_at timestamptz, ADD COLUMN refund_reason text, ADD COLUMN refund_reference text, ADD COLUMN fulfillment_snapshot jsonb')
  await c.query('ALTER TABLE orders ALTER COLUMN is_test_data SET DEFAULT false')
  await c.query('CREATE INDEX orders_management_created ON orders(created_at DESC) WHERE deleted_at IS NULL')
  await c.query('INSERT INTO schema_versions(version) VALUES(17)')
})}

export const orderSelect=`SELECT o.*,u.phone,u.nickname,e.name AS current_exam_name,
  COALESCE(o.product_snapshot->>'examName',e.name) AS exam_name,
  COALESCE(o.product_snapshot->>'title',CASE o.product WHEN 'trial' THEN '体验权益（旧测试订单）' WHEN 'upgrade' THEN 'VIP 升 SVIP（旧测试订单）' ELSE upper(o.product)||' 权益（旧测试订单）' END) AS product_title,
  COALESCE(o.product_snapshot->>'type',CASE WHEN o.product='trial' THEN 'trial' ELSE 'entitlement' END) AS product_type,
  COALESCE(o.product_snapshot->>'level',CASE WHEN o.product='trial' THEN 'vip' WHEN o.product='upgrade' THEN 'svip' ELSE o.product END) AS entitlement_level,
  COALESCE((o.product_snapshot->>'year')::integer,c.year) AS cycle_year,
  m.starts_at AS entitlement_starts_at,COALESCE(m.entitlement_ends_at,m.trial_ends_at,c.ends_at) AS entitlement_ends_at,m.revoked,
  CASE WHEN o.status='pending_payment' AND (SELECT p.status FROM payments p WHERE p.order_id=o.id ORDER BY p.created_at DESC,p.id DESC LIMIT 1)='failure' THEN 'payment_failed' ELSE o.status END AS display_status
  FROM orders o JOIN users u ON u.id=o.user_id JOIN exams e ON e.id=o.exam_id JOIN exam_cycles c ON c.id=o.cycle_id LEFT JOIN memberships m ON m.order_id=o.id`
const dateInput=z.string().datetime({offset:true}).optional()
const filtersSchema=z.object({search:z.string().trim().max(100).default(''),productId:z.string().max(200).default(''),type:z.enum(['','entitlement','trial']).default(''),examId:z.string().max(200).default(''),cycleId:z.string().max(200).default(''),status:z.enum(['','pending_payment','payment_failed','paid','closed','refunding','refunded']).default(''),createdFrom:dateInput,createdTo:dateInput,paidFrom:dateInput,paidTo:dateInput,page:z.coerce.number().int().min(1).default(1),pageSize:z.coerce.number().int().min(1).max(100).default(20)}).superRefine((f,ctx)=>{
  for(const [start,end] of [[f.createdFrom,f.createdTo],[f.paidFrom,f.paidTo]])if(start&&end&&Date.parse(start)>Date.parse(end))ctx.addIssue({code:'custom',message:'开始时间不能晚于结束时间'})
})
function filters(input:unknown){
  const f=filtersSchema.parse(input),params:any[]=[],clauses=['deleted_at IS NULL']
  const add=(sql:string,value:any)=>{params.push(value);clauses.push(sql.replaceAll('?',`$${params.length}`))}
  if(f.search)add('(id ILIKE ? OR phone ILIKE ? OR nickname ILIKE ?)',`%${f.search.replace(/[\\%_]/g,'\\$&')}%`)
  if(f.productId)add('product_id=?',f.productId)
  if(f.type)add('product_type=?',f.type)
  if(f.examId)add('exam_id=?',f.examId)
  if(f.cycleId)add('cycle_id=?',f.cycleId)
  if(f.status)add(f.status==='pending_payment'?'status=?':'display_status=?',f.status)
  if(f.createdFrom)add('created_at>=?::timestamptz',f.createdFrom)
  if(f.createdTo)add('created_at<=?::timestamptz',f.createdTo)
  if(f.paidFrom)add('paid_at>=?::timestamptz',f.paidFrom)
  if(f.paidTo)add('paid_at<=?::timestamptz',f.paidTo)
  return {f,params,where:clauses.join(' AND ')}
}
const canDeleteTest=()=>process.env.APP_MODE!=='production'
export const orderManagement=Router()
orderManagement.get('/',async(req,res)=>{
  await expireOrders()
  const {f,params,where}=filters(req.query),base=`WITH all_orders AS (${orderSelect}) SELECT * FROM all_orders WHERE ${where}`
  const result=await db.query(`${base} ORDER BY created_at DESC,id DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`,[...params,f.pageSize,(f.page-1)*f.pageSize])
  const summary=(await db.query(`WITH matching AS (${base}) SELECT count(*)::int AS total,
    count(*) FILTER(WHERE (created_at AT TIME ZONE 'Asia/Shanghai')::date=(now() AT TIME ZONE 'Asia/Shanghai')::date)::int AS today_orders,
    coalesce(sum(amount_cents) FILTER(WHERE (paid_at AT TIME ZONE 'Asia/Shanghai')::date=(now() AT TIME ZONE 'Asia/Shanghai')::date),0)::bigint AS today_paid_cents,
    count(*) FILTER(WHERE status='pending_payment')::int AS pending,
    count(*) FILTER(WHERE status='paid')::int AS paid,
    coalesce(sum(amount_cents) FILTER(WHERE status='refunded'),0)::bigint AS refunded_cents FROM matching`,params)).rows[0]
  res.json({items:result.rows,total:summary.total,summary,testDeletionAllowed:canDeleteTest()})
})
orderManagement.get('/:id',async(req,res)=>{
  await expireOrders()
  const order=(await db.query(orderSelect+' WHERE o.id=$1 AND o.deleted_at IS NULL',[req.params.id])).rows[0]
  if(!order)fail(404,'订单不存在或已删除')
  const payments=(await db.query('SELECT p.*,a.ref AS merchant_reference,a.transaction_id FROM payments p LEFT JOIN provider_payments a ON a.order_id=p.order_id AND a.provider=split_part(p.method,\'_\',1) WHERE p.order_id=$1 ORDER BY p.created_at DESC,p.id DESC',[order.id])).rows
  const history=(await db.query("SELECT a.*,u.nickname AS actor_name FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id WHERE a.target_id=$1 AND a.action LIKE 'order.%' ORDER BY a.created_at DESC,a.id DESC",[order.id])).rows
  res.json({order,payments,history,testDeletionAllowed:canDeleteTest()&&order.is_test_data})
})

orderManagement.patch('/:id',async(req,res)=>{
  const b=z.object({status:z.enum(['closed','refunding','refunded']),expectedStatus:z.enum(['pending_payment','paid','refunding']),reason:z.string().trim().min(3,'请填写至少3个字的操作说明').max(500),refundReference:z.string().trim().max(200).optional()}).strict().parse(req.body)
  if(b.status==='refunded'&&!b.refundReference)fail(400,'请填写线下退款凭证或转账流水号')
  await transaction(async c=>{
    const initial=(await c.query('SELECT user_id FROM orders WHERE id=$1',[req.params.id])).rows[0];if(!initial)fail(404,'订单不存在')
    // Keep the same lock order as payment: account first, then order.
    await c.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[initial.user_id]);await expireOrders(c)
    const o=(await c.query('SELECT * FROM orders WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[req.params.id])).rows[0];if(!o)fail(404,'订单不存在或已删除')
    const allowed:Record<string,string>={pending_payment:'closed',paid:'refunding',refunding:'refunded'}
    if(o.status!==b.expectedStatus||allowed[o.status]!==b.status)fail(409,'订单状态已改变，请刷新后重试')
    if(b.status==='closed')await c.query("UPDATE orders SET status='closed',close_reason=$2 WHERE id=$1",[o.id,b.reason])
    if(b.status==='refunding')await c.query("UPDATE orders SET status='refunding',refund_requested_at=now(),refund_reason=$2 WHERE id=$1",[o.id,b.reason])
    if(b.status==='refunded'){
      await c.query("UPDATE orders SET status='refunded',refunded_at=now(),refund_reference=$2 WHERE id=$1",[o.id,b.refundReference])
      await c.query('UPDATE memberships SET revoked=true WHERE order_id=$1',[o.id])
    }
    await c.query('INSERT INTO audit_logs(id,actor_id,action,target_id,details) VALUES($1,$2,$3,$4,$5)',[id(),res.locals.user.id,'order.'+(b.status==='closed'?'close':b.status==='refunding'?'refund_requested':'manual_refund_confirmed'),o.id,JSON.stringify({before:o.status,after:b.status,reason:b.reason,refundReference:b.refundReference,amountCents:o.amount_cents,manual:true})])
  });res.json({ok:true})
})
orderManagement.delete('/:id',async(req,res)=>{
  if(!canDeleteTest())fail(403,'生产环境不允许删除测试订单')
  const b=z.object({confirmation:z.string(),reason:z.string().trim().min(3).max(500)}).strict().parse(req.body)
  if(b.confirmation!==req.params.id)fail(400,'请输入完整订单号确认删除')
  await transaction(async c=>{
    const initial=(await c.query('SELECT user_id FROM orders WHERE id=$1',[req.params.id])).rows[0];if(!initial)fail(404,'订单不存在')
    await c.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[initial.user_id])
    const o=(await c.query('SELECT * FROM orders WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[req.params.id])).rows[0]
    if(!o)fail(404,'订单不存在或已删除')
    if(!o.is_test_data||(await c.query('SELECT 1 FROM provider_payments WHERE order_id=$1 LIMIT 1',[o.id])).rows.length||(await c.query("SELECT 1 FROM payments WHERE order_id=$1 AND (NOT is_test_data OR method NOT IN ('wechat_test','alipay_test')) LIMIT 1",[o.id])).rows.length)fail(403,'只能删除明确标记为测试且无第三方支付记录的订单')
    await c.query('UPDATE memberships SET revoked=true WHERE order_id=$1',[o.id])
    // Retain the audit source and lifetime purchase history; remove from operational lists.
    await c.query("UPDATE orders SET deleted_at=now(),status=CASE WHEN status='pending_payment' THEN 'closed' ELSE status END,checkout_confirmation=NULL WHERE id=$1",[o.id])
    await c.query('INSERT INTO audit_logs(id,actor_id,action,target_id,details) VALUES($1,$2,$3,$4,$5)',[id(),res.locals.user.id,'order.delete_test',o.id,JSON.stringify({reason:b.reason,before:o.status,productId:o.product_id,title:o.product_snapshot?.title,amountCents:o.amount_cents,revokedOrderEntitlement:true})])
  });res.json({ok:true})
})
