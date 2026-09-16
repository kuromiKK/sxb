import test from 'node:test'
import assert from 'node:assert/strict'
import {generateKeyPairSync} from 'node:crypto'
import {profileFixture} from './helpers/user-profile-fixture.ts'
import {providerDefinitions} from '../apps/shared/provider-settings.ts'
test('connection probes query only, redact credentials and distinguish partial verification',async()=>{
 const f=await profileFixture(),{probeIntegration}=await import('../apps/api/src/integration-tests.ts'),{wxRequest,wxSign}=await import('../apps/api/src/payment-adapters.ts'),original=globalThis.fetch
 const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}})
 const c={...providerDefinitions.payment.defaults,enabled:false,mchId:'1900000001',appId:'wx1234567890abcdef',serialNo:'123456789ABCDEF',platformSerial:'PUB_KEY_ID_TEST',notifyUrl:'https://api.example.com/api/payments/wechat/notify'},s={privateKey,platformKey:publicKey,apiV3Key:'a'.repeat(32)}
 const sent:any[]=[],transport:any={json:async(url:string,body:any)=>{sent.push({url,body});return {access_token:'must-not-be-returned'}},sms:async(_c:any,_s:any,kind:string)=>{sent.push({kind});return {code:'OK',signStatus:1,templateStatus:1}},wx:wxRequest,alipay:async(_c:any,_s:any,ref:string)=>{assert.match(ref,/^SXBTEST/);return {code:'40004',subCode:'ACQ.TRADE_NOT_EXIST'}}}
 try{
  const off=await probeIntegration('sms',{mode:'test'},{},transport);assert.equal(off.status,'warning');assert.equal(sent.length,0)
  const sms=await probeIntegration('sms',{mode:'aliyun',signName:'测试',templateCode:'SMS_TEST'},{accessKeyId:'id',accessKeySecret:'secret'},transport);assert.equal(sms.status,'success');assert.deepEqual(sent.map(x=>x.kind).sort(),['sign','template'])
  const denied=await probeIntegration('sms',{mode:'aliyun',signName:'测试',templateCode:'SMS_TEST'},{accessKeyId:'id',accessKeySecret:'secret'},{...transport,sms:async()=>{throw {code:'Forbidden.RAM',message:'credential-secret-in-upstream-error'}}});assert.equal(denied.status,'error');assert.ok(!JSON.stringify(denied).includes('credential-secret'))
  const wx={...providerDefinitions.wechat.defaults,miniEnabled:true,miniAppId:c.appId},login=await probeIntegration('wechat',wx,{miniSecret:'secret'},transport);assert.equal(login.status,'success');assert.ok(!JSON.stringify(login).includes('must-not-be-returned'));assert.equal(sent.at(-1).body.force_refresh,false)
  const badLogin=await probeIntegration('wechat',wx,{miniSecret:'secret'},{...transport,json:async()=>({errcode:40125,errmsg:'secret must not leak'})});assert.equal(badLogin.status,'error');assert.match(badLogin.checks[0].message,/AppSecret 无效/)
  globalThis.fetch=async(input:any)=>{assert.match(String(input),/^https:\/\/open.weixin.qq.com\/connect\/qrconnect/);return new Response('page')}
  const web=await probeIntegration('wechat',{...providerDefinitions.wechat.defaults,webEnabled:true,webAppId:c.appId,callbackUrl:'https://api.example.com/api/auth/wechat/callback',returnUrl:'https://app.example.com/#/pages/login/index'},{webSecret:'secret'},transport);assert.equal(web.status,'warning');assert.match(web.checks[0].message,/真实扫码/)
  globalThis.fetch=async(input:any,options:any)=>{assert.match(String(input),/\/v3\/pay\/transactions\/out-trade-no\/SXBTEST/);assert.equal(options.method,'GET');assert.equal(options.body,undefined);const raw=JSON.stringify({code:'ORDER_NOT_EXIST'}),time=String(Math.floor(Date.now()/1000)),nonce='nonce';return new Response(raw,{status:404,headers:{'wechatpay-serial':c.platformSerial,'wechatpay-timestamp':time,'wechatpay-nonce':nonce,'wechatpay-signature':wxSign(time+'\n'+nonce+'\n'+raw+'\n',privateKey)}})}
  assert.equal((await probeIntegration('payment',c,s,transport)).status,'success')
  globalThis.fetch=async()=>new Response('{"code":"ORDER_NOT_EXIST"}',{status:404});assert.equal((await probeIntegration('payment',c,s,transport)).status,'error')
  const ali={...providerDefinitions.alipay.defaults,appId:'2021000000000000',sellerId:'2088000000000000',notifyUrl:'https://api.example.com/api/payments/alipay/notify',returnUrl:'https://app.example.com/#/pages/payment/index'}
  assert.equal((await probeIntegration('alipay',ali,{privateKey,alipayPublicKey:publicKey},transport)).status,'success')
  assert.equal((await probeIntegration('alipay',ali,{privateKey,alipayPublicKey:publicKey},{...transport,alipay:async()=>({code:'40004',subCode:'ACQ.ACCESS_FORBIDDEN'})})).status,'error')
  assert.equal((await probeIntegration('captcha',{mode:'frontend'},{},transport)).status,'warning')
  assert.equal((await probeIntegration('captcha',{mode:'gocaptcha',variant:'slide-default'},{},{...transport,json:async()=>({code:200,data:{captcha_key:'test',master_image_base64:'data:image/png;base64,eA==',thumb_image_base64:'data:image/png;base64,eA=='}})})).status,'success')
  globalThis.fetch=original
  const row=(await f.call('/admin/integrations')).find((r:any)=>r.key==='sms')
  const post=(token:string,revision:number)=>original(f.origin+'/api/admin/integrations/sms/test',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({revision})})
  assert.equal((await post('',row.revision)).status,401);assert.equal((await post(f.student,row.revision)).status,403);assert.equal((await post(f.token,999)).status,409)
  const r=await post(f.token,row.revision);assert.equal(r.status,200);const result:any=await r.json();assert.equal(result.status,'warning');assert.equal(result.revision,row.revision);assert.ok(result.testedAt);assert.ok(Number.isFinite(result.durationMs))
  assert.equal((await f.db.query("SELECT count(*)::int n FROM audit_logs WHERE action='integration.test'")).rows[0].n,1)
  assert.equal((await f.db.query('SELECT count(*)::int n FROM sms_deliveries')).rows[0].n,0)
  assert.equal((await f.db.query('SELECT count(*)::int n FROM provider_payments')).rows[0].n,0)
 }finally{globalThis.fetch=original;await f.close()}
})
