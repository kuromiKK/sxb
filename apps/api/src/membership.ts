import { db, transaction, type Queryable } from './db.ts'
import { fail, id } from './security.ts'
import { resolvePermissions, permissionCatalog } from './permission-policy.ts'

export const prices = { vip: 59900, svip: 79900, trial: 100, upgrade: 20000 } as const
export type Product = keyof typeof prices
export function effectiveLevel(grant: { level: string; startsAt?: string; endsAt: string; nextEndsAt?: string; trialEndsAt?: string; trialLevel?:string; revoked?: boolean }, now = Date.now()) {
  if (grant.revoked || (grant.startsAt && now < new Date(grant.startsAt).getTime())) return 'free'
  if (grant.level === 'trial') return now < Math.min(new Date(grant.trialEndsAt || '').getTime(),new Date(grant.endsAt).getTime()) ? (grant.trialLevel||'vip') : 'free'
  if (now < new Date(grant.endsAt).getTime()) return grant.level
  return 'free'
}
async function entitlement(examId: string, level: string, expiry: string | null, trial = false, source = 'order', connection:Queryable=db) {
  const permissions=await resolvePermissions(examId,level,connection)
  const permissionLabels=permissionCatalog.filter(p=>permissions[p.key]).map(p=>p.name)
  return { examId, level, expiresAt: expiry, trial, source, permissions, permissionLabels, trialDetails: null as {title:string;configuredHours:number|null;actualHours:number|null}|null }
}
export function manualEffective(row: { level: string; starts_at?:string; ends_at: string; next_ends_at?: string; revoked: boolean }, now = Date.now()) {
  if (row.revoked || (row.starts_at && now < new Date(row.starts_at).getTime())) return null
  if (now < new Date(row.ends_at).getTime()) return { level: row.level, expiresAt: row.ends_at }
  return null
}
export async function manualEntitlement(userId: string, examId: string, connection: Queryable = db) {
  return (await connection.query(`SELECT m.*,c.starts_at,c.ends_at,c.year FROM manual_entitlements m JOIN exam_cycles c ON c.id=m.cycle_id WHERE m.user_id=$1 AND m.exam_id=$2`, [userId, examId])).rows[0] || null
}
export async function rights(userId: string, examId: string, connection: Queryable = db) {
  const row = await manualEntitlement(userId, examId, connection)
  const manual = row && manualEffective(row)
  if (manual) return entitlement(examId, manual.level, manual.expiresAt, false, 'manual',connection)
  return orderRights(userId, examId, connection)
}
export async function orderRights(userId: string, examId: string, connection: Queryable = db) {
  const { rows } = await connection.query(`SELECT m.*,c.starts_at AS cycle_starts_at,c.ends_at,c.year,o.product_snapshot FROM memberships m JOIN exam_cycles c ON c.id=m.cycle_id JOIN orders o ON o.id=m.order_id WHERE m.user_id=$1 AND m.exam_id=$2 AND NOT m.revoked`, [userId, examId])
  let level = 'free'; let expiry: string | null = null; let trial = false
  let selected:any
  for (const row of rows) {
    const found = effectiveLevel({ level: row.level, startsAt:row.entitlement_ends_at?row.starts_at:row.cycle_starts_at, endsAt: row.entitlement_ends_at||row.ends_at, trialEndsAt: row.trial_ends_at,trialLevel:row.trial_level })
    const ranks: Record<string, number> = { free: 0, vip: 1, svip: 2 }
    const end = row.level === 'trial' ? new Date(Math.min(new Date(row.trial_ends_at).getTime(),new Date(row.entitlement_ends_at||row.ends_at).getTime())).toISOString() : row.entitlement_ends_at||row.ends_at
    if (ranks[found] > ranks[level] || (found === level && found !== 'free' && (new Date(end).getTime() > new Date(expiry || '').getTime() || (trial && row.level !== 'trial' && new Date(end).getTime() === new Date(expiry || '').getTime())))) { level = found; expiry = end; trial = row.level === 'trial'; selected = row }
  }
  const result=await entitlement(examId, level, expiry, trial,'order',connection)
  if(trial&&selected){
    const hours=Number(selected.product_snapshot?.trialHours)
    const actual=(new Date(expiry!).getTime()-new Date(selected.starts_at).getTime())/3600000
    result.trialDetails={title:selected.product_snapshot?.frontendTitle||`${level.toUpperCase()} 限时体验`,configuredHours:Number.isFinite(hours)&&hours>0?hours:null,actualHours:selected.starts_at&&Number.isFinite(actual)&&actual>0?actual:null}
  }
  return result
}
export async function expireOrders(connection: Queryable = db) {
  await connection.query(`UPDATE orders SET status='closed',close_reason='超过30分钟未支付，订单已自动关闭' WHERE status='pending_payment' AND expires_at<=now()`)
}
async function requireTrialEligible(connection:Queryable,userId:string) {
  if((await connection.query("SELECT 1 FROM orders WHERE user_id=$1 AND product IN ('vip','svip','trial','upgrade') AND paid_at IS NOT NULL LIMIT 1",[userId])).rows.length) fail(400,'每个账号终身只能体验一次；已购买过权益或体验权益，无法再次购买体验权益')
}
export async function createOrder(userId: string, examId: string, product: Product) {
  return transaction(async c => {
    await c.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [userId])
    await expireOrders(c)
    if(product==='trial') await requireTrialEligible(c,userId)
    const pending = (await c.query(`SELECT * FROM orders WHERE user_id=$1 AND status='pending_payment'`, [userId])).rows[0]
    if (pending) return { order: pending, existing: true }
    const cycle = (await c.query(`SELECT c.* FROM exam_cycles c JOIN exams e ON e.id=c.exam_id WHERE c.exam_id=$1 AND c.starts_at<=now() AND c.ends_at>now() AND e.enabled ORDER BY c.ends_at LIMIT 1`, [examId])).rows[0]
    if (!cycle) fail(400, '该考试暂未配置可购买考期')
    const member = await rights(userId, examId, c)
    if (product === 'upgrade' && (member.level !== 'vip' || member.trial)) fail(400, '仅正式VIP可补差价升级')
    if (member.level === 'svip' || (member.level === 'vip' && !member.trial && product !== 'upgrade')) fail(400, '已有有效会员，请通过补差价升级或等待到期')
    if (product === 'trial' && member.level !== 'free') fail(400, '当前权益高于或等于体验权益')
    if((product==='vip'||product==='svip')&&(await c.query("SELECT 1 FROM orders WHERE user_id=$1 AND cycle_id=$2 AND product IN ('vip','svip','upgrade') AND paid_at IS NOT NULL LIMIT 1",[userId,cycle.id])).rows.length) fail(400,'该账号在此考试考期内已购买过正式权益，不能重复购买')
    const order = (await c.query(`INSERT INTO orders(id,user_id,exam_id,cycle_id,product,amount_cents,expires_at) VALUES($1,$2,$3,$4,$5,$6,now()+interval '30 minutes') RETURNING *`, ['SXB' + id().replaceAll('-', ''), userId, examId, cycle.id, product, prices[product]])).rows[0]
    return { order, existing: false }
  })
}
export async function payTest(userId: string, orderId: string, outcome: 'success' | 'failure') {
  if (process.env.APP_MODE === 'production') fail(403, '生产环境禁止模拟支付')
  return transaction(async c => {
    await c.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[userId])
    await expireOrders(c)
    const order = (await c.query('SELECT * FROM orders WHERE id=$1 AND user_id=$2 FOR UPDATE', [orderId, userId])).rows[0]
    if (!order) fail(404, '订单不存在')
    if (order.status === 'paid') return order
    if (order.status !== 'pending_payment') fail(409, '订单已关闭，无法支付')
    const cycle=(await c.query('SELECT * FROM exam_cycles WHERE id=$1 AND starts_at<=now() AND ends_at>now() FOR SHARE',[order.cycle_id])).rows[0]
    if(!cycle) fail(400,'订单所属考期尚未开始或已经结束，无法支付')
    if(order.product==='trial') await requireTrialEligible(c,userId)
    await c.query('INSERT INTO payments(id,order_id,status,method,error) VALUES($1,$2,$3,$4,$5)', [id(), orderId, outcome, 'wechat_test', outcome === 'failure' ? '测试支付失败' : null])
    if (outcome === 'failure') return { ...order, paymentFailed: true }
    await c.query(`UPDATE orders SET status='paid',paid_at=now() WHERE id=$1`, [orderId])
    await c.query(`INSERT INTO memberships(order_id,user_id,exam_id,cycle_id,level,trial_ends_at) VALUES($1,$2,$3,$4,$5,CASE WHEN $5='trial' THEN least(now()+interval '24 hours',$6::timestamptz) ELSE NULL END)`, [orderId, userId, order.exam_id, order.cycle_id, order.product === 'upgrade' ? 'svip' : order.product,cycle.ends_at])
    return (await c.query('SELECT * FROM orders WHERE id=$1', [orderId])).rows[0]
  })
}
