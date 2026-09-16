import assert from 'node:assert/strict'
import { mkdtemp, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import express from 'express'
import { chromium, expect } from '@playwright/test'
import { ZodError } from 'zod'
process.env.APP_MODE='test'
process.env.DATABASE_URL=''
process.env.LOCAL_DATABASE_DIR=await mkdtemp(join(tmpdir(),'sxb-knowledge-browser-'))
process.env.SECRET_KEY='1'.repeat(64)
process.env.ADMIN_PHONE='18600000000'
process.env.ADMIN_PASSWORD='Isolated-browser-test-42!'
const {db,closeDatabase}=await import('../apps/api/src/db.ts')
const {seed}=await import('../apps/api/src/seed.ts')
const {initSecrets,session}=await import('../apps/api/src/security.ts')
const {api}=await import('../apps/api/src/routes.ts')
const output=resolve('.local/qa/knowledge-migration')
await mkdir(output,{recursive:true})
let browser,server
try{
  await initSecrets();await seed()
  const admin=(await db.query("SELECT id FROM users WHERE account_kind='admin' LIMIT 1")).rows[0]
  const adminToken=await session(admin.id,'admin')
  const app=express()
  app.use(express.json({limit:'40mb'}));app.use('/api',api)
  app.use((e,req,res,next)=>res.status(e instanceof ZodError?400:e.status||(['23503','23514'].includes(e.code)?400:500)).json({message:e.message}))
  app.use('/mobile',express.static(resolve('apps/user/dist/build/h5')))
  app.use(express.static(resolve('apps/admin/dist')))
  app.use(express.static(resolve('apps/user/dist/build/h5')))
  server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r))
  const origin='http://127.0.0.1:'+server.address().port
  async function save(row){const r=await fetch(origin+'/api/admin/content/'+row.id,{method:'PUT',headers:{'Content-Type':'application/json',Authorization:'Bearer '+adminToken},body:JSON.stringify(row)});return {status:r.status,data:await r.json()}}
  browser=await chromium.launch({channel:'chrome',headless:true})
  const page=await browser.newPage({viewport:{width:1657,height:1272}})
  const errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.addInitScript(t=>sessionStorage.setItem('sxb-admin-token',t),adminToken)
  await page.goto(origin+'/#knowledge')
  await expect(page).toHaveURL(origin+'/#knowledge-graph')
  await expect(page.locator('nav').getByRole('button',{name:'知识点',exact:true})).toHaveCount(0)
  const section=(await db.query("SELECT * FROM content WHERE id='ability-section-1-1'")).rows[0]
  async function createCourse(owner,title){
    await page.goto(origin+'/#knowledge-graph')
    await page.reload()
    await page.locator('.grid button').filter({hasText:'初级社会工作师'}).click()
    await page.locator('.el-radio-button').filter({hasText:owner.kind==='section'?/^节$/:/^知识点$/}).click()
    await page.getByPlaceholder('搜索标题',{exact:true}).fill(owner.title)
    await page.getByPlaceholder('搜索标题',{exact:true}).press('Enter')
    await page.locator('.knowledge-list-manager .el-table__row').first().getByRole('button',{name:'编辑内容'}).click()
    await page.locator('.el-drawer:visible').getByRole('button',{name:'新增课程',exact:true}).click()
    const drawer=page.locator('.el-drawer:visible')
    await expect(drawer.locator('.el-select').filter({has:page.getByRole('combobox',{name:'所属考试',exact:true})})).toHaveCount(1)
    await drawer.getByRole('textbox').first().fill(title)
    const saved=page.waitForResponse(r=>r.request().method()==='PUT'&&r.url().includes('/admin/content/'))
    await drawer.getByRole('button',{name:'保存内容',exact:true}).click()
    const response=await saved;assert.equal(response.status(),200,await response.text())
    await expect(drawer).toHaveCount(0)
    const row=(await db.query('SELECT * FROM content WHERE title=$1',[title])).rows[0]
    assert.equal(row.parent_id,owner.id);assert.equal(row.exam_id,owner.exam_id)
    assert.equal((await save({...row,status:'review'})).status,200)
    const review=(await db.query('SELECT * FROM content WHERE id=$1',[row.id])).rows[0]
    assert.equal((await save({...review,status:'published'})).status,200)
    return (await db.query('SELECT * FROM content WHERE id=$1',[row.id])).rows[0]
  }
  const courseA=await createCourse(section,'迁移验证精品课程甲')
  const courseB=await createCourse(section,'迁移验证精品课程乙')
  const point=(await db.query("SELECT * FROM content WHERE id='kp-1-1-1'")).rows[0]
  const extra=await createCourse(point,'迁移验证知识点配套课程')
  assert.equal((await db.query('SELECT * FROM premium_courses WHERE id=ANY($1::text[])',[[courseA.id,courseB.id]])).rows.length,2)
  assert.equal((await db.query('SELECT * FROM knowledge_courses WHERE id=$1',[extra.id])).rows.length,1)
  assert.equal((await save({...extra,parent_id:'kp-1-1-2'})).status,400)
  // Real form multi-selection, including across subjects.
  const secondary=(await db.query("SELECT * FROM content WHERE id='kp-p-1-1-1'")).rows[0]
  await page.goto(origin+'/#question')
  const q=(await db.query("SELECT * FROM content WHERE id='q-001'")).rows[0]
  await page.getByPlaceholder('搜索标题',{exact:true}).fill(q.title)
  await page.getByPlaceholder('搜索标题',{exact:true}).press('Enter')
  await page.getByRole('row').filter({has:page.getByRole('button',{name:q.title,exact:true})}).getByRole('button',{name:'编辑内容'}).click()
  const associations=page.locator('.el-form-item').filter({has:page.locator('.el-form-item__label').filter({hasText:/^关联知识点$/})}).getByRole('combobox')
  await associations.fill(secondary.title)
  await page.getByRole('option').filter({hasText:secondary.title}).click()
  await page.getByRole('heading',{name:'编辑题目'}).click()
  const saved=page.waitForResponse(r=>r.request().method()==='PUT'&&r.url().endsWith('/admin/content/q-001'))
  await page.getByRole('button',{name:'保存内容',exact:true}).click()
  assert.equal((await saved).status(),200)
  const updated=(await db.query("SELECT * FROM content WHERE id='q-001'")).rows[0]
  assert.deepEqual(new Set(updated.payload.knowledgePointIds),new Set([point.id,secondary.id]))
  assert.equal((await save(q)).status,409)
  assert.equal((await save({...updated,payload:{...updated.payload,knowledgePointIds:[point.id,'missing']}})).status,400)
  assert.equal((await db.query("SELECT version FROM questions WHERE id='q-001'")).rows[0].version,updated.version)
  const data=await (await fetch(origin+'/api/catalog/junior-social-worker')).json()
  assert.equal(data.practiceQuestions.find(q=>q.id==='q-001').linkedSubjectIds.length,2)
  // Knowledge graph and knowledge management use the same table and editor.
  await page.goto(origin+'/#knowledge-graph')
  await page.locator('.grid button').filter({hasText:'初级社会工作师'}).click()
  await expect(page.getByRole('tab',{name:'列表管理'})).toHaveAttribute('aria-selected','true')
  await expect(page.locator('.summary-stat')).toHaveCount(6)
  const questionCount=(await db.query('SELECT count(*)::int AS n FROM questions WHERE exam_id=$1',[point.exam_id])).rows[0].n
  await expect(page.locator('[data-metric="question"] dd')).toHaveText(questionCount.toLocaleString('zh-CN'))
  await page.getByPlaceholder('搜索标题',{exact:true}).fill(point.title)
  await page.getByRole('row').filter({has:page.getByRole('button',{name:point.title,exact:true})}).getByRole('button',{name:'编辑内容'}).click()
  await expect(page.locator('.el-drawer:visible')).toContainText(extra.title)
  await page.getByRole('button',{name:'取消',exact:true}).last().click()
  // Per-level columns/filter scope and actual state writes; all data is isolated.
  const manager=page.locator('.knowledge-list-manager')
  await manager.getByRole('button',{name:'重置',exact:true}).click()
  const expectedHeaders={知识点:['标题','节','题数','配套课','状态','更新时间','操作'],节:['标题','章','知识点数','精品课','状态','更新时间','操作'],章:['标题','科目','节数','状态','更新时间','操作'],科目:['标题','考试项目','状态','更新时间','操作']}
  for(const [level,headers] of Object.entries(expectedHeaders)){
    await manager.locator('.el-radio-button').filter({hasText:new RegExp('^'+level+'$')}).click()
    assert.deepEqual(await manager.locator('thead th .cell').allTextContents(),headers)
    await expect(manager.getByRole('combobox',{name:'筛选配套课',exact:true})).toHaveCount(level==='知识点'?1:0)
    await expect(manager.getByRole('combobox',{name:'筛选精品课',exact:true})).toHaveCount(level==='节'?1:0)
    await expect(manager.getByRole('combobox',{name:'筛选节',exact:true})).toHaveCount(level==='知识点'?1:0)
  }
  await manager.locator('.el-radio-button').filter({hasText:/^知识点$/}).click()
  await manager.getByPlaceholder('搜索标题',{exact:true}).fill(point.title)
  const pointRow=manager.locator('.el-table__row').filter({has:page.getByRole('button',{name:point.title,exact:true})})
  const original=(await db.query('SELECT * FROM content WHERE id=$1',[point.id])).rows[0]
  const numberBefore=(await db.query('SELECT * FROM record_numbers WHERE record_id=$1',[point.id])).rows
  await pointRow.getByRole('button',{name:'停用',exact:true}).click()
  const disabled=page.waitForResponse(r=>r.request().method()==='PATCH'&&r.url().includes('/knowledge-nodes/'))
  await page.getByRole('button',{name:'停用',exact:true}).last().click()
  assert.equal((await disabled).status(),200)
  await expect(pointRow.getByRole('button',{name:'启用',exact:true})).toBeVisible()
  assert.equal((await db.query('SELECT status FROM content WHERE id=$1',[point.id])).rows[0].status,'offline')
  assert.equal((await page.request.patch(origin+'/api/admin/knowledge-nodes/'+point.id+'/status',{headers:{Authorization:'Bearer '+adminToken},data:{enabled:true,version:original.version}})).status(),409)
  await pointRow.getByRole('button',{name:'启用',exact:true}).click()
  const enabled=page.waitForResponse(r=>r.request().method()==='PATCH'&&r.url().includes('/knowledge-nodes/'))
  await page.getByRole('button',{name:'启用',exact:true}).last().click()
  assert.equal((await enabled).status(),200)
  await expect(pointRow.getByRole('button',{name:'停用',exact:true})).toBeVisible()
  assert.equal((await db.query('SELECT status FROM content WHERE id=$1',[point.id])).rows[0].status,original.status)
  assert.deepEqual((await db.query('SELECT * FROM record_numbers WHERE record_id=$1',[point.id])).rows,numberBefore)
  const download=page.waitForEvent('download')
  await page.getByRole('button',{name:'导出知识图谱 Excel'}).click()
  await (await download).saveAs(join(output,'actual-structure.xlsx'))
  await page.screenshot({path:join(output,'admin-list.png'),fullPage:true})
  await page.getByRole('tab',{name:'关系图谱'}).click()
  await expect(page.locator('.g6-canvas canvas').first()).toBeVisible()
  await page.getByRole('tab',{name:'思维导图'}).click()
  await expect(page.locator('.mind-canvas canvas').first()).toBeVisible()
  assert.deepEqual(await page.locator('.kg .el-alert--error').allTextContents(),[])
  assert.deepEqual(errors,[])
  // H5 reads the migrated catalog; every section course has its own row.
  const mobile=await browser.newPage({viewport:{width:390,height:844}})
  const mobileErrors=[];mobile.on('pageerror',e=>mobileErrors.push(e.message))
  await mobile.goto(origin+'/mobile/#/pages/courses/index')
  await expect(mobile.getByText(courseA.title,{exact:true})).toBeVisible({timeout:20000})
  await expect(mobile.getByText(courseB.title,{exact:true})).toBeVisible()
  await expect(mobile.getByText(extra.title,{exact:true})).toHaveCount(0)
  await expect(mobile.locator('uni-toast:visible')).toHaveCount(0)
  await mobile.screenshot({path:join(output,'mobile-courses.png'),fullPage:true})
  await mobile.goto(origin+'/mobile/#/pages/knowledge-detail/index?id='+point.id)
  await expect(mobile.getByText('知识点配套课 · '+extra.title,{exact:true})).toBeVisible({timeout:20000})
  await expect(mobile.getByText('本节精品课 · '+courseA.title,{exact:true})).toBeVisible()
  await expect(mobile.getByText('本节精品课 · '+courseB.title,{exact:true})).toBeVisible()
  assert.deepEqual(mobileErrors,[])
  await expect(mobile.locator('uni-toast:visible')).toHaveCount(0)
  await mobile.screenshot({path:join(output,'mobile-knowledge.png'),fullPage:true})
  console.log('PASS: real admin course creation, multi-point question save, ownership/rollback/version protection, shared graph list, actual XLSX export, G6 render, H5 multiple courses and knowledge links')
}finally{await browser?.close();if(server)await new Promise(r=>server.close(r));await closeDatabase()}
