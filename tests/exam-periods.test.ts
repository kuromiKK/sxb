import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import express from 'express'
import {ZodError} from 'zod'

test('exam periods, lifetime trials and entitlement expiry',async t=>{
  process.env.APP_MODE='test';process.env.DATABASE_URL=''
  process.env.LOCAL_DATABASE_DIR=await mkdtemp(join(tmpdir(),'sxb-periods-'))
  process.env.SECRET_KEY='9'.repeat(64);process.env.ADMIN_PHONE='18600000000';process.env.ADMIN_PASSWORD='Periods-Test-42!'
  const {db,closeDatabase}=await import('../apps/api/src/db.ts')
  const {seed}=await import('../apps/api/src/seed.ts')
  const {session,initSecrets}=await import('../apps/api/src/security.ts')
  const {api}=await import('../apps/api/src/routes.ts')
  const {createOrder,payTest,rights}=await import('../apps/api/src/membership.ts')
  const {migrateExamPeriods}=await import('../apps/api/src/exam-periods.ts')
  await initSecrets();await seed()
  const admin=(await db.query("SELECT id FROM users WHERE account_kind='admin' LIMIT 1")).rows[0]
  const token=await session(admin.id,'admin')
  await db.query("INSERT INTO exam_categories(id,name) VALUES('period-category','考期回归')")
  for(let n=0;n<5;n++)await db.query('INSERT INTO users(id,phone,nickname,invite_code) VALUES($1,$2,$1,$1)',[`period-user-${n}`,`1887777000${n}`])
  const app=express();app.use(express.json());app.use('/api',api);app.use((e:any,_q:any,r:any,_n:any)=>r.status(e instanceof ZodError?400:e.status||500).json({message:e.message}))
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r))
  const origin='http://127.0.0.1:'+(server.address() as any).port+'/api'
  async function call(path:string,body?:any,method='GET',expected=200){const r=await fetch(origin+path,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:body===undefined?undefined:JSON.stringify(body)});const data:any=await r.json();assert.equal(r.status,expected,JSON.stringify(data));return data}
  const term={id:'period-guide',year:2090,startsAt:'2001-06-01T00:00:00+08:00',endsAt:'2090-05-31T23:59:59+08:00'}
  const base={name:'考期回归',categoryId:'period-category',enabled:true,yearEntries:[term]}
  const endpoint='/admin/exam-projects/period-exam'
  try{
    await t.test('requires both times, rejects invalid ordering and overlaps',async()=>{
      await call(endpoint,{...base,yearEntries:[{...term,startsAt:undefined}]},'PUT',400)
      await call(endpoint,{...base,yearEntries:[{...term,endsAt:term.startsAt}]},'PUT',400)
      await call(endpoint,{...base,yearEntries:[term,{...term,id:'overlap',year:2091}]},'PUT',400)
      await call(endpoint,base,'PUT')
    })
    await t.test('admin/public dates agree; edits retain cycle and article identifiers',async()=>{
      const projects=await call('/admin/exam-projects'),saved=projects.find((x:any)=>x.id==='period-exam').year_entries[0]
      assert.equal(Date.parse(saved.startsAt),Date.parse(term.startsAt));assert.equal(Date.parse(saved.endsAt),Date.parse(term.endsAt))
      const cycle=(await db.query("SELECT * FROM exam_cycles WHERE exam_id='period-exam'")).rows[0]
      const publicExam=(await call('/exams')).find((e:any)=>e.id==='period-exam')
      assert.equal(Date.parse(publicExam.cycles[0].startsAt),Date.parse(term.startsAt))
      await call(endpoint,base,'PUT')
      assert.equal((await db.query("SELECT id FROM exam_cycles WHERE exam_id='period-exam'")).rows[0].id,cycle.id)
      const guide=await call('/exam-guide/period-exam');assert.equal(guide.term.id,term.id)
      await migrateExamPeriods();assert.deepEqual((await db.query('SELECT starts_at FROM exam_cycles WHERE id=$1',[cycle.id])).rows[0].starts_at,cycle.starts_at)
    })
    await t.test('future periods cannot be purchased and pending orders cannot pay after expiry',async()=>{
      await call('/admin/exam-projects/future-period',{...base,name:'未来考期',yearEntries:[{...term,id:'future-guide',startsAt:'2089-06-01T00:00:00+08:00'}]},'PUT')
      await assert.rejects(createOrder('period-user-0','future-period','vip'),/可购买考期/)
      const pending=await createOrder('period-user-0','period-exam','vip')
      await db.query("UPDATE exam_cycles SET ends_at=now()-interval '1 second' WHERE id=$1",[pending.order.cycle_id])
      await assert.rejects(payTest('period-user-0',pending.order.id,'success'),/无法支付/)
      assert.equal((await db.query('SELECT paid_at FROM orders WHERE id=$1',[pending.order.id])).rows[0].paid_at,null)
      await call(endpoint,base,'PUT')
    })
    await t.test('paid trials consume lifetime account eligibility across exams, cycles and refunds',async()=>{
      const first=await createOrder('period-user-1','period-exam','trial');await payTest('period-user-1',first.order.id,'success')
      assert.equal((await rights('period-user-1','period-exam')).trial,true)
      await db.query("UPDATE memberships SET trial_ends_at=now()-interval '1 second',revoked=true WHERE order_id=$1",[first.order.id])
      await db.query("UPDATE orders SET status='refunded' WHERE id=$1",[first.order.id])
      await assert.rejects(createOrder('period-user-1','junior-social-worker','trial'),/终身只能体验一次/)
      await assert.rejects(createOrder('period-user-1','period-exam','trial'),/终身只能体验一次/)
      // A trial does not prevent the first formal purchase.
      const formal=await createOrder('period-user-1','period-exam','vip');await payTest('period-user-1',formal.order.id,'success')
      assert.equal((await rights('period-user-1','period-exam')).trial,false)
      await db.query('UPDATE memberships SET revoked=false,trial_ends_at=(SELECT ends_at FROM exam_cycles WHERE id=memberships.cycle_id) WHERE order_id=$1',[first.order.id])
      assert.equal((await rights('period-user-1','period-exam')).trial,false,'formal purchase takes precedence even when trial and formal expiry match')
    })
    await t.test('any historical formal purchase excludes trials, even after expiry',async()=>{
      const purchase=await createOrder('period-user-2','period-exam','svip');await payTest('period-user-2',purchase.order.id,'success')
      await db.query("UPDATE exam_cycles SET ends_at=now()-interval '1 second' WHERE id=$1",[purchase.order.cycle_id])
      assert.equal((await rights('period-user-2','period-exam')).level,'free')
      await assert.rejects(createOrder('period-user-2','junior-social-worker','trial'),/已购买过权益/)
      await call(endpoint,base,'PUT')
      await call(endpoint,{...base,yearEntries:[{...term,year:2091}]},'PUT',409)
    })
    await t.test('payment revalidates lifetime eligibility; failed/unpaid orders do not consume it',async()=>{
      const trial=await createOrder('period-user-3','period-exam','trial')
      await payTest('period-user-3',trial.order.id,'failure')
      assert.equal((await db.query('SELECT paid_at FROM orders WHERE id=$1',[trial.order.id])).rows[0].paid_at,null)
      await db.query(`INSERT INTO orders(id,user_id,exam_id,cycle_id,product,amount_cents,status,expires_at,paid_at) VALUES('historical-payment','period-user-3','period-exam',$1,'vip',100,'paid',now(),now())`,[trial.order.cycle_id])
      await assert.rejects(payTest('period-user-3',trial.order.id,'success'),/终身只能体验一次/)
      const retry=await createOrder('period-user-4','period-exam','trial');await payTest('period-user-4',retry.order.id,'failure');await payTest('period-user-4',retry.order.id,'success');await payTest('period-user-4',retry.order.id,'success')
      assert.equal((await db.query('SELECT count(*)::int AS n FROM memberships WHERE order_id=$1',[retry.order.id])).rows[0].n,1)
    })
    await t.test('legacy migration preserves deadlines, paid cycle IDs and guide documents',async()=>{
      const before=(await db.query('SELECT id,exam_id,year,ends_at FROM exam_cycles ORDER BY id')).rows
      const doc={type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'历史考期图文'}]}]}
      await db.query("INSERT INTO exam_year_entries(id,exam_id,year,cutoff_date,guide_document) VALUES('legacy-only','period-exam',2092,'2092-05-31',$1)",[JSON.stringify(doc)])
      await db.query('DROP TRIGGER exam_period_start ON exam_cycles')
      await db.query('ALTER TABLE exam_cycles DROP COLUMN starts_at')
      await db.query('DELETE FROM schema_versions WHERE version=15')
      await migrateExamPeriods()
      for(const old of before){const current=(await db.query('SELECT * FROM exam_cycles WHERE id=$1',[old.id])).rows[0];assert(current.starts_at);assert.deepEqual(current.ends_at,old.ends_at)}
      assert.deepEqual((await db.query("SELECT guide_document FROM exam_year_entries WHERE id='legacy-only'")).rows[0].guide_document,doc)
      assert.equal((await db.query("SELECT count(*)::int AS n FROM exam_cycles WHERE exam_id='period-exam' AND year=2092")).rows[0].n,1)
      await migrateExamPeriods()
    })
  } finally {await new Promise<void>(r=>server.close(()=>r()));await closeDatabase()}
})
