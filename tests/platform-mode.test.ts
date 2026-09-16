import {test} from 'node:test'
import assert from 'node:assert/strict'
import {profileFixture} from './helpers/user-profile-fixture.ts'

test('published environment gates server features and invalidates old login credentials',async()=>{
 const f=await profileFixture()
 const {session,hash}=await import('../apps/api/src/security.ts')
 const {sendLoginCode}=await import('../apps/api/src/integrations.ts')
 const {migratePlatformMode}=await import('../apps/api/src/platform-mode.ts')
 const {payTest}=await import('../apps/api/src/membership.ts')
 const {payProductOrder}=await import('../apps/api/src/product-orders.ts')
 const oldEnv={...process.env}
 async function request(path:string,method='GET',body?:any,auth=f.token){const r=await fetch(f.origin+'/api'+path,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+auth},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json() as any}}
 const change=(mode:string,revision:number,password=process.env.ADMIN_PASSWORD)=>request('/admin/platform-mode','PUT',{mode,revision,password,confirmation:mode==='test'?'切换测试环境':'切换生产环境'})
 try{
  assert.equal((await request('/admin/platform-mode','GET',undefined,f.student)).status,403)
  assert.equal((await request('/admin/platform-mode','GET',undefined,'')).status,401)
  assert.equal((await request('/health')).data.mode,'test')
  assert.equal((await request('/site-settings')).data.environment,'test')
  // Changing process configuration after initialization must not override the stored selection.
  process.env.APP_MODE='production'
  await migratePlatformMode()
  assert.equal((await request('/health')).data.mode,'test')
  const code=await sendLoginCode({body:{phone:'18812340000'},headers:{},ip:'127.0.0.1'})
  assert.match(code.testCode!,/^\d{4}$/)
  assert.equal((await request('/payments/options','GET',undefined,f.student)).data.test,true)
  assert.equal((await change('production',1,'wrong-password')).status,400)
  const blocked=await change('production',1)
  assert.equal(blocked.status,400);assert.match(blocked.data.message,/HTTPS/)
  assert.equal((await request('/health')).data.mode,'test')
  // Stand-in deployment configuration; the fixture's already-open database remains isolated PGlite.
  process.env.DATABASE_URL='postgresql://isolated-test-config/unused'
  process.env.ADMIN_ORIGIN='https://admin.example.test';process.env.USER_ORIGIN='https://h5.example.test';process.env.GOCAPTCHA_API_KEY='isolated-captcha-key'
  await f.db.query("UPDATE site_preferences SET published=jsonb_set(published,'{siteDomain}','\"https://h5.example.test\"') WHERE key='basic'")
  await f.db.query("UPDATE integration_settings SET config=config||'{\"mode\":\"gocaptcha\",\"sms\":true}'::jsonb WHERE key='captcha'")
  await f.db.query("INSERT INTO protocol_login_challenges(token_hash,phone,expires_at) VALUES($1,'18812340000',now()+interval '5 minutes')",[hash('old-consent')])
  assert.equal((await change('production',1)).status,200)
  assert.equal((await request('/health')).data.mode,'production')
  assert.equal((await request('/site-settings')).data.environment,'production')
  assert.equal((await request('/verification/settings')).data.sms.mode,'disabled')
  await assert.rejects(()=>sendLoginCode({body:{phone:'18812340001'},headers:{},ip:'127.0.0.1'}),/暂未开启/)
  assert.equal((await f.db.query('SELECT * FROM login_codes')).rows.length,0)
  assert.equal((await f.db.query('SELECT * FROM protocol_login_challenges')).rows.length,0)
  assert.equal((await request('/me','GET',undefined,f.student)).status,401)
  assert.equal((await request('/me')).status,200)
  await assert.rejects(()=>payTest(f.uid,'irrelevant','success'),/禁止模拟支付/)
  await assert.rejects(()=>payProductOrder(f.uid,'irrelevant','success'),/禁止模拟支付/)
  const student=await session(f.uid)
  assert.equal((await request('/payments/options','GET',undefined,student)).data.test,false)
  assert.equal((await request('/admin/orders')).data.testDeletionAllowed,false)
  assert.equal((await request('/admin/orders/a-order','DELETE',{confirmation:'a-order',reason:'不能删除正式环境订单'})).status,403)
  assert.equal((await change('test',1)).status,409)
  assert.equal((await change('test',2)).status,200)
  assert.equal((await request('/verification/settings')).data.sms.mode,'test')
  assert.equal((await request('/me','GET',undefined,student)).status,401)
  await migratePlatformMode();assert.equal((await request('/health')).data.mode,'test')
  const logs=(await f.db.query("SELECT details FROM audit_logs WHERE action='settings.environment'")).rows
  assert.equal(logs.length,2);assert(!JSON.stringify(logs).includes(process.env.ADMIN_PASSWORD!))
  assert.equal((await f.db.query('SELECT * FROM orders WHERE id=$1',['a-order'])).rows.length,1)
 }finally{for(const key of Object.keys(process.env))if(!(key in oldEnv))delete process.env[key];Object.assign(process.env,oldEnv);await f.close()}
})
