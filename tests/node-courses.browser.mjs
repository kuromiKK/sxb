import 'dotenv/config'
import assert from 'node:assert/strict'
import {mkdir,mkdtemp} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {chromium,expect} from '@playwright/test'
import express from 'express'
import {ZodError} from 'zod'
process.env.APP_MODE='test';process.env.DATABASE_URL='';process.env.LOCAL_DATABASE_DIR=await mkdtemp(join(tmpdir(),'sxb-node-courses-'));process.env.MEDIA_DIR=await mkdtemp(join(tmpdir(),'sxb-course-media-'));process.env.SECRET_KEY='e'.repeat(64);process.env.ADMIN_PHONE='18600000000';process.env.ADMIN_PASSWORD='Browser-Courses-42!'
const {db,closeDatabase}=await import('../apps/api/src/db.ts'),{seed}=await import('../apps/api/src/seed.ts'),{initSecrets,session}=await import('../apps/api/src/security.ts'),{api}=await import('../apps/api/src/routes.ts')
await initSecrets();await seed()
const admin=(await db.query("SELECT id FROM users WHERE account_kind='admin' LIMIT 1")).rows[0],token=await session(admin.id,'admin'),student=await session('test-student-001'),free=await session('test-student-003')
const app=express();app.use(express.json({limit:'16mb'}));app.use('/api',api);app.use((e,_q,r,_n)=>r.status(e instanceof ZodError?400:e.status||500).json({message:e.message}))
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const origin='http://127.0.0.1:'+server.address().port
async function call(path,body,method='PUT',auth=token,expected=200){const r=await fetch(origin+'/api'+path,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+auth},body:body===undefined?undefined:JSON.stringify(body)});const data=await r.json();assert.equal(r.status,expected,JSON.stringify(data));return data}
const current=async id=>(await db.query('SELECT * FROM content WHERE id=$1',[id])).rows[0]
const exam='junior-social-worker'
for(const [id,kind,parent,title] of [['course-test-sub','subject',null,'课程回归科目'],['course-test-ch','chapter','course-test-sub','课程回归章'],['course-test-sec','section','course-test-ch','课程回归节'],['course-test-kp','knowledge','course-test-sec','课程回归知识点'],['course-test-sub2','subject',null,'另一个回归科目'],['course-test-ch2','chapter','course-test-sub2','另一个回归章']]){
 await call('/admin/content/'+id,{id,kind,exam_id:exam,parent_id:parent,title,status:'review',payload:{no:99,stars:3},source:'manual',is_test_data:true})
 await call('/admin/content/'+id,{...await current(id),status:'published'})
}
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=','base64')
const legacyHandout=await call('/admin/media/external',{examId:exam,contentId:'course-test-kp',kind:'handout',filename:'旧知识点讲义',url:'https://example.com/legacy.pdf'},'POST')
const legacyPoint=await current('course-test-kp');await call('/admin/content/'+legacyPoint.id,{...legacyPoint,payload:{...legacyPoint.payload,handouts:[{assetId:legacyHandout.id,title:'旧知识点讲义'}]}})
// PCM WAV fixture: short silence, valid header and audio data.
const wav=Buffer.alloc(2044);wav.write('RIFF');wav.writeUInt32LE(2036,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(2000,40)
const output='.local/qa/node-courses';await mkdir(output,{recursive:true})
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
 const page=await browser.newPage({viewport:{width:1733,height:1100},reducedMotion:'reduce'}),errors=[]
 page.on('pageerror',e=>errors.push(e.message))
 await page.route('**/api/**',async route=>{const u=new URL(route.request().url());if(!u.pathname.startsWith('/api/'))return route.continue();const r=await route.fetch({url:origin+u.pathname+u.search});await route.fulfill({response:r})})
 await page.addInitScript(t=>sessionStorage.setItem('sxb-admin-token',t),token)
 await page.goto('http://127.0.0.1:5180/#knowledge-graph');await page.locator('.grid button').filter({hasText:'初级社会工作师'}).click()
 const manager=page.locator('.knowledge-list-manager'),nodeDrawer=page.locator('.editor-drawer:visible'),courseDrawer=page.locator('.course-editor-drawer:visible')
 const choose=async(scope,label,value)=>{await scope.locator('.el-select').filter({has:page.getByRole('combobox',{name:label,exact:true})}).click();await page.getByRole('option',{name:value,exact:true}).click()}
 const kind=async label=>{await manager.locator('.el-radio-button').filter({hasText:new RegExp('^'+label+'$')}).click()}
 const save=async(scope,label)=>{const response=page.waitForResponse(r=>r.url().includes('/admin/content/')&&r.request().method()==='PUT');await scope.getByRole('button',{name:label,exact:true}).click();const r=await response;assert.equal(r.status(),200,await r.text());await expect(scope).toHaveCount(0);await expect(page.locator('.el-loading-mask:visible')).toHaveCount(0)}
 for(const [label,title,fields] of [['科目','课程回归科目',1],['章','课程回归章',2],['节','课程回归节',3],['知识点','课程回归知识点',4]]){
  await kind(label);await manager.getByPlaceholder('搜索标题',{exact:true}).fill(title)
  await manager.getByRole('button',{name:'编辑内容'}).first().click()
  await expect(nodeDrawer.locator('.parent-fields .el-select')).toHaveCount(fields)
  if(label!=='科目')await expect(nodeDrawer.locator('.parent-fields')).toContainText('课程回归科目')
  if(label==='知识点'){
   await expect(nodeDrawer.locator('.knowledge-handouts')).toHaveCount(0)
   await expect(nodeDrawer.locator('.parent-fields')).toContainText('课程回归章');await expect(nodeDrawer.locator('.parent-fields')).toContainText('课程回归节')
   await choose(nodeDrawer,'所属科目','另一个回归科目');await expect(nodeDrawer.getByRole('combobox',{name:'所属节',exact:true})).toBeDisabled()
   await expect(nodeDrawer.getByText('请选择章',{exact:true})).toBeVisible()
   await expect(nodeDrawer.getByText('请先选择章',{exact:true})).toBeVisible()
   await choose(nodeDrawer,'所属章','另一个回归章');await nodeDrawer.locator('.el-select').filter({has:page.getByRole('combobox',{name:'所属节',exact:true})}).click();await expect(page.getByRole('option',{name:'课程回归节',exact:true})).toHaveCount(0);await page.keyboard.press('Escape')
   await choose(nodeDrawer,'所属科目','课程回归科目');await choose(nodeDrawer,'所属章','课程回归章');await expect(nodeDrawer.getByText('请选择节',{exact:true})).toBeVisible();await choose(nodeDrawer,'所属节','课程回归节')
  }
  await page.screenshot({path:output+'/cascade-'+label+'.png',animations:'disabled'})
  await save(nodeDrawer,'保存内容')
  await manager.getByRole('button',{name:'新增'+label,exact:true}).click();await expect(nodeDrawer.locator('.parent-fields .el-select')).toHaveCount(fields)
  if(fields>=3)await expect(nodeDrawer.getByRole('combobox',{name:'所属章',exact:true})).toBeDisabled()
  if(fields===4)await expect(nodeDrawer.getByRole('combobox',{name:'所属节',exact:true})).toBeDisabled()
  await nodeDrawer.getByRole('button',{name:'取消',exact:true}).click()
 }
 for(const [level,nodeId,title,label] of [['节','course-test-sec','课程回归节','精品课'],['知识点','course-test-kp','课程回归知识点','配套课']]){
  await kind(level);await manager.getByPlaceholder('搜索标题',{exact:true}).fill(title)
  await manager.getByRole('button',{name:'添加'+label,exact:true}).click()
  await expect(courseDrawer.getByRole('textbox',{name:'课程归属'})).toHaveValue(title);await expect(courseDrawer.getByRole('textbox',{name:'课程归属'})).toBeDisabled()
  await courseDrawer.getByRole('textbox',{name:'课程标题'}).fill('回归'+label)
  await courseDrawer.getByRole('textbox',{name:'课程简介'}).fill('课程简介\n支持多行')
  const body=courseDrawer.getByRole('textbox',{name:'图文正文编辑器'});await body.fill('图文课程正文');await body.press('Control+A');await courseDrawer.getByRole('button',{name:'加粗',exact:true}).click()
  const handout=courseDrawer.locator('.course-asset[aria-label="讲义"]')
  await handout.locator('input[type=file]').setInputFiles({name:'课程讲义.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\n% test\n%%EOF')});await handout.getByRole('button',{name:'上传讲义',exact:true}).click();await expect(handout.getByRole('button',{name:'移除讲义'})).toBeVisible()
  await page.screenshot({path:output+'/create-'+label+'.png',animations:'disabled'});await save(courseDrawer,'保存'+label)
  const first=(await db.query("SELECT * FROM content WHERE kind='course' AND parent_id=$1 AND title=$2",[nodeId,'回归'+label])).rows[0]
  assert(first.payload.document);assert.equal(first.payload.hasHandout,true)
  await call('/admin/content/'+first.id,{...first,status:'review'});await call('/admin/content/'+first.id,{...await current(first.id),status:'published'})
  const articleDetail=await call('/courses/'+first.id,undefined,'GET',student);assert.match(articleDetail.blocks[0].html,/<strong>图文课程正文<\/strong>/)
  const catalog=await call('/catalog/'+exam,undefined,'GET',student),catalogCourse=catalog.courseCatalog.find(c=>c.id===first.id);assert.ok(catalogCourse.chapterNo>0&&catalogCourse.sectionNo>0)
  const mobile=await browser.newPage({viewport:{width:390,height:844}})
  await mobile.route('**/api/**',async route=>{const u=new URL(route.request().url());if(!u.pathname.startsWith('/api/'))return route.continue();const response=await route.fetch({url:origin+u.pathname+u.search});await route.fulfill({response})})
  await mobile.addInitScript(t=>{localStorage.setItem('sxb-api-token',t);localStorage.setItem('sxb-current-exam',JSON.stringify({type:'object',data:{id:'junior-social-worker',name:'初级社会工作师',daysLeft:100}}))},student)
  await mobile.goto('http://127.0.0.1:5174/#/pages/course-detail/index?id='+first.id)
  await expect(mobile.locator('.article-body')).toContainText('图文课程正文',{timeout:20000})
  await mobile.screenshot({path:output+'/mobile-article-'+label+'.png',fullPage:true})
  if(level==='知识点'){
   await mobile.goto('http://127.0.0.1:5174/#/pages/knowledge-detail/index?id='+nodeId)
   await expect(mobile.locator('.detail-page')).toBeVisible()
   await expect(mobile.locator('.course-row').filter({hasText:'回归配套课'})).toContainText('含讲义')
   await expect(mobile.locator('.knowledge-handouts')).toHaveCount(0)
   await mobile.screenshot({path:output+'/mobile-knowledge-course-handout.png',fullPage:true})
   await mobile.locator('.course-row').filter({hasText:'回归配套课'}).click()
   await expect(mobile.locator('.article-body')).toContainText('图文课程正文')
   await expect(mobile.getByText('含配套讲义',{exact:true})).toBeVisible()
  }
  await mobile.close()
  await page.getByRole('button',{name:'刷新数据',exact:true}).click();await expect(page.locator('.el-loading-mask:visible')).toHaveCount(0)
  await manager.getByRole('button',{name:'编辑内容'}).click();const flag=nodeDrawer.getByRole('checkbox',{name:label,exact:true});await expect(flag).toBeChecked();await expect(flag).toBeDisabled();await expect(nodeDrawer.getByRole('button',{name:'新增课程'})).toHaveCount(0);await nodeDrawer.getByRole('button',{name:'取消',exact:true}).click()
  await manager.getByRole('button',{name:'管理'+label}).click()
  const courseManager=page.getByRole('dialog',{name:label+'管理',exact:true})
  await courseManager.getByRole('button',{name:'编辑',exact:true}).first().click()
  await courseDrawer.locator('.el-radio-button').filter({hasText:/^视频$/}).click()
  await expect(courseDrawer.getByRole('textbox',{name:'图文正文编辑器'})).toHaveCount(0)
  const video=courseDrawer.locator('.course-asset[aria-label="视频"]');await video.locator('.el-radio-button').filter({hasText:/^链接$/}).click();await video.getByRole('textbox',{name:'视频链接'}).fill('https://example.com/course.mp4');await video.getByRole('button',{name:'添加链接',exact:true}).click();await expect(video.getByRole('button',{name:'移除视频'})).toBeVisible()
  const cover=courseDrawer.locator('.course-asset[aria-label="封面图"]');await expect(cover.getByRole('radiogroup')).toHaveCount(0);await expect(cover.getByRole('textbox',{name:'封面图链接'})).toHaveCount(0);await cover.locator('input[type=file]').setInputFiles({name:'cover.png',mimeType:'image/png',buffer:png});await cover.getByRole('button',{name:'上传封面图',exact:true}).click();await expect(cover.getByRole('button',{name:'移除封面图'})).toBeVisible()
  await courseDrawer.getByRole('spinbutton',{name:'时长（分钟）'}).fill('12.5');await save(courseDrawer,'保存'+label)
  await courseManager.locator('.el-drawer__close-btn').click()
  await manager.getByRole('button',{name:'编辑'+label,exact:true}).click();await expect(courseDrawer.getByRole('textbox',{name:'课程标题'})).toHaveValue('回归'+label);await courseDrawer.getByRole('button',{name:'取消',exact:true}).click()
  await manager.getByRole('button',{name:'管理'+label}).click();await courseManager.getByRole('button',{name:'新增课程',exact:true}).click();await courseDrawer.getByRole('textbox',{name:'课程标题'}).fill('第二门'+label);await courseDrawer.locator('.el-radio-button').filter({hasText:/^音频$/}).click()
  await expect(courseDrawer.locator('.course-asset[aria-label="封面图"]')).toHaveCount(0)
  const audio=courseDrawer.locator('.course-asset[aria-label="音频"]');await audio.locator('input[type=file]').setInputFiles({name:'test.wav',mimeType:'audio/wav',buffer:wav});await audio.getByRole('button',{name:'上传音频',exact:true}).click();await expect(audio.getByRole('button',{name:'移除音频'})).toBeVisible()
  const secondHandout=courseDrawer.locator('.course-asset[aria-label="讲义"]');await secondHandout.locator('.el-radio-button').filter({hasText:/^链接$/}).click();await secondHandout.getByRole('textbox',{name:'讲义链接'}).fill('https://example.com/handout.pdf');await secondHandout.getByRole('button',{name:'添加链接',exact:true}).click();await expect(secondHandout.getByRole('button',{name:'移除讲义'})).toBeVisible()
  await courseDrawer.getByRole('spinbutton',{name:'时长（分钟）'}).fill('2');await page.screenshot({path:output+'/audio-'+label+'.png',animations:'disabled'});await save(courseDrawer,'保存'+label)
  assert.equal((await call('/admin/content?kind=course&parentId='+nodeId,undefined,'GET')).total,2)
  await courseManager.locator('.el-drawer__close-btn').click()
  let updated=await current(first.id)
  await call('/admin/content/'+first.id,{...updated,parent_id:level==='节'?'course-test-kp':'course-test-sec'},'PUT',token,400)
  await call('/admin/content/'+first.id,{...updated,status:'review'});await call('/admin/content/'+first.id,{...await current(first.id),status:'published'})
  const detail=await call('/courses/'+first.id,undefined,'GET',student);assert.match(detail.mediaUrl,/\/api\/media\/t\//);assert.match(detail.posterUrl,/\/api\/media\/t\//);assert(detail.handoutDownloadPath)
  await call('/courses/'+first.id,undefined,'GET',free,403)
  const download=await call(detail.handoutDownloadPath,undefined,'GET',student);assert.match(download.url,/\/api\/media\/t\//)
  assert.equal((await fetch(origin+download.url)).status,200)
  await page.getByRole('button',{name:'刷新数据',exact:true}).click();await expect(page.locator('.el-loading-mask:visible')).toHaveCount(0)
  await manager.getByRole('button',{name:'编辑'+label,exact:true}).click()
  for(let remaining=2;remaining>0;remaining--){
   await expect(courseManager.locator('tbody tr')).toHaveCount(remaining);await courseManager.getByRole('button',{name:'编辑',exact:true}).first().click()
   await courseDrawer.getByRole('button',{name:'删除'+label,exact:true}).click();await page.locator('.el-message-box').getByRole('button',{name:'删除',exact:true}).click();await expect(courseDrawer).toHaveCount(0);await expect(courseManager.locator('tbody tr')).toHaveCount(remaining-1)
  }
  await courseManager.locator('.el-drawer__close-btn').click();await manager.getByRole('button',{name:'编辑内容'}).click();await expect(nodeDrawer.getByRole('checkbox',{name:label,exact:true})).not.toBeChecked();await nodeDrawer.getByRole('button',{name:'取消',exact:true}).click()
  assert.equal((await fetch(origin+detail.mediaUrl,{redirect:'manual'})).status,404)
  assert.equal((await call('/admin/content?kind=course&parentId='+nodeId,undefined,'GET')).total,0)
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({status:'PASS',cascades:4,independentCourses:2,multipleCourses:true,upload:true,externalLinks:true,derivedFlags:true,delete:true,memberPlayback:true,liveContentWrites:0}))
}finally{await browser.close();await new Promise(r=>server.close(r));await closeDatabase()}
