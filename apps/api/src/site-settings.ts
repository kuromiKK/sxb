import {Router} from 'express'
import {z} from 'zod'
import {randomBytes,randomInt} from 'node:crypto'
import {isDeepStrictEqual} from 'node:util'
import {db,transaction,type Queryable} from './db.ts'
import {fail,id,hash,session} from './security.ts'
import {messageDocument,messageHtml} from '../../shared/message-document.ts'
import {lockResourceReferences,validateEditorImages} from './editor-images.ts'
import {platformEnvironment,isTestMode} from './platform-mode.ts'

const emptyDocument={type:'doc',content:[{type:'paragraph'}]}
const paragraph=(text:string)=>({type:'doc',content:[{type:'paragraph',content:[{type:'text',text}]}]})
const protocolTitles={agreement:'用户服务协议',privacy:'隐私政策'}
const initialProtocols={agreement:'欢迎使用上行宝。使用本产品前，请仔细阅读并理解本协议。上行宝为用户提供考试知识点、课程、题库、学习计划以及相关学习服务。用户应妥善保管账号信息，不得以任何方式转让、出租或共享付费权益。平台展示的学习数据用于帮助用户安排复习，不构成考试通过承诺。课程、题目、讲义及其他内容的知识产权归权利人所有，未经许可不得复制、传播或用于商业用途。',privacy:'上行宝重视用户个人信息和学习数据的保护。为完成登录、同步学习进度、保存错题收藏和处理订单，我们会在必要范围内处理手机号、账号标识、学习记录及订单信息。我们不会向无关第三方出售个人信息。用户可以申请查询、更正或删除相关信息。正式上线前，隐私政策将根据实际接入的服务和权限进一步完善。'}
export const siteDefaults={basic:{name:'上行宝',logo:'',favicon:'',siteDomain:'http://127.0.0.1:5174'},customer:{name:'平台客服',qrCode:'',contact:'',hours:'',description:'如需帮助，请联系平台客服'},search:{enabled:true,placeholder:'搜索知识点、精品课、常见问题',types:['knowledge','course','faq']},about:{document:emptyDocument,operator:'',copyright:'',filing:''}}
export async function migrateSiteSettings(){
 await transaction(async c=>{
  await c.query("SELECT pg_advisory_xact_lock(hashtext('site-settings-schema'))")
  if((await c.query('SELECT 1 FROM schema_versions WHERE version=22')).rows.length)return
  await c.query(`CREATE TABLE site_preferences (key text PRIMARY KEY,revision integer NOT NULL DEFAULT 1,draft jsonb NOT NULL,published jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now(),published_at timestamptz NOT NULL DEFAULT now(),actor_id text REFERENCES users(id))`)
  await c.query(`CREATE TABLE site_protocols (kind text PRIMARY KEY CHECK(kind IN ('agreement','privacy')),title text NOT NULL,draft_document jsonb NOT NULL,draft_revision integer NOT NULL DEFAULT 1,published_version integer NOT NULL DEFAULT 1,updated_at timestamptz NOT NULL DEFAULT now())`)
  await c.query(`CREATE TABLE site_protocol_versions (kind text NOT NULL REFERENCES site_protocols(kind),version integer NOT NULL,document jsonb NOT NULL,published_at timestamptz NOT NULL DEFAULT now(),actor_id text REFERENCES users(id),PRIMARY KEY(kind,version))`)
  await c.query(`CREATE TABLE user_protocol_consents (user_id text NOT NULL REFERENCES users(id),kind text NOT NULL,version integer NOT NULL,accepted_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,kind,version),FOREIGN KEY(kind,version) REFERENCES site_protocol_versions(kind,version))`)
  await c.query(`CREATE TABLE protocol_login_challenges (token_hash text PRIMARY KEY,phone text NOT NULL,expires_at timestamptz NOT NULL,used_at timestamptz)`)
  const domain=(await c.query("SELECT value FROM system_settings WHERE key='site_domain'")).rows[0]?.value
  for(const [key,value] of Object.entries(siteDefaults)){const data=JSON.stringify(key==='basic'?{...value,siteDomain:domain||siteDefaults.basic.siteDomain}:value);await c.query('INSERT INTO site_preferences(key,draft,published) VALUES($1,$2,$2)',[key,data])}
  for(const kind of ['agreement','privacy'] as const){const doc=JSON.stringify(paragraph(initialProtocols[kind]));await c.query('INSERT INTO site_protocols(kind,title,draft_document) VALUES($1,$2,$3)',[kind,protocolTitles[kind],doc]);await c.query('INSERT INTO site_protocol_versions(kind,version,document) VALUES($1,1,$2)',[kind,doc])}
  await c.query('INSERT INTO schema_versions(version) VALUES(22)')
 })
}
const image=z.string().max(2000).refine(v=>!v||/^\/api\/message-images\/[\w-]+$/.test(v),'图片请通过上传登记资源')
const preferenceSchemas={
 basic:z.object({name:z.string().trim().min(1,'请填写平台名称').max(30),logo:image,favicon:image,siteDomain:z.string().url().max(2000).refine(v=>{try{const u=new URL(v);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password&&u.pathname==='/'&&!u.search&&!u.hash}catch{return false}},'请填写不带路径的 HTTP/HTTPS 网站域名')}).strict(),
 customer:z.object({name:z.string().trim().min(1).max(50),qrCode:image,contact:z.string().trim().max(100),hours:z.string().trim().max(100),description:z.string().trim().max(500)}).strict(),
 search:z.object({enabled:z.boolean(),placeholder:z.string().trim().min(1).max(60),types:z.array(z.enum(['knowledge','course','faq'])).max(3).refine(v=>new Set(v).size===v.length,'搜索类型不可重复')}).strict().refine(v=>!v.enabled||v.types.length>0,'开启搜索时至少选择一种内容'),
 about:z.object({document:z.any(),operator:z.string().trim().max(100),copyright:z.string().trim().max(200),filing:z.string().trim().max(100)}).strict()
}
function document(value:any,required=false){try{const result=messageDocument(value);if(required&&!result.text)fail(400,'请填写协议正文');return result.document}catch(e:any){fail(400,e.message)}}
async function settingsAudit(c:Queryable,actor:string,action:string,target:string,details:any){await c.query('INSERT INTO audit_logs(id,actor_id,action,target_id,details) VALUES($1,$2,$3,$4,$5)',[id(),actor,action,target,JSON.stringify(details)])}
export async function publishedPreferences(c:Queryable=db){return Object.fromEntries((await c.query('SELECT key,published FROM site_preferences')).rows.map(r=>[r.key,r.published])) as typeof siteDefaults}
export async function publishedProtocols(c:Queryable=db){return (await c.query('SELECT p.kind,p.title,v.version,v.document,v.published_at FROM site_protocols p JOIN site_protocol_versions v ON v.kind=p.kind AND v.version=p.published_version ORDER BY p.kind')).rows.map(r=>({kind:r.kind,title:r.title,version:r.version,html:messageHtml(r.document),publishedAt:r.published_at}))}
export const sitePublic=Router(),siteAdmin=Router()
sitePublic.get('/site-settings',async(_req,res)=>{res.setHeader('Cache-Control','no-store');const data=await publishedPreferences();res.json({...data,environment:(await platformEnvironment()).mode,about:{...data.about,html:messageHtml(data.about.document)},protocols:await publishedProtocols()})})
siteAdmin.get('/',async(_req,res)=>res.json({preferences:(await db.query('SELECT * FROM site_preferences ORDER BY key')).rows,protocols:(await db.query(`SELECT p.*,v.document AS published_document,v.published_at FROM site_protocols p JOIN site_protocol_versions v ON v.kind=p.kind AND v.version=p.published_version ORDER BY p.kind`)).rows}))
siteAdmin.put('/preferences/:key',async(req,res)=>{
 const key=z.enum(['basic','customer','search','about']).parse(req.params.key),input=z.object({revision:z.number().int().positive(),value:z.any()}).strict().parse(req.body)
 const value:any=preferenceSchemas[key].parse(input.value);if(key==='about')value.document=document(value.document)
 await transaction(async c=>{await lockResourceReferences(c);await validateEditorImages(value,c);const result=await c.query('UPDATE site_preferences SET draft=$3,revision=revision+1,updated_at=now(),actor_id=$4 WHERE key=$1 AND revision=$2 RETURNING revision',[key,input.revision,JSON.stringify(value),res.locals.user.id]);if(!result.rows.length)fail(409,'设置已被修改，请刷新后重试');await settingsAudit(c,res.locals.user.id,'settings.draft',key,{revision:result.rows[0].revision})})
 res.json({ok:true})
})
siteAdmin.post('/preferences/:key/publish',async(req,res)=>{
 const key=z.enum(['basic','customer','search','about']).parse(req.params.key),b=z.object({revision:z.number().int().positive()}).strict().parse(req.body)
 await transaction(async c=>{const test=await isTestMode(c,true);await lockResourceReferences(c);const row=(await c.query('SELECT * FROM site_preferences WHERE key=$1 FOR UPDATE',[key])).rows[0];if(row.revision!==b.revision)fail(409,'设置已被修改，请刷新后重试');if(key==='basic'&&!test&&!row.draft.siteDomain.startsWith('https://'))fail(400,'生产环境的前端访问域名必须使用 HTTPS');await validateEditorImages(row.draft,c);await c.query('UPDATE site_preferences SET published=draft,revision=revision+1,published_at=now(),updated_at=now(),actor_id=$2 WHERE key=$1',[key,res.locals.user.id]);if(key==='basic')await c.query("UPDATE system_settings SET value=$1,updated_at=now(),actor_id=$2 WHERE key='site_domain'",[row.draft.siteDomain,res.locals.user.id]);await settingsAudit(c,res.locals.user.id,'settings.publish',key,{revision:row.revision+1})})
 res.json({ok:true})
})
siteAdmin.get('/protocols/:kind/versions',async(req,res)=>{const kind=z.enum(['agreement','privacy']).parse(req.params.kind);res.json((await db.query('SELECT v.*,u.nickname AS publisher FROM site_protocol_versions v LEFT JOIN users u ON u.id=v.actor_id WHERE kind=$1 ORDER BY version DESC',[kind])).rows)})
siteAdmin.put('/protocols/:kind',async(req,res)=>{
 const kind=z.enum(['agreement','privacy']).parse(req.params.kind),b=z.object({revision:z.number().int().positive(),document:z.any()}).strict().parse(req.body),doc=document(b.document)
 await transaction(async c=>{await lockResourceReferences(c);await validateEditorImages(doc,c);const row=await c.query('UPDATE site_protocols SET draft_document=$3,draft_revision=draft_revision+1,updated_at=now() WHERE kind=$1 AND draft_revision=$2 RETURNING draft_revision',[kind,b.revision,JSON.stringify(doc)]);if(!row.rows.length)fail(409,'协议草稿已被修改，请重新加载');await settingsAudit(c,res.locals.user.id,'protocol.draft',kind,{revision:row.rows[0].draft_revision})});res.json({ok:true})
})
export async function lockProtocols(c:Queryable){await c.query("SELECT pg_advisory_xact_lock(hashtext('published-protocols'))")}
siteAdmin.post('/protocols/:kind/publish',async(req,res)=>{
 const kind=z.enum(['agreement','privacy']).parse(req.params.kind),b=z.object({revision:z.number().int().positive()}).strict().parse(req.body)
 const version=await transaction(async c=>{await lockResourceReferences(c);await lockProtocols(c);const row=(await c.query('SELECT * FROM site_protocols WHERE kind=$1 FOR UPDATE',[kind])).rows[0];if(row.draft_revision!==b.revision)fail(409,'协议草稿已被修改，请重新加载');const doc=document(row.draft_document,true);await validateEditorImages(doc,c);const old=(await c.query('SELECT document FROM site_protocol_versions WHERE kind=$1 AND version=$2',[kind,row.published_version])).rows[0];if(isDeepStrictEqual(old.document,doc))fail(400,'协议内容没有变化，无需发布新版本');const next=row.published_version+1;await c.query('INSERT INTO site_protocol_versions(kind,version,document,actor_id) VALUES($1,$2,$3,$4)',[kind,next,JSON.stringify(doc),res.locals.user.id]);await c.query('UPDATE site_protocols SET published_version=$2,draft_revision=draft_revision+1,updated_at=now() WHERE kind=$1',[kind,next]);await settingsAudit(c,res.locals.user.id,'protocol.publish',kind,{version:next});return next});res.json({version})
})

