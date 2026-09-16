import 'dotenv/config'
import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'

await mkdir('.local/qa',{recursive:true})
const browser=await chromium.launch({headless:true,channel:'chrome'})
const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'})
const page=await context.newPage()
const errors=[];page.on('pageerror',e=>errors.push(e.message))
try {
  await page.goto('http://127.0.0.1:5180')
  await page.getByPlaceholder('请输入手机号').fill(process.env.ADMIN_PHONE)
  await page.getByPlaceholder('请输入密码').fill('incorrect-password')
  await page.getByRole('button',{name:'登录',exact:true}).click()
  await page.getByText('手机号或密码不正确',{exact:true}).waitFor()
  await page.getByPlaceholder('请输入密码').fill(process.env.ADMIN_PASSWORD)
  await page.getByRole('button',{name:'登录',exact:true}).click()
  await page.locator('.metric-strip').waitFor()
  await page.locator('.el-message').waitFor({state:'hidden'}).catch(()=>{})
  await page.screenshot({path:'.local/qa/admin-dashboard-desktop.png',fullPage:true})
  for(const id of ['knowledge','question','course','exams','users','orders','records','article','announcement','faq','audit','ai']){
    const loaded=page.waitForResponse(r=>r.url().includes(id==='knowledge'?'/api/admin/content?kind=knowledge':id==='question'||id==='course'||id==='article'||id==='announcement'||id==='faq'?`/api/admin/content?kind=${id}`:`/api/admin/${id}`)&&r.status()===200)
    await page.evaluate(id=>location.hash=id,id)
    await loaded
    await page.waitForFunction(()=>!document.querySelector('.el-loading-mask'))
    await page.locator('.page-heading h1').waitFor()
    assert.equal(await page.locator('.error-banner').count(),0)
  }
  await page.screenshot({path:'.local/qa/admin-ai-desktop.png',fullPage:true})
  await page.getByRole('button',{name:'配置',exact:true}).first().click()
  await page.locator('.el-drawer').filter({visible:true}).waitFor()
  await page.screenshot({path:'.local/qa/admin-ai-config.png',fullPage:true})
  await page.getByRole('button',{name:'保存配置',exact:true}).click()
  await page.getByText('AI配置已保存',{exact:true}).waitFor()
  await page.getByRole('button',{name:'测试连接',exact:true}).first().click()
  await page.getByText('本地测试适配器连通，未调用中转商',{exact:true}).waitFor()
  await page.locator('.el-message').last().waitFor({state:'hidden'})
  for(const size of [{width:375,height:812},{width:768,height:1024},{width:932,height:430}]){
    await page.setViewportSize(size)
    await page.evaluate(()=>location.hash='dashboard')
    await page.locator('.metric-strip').waitFor()
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)
    assert.equal(overflow,false,`overflow at ${size.width}`)
    await page.screenshot({path:`.local/qa/admin-${size.width}.png`,fullPage:true})
  }
  assert.deepEqual(errors,[])
  await page.setViewportSize({width:720,height:700})
  await page.evaluate(()=>document.body.style.zoom='2')
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'admin overflow at 200% scaling')
  await page.screenshot({path:'.local/qa/admin-text-200.png',fullPage:true})
  await page.evaluate(()=>document.body.style.zoom='1')
  const user=await context.newPage()
  await user.setViewportSize({width:430,height:932})
  user.on('pageerror',e=>errors.push('user: '+e.message))
  await user.goto('http://127.0.0.1:5174')
  await user.locator('.home.page').waitFor({timeout:60000})
  await user.waitForTimeout(2500)
  await user.screenshot({path:'.local/qa/user-home.png',fullPage:true})
  await user.goto('http://127.0.0.1:5174/#/pages/login/index')
  await user.locator('.login-page').waitFor()
  await user.waitForTimeout(1500)
  await user.locator('.field input').nth(0).fill('13900000001')
  const codeResponse=user.waitForResponse(r=>r.url().endsWith('/api/auth/code')&&r.status()===200)
  await user.locator('.code-button').click()
  const {testCode}=await (await codeResponse).json()
  await expect(user.locator('.login-tip')).toContainText(testCode)
  await user.locator('.field input').nth(1).fill(testCode)
  const loginResponse=user.waitForResponse(r=>r.url().endsWith('/api/auth/phone')&&r.status()===200)
  await user.locator('.login-button').click()
  const {finishLoginConsent}=await import('./helpers/login-consent.mjs')
  const session=await finishLoginConsent(user,await (await loginResponse).json())
  await user.locator('.home.page').waitFor()
  const catalog=await (await context.request.get('http://127.0.0.1:5174/api/catalog/junior-social-worker')).json()
  const question=catalog.practiceQuestions[0]
  await user.goto(`http://127.0.0.1:5174/#/pages/practice-session/index?knowledgePointId=${question.knowledgePointId}`)
  await user.locator('.options').waitFor()
  await user.waitForTimeout(1500)
  const answerResponse=user.waitForResponse(r=>r.url().endsWith('/api/answers')&&r.status()===200)
  await user.locator('.option').first().click()
  await answerResponse
  await expect(user.locator('.analysis-card')).toBeVisible()
  await user.screenshot({path:'.local/qa/user-answer.png',fullPage:true})
  for(const [path,selector] of [
    ['profile/index','.profile-page'],['profile-center/index?mode=security','.security-list'],
    ['knowledge/index','.knowledge-page'],['courses/index','.courses-page'],['practice/index','.practice-page'],
    ['recite/index','.recite-page'],['exam-notices/index','.notice-page']
  ]){
    await user.goto(`http://127.0.0.1:5174/#/pages/${path}`)
    await user.waitForTimeout(1600)
    assert.deepEqual(errors,[],`page errors on ${path}`)
    assert.equal(await user.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`user overflow on ${path}`)
  }
  await user.goto('http://127.0.0.1:5174/#/pages/profile-center/index?mode=security')
  await expect(user.locator('.security-list')).toContainText('139****0001')
  const stats=await (await context.request.get('http://127.0.0.1:5174/api/stats/junior-social-worker',{headers:{Authorization:`Bearer ${session.token}`}})).json()
  assert(stats.todayIds.includes(question.id))
  assert.deepEqual(errors,[])
  console.log('UI smoke passed: admin login, all sections, AI save/test, 4 viewports and 200% scaling; student code login, persisted answer and 7 pages; no page errors.')
} finally {await browser.close()}
