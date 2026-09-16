import 'dotenv/config'
import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {chromium,expect} from '@playwright/test'
import {profileFixture} from './helpers/user-profile-fixture.ts'

const f=await profileFixture();let browser
try{
 const before=(await f.db.query('SELECT count(*)::int AS n FROM orders')).rows[0].n
 browser=await chromium.launch({channel:'chrome',headless:true})
 const page=await browser.newPage({viewport:{width:1680,height:1100},reducedMotion:'reduce'}),errors=[]
 page.on('pageerror',e=>errors.push(e.message))
 await page.route('**/api/**',async route=>{const u=new URL(route.request().url());await route.fulfill({response:await route.fetch({url:f.origin+u.pathname+u.search})})})
 await page.addInitScript(token=>sessionStorage.setItem('sxb-admin-token',token),f.token)
 await page.goto('http://127.0.0.1:5180/#users')
 await page.getByRole('textbox',{name:'搜索用户',exact:true}).fill('18700001111')
 await page.getByRole('button',{name:'查询',exact:true}).click()
 await expect(page.locator('.user-management tbody tr')).toHaveCount(1)
 await page.getByRole('button',{name:'人工权益管理',exact:true}).click()
 const drawer=page.locator('.el-drawer.entitlement-drawer')
 await expect(drawer).toBeVisible()
 await drawer.locator('.el-select').click()
 await page.getByRole('option',{name:'初级社会工作师',exact:true}).click()
 await expect(drawer.locator('.current-level')).toContainText('VIP')
 const bounds=await drawer.boundingBox();assert(Math.abs(bounds.x+bounds.width-1680)<2)
 await page.mouse.click(30,400);await expect(drawer).toBeVisible()
 await drawer.getByRole('button',{name:'保存权益',exact:true}).click()
 await expect(drawer).toContainText('请填写至少2个字的调整原因')
 await drawer.getByPlaceholder('请说明赠送、补偿或修正权益的原因').fill('抽屉验证：人工补偿权益')
 await drawer.locator('.el-radio-button').filter({hasText:/^SVIP$/}).click()
 await drawer.getByRole('button',{name:'保存权益',exact:true}).click()
 await page.getByRole('button',{name:'确认生效',exact:true}).click()
 await expect(drawer.locator('.current-level')).toContainText('SVIP')
 await expect(drawer).toContainText('人工设置生效中')
 assert.equal((await f.call(f.scopeB+'/overview')).current.level,'svip')
 assert.equal((await f.db.query('SELECT count(*)::int AS n FROM orders')).rows[0].n,before)
 await mkdir('.local/qa/entitlements',{recursive:true})
 await page.screenshot({path:'.local/qa/entitlements/drawer.png',animations:'disabled'})
 await page.setViewportSize({width:390,height:844})
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
 await expect(drawer.getByRole('button',{name:'保存权益',exact:true})).toBeVisible()
 await page.screenshot({path:'.local/qa/entitlements/drawer-mobile.png',animations:'disabled'})
 await page.setViewportSize({width:1680,height:1100})
 await drawer.getByPlaceholder('请说明赠送、补偿或修正权益的原因').fill('抽屉验证：恢复有效订单权益')
 await drawer.getByRole('button',{name:'恢复订单权益',exact:true}).click()
 await page.getByRole('button',{name:'确认生效',exact:true}).click()
 await expect(drawer.locator('.current-level')).toContainText('VIP')
 await expect(drawer.locator('.current-level')).toContainText('订单权益')
 await drawer.getByRole('button',{name:'关闭',exact:true}).click();await expect(drawer).toBeHidden()
 assert.deepEqual(errors,[])
 console.log(JSON.stringify({status:'PASS',drawer:true,backdrop:true,manualSet:true,restore:true,noOrderCreated:true,mobile:true,liveWrites:0}))
}finally{await browser?.close();await f.close()}
