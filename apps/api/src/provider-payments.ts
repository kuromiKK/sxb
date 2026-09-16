import express,{Router} from 'express'
import {z} from 'zod'
import {db,transaction} from './db.ts'
import {decrypt,fail,id} from './security.ts'
import {providerSetting} from './provider-config.ts'
import {alipayClient,decryptWechat,moneyToCents,verifyWechat,wxRequest,wxSign} from './payment-adapters.ts'
import {pendingCheckout,trialWindow} from './product-orders.ts'
import {randomBytes} from 'node:crypto'
import QRCode from 'qrcode'
import {rateLimit} from 'express-rate-limit'
export const paymentPublic=Router(),paymentStudent=Router()
paymentStudent.use('/orders/:id/payment',rateLimit({windowMs:60000,limit:10,standardHeaders:true,legacyHeaders:false}))
paymentStudent.use('/orders/:id/payment-status',rateLimit({windowMs:60000,limit:15,standardHeaders:true,legacyHeaders:false}))
const channelSchema=z.enum(['native','h5','jsapi','mini','page','wap'])
function returnAddress(url:string,orderId:string){const u=new URL(url);if(u.hash){const h=u.hash;u.hash=h+(h.includes('?')?'&':'?')+'orderId='+encodeURIComponent(orderId)}else u.searchParams.set('orderId',orderId);return u.toString()}
async function paymentOptions(){const w=await providerSetting('payment'),a=await providerSetting('alipay');return {wechat:w.config.enabled?['native','h5','jsapi','mini'].filter(x=>w.config[x+'Enabled']):[],alipay:a.config.enabled?['page','wap'].filter(x=>a.config[x+'Enabled']):[],test:process.env.APP_MODE!=='production'&&!w.config.enabled&&!a.config.enabled}}
paymentStudent.get('/payments/options',async(_req,res)=>res.json(await paymentOptions()))
paymentStudent.post('/orders/:id/payment',async(req,res)=>{
 const b=z.object({channel:channelSchema,confirmationToken:z.string().optional()}).strict().parse(req.body),provider=['page','wap'].includes(b.channel)?'alipay':'wechat',setting=await providerSetting(provider==='wechat'?'payment':'alipay'),c=setting.config,s=setting.credentials
 if(!c.enabled||!c[b.channel+'Enabled'])fail(400,'当前支付方式尚未开启')
 const r=await transaction(async conn=>{
  const r=await pendingCheckout(conn,res.locals.user.id,String(req.params.id));if(r.paid)return {paid:true as const}
  if(Date.parse(r.order.expires_at)<Date.now()+65000)fail(409,'订单即将到期，请关闭后重新下单')
  if(r.window.shortened&&(!b.confirmationToken||r.order.checkout_confirmation?.token!==b.confirmationToken||r.order.checkout_confirmation.expires<Date.now()||r.order.checkout_confirmation.endsAt!==r.snapshot.endsAt))fail(409,'请重新确认实际可用体验时长')
  const old=(await conn.query('SELECT * FROM provider_payments WHERE order_id=$1 ORDER BY created_at LIMIT 1',[r.order.id])).rows[0]
  if(old){if(old.provider!==provider||old.channel!==b.channel)fail(409,'该订单已发起其他支付方式，请继续原支付方式或关闭订单后重建');return {paid:false as const,attempt:old}}
  if(r.order.amount_cents<=0)fail(400,'第三方支付金额必须大于零')
  const attempt=(await conn.query('INSERT INTO provider_payments(ref,order_id,provider,channel,config,secrets,snapshot,amount_cents,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',[id().replaceAll('-',''),r.order.id,provider,b.channel,JSON.stringify(c),setting.secrets,JSON.stringify({...r.snapshot,shortConfirmationAccepted:r.window.shortened}),r.order.amount_cents,r.order.expires_at])).rows[0]
  // Once handed to a real provider, this order must never be deletable as test data.
  await conn.query('UPDATE orders SET is_test_data=$2 WHERE id=$1',[r.order.id,provider==='alipay'&&c.environment==='sandbox'])
  return {paid:false as const,attempt}
 })
 if(r.paid){res.json({paid:true});return}
 const a=r.attempt,cfg=a.config,secret=JSON.parse(decrypt(a.secrets)),title=String(a.snapshot.frontendTitle||a.snapshot.title).slice(0,40)
 if(provider==='alipay'){
  const url=alipayClient(cfg,secret).pageExecute(b.channel==='page'?'alipay.trade.page.pay':'alipay.trade.wap.pay','GET',{notifyUrl:cfg.notifyUrl,returnUrl:returnAddress(cfg.returnUrl,a.order_id),bizContent:{out_trade_no:a.ref,total_amount:(a.amount_cents/100).toFixed(2),subject:title,product_code:b.channel==='page'?'FAST_INSTANT_TRADE_PAY':'QUICK_WAP_WAY',time_expire:new Date(a.expires_at).toLocaleString('sv-SE',{timeZone:'Asia/Shanghai'})}})
  res.json({kind:'redirect',url});return
 }
 const appid=b.channel==='mini'?cfg.miniAppId:cfg.appId,body:any={appid,mchid:cfg.mchId,description:title,out_trade_no:a.ref,notify_url:cfg.notifyUrl,time_expire:new Date(a.expires_at).toISOString(),amount:{total:a.amount_cents,currency:'CNY'}}
 if(['mini','jsapi'].includes(b.channel)){
  const identity=(await db.query('SELECT openid FROM wechat_identities WHERE user_id=$1 AND app_id=$2',[res.locals.user.id,appid])).rows[0]
  if(!identity)fail(400,'请先使用对应的微信登录并绑定手机号，再进行微信内支付')
  body.payer={openid:identity.openid}
 }
 if(b.channel==='h5')body.scene_info={payer_client_ip:req.ip,h5_info:{type:'Wap',app_name:cfg.h5Name,app_url:cfg.h5Url}}
 const data=await wxRequest('/v3/pay/transactions/'+(b.channel==='mini'?'jsapi':b.channel),cfg,secret,body)
 if(b.channel==='native'){res.json({kind:'qr',qr:await QRCode.toDataURL(data.code_url,{width:360,margin:2})});return}
 if(b.channel==='h5'){res.json({kind:'redirect',url:data.h5_url});return}
 const timeStamp=String(Math.floor(Date.now()/1000)),nonceStr=randomBytes(16).toString('hex'),pkg='prepay_id='+data.prepay_id
 res.json({kind:b.channel,params:{appId:appid,timeStamp,nonceStr,package:pkg,signType:'RSA',paySign:wxSign(`${appid}\n${timeStamp}\n${nonceStr}\n${pkg}\n`,secret.privateKey)}})
})

