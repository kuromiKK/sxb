import 'dotenv/config'
import assert from 'node:assert/strict'
import {mkdir,mkdtemp} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {chromium,expect} from '@playwright/test'
import express from 'express'
import {ZodError} from 'zod'
process.env.APP_MODE='test';process.env.DATABASE_URL='';process.env.LOCAL_DATABASE_DIR=await mkdtemp(join(tmpdir(),'sxb-exam-guide-'));process.env.MEDIA_DIR=await mkdtemp(join(tmpdir(),'sxb-guide-media-'));process.env.SECRET_KEY='c'.repeat(64);process.env.ADMIN_PHONE='18600000000';process.env.ADMIN_PASSWORD='Guide-Tests-42!'
const {db,closeDatabase}=await import('../apps/api/src/db.ts'),{seed}=await import('../apps/api/src/seed.ts'),{initSecrets,session}=await import('../apps/api/src/security.ts'),{api}=await import('../apps/api/src/routes.ts'),{migrateExamGuide}=await import('../apps/api/src/exam-guide.ts')
await initSecrets();await seed()
await db.query("INSERT INTO exam_categories(id,name) VALUES('guide-category','考试图文测试分类')")
const admin=(await db.query("SELECT id FROM users WHERE account_kind='admin' LIMIT 1")).rows[0],token=await session(admin.id,'admin'),student=await session('test-student-001')
const app=express();app.use(express.json({limit:'40mb'}));app.use('/api',api);app.use((e,_q,r,_n)=>r.status(e instanceof ZodError?400:e.status||500).json({message:e.message}))
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const origin='http://127.0.0.1:'+server.address().port
async function call(path,body,method='GET',expected=200,auth=token){const r=await fetch(origin+'/api'+path,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+auth},body:body===undefined?undefined:JSON.stringify(body)});const data=await r.json();assert.equal(r.status,expected,JSON.stringify(data));return data}
const base={name:'图文考试回归',categoryId:'guide-category',enabled:true,yearEntries:[{id:'guide-2090',year:2090,startsAt:'2090-01-01T00:00:00+08:00',endsAt:'2090-12-31T23:59:59+08:00'}]},id='guide-test'
await call('/admin/exam-projects/'+id,base,'PUT',403,student)
await call('/admin/exam-projects/'+id,{...base,yearEntries:[]},'PUT',400)
await call('/admin/exam-projects/'+id,{...base,name:''},'PUT',400)
await call('/admin/exam-projects/'+id,{...base,yearEntries:[{...base.yearEntries[0],startsAt:''}]},'PUT',400)
await call('/admin/exam-projects/'+id,base,'PUT')
assert.equal((await call('/exam-guide/'+id)).hasGuide,false)
const output='.local/qa/exam-guide';await mkdir(output,{recursive:true});const browser=await chromium.launch({channel:'chrome',headless:true})
try{
 const page=await browser.newPage({viewport:{width:1733,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message))
 const proxy=async route=>{const u=new URL(route.request().url());if(!u.pathname.startsWith('/api/'))return route.continue();await route.fulfill({response:await route.fetch({url:origin+u.pathname+u.search})})}
 await page.route('**/api/**',proxy);await page.addInitScript(t=>sessionStorage.setItem('sxb-admin-token',t),token);await page.goto('http://127.0.0.1:5180/#exam-projects')
 const row=page.locator('tbody tr').filter({hasText:'图文考试回归'}),drawer=page.locator('.exam-project-drawer:visible');await expect(row.locator('td').nth(3)).toHaveText('无')
 await row.getByRole('button',{name:'编辑图文考试回归',exact:true}).click();await expect(drawer.getByRole('tab')).toHaveText(['基本信息','考期','了解考试']);await page.screenshot({path:output+'/basic.png',animations:'disabled'})
 await drawer.getByRole('tab',{name:'考期',exact:true}).click();await drawer.getByRole('button',{name:'新增考期',exact:true}).click();await drawer.getByRole('button',{name:'保存',exact:true}).click();await expect(drawer.getByRole('alert')).toContainText('请填写每个考期')
 const newTerm=drawer.locator('.year-card').nth(1);await newTerm.getByPlaceholder('选择开始时间').fill('2091-01-01 00:00:00');await newTerm.getByPlaceholder('选择开始时间').press('Tab');await newTerm.getByPlaceholder('选择结束时间').fill('2091-12-31 23:59:59');await newTerm.getByPlaceholder('选择结束时间').press('Tab');await page.screenshot({path:output+'/terms.png',animations:'disabled'})
 await drawer.getByRole('tab',{name:'了解考试',exact:true}).click();const editor=drawer.getByRole('textbox',{name:'图文正文编辑器',exact:true});await editor.fill('2090 年报考指南：先核对报考条件，再按平台学习指导开始复习。')
 await drawer.locator('.el-select:visible').click();await page.getByRole('option',{name:'2091 年考期',exact:true}).click();await expect(editor).toHaveText('');await editor.fill('2091 年的新流程与学习指导')
 await drawer.locator('.el-select:visible').click();await page.getByRole('option',{name:'2090 年考期',exact:true}).click();await expect(editor).toContainText('2090 年报考指南')
 const fixture=await browser.newPage({viewport:{width:640,height:240}});await fixture.setContent('<div style="width:600px;height:200px;padding:20px;background:#edf3ff;color:#315ccc;font:22px sans-serif"><h2>了解考试 · 学习指导</h2><p>学习知识点 → 练习题目 → 查漏补缺</p></div>');const png=await fixture.locator('body>div').screenshot();await fixture.close()
 await drawer.getByRole('button',{name:'插入图片',exact:true}).click();const upload=page.getByRole('dialog',{name:'插入资源',exact:true});await upload.locator('input[type=file]').setInputFiles({name:'学习指导.png',mimeType:'image/png',buffer:png});await upload.getByRole('button',{name:'插入正文',exact:true}).click();await expect(upload).toHaveCount(0);await expect(drawer.locator('.rich-editor img')).toBeVisible();await page.screenshot({path:output+'/guide.png',animations:'disabled'})
 await drawer.getByRole('button',{name:'保存',exact:true}).click();await expect(drawer).toHaveCount(0);await expect(row.locator('td').nth(3)).toHaveText('有');await page.screenshot({path:output+'/list.png',animations:'disabled'})
 const publicGuide=await call('/exam-guide/'+id);assert.equal(publicGuide.term.year,2090);assert.match(publicGuide.html,/2090 年报考指南/);assert(!publicGuide.html.includes('2091 年的新流程'))
 let saved=(await call('/admin/exam-projects')).find(e=>e.id===id);const term2091=saved.year_entries.find(y=>y.year===2091);assert.match((await call('/exam-guide/'+id+'?termId='+term2091.id)).html,/2091 年的新流程/)
 await call('/exam-guide/mid-social-worker?termId=guide-2090',undefined,'GET',404)
 const assetId=publicGuide.html.match(/message-images\/([\w-]+)/)[1];await call('/admin/resources/'+assetId,{},'DELETE',409)
 const inventory=await call('/admin/resources?search='+encodeURIComponent('学习指导'));assert(inventory.items[0].references.some(r=>r.id===id&&r.location==='2090 年 · 了解考试'))
 await page.reload();await row.getByRole('button',{name:'编辑图文考试回归',exact:true}).click();await drawer.getByRole('tab',{name:'了解考试',exact:true}).click();await expect(editor).toContainText('2090 年报考指南');await expect(drawer.locator('.rich-editor img')).toBeVisible();await drawer.getByRole('button',{name:'保存',exact:true}).click();await expect(drawer).toHaveCount(0);assert.equal((await call('/exam-guide/'+id)).updatedAt,publicGuide.updatedAt)
 const mobile=await browser.newPage({viewport:{width:375,height:812},reducedMotion:'reduce'});await mobile.route('**/api/**',proxy);await mobile.addInitScript(()=>localStorage.setItem('sxb-current-exam',JSON.stringify({type:'object',data:{id:'guide-test',name:'图文考试回归'}})));await mobile.goto('http://127.0.0.1:5174/#/pages/exam-notice-detail/index');await expect(mobile.locator('.guide-prose')).toContainText('2090 年报考指南');await expect(mobile.locator('.guide-prose img')).toBeVisible();await expect(mobile.locator('.guide-prose img')).toHaveJSProperty('naturalWidth',640);assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await mobile.screenshot({path:output+'/mobile.png',fullPage:true})
 await mobile.goto('http://127.0.0.1:5174/#/pages/exam-notices/index');await expect(mobile).toHaveURL(/exam-notice-detail/);await expect(mobile.locator('.guide-prose')).toBeVisible()
 await migrateExamGuide();assert.equal((await call('/exam-guide/'+id)).html,publicGuide.html)
 // Clearing the current term must not fall back to another year's article.
 saved=(await call('/admin/exam-projects')).find(e=>e.id===id);await call('/admin/exam-projects/'+id,{...base,yearEntries:saved.year_entries.map(y=>({...y,guideDocument:y.year===2090?null:y.guideDocument}))},'PUT');assert.equal((await call('/exam-guide/'+id)).hasGuide,false);await mobile.reload();await expect(mobile.getByText('了解考试暂未更新',{exact:true})).toBeVisible();await expect(mobile.locator('.guide-prose')).toHaveCount(0)
 await call('/admin/exam-projects/'+id+'/status',{enabled:false},'PATCH');await call('/exam-guide/'+id,undefined,'GET',404)
 await mobile.close();await page.goto('http://127.0.0.1:5180/#article');await expect(page).toHaveURL(/#exam-projects$/);await expect(page.getByRole('navigation').getByRole('button',{name:'考前须知',exact:true})).toHaveCount(0)
 assert.deepEqual(errors,[]);console.log(JSON.stringify({status:'PASS',requiredFields:true,optionalGuide:true,perTerm:true,images:true,resourceProtection:true,reload:true,stableTimestamp:true,publicGuide:true,emptyState:true,legacyRoute:true,migration:true,liveWrites:0}))
}catch(e){await browser.contexts()[0]?.pages()[0]?.screenshot({path:output+'/failure.png',fullPage:true});throw e}finally{await browser.close();await new Promise(r=>server.close(r));await closeDatabase()}
