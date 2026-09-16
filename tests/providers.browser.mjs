import {chromium,expect} from '@playwright/test'
import {mkdir} from 'node:fs/promises'
import {profileFixture} from './helpers/user-profile-fixture.ts'
const f=await profileFixture(),browser=await chromium.launch({channel:'chrome',headless:true}),errors=[]
try{
 await mkdir('.local/qa/providers',{recursive:true})
 const context=await browser.newContext({viewport:{width:1600,height:1100}})
 await context.addInitScript(token=>sessionStorage.setItem('sxb-admin-token',token),f.token)
 await context.route('**/api/**',async route=>{const u=new URL(route.request().url());if(!u.pathname.startsWith('/api/'))return route.continue();await route.fulfill({response:await route.fetch({url:f.origin+u.pathname+u.search})})})
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:5180/#settings')
 await expect(page.locator('.breadcrumb')).toContainText('系统管理');await page.getByRole('tab',{name:'接口配置',exact:true}).click();await expect(page.locator('.interface-card')).toHaveCount(8)
 await page.screenshot({path:'.local/qa/providers/interfaces.png',fullPage:true})
 await page.getByRole('button',{name:'配置短信',exact:true}).click();await page.getByRole('button',{name:'测试连接',exact:true}).click();await expect(page.locator('.test-results')).toContainText('没有调用阿里云');await expect(page.locator('.test-results')).toContainText('配置版本');await page.getByRole('button',{name:'全部接口'}).click()
 await f.db.query(`UPDATE integration_settings SET config=config||'{"mode":"gocaptcha"}'::jsonb,revision=revision+1 WHERE key='captcha'`)
 await page.reload();await page.getByRole('tab',{name:'接口配置',exact:true}).click();await page.getByRole('button',{name:'配置验证码',exact:true}).click();await page.getByRole('button',{name:'测试连接',exact:true}).click();await expect(page.locator('.test-results')).toContainText('成功生成当前类型',{timeout:15000});await page.screenshot({path:'.local/qa/providers/connection-success.png',fullPage:true});await page.getByRole('button',{name:'全部接口'}).click()
 await page.getByRole('button',{name:'配置微信登录',exact:true}).click();await page.locator('.el-switch').filter({has:page.getByRole('switch',{name:'网站扫码登录',exact:true})}).click();await page.getByLabel('网站应用 AppID',{exact:true}).fill('wx1234567890abcdef');await page.getByLabel('网站应用 AppSecret',{exact:true}).fill('browser-test-secret');await page.getByRole('button',{name:'保存配置',exact:true}).click();await expect(page.getByLabel('网站应用 AppSecret',{exact:true})).toHaveValue('');await expect(page.getByLabel('网站应用 AppSecret',{exact:true})).toHaveAttribute('placeholder',/已安全保存/)
 await page.getByRole('button',{name:'检查配置',exact:true}).click();await expect(page.locator('.provider-form .el-alert')).toContainText('HTTPS')
 await page.getByRole('button',{name:'测试连接',exact:true}).click();await expect(page.locator('.test-results')).toContainText('HTTPS');await page.getByLabel('网站应用 AppID',{exact:true}).fill('wx1234567890abcdee');await expect(page.getByRole('button',{name:'测试连接',exact:true})).toBeDisabled();await expect(page.locator('.test-results')).not.toContainText('HTTPS');await page.getByLabel('网站应用 AppID',{exact:true}).fill('wx1234567890abcdef')
 await page.getByRole('button',{name:'全部接口'}).click();await page.getByRole('button',{name:'配置微信支付',exact:true}).click();await expect(page.getByLabel('商户 API 私钥',{exact:true})).toBeVisible();await expect(page.getByLabel('API v3 密钥',{exact:true})).toBeVisible();await page.screenshot({path:'.local/qa/providers/wechat-payment.png',fullPage:true})
 await page.getByRole('button',{name:'全部接口'}).click();await page.getByRole('button',{name:'配置支付宝支付',exact:true}).click();await page.locator('.el-select').filter({has:page.getByRole('combobox',{name:'加签方式',exact:true})}).click();await page.getByRole('option',{name:'公钥证书模式',exact:true}).click();await expect(page.getByLabel('支付宝根证书',{exact:true})).toBeVisible();await page.screenshot({path:'.local/qa/providers/alipay.png',fullPage:true})
 await page.setViewportSize({width:900,height:1000});await expect(page.locator('.provider-form')).toBeVisible();if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('配置页面横向溢出');await page.screenshot({path:'.local/qa/providers/narrow.png',fullPage:true})
 await page.getByRole('button',{name:'全部接口'}).click();await page.getByRole('button',{name:'进入 AI 配置与数据'}).click();await expect(page).toHaveURL(/#ai$/);await expect(page.locator('.breadcrumb')).toContainText('系统管理');await expect(page.locator('.breadcrumb')).toContainText('AI 配置与数据')
 for(const [route,group]of [['products','交易管理'],['referrals','运营管理'],['knowledge-graph','基础架构'],['users','用户与权益']]){await page.goto('http://127.0.0.1:5180/#'+route);await expect(page.locator('.breadcrumb')).toContainText(group)}
 if(errors.length)throw Error(errors.join('\n'));console.log('PASS provider forms, masked saved credentials, validation, certificates, eight cards, AI navigation, breadcrumbs and responsive layout')
}finally{await browser.close();await f.close()}
