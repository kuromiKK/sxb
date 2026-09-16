import {Router} from 'express'
import {rateLimit} from 'express-rate-limit'
import {z} from 'zod'
import {randomBytes} from 'node:crypto'
import * as AliSms from '@alicloud/dysmsapi20170525'
import * as AliOpenAPI from '@alicloud/openapi-client'
import * as AliUtil from '@alicloud/tea-util'
import {db} from './db.ts'
import {decrypt,fail,id} from './security.ts'
import {validateProvider} from './provider-config.ts'
import {alipayClient,wxRequest} from './payment-adapters.ts'
type Check={name:string;status:'success'|'warning'|'error';message:string}
const safeCode=(v:unknown)=>typeof v==='string'&&/^[\w.-]{1,90}$/.test(v)?v:'UNKNOWN'
async function jsonRequest(url:string,body?:any){const r=await fetch(url,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(10000),redirect:'error'});if(!r.ok)throw Object.assign(new Error(),{code:'HTTP_'+r.status});return r.json() as Promise<any>}
async function smsQuery(c:any,s:any,kind:'sign'|'template'){
 const Client=(AliSms.default as any).default||AliSms.default,client=new Client(new AliOpenAPI.Config({...s,endpoint:'dysmsapi.aliyuncs.com',regionId:'cn-hangzhou'})),runtime=new AliUtil.RuntimeOptions({autoretry:false,connectTimeout:5000,readTimeout:10000})
 return (kind==='sign'?await client.querySmsSignWithOptions(new AliSms.QuerySmsSignRequest({signName:c.signName}),runtime):await client.querySmsTemplateWithOptions(new AliSms.QuerySmsTemplateRequest({templateCode:c.templateCode}),runtime)).body
}
// Injectable transports are used only by isolated tests, never selected by request data.
export async function probeIntegration(key:string,c:any,s:any,transports={json:jsonRequest,sms:smsQuery,wx:wxRequest,alipay:async(c:any,s:any,ref:string)=>alipayClient(c,s).exec('alipay.trade.query',{bizContent:{out_trade_no:ref}},{validateSign:true})}){
 const checks:Check[]=[],start=Date.now()
 const add=(name:string,status:Check['status'],message:string)=>checks.push({name,status,message})
 const run=async(name:string,fn:()=>Promise<void>,hint:string)=>{try{await fn()}catch(e:any){const code=safeCode(e?.code);add(name,'error',hint+(code!=='UNKNOWN'?`（${code}）`:''))}}
 if(key==='captcha'){
  if(c.mode!=='gocaptcha')add('验证码模式','warning','当前使用前端生成，没有服务端接口需要测试。')
  else await run('GoCaptcha 服务',async()=>{const base=process.env.GOCAPTCHA_URL||'http://127.0.0.1:4311';let r:any
   if(process.env.GOCAPTCHA_API_KEY){const response=await fetch(base.replace(/\/$/,'')+'/api/v1/public/get-data?id='+encodeURIComponent(c.variant||'slide-default'),{headers:{'X-API-Key':process.env.GOCAPTCHA_API_KEY},signal:AbortSignal.timeout(10000),redirect:'error'});r=await response.json();if(!response.ok)throw 0}
   else r=await transports.json(base.replace(/\/$/,'')+'/api/v1/public/get-data?id='+encodeURIComponent(c.variant||'slide-default'))
   if(r.code!==200||!r.data?.captcha_key||!r.data?.master_image_base64?.startsWith('data:image/')||!r.data?.thumb_image_base64?.startsWith('data:image/'))throw 0
   add('GoCaptcha 服务','success','已连接服务并成功生成当前类型的验证码。完整交互核验可使用右侧预览。')
  },'无法获取有效验证码，请检查 GoCaptcha 服务是否启动、服务地址及访问密钥。')
 }else if(key==='sms'){
  if(c.mode!=='aliyun')add('短信模式','warning',c.mode==='test'?'当前为本地测试模式，没有调用阿里云。':'短信已关闭，没有调用阿里云。')
  else if(!s.accessKeyId||!s.accessKeySecret||!c.signName||!c.templateCode)add('短信配置','error','请先保存 AccessKey、短信签名和模板编号。')
  else await Promise.all((['sign','template'] as const).map(kind=>run(kind==='sign'?'短信签名查询':'短信模板查询',async()=>{const d:any=await transports.sms(c,s,kind),name=kind==='sign'?'短信签名查询':'短信模板查询';if(d?.code!=='OK'){const code=safeCode(d?.code);add(name,'error','阿里云拒绝查询，请检查凭据和 RAM 的 dysms:QuerySmsSign / dysms:QuerySmsTemplate 权限。返回码：'+code);return}const status=kind==='sign'?d.signStatus:d.templateStatus;add(name,status===1?'success':'warning',status===1?'接口鉴权通过，已查询到审核通过的配置；未发送短信。':'接口鉴权通过，但配置尚未审核通过；请到阿里云控制台核对。')},'阿里云查询失败，请检查网络、AccessKey 和对应查询权限。')))
 }else{
  try{validateProvider(key as any,{...c,enabled:true},s)}catch(e:any){add('配置完整性','error',e.status===400?e.message:'请先完成并保存必填配置。');return {checks,status:'error',testedAt:new Date().toISOString(),durationMs:Date.now()-start}}
  if(key==='wechat')await Promise.all(['web','official','mini'].filter(x=>c[x+'Enabled']).map(channel=>run(({web:'网站扫码登录',official:'公众号网页授权',mini:'小程序登录'} as any)[channel],async()=>{
   const name=({web:'网站扫码登录',official:'公众号网页授权',mini:'小程序登录'} as any)[channel]
   if(channel==='web'){const p=new URLSearchParams({appid:c.webAppId,redirect_uri:c.callbackUrl,response_type:'code',scope:'snsapi_login',state:'connection-test'});const r=await fetch('https://open.weixin.qq.com/connect/qrconnect?'+p,{signal:AbortSignal.timeout(10000),redirect:'error'});await r.body?.cancel();if(!r.ok)throw Object.assign(new Error(),{code:'HTTP_'+r.status});add(name,'warning','微信扫码授权页面可达；网站应用 AppSecret、回调域名和登录全过程仍需在学生端真实扫码验证。');return}
   const d=await transports.json('https://api.weixin.qq.com/cgi-bin/stable_token',{grant_type:'client_credential',appid:c[channel+'AppId'],secret:s[channel+'Secret'],force_refresh:false})
   if(d.access_token&&!d.errcode)add(name,'success','微信接口已连接，AppID / AppSecret 鉴权通过；用户授权及回调仍需实际登录验证。')
   else{const reasons:Record<string,string>={'40013':'AppID 无效','40125':'AppSecret 无效','40164':'服务器 IP 未加入微信白名单','48001':'接口未授权','45009':'接口调用频率超限','-1':'微信服务繁忙'};add(name,'error',(reasons[String(d.errcode)]||'微信拒绝请求，请检查应用配置和平台权限')+'（'+safeCode(String(d.errcode))+'）')}
  },'微信接口请求失败，请检查服务器网络、应用凭据和微信平台权限。')))
  else if(key==='payment')await run('微信支付签名与验签',async()=>{const d=await transports.wx('/v3/pay/transactions/out-trade-no/SXBTEST'+randomBytes(10).toString('hex')+'?mchid='+c.mchId,c,s,undefined,true);if(d.code!=='ORDER_NOT_EXIST')throw 0;add('微信支付签名与验签','success','微信支付已接受带签名的查单请求，返回签名验证通过。测试单号不存在是预期结果，未创建交易。')},'微信支付查单或验签失败，请检查商户号、商户证书序列号、私钥以及微信支付公钥/平台证书。')
  else if(key==='alipay')await run('支付宝签名与验签',async()=>{const d:any=await transports.alipay(c,s,'SXBTEST'+randomBytes(10).toString('hex'));if(d.code!=='40004'||d.subCode!=='ACQ.TRADE_NOT_EXIST'){add('支付宝签名与验签','error','支付宝未返回预期查单结果，请检查应用、密钥及产品权限。返回码：'+safeCode(d.subCode||d.code));return}add('支付宝签名与验签','success',`${c.environment==='sandbox'?'支付宝沙箱':'支付宝正式接口'}已连接，请求鉴权与响应验签通过。未创建交易。`)},'支付宝请求或验签失败，请检查网络、环境、AppID、私钥和支付宝公钥/证书。')
 }
 return {checks,status:checks.some(x=>x.status==='error')?'error':checks.some(x=>x.status==='warning')?'warning':'success',testedAt:new Date().toISOString(),durationMs:Date.now()-start}
}
export const integrationTests=Router()
integrationTests.post('/:key/test',rateLimit({windowMs:60000,limit:8,standardHeaders:true,legacyHeaders:false,message:{message:'测试过于频繁，请稍后重试'}}),async(req,res)=>{
 const key=z.enum(['sms','captcha','wechat','payment','alipay']).parse(req.params.key),b=z.object({revision:z.number().int().positive()}).strict().parse(req.body),row=(await db.query('SELECT * FROM integration_settings WHERE key=$1',[key])).rows[0]
 if(row.revision!==b.revision)fail(409,'配置已变更，请刷新后测试')
 const result=await probeIntegration(key,row.config,row.secrets?JSON.parse(decrypt(row.secrets)):{})
 if((await db.query('SELECT revision FROM integration_settings WHERE key=$1',[key])).rows[0].revision!==b.revision)fail(409,'测试期间配置已变更，请重新测试')
 await db.query('INSERT INTO audit_logs(id,actor_id,action,target_id,details) VALUES($1,$2,$3,$4,$5)',[id(),res.locals.user.id,'integration.test',key,JSON.stringify({revision:b.revision,...result})])
 res.setHeader('Cache-Control','no-store');res.json({...result,revision:b.revision})
})
