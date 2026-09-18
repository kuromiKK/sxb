import {test} from 'node:test'
import assert from 'node:assert/strict'
import {request} from '../apps/admin/src/api.ts'

test('admin requests explain outages, preserve validation errors and expire empty unauthorized responses',async t=>{
  let removed=false,unauthorized=false
  for(const [key,value] of Object.entries({
    sessionStorage:{getItem:()=>null,removeItem:()=>{removed=true}},
    window:{dispatchEvent:(event:Event)=>{unauthorized=event.type==='sxb-unauthorized'}},
  })){
    const original=Object.getOwnPropertyDescriptor(globalThis,key)
    Object.defineProperty(globalThis,key,{configurable:true,value})
    t.after(()=>{if(original)Object.defineProperty(globalThis,key,original);else Reflect.deleteProperty(globalThis,key)})
  }
  const fetchMock=t.mock.method(globalThis,'fetch')
  const reply=(body:string|null,status:number)=>fetchMock.mock.mockImplementation(async()=>new Response(body,{status}))
  reply('',500)
  await assert.rejects(request('/exams'),/后台服务暂时不可用/)
  reply('<html>Bad Gateway</html>',502)
  await assert.rejects(request('/exams'),/后台服务暂时不可用/)
  reply('',401)
  await assert.rejects(request('/exams'),/登录已过期/)
  assert.ok(removed&&unauthorized)
  reply(JSON.stringify({message:'知识点不存在'}),400)
  await assert.rejects(request('/exams'),/知识点不存在/)
  reply('',200)
  await assert.rejects(request('/exams'),/服务器未返回数据/)
  reply('{',200)
  await assert.rejects(request('/exams'),/数据格式异常/)
  reply(null,204)
  assert.equal(await request('/exams'),undefined)
  reply('[{"id":"exam"}]',200)
  assert.deepEqual(await request('/exams'),[{id:'exam'}])
  fetchMock.mock.mockImplementation(async()=>{throw new TypeError('Failed to fetch')})
  await assert.rejects(request('/exams'),/无法连接后台服务/)
  const controller=new AbortController();controller.abort()
  await assert.rejects(request('/exams',{signal:controller.signal}),/Failed to fetch/)
})
