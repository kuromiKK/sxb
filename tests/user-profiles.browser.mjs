import 'dotenv/config'
import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {chromium,expect} from '@playwright/test'
import {profileFixture} from './helpers/user-profile-fixture.ts'
const f=await profileFixture();let browser
try{
 browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1680,height:1100},reducedMotion:'reduce'}),errors=[]
 page.on('pageerror',e=>errors.push(e.message))
 let reads=0
 await page.route('**/api/**',async route=>{const u=new URL(route.request().url());if(!u.pathname.startsWith('/api/'))return route.continue();assert.equal(route.request().method(),'GET','profile UI must not modify accounts or learning data');reads++;await route.fulfill({response:await route.fetch({url:f.origin+u.pathname+u.search})})})
 await page.addInitScript(token=>sessionStorage.setItem('sxb-admin-token',token),f.token)
 await mkdir('.local/qa/user-profiles',{recursive:true});await page.goto('http://127.0.0.1:5180/#users')
 await expect(page.locator('.user-management tbody tr').first()).toBeVisible()
 await page.getByRole('textbox',{name:'搜索用户',exact:true}).fill('18700001111');await page.getByRole('button',{name:'查询',exact:true}).click();await expect(page.locator('.user-management tbody tr')).toHaveCount(1)
 await page.getByRole('button',{name:'用户详情',exact:true}).click();const profile=page.locator('.user-profile'),drawer=page.locator('.user-profile-drawer:visible')
 await expect(profile.locator('.profile-identity')).toContainText('18700001111')
 async function chooseExam(name,waitMembership=true){await profile.locator('.el-select').filter({has:page.getByRole('combobox',{name:'档案考试项目',exact:true})}).click();await page.getByRole('option').filter({hasText:name}).click();await expect(profile.locator('.profile-scope .el-select')).toContainText(name);if(waitMembership)await expect(profile.locator('.scope-membership')).toHaveText('当前权益：'+(name==='初级社会工作师'?'VIP':'SVIP'))}
 await chooseExam('初级社会工作师');await expect(profile.locator('.rights-level')).toHaveText('VIP');await expect(profile.locator('.profile-metrics .metric-2')).toContainText('3次')
 await page.screenshot({path:'.local/qa/user-profiles/overview.png',fullPage:true,animations:'disabled'})
 await chooseExam('中级社会工作师');await expect(profile.locator('.rights-level')).toHaveText('SVIP');await chooseExam('初级社会工作师');await expect(profile.locator('.rights-level')).toHaveText('VIP')
 await profile.getByRole('tab',{name:'学习数据',exact:true}).click();await expect(profile.locator('.profile-content tbody tr')).toHaveCount(1);await expect(profile.locator('.profile-content tbody')).toContainText('初级专属学习访问')
 await profile.getByRole('button',{name:'查看学习记录',exact:true}).click();await expect(page.getByRole('dialog',{name:'学习记录详情',exact:true})).toContainText('初级专属学习访问');await page.getByRole('dialog',{name:'学习记录详情',exact:true}).getByRole('button',{name:'关闭',exact:true}).click()
 for(const [tab,count,fragment] of [['答题记录',3,'初级专属题目'],['错题本',1,'初级专属题目1'],['收藏',1,'初级专属knowledge'],['笔记',1,'初级专属笔记正文']]){
  await profile.getByRole('tab',{name:tab,exact:true}).click();await expect(profile.locator('.learning-collections tbody tr')).toHaveCount(count);await expect(profile.locator('.learning-collections tbody')).toContainText(fragment);await expect(profile.getByRole('combobox',{name:'考试项目',exact:true})).toHaveCount(0);await expect(profile.getByRole('textbox',{name:'筛选用户',exact:true})).toHaveCount(0)
  await profile.getByRole('button',{name:'查看'+tab+'详情',exact:true}).first().click();const detail=page.getByRole('dialog',{name:tab+'详情',exact:true});await expect(detail).toBeVisible();await expect(detail).toContainText('初级社会工作师');await detail.getByRole('button',{name:'关闭',exact:true}).click()
  await chooseExam('中级社会工作师');await expect(profile.locator('.learning-collections tbody tr')).toHaveCount(1);await expect(profile.locator('.learning-collections tbody')).not.toContainText('初级专属');await chooseExam('初级社会工作师');await expect(profile.locator('.learning-collections tbody tr')).toHaveCount(count)
 }
 await page.screenshot({path:'.local/qa/user-profiles/notes.png',fullPage:true,animations:'disabled'})
 await profile.getByRole('tab',{name:'章节掌握',exact:true}).click();const subject=profile.locator('tbody tr').filter({hasText:'初级专属subject'});await expect(subject).toContainText('67%');await expect(subject).toContainText('100%');await chooseExam('中级社会工作师');await expect(profile.locator('tbody')).not.toContainText('初级专属subject');await expect(profile.locator('tbody')).toContainText('中级专属subject')
 await chooseExam('初级社会工作师');await profile.getByRole('tab',{name:'购买记录',exact:true}).click();await expect(profile.locator('.profile-content tbody tr')).toHaveCount(2);await profile.getByRole('button',{name:'查看订单',exact:true}).first().click();const order=page.getByRole('dialog',{name:'订单详情',exact:true});await expect(order).toContainText('初级社会工作师');await expect(order).not.toContainText('中级专属商品');await order.getByRole('button',{name:'关闭',exact:true}).click()
 await chooseExam('中级社会工作师');await expect(profile.locator('.profile-content tbody tr')).toHaveCount(1);await expect(profile.locator('tbody')).toContainText('中级专属商品');await chooseExam('初级社会工作师')
 await profile.getByRole('tab',{name:'权益履约',exact:true}).click();await expect(profile.locator('.fulfillment-current')).toContainText('VIP');await expect(profile.locator('.profile-content')).toContainText('初级退款记录');await expect(profile.locator('.profile-content')).not.toContainText('中级记录隔离');await page.screenshot({path:'.local/qa/user-profiles/fulfillment.png',fullPage:true,animations:'disabled'})
 await profile.getByRole('tab',{name:'推荐关系',exact:true}).click();await expect(profile.locator('.profile-content')).toContainText('18700002222');await chooseExam('中级社会工作师');await expect(profile.locator('.profile-content')).not.toContainText('18700002222')
 await profile.getByRole('tab',{name:'学习计划',exact:true}).click();await expect(profile.getByText('等待开发',{exact:true})).toBeVisible()
 await profile.getByRole('tab',{name:'账号管理记录',exact:true}).click();await expect(profile.locator('.profile-content')).toContainText('开发者设置')
 // Delayed old responses must not overwrite a newly selected exam.
 await page.route('**/api/admin/user-profiles/*/exams/junior-social-worker/overview?*',async route=>{const u=new URL(route.request().url()),response=await route.fetch({url:f.origin+u.pathname+u.search});await new Promise(r=>setTimeout(r,600));await route.fulfill({response})})
 await profile.getByRole('tab',{name:'用户概览',exact:true}).click();await chooseExam('初级社会工作师',false);await chooseExam('中级社会工作师');await expect(profile.locator('.rights-level')).toHaveText('SVIP');await page.waitForTimeout(800);await expect(profile.locator('.rights-level')).toHaveText('SVIP');await expect(profile.locator('.scope-membership')).toHaveText('当前权益：SVIP')
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await expect(profile.getByRole('combobox',{name:'档案考试项目',exact:true})).toBeVisible();await page.screenshot({path:'.local/qa/user-profiles/mobile.png',fullPage:true,animations:'disabled'})
 await page.setViewportSize({width:1680,height:1100});await drawer.locator('.el-drawer__close-btn').click();await expect(drawer).toBeHidden();assert.deepEqual(errors,[])
 console.log(JSON.stringify({status:'PASS',exactUser:true,examSwitching:true,learningTabs:5,mastery:true,orderDetail:true,fulfillment:true,referrals:true,planPlaceholder:true,staleResponseGuard:true,mobile:true,requests:reads,writes:0}))
}finally{await browser?.close();await f.close()}
