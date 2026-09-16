import 'dotenv/config'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, expect } from '@playwright/test'

const origin='http://127.0.0.1:5180/'
const output=resolve('.local/qa/admin-navigation')
await mkdir(output,{recursive:true})
const expected={
  '总览':['工作台'],
  '基础架构':['考试分类','考试项目','知识图谱'],
  '教学内容':['题型管理','题目管理','课程管理','学习计划','考前小抄'],
  '用户与权益':['用户管理','会员权益'],
  '交易管理':['商品管理','订单管理','财务管理'],
  '运营管理':['学习数据','消息模板','消息中心','推荐码','文章内容'],
  '系统管理':['管理员管理','角色管理','资源管理','公共组件','AI 配置与数据','操作日志','系统设置'],
}
const placeholders=['学习计划','财务管理']
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}})
  const errors=[],failed=[]
  page.on('pageerror',e=>errors.push(e.message))
  page.on('response',r=>{if(r.url().includes('/api/')&&r.status()>=400)failed.push(r.status()+' '+r.url())})
  const auth=await fetch(new URL('/api/auth/admin',origin),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:process.env.ADMIN_PHONE,password:process.env.ADMIN_PASSWORD})})
  assert.equal(auth.status,200,'Admin sign-in failed')
  const {token}=await auth.json()
  await page.addInitScript(t=>sessionStorage.setItem('sxb-admin-token',t),token)
  await page.goto(origin)
  const nav=page.getByRole('navigation',{name:'后台导航'})
  await expect(nav.locator('.nav-group-toggle[aria-expanded="true"]')).toHaveText('总览')
  await expect(nav.locator('.nav-group')).toHaveCount(7)
  for(const [group,items] of Object.entries(expected)){
    const toggle=nav.getByRole('button',{name:group,exact:true})
    if(await toggle.getAttribute('aria-expanded')!=='true')await toggle.click()
    await expect(nav.locator('.nav-group-toggle[aria-expanded="true"]')).toHaveCount(1)
    const children=nav.locator('.nav-children:visible')
    assert.deepEqual(await children.locator('.nav-item').allTextContents(),items)
    for(const item of items){
      await children.getByRole('button',{name:item,exact:true}).click()
      await expect(page.locator('.page-heading h1')).toHaveText(item)
      await expect(page.locator('.el-loading-mask:visible')).toHaveCount(0)
      await expect(page.locator('#workspace>.el-alert--error')).toHaveCount(0)
      if(placeholders.includes(item))await expect(page.getByText('等待开发',{exact:true})).toBeVisible()
      else await expect(page.locator('.view-content .el-table, .view-content .el-tabs, .view-content section, .view-content .el-form, .view-content .el-empty').first()).toBeVisible()
    }
  }
  for(const name of ['知识点','常见问题','学习记录','考前须知与文章'])await expect(nav.getByRole('button',{name,exact:true})).toHaveCount(0)
  await nav.getByRole('button',{name:'操作日志',exact:true}).click()
  await expect(page.getByRole('tab',{name:'后台日志',exact:true})).toHaveAttribute('aria-selected','true')
  await page.getByRole('tab',{name:'用户行为',exact:true}).click()
  await expect(page.getByText('等待开发',{exact:true})).toBeVisible()
  await page.getByRole('tab',{name:'后台日志',exact:true}).click()
  await expect(page.locator('.el-table__row').first()).toBeVisible()
  await expect(page.locator('.el-loading-mask:visible')).toHaveCount(0)
  await page.screenshot({path:resolve(output,'desktop-audit.png')})
  await page.goto(origin+'#faq')
  await expect(page).toHaveURL(origin+'#articles')
  await expect(page.locator('.page-heading h1')).toHaveText('文章内容')
  await expect(page.getByRole('button',{name:'新增常见问题',exact:true})).toBeVisible()
  await page.locator('.el-select').filter({has:page.getByRole('combobox',{name:'文章分类'})}).click()
  await page.getByRole('option',{name:'普通文章',exact:true}).click()
  await expect(page.getByText('等待开发',{exact:true})).toBeVisible()
  await expect(page.getByRole('button',{name:'新增常见问题',exact:true})).toHaveCount(0)
  await page.locator('.el-select').filter({has:page.getByRole('combobox',{name:'文章分类'})}).click()
  await page.getByRole('option',{name:'常见问题',exact:true}).click()
  await expect(page.locator('.view-content .el-table')).toBeVisible()
  await page.goto(origin+'#article')
  await expect(page).toHaveURL(origin+'#exam-projects')
  await expect(page.getByRole('button',{name:'新增考试项目',exact:true})).toBeVisible()
  await expect(nav.locator('.nav-group-toggle[aria-expanded="true"]')).toHaveText('基础架构')
  const size=await nav.evaluate(el=>({parent:getComputedStyle(el.querySelector('.nav-group-label')).fontSize,child:getComputedStyle(el.querySelector('.nav-item')).fontSize}))
  assert(Number.parseFloat(size.parent)>Number.parseFloat(size.child))
  await page.screenshot({path:resolve(output,'desktop-teaching.png')})
  await page.reload()
  await expect(nav.locator('.nav-group-toggle[aria-expanded="true"]')).toHaveText('总览')
  await page.emulateMedia({reducedMotion:'reduce'})
  await page.setViewportSize({width:390,height:844})
  await page.getByRole('button',{name:'打开菜单',exact:true}).click()
  await nav.getByRole('button',{name:'教学内容',exact:true}).focus()
  await page.keyboard.press('Enter')
  await expect(nav.locator('.nav-group-toggle[aria-expanded="true"]')).toHaveText('教学内容')
  await page.screenshot({path:resolve(output,'mobile-menu.png')})
  await nav.getByRole('button',{name:'题型管理',exact:true}).click()
  await expect(page.getByRole('heading',{name:'题型管理',exact:true})).toBeVisible()
  await expect(page.getByRole('button',{name:'新建题型',exact:true})).toBeVisible()
  await expect(page.locator('.sidebar')).not.toHaveClass(/open/)
  assert.deepEqual(errors,[])
  assert.deepEqual(failed,[])
  console.log(JSON.stringify({status:'PASS',menus:Object.values(expected).flat().length,groups:7,contentWrites:0,fontSizes:size,checks:'all menu routes, placeholders, article categories, logs tabs, legacy routes, accordion, keyboard, mobile and reduced motion'}))
}finally{await browser.close()}
