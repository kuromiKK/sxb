import { z } from 'zod'
import { lookup } from 'node:dns/promises'
import https from 'node:https'
import { isIP } from 'node:net'
import { db } from './db.ts'
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
  return (await db.query('SELECT id,name,enabled,config,encrypted_key IS NOT NULL AS has_key,updated_at FROM ai_features ORDER BY id')).rows
}
export async function saveFeature(actor: string, feature: string, body: unknown) {
  const value = z.object({ enabled: z.boolean(), config: aiConfigSchema, apiKey: z.string().max(2048).optional(), clearKey: z.boolean().optional() }).parse(body)
  const url = new URL(value.config.baseUrl)
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) fail(400, 'API地址必须为不含凭据和查询参数的HTTPS地址')
  const existing = (await db.query('SELECT * FROM ai_features WHERE id=$1', [feature])).rows[0]
  if (!existing) fail(404, 'AI功能不存在')
  const secret = value.clearKey ? null : value.apiKey ? encrypt(value.apiKey) : existing.encrypted_key
  if (value.enabled && value.config.mode === 'live' && !secret) fail(400, '请先填写API Key')
  await db.query('UPDATE ai_features SET enabled=$2,config=$3,encrypted_key=$4,updated_at=now() WHERE id=$1', [feature, value.enabled, JSON.stringify(value.config), secret])
  await audit(actor, 'ai.configure', feature, { enabled: value.enabled, model: value.config.model, mode: value.config.mode })
}
export const privateAddress = (ip: string) => {
  if(isIP(ip)!==4)return true
  const [a,b]=ip.split('.').map(Number)
  return a===0||a===10||a===127||a>=224||(a===100&&b>=64&&b<=127)||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&(b===168||b===0||b===2))||(a===198&&(b===18||b===19||b===51))||(a===203&&b===0)
}
async function upstream(url: URL, secret: string, body: any, timeout: number): Promise<any> {
  const addresses = await lookup(url.hostname, { all: true, family: 4 })
  if (!addresses.length || addresses.some(a => privateAddress(a.address))) fail(400, '不允许连接内网或保留地址')
  // Pin the validated DNS result so a later DNS change cannot redirect to the local network.
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: 'POST', headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' }, lookup: (_host, _options, callback) => callback(null, addresses[0].address, 4) }, response => {
      let text = ''; let length = 0
      response.on('data', chunk => { length += chunk.length; if (length > 2_000_000) req.destroy(new Error('AI响应超过大小限制')); else text += chunk.toString() })
      response.on('end', () => {
        if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) return reject(new Error(`中转接口返回HTTP ${response.statusCode || '未知'}，请检查地址、额度和模型权限`))
        try { resolve(JSON.parse(text)) } catch { reject(new Error('中转接口未返回有效JSON')) }
      })
    })
    const timer = setTimeout(() => req.destroy(new Error('AI请求超时，是否已计费请核对中转账单')), timeout)
    req.on('close', () => clearTimeout(timer)); req.on('error', reject)
    req.end(JSON.stringify(body))
  })
}
const active = new Set<string>()
export async function callAI(userId: string, featureId: string, prompt: string, test = false, examId: string | null = null, context: Record<string, unknown> = {}) {
  const feature = (await db.query('SELECT * FROM ai_features WHERE id=$1', [featureId])).rows[0]
  if (!feature) fail(404, 'AI功能不存在')
  if (!test && !feature.enabled) fail(403, '该AI功能尚未启用')
  const config: AIConfig = feature.config
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
        const request = config.protocol === 'chat'
          ? { model: config.model, messages: [{ role: 'system', content: config.prompt }, { role: 'user', content: text }], max_completion_tokens: test ? 128 : config.maxTokens, stream: false }
          : { model: config.model, instructions: config.prompt, input: text, max_output_tokens: test ? 128 : config.maxTokens, stream: false }
        const data = await upstream(new URL(endpoint), decrypt(feature.encrypted_key), request, config.timeoutSeconds * 1000)
        result = config.protocol === 'chat' ? data.choices?.[0]?.message?.content : data.output?.flatMap((x: any) => x.content || []).filter((x: any) => x.type === 'output_text').map((x: any) => x.text).join('\n')
        if (typeof result !== 'string' || !result.trim()) throw new Error('接口未返回可用文本')
        const u = data.usage
        input = u?.prompt_tokens ?? u?.input_tokens ?? null
        output = u?.completion_tokens ?? u?.output_tokens ?? null
        cached = u ? u.prompt_tokens_details?.cached_tokens ?? u.input_tokens_details?.cached_tokens ?? 0 : null
        if (input !== null && output !== null && cached !== null) cost = tokenCost(input, output, cached, config)
      }
    } catch (e) { status = 'failed'; error = e instanceof Error ? e.message : 'AI请求失败' }
    await db.query(`INSERT INTO ai_calls(id,feature_id,user_id,model,endpoint,status,input_tokens,output_tokens,cached_tokens,cost_yuan,pricing,duration_ms,error,result,is_test,exam_id,context) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`, [callId, featureId, userId, config.model, config.mode === 'mock' ? 'local:test-adapter' : endpoint, status, input, output, cached, cost, JSON.stringify(pricing), Date.now() - start, error || null, result || null, test || config.mode === 'mock', examId, JSON.stringify(context)])
    return { id: callId, status, result, error, inputTokens: input, outputTokens: output, cachedTokens: cached, estimatedCost: cost, durationMs: Date.now() - start, mode: config.mode }
  } finally { active.delete(lock) }
}
