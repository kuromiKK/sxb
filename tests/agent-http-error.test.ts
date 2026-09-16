import {test} from 'node:test'
import assert from 'node:assert/strict'
import {agentHttpError} from '../apps/admin/src/utils/agent-http-error.ts'
test('agent errors preserve platform explanations and translate missing/HTML errors',async()=>{
 const message='API 域名解析到了内网或保留地址，连接已拦截'
 const response=new Response(JSON.stringify({message}),{status:400})
 assert.equal(await agentHttpError(response),message)
 assert.equal((await response.json()).message,message,'original response remains readable')
 assert.equal(await agentHttpError(new Response(JSON.stringify({error:{message:'模型无权限'}}),{status:403})),'模型无权限')
 const missing=await agentHttpError(new Response('<html>Not Found</html>',{status:404}))
 assert.match(missing,/接口不存在/);assert(!missing.includes('<html>'))
 assert.match(await agentHttpError(new Response('',{status:429})),/频繁|额度/)
})
