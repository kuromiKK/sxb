import test from 'node:test'
import assert from 'node:assert/strict'
import {generateKeyPairSync,createCipheriv,sign,randomBytes,verify} from 'node:crypto'
import {profileFixture} from './helpers/user-profile-fixture.ts'
import {providerDefinitions} from '../apps/shared/provider-settings.ts'
test('provider credentials, OAuth state, signed payment callbacks and idempotent fulfillment',async()=>{
 const f=await profileFixture(),{encrypt,hash,session}=await import('../apps/api/src/security.ts'),{providerSetting}=await import('../apps/api/src/provider-config.ts'),{wxSign,moneyToCents}=await import('../apps/api/src/payment-adapters.ts'),{settlePayment}=await import('../apps/api/src/provider-payments.ts')
 const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}}),fetchOriginal=globalThis.fetch
 async function request(path:string,body:any,expected=200,token=f.token,method='POST'){const r=await fetchOriginal(f.origin+'/api'+path,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body)});const text=await r.text();assert.equal(r.status,expected,text);return text?JSON.parse(text):null}
 const payment={...providerDefinitions.payment.defaults,enabled:true,mchId:'1900000001',appId:'wx1234567890abcdef',serialNo:'123456789ABCDEF',platformSerial:'PUB_KEY_ID_TEST',notifyUrl:'https://api.example.com/api/payments/wechat/notify'},secrets={privateKey,platformKey:publicKey,apiV3Key:'a'.repeat(32)}
 async function save(key:string,config:any,credentials:any={},expected=200){const row=await providerSetting(key as any);return request('/admin/integrations/'+key,{revision:row.revision,config,credentials},expected,f.token,'PUT')}
 async function attempt(ref:string,user:string,options:any={}){const end=new Date(Date.now()+86400000).toISOString(),s={type:'entitlement',level:'vip',endsAt:end};await f.db.query("INSERT INTO orders(id,user_id,exam_id,cycle_id,product,amount_cents,expires_at) VALUES($1,$2,$3,$4,'vip',2990,$5)",[ref+'-order',user,f.exam,f.exam+'-2027',end]);await f.db.query('INSERT INTO provider_payments(ref,order_id,provider,channel,config,secrets,snapshot,amount_cents,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,2990,$8)',[ref,ref+'-order',options.provider||'wechat','native',JSON.stringify(options.config||payment),encrypt(JSON.stringify(options.secrets||secrets)),JSON.stringify(s),end])}
 function signedBody(data:any){const nonce=randomBytes(6).toString('hex'),cipher=createCipheriv('aes-256-gcm',Buffer.from(secrets.apiV3Key),Buffer.from(nonce));cipher.setAAD(Buffer.from('transaction'));const ciphertext=Buffer.concat([cipher.update(JSON.stringify(data)),cipher.final(),cipher.getAuthTag()]).toString('base64');const body=JSON.stringify({event_type:'TRANSACTION.SUCCESS',resource:{algorithm:'AEAD_AES_256_GCM',nonce,associated_data:'transaction',ciphertext}}),time=String(Math.floor(Date.now()/1000));return {body,headers:{'Content-Type':'application/json','wechatpay-serial':payment.platformSerial,'wechatpay-timestamp':time,'wechatpay-nonce':nonce,'wechatpay-signature':wxSign(time+'\n'+nonce+'\n'+body+'\n',privateKey)}}}
 try{
  await save('payment',{...payment,mchId:''},secrets,400)
  await save('payment',payment,secrets)
  const admin=await f.call('/admin/integrations');assert.equal(admin.find((r:any)=>r.key==='payment').credentialFields.privateKey,true);assert.ok(!JSON.stringify(admin).includes('PRIVATE KEY'));assert.ok(!(await providerSetting('payment')).secrets.includes('PRIVATE KEY'))
  await save('payment',payment);assert.ok((await providerSetting('payment')).credentials.privateKey===privateKey.trim())
  await request('/admin/integrations/payment',{revision:1,config:payment,credentials:{}},409,f.token,'PUT')
  await request('/admin/integrations/payment/validate',{revision:(await providerSetting('payment')).revision,config:payment,credentials:{}},200)
  await request('/admin/integrations/payment',{revision:(await providerSetting('payment')).revision,config:payment,clearFields:['privateKey']},400,f.token,'PUT')
  const wx={...providerDefinitions.wechat.defaults,enabled:true,webEnabled:true,webAppId:payment.appId,callbackUrl:'https://api.example.com/api/auth/wechat/callback',returnUrl:'https://app.example.com/#/pages/login/index'}
  await save('wechat',wx,{webSecret:'server-only-secret'})
  const verifier='1'.repeat(64),start=await request('/auth/wechat/start',{channel:'web',verifier},200,''),state=new URL(start.url).searchParams.get('state')!;assert.ok(!start.url.includes('server-only-secret'))
  globalThis.fetch=async(input:any,init?:any)=>{const url=String(input);if(url.startsWith('https://api.weixin.qq.com/sns/oauth2/access_token'))return new Response(JSON.stringify({openid:'verified-openid',access_token:'never-return'}));return fetchOriginal(input,init)}
  let r=await fetchOriginal(f.origin+'/api/auth/wechat/callback?state='+state+'&code=code',{redirect:'manual'});assert.equal(r.status,303);const url=r.headers.get('location')!,ticket=url.split('wechatResult=')[1];assert.ok(!url.includes('openid'))
  await request('/auth/wechat/finish',{ticket,verifier:'2'.repeat(64)},400,'')
  const binding=await request('/auth/wechat/finish',{ticket,verifier},200,'');assert.equal(binding.bindingRequired,true)
  await request('/auth/wechat/finish',{ticket,verifier},400,'')
  await request('/auth/wechat/bind',{ticket:binding.bindingTicket},200,f.student)
  await request('/auth/wechat/bind',{ticket:binding.bindingTicket},400,f.student)
  assert.equal((await f.db.query('SELECT user_id FROM wechat_identities WHERE openid=$1',['verified-openid'])).rows[0].user_id,f.uid)
  for(const u of ['pay-ok','pay-conflict','pay-ali','pay-start'])await f.db.query('INSERT INTO users(id,phone,nickname,invite_code) VALUES($1,$2,$1,$1)',[u,'1890000'+String(['pay-ok','pay-conflict','pay-ali','pay-start'].indexOf(u)+1000)])
  await attempt('wx-ref','pay-ok')
  const data={out_trade_no:'wx-ref',transaction_id:'wx-transaction-1',mchid:payment.mchId,appid:payment.appId,trade_state:'SUCCESS',amount:{total:2990,currency:'CNY'},success_time:new Date().toISOString()}
  let signed=signedBody(data);r=await fetchOriginal(f.origin+'/api/payments/wechat/notify',{method:'POST',...signed,headers:{...signed.headers,'wechatpay-signature':'forged'}});assert.equal(r.status,400)
  signed=signedBody({...data,amount:{total:1,currency:'CNY'}});r=await fetchOriginal(f.origin+'/api/payments/wechat/notify',{method:'POST',...signed});assert.equal(r.status,400)
  signed=signedBody(data);for(let i=0;i<2;i++){r=await fetchOriginal(f.origin+'/api/payments/wechat/notify',{method:'POST',...signed});assert.equal(r.status,204,await r.text())}
  assert.equal((await f.db.query("SELECT count(*)::int n FROM memberships WHERE order_id='wx-ref-order'")).rows[0].n,1)
  assert.equal((await f.db.query("SELECT count(*)::int n FROM payments WHERE order_id='wx-ref-order'")).rows[0].n,1)
  await assert.rejects(()=>settlePayment('wx-ref','wechat','other-transaction',2990,data.success_time),/交易号冲突/)
  await attempt('late-ref','pay-conflict');await f.db.query("UPDATE provider_payments SET expires_at=now()-interval '1 hour' WHERE ref='late-ref'");await settlePayment('late-ref','wechat','wx-late',2990,data.success_time);assert.equal((await f.db.query("SELECT status FROM orders WHERE id='late-ref-order'")).rows[0].status,'refunding')
  const ali={...providerDefinitions.alipay.defaults,enabled:true,appId:'2021000000000000',sellerId:'2088000000000000',notifyUrl:'https://api.example.com/api/payments/alipay/notify',returnUrl:'https://app.example.com/#/pages/payment/index'},aliSecrets={privateKey,alipayPublicKey:publicKey};await save('alipay',ali,aliSecrets);await attempt('ali-ref','pay-ali',{provider:'alipay',config:ali,secrets:aliSecrets})
  const b:any={app_id:ali.appId,seller_id:ali.sellerId,out_trade_no:'ali-ref',trade_no:'alipay-transaction',total_amount:'29.90',trade_status:'TRADE_SUCCESS',gmt_payment:new Date().toLocaleString('sv-SE',{timeZone:'Asia/Shanghai'})};const content=Object.keys(b).sort().map(k=>k+'='+b[k]).join('&');b.sign=sign('RSA-SHA256',Buffer.from(content),privateKey).toString('base64');b.sign_type='RSA2'
  for(let i=0;i<2;i++){r=await fetchOriginal(f.origin+'/api/payments/alipay/notify',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(b)});assert.equal(r.status,200,await r.text())}
  assert.equal((await f.db.query("SELECT count(*)::int n FROM memberships WHERE order_id='ali-ref-order'")).rows[0].n,1)
  assert.equal(moneyToCents('29.9'),2990);assert.throws(()=>moneyToCents('29.999'))
  const cycle=(await f.db.query('SELECT * FROM exam_cycles WHERE exam_id=$1 AND starts_at<=now() AND ends_at>now()',[f.exam])).rows[0];await request('/admin/products/provider-product',{version:0,config:{title:'接口测试商品',type:'entitlement',examId:f.exam,cycleId:cycle.id,level:'vip',priceCents:2990,status:'published',intro:'测试',document:{type:'doc',content:[]}}},200,f.token,'PUT')
  const student=await session('pay-start'),order=await request('/orders',{productId:'provider-product'},200,student)
  let signedRequest=false
  globalThis.fetch=async(input:any,init?:any)=>{if(String(input).startsWith('https://api.mch.weixin.qq.com/v3/pay/transactions/native')){assert.ok(init.headers.Authorization.includes('WECHATPAY2'));const body=JSON.parse(init.body);assert.equal(body.out_trade_no.length,32);assert.equal(body.amount.total,2990);signedRequest=true;const raw=JSON.stringify({code_url:'weixin://wxpay/test'}),time=String(Math.floor(Date.now()/1000)),nonce='response-nonce';return new Response(raw,{headers:{'wechatpay-serial':payment.platformSerial,'wechatpay-timestamp':time,'wechatpay-nonce':nonce,'wechatpay-signature':wxSign(time+'\n'+nonce+'\n'+raw+'\n',privateKey)}})}return fetchOriginal(input,init)}
  const pay=await request('/orders/'+order.order.id+'/payment',{channel:'native'},200,student);assert.equal(pay.kind,'qr');assert.match(pay.qr,/^data:image\/png/);assert.equal(signedRequest,true)
  await request('/orders/'+order.order.id+'/test-payment',{outcome:'success'},409,student)
  await request('/orders/'+order.order.id+'/payment',{channel:'page'},409,student)
 }finally{globalThis.fetch=fetchOriginal;await f.close()}
})
