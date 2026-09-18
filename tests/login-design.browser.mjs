import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {readFile,mkdir} from 'node:fs/promises'
import {resolve,extname,sep} from 'node:path'
import {chromium,expect} from '@playwright/test'
import {profileFixture} from './helpers/user-profile-fixture.ts'
import {finishLoginConsent} from './helpers/login-consent.mjs'

// Isolated API fixture: never sends SMS or changes the developer's database.
const f=await profileFixture(),root=resolve('apps/user/dist/build/h5')
const server=createServer(async(req,res)=>{
 const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname)
 const file=resolve(root,'.'+(pathname==='/'?'/index.html':pathname))
 if(!file.startsWith(root+sep)){res.writeHead(403).end();return}
 try{const content=await readFile(file);res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.png':'image/png','.json':'application/json','.woff2':'font/woff2','.ttf':'font/ttf'})[extname(file)]||'application/octet-stream');res.end(content)}catch{res.writeHead(404).end()}
})
server.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r))
let browser
try{
 browser=await chromium.launch({channel:'chrome',headless:true})
 const context=await browser.newContext({viewport:{width:375,height:812},reducedMotion:'reduce'})
 await context.route('**/api/**',async route=>{const u=new URL(route.request().url());if(!u.pathname.startsWith('/api/'))return route.continue();await route.fulfill({response:await route.fetch({url:f.origin+u.pathname+u.search})})})
 const page=await context.newPage(),errors=[]
 page.on('pageerror',e=>errors.push(e.message))
 const origin='http://127.0.0.1:'+server.address().port
 await page.goto(origin+'/#/pages/login/index?redirect=%2Fpages%2Fprofile%2Findex')
 await expect(page.locator('.login-tip')).toContainText('测试环境')
 await mkdir('.local/qa/login-design',{recursive:true})
 const assertOneScreen=async()=>{
  await expect.poll(()=>page.evaluate(()=>Math.round(document.querySelector('.login-page').getBoundingClientRect().height)-innerHeight)).toBe(0)
  const geometry=await page.evaluate(()=>{
   const scene=document.querySelector('.study-scene').getBoundingClientRect()
   const content=document.querySelector('.login-content')
   return {height:innerHeight,page:document.documentElement.scrollHeight,bottom:scene.bottom,content:content.clientHeight,contentScroll:content.scrollHeight,button:document.querySelector('.login-button').getBoundingClientRect().bottom}
  })
  assert.ok(geometry.page<=geometry.height+1,JSON.stringify(geometry))
  assert.ok(Math.abs(geometry.bottom-geometry.height)<=1,'Artwork stays at screen bottom: '+JSON.stringify(geometry))
  assert.ok(geometry.contentScroll<=geometry.content+1,'Form fits without internal scroll at normal phone sizes: '+JSON.stringify(geometry))
  assert.ok(geometry.button<=geometry.height,'Login button visible')
 }
 for(const [width,height] of [[375,812],[320,568],[320,667],[360,640],[390,844],[430,932],[812,375]]){
  await page.setViewportSize({width,height})
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow at '+width)
  await expect.poll(()=>page.locator('.login-page').evaluate(e=>Math.round(e.getBoundingClientRect().height))).toBe(height)
  await assertOneScreen()
  const targets=await page.locator('.login-content button,.back-button').evaluateAll(els=>els.map(el=>el.getBoundingClientRect().height))
  assert.ok(targets.every(h=>h>=44),'Tap targets at least 44px')
  await page.screenshot({path:`.local/qa/login-design/login-${width}.png`,fullPage:true})
 }
 await page.setViewportSize({width:375,height:812})
 await page.locator('.login-button').focus()
 await page.keyboard.press('Enter')
 await expect(page.locator('.field-error')).toHaveText('请输入正确的 11 位手机号')
 await page.setViewportSize({width:320,height:568})
 await assertOneScreen()
 await page.setViewportSize({width:375,height:812})
 const fields=page.locator('.login-form .field input')
 // Simulate the reduced available viewport when a software keyboard is open.
 await page.setViewportSize({width:375,height:360})
 await fields.nth(0).focus()
 await assertOneScreen()
 await expect(fields.nth(0)).toBeInViewport()
 await page.setViewportSize({width:375,height:812})
 await fields.nth(0).fill('18898761234')
 await expect(page.locator('.field-error')).toHaveCount(0)
 await page.locator('.code-button').click()
 await expect(page.locator('.login-tip')).toHaveText(/测试验证码：\d{4}（不发送短信）/)
 await page.setViewportSize({width:320,height:568})
 await assertOneScreen()
 await page.setViewportSize({width:375,height:812})
 await expect(page.locator('.code-button')).toHaveAttribute('disabled','true')
 await fields.nth(0).fill('18898761235')
 await expect(page.locator('.login-tip')).not.toContainText('测试验证码：')
 await expect(page.locator('.code-button')).not.toHaveAttribute('disabled','true')
 await page.locator('.code-button').click()
 await expect(page.locator('.login-tip')).toHaveText(/测试验证码：\d{4}（不发送短信）/)
 await page.locator('.login-button').click()
 await expect(page.locator('.field-error')).toHaveText('请输入4位验证码')
 const code=(await page.locator('.login-tip').innerText()).match(/\d{4}/)[0]
 await fields.nth(1).fill(code)
 const response=page.waitForResponse(r=>r.url().endsWith('/api/auth/phone')&&r.status()===200)
 await page.locator('.login-button').click()
 const result=await (await response).json()
 if(result.consentRequired){
  await expect(page.locator('.protocol-dialog .primary')).toHaveAttribute('disabled','true')
  await page.screenshot({path:'.local/qa/login-design/consent.png',fullPage:true})
 }
 await finishLoginConsent(page,result)
 await expect(page).toHaveURL(/pages\/profile\/index/)
 assert.deepEqual(errors,[])
 console.log('PASS: mobile/landscape layout, tap targets, validation, resend cooldown, phone change, real fixture login, protocol consent and redirect')
}finally{await browser?.close();await new Promise(r=>server.close(r));await f.close()}
