import { Router } from 'express'
import { z } from 'zod'
import { randomInt } from 'node:crypto'
import { db, transaction, type Queryable } from './db.ts'
import { id, fail, passwordHash } from './security.ts'
import {isTestMode} from './platform-mode.ts'

export const administrators = Router()
const phone = z.string().regex(/^1\d{10}$/, '请输入11位手机号')
const nickname = z.string().trim().min(1).max(50)
const password = z.string().min(10, '密码至少10位').max(128).regex(/[A-Za-z]/, '密码需包含字母').regex(/\d/, '密码需包含数字')
const fields = 'id,phone,nickname,role,enabled,created_at,updated_at,last_login_at'
async function log(c: Queryable, actor: string, action: string, target: string, details: any) {
  await c.query('INSERT INTO audit_logs(id,actor_id,action,target_id,details) VALUES($1,$2,$3,$4,$5)', [id(), actor, action, target, JSON.stringify(details)])
}
administrators.get('/', async (req, res) => {
  const b = z.object({ search: z.string().max(100).default(''), page: z.coerce.number().int().min(1).default(1) }).parse(req.query)
  const where = "account_kind='admin' AND admin_deleted_at IS NULL AND (phone ILIKE $1 OR nickname ILIKE $1 OR id ILIKE $1)"
  const query = `%${b.search}%`
  const items = (await db.query(`SELECT ${fields} FROM users WHERE ${where} ORDER BY created_at,id LIMIT 20 OFFSET $2`, [query, (b.page - 1) * 20])).rows
  const total = (await db.query(`SELECT count(*)::int AS n FROM users WHERE ${where}`, [query])).rows[0].n
  res.json({ items, total })
})
administrators.post('/', async (req, res) => {
  const b = z.object({ phone, nickname, password, role: z.literal('superadmin').default('superadmin') }).strict().parse(req.body)
  const result = await transaction(async c => {
    const test=await isTestMode(c,true)
    if ((await c.query("SELECT 1 FROM users WHERE phone=$1 AND account_kind='admin' AND admin_deleted_at IS NOT NULL", [b.phone])).rows.length) fail(409, '该手机号的管理员已删除，历史身份已保留，请使用其他手机号')
    const result = (await c.query(`INSERT INTO users(id,phone,nickname,role,password_hash,invite_code,account_kind,is_test_data) VALUES($1,$2,$3,'superadmin',$4,$5,'admin',$6) RETURNING ${fields}`, [id(), b.phone, b.nickname, passwordHash(b.password), String(randomInt(10000000,99999999)), test])).rows[0]
    await log(c, res.locals.user.id, 'administrator.create', result.id, { phone: b.phone, nickname: b.nickname, role: b.role })
    return result
  })
  res.status(201).json(result)
})
administrators.patch('/:id', async (req, res) => {
  const b = z.object({ nickname, enabled: z.boolean(), role: z.literal('superadmin').default('superadmin') }).strict().parse(req.body)
  const result = await transaction(async c => {
    // Serialize status changes so concurrent requests cannot disable every admin.
    await c.query('LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE')
    const old = (await c.query("SELECT id,nickname,enabled,role FROM users WHERE id=$1 AND account_kind='admin' AND admin_deleted_at IS NULL", [req.params.id])).rows[0]
    if (!old) fail(404, '管理员不存在')
    if (!b.enabled) {
      if (old.id === res.locals.user.id) fail(409, '不能停用当前登录的管理员')
      const active = (await c.query("SELECT count(*)::int AS n FROM users WHERE account_kind='admin' AND admin_deleted_at IS NULL AND role='superadmin' AND enabled=true AND id<>$1", [old.id])).rows[0].n
      if (!active) fail(409, '至少保留一位启用的最高管理员')
    }
    const result = (await c.query(`UPDATE users SET nickname=$2,enabled=$3,role=$4,updated_at=now() WHERE id=$1 RETURNING ${fields}`, [old.id, b.nickname, b.enabled, b.role])).rows[0]
    if (!b.enabled) await c.query("DELETE FROM sessions WHERE user_id=$1 AND audience='admin'", [old.id])
    await log(c, res.locals.user.id, 'administrator.update', old.id, { before: old, after: { nickname: b.nickname, enabled: b.enabled, role: b.role } })
    return result
  })
  res.json(result)
})
administrators.post('/:id/password', async (req, res) => {
  const b = z.object({ password, reason: z.string().trim().min(2, '请填写重设原因').max(200) }).strict().parse(req.body)
  await transaction(async c => {
    const result = await c.query("UPDATE users SET password_hash=$2,updated_at=now() WHERE id=$1 AND account_kind='admin' AND admin_deleted_at IS NULL RETURNING id", [req.params.id, passwordHash(b.password)])
    if (!result.rows.length) fail(404, '管理员不存在')
    await c.query("DELETE FROM sessions WHERE user_id=$1 AND audience='admin'", [req.params.id])
    await log(c, res.locals.user.id, 'administrator.password_reset', req.params.id, { reason: b.reason })
  })
  res.json({ ok: true })
})
administrators.delete('/:id', async (req, res) => {
  await transaction(async c => {
    await c.query('LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE')
    const old = (await c.query(`SELECT ${fields} FROM users WHERE id=$1 AND account_kind='admin' AND admin_deleted_at IS NULL`, [req.params.id])).rows[0]
    if (!old) fail(404, '管理员不存在或已删除')
    if (old.phone === '18600513966') fail(409, '受保护账号 18600513966 不能删除')
    if (old.id === res.locals.user.id) fail(409, '不能删除当前登录的管理员')
    const active = (await c.query("SELECT 1 FROM users WHERE account_kind='admin' AND admin_deleted_at IS NULL AND role='superadmin' AND enabled=true AND id<>$1 LIMIT 1", [old.id])).rows.length
    if (!active) fail(409, '至少保留一位启用的最高管理员')
    await c.query('UPDATE users SET admin_deleted_at=now(),enabled=false,password_hash=NULL,updated_at=now() WHERE id=$1', [old.id])
    await c.query("DELETE FROM sessions WHERE user_id=$1 AND audience='admin'", [old.id])
    await log(c, res.locals.user.id, 'administrator.delete', old.id, { phone: old.phone, nickname: old.nickname })
  })
  res.json({ ok: true })
})
