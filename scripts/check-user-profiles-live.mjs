import 'dotenv/config'
import assert from 'node:assert/strict'
import {chromium,expect} from '@playwright/test'
import {mkdir} from 'node:fs/promises'

const origin='http://127.0.0.1:4310/api'
const auth=await fetch(origin+'/auth/admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:process.env.ADMIN_PHONE,password:process.env.ADMIN_PASSWORD})})
assert.equal(auth.status,200)
const {token}=await auth.json(),headers={Authorization:'Bearer '+token}
const list=await(await fetch(origin+'/admin/user-profiles',{headers})).json()
assert(Array.isArray(list.items)&&list.items.length,'A live student is required')
const student=list.items[0]
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
 const page=await browser.newPage({viewport:{width:1680,height:1100},reducedMotion:'reduce'}),errors=[],failures=[]
 page.on('pageerror',e=>errors.push(e.message))
 page.on('response',r=>{if(r.url().includes('/api/')&&r.status()>=400)failures.push(r.status()+' '+r.url())})
 await page.route('**/api/**',route=>{assert.equal(route.request().method(),'GET');return route.continue()})
 await page.addInitScript(t=>sessionStorage.setItem('sxb-admin-token',t),token)
 await page.goto('http://127.0.0.1:5180/#users')
 await page.getByRole('textbox',{name:'搜索用户',exact:true}).fill(student.phone)
 await page.getByRole('button',{name:'查询',exact:true}).click()
 await expect(page.locator('.user-management tbody tr')).toHaveCount(1)
 await page.getByRole('button',{name:'用户详情',exact:true}).click()
 const profile=page.locator('.user-profile')
 await expect(profile.locator('.profile-identity')).toContainText(student.phone)
 await expect(profile.locator('.profile-metrics')).toBeVisible()
 await mkdir('.local/qa/user-profiles',{recursive:true})
 await page.screenshot({path:'.local/qa/user-profiles/live-overview.png',animations:'disabled'})
 for(const name of ['学习数据','章节掌握','购买记录','权益履约','推荐关系','学习计划','账号管理记录']){
  await profile.getByRole('tab',{name,exact:true}).click()
  await expect(profile.locator('.el-loading-mask')).toHaveCount(0)
  if(name==='学习数据')for(const sub of ['答题记录','错题本','收藏','笔记']){await profile.getByRole('tab',{name:sub,exact:true}).click();await expect(profile.locator('.el-loading-mask')).toHaveCount(0);await expect(profile.locator('.learning-collections')).toBeVisible()}
  if(name==='学习计划')await expect(profile.getByText('等待开发',{exact:true})).toBeVisible()
  await expect(profile.locator('.el-alert--error')).toHaveCount(0)
 }
 await profile.getByRole('tab',{name:'用户概览',exact:true}).click()
 await profile.getByRole('combobox',{name:'档案考试项目',exact:true}).click()
 const options=page.getByRole('option');if(await options.count()>1)await options.nth(1).click();else await options.first().click()
 await expect(profile.locator('.profile-metrics')).toBeVisible()
 await expect(profile.locator('.el-alert--error')).toHaveCount(0)
 await page.screenshot({path:'.local/qa/user-profiles/live-switched.png',animations:'disabled'})
 assert.deepEqual(errors,[]);assert.deepEqual(failures,[])
 console.log(JSON.stringify({status:'PASS',liveUser:true,allTabs:true,examSwitching:true,businessWrites:0}))
}finally{await browser.close()}
