import test from 'node:test'
import assert from 'node:assert/strict'
import {profileFixture} from './helpers/user-profile-fixture.ts'
import {graphDefaults,pageAgentDefaults,pageAgentUiSchema} from '../apps/shared/workspace-tools.ts'

test('central AI service migration, discovery, runtime and independent appearance',async()=>{
 const f=await profileFixture()
 try{
  const {runAgentModel,agentRequestSchema,migrateWorkspaceTools}=await import('../apps/api/src/workspace-tools.ts')
  const {upstream,discoverFeatureModels,aiBaseUrl}=await import('../apps/api/src/ai.ts')
  const {encrypt}=await import('../apps/api/src/security.ts')
  async function send(path:string,body:any,status=200,method='PUT',token=f.token){const r=await fetch(f.origin+'/api'+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)});const data:any=await r.json();assert.equal(r.status,status,JSON.stringify(data));return data}
  const integration='/admin/integrations/page-agent',ai='/admin/ai/page-agent'
  await assert.rejects(()=>upstream(new URL('https://127.0.0.1/v1/models'),'never-send-this',undefined,1000,'GET'),/内网或保留地址/)
  assert.equal(aiBaseUrl('https://models.example.com'),'https://models.example.com/v1')
  await f.call(integration+'/runtime',401,'');await f.call(integration+'/runtime',403,f.student)
  assert.deepEqual((await f.call('/admin/integrations/g6')).config,graphDefaults)
  await send('/admin/integrations/g6',{revision:1,config:{...graphDefaults,radius:0,canvasHeight:900}})
  await send('/admin/integrations/g6',{revision:1,config:graphDefaults},409)
  const ui={...pageAgentUiSchema.parse({}),enabled:true,appearance:{...pageAgentDefaults.appearance,theme:'dark',primaryColor:'#7c3aed',backgroundDark:'#202438'}}
  await send(integration,{revision:1,config:ui})
  await send(integration,{revision:2,config:{...ui,baseUrl:'https://wrong.example.com'}},400)
  await send(integration,{revision:2,config:{...ui,appearance:{...ui.appearance,primaryColor:'url(evil)'}}},400)
  // Previous-deployment fixture: credentials must migrate once, without affecting appearance.
  await f.db.query("DELETE FROM ai_features WHERE id='page-agent'")
  await f.db.query("UPDATE integration_settings SET config=$1,secrets=$2 WHERE key='page-agent'",[JSON.stringify({...pageAgentDefaults,...ui,baseUrl:'https://legacy.example.com/v1',model:'legacy-model',timeoutSeconds:51,dailyLimit:321}),encrypt('legacy-secret')])
  await migrateWorkspaceTools();await migrateWorkspaceTools()
  let features=(await f.call('/admin/ai')).features,service=features.find((x:any)=>x.id==='page-agent')
  assert.equal(service.config.baseUrl,'https://legacy.example.com/v1');assert.equal(service.config.model,'legacy-model');assert.equal(service.config.timeoutSeconds,51);assert.equal(service.config.dailyLimit,321);assert.equal(service.has_key,true)
  const original=(await f.db.query("SELECT encrypted_key FROM ai_features WHERE id='page-agent'")).rows[0].encrypted_key
  const stored=(await f.db.query("SELECT * FROM integration_settings WHERE key='page-agent'")).rows[0];assert.equal(stored.secrets,null);assert.equal(stored.config.baseUrl,undefined);assert.equal(stored.config.model,undefined);assert.deepEqual(stored.config.appearance,ui.appearance)
  await send(integration,{revision:stored.revision,config:{...ui,name:'内容助手'}});assert.equal((await f.db.query("SELECT encrypted_key FROM ai_features WHERE id='page-agent'")).rows[0].encrypted_key,original)
  const config={...service.config,baseUrl:'https://new.example.com/v1',model:'new-model',inputPrice:1,outputPrice:2,cachedPrice:.1,maxTokens:500}
  const draft={revision:service.revision,baseUrl:config.baseUrl,apiKey:'secret-should-not-appear'}
  await send(ai,{revision:service.revision,enabled:true,config,apiKey:draft.apiKey},400)
  await send(ai+'/models',draft,403,'POST',f.student)
  await assert.rejects(()=>discoverFeatureModels(f.admin.id,'page-agent',{...draft,apiKey:undefined},async()=>({})),/重新填写/)
  await assert.rejects(()=>discoverFeatureModels(f.admin.id,'page-agent',{...draft,revision:999},async()=>({})),/配置已变更/)
  await assert.rejects(()=>discoverFeatureModels(f.admin.id,'page-agent',draft,async()=>({data:[]})),/未返回任何模型/)
  await assert.rejects(()=>discoverFeatureModels(f.admin.id,'page-agent',draft,async()=>({html:'not models'})),/兼容的模型列表/)
  await assert.rejects(()=>discoverFeatureModels(f.admin.id,'page-agent',draft,async()=>{throw Object.assign(new Error(draft.apiKey),{upstreamStatus:401})}),/验证未通过/)
  const list=await discoverFeatureModels(f.admin.id,'page-agent',draft,async(url,secret,body,timeout,method)=>{assert.equal(url.href,config.baseUrl+'/models');assert.equal(secret,draft.apiKey);assert.equal(body,undefined);assert.equal(method,'GET');assert.equal(timeout,30000);return {data:[{id:config.model},{id:config.model},{id:'other-model'}]}})
  assert.ok(list);assert.equal(list.models.length,2)
  assert.equal((await f.db.query("SELECT encrypted_key FROM ai_features WHERE id='page-agent'")).rows[0].encrypted_key,original,'discovery must not save draft credentials')
  await send(ai,{revision:service.revision,enabled:true,config:{...config,model:'not-in-list'},apiKey:draft.apiKey},400)
  await send(ai,{revision:service.revision,enabled:true,config,apiKey:'different-secret'},400)
  await send(ai,{revision:service.revision,enabled:true,config,apiKey:draft.apiKey})
  await send(ai,{revision:service.revision,enabled:true,config},409)
  await migrateWorkspaceTools();service=(await f.call('/admin/ai')).features.find((x:any)=>x.id==='page-agent');assert.equal(service.config.model,config.model)
  const runtime=await f.call(integration+'/runtime');assert.equal(runtime.ready,true);assert.equal(runtime.config.model,config.model);assert.equal(runtime.config.name,'内容助手')
  assert.ok(!JSON.stringify(features).includes('encrypted_key'));assert.ok(!JSON.stringify(runtime).includes(draft.apiKey))
  const body=agentRequestSchema.parse({messages:[{role:'user',content:'test'}],tools:[{type:'function',function:{name:'test',parameters:{type:'object'}}}],model:'client-cannot-override'})
  const fake=async(url:URL,secret:string,request:any)=>{assert.equal(url.href,config.baseUrl+'/chat/completions');assert.equal(secret,draft.apiKey);assert.equal(request.model,config.model);assert.equal(request.max_tokens,500);return {choices:[{message:{tool_calls:[{function:{name:'test',arguments:'{}'}}]}}],usage:{prompt_tokens:100,completion_tokens:50}}}
  assert.ok((await runAgentModel(f.admin.id,body,false,fake)).choices.length)
  await assert.rejects(()=>runAgentModel(f.admin.id,body,false,async()=>({choices:[{message:{content:'only chat'}}]})),/工具调用/)
  await assert.rejects(()=>runAgentModel(f.admin.id,body,false,async()=>{throw new Error(draft.apiKey)}),/模型请求失败/)
  const day=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'}),usage=await f.call(ai+'/usage?day='+day);assert.equal(usage.summary.calls,3);assert.equal(usage.summary.successes,1);assert.equal(usage.rows.find((x:any)=>x.status==='success').cost_yuan,'0.00020000');assert.ok(!JSON.stringify(usage).includes(draft.apiKey))
  await send(ai,{revision:service.revision,enabled:false,config});assert.equal((await f.call(integration+'/runtime')).ready,false);await assert.rejects(()=>runAgentModel(f.admin.id,body,false,fake),/尚未启用/)
  await send(ai,{revision:service.revision+1,enabled:false,config,clearKey:true},400)
  const other=(await f.call('/admin/ai')).features.find((x:any)=>x.id==='chat')
  await discoverFeatureModels(f.admin.id,'chat',{revision:other.revision,baseUrl:other.config.baseUrl,apiKey:'other-secret'},async()=>({data:[{id:'other-model'}]}))
  await send('/admin/ai/chat',{revision:other.revision,enabled:true,config:{...other.config,mode:'live',model:'other-model'},apiKey:'other-secret'})
  const logs=JSON.stringify((await f.db.query("SELECT details FROM audit_logs WHERE action LIKE 'ai.%' OR action LIKE 'page-agent.%'")).rows);assert.ok(!logs.includes(draft.apiKey));assert.ok(!logs.includes('other-secret'))
 }finally{await f.close()}
})
