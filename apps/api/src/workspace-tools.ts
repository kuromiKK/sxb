import {Router} from 'express'
import {z} from 'zod'
import {rateLimit} from 'express-rate-limit'
import {db,transaction} from './db.ts'
import {audit,decrypt,fail,id} from './security.ts'
import {upstream,aiBaseUrl,tokenCost} from './ai.ts'
import {graphDefaults,graphSchema,pageAgentSchema,pageAgentUiSchema} from '../../shared/workspace-tools.ts'

export async function migrateWorkspaceTools(){
 await transaction(async c=>{
  await c.query('ALTER TABLE ai_features ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1')
  for(const [key,config] of Object.entries({'page-agent':pageAgentUiSchema.parse({}),g6:graphDefaults}))await c.query('INSERT INTO integration_settings(key,config) VALUES($1,$2) ON CONFLICT(key) DO NOTHING',[key,JSON.stringify(config)])
  const setting=(await c.query("SELECT * FROM integration_settings WHERE key='page-agent' FOR UPDATE")).rows[0]
  const legacy=pageAgentSchema.parse(setting.config)
  const config={provider:'AI员工模型服务',baseUrl:legacy.baseUrl,model:legacy.model,protocol:'chat',mode:'live',inputPrice:0,outputPrice:0,cachedPrice:0,maxTokens:4096,timeoutSeconds:legacy.timeoutSeconds,dailyLimit:legacy.dailyLimit,prompt:''}
  await c.query("INSERT INTO ai_features(id,name,enabled,config,encrypted_key) VALUES('page-agent','AI员工',$1,$2,$3) ON CONFLICT(id) DO NOTHING",[legacy.enabled,JSON.stringify(config),setting.secrets])
  if(setting.secrets||'baseUrl' in setting.config)await c.query("UPDATE integration_settings SET config=$1,secrets=NULL,revision=revision+1,updated_at=now() WHERE key='page-agent'",[JSON.stringify(pageAgentUiSchema.strip().parse(setting.config))])
 })
}
const row=async(key:string)=>(await db.query('SELECT * FROM integration_settings WHERE key=$1',[key])).rows[0]
export const workspaceTools=Router()
workspaceTools.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');next()})
for(const key of ['page-agent','g6'] as const){
 workspaceTools.get('/'+key,async(_req,res)=>{const r=await row(key);res.json({key,config:r.config,revision:r.revision,hasCredentials:Boolean(r.secrets)})})
 workspaceTools.put('/'+key,async(req,res)=>{
  const b=z.object({revision:z.number().int().positive(),config:key==='g6'?graphSchema:pageAgentUiSchema}).strict().parse(req.body)
  await transaction(async c=>{
   const r=(await c.query('SELECT * FROM integration_settings WHERE key=$1 FOR UPDATE',[key])).rows[0]
   if(r.revision!==b.revision)fail(409,'配置已被修改，请刷新后重试')
   await c.query('UPDATE integration_settings SET config=$2,secrets=$3,revision=revision+1,updated_at=now() WHERE key=$1',[key,JSON.stringify(b.config),null])
   await c.query('INSERT INTO audit_logs(id,actor_id,action,target_id,details) VALUES($1,$2,$3,$4,$5)',[id(),res.locals.user.id,'integration.configure',key,JSON.stringify({config:b.config})])
  });res.json({ok:true})
 })
}
workspaceTools.get('/page-agent/runtime',async(_req,res)=>{
 const r=await row('page-agent'),service=(await db.query("SELECT * FROM ai_features WHERE id='page-agent'")).rows[0]
 const config={...pageAgentUiSchema.parse(r.config),model:service.config.model,timeoutSeconds:service.config.timeoutSeconds,dailyLimit:service.config.dailyLimit}
 res.json({config,revision:r.revision,ready:Boolean(service.encrypted_key&&service.enabled&&service.config.mode==='live')})
})
const messageSchema=z.object({role:z.enum(['system','user','assistant','tool']),content:z.string().max(500000).nullable().optional(),tool_calls:z.array(z.object({id:z.string().max(200),type:z.literal('function'),function:z.object({name:z.string().max(100),arguments:z.string().max(100000)})})).max(20).optional(),tool_call_id:z.string().max(200).optional(),name:z.string().max(100).optional()}).strict()
export const agentRequestSchema=z.object({messages:z.array(messageSchema).min(1).max(150),tools:z.array(z.object({type:z.literal('function'),function:z.object({name:z.string().max(100),description:z.string().max(30000).optional(),parameters:z.record(z.string(),z.unknown())})})).min(1).max(20),tool_choice:z.union([z.enum(['auto','required','none']),z.object({type:z.literal('function'),function:z.object({name:z.string().max(100)})})]).optional(),model:z.string().optional(),stream:z.literal(false).optional(),temperature:z.number().optional()}).strict()
const limits=rateLimit({windowMs:60000,limit:45,standardHeaders:true,legacyHeaders:false,message:{message:'调用过于频繁，请稍后重试'}})
const active=new Set<string>()
export async function runAgentModel(actor:string,body:any,test=false,transport=upstream){
 const setting=await row('page-agent'),service=(await db.query("SELECT * FROM ai_features WHERE id='page-agent'")).rows[0],config=service.config
 if(!test&&(!setting.config.enabled||!service.enabled))fail(403,'AI员工尚未启用')
 if(!service.encrypted_key)fail(400,'请先在 AI配置与数据中配置 AI员工的模型服务')
 if(config.mode!=='live'||config.protocol!=='chat')fail(400,'AI员工需要真实接口和 Chat Completions 协议')
 if(active.has(actor))fail(429,'上一条模型请求仍在处理中')
 active.add(actor)
 const started=Date.now()
 try{
  const n=(await db.query("SELECT count(*)::int n FROM audit_logs WHERE actor_id=$1 AND action='page-agent.model' AND created_at>=date_trunc('day',now() AT TIME ZONE 'Asia/Shanghai') AT TIME ZONE 'Asia/Shanghai'",[actor])).rows[0].n
  if(n>=config.dailyLimit)fail(429,'今日 AI员工模型调用次数已达上限')
  const request:any={model:config.model,messages:config.prompt?[{role:'system',content:config.prompt},...body.messages]:body.messages,tools:body.tools,tool_choice:body.tool_choice||'required',stream:false}
  request[/^(?:gpt-|o[1-9])/.test(config.model)?'max_completion_tokens':'max_tokens']=test?128:config.maxTokens
  if(/^qwen/i.test(config.model))request.enable_thinking=false
  if(/^deepseek/i.test(config.model)){request.thinking={type:'disabled'};delete request.tool_choice}
  const data=await transport(new URL(aiBaseUrl(config.baseUrl)+'/chat/completions'),decrypt(service.encrypted_key),request,config.timeoutSeconds*1000)
  if(!data.choices?.[0]?.message?.tool_calls?.length)fail(502,'模型未返回工具调用，请选用支持 Function Calling 的模型')
  await recordAgentCall(actor,config,'success',test,Date.now()-started,data.usage)
  return {id:data.id,object:'chat.completion',choices:data.choices,usage:data.usage}
 }catch(e:any){
  const errors:Record<number,string>={400:'模型服务拒绝了请求（HTTP 400），请检查所选模型是否支持工具调用及当前参数',401:'模型服务密钥验证失败（HTTP 401），请在 AI配置与数据中检查 API Key',403:'模型服务拒绝访问（HTTP 403），请检查密钥权限及账户状态',404:'模型服务未找到接口或模型（HTTP 404），请核对 API 地址和模型 ID',429:'模型服务限流或额度不足（HTTP 429），请稍后重试并检查账户额度'}
  const message=e.status?e.message:errors[e.upstreamStatus]||(e.code==='AI_TIMEOUT'?'模型响应超时，请稍后重试；是否计费请核对服务商账单':'模型请求失败，请检查 API 地址、密钥、模型权限或超时设置')
  await recordAgentCall(actor,config,'failed',test,Date.now()-started,undefined,message)
  return fail(e.status||(e.upstreamStatus===429?429:502),message)
 }finally{active.delete(actor)}
}
workspaceTools.post('/page-agent/chat/completions',limits,async(req,res)=>{
 if(JSON.stringify(req.body).length>650000)fail(413,'页面上下文过大，请缩小任务范围')
 res.json(await runAgentModel(res.locals.user.id,agentRequestSchema.parse(req.body)))
})
export async function testAgentModel(actor:string){
 const start=Date.now()
 const result=await runAgentModel(actor,{messages:[{role:'user',content:'这是连接测试。请调用 connection_test，传入 ok=true。'}],tools:[{type:'function',function:{name:'connection_test',description:'检查模型工具调用',parameters:{type:'object',properties:{ok:{type:'boolean'}},required:['ok'],additionalProperties:false}}}],tool_choice:{type:'function',function:{name:'connection_test'}}},true)
 const call=result.choices[0].message.tool_calls[0]
 let valid=false;try{valid=call.function.name==='connection_test'&&JSON.parse(call.function.arguments).ok===true}catch{}
 if(!valid)fail(502,'接口可达，但模型没有正确完成工具调用测试')
 return {status:'success',mode:'live',message:'模型连接成功，工具调用测试通过',durationMs:Date.now()-start}
}
async function recordAgentCall(actor:string,config:any,status:string,test:boolean,durationMs:number,usage?:any,error?:string){
 const input=usage?.prompt_tokens??null,output=usage?.completion_tokens??null,cached=usage?.prompt_tokens_details?.cached_tokens??(usage?0:null)
 const cost=input!==null&&output!==null&&cached!==null&&config.inputPrice>0?tokenCost(input,output,cached,config):null
 const pricing={inputPrice:config.inputPrice,outputPrice:config.outputPrice,cachedPrice:config.cachedPrice,currency:'CNY',unit:'1M tokens',source:'administrator',mode:'live'}
 await db.query("INSERT INTO ai_calls(id,feature_id,user_id,model,endpoint,status,input_tokens,output_tokens,cached_tokens,cost_yuan,pricing,duration_ms,error,is_test) VALUES($1,'page-agent',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)",[id(),actor,config.model,aiBaseUrl(config.baseUrl)+'/chat/completions',status,input,output,cached,cost,JSON.stringify(pricing),durationMs,status==='failed'?error||'模型请求失败':null,test])
 await audit(actor,'page-agent.model','page-agent',{model:config.model,status,test,durationMs})
}
workspaceTools.post('/page-agent/task-log',async(req,res)=>{
 const b=z.object({task:z.string().max(2000),status:z.enum(['completed','failed','stopped']),steps:z.number().int().min(0).max(60),page:z.string().max(80)}).strict().parse(req.body)
 await audit(res.locals.user.id,'page-agent.task','page-agent',b);res.json({ok:true})
})
