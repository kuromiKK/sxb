import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import express from 'express'
import { ZodError } from 'zod'

test('manual exam entitlements are independent, reversible and audited', async t => {
  process.env.APP_MODE = 'test'; process.env.DATABASE_URL = ''
  process.env.LOCAL_DATABASE_DIR = await mkdtemp(join(tmpdir(), 'sxb-entitlements-'))
  process.env.SECRET_KEY = '3'.repeat(64)
  process.env.ADMIN_PHONE = '18600513966'; process.env.ADMIN_PASSWORD = 'Isolated-Admin-1234!'
  const { db, closeDatabase } = await import('../apps/api/src/db.ts')
  const { seed } = await import('../apps/api/src/seed.ts')
  const { api } = await import('../apps/api/src/routes.ts')
  const { initSecrets, session } = await import('../apps/api/src/security.ts')
  const { manualEffective, rights } = await import('../apps/api/src/membership.ts')
  await initSecrets(); await seed()
  const adminId = (await db.query("SELECT id FROM users WHERE account_kind='admin' AND phone=$1", [process.env.ADMIN_PHONE])).rows[0].id
  await db.query("INSERT INTO users(id,phone,nickname,invite_code) VALUES('manual-student','18811112222','测试人工权益','manual-invite'),('other-student','18811113333','其他测试学员','other-invite')")
  for (const exam of ['manual-exam-a','manual-exam-b']) {
    await db.query('INSERT INTO exams(id,name) VALUES($1,$2)', [exam, exam])
    await db.query('INSERT INTO exam_cycles(id,exam_id,year,ends_at) VALUES($1,$2,2090,$3),($4,$2,2091,$5),($6,$2,2000,$7)', [exam+'-2090', exam, '2090-05-31T15:59:59Z', exam+'-2091', '2091-05-31T15:59:59Z', exam+'-2000', '2000-05-31T15:59:59Z'])
  }
  const adminToken = await session(adminId, 'admin'), studentToken = await session('manual-student'), otherToken = await session('other-student')
  const app = express(); app.use(express.json()); app.use('/api', api)
  app.use((e: any, _req: any, res: any, _next: any) => res.status(e instanceof ZodError ? 400 : e.status || 500).json({ message: e.message }))
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(r => server.once('listening', r))
  const base = `http://127.0.0.1:${(server.address() as any).port}/api`
  async function req(path: string, method = 'GET', body?: any, token = adminToken) {
    const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body === undefined ? undefined : JSON.stringify(body) })
    return { status: r.status, data: await r.json() as any }
  }
  const endpoint = '/admin/users/manual-student/entitlements'
  const a = 'manual-exam-a', b = 'manual-exam-b'
  const state = async (exam = a) => (await req(endpoint + '?examId=' + exam)).data
  const set = async (level: string, version: number, exam = a, extra: any = {}) => req(endpoint + '/' + exam, 'PUT', { action: 'set', level, cycleId: exam+'-2090', version, reason: '测试前台权限', ...extra })
  const restore = async (exam = a) => req(endpoint + '/' + exam, 'PUT', { action: 'restore', version: (await state(exam)).version, reason: '恢复真实订单权益' })
  try {
    await t.test('only administrators can read/change student entitlements', async () => {
      assert.equal((await req(endpoint+'?examId='+a, 'GET', undefined, '')).status, 401)
      assert.equal((await req(endpoint+'?examId='+a, 'GET', undefined, studentToken)).status, 403)
      assert.equal((await req(endpoint+'/'+a, 'PUT', { action: 'set', level: 'svip', cycleId: a+'-2090', version: 0, reason: '越权测试' }, studentToken)).status, 403)
      assert.equal((await req(`/admin/users/${adminId}/entitlements?examId=${a}`)).status, 404)
      assert.equal((await req('/admin/users/missing/entitlements?examId='+a)).status, 404)
      assert.equal((await req(endpoint+'?examId=missing')).status, 404)
    })
    await t.test('VIP immediately changes real frontend permissions without any order', async () => {
      assert.equal((await state()).version, 0)
      const result = await set('vip', 0)
      assert.equal(result.status, 200)
      const r = (await req('/rights/'+a, 'GET', undefined, studentToken)).data
      assert.equal(r.level, 'vip'); assert.equal(r.source, 'manual'); assert.equal(r.trial, false)
      assert.equal(r.permissions.courses, true); assert.equal(r.permissions.reports, false)
      assert.equal((await req('/rights/'+b, 'GET', undefined, studentToken)).data.level, 'free')
      assert.equal((await req('/rights/'+a, 'GET', undefined, otherToken)).data.level, 'free')
      assert.deepEqual((await req('/orders', 'GET', undefined, studentToken)).data, [])
    })
    await t.test('SVIP unlocks reports; free blocks them again, data remains', async () => {
      assert.equal((await set('svip', (await state()).version)).status, 200)
      const reports = await req('/reports/'+a, 'GET', undefined, studentToken)
      assert.equal(reports.status, 200); assert(reports.data.every((r: any) => !r.locked))
      const granted = (await state()).manual.first_granted_at
      assert(granted)
      assert.equal((await set('free', (await state()).version)).status, 200)
      const r = (await req('/rights/'+a, 'GET', undefined, studentToken)).data
      assert.equal(r.level, 'free'); assert.equal(r.permissions.aiReview, false); assert.equal(r.permissions.courses, false)
      assert.equal((await req('/reports/'+a+'/2026-05', 'GET', undefined, studentToken)).status, 403)
      assert.equal((await state()).manual.first_granted_at, granted)
    })
    await t.test('invalid levels, reasons, ended and mismatched cycles are rejected', async () => {
      const version = (await state()).version
      for (const extra of [{ level: 'admin' }, { reason: ' ' }, { cycleId: b+'-2090' }, { cycleId: a+'-2000' }, { version: -1 }, { reason: 'x'.repeat(201) }]) {
        assert.equal((await set('vip', version, a, extra)).status, 400)
      }
      assert.equal((await set('vip', 0)).status, 409)
      assert.equal((await state()).version, version)
    })
    await t.test('manual free/VIP override a paid SVIP; restoring retains original payment data', async () => {
      assert.equal((await restore()).status, 200)
      const order = (await req('/orders', 'POST', { examId: a, product: 'svip' }, studentToken)).data.order
      assert(order.id)
      assert.equal((await req(`/orders/${order.id}/test-payment`, 'POST', { outcome: 'success' }, studentToken)).status, 200)
      const snapshot = (await req('/orders', 'GET', undefined, studentToken)).data
      for (const level of ['free','vip']) {
        assert.equal((await set(level, (await state()).version)).status, 200)
        const detail = await state()
        assert.equal(detail.current.level, level); assert.equal(detail.order.level, 'svip')
        assert.equal((await restore()).status, 200)
        assert.equal((await state()).current.level, 'svip')
      }
      assert.deepEqual((await req('/orders', 'GET', undefined, studentToken)).data, snapshot)
      assert.equal((await db.query('SELECT count(*)::int AS n FROM payments WHERE order_id=$1', [order.id])).rows[0].n, 1)
      assert.equal((await restore()).status, 409)
    })
    await t.test('concurrent stale updates cannot silently overwrite each other', async () => {
      const version = (await state()).version
      const results = await Promise.all([set('vip', version), set('free', version)])
      assert.deepEqual(results.map(r => r.status).sort(), [200,409])
      assert.equal((await state()).version, version+1)
    })
    await t.test('history stores actor, exam, reason and before/after; excludes other exams', async () => {
      await set('svip', 0, b)
      const detail = await state()
      assert(detail.history.length > 0)
      for (const entry of detail.history) {
        assert.equal(entry.actor_phone, process.env.ADMIN_PHONE)
        assert.equal(entry.details.examId, a)
        assert(entry.details.before.level); assert(entry.details.after.level)
        assert(entry.details.reason); assert(entry.details.manual.cycle_id.startsWith(a))
      }
      assert.equal((await state(b)).history.length, 1)
    })
    await t.test('manual expiration respects exam dates and SVIP next-cycle downgrade', async () => {
      const sample = { level: 'svip', ends_at: '2090-05-31T15:59:59Z', next_ends_at: '2091-05-31T15:59:59Z', revoked: false }
      const end = Date.parse(sample.ends_at), next = Date.parse(sample.next_ends_at)
      assert.equal(manualEffective(sample, end-1)?.level, 'svip')
      assert.equal(manualEffective(sample, end)?.level, 'vip')
      assert.equal(manualEffective(sample, next), null)
      assert.equal(manualEffective({ ...sample, level: 'vip' }, end), null)
      assert.equal(manualEffective({ ...sample, level: 'free' }, end-1)?.level, 'free')
      assert.equal(manualEffective({ ...sample, revoked: true }, end-1), null)
      await set('svip', (await state(b)).version, b)
      await db.query('UPDATE exam_cycles SET ends_at=now()-interval \'1 day\' WHERE id=$1', [b+'-2090'])
      assert.equal((await rights('manual-student', b)).level, 'vip')
      await db.query('UPDATE exam_cycles SET ends_at=now()-interval \'1 day\' WHERE id=$1', [b+'-2091'])
      assert.equal((await rights('manual-student', b)).level, 'free')
    })
    await t.test('disabled exams reject new overrides but permit restoration', async () => {
      await db.query('UPDATE exams SET enabled=false WHERE id=$1', [a])
      assert.equal((await set('svip', (await state()).version)).status, 400)
      assert.equal((await restore()).status, 200)
    })
    await t.test('migration is repeatable; search still returns only matching students', async () => {
      const { migrate } = await import('../apps/api/src/schema.ts')
      const before = await state(); await migrate()
      assert.equal((await state()).version, before.version)
      const users = (await req('/admin/users?search=18811112222')).data
      assert.equal(users.length, 1); assert.equal(users[0].id, 'manual-student')
    })
  } finally { await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); await closeDatabase() }
})
