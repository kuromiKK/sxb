import {test} from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import {profileFixture} from './helpers/user-profile-fixture.ts'

test('admin login requires one-time server captcha bound to phone, IP and scope even when student captcha is off',async()=>{
 const upstream=express();upstream.use(express.json());let down=false
 upstream.get('/api/v1/public/get-data',(_q,r)=>down?r.status(503).end():r.json({code:200,data:{captcha_key:crypto.randomUUID(),master_image_base64:'data:image/png;base64,eA==',thumb_image_base64:'data:image/png;base64,eA==',master_width:300,master_height:220,thumb_width:60,thumb_height:60}}))
 upstream.post('/api/v1/public/check-data',(q,r)=>r.json({code:200,data:q.body.value==='180,20'?'ok':'failure'}))
 const server=upstream.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r))
 process.env.GOCAPTCHA_URL='http://127.0.0.1:'+(server.address() as any).port
 const f=await profileFixture(),{hash}=await import('../apps/api/src/security.ts'),{consumeCaptcha}=await import('../apps/api/src/integrations.ts')
 const phone=process.env.ADMIN_PHONE!,password=process.env.ADMIN_PASSWORD!
 async function post(path:string,body:any,status=200){const r=await fetch(f.origin+'/api'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d:any=await r.json();assert.equal(r.status,status,d.message);return d}
 const challenge=(target=phone)=>post('/verification/challenge',{scope:'admin-login',target})
 const check=(id:string,target=phone,status=200,answer={x:180,y:20})=>post('/verification/check',{scope:'admin-login',target,challengeId:id,answer},status)
 async function proof(){const c=await challenge();return (await check(c.challengeId)).proof as string}
 try{
  await f.db.query("UPDATE integration_settings SET config=config||'{\"mode\":\"frontend\",\"sms\":false,\"handouts\":false}'::jsonb WHERE key='captcha'")
  await post('/auth/admin',{phone,password},400)
  await post('/auth/admin',{phone,password,captchaProof:'invented-proof'},400)
  const c=await challenge();assert.equal(c.mode,'gocaptcha');assert.equal(c.data.captcha_key,undefined);assert(!JSON.stringify(c).includes('upstream_key'))
  await check(c.challengeId,'18600000001',400)
  await check(c.challengeId,phone,400,{x:0,y:0})
  await check(c.challengeId,phone,400)
  const exp=await proof();await f.db.query("UPDATE verification_challenges SET proof_expires_at=now()-interval '1 second' WHERE proof_hash=$1",[hash(exp)])
  await post('/auth/admin',{phone,password,captchaProof:exp},400)
  const scoped=await proof();await f.db.query("UPDATE verification_challenges SET scope='sms' WHERE proof_hash=$1",[hash(scoped)])
  await post('/auth/admin',{phone,password,captchaProof:scoped},400)
  const bound=await proof()
  await assert.rejects(()=>consumeCaptcha('admin-login',phone,{headers:{},ip:'127.0.0.2'},bound),/无效/)
  await post('/auth/admin',{phone:'18600000001',password,captchaProof:bound},400)
  const logged=await post('/auth/admin',{phone,password,captchaProof:bound});assert(logged.token)
  await post('/auth/admin',{phone,password,captchaProof:bound},400)
  const wrong=await proof();await post('/auth/admin',{phone,password:'wrong-password',captchaProof:wrong},401)
  await post('/auth/admin',{phone,password,captchaProof:wrong},400)
  const simultaneous=await proof()
  const responses=await Promise.all([1,2].map(()=>fetch(f.origin+'/api/auth/admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone,password,captchaProof:simultaneous})})))
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,400])
  down=true;await post('/verification/challenge',{scope:'admin-login',target:phone},503)
  await post('/auth/admin',{phone,password},400)
  assert.equal((await f.db.query("SELECT count(*)::int n FROM audit_logs WHERE action='admin.login'")).rows[0].n,2)
 }finally{await f.close();await new Promise<void>(r=>server.close(()=>r()))}
})
