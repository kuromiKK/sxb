import { randomBytes, scryptSync, timingSafeEqual, createHash, createCipheriv, createDecipheriv, randomUUID } from 'node:crypto'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { db,type Queryable } from './db.ts'
import type { Request, Response, NextFunction } from 'express'

export const id = () => randomUUID()
export const hash = (value: string) => createHash('sha256').update(value).digest('hex')
export const fail = (status: number, message: string): never => { throw Object.assign(new Error(message), { status }) }
export function passwordHash(password: string) { const salt = randomBytes(16).toString('hex'); return salt + ':' + scryptSync(password, salt, 64).toString('hex') }
export function passwordValid(password: string, stored: string) {
  const [salt, digest] = stored.split(':')
  if (!salt || !digest) return false
  const a = scryptSync(password, salt, 64); const b = Buffer.from(digest, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}
let key: Buffer
export async function initSecrets() {
  if (process.env.SECRET_KEY) { key = Buffer.from(process.env.SECRET_KEY, 'hex'); if (key.length !== 32) throw new Error('SECRET_KEY must be 64 hex characters'); return }
  if (process.env.APP_MODE === 'production') throw new Error('SECRET_KEY required in production')
  await mkdir('.local', { recursive: true })
  try { key = Buffer.from(await readFile('.local/secret.key', 'utf8'), 'hex') }
  catch { key = randomBytes(32); await writeFile('.local/secret.key', key.toString('hex'), { mode: 0o600, flag: 'wx' }) }
}
export function encrypt(value: string) {
  const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', key, iv)
  const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), data].map(v => v.toString('base64')).join('.')
}
export function decrypt(value: string) {
  const [iv, tag, data] = value.split('.').map(v => Buffer.from(v, 'base64'))
  const cipher = createDecipheriv('aes-256-gcm', key, iv); cipher.setAuthTag(tag)
  return Buffer.concat([cipher.update(data), cipher.final()]).toString('utf8')
}
export async function session(userId: string, audience: 'student' | 'admin' = 'student', connection:Queryable=db) {
  const token = randomBytes(32).toString('hex')
  await connection.query(`INSERT INTO sessions(token_hash,user_id,expires_at,audience) VALUES($1,$2,now()+interval '12 hours',$3)`, [hash(token), userId, audience])
  return token
}
export async function requireUser(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.headers.authorization?.replace(/^Bearer /, '') || ''
    const { rows } = await db.query(`SELECT u.id,u.phone,u.nickname,u.role,u.account_kind,u.invite_code,u.inviter_id,u.created_at,s.audience FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.enabled=true AND u.admin_deleted_at IS NULL AND s.audience=u.account_kind`, [hash(token)])
    if (!rows.length) fail(401, '请先登录或重新登录')
    if (rows[0].audience === 'admin' && !req.path.startsWith('/admin/') && !['/me','/auth/logout'].includes(req.path)) fail(403, '请使用独立的前台学习账号登录')
    res.locals.user = rows[0]; next()
  } catch (e) { next(e) }
}
export function requireAdmin(_req: Request, res: Response, next: NextFunction) {
  if (res.locals.user?.role !== 'superadmin' || res.locals.user?.audience !== 'admin') return next(Object.assign(new Error('需要最高管理员权限'), { status: 403 }))
  next()
}
export async function audit(actor: string, action: string, target: string, details: any = {}) {
  await db.query('INSERT INTO audit_logs(id,actor_id,action,target_id,details) VALUES($1,$2,$3,$4,$5)', [id(), actor, action, target, JSON.stringify(details)])
}
