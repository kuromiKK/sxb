import 'dotenv/config'
import assert from 'node:assert/strict'
import {chromium,expect} from '@playwright/test'
import {mkdir} from 'node:fs/promises'
const origin='http://127.0.0.1:4310/api'
const login=await fetch(origin+'/auth/admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:process.env.ADMIN_PHONE,password:process.env.ADMIN_PASSWORD})});assert.equal(login.status,200)
const {token}=await login.json(),headers={Authorization:'Bearer '+token}
const current=await(await fetch(origin+'/site-settings')).json()
assert(current.protocols.every(p=>p.version>=1))
const nodes=await(await fetch(origin+'/admin/content?kind=knowledge&examId=junior-social-worker&status=published',{headers})).json()
const node=nodes.items[0];assert(node)
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
 const context=await browser.newContext({viewport:{width:1680,height:1100},reducedMotion:'reduce'}),errors=[],failures=[]
 context.on('page',p=>{p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(new URL(r.url()).pathname.startsWith('/api/')&&r.status()>=400)failures.push(r.status())})})
 await context.route('**/api/**',route=>{if(new URL(route.request().url()).pathname.startsWith('/api/'))assert.equal(route.request().method(),'GET');return route.continue()})
 await context.addInitScript(t=>{if(location.port==='5180')sessionStorage.setItem('sxb-admin-token',t)},token)
 const admin=await context.newPage();await admin.goto('http://127.0.0.1:5180/#settings')
 const root=admin.locator('.site-settings');await expect(root.getByLabel('平台名称',{exact:true})).toHaveValue(current.basic.name)
 await expect(root.locator('.el-loading-mask')).toHaveCount(0)
 await mkdir('.local/qa/site-settings',{recursive:true})
 await admin.screenshot({path:'.local/qa/site-settings/live-basic.png',animations:'disabled'})
 for(const tab of ['协议管理','客服设置','搜索设置','关于平台']){await root.getByRole('tab',{name:tab,exact:true}).click();await expect(root.locator('.settings-form-card')).toBeVisible()}
 await root.getByRole('tab',{name:'协议管理',exact:true}).click();await expect(root.locator('.protocol-editor-heading')).toContainText('V'+current.protocols.find(p=>p.kind==='agreement').version)
 const user=await context.newPage();await user.setViewportSize({width:390,height:844})
 await user.goto('http://127.0.0.1:5174/#/pages/search/index');await user.locator('.search-input input').fill(node.title);await user.locator('.submit-search').click()
 await expect(user.locator('.result').first()).toContainText(node.title)
 await expect(user.locator('.search-scope')).toContainText('初级社会工作师')
 await user.screenshot({path:'.local/qa/site-settings/live-search.png',animations:'disabled'})
 await user.goto('http://127.0.0.1:5174/#/pages/profile-center/index?mode=privacy')
 await expect(user.locator('.article-version')).toContainText('V'+current.protocols.find(p=>p.kind==='privacy').version)
 assert.deepEqual(errors,[]);assert.deepEqual(failures,[])
 console.log(JSON.stringify({status:'PASS',liveSettings:true,protocolVersions:true,actualDatabaseSearch:true,businessWrites:0}))
}finally{await browser.close()}
