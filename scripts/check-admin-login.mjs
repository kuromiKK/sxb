import 'dotenv/config'
import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, expect } from '@playwright/test'

const output=resolve('.local/qa/admin-login')
await mkdir(output,{recursive:true})
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
  const page=await browser.newPage({viewport:{width:1600,height:1000}})
  const errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.goto('http://127.0.0.1:5180/#knowledge-graph')
  await expect(page.getByRole('heading',{name:'欢迎回来'})).toBeVisible()
  const svg=page.locator('.sxb-energy')
  assert.equal(await svg.locator('image,foreignObject,filter,text').count(),0)
  assert.equal(await svg.getAttribute('viewBox'),'0 0 800 1000')
  assert.equal(await svg.locator('.energy-orbits').evaluate(el=>getComputedStyle(el).animationDuration),'100s')
  await page.getByRole('button',{name:'暂停背景动画'}).click()
  assert.equal(await svg.locator('.energy-orbits').evaluate(el=>getComputedStyle(el).animationPlayState),'paused')
  await page.screenshot({path:resolve(output,'desktop.png'),fullPage:true})
  await page.getByRole('button',{name:'播放背景动画'}).click()
  await page.emulateMedia({reducedMotion:'reduce'})
  for(const selector of ['.energy-orbits','.energy-core'])assert.equal(await svg.locator(selector).evaluate(el=>getComputedStyle(el).animationName),'none')
  await expect(page.locator('.login-motion')).toBeHidden()
  await svg.evaluate(el=>el.style.setProperty('--energy-ice','#ffccaa'))
  assert.equal(await svg.locator('.energy-ice').first().evaluate(el=>getComputedStyle(el).stroke),'rgb(255, 204, 170)')
  await svg.evaluate(el=>el.style.removeProperty('--energy-ice'))
  for(const viewport of [{width:768,height:1024},{width:375,height:812},{width:667,height:375}]){
    await page.setViewportSize(viewport)
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
    await expect(page.getByRole('button',{name:'登录',exact:true})).toBeVisible()
    if(viewport.width===375)await page.screenshot({path:resolve(output,'mobile.png'),fullPage:true})
  }
  await page.setViewportSize({width:1600,height:1000})
  const phone=page.getByPlaceholder('请输入手机号'),password=page.getByPlaceholder('请输入密码')
  await phone.fill(process.env.ADMIN_PHONE)
  await password.fill('invalid-test-password')
  // Exercise error presentation without an actual failed login attempt.
  await page.route('**/api/auth/admin',route=>route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({message:'手机号或密码不正确'})}),{times:1})
  await page.getByRole('button',{name:'登录',exact:true}).click()
  await expect(page.getByRole('alert')).toContainText('手机号或密码不正确')
  await expect(phone).toHaveValue(process.env.ADMIN_PHONE)
  await expect(password).toHaveValue('invalid-test-password')
  await password.fill(process.env.ADMIN_PASSWORD)
  await password.press('Enter')
  await expect(page.locator('.admin-shell')).toBeVisible({timeout:15000})
  assert.deepEqual(errors,[])
  const standalone=await browser.newPage({viewport:{width:800,height:1000},reducedMotion:'reduce'})
  const source=await readFile(resolve('apps/admin/src/assets/login-energy.svg'),'utf8')
  await standalone.setContent(source)
  assert(await standalone.evaluate(s=>new DOMParser().parseFromString(s,'image/svg+xml').querySelector('parsererror')===null,source))
  await standalone.locator('svg').screenshot({path:resolve(output,'energy.png')})
  console.log('PASS: live login, Enter submission, error recovery, desktop/mobile/landscape layout, pause control, reduced motion, configurable SVG colors, valid standalone SVG; no browser errors.')
}finally{await browser.close()}
