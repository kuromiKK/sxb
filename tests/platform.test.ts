import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import express from 'express'
import { ZodError } from 'zod'

test('persistent platform business rules', async t => {
  process.env.APP_MODE='test'
  process.env.DATABASE_URL=''
  process.env.LOCAL_DATABASE_DIR=await mkdtemp(join(tmpdir(),'sxb-test-'))
  process.env.SECRET_KEY='1'.repeat(64)
  process.env.ADMIN_PHONE='18600000000'
  process.env.ADMIN_PASSWORD='Only-for-isolated-tests-42!'
  const {db,closeDatabase}=await import('../apps/api/src/db.ts')
  const {seed}=await import('../apps/api/src/seed.ts')
  const security=await import('../apps/api/src/security.ts')
  const member=await import('../apps/api/src/membership.ts')
  const ai=await import('../apps/api/src/ai.ts')
  const imports=await import('../apps/api/src/imports.ts')
  const {api}=await import('../apps/api/src/routes.ts')
  await security.initSecrets();await seed()
  const app=express();app.use(express.json({limit:'12mb'}));app.use('/api',api)
  app.use((e:any,_req:any,res:any,_next:any)=>res.status(e instanceof ZodError?400:e.status||500).json({message:e.message}))
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r))
  const base=`http://127.0.0.1:${(server.address() as any).port}/api`
  const req=async(path:string,method='GET',body?:any,token='')=>{
    const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body)})
    return {status:r.status,data:await r.json() as any}
  }
  let admin='',student='',other='',uid=''
  const exam='junior-social-worker'
  try {
    await t.test('exam deadlines expire both paid levels and cap trials at the cycle boundary',()=>{
      const endsAt='2027-05-31T15:59:59Z',nextEndsAt='2028-05-31T15:59:59Z'
      assert.equal(member.effectiveLevel({level:'svip',endsAt,nextEndsAt},Date.parse(endsAt)-1),'svip')
      assert.equal(member.effectiveLevel({level:'svip',endsAt,nextEndsAt},Date.parse(endsAt)),'free')
      assert.equal(member.effectiveLevel({level:'svip',endsAt,nextEndsAt},Date.parse(nextEndsAt)),'free')
      assert.equal(member.effectiveLevel({level:'vip',endsAt,nextEndsAt},Date.parse(endsAt)),'free')
      assert.equal(member.effectiveLevel({level:'trial',endsAt,nextEndsAt,trialEndsAt:endsAt},Date.parse(endsAt)),'free')
      assert.equal(member.effectiveLevel({level:'trial',endsAt,trialEndsAt:nextEndsAt},Date.parse(endsAt)),'free')
      assert.equal(member.effectiveLevel({level:'svip',startsAt:endsAt,endsAt:nextEndsAt},Date.parse(endsAt)-1),'free')
      assert.equal(member.prices.upgrade,20000)
    })
    await t.test('password hashing, encryption and AI cached-token pricing',()=>{
      const h=security.passwordHash('test-password');assert(security.passwordValid('test-password',h));assert(!security.passwordValid('wrong',h))
      const encrypted=security.encrypt('test-key');assert(!encrypted.includes('test-key'));assert.equal(security.decrypt(encrypted),'test-key')
      assert.equal(ai.tokenCost(1000000,100000,500000,{inputPrice:6,outputPrice:30,cachedPrice:.6}),6.3)
      assert.equal(ai.tokenCost(2,1,3,ai.pricePresets[0]),null)
    })
    await t.test('admin login and server-visible four-digit student codes',async()=>{
      assert.equal((await req('/admin/dashboard')).status,401)
      assert.equal((await req('/auth/admin','POST',{phone:process.env.ADMIN_PHONE,password:'wrong'})).status,401)
      const a=await req('/auth/admin','POST',{phone:process.env.ADMIN_PHONE,password:process.env.ADMIN_PASSWORD});assert.equal(a.status,200);admin=a.data.token
      for(const phone of ['13900000101','13900000102']){
        const code=await req('/auth/code','POST',{phone});assert.match(code.data.testCode,/^\d{4}$/)
        const challenge=await req('/auth/phone','POST',{phone,code:code.data.testCode});assert.equal(challenge.status,200)
        const login=await req('/auth/protocol-consent','POST',{challenge:challenge.data.challenge,confirmed:true,versions:challenge.data.protocols.map((p:any)=>({kind:p.kind,version:p.version}))});assert.equal(login.status,200)
        if(!student){student=login.data.token;uid=login.data.user.id}else other=login.data.token
        assert.equal((await req('/auth/phone','POST',{phone,code:code.data.testCode})).status,400)
      }
      assert.equal((await req('/admin/dashboard','GET',undefined,student)).status,403)
    })
    await t.test('catalog hides answers and derives associations',async()=>{
      const r=await req('/catalog/'+exam);assert.equal(r.status,200)
      assert(r.data.practiceQuestions.length>0);assert.deepEqual(r.data.practiceQuestions[0].answer,[])
      assert(r.data.practiceQuestions[0].subjectId)
      assert(r.data.courseCatalog.some((c:any)=>c.knowledgePointId==='kp-1-1-1'))
    })
    await t.test('order payment is idempotent; membership is isolated per exam',async()=>{
      const cycle=(await db.query('SELECT id FROM exam_cycles WHERE exam_id=$1 AND starts_at<=now() AND ends_at>now()',[exam])).rows[0]
      for(const type of ['vip','trial'])assert.equal((await req('/admin/products/platform-'+type,'PUT',{version:0,config:{title:type,type:type==='trial'?'trial':'entitlement',examId:exam,cycleId:cycle.id,level:'vip',priceCents:type==='trial'?100:59900,status:'published',trialHours:24,minimumHours:10,shortNotice:'体验至考期结束，请确认'}},admin)).status,200)
      const create=await req('/orders','POST',{productId:'platform-vip'},student);assert.equal(create.status,200)
      assert.equal(create.data.order.amount_cents,59900)
      const orderId=create.data.order.id
      assert.equal((await req(`/orders/${orderId}/test-payment`,'POST',{outcome:'success'},other)).status,404)
      for(let n=0;n<2;n++)assert.equal((await req(`/orders/${orderId}/test-payment`,'POST',{outcome:'success'},student)).status,200)
      assert.equal((await db.query('SELECT count(*)::int AS n FROM memberships WHERE order_id=$1',[orderId])).rows[0].n,1)
      assert.equal((await req('/rights/'+exam,'GET',undefined,student)).data.level,'vip')
      assert.equal((await req('/rights/mid-social-worker','GET',undefined,student)).data.level,'free')
      assert.equal((await req('/reports/'+exam+'/2026-07','GET',undefined,student)).status,403)
    })
    await t.test('legacy hardcoded upgrade is unavailable; audited manual rights remain supported',async()=>{
      assert.equal((await req('/orders','POST',{examId:exam,product:'upgrade'},student)).status,400)
      assert.equal((await req('/orders','POST',{productId:'platform-vip'},student)).status,400)
      const cycle=(await db.query('SELECT id FROM exam_cycles WHERE exam_id=$1 AND starts_at<=now() AND ends_at>now()',[exam])).rows[0]
      assert.equal((await req('/admin/users/'+uid+'/entitlements/'+exam,'PUT',{action:'set',level:'svip',cycleId:cycle.id,version:0,reason:'平台回归验证SVIP权限'},admin)).status,200)
      assert.equal((await req('/rights/'+exam,'GET',undefined,student)).data.level,'svip')
      assert((await db.query("SELECT id FROM audit_logs WHERE action='entitlement.adjust' AND target_id=$1",[uid])).rows.length)
    })
    await t.test('learning records persist and remain private',async()=>{
      assert.equal((await req('/records/'+exam,'PUT',{kind:'note',sourceId:'kp-1-1-1',payload:{text:'test note'}},student)).status,200)
      assert.equal((await req('/records/'+exam,'GET',undefined,student)).data.length,1)
      assert.equal((await req('/records/'+exam,'GET',undefined,other)).data.length,0)
      const question=(await req('/catalog/'+exam)).data.practiceQuestions[0]
      assert.equal((await req('/answers','POST',{examId:exam,questionId:question.id,selection:[0]},student)).status,200)
      assert.equal((await req('/stats/'+exam,'GET',undefined,student)).data.latest.length,1)
      const reports=(await req('/reports/'+exam,'GET',undefined,student));assert.equal(reports.status,200)
      assert.equal(reports.data[0].metrics.studyDays,1);assert.equal(reports.data[0].studiedDays.length,1)
    })
    await t.test('answer retries are idempotent; wrong dismissal preserves history',async()=>{
      const question=(await req('/catalog/'+exam)).data.practiceQuestions[0]
      const q=(await db.query('SELECT payload FROM content WHERE id=$1',[question.id])).rows[0].payload
      const wrong=q.options.findIndex((_v:any,i:number)=>!q.answer.includes(i))
      const body={examId:exam,questionId:question.id,selection:[wrong],requestId:'test-answer-retry-001'}
      const first=await req('/answers','POST',body,student)
      assert.equal(first.status,200);assert.equal(first.data.correct,false)
      assert.deepEqual((await req('/answers','POST',body,student)).data,first.data)
      assert.equal((await db.query('SELECT count(*)::int AS n FROM answers WHERE user_id=$1 AND request_id=$2',[uid,body.requestId])).rows[0].n,1)
      assert.equal((await req('/answers','POST',{...body,selection:q.answer},student)).status,409)
      const before=(await req('/stats/'+exam,'GET',undefined,student)).data
      assert.equal((await req('/wrong/'+exam,'DELETE',undefined,student)).status,200)
      const after=(await req('/stats/'+exam,'GET',undefined,student)).data
      assert.deepEqual(after.daily,before.daily);assert.equal(after.latest[0].wrong_hidden,true)
      await req('/answers','POST',{...body,requestId:'test-answer-retry-002'},student)
      assert.equal((await req('/stats/'+exam,'GET',undefined,student)).data.latest[0].wrong_hidden,false)
      assert.equal((await req('/stats/mid-social-worker','GET',undefined,student)).data.latest.length,0)
    })
    await t.test('AI history is isolated by user and exam',async()=>{
      await ai.callAI(uid,'review','test source',true,exam,{noteCount:12})
      const own=await req('/review/'+exam,'GET',undefined,student)
      assert.equal(own.data.records.length,1);assert.equal(own.data.records[0].context.noteCount,12)
      assert.equal((await req('/review/mid-social-worker','GET',undefined,student)).data.records.length,0)
      assert.equal((await req('/review/'+exam,'GET',undefined,other)).data.records.length,0)
    })
    await t.test('question import preview, draft commit and no duplicate commit',async()=>{
      const buffer=await imports.template()
      const batch=await imports.preview(uid,exam,'test.xlsx',Buffer.from(buffer).toString('base64'))
      assert.equal(batch.errors.length,0);assert.equal(batch.rows.length,1)
      assert.equal((await imports.commitImport(uid,batch.id,true)).count,1)
      await assert.rejects(imports.commitImport(uid,batch.id,true))
      assert.equal((await db.query('SELECT status,is_test_data FROM content WHERE id=$1',['test-import-001'])).rows[0].status,'draft')
    })
    await t.test('AI local test logs zero cost without revealing credentials',async()=>{
      const features=(await req('/admin/ai','GET',undefined,admin)).data.features
      assert.equal(features.length,11);assert(!JSON.stringify(features).includes('encrypted_key'))
      const r=await req('/admin/ai/chat/test','POST',{},admin);assert.equal(r.status,200);assert.equal(r.data.status,'success');assert.equal(r.data.mode,'mock')
      assert.equal((await db.query("SELECT cost_yuan,is_test FROM ai_calls WHERE feature_id='chat'")).rows[0].cost_yuan,'0.00000000')
    })
    await t.test('logout invalidates session',async()=>{
      assert.equal((await req('/auth/logout','POST',{},student)).status,200)
      assert.equal((await req('/me','GET',undefined,student)).status,401)
    })
    await t.test('VIP trial lasts 24 hours and cannot be used for discounted upgrade',async()=>{
      const o=(await req('/orders','POST',{productId:'platform-trial'},other)).data.order
      assert.equal(o.amount_cents,100)
      assert.equal((await req(`/orders/${o.id}/test-payment`,'POST',{outcome:'failure'},other)).data.paymentFailed,true)
      assert.equal((await req(`/orders/${o.id}/test-payment`,'POST',{outcome:'success'},other)).status,200)
      const grant=(await db.query('SELECT starts_at,trial_ends_at FROM memberships WHERE order_id=$1',[o.id])).rows[0]
      assert.equal(Date.parse(grant.trial_ends_at)-Date.parse(grant.starts_at),86400000)
      assert.equal((await req('/orders','POST',{examId:exam,product:'upgrade'},other)).status,400)
      await db.query("UPDATE memberships SET trial_ends_at=now()-interval '1 second' WHERE order_id=$1",[o.id])
      assert.equal((await req('/rights/'+exam,'GET',undefined,other)).data.level,'free')
      assert.equal((await req('/orders','POST',{productId:'platform-trial'},other)).status,400)
    })
    await t.test('inviter binding is permanent and cannot create a cycle',async()=>{
      const code=(await db.query('SELECT invite_code FROM users WHERE id=$1',[uid])).rows[0].invite_code
      assert.equal((await req('/me/inviter','POST',{code},other)).status,200)
      assert.equal((await req('/me/inviter','POST',{code},other)).status,409)
      const me=(await req('/me','GET',undefined,other)).data
      const restored=await security.session(uid)
      assert.equal((await req('/me/inviter','POST',{code:me.invite_code},restored)).status,400)
    })
    await t.test('AI rejects local/reserved addresses; production disables test payment',async()=>{
      for(const address of ['127.0.0.1','10.0.0.1','169.254.169.254','172.16.0.1','192.168.1.1','::1','::ffff:127.0.0.1'])assert.equal(ai.privateAddress(address),true)
      assert.equal(ai.privateAddress('1.1.1.1'),false)
      process.env.APP_MODE='production'
      try {assert.equal((await req('/orders/test/test-payment','POST',{outcome:'success'},other)).status,403)}finally{process.env.APP_MODE='test'}
    })
  } finally { await new Promise<void>((r,e)=>server.close(err=>err?e(err):r()));await closeDatabase() }
})
