import 'dotenv/config'
import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {chromium,expect} from '@playwright/test'
import {previewFixture} from './helpers/content-preview-fixture.ts'

const f=await previewFixture();let browser
try{
 browser=await chromium.launch({channel:'chrome',headless:true})
 const page=await browser.newPage({viewport:{width:1680,height:1100},reducedMotion:'reduce'}),errors=[],previewRequests=[]
 page.on('pageerror',e=>errors.push(e.message))
 await page.route('**/api/**',async route=>{
  const u=new URL(route.request().url())
  if(!u.pathname.startsWith('/api/'))return route.continue()
  if(route.request().frame()!==page.mainFrame()){
   previewRequests.push(u.pathname)
   assert(u.pathname.startsWith('/api/content-preview/'),'preview must not access student APIs: '+u.pathname)
   assert.equal(route.request().method(),'GET');assert.equal(route.request().headers().authorization,undefined)
  }
  await route.fulfill({response:await route.fetch({url:f.origin+u.pathname+u.search})})
 })
 await page.addInitScript(t=>sessionStorage.setItem('sxb-admin-token',t),f.token)
 await page.addInitScript(()=>{if(location.port==='5174'){localStorage.setItem('sxb-api-token','existing-student-session');localStorage.setItem('sxb-note-preview-check','existing-note-cache')}})
 await page.goto('http://127.0.0.1:5180/#knowledge-graph')
 await page.locator('.grid button').filter({hasText:'初级社会工作师'}).click()
 const manager=page.locator('.knowledge-list-manager'),drawer=page.locator('.content-preview-drawer:visible')
 await manager.getByPlaceholder('搜索标题',{exact:true}).fill('预览知识点')
 await manager.getByRole('button',{name:'预览内容',exact:true}).click()
 const frame=page.frameLocator('iframe[title="用户端内容预览"]')
 await expect(frame.locator('.hero-title')).toHaveText('预览知识点')
 await expect(frame.getByText('预览正文标题',{exact:true})).toBeVisible()
 await expect(frame.locator('.study-image img')).toBeVisible()
 await expect(frame.getByText('未发布',{exact:true})).toBeVisible()
 await expect(frame.getByText('我的笔记',{exact:true})).toHaveCount(0)
 await expect(frame.getByText('去购买',{exact:true})).toHaveCount(0)
 assert.equal(await frame.locator('body').evaluate(()=>localStorage.getItem('sxb-api-token')),'existing-student-session')
 await mkdir('.local/qa/content-preview',{recursive:true})
 await page.screenshot({path:'.local/qa/content-preview/knowledge.png',animations:'disabled'})
 await page.mouse.click(25,500);await expect(drawer).toBeVisible()
 for(const width of [375,430]){await drawer.locator('.el-radio-button').filter({hasText:String(width)}).click();assert.equal(Math.round((await drawer.locator('iframe').boundingBox()).width),width-2)}
 await frame.locator('.course-link').filter({hasText:'预览配套视频课'}).click();await expect(frame.locator('video')).toBeVisible();await expect(frame.getByText('预览讲义',{exact:true})).toBeVisible()
 await frame.locator('.preview-top uni-button').click();await expect(frame.locator('.hero-title')).toHaveText('预览知识点')
 await drawer.locator('.el-drawer__close-btn').click();await expect(drawer).toBeHidden()
 await manager.getByRole('button',{name:'编辑内容',exact:true}).click()
 const editor=page.locator('.editor-drawer:visible');await editor.getByRole('textbox',{name:'图文正文编辑器'}).fill('保存并预览的新正文')
 await editor.getByRole('button',{name:'保存并预览',exact:true}).click()
 await expect(drawer).toBeVisible();await expect(frame.getByText('保存并预览的新正文',{exact:true})).toBeVisible()
 await drawer.locator('.el-drawer__close-btn').click()
 await manager.locator('.el-radio-button').filter({hasText:/^节$/}).click()
 await manager.getByPlaceholder('搜索标题',{exact:true}).fill('预览节');await manager.getByRole('button',{name:'预览内容',exact:true}).click()
 await expect(frame.locator('.hero-title')).toHaveText('预览节');await expect(frame.getByText('节正文预览，未发布也可检查。',{exact:true})).toBeVisible()
 await frame.locator('.course-link').filter({hasText:'预览精品图文课'}).click();await expect(frame.getByText('精品课图文正文',{exact:true})).toBeVisible()
 await page.screenshot({path:'.local/qa/content-preview/section-course.png',animations:'disabled'})
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
 await page.screenshot({path:'.local/qa/content-preview/mobile.png',animations:'disabled'})
 // Invalid/expired preview authentication must not clear the student's separate session/cache.
 await page.locator('iframe').evaluate(el=>el.src='http://127.0.0.1:5174/?check=invalid-preview#/pages/content-preview/index?token=invalid-preview')
 await expect(frame.getByText('预览链接无效，请从后台重新打开',{exact:true})).toBeVisible()
 assert.equal(await frame.locator('body').evaluate(()=>localStorage.getItem('sxb-api-token')),'existing-student-session')
 assert.equal(await frame.locator('body').evaluate(()=>localStorage.getItem('sxb-note-preview-check')),'existing-note-cache')
 assert(previewRequests.length>0);assert.deepEqual(errors,[])
 console.log(JSON.stringify({status:'PASS',draftKnowledge:true,offlineSection:true,savedContent:true,sharedReader:true,associatedCourses:true,noStudentApi:true,noStudentAuthorization:true,widths:[375,390,430],backdrop:true,mobile:true}))
}finally{await browser?.close();await f.close()}
