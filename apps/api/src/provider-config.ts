import {z} from 'zod'
import {createPrivateKey,createPublicKey,X509Certificate,sign,verify} from 'node:crypto'
import {db,transaction} from './db.ts'
import {decrypt,encrypt,fail,id} from './security.ts'
import {providerDefinitions,type ProviderKey} from '../../shared/provider-settings.ts'
export const providerKeys=['wechat','payment','alipay'] as const
export async function migrateProviders(){await transaction(async c=>{
 await c.query('LOCK TABLE schema_versions IN EXCLUSIVE MODE')
 if((await c.query('SELECT version FROM schema_versions WHERE version=25')).rows.length)return
 for(const key of providerKeys)await c.query('INSERT INTO integration_settings(key,config) VALUES($1,$2) ON CONFLICT DO NOTHING',[key,JSON.stringify(providerDefinitions[key].defaults)])
 await c.query(`CREATE TABLE wechat_identities(app_id text NOT NULL,openid text NOT NULL,user_id text NOT NULL REFERENCES users(id),PRIMARY KEY(app_id,openid),UNIQUE(app_id,user_id))`)
 await c.query(`CREATE TABLE wechat_tickets(token_hash text PRIMARY KEY,kind text NOT NULL,data jsonb NOT NULL,expires_at timestamptz NOT NULL)`)
 await c.query('CREATE INDEX wechat_tickets_expiry ON wechat_tickets(expires_at)')
 await c.query(`CREATE TABLE provider_payments(ref text PRIMARY KEY,order_id text NOT NULL REFERENCES orders(id),provider text NOT NULL,channel text NOT NULL,config jsonb NOT NULL,secrets text NOT NULL,snapshot jsonb NOT NULL,amount_cents integer NOT NULL,expires_at timestamptz NOT NULL,transaction_id text,processed_at timestamptz,issue text,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(provider,transaction_id))`)
 await c.query('CREATE INDEX provider_payments_order ON provider_payments(order_id)')
 await c.query('INSERT INTO schema_versions(version) VALUES(25)')
})}
export async function providerSetting(key:ProviderKey){const r=(await db.query('SELECT * FROM integration_settings WHERE key=$1',[key])).rows[0];return {...r,credentials:r.secrets?JSON.parse(decrypt(r.secrets)):{}}}
export function credentialFlags(key:string,secrets:string|null){if(!providerKeys.includes(key as ProviderKey))return {};const s=secrets?JSON.parse(decrypt(secrets)):{};return Object.fromEntries(providerDefinitions[key as ProviderKey].fields.filter(f=>f.secret).map(f=>[f.key,Boolean(s[f.key])]))}
function https(value:string,label:string,path?:string){let u:URL;try{u=new URL(value)}catch{return fail(400,label+'需要填写完整 HTTPS 地址')};if(u.protocol!=='https:'||u.username||u.password||(path&&u.pathname!==path)||u.search||(path&&u.hash))fail(400,label+'地址无效'+(path?'，路径必须为 '+path:''))}
function pem(value:string,label:string,privateKey=false){try{const k=privateKey?createPrivateKey(value):createPublicKey(value);if(k.asymmetricKeyType!=='rsa'||(k.asymmetricKeyDetails?.modulusLength||0)<2048)throw 0;return k}catch{fail(400,label+'必须是有效的 RSA 2048 位或以上 PEM 密钥/证书')}}
export function validateProvider(key:ProviderKey,input:unknown,s:Record<string,string>){
 const def=providerDefinitions[key],shape:Record<string,z.ZodType>={enabled:z.boolean()}
 for(const f of def.fields)if(!f.secret)shape[f.key]=f.toggle?z.boolean():f.options?z.enum(f.options.map(x=>x.value) as [string,...string[]]):z.string().trim().max(2048)
 const c:any=z.object(shape).strict().parse(input)
 const need=(name:string,label=name)=>{if(!c[name]&&!s[name])fail(400,'请填写'+label)}
 for(const f of def.fields.filter(f=>f.secret))if(s[f.key]&&['privateKey','platformKey','alipayPublicKey'].includes(f.key))pem(s[f.key],f.label,f.key==='privateKey')
 for(const name of ['appCert','alipayCert','rootCert'])if(s[name])try{new X509Certificate(s[name])}catch{fail(400,'证书 PEM 格式无效：'+name)}
 if(!c.enabled)return c
 if(key==='wechat'){
  if(!['web','official','mini'].some(x=>c[x+'Enabled']))fail(400,'至少启用一种微信登录方式')
  for(const x of ['web','official','mini'])if(c[x+'Enabled']){need(x+'AppId');need(x+'Secret');if(!/^wx[\da-f]{16}$/i.test(c[x+'AppId']))fail(400,'微信 AppID 格式无效')}
  if(c.webEnabled||c.officialEnabled){https(c.callbackUrl,'授权回调','/api/auth/wechat/callback');https(c.returnUrl,'登录返回')}
 }else{
  need('appId','AppID');need('privateKey','应用/商户私钥');https(c.notifyUrl,'支付通知',key==='payment'?'/api/payments/wechat/notify':'/api/payments/alipay/notify')
  if(key==='payment'){
   for(const n of ['mchId','serialNo','platformSerial','platformKey','apiV3Key'])need(n)
   if(!/^\d{6,20}$/.test(c.mchId)||!/^wx[\da-f]{16}$/i.test(c.appId)||!/^\w{32}$/.test(s.apiV3Key)||!/^\w{8,80}$/.test(c.serialNo))fail(400,'请核对商户号、AppID、证书序列号和 32 位 API v3 密钥')
   if(!['native','h5','jsapi','mini'].some(x=>c[x+'Enabled']))fail(400,'至少启用一种支付方式')
   if(c.miniEnabled&&!/^wx[\da-f]{16}$/i.test(c.miniAppId))fail(400,'请填写支付小程序 AppID')
   if(c.h5Enabled){need('h5Name','H5 网站名称');https(c.h5Url,'H5 网站')}
   if(c.verifyMode==='certificate'){let cert:X509Certificate;try{cert=new X509Certificate(s.platformKey)}catch{return fail(400,'请填写微信支付平台证书')};if(cert.serialNumber.toUpperCase()!==c.platformSerial.toUpperCase()||Date.parse(cert.validTo)<=Date.now())fail(400,'平台证书序列号不匹配或证书已过期')}
   else if(!/^PUB_KEY_ID_\w+$/.test(c.platformSerial))fail(400,'微信支付公钥 ID 应以 PUB_KEY_ID_ 开头')
  }else{
   if(!/^\d{16}$/.test(c.appId)||!/^2088\d{12}$/.test(c.sellerId))fail(400,'请核对支付宝 AppID 和收款账号 PID')
   if(!c.pageEnabled&&!c.wapEnabled)fail(400,'至少启用一种支付宝支付方式')
   https(c.returnUrl,'支付返回')
   if(c.keyMode==='publicKey')need('alipayPublicKey','支付宝公钥')
   else{for(const n of ['appCert','alipayCert','rootCert'])need(n);const signature=sign('RSA-SHA256',Buffer.from('key-check'),s.privateKey);if(!verify('RSA-SHA256',Buffer.from('key-check'),s.appCert,signature))fail(400,'应用公钥证书与应用私钥不匹配')}
  }
 }
 return c
}
export async function saveProvider(key:ProviderKey,body:unknown,actor:string,dryRun=false){
 const b=z.object({revision:z.number().int().positive(),config:z.unknown(),credentials:z.record(z.string(),z.string().trim().max(24000)).default({}),clearFields:z.array(z.string()).default([])}).strict().parse(body)
 return transaction(async c=>{
  const r=(await c.query('SELECT * FROM integration_settings WHERE key=$1 FOR UPDATE',[key])).rows[0]
  if(r.revision!==b.revision)fail(409,'配置已被修改，请刷新后重试')
  const s:Record<string,string>=r.secrets?JSON.parse(decrypt(r.secrets)):{},allowed=providerDefinitions[key].fields.filter(f=>f.secret).map(f=>f.key)
  for(const n of [...Object.keys(b.credentials),...b.clearFields])if(!allowed.includes(n))fail(400,'未知凭据字段')
  for(const n of b.clearFields)delete s[n]
  for(const [n,v]of Object.entries(b.credentials))if(v)s[n]=v
  const config=validateProvider(key,dryRun?{...(b.config as any),enabled:true}:b.config,s)
  if(dryRun)return {ok:true,message:'必填项与密钥格式检查通过；尚未请求微信或支付宝，不能替代实际联调。'}
  await c.query('UPDATE integration_settings SET config=$2,secrets=$3,revision=revision+1,updated_at=now() WHERE key=$1',[key,JSON.stringify(config),encrypt(JSON.stringify(s))])
  await c.query('INSERT INTO audit_logs(id,actor_id,action,target_id,details) VALUES($1,$2,$3,$4,$5)',[id(),actor,'integration.configure',key,JSON.stringify({config,credentialsChanged:Object.keys(b.credentials),cleared:b.clearFields})])
  return {ok:true}
 })
}
