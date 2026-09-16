import 'dotenv/config'
import assert from 'node:assert/strict'
import {mkdir,mkdtemp} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {chromium,expect} from '@playwright/test'
import express from 'express'
import {ZodError} from 'zod'

process.env.APP_MODE='test';process.env.DATABASE_URL='';process.env.LOCAL_DATABASE_DIR=await mkdtemp(join(tmpdir(),'sxb-knowledge-body-'));process.env.SECRET_KEY='d'.repeat(64);process.env.ADMIN_PHONE='18600000000';process.env.ADMIN_PASSWORD='Browser-Knowledge-42!'
const {db,closeDatabase}=await import('../apps/api/src/db.ts')
const {seed}=await import('../apps/api/src/seed.ts')
const {initSecrets,session}=await import('../apps/api/src/security.ts')
const {api}=await import('../apps/api/src/routes.ts')
const {inspectDocument,renderText}=await import('../apps/api/src/rich-document.ts')
await initSecrets();await seed()
const admin=(await db.query("SELECT id FROM users WHERE account_kind='admin' LIMIT 1")).rows[0],token=await session(admin.id,'admin')
const app=express();app.use(express.json({limit:'16mb'}));app.use('/api',api);app.use((e,_q,r,_n)=>r.status(e instanceof ZodError?400:e.status||500).json({message:e.message}))
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const origin='http://127.0.0.1:'+server.address().port
const output='.local/qa/knowledge-body';await mkdir(output,{recursive:true})
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
  const page=await browser.newPage({viewport:{width:1733,height:1100},reducedMotion:'reduce'}),errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.route('**/api/**',async route=>{const u=new URL(route.request().url());if(!u.pathname.startsWith('/api/'))return route.continue();const response=await route.fetch({url:origin+u.pathname+u.search});await route.fulfill({response})})
  await page.addInitScript(t=>sessionStorage.setItem('sxb-admin-token',t),token)
  await page.goto('http://127.0.0.1:5180/#knowledge-graph')
  await page.locator('.grid button').filter({hasText:'初级社会工作师'}).click()
  const manager=page.locator('.knowledge-list-manager'),drawer=page.locator('.editor-drawer:visible')
  const body=()=>drawer.getByRole('textbox',{name:'图文正文编辑器'})
  const tool=async name=>{await drawer.getByRole('button',{name,exact:true}).click();await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))}
  const chooseKind=async label=>{await manager.locator('.el-radio-button').filter({hasText:new RegExp('^'+label+'$')}).click()}
  const save=async()=>{
    const response=page.waitForResponse(r=>r.url().includes('/admin/content/')&&r.request().method()==='PUT')
    await drawer.getByRole('button',{name:'保存内容',exact:true}).click()
    const result=await response;assert.equal(result.status(),200,await result.text());await expect(drawer).toHaveCount(0)
    await expect(page.locator('.el-loading-mask:visible')).toHaveCount(0)
  }
  let parentTitle=''
  for(const [kind,label] of [['subject','科目'],['chapter','章'],['section','节']]){
    await chooseKind(label)
    // Existing plaintext is preserved when opening and saving the new editor.
    const legacy=(await db.query('SELECT * FROM content WHERE kind=$1 AND exam_id=$2 LIMIT 1',[kind,'junior-social-worker'])).rows[0]
    const apiSave=payload=>fetch(origin+'/api/admin/content/'+legacy.id,{method:'PUT',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({...legacy,payload})})
    const missing=await apiSave({});assert.equal(missing.status,200,await missing.text());legacy.version++
    const invalid=await apiSave({document:{type:'doc',content:[{type:'iframe'}]}});assert.equal(invalid.status,400)
    // Resource ownership must also allow editing existing subjects/chapters/sections.
    const media=await fetch(origin+'/api/admin/media/external',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({examId:legacy.exam_id,contentId:legacy.id,kind:'image',url:'https://example.com/image.png',filename:'正文图片'})})
    assert.equal(media.status,200);const asset=await media.json()
    const resource={type:'doc',content:[{type:'resource',attrs:{assetId:asset.id,kind:'image',title:'正文图片',posterAssetId:null}}]}
    const resourceSave=await apiSave({document:resource});assert.equal(resourceSave.status,200,await resourceSave.text());legacy.version++
    const foreign=await apiSave({document:{type:'doc',content:[{type:'resource',attrs:{assetId:'not-owned',kind:'image',title:'其他图片'}}]}});assert.equal(foreign.status,400)
    await db.query("UPDATE content SET payload=jsonb_set(payload-'document','{content}',to_jsonb($2::text)) WHERE id=$1",[legacy.id,'原有'+label+'正文'])
    await page.getByRole('button',{name:'刷新数据',exact:true}).click()
    await expect(page.locator('.el-loading-mask:visible')).toHaveCount(0)
    await manager.getByPlaceholder('搜索标题',{exact:true}).fill(legacy.title)
    await manager.getByRole('button',{name:'编辑内容'}).first().click()
    await expect(body()).toHaveText('原有'+label+'正文')
    await save()
    assert.equal((await db.query('SELECT payload FROM content WHERE id=$1',[legacy.id])).rows[0].payload.content,'原有'+label+'正文')
    await manager.getByPlaceholder('搜索标题',{exact:true}).fill('')
    await manager.getByRole('button',{name:'新增'+label,exact:true}).click()
    await expect(drawer.locator('.el-drawer__title')).toHaveText('新增'+label)
    await expect(body()).toBeEmpty()
    await expect(drawer.locator('.el-form-item').filter({hasText:'正文（选填）'})).not.toHaveClass(/is-required/)
    const title='正文验证'+label
    await drawer.locator('.el-form-item').filter({has:page.locator('.el-form-item__label',{hasText:/^标题$/})}).locator('textarea').fill(title)
    if(parentTitle){
      await drawer.locator('.el-select').filter({has:page.getByRole('combobox',{name:'所属科目',exact:true})}).click();await page.getByRole('option',{name:'正文验证科目',exact:true}).click()
      if(kind==='section'){await drawer.locator('.el-select').filter({has:page.getByRole('combobox',{name:'所属章',exact:true})}).click();await page.getByRole('option',{name:'正文验证章',exact:true}).click()}
    }
    await save()
    let saved=(await db.query('SELECT * FROM content WHERE title=$1',[title])).rows[0]
    assert.equal(saved.payload.content,'')
    await manager.getByPlaceholder('搜索标题',{exact:true}).fill(title)
    const reopen=async()=>{await manager.getByRole('button',{name:'编辑内容'}).first().click();await expect(body()).toBeVisible()}
    await reopen();await expect(drawer.locator('.el-drawer__title')).toHaveText('编辑'+label)
    await body().fill('加粗正文');await body().press('Control+A');await tool('加粗')
    await expect(body().locator('strong')).toHaveText('加粗正文')
    await body().press('Control+End');await body().press('Enter');await tool('无序列表');await page.keyboard.insertText('列表内容')
    await expect(body().locator('ul')).toContainText('列表内容')
    await body().press('Enter');await body().press('Enter');await tool('插入表格')
    await body().locator('th').first().click();await page.keyboard.insertText('表格内容')
    await save();await reopen()
    await expect(body().locator('strong').first()).toContainText('加粗正文')
    await expect(body().locator('ul')).toContainText('列表内容')
    await expect(body().locator('table')).toContainText('表格内容')
    await page.screenshot({path:output+'/'+kind+'.png',fullPage:true,animations:'disabled'})
    saved=(await db.query('SELECT * FROM content WHERE id=$1',[saved.id])).rows[0]
    assert.match(saved.payload.content,/加粗正文/);assert.match(saved.payload.content,/表格内容/)
    assert.match(renderText(saved.payload.document),/<table>/)
    await body().fill('');await save();await reopen();await expect(body()).toBeEmpty()
    assert.equal((await db.query('SELECT payload FROM content WHERE id=$1',[saved.id])).rows[0].payload.content,'')
    await drawer.getByRole('button',{name:'取消',exact:true}).click()
    parentTitle=title
  }
  for(const src of ['javascript:alert(1)','data:text/html,bad'])assert.throws(()=>inspectDocument({type:'doc',content:[{type:'image',attrs:{src}}]}))
  const image={type:'image',attrs:{src:'https://example.com/image.png',alt:'"<test>',width:null,height:null}}
  inspectDocument({type:'doc',content:[image]});assert.match(renderText(image),/&quot;&lt;test&gt;/)
  assert.deepEqual(errors,[])
  console.log(JSON.stringify({status:'PASS',kinds:3,optionalCreate:true,legacyText:true,formatPersistence:true,tables:true,clearBody:true,liveContentWrites:0}))
}finally{await browser.close();await new Promise(r=>server.close(r));await closeDatabase()}