// The SMS has already been verified before issuing this one-use consent challenge.
export async function requireProtocolConsent(c:Queryable,phone:string,userId?:string){
 await lockProtocols(c)
 const protocols=await publishedProtocols(c)
 const accepted=userId?(await c.query('SELECT kind,version FROM user_protocol_consents WHERE user_id=$1',[userId])).rows:[]
 const changed=protocols.filter(p=>!accepted.some(a=>a.kind===p.kind&&a.version===p.version))
 if(!changed.length)return null
 await c.query('DELETE FROM protocol_login_challenges WHERE expires_at<=now()')
 const challenge=randomBytes(32).toString('hex')
 await c.query("INSERT INTO protocol_login_challenges(token_hash,phone,expires_at) VALUES($1,$2,now()+interval '5 minutes')",[hash(challenge),phone])
 return {consentRequired:true,challenge,protocols,changedKinds:changed.map(p=>p.kind),expiresIn:300}
}
export async function loginStudent(c:Queryable,phone:string){
 let user=(await c.query("SELECT id,phone,nickname,role,enabled FROM users WHERE phone=$1 AND account_kind='student'",[phone])).rows[0]
 if(user&&!user.enabled)fail(403,'账号已停用，请联系客服')
 if(!user)user=(await c.query("INSERT INTO users(id,phone,nickname,invite_code,is_test_data) VALUES($1,$2,$3,$4,$5) ON CONFLICT(phone,account_kind) DO UPDATE SET phone=excluded.phone RETURNING id,phone,nickname,role,enabled",[id(),phone,`学生${phone.slice(-4)}`,String(randomInt(10000000,99999999)),await isTestMode(c)])).rows[0]
 if(!user.enabled)fail(403,'账号已停用，请联系客服')
 await c.query('UPDATE users SET last_login_at=now() WHERE id=$1',[user.id]);return user
}
sitePublic.post('/auth/protocol-consent',async(req,res)=>{
 const b=z.object({challenge:z.string().regex(/^[a-f0-9]{64}$/),confirmed:z.literal(true),versions:z.array(z.object({kind:z.enum(['agreement','privacy']),version:z.number().int().positive()}).strict()).length(2)}).strict().parse(req.body)
 const result=await transaction(async c=>{
  await platformEnvironment(c,true)
  await lockProtocols(c)
  const challenge=(await c.query('SELECT * FROM protocol_login_challenges WHERE token_hash=$1 FOR UPDATE',[hash(b.challenge)])).rows[0]
  if(!challenge||challenge.used_at||Date.parse(challenge.expires_at)<=Date.now())fail(400,'登录确认已过期，请重新获取验证码')
  const current=await publishedProtocols(c)
  if(new Set(b.versions.map(p=>p.kind)).size!==current.length||current.some(p=>!b.versions.some(v=>v.kind===p.kind&&v.version===p.version)))fail(409,'协议已更新，请重新阅读并确认最新版本')
  const u=await loginStudent(c,challenge.phone)
  for(const p of current)await c.query('INSERT INTO user_protocol_consents(user_id,kind,version) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[u.id,p.kind,p.version])
  await c.query('UPDATE protocol_login_challenges SET used_at=now() WHERE token_hash=$1',[hash(b.challenge)])
  return {user:u,token:await session(u.id,'student',c)}
 });res.json(result)
})
