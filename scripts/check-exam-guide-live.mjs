import 'dotenv/config'
import assert from 'node:assert/strict'
import {chromium,expect} from '@playwright/test'
import {mkdir} from 'node:fs/promises'
const output='.local/qa/exam-guide';await mkdir(output,{recursive:true})
const auth=await fetch('http://127.0.0.1:4310/api/auth/admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:process.env.ADMIN_PHONE,password:process.env.ADMIN_PASSWORD})});assert.equal(auth.status,200)
const {token}=await auth.json(),headers={Authorization:'Bearer '+token}
const data=await(await fetch('http://127.0.0.1:4310/api/admin/exam-projects',{headers})).json();assert(Array.isArray(data)&&data.length)
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
 const page=await browser.newPage({viewport:{width:1733,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(t=>sessionStorage.setItem('sxb-admin-token',t),token)
 await page.goto('http://127.0.0.1:5180/#exam-projects');const row=page.locator('tbody tr').filter({hasText:data[0].name});await expect(row).toBeVisible();await expect(page.locator('thead')).toContainText('了解考试');await page.screenshot({path:output+'/live-list.png',animations:'disabled'})
 await row.getByRole('button',{name:'编辑'+data[0].name,exact:true}).click();const drawer=page.locator('.exam-project-drawer:visible');await expect(drawer.getByRole('tab')).toHaveText(['基本信息','考期','了解考试']);await page.screenshot({path:output+'/live-basic.png',animations:'disabled'})
 await drawer.getByRole('tab',{name:'考期',exact:true}).click();await expect(drawer.getByPlaceholder('选择开始时间').first()).toBeVisible();await expect(drawer.getByPlaceholder('选择结束时间').first()).toBeVisible();await page.screenshot({path:output+'/live-terms.png',animations:'disabled'})
 await page.setViewportSize({width:390,height:844});assert.equal(await drawer.evaluate(el=>el.scrollWidth>el.clientWidth),false);await page.screenshot({path:output+'/live-terms-small.png',animations:'disabled'});await page.setViewportSize({width:1733,height:1100})
 await drawer.getByRole('tab',{name:'了解考试',exact:true}).click();await expect(drawer.getByText('选填',{exact:true})).toBeVisible();if(data[0].year_entries.length)await expect(drawer.getByRole('button',{name:'插入图片',exact:true})).toBeVisible();else await expect(drawer.getByText('请先配置考期',{exact:true})).toBeVisible();await page.screenshot({path:output+'/live-guide.png',animations:'disabled'})
 await page.setViewportSize({width:390,height:844});assert.equal(await drawer.evaluate(el=>el.scrollWidth>el.clientWidth),false);await page.screenshot({path:output+'/live-small.png',animations:'disabled'});await drawer.getByRole('button',{name:'返回',exact:true}).click()
 await page.setViewportSize({width:1733,height:1100});await page.goto('http://127.0.0.1:5180/#article');await expect(page).toHaveURL(/#exam-projects$/)
 await page.goto('http://127.0.0.1:5180/#permissions');await expect(page.getByText('普通会员',{exact:true})).toBeVisible();await expect(page.getByText('免费版',{exact:true})).toHaveCount(0)
 const mobile=await browser.newPage({viewport:{width:375,height:812}});await mobile.goto('http://127.0.0.1:5174/#/pages/exam-notice-detail/index');await expect(mobile.locator('.guide-heading')).toBeVisible();await expect(mobile.getByText('加载中',{exact:true})).toBeHidden({timeout:15000});await mobile.screenshot({path:output+'/live-mobile.png',fullPage:true});await mobile.close()
 assert.deepEqual(errors,[]);console.log(JSON.stringify({status:'PASS',list:true,tabs:true,responsive:true,frontend:true,legacyRedirect:true,contentWrites:0}))
}finally{await browser.close()}
