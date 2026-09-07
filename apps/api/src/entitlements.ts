import { Router } from 'express'
import { z } from 'zod'
import { db, transaction, type Queryable } from './db.ts'
import { fail, id } from './security.ts'
import { manualEntitlement, manualEffective, orderRights, rights } from './membership.ts'

export const userEntitlements = Router({ mergeParams: true })
const updateSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('set'), level: z.enum(['free','vip','svip']), cycleId: z.string().min(1).max(200), version: z.number().int().min(0), reason: z.string().trim().min(2).max(200) }).strict(),
  z.object({ action: z.literal('restore'), version: z.number().int().min(1), reason: z.string().trim().min(2).max(200) }).strict(),
])

async function student(userId: string, connection: Queryable = db, lock = false) {
  const row = (await connection.query(`SELECT id,nickname,phone FROM users WHERE id=$1 AND account_kind='student'${lock ? ' FOR UPDATE' : ''}`, [userId])).rows[0]
  if (!row) fail(404, '学员账号不存在，请在前台注册后再调整权益')
  return row
}

userEntitlements.get<{ userId: string }>('/', async (req, res) => {
  const userId = String(req.params.userId)
  const examId = z.string().min(1).max(200).parse(req.query.examId)
  const result = await transaction(async c => {
    const user = await student(userId, c, true)
    const exam = (await c.query('SELECT id,name,enabled FROM exams WHERE id=$1', [examId])).rows[0]
    if (!exam) fail(404, '考试不存在')
    const cycles = (await c.query('SELECT id,year,ends_at,ends_at>now() AS available FROM exam_cycles WHERE exam_id=$1 ORDER BY ends_at', [examId])).rows
    const manual = await manualEntitlement(userId, examId, c)
    const history = (await c.query(`SELECT a.id,a.created_at,a.details,u.nickname AS actor_name,u.phone AS actor_phone FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id WHERE a.target_id=$1 AND a.action='entitlement.adjust' AND a.details->>'examId'=$2 ORDER BY a.created_at DESC,a.id DESC LIMIT 50`, [userId, examId])).rows
    return { user, exam, cycles, current: await rights(userId, examId, c), order: await orderRights(userId, examId, c), manual: manual ? { ...manual, active: Boolean(manualEffective(manual)) } : null, version: manual?.version || 0, history }
  })
  res.json(result)
})

userEntitlements.put<{ userId: string; examId: string }>('/:examId', async (req, res) => {
  const userId = String(req.params.userId)
  const examId = String(req.params.examId)
  const b = updateSchema.parse(req.body)
  const result = await transaction(async c => {
    await student(userId, c, true)
    const exam = (await c.query('SELECT id,name,enabled FROM exams WHERE id=$1', [examId])).rows[0]
    if (!exam) fail(404, '考试不存在')
    const previous = await manualEntitlement(userId, examId, c)
    if ((previous?.version || 0) !== b.version) fail(409, '权益已被其他操作更新，请刷新当前权益后重试')
    const before = await rights(userId, examId, c)
    if (b.action === 'restore') {
      if (!previous || previous.revoked) fail(409, '没有需要恢复的人工权益')
      await c.query('UPDATE manual_entitlements SET revoked=true,version=version+1,actor_id=$3,reason=$4,updated_at=now() WHERE user_id=$1 AND exam_id=$2', [userId, examId, res.locals.user.id, b.reason])
    } else {
      if (!exam.enabled) fail(400, '考试已停用，不能设置新的人工权益')
      const cycle = (await c.query('SELECT id FROM exam_cycles WHERE id=$1 AND exam_id=$2 AND ends_at>now() FOR SHARE', [b.cycleId, examId])).rows[0]
      if (!cycle) fail(400, '请选择该考试尚未结束的考期')
      await c.query(`INSERT INTO manual_entitlements(user_id,exam_id,cycle_id,level,actor_id,reason,first_granted_at) VALUES($1,$2,$3,$4,$5,$6,CASE WHEN $4='free' THEN NULL ELSE now() END)
        ON CONFLICT(user_id,exam_id) DO UPDATE SET cycle_id=$3,level=$4,actor_id=$5,reason=$6,revoked=false,version=manual_entitlements.version+1,updated_at=now(),first_granted_at=coalesce(manual_entitlements.first_granted_at,CASE WHEN $4='free' THEN NULL ELSE now() END)`,
      [userId, examId, cycle.id, b.level, res.locals.user.id, b.reason])
    }
    const after = await rights(userId, examId, c)
    const manual = await manualEntitlement(userId, examId, c)
    await c.query('INSERT INTO audit_logs(id,actor_id,action,target_id,details) VALUES($1,$2,$3,$4,$5)', [id(), res.locals.user.id, 'entitlement.adjust', userId, JSON.stringify({ examId, examName: exam.name, action: b.action, reason: b.reason, before, after, previous, manual })])
    return { current: after, version: manual.version }
  })
  res.json(result)
})
