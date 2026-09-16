import {chromium,expect} from '@playwright/test'
import assert from 'node:assert/strict'
import {profileFixture} from './helpers/user-profile-fixture.ts'
import {pageAgentDefaults} from '../apps/shared/workspace-tools.ts'

const f=await profileFixture(),browser=await chromium.launch({channel:'chrome',headless:true})
try{
 const context=await browser.newContext(),page=await context.newPage(),errors=[]
 page.on('pageerror',e=>errors.push(e.message))
 await context.addInitScript(token=>sessionStorage.setItem('sxb-admin-token',token),f.token)
 let failure={status:400,contentType:'application/json',body:JSON.stringify({message:'API 域名解析到了内网或保留地址'})},calls=0
 await context.route('**/api/**',async route=>{
  const u=new URL(route.request().url())
  if(u.pathname.endsWith('/page-agent/runtime'))return route.fulfill({json:{ready:true,config:{...pageAgentDefaults,enabled:true}}})
  if(u.pathname.endsWith('/page-agent/chat/completions')){calls++;return route.fulfill(failure)}
  await route.fulfill({response:await route.fetch({url:f.origin+u.pathname+u.search})})
 })
 await page.goto('http://127.0.0.1:5180/#question')
 await page.locator('.agent-launch').click();await page.locator('.agent-panel textarea').fill('只读当前页面')
 for(const [response,expected] of [
  [failure,'API 域名解析到了内网或保留地址'],
  [{status:404,contentType:'text/html',body:'<html>proxy route missing</html>'},'AI员工接口不存在'],
  [{status:502,contentType:'application/json',body:JSON.stringify({message:'模型服务未找到接口或模型（HTTP 404），请核对 API 地址和模型 ID'})},'模型服务未找到接口或模型（HTTP 404）'],
 ]){
  failure=response
  await page.getByRole('button',{name:'开始任务',exact:true}).click()
  await expect(page.locator('.agent-progress')).toContainText('任务未完成',{timeout:20000})
  await expect(page.locator('.agent-panel')).toContainText(expected)
  await expect(page.locator('.agent-panel')).not.toContainText('InvokeError')
  await expect(page.locator('.agent-panel')).not.toContainText('proxy route missing')
 }
 assert.equal(calls,3);assert.deepEqual(errors,[])
 console.log('PASS actual Page Agent loop displays platform 400, local route 404 and upstream model 404 in Chinese; no raw HTML or InvokeError')
}finally{await browser.close();await f.close()}
