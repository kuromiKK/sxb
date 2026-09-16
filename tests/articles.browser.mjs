import 'dotenv/config'
import assert from 'node:assert/strict'
import {mkdtemp,mkdir} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {chromium,expect} from '@playwright/test'
import express from 'express'
import {ZodError} from 'zod'
process.env.APP_MODE='test';process.env.DATABASE_URL='';process.env.LOCAL_DATABASE_DIR=await mkdtemp(join(tmpdir(),'sxb-article-browser-'));process.env.MEDIA_DIR=await mkdtemp(join(tmpdir(),'sxb-article-browser-media-'));process.env.SECRET_KEY='e'.repeat(64);process.env.ADMIN_PHONE='18600000000';process.env.ADMIN_PASSWORD='Articles-Tests-42!'
const {db,closeDatabase}=await import('../apps/api/src/db.ts'),{seed}=await import('../apps/api/src/seed.ts'),{initSecrets,session}=await import('../apps/api/src/security.ts'),{api}=await import('../apps/api/src/routes.ts')
await initSecrets();await seed()
const admin=(await db.query("SELECT id FROM users WHERE account_kind='admin' LIMIT 1")).rows[0],adminToken=await session(admin.id,'admin'),studentToken=await session('test-student-001'),exam='junior-social-worker'
const app=express();app.use(express.json({limit:'40mb'}));app.use('/api',api);app.use((e,_q,r,_n)=>r.status(e instanceof ZodError?400:e.status||500).json({message:e.message}))
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const origin='http://127.0.0.1:'+server.address().port
async function call(path,body,method='GET'){const r=await fetch(origin+'/api'+path,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+adminToken},body:body===undefined?undefined:JSON.stringify(body)});const d=await r.json();assert.equal(r.status,200,JSON.stringify(d));return d}
const long='如何利用平台的知识点与课程做好系统学习并且在考试之前完成复习计划和常见问题排查以及更多详细说明'.repeat(2)
const config={title:long,category:'faq',scope:'exams',examIds:[exam,'mid-social-worker'],status:'published',document:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'先学习知识点，再练习题目。'}]}]}}
let browser
try{
 await call('/admin/articles/long-title',config,'PUT')
 await call('/admin/articles/other-only',{...config,title:'仅中级考试可见',examIds:['mid-social-worker']},'PUT')
 await db.query("UPDATE knowledge_nodes SET title=$1 WHERE kind IN ('subject','chapter','section','knowledge')",[long])
 browser=await chromium.launch({channel:'chrome',headless:true});const errors=[]
 async function route(page){page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/**',async r=>{const u=new URL(r.request().url());if(!u.pathname.startsWith('/api/'))return r.continue();await r.fulfill({response:await r.fetch({url:origin+u.pathname+u.search})})})}
 const page=await browser.newPage({viewport:{width:1550,height:1050},reducedMotion:'reduce'});await route(page);await page.addInitScript(token=>sessionStorage.setItem('sxb-admin-token',token),adminToken)
 await mkdir('.local/qa/articles',{recursive:true})
 await page.goto('http://127.0.0.1:5180/#articles')
 await expect(page.locator('.articles-page tbody tr')).toHaveCount(8)
 assert.deepEqual(await page.locator('.articles-page thead th').allTextContents(),['标题','考试项目','状态','创建人','更新时间','操作'])
 const title=page.getByRole('button',{name:long,exact:true});await expect(title).toHaveText(Array.from(long).slice(0,50).join('')+'...')
 assert.equal(await title.evaluate(el=>getComputedStyle(el).whiteSpace),'nowrap');assert.equal(await title.evaluate(el=>getComputedStyle(el).textOverflow),'ellipsis')
 await page.screenshot({path:'.local/qa/articles/list.png',fullPage:true,animations:'disabled'})
 await page.getByRole('button',{name:'新增文章',exact:true}).click();const drawer=page.locator('.el-drawer:visible')
 await drawer.getByRole('textbox',{name:'文章标题',exact:true}).fill('如何开始学习？')
 await drawer.getByRole('button',{name:'保存文章',exact:true}).click();await expect(drawer.getByRole('alert')).toContainText('请选择文章分类')
 await page.mouse.click(300,400);await expect(drawer).toBeVisible()
 const choose=async(root,label,option)=>{await root.locator('.el-select').filter({has:page.getByRole('combobox',{name:label,exact:true})}).click();await page.getByRole('option',{name:option,exact:true}).click()}
 await choose(drawer,'文章分类','常见问题')
 await drawer.locator('.tiptap').fill('选择考试，然后按知识点顺序开始学习。')
 await drawer.getByRole('button',{name:'插入图片',exact:true}).click()
 const dialog=page.getByRole('dialog',{name:'插入资源',exact:true})
 await dialog.locator('input[type=file]').first().setInputFiles({name:'学习说明.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=','base64')})
 await dialog.getByRole('button',{name:'插入正文',exact:true}).click();await expect(dialog).toBeHidden();await expect(drawer.locator('.tiptap img')).toHaveCount(1)
 await choose(drawer,'发布状态','已上架')
 await page.screenshot({path:'.local/qa/articles/editor.png',fullPage:true,animations:'disabled'})
 await drawer.getByRole('button',{name:'保存文章',exact:true}).click();await expect(drawer).toBeHidden();await expect(page.locator('.articles-page tbody tr')).toHaveCount(9)
 const created=(await call('/admin/articles?title='+encodeURIComponent('如何开始学习？'))).items[0];assert.equal(created.scope,'all');assert.notEqual(created.creator_name,'未记录')
 await page.getByRole('button',{name:'如何开始学习？',exact:true}).click();await expect(drawer.getByRole('textbox',{name:'文章标题',exact:true})).toHaveValue('如何开始学习？');await expect(drawer.locator('.tiptap img')).toHaveCount(1)
 await drawer.locator('.el-radio-button').filter({hasText:'指定考试'}).click()
 await choose(drawer,'适用考试项目','初级社会工作师');await page.keyboard.press('Escape')
 await drawer.getByRole('button',{name:'保存文章',exact:true}).click();await expect(drawer).toBeHidden()
 assert.deepEqual((await call('/admin/articles/'+created.id)).exam_ids,[exam])
 await page.getByRole('textbox',{name:'标题',exact:true}).fill('如何开始学习？');await page.getByRole('button',{name:'查询',exact:true}).click();await expect(page.locator('.articles-page tbody tr')).toHaveCount(1)
 const mobile=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});await route(mobile)
 await mobile.addInitScript(({token,exam})=>{localStorage.setItem('sxb-api-token',JSON.stringify({type:'string',data:token}));localStorage.setItem('sxb-current-exam',JSON.stringify({type:'object',data:{id:exam,name:'初级社会工作师'}}))},{token:studentToken,exam})
 await mobile.goto('http://127.0.0.1:5174/#/pages/profile-center/index?mode=faq')
 await expect(mobile.locator('.faq-list .fold-item').first()).toContainText('如何开始学习？',{timeout:20000})
 await expect(mobile.getByText('仅中级考试可见',{exact:true})).toHaveCount(0)
 await mobile.getByText('如何开始学习？',{exact:true}).click();await expect(mobile.getByText('选择考试，然后按知识点顺序开始学习。',{exact:true})).toBeVisible();await expect(mobile.locator('.fold-content img')).toHaveCount(1)
 await mobile.screenshot({path:'.local/qa/articles/user-faq.png',fullPage:true,animations:'disabled'})
 await page.getByRole('button',{name:'下架文章',exact:true}).click();await page.getByRole('button',{name:'确认',exact:true}).click();await expect(page.locator('.articles-page tbody')).toContainText('已下架')
 await mobile.reload();await expect(mobile.locator('.faq-list')).toBeVisible();await expect(mobile.getByText('如何开始学习？',{exact:true})).toHaveCount(0)
 await page.getByRole('button',{name:'上架文章',exact:true}).click();await page.getByRole('button',{name:'确认',exact:true}).click();await expect(page.locator('.articles-page tbody')).toContainText('已上架')
 await page.getByRole('button',{name:'删除文章',exact:true}).click();await page.getByRole('button',{name:'确认删除',exact:true}).click();await expect(page.getByText('当前条件下暂无文章',{exact:true})).toBeVisible()
 await page.getByRole('button',{name:'重置',exact:true}).click();await expect(page.locator('.articles-page tbody tr')).toHaveCount(8)
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
 await page.setViewportSize({width:1550,height:1050});await page.goto('http://127.0.0.1:5180/#knowledge-graph');await page.locator('.grid button').filter({hasText:'初级社会工作师'}).click()
 const manager=page.locator('.knowledge-list-manager');await expect(manager).toBeVisible()
 for(const level of ['知识点','节','章','科目']){
  await manager.locator('.el-radio-button').filter({hasText:new RegExp('^'+level+'$')}).click()
  const button=manager.locator('.table-title').first();await expect(button).toBeVisible();assert.equal(Array.from(await button.innerText()).length,53)
  const css=await button.evaluate(e=>({whiteSpace:getComputedStyle(e).whiteSpace,overflow:getComputedStyle(e).overflow,textOverflow:getComputedStyle(e).textOverflow}));assert.deepEqual(css,{whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'})
 }
 await page.screenshot({path:'.local/qa/articles/knowledge-titles.png',fullPage:true,animations:'disabled'})
 assert.deepEqual(errors,[])
 console.log(JSON.stringify({status:'PASS',articleCrud:true,categoryRequired:true,multiExam:true,registeredImage:true,sharedFilters:true,backdropProtected:true,mobileFaq:true,knowledgeTitles:4,liveWrites:0}))
}finally{await browser?.close();await new Promise(r=>server.close(r));await closeDatabase()}