/** Only verified provider messages enter here. Record every received payment, even if fulfillment requires manual attention. */
export async function settlePayment(ref:string,provider:string,transactionId:string,amount:number,paidAt:string){
 if(!transactionId||transactionId.length>128||!Number.isFinite(Date.parse(paidAt))||Date.parse(paidAt)>Date.now()+300000)fail(400,'支付通知交易信息无效')
 return transaction(async c=>{
  const info=(await c.query('SELECT o.user_id FROM provider_payments p JOIN orders o ON o.id=p.order_id WHERE p.ref=$1',[ref])).rows[0];if(!info)fail(404,'支付订单不存在')
  await c.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[info.user_id])
  const a=(await c.query('SELECT * FROM provider_payments WHERE ref=$1 FOR UPDATE',[ref])).rows[0]
  if(a.provider!==provider||a.amount_cents!==amount)fail(400,'支付渠道或金额不匹配')
  if(a.processed_at){if(a.transaction_id!==transactionId)fail(409,'支付交易号冲突');return {ok:true}}
  const o=(await c.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE',[a.order_id])).rows[0],s=a.snapshot
  if(o.amount_cents!==amount)fail(400,'订单金额不匹配')
  const w=s.type==='trial'?trialWindow(s.trialHours,0,s.endsAt,Date.parse(paidAt)):{expiresAt:s.endsAt,shortened:false}
  const duplicate=(await c.query("SELECT 1 FROM orders WHERE user_id=$1 AND id<>$2 AND paid_at IS NOT NULL AND ((exam_id=$3 AND cycle_id=$4 AND product IN ('vip','svip','upgrade')) OR $5) LIMIT 1",[o.user_id,o.id,o.exam_id,o.cycle_id,s.type==='trial'])).rows.length>0
  const issue=o.deleted_at||!['pending_payment','closed'].includes(o.status)?'订单状态异常':o.status==='closed'&&o.close_reason!=='超过30分钟未支付，订单已自动关闭'?'订单已被主动关闭':duplicate?'已有其他权益购买记录':Date.parse(paidAt)>Date.parse(a.expires_at)?'支付时间超过订单有效期':Date.parse(w.expiresAt)<=Date.parse(paidAt)?'支付时考期已结束':s.type==='trial'&&w.shortened&&!s.shortConfirmationAccepted?'体验时长变化需人工核对':null
  const test=provider==='alipay'&&a.config.environment==='sandbox'
  await c.query('INSERT INTO payments(id,order_id,status,method,error,is_test_data) VALUES($1,$2,$3,$4,$5,$6)',[id(),o.id,'success',provider+(test?'_sandbox':''),issue,test])
  await c.query('UPDATE provider_payments SET transaction_id=$2,processed_at=now(),issue=$3 WHERE ref=$1',[ref,transactionId,issue])
  await c.query('INSERT INTO audit_logs(id,action,target_id,details) VALUES($1,$2,$3,$4)',[id(),'order.provider_payment',o.id,JSON.stringify({provider,transactionId,amountCents:amount,issue})])
  if(issue){await c.query("UPDATE orders SET status='refunding',paid_at=COALESCE(paid_at,$2),refund_reason=$3,is_test_data=$4 WHERE id=$1",[o.id,paidAt,'支付已到账，需人工处理：'+issue,test]);return {ok:true,manual:true}}
  await c.query("UPDATE orders SET status='paid',paid_at=$2,close_reason=NULL,checkout_confirmation=NULL,is_test_data=$3,fulfillment_snapshot=$4 WHERE id=$1",[o.id,paidAt,test,JSON.stringify({startsAt:paidAt,endsAt:w.expiresAt,configuredHours:s.trialHours,actualHours:(Date.parse(w.expiresAt)-Date.parse(paidAt))/3600000,shortened:w.shortened,shortConfirmationAccepted:!!s.shortConfirmationAccepted,noticeTemplate:s.shortNotice||''})])
  if(s.type==='entitlement')await c.query("UPDATE memberships SET revoked=true WHERE user_id=$1 AND exam_id=$2 AND level='trial' AND NOT revoked",[o.user_id,o.exam_id])
  await c.query('INSERT INTO memberships(order_id,user_id,exam_id,cycle_id,level,trial_ends_at,trial_level,entitlement_ends_at,starts_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[o.id,o.user_id,o.exam_id,o.cycle_id,s.type==='trial'?'trial':s.level,s.type==='trial'?w.expiresAt:null,s.type==='trial'?s.level:null,w.expiresAt,paidAt])
  return {ok:true}
 })
}
function assertWechat(d:any,a:any){if(d.mchid!==a.config.mchId||d.appid!==(a.channel==='mini'?a.config.miniAppId:a.config.appId)||d.amount?.currency!=='CNY')fail(400,'微信支付商户、应用或币种不匹配')}
paymentPublic.post('/payments/wechat/notify',async(req,res)=>{
 const raw=(req as any).rawBody;if(typeof raw!=='string')fail(400,'缺少原始通知报文')
 const serial=String(req.headers['wechatpay-serial']||''),settings=(await db.query("SELECT DISTINCT config,secrets FROM provider_payments WHERE provider='wechat' AND config->>'platformSerial'=$1",[serial])).rows
 let data:any
 for(const r of settings)try{const s=JSON.parse(decrypt(r.secrets));verifyWechat(req.headers as Record<string,string>,raw,r.config,s);data=decryptWechat(req.body.resource,s.apiV3Key);break}catch{}
 if(!data)fail(400,'微信支付通知验签或解密失败')
 const a=(await db.query("SELECT * FROM provider_payments WHERE ref=$1 AND provider='wechat'",[data.out_trade_no])).rows[0];if(!a)fail(404,'支付订单不存在');assertWechat(data,a)
 if(data.trade_state==='SUCCESS')await settlePayment(a.ref,'wechat',data.transaction_id,data.amount.total,data.success_time)
 res.status(204).end()
})
paymentPublic.post('/payments/alipay/notify',express.urlencoded({extended:false,limit:'64kb'}),async(req,res)=>{
 const b=z.record(z.string(),z.string()).parse(req.body),a=(await db.query("SELECT * FROM provider_payments WHERE ref=$1 AND provider='alipay'",[b.out_trade_no])).rows[0]
 if(!a||!alipayClient(a.config,JSON.parse(decrypt(a.secrets))).checkNotifySignV2(b))fail(400,'支付宝通知验签失败')
 if(b.app_id!==a.config.appId||b.seller_id!==a.config.sellerId||b.sign_type!=='RSA2')fail(400,'支付宝应用或收款账号不匹配')
 if(['TRADE_SUCCESS','TRADE_FINISHED'].includes(b.trade_status))await settlePayment(a.ref,'alipay',b.trade_no,moneyToCents(b.total_amount),b.gmt_payment.replace(' ','T')+'+08:00')
 res.type('text/plain').send('success')
})
paymentStudent.post('/orders/:id/payment-status',async(req,res)=>{
 const a=(await db.query('SELECT p.* FROM provider_payments p JOIN orders o ON o.id=p.order_id WHERE o.id=$1 AND o.user_id=$2 AND o.deleted_at IS NULL ORDER BY p.created_at LIMIT 1',[req.params.id,res.locals.user.id])).rows[0]
 if(a&&!a.processed_at){const s=JSON.parse(decrypt(a.secrets));if(a.provider==='wechat'){
   const d=await wxRequest('/v3/pay/transactions/out-trade-no/'+encodeURIComponent(a.ref)+'?mchid='+a.config.mchId,a.config,s);assertWechat(d,a);if(d.trade_state==='SUCCESS')await settlePayment(a.ref,'wechat',d.transaction_id,d.amount.total,d.success_time)
  }else{
   const d:any=await alipayClient(a.config,s).exec('alipay.trade.query',{bizContent:{out_trade_no:a.ref}},{validateSign:true})
   if(d.code==='10000'&&['TRADE_SUCCESS','TRADE_FINISHED'].includes(d.tradeStatus)){if(d.outTradeNo!==a.ref)fail(400,'支付宝订单号不匹配');await settlePayment(a.ref,'alipay',d.tradeNo,moneyToCents(d.totalAmount),String(d.sendPayDate).replace(' ','T')+'+08:00')}
  }}
 const o=(await db.query('SELECT status FROM orders WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL',[req.params.id,res.locals.user.id])).rows[0];if(!o)fail(404,'订单不存在');res.json(o)
})
