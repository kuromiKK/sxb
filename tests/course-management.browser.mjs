import 'dotenv/config'
import assert from 'node:assert/strict'
import {mkdir,mkdtemp} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {chromium,expect} from '@playwright/test'
import express from 'express'
import {ZodError} from 'zod'
process.env.APP_MODE='test';process.env.DATABASE_URL='';process.env.LOCAL_DATABASE_DIR=await mkdtemp(join(tmpdir(),'sxb-course-management-'));process.env.MEDIA_DIR=await mkdtemp(join(tmpdir(),'sxb-course-management-media-'));process.env.SECRET_KEY='e'.repeat(64);process.env.ADMIN_PHONE='18600000000';process.env.ADMIN_PASSWORD='Browser-Courses-42!'
const {db,closeDatabase}=await import('../apps/api/src/db.ts'),{seed}=await import('../apps/api/src/seed.ts'),{initSecrets,session}=await import('../apps/api/src/security.ts'),{api}=await import('../apps/api/src/routes.ts')
await initSecrets();await seed()
const admin=(await db.query("SELECT id FROM users WHERE account_kind='admin' LIMIT 1")).rows[0],token=await session(admin.id,'admin'),student=await session('test-student-001')
const app=express();app.use(express.json({limit:'16mb'}));app.use('/api',api);app.use((e,_q,r,_n)=>r.status(e instanceof ZodError?400:e.status||500).json({message:e.message}))
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const origin='http://127.0.0.1:'+server.address().port
async function call(path,body,method='GET',auth=token,expected=200){const r=await fetch(origin+'/api'+path,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+auth},body:body===undefined?undefined:JSON.stringify(body)});const data=await r.json();assert.equal(r.status,expected,JSON.stringify(data));return data}
const current=async id=>(await db.query('SELECT * FROM content WHERE id=$1',[id])).rows[0]
const exam='junior-social-worker',names={subject:'管理回归科目',chapter:'社会工作专业价值观与伦理原则在复杂服务情境中的应用',section:'社会工作者在服务对象权益保护与多方利益协调中的专业实践',knowledge:'运用个案管理方法识别服务对象多元需求并制定综合服务计划的基本原则与实施步骤'}
for(const [id,kind,parent] of [['cm-sub','subject',null],['cm-ch','chapter','cm-sub'],['cm-sec','section','cm-ch'],['cm-kp','knowledge','cm-sec']])await call('/admin/content/'+id,{id,kind,exam_id:exam,parent_id:parent,title:names[kind],status:'draft',payload:{no:98,stars:3},source:'manual',is_test_data:true},'PUT')
for(let i=0;i<23;i++){const id='cm-course-'+i;await call('/admin/content/'+id,{id,kind:'course',exam_id:exam,parent_id:i===22?'cm-kp':'cm-sec',title:'管理回归课程 '+String(i).padStart(2,'0'),status:'review',payload:{type:'article',content:'回归正文',requiredLevel:'vip'},source:'manual',is_test_data:true},'PUT');await call('/admin/content/'+id,{...await current(id),status:'published'},'PUT')}
await call('/admin/courses',undefined,'GET',student,403)
const premium=await call('/admin/courses?type=premium&subjectId=cm-sub');assert.equal(premium.total,22);assert.equal(premium.items.length,20);assert.equal(premium.items[0].parent_title,names.section);assert.equal(premium.items[0].chapter_name,names.chapter)
assert.equal((await call('/admin/courses?type=premium&subjectId=cm-sub&page=2')).items.length,2)
assert.equal((await call('/admin/courses?type=supporting&knowledgeId=cm-kp')).total,1)
assert.equal((await call('/admin/courses?type=premium&subjectId=cm-sub&examId=senior-social-worker')).total,0)
assert.equal((await call('/admin/courses?type=premium&subjectId=cm-sub&search=不存在')).total,0)
const output='.local/qa/course-management';await mkdir(output,{recursive:true})
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
 const page=await browser.newPage({viewport:{width:1733,height:1100},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.route('**/api/**',async route=>{const u=new URL(route.request().url());if(!u.pathname.startsWith('/api/'))return route.continue();const r=await route.fetch({url:origin+u.pathname+u.search});await route.fulfill({response:r})})
 await page.addInitScript(t=>sessionStorage.setItem('sxb-admin-token',t),token)
 await page.goto('http://127.0.0.1:5180/#course')
 const management=page.locator('.course-management'),drawer=page.locator('.course-editor-drawer:visible')
 const choose=async(label,value)=>{await management.locator('.el-select').filter({has:page.getByRole('combobox',{name:'筛选'+label,exact:true})}).click();await page.getByRole('option').filter({has:page.getByText(value,{exact:true})}).click()}
 const idle=async()=>{await expect(page.locator('.el-loading-mask:visible')).toHaveCount(0)}
 await expect(page.locator('.page-heading h1')).toHaveText('课程管理');await expect(page.getByRole('button',{name:/新增/})).toHaveCount(0)
 await choose('考试','初级社会工作师');await choose('科目',names.subject);await idle();await expect(management.locator('tbody tr')).toHaveCount(20)
 await expect(management.getByRole('combobox',{name:'筛选知识点',exact:true})).toHaveCount(0)
 await choose('章',names.chapter);await choose('节',names.section);await idle()
 await expect(management.locator('.course-parent').first()).toContainText(names.chapter);await expect(management.locator('.course-parent').first()).toContainText(names.section)
 await page.screenshot({path:output+'/premium.png',animations:'disabled'})
 await management.locator('.el-pagination .number').filter({hasText:/^2$/}).click();await expect(management.locator('tbody tr')).toHaveCount(2)
 await management.getByRole('textbox',{name:'筛选标题'}).fill('管理回归课程 00');await management.getByRole('button',{name:'查询',exact:true}).click();await expect(management.locator('tbody tr')).toHaveCount(1)
 await management.getByRole('button',{name:'停用',exact:true}).click();await page.locator('.el-message-box').getByRole('button',{name:'停用',exact:true}).click();await expect(management.getByRole('button',{name:'启用',exact:true})).toBeVisible()
 const disabled=await current('cm-course-0');assert.equal(disabled.status,'offline');await call('/admin/courses/cm-course-0/status',{enabled:true,version:disabled.version-1},'PATCH',token,409)
 await management.getByRole('button',{name:'启用',exact:true}).click();await page.locator('.el-message-box').getByRole('button',{name:'启用',exact:true}).click();await expect(management.locator('tbody')).toContainText('已发布');assert.equal((await current('cm-course-0')).status,'published')
 await management.getByRole('button',{name:'编辑课程',exact:true}).click();await expect(drawer.getByRole('textbox',{name:'课程归属'})).toHaveValue(names.section);await expect(drawer.getByRole('textbox',{name:'课程归属'})).toBeDisabled();await drawer.getByRole('textbox',{name:'课程标题'}).fill('管理回归课程 00 已编辑')
 await drawer.getByRole('button',{name:'保存精品课',exact:true}).click();await expect(drawer).toHaveCount(0);await expect(management.locator('tbody')).toContainText('管理回归课程 00 已编辑')
 await choose('考试','全部考试');await expect(management.locator('.admin-filters')).toContainText('全部科目');await expect(management.locator('.admin-filters')).toContainText('全部章');await expect(management.locator('.admin-filters')).toContainText('全部节')
 await management.getByRole('tab',{name:'配套课',exact:true}).click();await choose('考试','初级社会工作师');await choose('科目',names.subject);await choose('章',names.chapter);await choose('节',names.section);await choose('知识点',names.knowledge);await idle();await expect(management.locator('tbody tr')).toHaveCount(1)
 await expect(management.locator('.course-parent')).toContainText(names.knowledge);await expect(management.locator('.course-parent')).toContainText(names.section);await expect(management.locator('.course-parent')).toContainText('初级社会工作师')
 for(const width of [2097,1280]){await page.setViewportSize({width,height:1100});await page.screenshot({path:output+'/supporting-'+width+'.png',animations:'disabled'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)}
 await management.getByRole('button',{name:'编辑课程',exact:true}).click();await expect(drawer.locator('.el-drawer__title')).toHaveText('编辑配套课');await drawer.getByRole('button',{name:'删除配套课',exact:true}).click();await page.locator('.el-message-box').getByRole('button',{name:'删除',exact:true}).click();await expect(drawer).toHaveCount(0);await expect(management.locator('tbody tr')).toHaveCount(0)
 assert.equal((await call('/admin/courses?type=supporting&knowledgeId=cm-kp')).total,0)
 assert.deepEqual(errors,[]);console.log(JSON.stringify({status:'PASS',tabs:2,pagination:true,cascades:true,longPaths:true,statusRestore:true,conflict:true,edit:true,delete:true,noCreate:true,liveContentWrites:0}))
}finally{await browser.close();await new Promise(r=>server.close(r));await closeDatabase()}
