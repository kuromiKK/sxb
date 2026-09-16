import {Router} from 'express'
import {z} from 'zod'
import {randomBytes,randomInt} from 'node:crypto'
import {rateLimit} from 'express-rate-limit'
import {db,transaction} from './db.ts'
import {fail,hash,id,encrypt,decrypt,requireUser} from './security.ts'
import * as AliSms from '@alicloud/dysmsapi20170525'
import * as AliOpenAPI from '@alicloud/openapi-client'
import * as AliUtil from '@alicloud/tea-util'
import {captchaVariantIds,captchaVariant,type CaptchaAnswer} from '../../shared/captcha.ts'
import {credentialFlags,providerKeys,saveProvider} from './provider-config.ts'
import {integrationTests} from './integration-tests.ts'
import {workspaceTools} from './workspace-tools.ts'
import {platformEnvironment,isTestMode} from './platform-mode.ts'

export const captchaSchema=z.object({mode:z.enum(['frontend','gocaptcha']),variant:z.enum(captchaVariantIds).default('slide-default'),appearance:z.enum(['light','dark']).default('light'),sms:z.boolean(),handouts:z.boolean(),title:z.string().trim().min(1).max(35),color:z.string().regex(/^#[0-9a-fA-F]{6}$/),expiresSeconds:z.number().int().min(60).max(300)}).strict()
export const smsSchema=z.object({mode:z.enum(['test','aliyun','disabled']),signName:z.string().trim().max(50),templateCode:z.string().trim().max(60),codeVariable:z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,29}$/),codeLength:z.union([z.literal(4),z.literal(6)]),expiresSeconds:z.number().int().min(300).max(600),intervalSeconds:z.number().int().min(60).max(300),dailyLimit:z.number().int().min(1).max(30)}).strict()
export const integrationDefaults={captcha:{mode:'frontend',sms:false,handouts:true,title:'拖动滑块完成拼图',color:'#3569e8',expiresSeconds:120},sms:{mode:'test',signName:'',templateCode:'',codeVariable:'code',codeLength:4,expiresSeconds:300,intervalSeconds:60,dailyLimit:10}}
export async function migrateIntegrations(){await transaction(async c=>{
 await c.query('LOCK TABLE schema_versions IN EXCLUSIVE MODE')
 if((await c.query('SELECT version FROM schema_versions WHERE version=23')).rows.length)return
 await c.query(`CREATE TABLE integration_settings(key text PRIMARY KEY,config jsonb NOT NULL,secrets text,revision integer NOT NULL DEFAULT 1,updated_at timestamptz NOT NULL DEFAULT now())`)
 await c.query(`CREATE TABLE verification_challenges(id text PRIMARY KEY,binding text NOT NULL,scope text NOT NULL,upstream_key text NOT NULL,expires_at timestamptz NOT NULL,claimed boolean NOT NULL DEFAULT false,proof_hash text UNIQUE,proof_expires_at timestamptz)`)
 await c.query('CREATE INDEX verification_expiry ON verification_challenges(expires_at)')
 await c.query(`CREATE TABLE sms_deliveries(id text PRIMARY KEY,phone text NOT NULL,ip_hash text NOT NULL,status text NOT NULL,provider_code text,request_id text,biz_id text,created_at timestamptz NOT NULL DEFAULT now())`)
 await c.query('CREATE INDEX sms_phone_time ON sms_deliveries(phone,created_at)');await c.query('CREATE INDEX sms_ip_time ON sms_deliveries(ip_hash,created_at)')
 for(const [key,value] of Object.entries(integrationDefaults))await c.query('INSERT INTO integration_settings(key,config) VALUES($1,$2)',[key,JSON.stringify(value)])
 await c.query('INSERT INTO schema_versions(version) VALUES(23)')
});await transaction(async c=>{
 await c.query('LOCK TABLE schema_versions IN EXCLUSIVE MODE')
 if((await c.query('SELECT version FROM schema_versions WHERE version=24')).rows.length)return
 await c.query("ALTER TABLE verification_challenges ADD COLUMN variant text NOT NULL DEFAULT 'slide-default'")
 await c.query(`UPDATE integration_settings SET config='{"variant":"slide-default","appearance":"light"}'::jsonb||config WHERE key='captcha'`)
 await c.query('INSERT INTO schema_versions(version) VALUES(24)')
})}
export async function integration(key:'sms'|'captcha'){return (await db.query('SELECT * FROM integration_settings WHERE key=$1',[key])).rows[0]}
async function goRequest(path:string,body?:unknown){
 // Service location is deployment configuration, never a browser-supplied URL.
 const base=process.env.GOCAPTCHA_URL||'http://127.0.0.1:4311'
 try{
  const r=await fetch(base.replace(/\/$/,'')+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(process.env.GOCAPTCHA_API_KEY?{'X-API-Key':process.env.GOCAPTCHA_API_KEY}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(6000),redirect:'error'})
  if(!r.ok)throw new Error('upstream')
  const result:any=await r.json();if(result.code!==200)throw new Error('upstream');return result.data
 }catch{fail(503,'GoCaptcha 服务暂时不可用，请稍后重试；不会自动降低验证方式')}
}
const targetSchema=z.object({scope:z.enum(['sms','handout','admin-login']),target:z.string().min(1).max(250)}).strict()
function binding(scope:string,target:string,req:any){
 if(scope==='admin-login'){if(!/^1\d{10}$/.test(target))fail(400,'请输入11位手机号');return hash('admin-login:'+target+':'+String(req.ip||''))}
 if(scope==='sms'){if(!/^1\d{10}$/.test(target))fail(400,'请输入11位手机号');return hash('sms:'+target)}
 return hash('handout:'+String(req.headers.authorization||'')+':'+target)
}
export async function newChallenge(scope:string,bound:string,config:z.infer<typeof captchaSchema>){
 const variant=captchaVariant(config.variant||'slide-default')
 const data=await goRequest('/api/v1/public/get-data?id='+variant.id)
 if(!data?.captcha_key||!data.master_image_base64?.startsWith('data:image/')||!data.thumb_image_base64?.startsWith('data:image/'))fail(503,'验证码服务返回异常')
 const challengeId=id()
 await db.query('DELETE FROM verification_challenges WHERE expires_at<now()-interval \'10 minutes\'')
 await db.query('INSERT INTO verification_challenges(id,binding,scope,upstream_key,expires_at,variant) VALUES($1,$2,$3,$4,$5,$6)',[challengeId,bound,scope,data.captcha_key,new Date(Date.now()+config.expiresSeconds*1000).toISOString(),variant.id])
 return {challengeId,mode:'gocaptcha',variant:variant.id,type:variant.type,appearance:config.appearance||'light',title:config.title,color:config.color,expiresSeconds:config.expiresSeconds,width:variant.type==='rotate'?300:data.master_width,height:data.master_height,size:data.master_width,data:{image:data.master_image_base64,thumb:data.thumb_image_base64,thumbX:data.display_x||0,thumbY:data.display_y||0,thumbWidth:data.thumb_width,thumbHeight:data.thumb_height,thumbSize:data.thumb_size||0,angle:0}}
}
const coordinate=z.number().finite().min(0).max(1000)
const pointSchema=z.object({x:coordinate,y:coordinate}).strict()
export const captchaAnswerSchema=z.union([pointSchema,z.object({angle:z.number().finite().min(0).max(360)}).strict(),z.object({points:z.array(pointSchema).min(1).max(10)}).strict()])
export async function verifyChallenge(challengeId:string,bound:string,scope:string,answer:CaptchaAnswer){
 const row=(await db.query('UPDATE verification_challenges SET claimed=true WHERE id=$1 AND binding=$2 AND scope=$3 AND NOT claimed AND expires_at>now() RETURNING upstream_key,variant',[challengeId,bound,scope])).rows[0]
 if(!row)fail(400,'验证已失效，请刷新后重试')
 const type=captchaVariant(row.variant).type
 let value:string
 if(type==='click'&&'points' in answer)value=answer.points.flatMap(p=>[Math.round(p.x),Math.round(p.y)]).join(',')
 else if(type==='rotate'&&'angle' in answer)value=String(Math.round(answer.angle))
 else if((type==='slide'||type==='drag')&&'x' in answer)value=`${Math.round(answer.x)},${Math.round(answer.y)}`
 else return fail(400,'验证答案与当前验证方式不匹配，请刷新重试')
 const result=await goRequest('/api/v1/public/check-data',{id:row.variant,captchaKey:row.upstream_key,value})
 if(result!=='ok')fail(400,type==='click'?'点选位置或顺序不正确，请重新验证':type==='rotate'?'旋转角度不正确，请重新验证':'拼图位置不正确，请重新验证')
 const proof=randomBytes(32).toString('hex')
 await db.query("UPDATE verification_challenges SET proof_hash=$2,proof_expires_at=now()+interval '2 minutes' WHERE id=$1",[challengeId,hash(proof)])
 return {proof,expiresIn:120}
}
export async function consumeCaptcha(scope:'sms'|'handout'|'admin-login',target:string,req:any,proof?:string){
 const {config}=await integration('captcha')
 // Administrator login always requires server verification, regardless of student-facing switches.
 if(scope!=='admin-login'&&(config.mode!=='gocaptcha'||!(scope==='sms'?config.sms:config.handouts)))return
 const value=proof||req.headers['x-captcha-proof']
 if(typeof value!=='string'||value.length>200)fail(400,'请先完成安全验证')
 const result=await db.query('DELETE FROM verification_challenges WHERE proof_hash=$1 AND binding=$2 AND scope=$3 AND proof_expires_at>now() RETURNING id',[hash(value),binding(scope,target,req),scope])
 if(!result.rows.length)fail(400,'验证凭据无效或已使用，请重新验证')
}
export const integrationPublic=Router(),integrationAdmin=Router()
integrationAdmin.use(workspaceTools)
integrationAdmin.use(integrationTests)
integrationPublic.use('/verification',rateLimit({windowMs:60_000,limit:40,standardHeaders:true,legacyHeaders:false,message:{message:'验证过于频繁，请稍后重试'}}))
integrationPublic.get('/verification/settings',async(_req,res)=>{const {config}=await integration('captcha'),sms=(await integration('sms')).config,test=await isTestMode();res.setHeader('Cache-Control','no-store');res.json({captcha:config,sms:{mode:!test&&sms.mode==='test'?'disabled':sms.mode,codeLength:sms.codeLength,intervalSeconds:sms.intervalSeconds}})})
// Download challenges require a valid student session; SMS challenges work before login.
integrationPublic.use('/verification',async(req,res,next)=>{if(req.method==='POST'&&req.body?.scope==='handout')return requireUser(req,res,next);next()})
integrationPublic.post('/verification/challenge',async(req,res)=>{const b=targetSchema.parse(req.body),{config}=await integration('captcha');res.setHeader('Cache-Control','no-store');if(b.scope!=='admin-login'&&(config.mode!=='gocaptcha'||!(b.scope==='sms'?config.sms:config.handouts))){res.json({mode:'frontend',required:b.scope==='sms'?config.sms:config.handouts});return}res.json(await newChallenge(b.scope,binding(b.scope,b.target,req),captchaSchema.parse(config)))})
// Accept the previous slider payload so already-open clients keep working during rollout.
const answerFields={challengeId:z.string().uuid(),answer:captchaAnswerSchema.optional(),x:coordinate.optional(),y:coordinate.optional()}
const validAnswer=(b:any)=>Boolean(b.answer)!==(b.x!==undefined&&b.y!==undefined)&&!(b.answer&&(b.x!==undefined||b.y!==undefined))
const checkSchema=targetSchema.extend(answerFields).refine(validAnswer,'请提交一种有效的验证答案')
integrationPublic.post('/verification/check',async(req,res)=>{const b=checkSchema.parse(req.body);res.setHeader('Cache-Control','no-store');res.json(await verifyChallenge(b.challengeId,binding(b.scope,b.target,req),b.scope,b.answer||{x:b.x!,y:b.y!}))})
integrationAdmin.get('/',async(_req,res)=>{const rows=(await db.query('SELECT * FROM integration_settings ORDER BY key')).rows;res.setHeader('Cache-Control','no-store');res.json(rows.map(r=>({key:r.key,config:r.config,revision:r.revision,updatedAt:r.updated_at,hasCredentials:Boolean(r.secrets),credentialFields:credentialFlags(r.key,r.secrets)})))})
integrationAdmin.post('/:key/validate',async(req,res)=>res.json(await saveProvider(z.enum(providerKeys).parse(req.params.key),req.body,res.locals.user.id,true)))
integrationAdmin.put('/:key',async(req,res)=>{
 if(providerKeys.includes(req.params.key as any)){res.json(await saveProvider(z.enum(providerKeys).parse(req.params.key),req.body,res.locals.user.id));return}
 const key=z.enum(['captcha','sms']).parse(req.params.key)
 const b=z.object({revision:z.number().int().positive(),config:key==='captcha'?captchaSchema:smsSchema,accessKeyId:z.string().trim().max(200).optional(),accessKeySecret:z.string().trim().max(200).optional(),clearCredentials:z.boolean().optional()}).strict().parse(req.body)
 await transaction(async c=>{
  // Lock both settings in stable order so live SMS cannot race a captcha downgrade.
  const test=await isTestMode(c,true)
  const rows=(await c.query('SELECT * FROM integration_settings ORDER BY key FOR UPDATE')).rows,current=rows.find(r=>r.key===key)!
  if(current.revision!==b.revision)fail(409,'配置已被修改，请刷新后重试')
  let secrets=current.secrets
  if(b.clearCredentials)secrets=null
  if(b.accessKeyId||b.accessKeySecret){if(!b.accessKeyId||!b.accessKeySecret)fail(400,'更换凭据时请同时填写 AccessKey ID 和 Secret');secrets=encrypt(JSON.stringify({accessKeyId:b.accessKeyId,accessKeySecret:b.accessKeySecret}))}
  const cap=key==='captcha'?b.config:rows.find(r=>r.key==='captcha')!.config,sms=key==='sms'?b.config:rows.find(r=>r.key==='sms')!.config
  if(sms.mode==='aliyun'&&(cap.mode!=='gocaptcha'||!cap.sms))fail(400,'真实短信发送必须开启短信场景的 GoCaptcha 验证')
  if(key==='sms'&&sms.mode==='aliyun'&&(!secrets||!sms.signName||!/^SMS_[A-Za-z0-9]+$/.test(sms.templateCode)))fail(400,'请填写凭据、已审核的短信签名及 SMS_ 开头的模板编号')
  if(!test&&key==='sms'&&sms.mode==='test')fail(400,'生产环境不能启用测试短信')
  if(!test&&key==='captcha'&&(cap.mode!=='gocaptcha'||!cap.sms))fail(400,'生产环境必须开启短信场景的 GoCaptcha 验证')
  await c.query('UPDATE integration_settings SET config=$2,secrets=$3,revision=revision+1,updated_at=now() WHERE key=$1',[key,JSON.stringify(b.config),secrets])
  await c.query('INSERT INTO audit_logs(id,actor_id,action,target_id,details) VALUES($1,$2,$3,$4,$5)',[id(),res.locals.user.id,'integration.configure',key,JSON.stringify({config:b.config,credentialsChanged:Boolean(b.accessKeyId||b.clearCredentials)})])
 });res.json({ok:true})
})
integrationAdmin.post('/captcha/preview',async(req,res)=>{const config=captchaSchema.parse(req.body);res.setHeader('Cache-Control','no-store');res.json(await newChallenge('preview',hash(req.headers.authorization||''),config))})
integrationAdmin.post('/captcha/check',async(req,res)=>{const b=z.object(answerFields).strict().refine(validAnswer,'请提交一种有效的验证答案').parse(req.body);await verifyChallenge(b.challengeId,hash(req.headers.authorization||''),'preview',b.answer||{x:b.x!,y:b.y!});res.json({ok:true})})
integrationAdmin.get('/sms/logs',async(_req,res)=>{const rows=(await db.query("SELECT id,regexp_replace(phone,'(\\d{3})\\d{4}(\\d{4})','\\1****\\2') AS phone,status,provider_code,request_id,created_at FROM sms_deliveries ORDER BY created_at DESC LIMIT 30")).rows;res.json(rows)})

export type SmsInput={phone:string;code:string;config:z.infer<typeof smsSchema>;credentials:{accessKeyId:string;accessKeySecret:string};outId:string}
export async function sendAliyunSms(input:SmsInput){
 const Client=(AliSms.default as any).default||AliSms.default
 const client=new Client(new AliOpenAPI.Config({...input.credentials,endpoint:'dysmsapi.aliyuncs.com',regionId:'cn-hangzhou'}))
 const response=await client.sendSmsWithOptions(new AliSms.SendSmsRequest({phoneNumbers:input.phone,signName:input.config.signName,templateCode:input.config.templateCode,templateParam:JSON.stringify({[input.config.codeVariable]:input.code}),outId:input.outId}),new AliUtil.RuntimeOptions({autoretry:false,connectTimeout:5000,readTimeout:10000}))
 return response.body as {code?:string;requestId?:string;bizId?:string}
}
export async function sendLoginCode(req:any,transport=sendAliyunSms){
 const b=z.object({phone:z.string().regex(/^1\d{10}$/),captchaProof:z.string().max(200).optional()}).strict().parse(req.body)
 const setting=await integration('sms'),config=smsSchema.parse(setting.config)
 const environment=await platformEnvironment()
 if(config.mode==='disabled'||(config.mode==='test'&&environment.mode==='production'))fail(503,'短信服务暂未开启')
 if(config.mode==='aliyun') {const cap=(await integration('captcha')).config;if(!setting.secrets||cap.mode!=='gocaptcha'||!cap.sms)fail(503,'短信服务尚未完成配置')}
 await consumeCaptcha('sms',b.phone,req,b.captchaProof)
 const ipHash=hash(req.ip||'unknown'),deliveryId=id(),code=String(randomInt(10**(config.codeLength-1),10**config.codeLength))
 // Reserve a delivery before the network call, serializing sends across API processes.
 await transaction(async c=>{
  if((await platformEnvironment(c,true)).revision!==environment.revision)fail(409,'运行环境已切换，请重新获取验证码')
  const locked=(await c.query("SELECT revision FROM integration_settings WHERE key='sms' FOR UPDATE")).rows[0]
  if(locked.revision!==setting.revision)fail(409,'短信配置已更新，请重新验证后再试')
  const last=(await c.query('SELECT sent_at FROM login_codes WHERE phone=$1',[b.phone])).rows[0]
  const recent=(await c.query('SELECT created_at FROM sms_deliveries WHERE phone=$1 ORDER BY created_at DESC LIMIT 1',[b.phone])).rows[0]
  if([last?.sent_at,recent?.created_at].some(x=>x&&Date.now()-new Date(x).getTime()<config.intervalSeconds*1000))fail(429,`请在${config.intervalSeconds}秒后重新获取验证码`)
  const count=(await c.query("SELECT count(*)::int AS n FROM sms_deliveries WHERE phone=$1 AND created_at>=date_trunc('day',now() AT TIME ZONE 'Asia/Shanghai') AT TIME ZONE 'Asia/Shanghai'",[b.phone])).rows[0].n
  if(count>=config.dailyLimit)fail(429,'今日短信次数已达上限，请明天再试')
  const ipCount=(await c.query("SELECT count(*)::int AS n FROM sms_deliveries WHERE ip_hash=$1 AND created_at>now()-interval '1 hour'",[ipHash])).rows[0].n
  if(ipCount>=30)fail(429,'当前网络发送过于频繁，请稍后再试')
  await c.query("INSERT INTO sms_deliveries(id,phone,ip_hash,status) VALUES($1,$2,$3,'sending')",[deliveryId,b.phone,ipHash])
 })
 let result:{code?:string;requestId?:string;bizId?:string}={code:'TEST'}
 if(config.mode==='aliyun')try{result=await transport({phone:b.phone,code,config,credentials:JSON.parse(decrypt(setting.secrets)),outId:deliveryId})}catch{result={code:'TRANSPORT_ERROR'}}
 if(config.mode==='aliyun'&&result.code!=='OK'){
  const providerCode=/^[\w.-]{1,100}$/.test(result.code||'')?result.code:'UNKNOWN'
  await db.query("UPDATE sms_deliveries SET status='failed',provider_code=$2,request_id=$3 WHERE id=$1",[deliveryId,providerCode,result.requestId||null])
  fail(503,providerCode==='isv.BUSINESS_LIMIT_CONTROL'?'短信发送过于频繁，请稍后重试':'短信发送失败，请稍后重试或联系客服')
 }
 await transaction(async c=>{
  if((await platformEnvironment(c,true)).revision!==environment.revision)fail(409,'运行环境已切换，请重新获取验证码')
  await c.query(`INSERT INTO login_codes(phone,code_hash,expires_at) VALUES($1,$2,$3) ON CONFLICT(phone) DO UPDATE SET code_hash=$2,expires_at=$3,sent_at=now(),attempts=0`,[b.phone,hash(b.phone+code),new Date(Date.now()+config.expiresSeconds*1000).toISOString()])
  await c.query('UPDATE sms_deliveries SET status=$2,provider_code=$3,request_id=$4,biz_id=$5 WHERE id=$1',[deliveryId,config.mode==='test'?'test':'accepted',result.code,result.requestId||null,result.bizId||null])
 })
 return {expiresIn:config.expiresSeconds,retryAfter:config.intervalSeconds,isTest:config.mode==='test',...(config.mode==='test'?{testCode:code}:{})}
}
