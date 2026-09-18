import assert from 'node:assert/strict'
import {chromium,expect} from '@playwright/test'
import {profileFixture} from './helpers/user-profile-fixture.ts'
import {finishLoginConsent} from './helpers/login-consent.mjs'

// The development runtime exposes uni navigation for multi-step route tests.
// All API calls are routed to the isolated fixture, never the user's database.
const f=await profileFixture(),origin='http://127.0.0.1:5174'
let browser
try {
 browser=await chromium.launch({channel:'chrome',headless:true})
 const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'})
 await context.route('**/api/**',async route=>{const u=new URL(route.request().url());if(!u.pathname.startsWith('/api/'))return route.continue();await route.fulfill({response:await route.fetch({url:f.origin+u.pathname+u.search})})})
 const page=await context.newPage(),errors=[]
 page.on('pageerror',e=>errors.push(e.message))
 const go=async url=>{await page.evaluate(url=>uni.navigateTo({url}),url)}
 const path=()=>page.evaluate(()=>getCurrentPages().at(-1)?.route)
 const expectPath=async expected=>expect.poll(path).toBe(expected.replace(/^\//,''))
 // Login cancellation goes to the actual origin, including after reload.
 for(const source of ['/pages/knowledge/index','/pages/courses/index','/pages/practice/index']) {
  await page.goto(origin+'/#'+source)
  await page.locator('.app-tabbar').waitFor()
  await page.getByRole('button',{name:'我的',exact:true}).click()
  await expectPath('/pages/login/index')
  await expect(page.locator('.scene-ground')).toHaveCount(0)
  await page.reload()
  await page.getByRole('button',{name:'返回',exact:true}).click()
  await expectPath(source)
  await expect(page.locator('.app-tabbar')).toBeVisible()
 }
 // Login protocols retain the login form and return to it; no source/target conflation.
 await page.getByRole('button',{name:'我的',exact:true}).click()
 await page.locator('#login-phone input').fill('18898765555')
 await page.getByRole('button',{name:'用户服务协议',exact:true}).click()
 await page.locator('.top-bar uni-button').first().click()
 await expectPath('/pages/login/index')
 await expect(page.locator('#login-phone input')).toHaveValue('18898765555')
 await page.getByRole('button',{name:'返回',exact:true}).click()
 await expectPath('/pages/practice/index')
 // Deep routes keep query parameters and the complete nested chain after a refresh.
 await go('/pages/profile-center/index?mode=about')
 await page.getByText('用户服务协议',{exact:true}).click()
 await expect(page).toHaveURL(/mode=agreement/)
 await page.reload()
 await page.locator('.top-bar uni-button').first().click()
 await expect(page).toHaveURL(/mode=about/)
 await page.locator('.top-bar uni-button').first().click()
 await expectPath('/pages/practice/index')
 // A direct login link with no in-app source has a safe fallback, never an off-site back.
 const direct=await context.newPage()
 await direct.goto(origin+'/#/pages/login/index?redirect=%252Fpages%252Fprofile%252Findex')
 await direct.getByRole('button',{name:'返回',exact:true}).click()
 await expect.poll(()=>direct.evaluate(()=>getCurrentPages().at(-1)?.route)).toBe('pages/index/index')
 await direct.goto(origin+'/#/pages/profile/index')
 await expect(direct.locator('.login-page')).toBeVisible()
 await direct.getByRole('button',{name:'返回',exact:true}).click()
 await expect.poll(()=>direct.evaluate(()=>getCurrentPages().at(-1)?.route)).toBe('pages/index/index')
 await direct.close()
 // Auth success replaces login, so backing out of the destination does not show login again.
 await go('/pages/login/index?redirect='+encodeURIComponent('/pages/profile-center/index?mode=about'))
 await page.locator('#login-phone input').fill('18898765556')
 await page.locator('.code-button').click()
 await expect(page.locator('.login-tip')).toHaveText(/测试验证码：\d{4}/)
 await page.locator('#login-code input').fill((await page.locator('.login-tip').innerText()).match(/\d{4}/)[0])
 const response=page.waitForResponse(r=>r.url().endsWith('/api/auth/phone')&&r.status()===200)
 await page.locator('.login-button').click()
 await finishLoginConsent(page,await(await response).json())
 await expect(page).toHaveURL(/mode=about/)
 assert.ok(!(await page.evaluate(()=>getCurrentPages().map(p=>p.route))).includes('pages/login/index'))
 await page.locator('.top-bar uni-button').first().click()
 await expectPath('/pages/practice/index')
 // Payment back follows its entry page; no charge is created by this check.
 await context.route('**/api/products?*',route=>route.fulfill({json:[{id:'navigation-product',title:'导航测试套餐',type:'entitlement',level:'vip',priceCents:2990,examName:'测试考试',year:2027,endsAt:'2027-12-31T00:00:00Z'}]}))
 await go('/pages/products/index')
 await expectPath('/pages/products/index')
 await page.locator('.shop-product').first().click()
 await expect(page).toHaveURL(/products\/index\?id=/)
 await expect(page.locator('.shop-detail')).toBeVisible()
 await page.locator('.shop-nav uni-button').click()
 await expect(page).not.toHaveURL(/\?id=/)
 await expect(page.locator('.shop-product').first()).toBeVisible()
 await go('/pages/payment/index?orderId=a-order')
 await page.locator('.pay-page .back').click()
 await expectPath('/pages/products/index')
 await page.locator('.shop-nav uni-button').click()
 await expectPath('/pages/practice/index')
 // An outdated returnUrl must not override the real entry page.
 await go('/pages/practice-session/index?knowledgePointId=a-k&returnUrl='+encodeURIComponent('/pages/learning-plan/index'))
 await page.locator('.session-top .back-button').click()
 await expectPath('/pages/practice/index')
 // Native/browser back and repeated top-level navigation do not accumulate tab pages.
 for(let i=0;i<3;i++)for(const label of ['知识图谱','精讲课','刷题']){
  await page.getByRole('button',{name:label,exact:true}).click()
  await expect(page.locator('.app-tabbar [aria-current="page"]')).toHaveAttribute('aria-label',label)
 }
 assert.ok(await page.evaluate(()=>getCurrentPages().length<=5))
 await go('/pages/profile-center/index?mode=about')
 await page.goBack()
 await expectPath('/pages/practice/index')
 assert.deepEqual(errors,[])
 console.log('PASS: login cancel from three tabs, refresh source recovery, protocol/form state, nested query routes, direct-link fallback, login consumes itself, payment returns to source, no dark bottom line')
 await context.unrouteAll({behavior:'wait'})
}finally{await browser?.close();await f.close()}
