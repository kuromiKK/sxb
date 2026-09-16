import { db,transaction,type Queryable } from './db.ts'
import { id,fail } from './security.ts'
import { getProduct,productConfig,saleState } from './products.ts'
import { expireOrders,rights } from './membership.ts'
import {isTestMode} from './platform-mode.ts'

export function trialWindow(hours:number,minimum:number,endsAt:string,now=Date.now()){
  const remaining=Date.parse(endsAt)-now
  return {allowed:remaining>=minimum*3600000,shortened:remaining<hours*3600000,availableHours:Math.max(0,Math.min(hours,remaining/3600000)),expiresAt:new Date(Math.min(now+hours*3600000,Date.parse(endsAt))).toISOString()}
}
async function eligible(c:Queryable,userId:string,s:any,now:number){
  if(s.type==='trial'){
    if((await c.query("SELECT 1 FROM orders WHERE user_id=$1 AND paid_at IS NOT NULL AND product IN ('vip','svip','trial','upgrade') LIMIT 1",[userId])).rows.length)fail(400,'每个账号终身只能体验一次，购买过正式权益或体验权益后不能再次体验')
    const current=await rights(userId,s.examId,c);if(current.level!=='free')fail(400,'当前考试已有有效会员权益，不能购买体验商品')
    const window=trialWindow(s.trialHours,s.minimumHours,s.endsAt,now)
    if(!window.allowed)fail(400,`距离考期结束不足 ${s.minimumHours} 小时，低于此商品的最低可购买时长，无法购买`)
    return window
  }
  if((await c.query("SELECT 1 FROM orders WHERE user_id=$1 AND exam_id=$2 AND cycle_id=$3 AND product IN ('vip','svip','upgrade') AND paid_at IS NOT NULL LIMIT 1",[userId,s.examId,s.cycleId])).rows.length)fail(400,'该考试考期已购买正式权益，不能重复购买')
  const current=await rights(userId,s.examId,c)
  if(current.level!=='free'&&!current.trial)fail(400,'当前考试已有正式会员权益，无需重复购买')
  return {allowed:true,shortened:false,availableHours:0,expiresAt:s.endsAt}
}
async function activeProduct(c:Queryable,productId:string){
  await c.query('SELECT id FROM products WHERE id=$1 FOR SHARE',[productId])
  let p=await getProduct(productId,c)
  if(!p)fail(404,'商品不存在')
  await c.query('SELECT id FROM exam_cycles WHERE id=$1 FOR SHARE',[p.cycle_id])
  p=await getProduct(productId,c)
  if(saleState(p)!=='selling')fail(400,'商品已下架、考试已停用或不在可购买考期内，无法支付')
  return p
}
export async function createProductOrder(userId:string,productId:string){return transaction(async c=>{
  const test=await isTestMode(c,true)
  await c.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[userId]);await expireOrders(c)
  const p=await activeProduct(c,productId)
  const snapshot={...productConfig(p),productId:p.id,version:p.version,examName:p.exam_name,year:p.year,endsAt:new Date(p.ends_at).toISOString()}
  await eligible(c,userId,snapshot,Date.now())
  const pending=(await c.query("SELECT * FROM orders WHERE user_id=$1 AND status='pending_payment'",[userId])).rows[0]
  if(pending)return {order:pending,existing:true}
  const order=(await c.query(`INSERT INTO orders(id,user_id,exam_id,cycle_id,product,amount_cents,expires_at,product_id,product_snapshot,is_test_data) VALUES($1,$2,$3,$4,$5,$6,least(now()+interval '30 minutes',$7::timestamptz),$8,$9,$10) RETURNING *`,['SXB'+id().replaceAll('-',''),userId,p.exam_id,p.cycle_id,p.type==='trial'?'trial':p.level,p.price_cents,p.ends_at,p.id,JSON.stringify(snapshot),test])).rows[0]
  return {order,existing:false}
})}
export async function pendingCheckout(c:Queryable,userId:string,orderId:string){
  await c.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[userId]);await expireOrders(c)
  const order=(await c.query('SELECT * FROM orders WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL FOR UPDATE',[orderId,userId])).rows[0]
  if(!order)fail(404,'订单不存在')
  if(order.status==='paid')return {order,paid:true as const}
  if(order.status!=='pending_payment')fail(409,'订单已关闭或过期，无法支付')
  if(!order.product_id)fail(400,'此旧测试订单不支持新商品支付，请取消后重新选择商品')
  const product=await activeProduct(c,order.product_id)
  const current=productConfig(product)
  if(['type','examId','cycleId','level'].some(k=>(current as any)[k]!==order.product_snapshot[k]))fail(409,'商品的考试、考期或权益类型已调整，请取消此订单后重新选择商品')
  const snapshot={...order.product_snapshot,endsAt:new Date(Math.min(Date.parse(order.product_snapshot.endsAt),new Date(product.ends_at).getTime())).toISOString()}
  const paidAt=new Date().toISOString()
  const window=await eligible(c,userId,snapshot,Date.parse(paidAt))
  return {order,paid:false as const,snapshot,window,paidAt}
}
export async function checkoutProductOrder(userId:string,orderId:string){return transaction(async c=>{
  const result=await pendingCheckout(c,userId,orderId)
  if(result.paid)return {paid:true}
  const {order,snapshot:s,window:w}=result
  const hours=(Math.floor(w.availableHours*100)/100).toFixed(2)
  const end=new Date(s.endsAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})
  const notice=String(s.shortNotice||'').replaceAll('{{实际可用时长}}',hours+'小时').replaceAll('{{体验时长}}',s.trialHours+'小时').replaceAll('{{考期结束时间}}',end)
  const confirmationToken=w.shortened?id():null
  await c.query('UPDATE orders SET checkout_confirmation=$2 WHERE id=$1',[order.id,JSON.stringify(confirmationToken?{token:confirmationToken,expires:Date.now()+300000,endsAt:s.endsAt}:null)])
  return {paid:false,title:s.frontendTitle||s.title,amountCents:order.amount_cents,shortened:w.shortened,notice,availableHours:w.availableHours,expiresAt:w.expiresAt,endsAt:s.endsAt,confirmationToken}
})}
export async function payProductOrder(userId:string,orderId:string,outcome:'success'|'failure',confirmationToken?:string){
  return transaction(async c=>{
    if(!await isTestMode(c,true))fail(403,'生产环境禁止模拟支付')
    const r=await pendingCheckout(c,userId,orderId)
    if((await c.query('SELECT 1 FROM provider_payments WHERE order_id=$1 LIMIT 1',[orderId])).rows.length)fail(409,'此订单已使用第三方支付，不能改用模拟支付')
    if(!r.order.is_test_data)fail(403,'正式订单不能使用模拟支付')
    if(r.paid)return r.order
    const {order,snapshot:s,window:w}=r,confirmation=order.checkout_confirmation
    if(w.shortened&&(!confirmationToken||confirmation?.token!==confirmationToken||confirmation.expires<Date.now()||confirmation.endsAt!==s.endsAt))fail(409,'体验时长不足完整时长，请重新确认实际可用时长后支付')
    await c.query('INSERT INTO payments(id,order_id,status,method,error) VALUES($1,$2,$3,$4,$5)',[id(),orderId,outcome,'wechat_test',outcome==='failure'?'测试支付失败':null])
    if(outcome==='failure')return {...order,paymentFailed:true}
    await c.query("UPDATE orders SET status='paid',paid_at=$2,checkout_confirmation=NULL,fulfillment_snapshot=$3 WHERE id=$1",[orderId,r.paidAt,JSON.stringify({startsAt:r.paidAt,endsAt:w.expiresAt,configuredHours:s.trialHours,actualHours:(Date.parse(w.expiresAt)-Date.parse(r.paidAt))/3600000,shortened:w.shortened,shortConfirmationAccepted:w.shortened,noticeTemplate:s.shortNotice||''})])
    if(s.type==='entitlement')await c.query("UPDATE memberships SET revoked=true WHERE user_id=$1 AND exam_id=$2 AND level='trial' AND NOT revoked",[userId,s.examId])
    await c.query(`INSERT INTO memberships(order_id,user_id,exam_id,cycle_id,level,trial_ends_at,trial_level,entitlement_ends_at,starts_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[orderId,userId,s.examId,s.cycleId,s.type==='trial'?'trial':s.level,s.type==='trial'?w.expiresAt:null,s.type==='trial'?s.level:null,w.expiresAt,r.paidAt])
    return (await c.query('SELECT * FROM orders WHERE id=$1',[orderId])).rows[0]
  })
}
