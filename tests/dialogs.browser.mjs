import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {chromium,expect} from '@playwright/test'
import {profileFixture} from './helpers/user-profile-fixture.ts'
const f=await profileFixture()
let browser
try{
 browser=await chromium.launch({channel:'chrome',headless:true})
 const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'})
 await context.addInitScript(({token,exam})=>{localStorage.setItem('sxb-api-token',JSON.stringify({type:'string',data:token}));localStorage.setItem('sxb-current-exam',JSON.stringify({type:'object',data:{id:exam,name:'初级社会工作师'}}))},{token:f.student,exam:f.exam})
 await context.route('**/api/**',async route=>{const u=new URL(route.request().url());if(!u.pathname.startsWith('/api/'))return route.continue();await route.fulfill({response:await route.fetch({url:f.origin+u.pathname+u.search})})})
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message))
 await mkdir('.local/qa/dialogs',{recursive:true})
 await page.goto('http://127.0.0.1:5174/#/pages/profile/index')
 await page.waitForLoadState('networkidle')
 await page.locator('.menu-row').filter({hasText:'使用推荐码'}).click()
 await expect(page.locator('.service-modal')).toHaveCSS('border-radius','24px')
 await expect(page.locator('.service-modal .copy-button')).toHaveCSS('border-radius','12px')
 assert.ok((await page.locator('.service-modal .copy-button').boundingBox()).height>=44)
 await page.screenshot({path:'.local/qa/dialogs/referral.png'})
 await page.locator('.service-modal .cancel-button').click()
 await expect(page.locator('.service-modal')).toHaveCount(0)
 await page.locator('.menu-row').filter({hasText:'联系客服'}).click()
 await expect(page.locator('.customer-dialog')).toHaveCSS('border-radius','24px')
 await page.locator('.customer-close').click()
 // Exercise the public showModal API, including callback/Promise semantics and one-button alerts.
 await page.evaluate(()=>{window.dialogResult=null;uni.showModal({title:'操作提示',content:'学习记录已保存，你可以稍后继续。',showCancel:false,confirmText:'知道了',success:r=>window.dialogResult=r})})
 await expect(page.locator('uni-modal')).toHaveCSS('opacity','1')
 await expect(page.locator('.uni-modal__btn')).toHaveCount(1)
 await page.screenshot({path:'.local/qa/dialogs/alert.png'})
 await page.locator('.uni-modal__btn_primary').click()
 await expect.poll(()=>page.evaluate(()=>window.dialogResult?.confirm)).toBe(true)
 for(const viewport of [{width:320,height:568},{width:390,height:844},{width:844,height:390}]){
  await page.setViewportSize(viewport)
  await page.evaluate(()=>{window.dialogResult=null;uni.showModal({title:'确认操作',content:'请核对后继续。\n'+('这里是一段较长的提示，确认和取消操作需要始终可以点击。\n'.repeat(30)),confirmText:'确认',cancelText:'取消'}).then(r=>window.dialogResult=r)})
  await expect(page.locator('uni-modal')).toHaveCSS('opacity','1')
  const modal=await page.locator('.uni-modal').boundingBox(),action=await page.locator('.uni-modal__btn_primary').boundingBox()
  assert.ok(modal.x>=0&&modal.y>=0&&modal.x+modal.width<=viewport.width&&modal.y+modal.height<=viewport.height)
  assert.ok(action.height>=44&&action.y+action.height<=viewport.height)
  await page.screenshot({path:`.local/qa/dialogs/long-${viewport.width}.png`})
  await page.locator('.uni-modal__btn_default').click()
  await expect.poll(()=>page.evaluate(()=>window.dialogResult?.cancel)).toBe(true)
 }
 await page.setViewportSize({width:390,height:844});await page.emulateMedia({colorScheme:'dark'})
 await page.evaluate(()=>{uni.showModal({title:'深色系统下的提示',content:'界面保持平台的浅色卡片样式。'})})
 await expect(page.locator('uni-modal')).toHaveCSS('opacity','1')
 await expect(page.locator('.uni-modal')).toHaveCSS('background-color','rgb(255, 255, 255)')
 await expect(page.locator('.uni-modal__btn_primary')).toHaveCSS('color','rgb(255, 255, 255)')
 await page.keyboard.press('Escape');await expect(page.locator('uni-modal')).toBeHidden()
 assert.deepEqual(errors,[])
 console.log('PASS: shared rounded dialogs, inset actions, custom service/referral cards, native confirm/cancel/alert callbacks, long content, small phones, landscape and dark system preference')
}finally{await browser?.close();await f.close()}
