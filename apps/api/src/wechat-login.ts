import {Router} from 'express'
import {z} from 'zod'
import {randomBytes} from 'node:crypto'
import {db,transaction} from './db.ts'
import {fail,hash,requireUser,session} from './security.ts'
import {providerSetting} from './provider-config.ts'
import {requireProtocolConsent,loginStudent} from './site-settings.ts'
import {platformEnvironment} from './platform-mode.ts'
export const wechatLogin=Router()
const ticketSchema=z.string().regex(/^[a-f0-9]{64}$/)
async function ticket(kind:string,data:any){const raw=randomBytes(32).toString('hex');await db.query('DELETE FROM wechat_tickets WHERE expires_at<now()');await db.query("INSERT INTO wechat_tickets(token_hash,kind,data,expires_at) VALUES($1,$2,$3,now()+interval '5 minutes')",[hash(raw),kind,JSON.stringify(data)]);return raw}
async function exchange(channel:string,code:string){const {config:c,credentials:s}=await providerSetting('wechat');if(!c.enabled||!c[channel+'Enabled'])fail(503,'该微信登录方式尚未开启');const appId=c[channel+'AppId'],params=new URLSearchParams({appid:appId,secret:s[channel+'Secret'],grant_type:'authorization_code',...(channel==='mini'?{js_code:code}:{code})});let d:any;try{const r=await fetch('https://api.weixin.qq.com/'+(channel==='mini'?'sns/jscode2session':'sns/oauth2/access_token')+'?'+params,{signal:AbortSignal.timeout(10000),redirect:'error'});d=await r.json();if(!r.ok||d.errcode||!d.openid)throw 0}catch{fail(502,'微信授权失败或已过期，请重新登录')};return {appId,openid:d.openid}}
async function result(identity:{appId:string;openid:string}){
 const u=(await db.query('SELECT u.id,u.phone FROM wechat_identities w JOIN users u ON u.id=w.user_id WHERE w.app_id=$1 AND w.openid=$2',[identity.appId,identity.openid])).rows[0]
 if(!u)return {bindingRequired:true,bindingTicket:await ticket('bind',identity)}
 const r=await transaction(async c=>{await platformEnvironment(c,true);const user=await loginStudent(c,u.phone);const consent=await requireProtocolConsent(c,u.phone,user.id);return consent?{consent}:{user,token:await session(user.id,'student',c)}})
 if(r.consent)return r.consent
 return {user:r.user,token:r.token}
}
wechatLogin.get('/auth/wechat/settings',async(_req,res)=>{const {config:c}=await providerSetting('wechat');res.setHeader('Cache-Control','no-store');res.json({web:c.enabled&&c.webEnabled,official:c.enabled&&c.officialEnabled,mini:c.enabled&&c.miniEnabled})})
wechatLogin.post('/auth/wechat/start',async(req,res)=>{
 const b=z.object({channel:z.enum(['web','official']),verifier:ticketSchema}).strict().parse(req.body),{config:c}=await providerSetting('wechat')
 if(!c.enabled||!c[b.channel+'Enabled'])fail(503,'该微信登录方式尚未开启')
 const state=await ticket('state',{channel:b.channel,verifierHash:hash(b.verifier),returnUrl:c.returnUrl}),p=new URLSearchParams({appid:c[b.channel+'AppId'],redirect_uri:c.callbackUrl,response_type:'code',scope:b.channel==='web'?'snsapi_login':'snsapi_base',state})
 res.json({url:'https://open.weixin.qq.com/connect/'+(b.channel==='web'?'qrconnect':'oauth2/authorize')+'?'+p+'#wechat_redirect'})
})
wechatLogin.get('/auth/wechat/callback',async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer')
 const b=z.object({state:ticketSchema,code:z.string().min(1).max(300)}).parse(req.query)
 const r=(await db.query("DELETE FROM wechat_tickets WHERE token_hash=$1 AND kind='state' AND expires_at>now() RETURNING data",[hash(b.state)])).rows[0]
 if(!r)fail(400,'微信授权状态已过期，请重新发起登录')
 const identity=await exchange(r.data.channel,b.code),t=await ticket('result',{...identity,verifierHash:r.data.verifierHash}),u=new URL(r.data.returnUrl)
 // The fragment never contains an application session or an OpenID.
 const fragment=u.hash.replace(/^#/,'');u.hash=fragment+(fragment.includes('?')?'&':'?')+'wechatResult='+t
 res.redirect(303,u.toString())
})
wechatLogin.post('/auth/wechat/finish',async(req,res)=>{const b=z.object({ticket:ticketSchema,verifier:ticketSchema}).strict().parse(req.body);const r=(await db.query("DELETE FROM wechat_tickets WHERE token_hash=$1 AND kind='result' AND data->>'verifierHash'=$2 AND expires_at>now() RETURNING data",[hash(b.ticket),hash(b.verifier)])).rows[0];if(!r)fail(400,'微信登录已过期，请重新登录');res.setHeader('Cache-Control','no-store');res.json(await result(r.data))})
wechatLogin.post('/auth/wechat/mini',async(req,res)=>{const b=z.object({code:z.string().min(1).max(300)}).strict().parse(req.body);res.setHeader('Cache-Control','no-store');res.json(await result(await exchange('mini',b.code)))})
wechatLogin.post('/auth/wechat/bind',requireUser,async(req,res)=>{
 const b=z.object({ticket:ticketSchema}).strict().parse(req.body),user=res.locals.user
 if(user.account_kind==='admin'||user.role==='superadmin')fail(403,'请使用学生手机号登录后绑定')
 await transaction(async c=>{const r=(await c.query("DELETE FROM wechat_tickets WHERE token_hash=$1 AND kind='bind' AND expires_at>now() RETURNING data",[hash(b.ticket)])).rows[0];if(!r)fail(400,'微信绑定授权已过期，请重新授权');const old=(await c.query('SELECT user_id FROM wechat_identities WHERE app_id=$1 AND openid=$2',[r.data.appId,r.data.openid])).rows[0];if(old&&old.user_id!==user.id)fail(409,'此微信已绑定其他账号');await c.query('INSERT INTO wechat_identities(app_id,openid,user_id) VALUES($1,$2,$3) ON CONFLICT(app_id,openid) DO NOTHING',[r.data.appId,r.data.openid,user.id])});res.json({ok:true})
})
