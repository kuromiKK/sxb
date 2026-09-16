import { z } from 'zod'
import { lookup } from 'node:dns/promises'
import https from 'node:https'
import { isIP,type LookupFunction } from 'node:net'
import { db,transaction } from './db.ts'
import {createHash} from 'node:crypto'
import { fail, id, decrypt, encrypt, audit } from './security.ts'

export const featureNames: Record<string, string> = {
  chat: '知识点答疑', review: '专属复习资料', wrong: '错题分析', report: '学习报告解读',
  grading: '主观题判分', plan: '学习计划建议', questionReview: '题目解析审核',
  questionGenerate: '题目生成', graph: '知识图谱整理', summary: '讲义与课程摘要'
}
export const pricePresets = [
  { model: 'gpt-6-astra', inputPrice: 6, outputPrice: 30, cachedPrice: .6 },
  { model: 'gpt-5.6-sol', inputPrice: 3, outputPrice: 18, cachedPrice: .3 },
  { model: 'gpt-5.6-terra', inputPrice: 1.2, outputPrice: 7.2, cachedPrice: .12 },
  { model: 'gpt-5.5', inputPrice: 3, outputPrice: 18, cachedPrice: .3 }
]
export const aiConfigSchema = z.object({
  provider: z.string().min(1).max(80), baseUrl: z.url(), protocol: z.enum(['chat','responses']),
  mode: z.enum(['mock','live']), model: z.string().min(1).max(100),
  inputPrice: z.number().min(0).max(100000), outputPrice: z.number().min(0).max(100000), cachedPrice: z.number().min(0).max(100000),
  maxTokens: z.number().int().min(32).max(16000), timeoutSeconds: z.number().int().min(5).max(120),
  dailyLimit: z.number().int().min(1).max(100000), prompt: z.string().max(12000)
})
export type AIConfig = z.infer<typeof aiConfigSchema>
export function tokenCost(input: number, output: number, cached: number, pricing: Pick<AIConfig, 'inputPrice'|'outputPrice'|'cachedPrice'>) {
  if (![input, output, cached].every(v => Number.isSafeInteger(v) && v >= 0) || cached > input) return null
  return Number((((input - cached) * pricing.inputPrice + output * pricing.outputPrice + cached * pricing.cachedPrice) / 1_000_000).toFixed(8))
}
export async function listFeatures() {
  return (await db.query('SELECT id,name,enabled,config,encrypted_key IS NOT NULL AS has_key,revision,updated_at FROM ai_features ORDER BY id')).rows
}
export const aiBaseUrl=(value:string)=>{const url=new URL(value);if(url.pathname==='/')url.pathname='/v1';return url.href.replace(/\/+$/,'')}
const fingerprint=(baseUrl:string,secret:string)=>createHash('sha256').update(JSON.stringify([aiBaseUrl(baseUrl),secret])).digest('hex')
const discoveries=new Map<string,{fingerprint:string;models:string[];expires:number;revision:number}>()
const modelDiscoverySchema=z.object({revision:z.number().int().positive(),baseUrl:z.url().refine(v=>{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password&&!u.search&&!u.hash},'请填写有效的 HTTPS API 根地址'),apiKey:z.string().trim().min(1).max(2048).optional()}).strict()
export async function discoverFeatureModels(actor:string,feature:string,body:unknown,transport=upstream){
 const b=modelDiscoverySchema.parse(body),setting=(await db.query('SELECT * FROM ai_features WHERE id=$1',[feature])).rows[0]
 if(!setting)return fail(404,'AI功能不存在')
 if(setting.revision!==b.revision)fail(409,'配置已变更，请刷新后重新测试')
 if(!b.apiKey&&aiBaseUrl(b.baseUrl)!==aiBaseUrl(setting.config.baseUrl))fail(400,'API 地址已更改，请重新填写 API Key 后测试')
 const secret=b.apiKey||(setting.encrypted_key?decrypt(setting.encrypted_key):'')
 if(!secret)fail(400,'API Key 为必填项，请先填写')
 for(const [key,value] of discoveries)if(value.expires<Date.now())discoveries.delete(key)
 const cacheKey=actor+':'+feature;discoveries.delete(cacheKey)
 const started=Date.now(),baseUrl=aiBaseUrl(b.baseUrl)
 try{
  const data=await transport(new URL(baseUrl+'/models'),secret,undefined,30000,'GET')
  const parsed=z.object({data:z.array(z.object({id:z.string().trim().min(1).max(100)})).max(10000)}).safeParse(data)
  if(!parsed.success)return fail(502,'接口没有返回兼容的模型列表，请核对 API 根地址及服务商是否支持 GET /models')
  const models=[...new Set(parsed.data.data.map(m=>m.id))].sort()
  if(!models.length)fail(400,'接口已连接，但此 API Key 未返回任何模型，请检查服务商的模型权限')
  if((await db.query('SELECT revision FROM ai_features WHERE id=$1',[feature])).rows[0].revision!==b.revision)fail(409,'测试期间配置已变更，请刷新后重新测试')
  discoveries.set(cacheKey,{fingerprint:fingerprint(baseUrl,secret),models,expires:Date.now()+15*60000,revision:b.revision})
  await audit(actor,'ai.discover',feature,{status:'success',modelCount:models.length,durationMs:Date.now()-started})
  return {models,baseUrl,message:`连接测试通过，已读取 ${models.length} 个模型`,testedAt:new Date().toISOString(),durationMs:Date.now()-started}
 }catch(e:any){
  await audit(actor,'ai.discover',feature,{status:'failed',durationMs:Date.now()-started})
  if(e.status)throw e
  if([401,403].includes(e.upstreamStatus))fail(400,'API Key 验证未通过或无模型列表访问权限，请检查密钥及服务商授权')
  if(e.upstreamStatus===404)fail(400,'模型列表接口不存在，请核对 API 根地址（通常包含 /v1）以及服务商是否提供 /models')
  if(e.upstreamStatus===429)fail(429,'服务商限制了请求频率或额度，请稍后重试并检查账户额度')
  if(e.upstreamStatus>=500)fail(502,`服务商接口暂时异常（HTTP ${e.upstreamStatus}），请稍后重试`)
  if(['ENOTFOUND','EAI_AGAIN'].includes(e.code))fail(502,'服务器无法解析 API 域名，请检查 DNS 或代理设置')
  if(['ETIMEDOUT','AI_TIMEOUT','ECONNREFUSED','ECONNRESET','ENETUNREACH'].includes(e.code))fail(502,`服务器连接模型接口失败（${e.code}）。浏览器可访问不代表后端连接可用，请检查后端网络或代理设置`)
  if(['CERT_HAS_EXPIRED','UNABLE_TO_VERIFY_LEAF_SIGNATURE','SELF_SIGNED_CERT_IN_CHAIN','DEPTH_ZERO_SELF_SIGNED_CERT','ERR_TLS_CERT_ALTNAME_INVALID'].includes(e.code))fail(502,'模型接口的 HTTPS 证书校验失败，请检查证书链或代理的 HTTPS 拦截设置')
  return fail(502,'读取模型失败，请检查 API 地址、网络或服务商状态后重试')
 }
}
export async function saveFeature(actor: string, feature: string, body: unknown) {
  const value = z.object({ enabled: z.boolean(), config: aiConfigSchema, apiKey: z.string().trim().max(2048).optional(), clearKey: z.boolean().optional(),revision:z.number().int().positive().optional() }).parse(body)
  const url = new URL(value.config.baseUrl)
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) fail(400, 'API地址必须为不含凭据和查询参数的HTTPS地址')
  await transaction(async c=>{
  const existing = (await c.query('SELECT * FROM ai_features WHERE id=$1 FOR UPDATE', [feature])).rows[0]
  if (!existing) fail(404, 'AI功能不存在')
  if(value.revision!==undefined&&value.revision!==existing.revision)fail(409,'配置已被修改，请刷新后重试')
  if(feature==='page-agent'&&(value.config.mode!=='live'||value.config.protocol!=='chat'))fail(400,'AI员工需要真实接口和 Chat Completions 协议')
  const secret = value.clearKey ? null : value.apiKey ? encrypt(value.apiKey) : existing.encrypted_key
  if (value.config.mode === 'live' && !secret) fail(400, 'API Key 为必填项，请先填写')
  if(value.config.mode==='live'){
   const changed=!existing.encrypted_key||fingerprint(value.config.baseUrl,decrypt(secret!))!==fingerprint(existing.config.baseUrl,decrypt(existing.encrypted_key))||value.config.model!==existing.config.model
   if(changed){const verified=discoveries.get(actor+':'+feature);if(!verified||verified.expires<Date.now()||verified.revision!==existing.revision||verified.fingerprint!==fingerprint(value.config.baseUrl,decrypt(secret!)))return fail(400,'请先测试连接并读取模型；测试结果有效期为15分钟');if(!verified.models.includes(value.config.model))fail(400,'请选择本次读取列表中的模型')}
  }
  await c.query('UPDATE ai_features SET enabled=$2,config=$3,encrypted_key=$4,revision=revision+1,updated_at=now() WHERE id=$1', [feature, value.enabled, JSON.stringify(value.config), secret])
  })
  await audit(actor, 'ai.configure', feature, { enabled: value.enabled, model: value.config.model, mode: value.config.mode })
}
export const privateAddress = (ip: string) => {
  if(isIP(ip)!==4)return true
  const [a,b]=ip.split('.').map(Number)
  return a===0||a===10||a===127||a>=224||(a===100&&b>=64&&b<=127)||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&(b===168||b===0||b===2))||(a===198&&(b===18||b===19||b===51))||(a===203&&b===0)
}
export function pinnedPublicLookup(addresses:string[]):LookupFunction {
  if (!addresses.length || addresses.some(privateAddress)) fail(400, 'API 域名解析到了内网或保留地址，连接已拦截。若使用代理的 Fake-IP 模式，请将此域名加入 DNS 真实解析列表后重试；这不代表 API Key 错误。')
  const pinned=addresses.map(address=>({address,family:4}))
  // Node's family auto-selection requests an address array with all:true.
  return (_host,options,callback)=>options.all?callback(null,pinned.map(a=>({...a}))):callback(null,pinned[0].address,4)
}
export async function upstream(url: URL, secret: string, body: any, timeout: number, method:'POST'|'GET'='POST'): Promise<any> {
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)fail(400,'API地址必须为不含凭据和查询参数的HTTPS地址')
  const addresses = await lookup(url.hostname, { all: true, family: 4 })
  const pinnedLookup=pinnedPublicLookup(addresses.map(a=>a.address))
  // Pin the validated DNS result so a later DNS change cannot redirect to the local network.
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method, headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' }, lookup: pinnedLookup }, response => {
      let text = ''; let length = 0
      response.on('data', chunk => { length += chunk.length; if (length > 2_000_000) req.destroy(new Error('AI响应超过大小限制')); else text += chunk.toString() })
      response.on('end', () => {
        if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) return reject(Object.assign(new Error(`中转接口返回HTTP ${response.statusCode || '未知'}，请检查地址、额度和模型权限`),{upstreamStatus:response.statusCode}))
        try { resolve(JSON.parse(text)) } catch { reject(new Error('中转接口未返回有效JSON')) }
      })
    })
    const timer = setTimeout(() => req.destroy(Object.assign(new Error('AI请求超时，是否已计费请核对中转账单'),{code:'AI_TIMEOUT'})), timeout)
    req.on('close', () => clearTimeout(timer)); req.on('error', reject)
    req.end(method==='GET'?undefined:JSON.stringify(body))
  })
}
const active = new Set<string>()
export async function callAI(userId: string, featureId: string, prompt: string, test = false, examId: string | null = null, context: Record<string, unknown> = {}, options: {requireLive?:boolean;instructions?:string;validateResult?:(text:string)=>void} = {}) {
  const feature = (await db.query('SELECT * FROM ai_features WHERE id=$1', [featureId])).rows[0]
  if (!feature) fail(404, 'AI功能不存在')
  if (!test && !feature.enabled) fail(403, '该AI功能尚未启用')
  const config: AIConfig = feature.config
  if(options.requireLive&&(config.mode!=='live'||!feature.encrypted_key))fail(503,'AI 判分服务未配置，请联系管理员；作答已保存，可稍后重试')
  const lock = `${userId}:${featureId}`
  if (active.has(lock)) fail(429, '该功能正在处理上一条请求')
  active.add(lock)
  try {
    const count = (await db.query(`SELECT count(*)::int AS n FROM ai_calls WHERE user_id=$1 AND feature_id=$2 AND created_at >= date_trunc('day',now() AT TIME ZONE 'Asia/Shanghai') AT TIME ZONE 'Asia/Shanghai'`, [userId, featureId])).rows[0].n
    if (count >= config.dailyLimit) fail(429, '今日调用额度已用完')
    const callId = id(); const start = Date.now()
    const endpoint = config.baseUrl.replace(/\/$/, '') + (config.protocol === 'chat' ? '/chat/completions' : '/responses')
    let input: number | null = null; let output: number | null = null; let cached: number | null = null; let cost: number | null = null
    let result = ''; let error = ''; let status = 'success'
    const pricing = { inputPrice: config.inputPrice, outputPrice: config.outputPrice, cachedPrice: config.cachedPrice, currency: 'CNY', unit: '1M tokens', source: 'administrator', mode: config.mode }
    try {
      if (config.mode === 'mock') {
        result = '【测试内容】本地适配器已连通。本响应不来自真实AI模型，不构成正式学习建议或评分。'
        input = output = cached = cost = 0
      } else {
        if (!feature.encrypted_key) fail(400, '请先配置API Key')
        const text = test ? '这是测试内容。请只回复：接口连接成功。' : prompt
        const instructions=[config.prompt,options.instructions].filter(Boolean).join('\n\n')
        const request = config.protocol === 'chat'
          ? { model: config.model, messages: [{ role: 'system', content: instructions }, { role: 'user', content: text }], max_completion_tokens: test ? 128 : config.maxTokens, stream: false }
          : { model: config.model, instructions, input: text, max_output_tokens: test ? 128 : config.maxTokens, stream: false }
        const data = await upstream(new URL(endpoint), decrypt(feature.encrypted_key), request, config.timeoutSeconds * 1000)
        result = config.protocol === 'chat' ? data.choices?.[0]?.message?.content : data.output?.flatMap((x: any) => x.content || []).filter((x: any) => x.type === 'output_text').map((x: any) => x.text).join('\n')
        if (typeof result !== 'string' || !result.trim()) throw new Error('接口未返回可用文本')
        const u = data.usage
        input = u?.prompt_tokens ?? u?.input_tokens ?? null
        output = u?.completion_tokens ?? u?.output_tokens ?? null
        cached = u ? u.prompt_tokens_details?.cached_tokens ?? u.input_tokens_details?.cached_tokens ?? 0 : null
        if (input !== null && output !== null && cached !== null) cost = tokenCost(input, output, cached, config)
      }
      options.validateResult?.(result)
    } catch (e) { status = 'failed'; error = e instanceof Error ? e.message : 'AI请求失败' }
    await db.query(`INSERT INTO ai_calls(id,feature_id,user_id,model,endpoint,status,input_tokens,output_tokens,cached_tokens,cost_yuan,pricing,duration_ms,error,result,is_test,exam_id,context) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`, [callId, featureId, userId, config.model, config.mode === 'mock' ? 'local:test-adapter' : endpoint, status, input, output, cached, cost, JSON.stringify(pricing), Date.now() - start, error || null, result || null, test || config.mode === 'mock', examId, JSON.stringify(context)])
    return { id: callId, status, result, error, inputTokens: input, outputTokens: output, cachedTokens: cached, estimatedCost: cost, durationMs: Date.now() - start, mode: config.mode }
  } finally { active.delete(lock) }
}
