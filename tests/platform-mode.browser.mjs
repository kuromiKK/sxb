import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {readFile,mkdir} from 'node:fs/promises'
import {resolve,extname,sep} from 'node:path'
import {chromium,expect} from '@playwright/test'
import {profileFixture} from './helpers/user-profile-fixture.ts'

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
 await f.db.query("UPDATE platform_environment SET mode='production' WHERE id=1")
 browser=await chromium.launch({channel:'chrome',headless:true})
 const context=await browser.newContext({viewport:{width:1440,height:1050},reducedMotion:'reduce'})
 await context.addInitScript(token=>sessionStorage.setItem('sxb-admin-token',token),f.token)
 await context.route('**/api/**',async route=>{const u=new URL(route.request().url());if(!u.pathname.startsWith('/api/'))return route.continue();await route.fulfill({response:await route.fetch({url:f.origin+u.pathname+u.search})})})
 const page=await context.newPage(),errors=[]
 page.setDefaultTimeout(10000)
 page.on('pageerror',e=>errors.push(e.message))
 page.on('console',m=>{if(m.type()==='error'&&m.text().includes('getStorageSync'))errors.push(m.text())})
 await page.goto('http://127.0.0.1:5180/#settings')
 await expect(page.locator('.test-indicator')).toHaveText('生产环境')
 const card=page.locator('.mode-settings')
 await expect(card).toHaveCount(0)
 await page.getByRole('tab',{name:'运行环境',exact:true}).click()
 await expect(page.locator('.environment-runtime')).toContainText('生产模式')
 await card.locator('label.el-radio').filter({hasText:'测试环境'}).click()
 await card.getByRole('button',{name:'确认切换环境'}).click()
 const dialog=page.getByRole('dialog',{name:'确认切换运行环境'})
 await dialog.getByRole('button',{name:'取消',exact:true}).click()
 assert.equal((await f.call('/health')).mode,'production')
 await card.getByRole('button',{name:'确认切换环境'}).click()
 await dialog.getByPlaceholder('验证当前管理员身份').fill(process.env.ADMIN_PASSWORD)
 await dialog.getByRole('button',{name:'确认切换',exact:true}).click()
 await expect(dialog).toBeHidden()
 await expect(page.locator('.test-indicator')).toHaveText('测试环境')
 await expect(page.locator('.environment-runtime')).toContainText('测试模式')
 await expect(page.locator('.sidebar-foot')).toContainText('测试环境')
 await page.reload();await page.getByRole('tab',{name:'运行环境',exact:true}).click();await expect(card).toContainText('当前：测试环境')
 await card.locator('label.el-radio').filter({hasText:'生产环境'}).click()
 await expect(card.getByRole('button',{name:'确认切换环境'})).toBeDisabled()
 await expect(card).toContainText('HTTPS')
 await mkdir('.local/qa/platform-mode',{recursive:true})
 await card.locator('label.el-radio').filter({hasText:'测试环境'}).click()
 await page.screenshot({path:'.local/qa/platform-mode/settings.png',fullPage:true})
 const origin='http://127.0.0.1:'+server.address().port
 await page.goto(origin+'/#/pages/index/index')
 await expect(page.getByText('我的学习计划',{exact:true})).toBeVisible()
 await page.waitForTimeout(500)
 await page.goto(origin+'/#/pages/login/index')
 await expect(page.locator('.login-tip')).toContainText('测试环境')
 await page.locator('.login-form .field input').first().fill('18898760000')
 await page.locator('.code-button').click()
 await expect(page.locator('.login-tip')).toHaveText(/测试验证码：\d{4}（不发送短信）/)
 await page.screenshot({path:'.local/qa/platform-mode/login.png',fullPage:true})
 assert.deepEqual(errors,[])
 console.log('PASS: mode switch/cancel/password/persistence, badges, production prerequisites, built H5 homepage and displayed test code')
}finally{await browser?.close();await new Promise(r=>server.close(r));await f.close()}
