import { db, transaction, type Queryable } from './db.ts'
import { fail, id } from './security.ts'

export const prices = { vip: 59900, svip: 79900, trial: 100, upgrade: 20000 } as const
export type Product = keyof typeof prices
export function effectiveLevel(grant: { level: string; endsAt: string; nextEndsAt: string; trialEndsAt?: string; revoked?: boolean }, now = Date.now()) {
  if (grant.revoked) return 'free'
  if (grant.level === 'trial') return now < Date.parse(grant.trialEndsAt || '') ? 'vip' : 'free'
  if (now < Date.parse(grant.endsAt)) return grant.level
  if (grant.level === 'svip' && now < Date.parse(grant.nextEndsAt)) return 'vip'
  return 'free'
}
export async function rights(userId: string, examId: string, connection: Queryable = db) {
  const { rows } = await connection.query(`SELECT m.*,c.ends_at,c.year,n.ends_at AS next_ends_at FROM memberships m JOIN exam_cycles c ON c.id=m.cycle_id LEFT JOIN exam_cycles n ON n.exam_id=c.exam_id AND n.year=c.year+1 WHERE m.user_id=$1 AND m.exam_id=$2 AND NOT m.revoked`, [userId, examId])
  let level = 'free'; let expiry: string | null = null; let trial = false
  for (const row of rows) {
    const next = row.next_ends_at || new Date(new Date(row.ends_at).setUTCFullYear(new Date(row.ends_at).getUTCFullYear() + 1)).toISOString()
    const found = effectiveLevel({ level: row.level, endsAt: row.ends_at, nextEndsAt: next, trialEndsAt: row.trial_ends_at })
    const ranks: Record<string, number> = { free: 0, vip: 1, svip: 2 }
    const end = row.level === 'trial' ? row.trial_ends_at : found === 'vip' && row.level === 'svip' ? next : row.ends_at
    if (ranks[found] > ranks[level] || (found === level && found !== 'free' && Date.parse(end) > Date.parse(expiry || ''))) { level = found; expiry = end; trial = row.level === 'trial' }
  }
  return { examId, level, expiresAt: expiry, trial, permissions: { questions: true, knowledge: true, notes: true, plan: true, courses: level !== 'free', aiChat: level !== 'free', reports: level === 'svip', aiReview: level === 'svip' } }
}
export async function expireOrders(connection: Queryable = db) {
  await connection.query(`UPDATE orders SET status='closed',close_reason='超过30分钟未支付，订单已自动关闭' WHERE status='pending_payment' AND expires_at<=now()`)
}
export async function createOrder(userId: string, examId: string, product: Product) {
  return transaction(async c => {
    await c.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [userId])
    await expireOrders(c)
    const pending = (await c.query(`SELECT * FROM orders WHERE user_id=$1 AND status='pending_payment'`, [userId])).rows[0]
    if (pending) return { order: pending, existing: true }
    const cycle = (await c.query(`SELECT c.* FROM exam_cycles c JOIN exams e ON e.id=c.exam_id WHERE c.exam_id=$1 AND c.ends_at>now() AND e.enabled ORDER BY c.ends_at LIMIT 1`, [examId])).rows[0]
    if (!cycle) fail(400, '该考试暂未配置可购买考期')
    const member = await rights(userId, examId, c)
    if (product === 'upgrade' && (member.level !== 'vip' || member.trial)) fail(400, '仅正式VIP可补差价升级')
    if (member.level === 'svip' || (member.level === 'vip' && !member.trial && product !== 'upgrade')) fail(400, '已有有效会员，请通过补差价升级或等待到期')
    if (product === 'trial' && member.level !== 'free') fail(400, '当前权益高于或等于体验权益')
    // Trial eligibility is explicit and enforced server-side, not a front-end switch.
    if (product === 'trial' && (await c.query(`SELECT id FROM orders WHERE user_id=$1 AND exam_id=$2 AND product='trial' AND paid_at IS NOT NULL`, [userId, examId])).rows.length) fail(400, '该考试已使用过1元体验')
    const order = (await c.query(`INSERT INTO orders(id,user_id,exam_id,cycle_id,product,amount_cents,expires_at) VALUES($1,$2,$3,$4,$5,$6,now()+interval '30 minutes') RETURNING *`, ['SXB' + id().replaceAll('-', ''), userId, examId, cycle.id, product, prices[product]])).rows[0]
    return { order, existing: false }
  })
}
export async function payTest(userId: string, orderId: string, outcome: 'success' | 'failure') {
  if (process.env.APP_MODE === 'production') fail(403, '生产环境禁止模拟支付')
  return transaction(async c => {
    await expireOrders(c)
    const order = (await c.query('SELECT * FROM orders WHERE id=$1 AND user_id=$2 FOR UPDATE', [orderId, userId])).rows[0]
    if (!order) fail(404, '订单不存在')
    if (order.status === 'paid') return order
    if (order.status !== 'pending_payment') fail(409, '订单已关闭，无法支付')
    await c.query('INSERT INTO payments(id,order_id,status,method,error) VALUES($1,$2,$3,$4,$5)', [id(), orderId, outcome, 'wechat_test', outcome === 'failure' ? '测试支付失败' : null])
    if (outcome === 'failure') return { ...order, paymentFailed: true }
    await c.query(`UPDATE orders SET status='paid',paid_at=now() WHERE id=$1`, [orderId])
    await c.query(`INSERT INTO memberships(order_id,user_id,exam_id,cycle_id,level,trial_ends_at) VALUES($1,$2,$3,$4,$5,CASE WHEN $5='trial' THEN now()+interval '24 hours' ELSE NULL END)`, [orderId, userId, order.exam_id, order.cycle_id, order.product === 'upgrade' ? 'svip' : order.product])
    return (await c.query('SELECT * FROM orders WHERE id=$1', [orderId])).rows[0]
  })
}
