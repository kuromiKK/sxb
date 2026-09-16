import {Router} from 'express'
import {rateLimit} from 'express-rate-limit'
import {z} from 'zod'
import {db,transaction,type Queryable} from './db.ts'
import {fail,id,passwordValid} from './security.ts'

export type PlatformMode='test'|'production'
export async function migratePlatformMode(){
 await db.query(`CREATE TABLE IF NOT EXISTS platform_environment (id integer PRIMARY KEY CHECK(id=1),mode text NOT NULL CHECK(mode IN ('test','production')),revision integer NOT NULL DEFAULT 1,updated_at timestamptz NOT NULL DEFAULT now(),actor_id text REFERENCES users(id))`)
 await db.query('INSERT INTO platform_environment(id,mode) VALUES(1,$1) ON CONFLICT DO NOTHING',[process.env.APP_MODE==='production'?'production':'test'])
}
// No process-local cache: every API worker observes the same published mode.
// Sensitive transactions acquire this lock before any user/order/config locks.
export async function platformEnvironment(c:Queryable=db,lock=false){
 const row=(await c.query('SELECT mode,revision,updated_at FROM platform_environment WHERE id=1'+(lock?' FOR SHARE':''))).rows[0]
 if(!row)fail(503,'运行环境配置未初始化')
 return row as {mode:PlatformMode;revision:number;updated_at:string}
}
export async function isTestMode(c:Queryable=db,lock=false){return (await platformEnvironment(c,lock)).mode==='test'}
export async function productionIssues(c:Queryable=db){
 const issues:string[]=[]
 if(process.env.APP_MODE!=='production')issues.push('服务器 APP_MODE 必须设为 production 并重启服务，以启用启动安全检查')
 if(!process.env.DATABASE_URL)issues.push('必须使用独立 PostgreSQL 数据库')
 if(!/^[a-fA-F0-9]{64}$/.test(process.env.SECRET_KEY||''))issues.push('必须配置独立的 64 位十六进制 SECRET_KEY')
 const basic=(await c.query("SELECT published FROM site_preferences WHERE key='basic'")).rows[0]?.published
 for(const [label,url] of [['前端访问域名',basic?.siteDomain],['后台访问地址',process.env.ADMIN_ORIGIN],['用户端访问地址',process.env.USER_ORIGIN]]){
  try{if(new URL(url||'').protocol!=='https:')throw new Error()}catch{issues.push(label+'必须使用 HTTPS')}
 }
 const captcha=(await c.query("SELECT config FROM integration_settings WHERE key='captcha'")).rows[0]?.config
 if(captcha?.mode!=='gocaptcha'||!captcha?.sms)issues.push('验证码必须使用 GoCaptcha 并开启短信场景验证')
 if(!process.env.GOCAPTCHA_API_KEY)issues.push('必须为 GoCaptcha 服务配置访问密钥')
 return issues
}
export const platformModeAdmin=Router()
platformModeAdmin.get('/',async(_req,res)=>res.set('Cache-Control','no-store').json({...await platformEnvironment(),productionIssues:await productionIssues()}))
platformModeAdmin.put('/',rateLimit({windowMs:60000,limit:5,standardHeaders:true,legacyHeaders:false,message:{message:'验证过于频繁，请稍后重试'}}),async(req,res)=>{
 const b=z.object({mode:z.enum(['test','production']),revision:z.number().int().positive(),password:z.string().min(1).max(200),confirmation:z.string()}).strict().parse(req.body)
 if(b.confirmation!==(b.mode==='test'?'切换测试环境':'切换生产环境'))fail(400,'请确认目标运行环境')
 const result=await transaction(async c=>{
  const old=(await c.query('SELECT * FROM platform_environment WHERE id=1 FOR UPDATE')).rows[0]
  if(old.revision!==b.revision)fail(409,'运行环境已被其他管理员修改，请刷新后重试')
  const actor=(await c.query("SELECT password_hash FROM users WHERE id=$1 AND account_kind='admin' AND enabled AND admin_deleted_at IS NULL FOR SHARE",[res.locals.user.id])).rows[0]
  if(!actor||!passwordValid(b.password,actor.password_hash||''))fail(400,'管理员密码不正确')
  if(old.mode===b.mode)return {mode:old.mode,revision:old.revision}
  if(b.mode==='production'){const issues=await productionIssues(c);if(issues.length)fail(400,'暂不能切换生产环境：'+issues.join('；'))}
  // Invalidate credentials issued under the previous mode, preserving all business data.
  await c.query('DELETE FROM login_codes')
  await c.query('DELETE FROM protocol_login_challenges')
  await c.query("DELETE FROM sessions WHERE audience='student'")
  const row=(await c.query('UPDATE platform_environment SET mode=$1,revision=revision+1,updated_at=now(),actor_id=$2 WHERE id=1 RETURNING mode,revision',[b.mode,res.locals.user.id])).rows[0]
  await c.query('INSERT INTO audit_logs(id,actor_id,action,target_id,details) VALUES($1,$2,$3,$4,$5)',[id(),res.locals.user.id,'settings.environment','basic',JSON.stringify({before:old.mode==='test'?'测试环境':'生产环境',after:b.mode==='test'?'测试环境':'生产环境',revision:row.revision})])
  return row
 })
 res.json(result)
})
