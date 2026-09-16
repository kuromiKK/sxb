import 'dotenv/config'
import assert from 'node:assert/strict'
import https from 'node:https'
import {lookup} from 'node:dns/promises'
import {chromium,expect} from '@playwright/test'

// Run against the local services. No SMS, payment, AI generation or content writes.
// Login/logout create the normal authentication audit entries. Output excludes secrets,
// content text, URL paths and query strings. TUN/system routing is outside this test.
const api='http://127.0.0.1:4310/api',admin='http://127.0.0.1:5180',student='http://127.0.0.1:5174'
let token='',browser
const report={time:new Date().toISOString(),ai:[],integrations:[],externalContent:[],probes:[],pages:[],blockedRequests:[],failedRequests:[],pageErrors:[]}
const local=url=>['127.0.0.1','localhost','[::1]'].includes(new URL(url).hostname)
const hosts=new Map(),assets=new Set()
function inventory(value,scope){
 if(typeof value==='string')for(const match of value.matchAll(/https?:\/\/[^\s"'<>\\)]+/g)){
  try{const u=new URL(match[0]);if(local(u.href))continue;const key=scope+' '+u.hostname;hosts.set(key,(hosts.get(key)||0)+1)}catch{}
 }else if(Array.isArray(value))value.forEach(x=>inventory(x,scope))
 else if(value&&typeof value==='object')for(const [key,item] of Object.entries(value)){
  if(/^(assetId|mediaAssetId|posterAssetId)$/.test(key)&&typeof item==='string'&&item)assets.add(item)
  inventory(item,scope)
 }
}
async function request(path,body){
 const r=await fetch(api+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(40000)})
 if(!r.ok)throw new Error(`Local API ${path.split('?')[0]}: HTTP ${r.status}`)
 return r.json()
}
async function probe(url){
 const host=new URL(url).hostname,start=Date.now()
 let addresses=[]
 try{
  addresses=(await lookup(host,{family:4,all:true})).map(x=>x.address)
  // Standalone agent bypasses HTTP(S)_PROXY; never disable TLS validation.
  const status=await new Promise((resolve,reject)=>{
   const agent=new https.Agent({proxyEnv:{}})
   const req=https.get(url,{agent},res=>{res.resume();resolve(res.statusCode)})
   const timer=setTimeout(()=>req.destroy(Object.assign(new Error('timeout'),{code:'TIMEOUT'})),12000)
   req.on('error',reject);req.on('close',()=>{clearTimeout(timer);agent.destroy()})
  })
  return {host,addresses,status,reachable:true,fakeIp:addresses.some(a=>/^198\.(18|19)\./.test(a)),ms:Date.now()-start}
 }catch(e){return {host,addresses,reachable:false,code:e.code||'ERROR',ms:Date.now()-start}}
}
try{
 const login=await request('/auth/admin',{phone:process.env.ADMIN_PHONE,password:process.env.ADMIN_PASSWORD});token=login.token
 const [{features},integrations,settings,exams,contentOptions]=await Promise.all(['/admin/ai','/admin/integrations','/admin/site-settings','/admin/exam-projects','/admin/content-options'].map(p=>request(p)))
 report.ai=features.map(f=>({id:f.id,enabled:f.enabled,mode:f.config.mode,host:new URL(f.config.baseUrl).hostname,hasKey:f.has_key}))
 report.integrations=integrations.map(i=>({key:i.key,enabled:i.config.enabled,mode:i.config.mode,hasCredentials:i.hasCredentials}))
 inventory(settings,'settings');inventory(exams,'exams');inventory(contentOptions,'knowledge')
 let contentCount=0
 for(let page=1;;page++){
  const data=await request('/admin/content?page='+page);contentCount+=data.items.length;inventory(data.items,'content')
  if(contentCount>=data.total||!data.items.length)break
 }
 for(const path of ['/admin/products','/admin/resources'])inventory(await request(path),path)
 // Protected media can hide an external redirect behind an asset ID. Inspect headers
 // only, without following the external URL or downloading paid files.
 report.media={checked:0,external:0,failures:[]}
 for(const id of assets){
  try{
   const ticket=await request('/admin/media/'+encodeURIComponent(id)+'/ticket',{})
   const response=await fetch(new URL(ticket.url,api),{method:'HEAD',redirect:'manual',signal:AbortSignal.timeout(10000)})
   if(response.status>=300&&response.status<400){inventory(response.headers.get('location'),'protected-media');report.media.external++}
   else if(!response.ok)throw Error('HTTP '+response.status)
   report.media.checked++
  }catch(e){report.media.failures.push({id,error:e.message})}
 }
 report.contentRows=contentCount
 report.externalContent=[...hosts].map(([scopeHost,count])=>({scopeHost,count}))
 const endpoints=new Set(['https://dysmsapi.aliyuncs.com/','https://api.weixin.qq.com/','https://open.weixin.qq.com/','https://api.mch.weixin.qq.com/','https://openapi.alipay.com/gateway.do'])
 for(const f of features)endpoints.add(f.config.baseUrl.replace(/\/$/,'')+'/models')
 report.probes=await Promise.all([...endpoints].map(probe))
 for(const f of features.filter(f=>f.enabled&&f.config.mode==='live'&&f.has_key)){
  try{const result=await request('/admin/ai/'+encodeURIComponent(f.id)+'/models',{revision:f.revision,baseUrl:f.config.baseUrl});report.ai.find(x=>x.id===f.id).modelDiscovery={ok:true,count:result.models.length}}
  catch(e){report.ai.find(x=>x.id===f.id).modelDiscovery={ok:false,error:e.message}}
 }
 const captcha=integrations.find(i=>i.key==='captcha')
 if(captcha?.config.mode==='gocaptcha'){
  const challenge=await request('/admin/integrations/captcha/preview',captcha.config)
  report.captcha={ok:Boolean(challenge.challengeId),mode:captcha.config.mode}
 }
 browser=await chromium.launch({headless:true,channel:'chrome',args:['--no-proxy-server']})
 const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'})
 await context.addInitScript(({token,admin})=>{if(location.origin===admin)sessionStorage.setItem('sxb-admin-token',token)},{token,admin})
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url())
  if(['http:','https:'].includes(url.protocol)&&!local(url.href)){
   report.blockedRequests.push({host:url.hostname,type:req.resourceType()});await route.abort('blockedbyclient')
  }else await route.continue()
 })
 context.on('page',page=>{
  page.on('pageerror',e=>report.pageErrors.push({page:new URL(page.url()).hash.split('?')[0],error:e.name}))
  page.on('response',r=>{if(r.status()>=400)report.failedRequests.push({host:new URL(r.url()).hostname,status:r.status(),type:r.request().resourceType()})})
  page.on('requestfailed',r=>{if(local(r.url())&&r.failure()?.errorText!=='net::ERR_ABORTED')report.failedRequests.push({host:new URL(r.url()).hostname,error:r.failure()?.errorText,type:r.resourceType()})})
 })
 const page=await context.newPage()
 const routes=['dashboard','exam-categories','exam-projects','knowledge-graph','question-types','question','course','learning-plan','cheatsheet','users','permissions','products','orders','finance','records','message-template','message-center','referrals','articles','administrators','roles','media','style-components','ai','audit','settings']
 for(const route of routes){
  await page.goto(admin+'/#'+route)
  await expect(page.locator('.page-heading h1')).toBeVisible({timeout:30000})
  await page.waitForLoadState('networkidle')
  await expect(page.locator('.el-alert--error:visible,.error-banner:visible')).toHaveCount(0)
  report.pages.push('admin/'+route)
 }
 await page.goto(admin+'/#knowledge-graph')
 await page.locator('.kg .grid button').first().click()
 for(const [tab,canvas,root] of [['关系图谱','.kr-canvas','.kr-node-root'],['思维导图','.mm-canvas','.mm-root']]){
  await page.getByRole('tab',{name:tab,exact:true}).click()
  await expect(page.locator(canvas)).toHaveAttribute('aria-busy','false',{timeout:30000})
  await expect(page.locator(root)).toHaveCount(1)
 }
 report.g6={relation:true,mindMap:true}
 const mobile=await context.newPage();await mobile.setViewportSize({width:390,height:844})
 for(const route of ['index','login','exam-switch','search','knowledge','courses','practice','profile','products','exam-notices']){
  await mobile.goto(student+'/#/pages/'+route+'/index')
  await mobile.reload()
  await mobile.waitForLoadState('networkidle')
  await expect(mobile.locator('uni-page-body')).toBeVisible()
  await expect(mobile.locator('uni-page-body')).toHaveText(/\S/,{timeout:20000})
  report.pages.push('student/'+route)
 }
 assert.equal(report.pageErrors.length,0,'Browser page errors')
 assert.equal(report.failedRequests.length,0,'Failed local requests')
 assert.equal(report.blockedRequests.length,0,'External browser requests require review')
 report.browserStatus='PASS'
 report.externalNetworkStatus=report.probes.some(p=>p.fakeIp)?'INCONCLUSIVE_FAKE_IP':report.ai.some(f=>f.modelDiscovery&&!f.modelDiscovery.ok)?'AI_CONNECTION_FAILED':'REQUIRES_UNPROXIED_SERVER_ACCEPTANCE'
}catch(e){report.error=e.message;process.exitCode=1}
finally{
 if(browser)await browser.close()
 if(token)await request('/auth/logout',{}).catch(()=>{})
 console.log(JSON.stringify(report,null,2))
}
