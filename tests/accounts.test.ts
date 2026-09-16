import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import express from 'express'
import { ZodError } from 'zod'
import {isolatedAdminProof} from './helpers/admin-proof.ts'

test('administrator and student identities are isolated', async t => {
  process.env.APP_MODE = 'test'; process.env.DATABASE_URL = ''
  process.env.LOCAL_DATABASE_DIR = await mkdtemp(join(tmpdir(), 'sxb-accounts-'))
  process.env.SECRET_KEY = '2'.repeat(64)
  process.env.ADMIN_PHONE = '18600513966'; process.env.ADMIN_PASSWORD = 'Isolated-Admin-1234!'
  const { db, closeDatabase } = await import('../apps/api/src/db.ts')
  const { seed } = await import('../apps/api/src/seed.ts')
  const { api } = await import('../apps/api/src/routes.ts')
  const { initSecrets } = await import('../apps/api/src/security.ts')
  await initSecrets(); await seed()
  const app = express(); app.use(express.json()); app.use('/api', api)
  app.use((e: any, _req: any, res: any, _next: any) => res.status(e instanceof ZodError ? 400 : e.code === '23505' ? 409 : e.status || 500).json({ message: e.message }))
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(r => server.once('listening', r))
  const base = `http://127.0.0.1:${(server.address() as any).port}/api`
  async function req(path: string, method = 'GET', body?: any, token = '') {
    if(path==='/auth/admin')body={...body,captchaProof:await isolatedAdminProof(body.phone)}
    const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body === undefined ? undefined : JSON.stringify(body) })
    return { status: r.status, data: await r.json() as any }
  }
  let admin = '', adminId = '', student = '', studentId = '', secondId = '', secondToken = ''
  const secondPhone = '18734567890'
  try {
    await t.test('same phone receives independent student ID without admin access', async () => {
      const a = await req('/auth/admin', 'POST', { phone: process.env.ADMIN_PHONE, password: process.env.ADMIN_PASSWORD })
      assert.equal(a.status, 200); admin = a.data.token; adminId = a.data.user.id
      const code = await req('/auth/code', 'POST', { phone: process.env.ADMIN_PHONE })
      assert.match(code.data.testCode, /^\d{4}$/)
      const challenge = await req('/auth/phone', 'POST', { phone: process.env.ADMIN_PHONE, code: code.data.testCode })
      assert.equal(challenge.data.consentRequired,true)
      const s=await req('/auth/protocol-consent','POST',{challenge:challenge.data.challenge,confirmed:true,versions:challenge.data.protocols.map((p:any)=>({kind:p.kind,version:p.version}))})
      assert.equal(s.status, 200); student = s.data.token; studentId = s.data.user.id
      assert.notEqual(studentId, adminId); assert.equal(s.data.user.role, 'student')
      assert.equal((await req('/admin/administrators', 'GET', undefined, student)).status, 403)
      assert.equal((await req('/rights/junior-social-worker', 'GET', undefined, admin)).status, 403)
      assert.equal((await req('/rights/junior-social-worker', 'GET', undefined, student)).data.level, 'free')
    })
    await t.test('any valid unseeded phone may sign in and become an admin separately', async () => {
      const code = await req('/auth/code', 'POST', { phone: secondPhone })
      const challenge = await req('/auth/phone', 'POST', { phone: secondPhone, code: code.data.testCode })
      const s=await req('/auth/protocol-consent','POST',{challenge:challenge.data.challenge,confirmed:true,versions:challenge.data.protocols.map((p:any)=>({kind:p.kind,version:p.version}))})
      assert.equal(s.status, 200)
      const create = await req('/admin/administrators', 'POST', { phone: secondPhone, nickname: '测试管理员', password: 'Test-Password-1234' }, admin)
      assert.equal(create.status, 201); secondId = create.data.id; assert.notEqual(secondId, s.data.user.id)
      assert(!JSON.stringify(create.data).includes('password'))
      assert.equal((await req('/admin/administrators', 'POST', { phone: secondPhone, nickname: '重复', password: 'Test-Password-1234' }, admin)).status, 409)
      assert.equal((await req('/admin/administrators', 'POST', { phone: '18876543210', nickname: '其他角色', role: 'editor', password: 'Test-Password-1234' }, admin)).status, 400)
      assert.equal((await req('/admin/administrators', 'POST', { phone: '18876543210', nickname: '弱密码', password: '123' }, admin)).status, 400)
      const users = (await req('/admin/users', 'GET', undefined, admin)).data
      assert(users.every((u: any) => u.role === 'student')); assert(users.some((u: any) => u.id === studentId))
      const list = (await req('/admin/administrators?search=18734567890', 'GET', undefined, admin)).data
      assert.equal(list.total, 1); assert.equal(list.items[0].id, secondId)
      assert(!JSON.stringify(list).includes('password_hash'))
      const a = await req('/auth/admin', 'POST', { phone: secondPhone, password: 'Test-Password-1234' })
      assert.equal(a.status, 200); secondToken = a.data.token
    })
    await t.test('admin disable revokes sessions, cannot disable self, does not affect student', async () => {
      assert.equal((await req(`/admin/administrators/${adminId}`, 'PATCH', { nickname: '管理员', enabled: false }, admin)).status, 409)
      assert.equal((await req(`/admin/administrators/${secondId}`, 'PATCH', { nickname: '停用测试', enabled: false }, admin)).status, 200)
      assert.equal((await req('/admin/dashboard', 'GET', undefined, secondToken)).status, 401)
      assert.equal((await req('/auth/admin', 'POST', { phone: secondPhone, password: 'Test-Password-1234' })).status, 401)
      assert.equal((await req('/me', 'GET', undefined, student)).status, 200)
      assert.equal((await req(`/admin/administrators/${secondId}`, 'PATCH', { nickname: '已恢复', enabled: true }, admin)).status, 200)
    })
    await t.test('password reset revokes sessions and audit never contains passwords', async () => {
      const a = await req('/auth/admin', 'POST', { phone: secondPhone, password: 'Test-Password-1234' })
      secondToken = a.data.token
      assert.equal((await req(`/admin/administrators/${secondId}/password`, 'POST', { password: 'Replaced-Password-4321', reason: '测试重设' }, admin)).status, 200)
      assert.equal((await req('/me', 'GET', undefined, secondToken)).status, 401)
      assert.equal((await req('/auth/admin', 'POST', { phone: secondPhone, password: 'Test-Password-1234' })).status, 401)
      assert.equal((await req('/auth/admin', 'POST', { phone: secondPhone, password: 'Replaced-Password-4321' })).status, 200)
      const logs = (await req('/admin/audit', 'GET', undefined, admin)).data
      assert(logs.some((r: any) => r.action === 'administrator.password_reset'))
      assert(!JSON.stringify(logs).includes('Replaced-Password-4321'))
      assert(!JSON.stringify(logs).includes('password_hash'))
      assert.equal((await req('/admin/roles', 'GET', undefined, admin)).data.length, 1)
      assert.equal((await req('/admin/roles', 'GET', undefined, student)).status, 403)
    })
    await t.test('delete protects owner and self, preserves history and student, revokes login permanently', async () => {
      secondToken = (await req('/auth/admin', 'POST', { phone: secondPhone, password: 'Replaced-Password-4321' })).data.token
      const protectedResult = await req(`/admin/administrators/${adminId}`, 'DELETE', undefined, secondToken)
      assert.equal(protectedResult.status, 409); assert.match(protectedResult.data.message, /18600513966/)
      assert.equal((await req(`/admin/administrators/${secondId}`, 'DELETE', undefined, secondToken)).status, 409)
      assert.equal((await req(`/admin/administrators/${secondId}`, 'DELETE', undefined, student)).status, 403)
      assert.equal((await req(`/admin/administrators/${studentId}`, 'DELETE', undefined, admin)).status, 404)
      await db.query("INSERT INTO audit_logs(id,actor_id,action,target_id) VALUES('deleted-admin-history',$1,'administrator.update',$1)", [secondId])
      assert.equal((await req(`/admin/administrators/${secondId}`, 'DELETE', undefined, admin)).status, 200)
      assert.equal((await req('/admin/administrators?search='+secondPhone, 'GET', undefined, admin)).data.total, 0)
      assert.equal((await req('/admin/dashboard', 'GET', undefined, secondToken)).status, 401)
      assert.equal((await req('/auth/admin', 'POST', { phone: secondPhone, password: 'Replaced-Password-4321' })).status, 401)
      assert.equal((await req(`/admin/administrators/${secondId}`, 'PATCH', { nickname: '不能恢复', enabled: true }, admin)).status, 404)
      assert.equal((await req(`/admin/administrators/${secondId}/password`, 'POST', { password: 'Restore-Password-1234', reason: '不能恢复' }, admin)).status, 404)
      assert.equal((await req(`/admin/administrators/${secondId}`, 'DELETE', undefined, admin)).status, 404)
      const historical = (await db.query('SELECT u.nickname,u.enabled,u.password_hash,u.admin_deleted_at FROM audit_logs a JOIN users u ON a.actor_id=u.id WHERE a.id=$1', ['deleted-admin-history'])).rows[0]
      assert.equal(historical.nickname, '已恢复'); assert.equal(historical.enabled, false); assert.equal(historical.password_hash, null); assert(historical.admin_deleted_at)
      assert.equal((await db.query("SELECT count(*)::int n FROM users WHERE phone=$1 AND account_kind='student' AND enabled", [secondPhone])).rows[0].n, 1)
      const logs = (await db.query("SELECT details FROM audit_logs WHERE action='administrator.delete' AND target_id=$1", [secondId])).rows
      assert.equal(logs.length, 1); assert.equal(logs[0].details.phone, secondPhone)
      assert.equal((await req('/admin/administrators', 'POST', { phone: secondPhone, nickname: '不能复用已删除身份', password: 'Test-Password-1234' }, admin)).status, 409)
    })
    await t.test('seed and migrations are idempotent, identities retain their data', async () => {
      await seed()
      const users = (await db.query('SELECT id,account_kind FROM users WHERE phone=$1 ORDER BY account_kind', [process.env.ADMIN_PHONE])).rows
      assert.equal(users.length, 2); assert.equal(users[0].id, adminId); assert.equal(users[1].id, studentId)
      assert.equal((await req('/me', 'GET', undefined, admin)).status, 200)
    })
  } finally { await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); await closeDatabase() }
})
