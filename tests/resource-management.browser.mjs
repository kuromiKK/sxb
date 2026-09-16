import 'dotenv/config'
import assert from 'node:assert/strict'
import {mkdir,mkdtemp,access,readFile} from 'node:fs/promises'
import {execFileSync} from 'node:child_process'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {chromium,expect} from '@playwright/test'
import JSZip from 'jszip'
import express from 'express'
import {ZodError} from 'zod'
process.env.APP_MODE='test';process.env.DATABASE_URL='';process.env.LOCAL_DATABASE_DIR=await mkdtemp(join(tmpdir(),'sxb-resource-test-'));process.env.MEDIA_DIR=await mkdtemp(join(tmpdir(),'sxb-resource-files-'));process.env.SECRET_KEY='f'.repeat(64);process.env.ADMIN_PHONE='18600000000';process.env.ADMIN_PASSWORD='Resource-Tests-42!'
const {db,closeDatabase}=await import('../apps/api/src/db.ts'),{seed}=await import('../apps/api/src/seed.ts'),{initSecrets,session}=await import('../apps/api/src/security.ts'),{api}=await import('../apps/api/src/routes.ts')
await initSecrets();await seed()
const admin=(await db.query("SELECT id FROM users WHERE account_kind='admin' LIMIT 1")).rows[0],token=await session(admin.id,'admin'),student=await session('test-student-001')
const app=express();app.use(express.json({limit:'16mb'}));app.use('/api',api);app.use((e,_q,r,_n)=>r.status(e instanceof ZodError?400:e.status||500).json({message:e.message}))
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const origin='http://127.0.0.1:'+server.address().port
async function call(path,body,method='GET',auth=token,expected=200){const r=await fetch(origin+'/api'+path,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+auth},body:body===undefined?undefined:JSON.stringify(body)});const data=await r.json();assert.equal(r.status,expected,JSON.stringify(data));return data}
const current=async id=>(await db.query('SELECT * FROM content WHERE id=$1',[id])).rows[0],exam='junior-social-worker'
for(const [id,kind,parent] of [['rm-sub','subject',null],['rm-ch','chapter','rm-sub'],['rm-sec','section','rm-ch'],['rm-kp','knowledge','rm-sec'],['rm-course','course','rm-sec']])await call('/admin/content/'+id,{id,kind,exam_id:exam,parent_id:parent,title:kind==='course'?'社会工作价值观与伦理 · 资源测试课程':'资源管理回归'+kind,status:'draft',payload:kind==='course'?{type:'article'}:{no:98,stars:3},source:'manual',is_test_data:true},'PUT')
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=','base64')
const wav=Buffer.alloc(2044);wav.write('RIFF');wav.writeUInt32LE(2036,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(2000,40)
async function upload(kind,filename,buffer,owner='rm-course'){const form=new FormData();form.append('file',new Blob([buffer]),filename);const response=await fetch(origin+'/api/admin/media/upload?'+new URLSearchParams({examId:exam,contentId:owner,kind}),{method:'POST',headers:{Authorization:'Bearer '+token},body:form});const data=await response.json();assert.equal(response.status,200,JSON.stringify(data));return data.id}
const imageId=await upload('image','社会工作服务流程图.png',png),unused=await upload('image','未使用的旧封面.png',png),posterId=await upload('image','正文视频封面.png',png,'rm-kp'),audioId=await upload('audio','考点讲解音频.wav',wav),pdfId=await upload('handout','章节精讲讲义.pdf',Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF'))
const docx=new JSZip();docx.file('[Content_Types].xml','<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');docx.file('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>专业价值观与伦理原则</w:t></w:r></w:p></w:body></w:document>')
const docId=await upload('handout','知识点配套讲义.docx',await docx.generateAsync({type:'nodebuffer'}))
const pptx=new JSZip();pptx.file('[Content_Types].xml','<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/></Types>');pptx.file('ppt/presentation.xml','<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>');pptx.file('ppt/slides/slide1.xml','<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><a:p><a:r><a:t>服务流程培训</a:t></a:r></a:p></p:sld>')
const pptId=await upload('handout','服务流程培训.pptx',await pptx.generateAsync({type:'nodebuffer'}))
const clip=join(process.env.MEDIA_DIR,'preview-fixture.mp4');execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=0x3569e8:s=160x90:d=0.6','-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart',clip]);const videoId=await upload('video','精品课视频.mp4',await readFile(clip))
const course=await current('rm-course');await call('/admin/content/rm-course',{...course,payload:{...course.payload,document:{type:'doc',content:[{type:'resource',attrs:{assetId:imageId,kind:'image',title:'流程图'}}]},handouts:[{assetId:pdfId,title:'章节精讲讲义'}]}},'PUT')
// Poster IDs inside a rich document must also count as references, including offline content.
const videoExternal=await call('/admin/media/external',{examId:exam,contentId:'rm-kp',kind:'video',filename:'外链视频',url:'https://example.com/video.mp4'},'POST')
const point=await current('rm-kp');await call('/admin/content/rm-kp',{...point,status:'offline',payload:{...point.payload,document:{type:'doc',content:[{type:'resource',attrs:{assetId:videoExternal.id,kind:'video',title:'测试视频',posterAssetId:posterId}}]}}},'PUT')
await call('/admin/exam-management/categories/rm-category',{name:'资源回归分类',sortOrder:90,enabled:true,coverUrl:''},'PUT')
const categoryFile=new FormData();categoryFile.append('file',new Blob([png]),'分类封面.png');const categoryUpload=await fetch(origin+'/api/admin/media/upload?contentId=rm-category&kind=image',{method:'POST',headers:{Authorization:'Bearer '+token},body:categoryFile});assert.equal(categoryUpload.status,200);const categoryAsset=await categoryUpload.json();await call('/admin/exam-management/categories/rm-category',{name:'资源回归分类',sortOrder:90,enabled:true,coverUrl:'/api/message-images/'+categoryAsset.id},'PUT')
const inventory=await call('/admin/resources'),imageRow=inventory.items.find(x=>x.id===imageId),posterRow=inventory.items.find(x=>x.id===posterId)
assert(imageRow.inUse);assert(posterRow.inUse);assert.equal(imageRow.references[0].status,'draft');assert.equal(posterRow.references[0].status,'offline');assert.equal(imageRow.size,png.length);assert(!JSON.stringify(inventory).includes('base64,'));assert(!JSON.stringify(inventory).includes('diskName'));assert(!inventory.items.some(x=>x.id===videoExternal.id))
await call('/admin/resources',undefined,'GET',student,403);await call('/admin/resources/'+unused,{},'DELETE',student,403)
await call('/admin/resources/'+imageId,{},'DELETE',token,409);await call('/admin/resources/'+posterId,{},'DELETE',token,409)
assert.equal((await call('/admin/resources?usage=unused')).items.some(x=>x.id===imageId),false)
assert((await call('/admin/resources?kind=audio')).items.every(x=>x.kind==='audio'))
const docPreview=await call('/admin/resources/'+docId+'/preview',{},'POST');assert.match(docPreview.text,/专业价值观与伦理原则/)
assert.match((await call('/admin/resources/'+pptId+'/preview',{},'POST')).text,/服务流程培训/)
const pdfPreview=await call('/admin/resources/'+pdfId+'/preview',{},'POST'),inline=await fetch(origin+pdfPreview.url),download=await fetch(origin+pdfPreview.downloadUrl);assert.equal(inline.status,200);assert.equal(inline.headers.get('content-disposition'),null);assert.match(download.headers.get('content-disposition'),/attachment/)
const categoryResource=inventory.items.find(x=>x.references.some(r=>r.id==='rm-category'));assert(categoryResource);assert.equal(categoryResource.storage,'file');assert.equal(categoryResource.filename,'分类封面.png');await call('/admin/resources/'+categoryResource.id,{},'DELETE',token,409)
// Re-reference after the list was read: server must reject cleanup using current data.
const owner=await current('rm-course');await call('/admin/content/rm-course',{...owner,payload:{...owner.payload,document:{type:'doc',content:[...owner.payload.document.content,{type:'resource',attrs:{assetId:unused,kind:'image',title:'重新引用'}}]}}},'PUT');await call('/admin/resources/'+unused,{},'DELETE',token,409)
const saved=await current('rm-course');await call('/admin/content/rm-course',{...saved,payload:{...saved.payload,document:owner.payload.document}},'PUT')
const file=(await db.query('SELECT * FROM media_assets WHERE id=$1',[unused])).rows[0];const oldTicket=await call('/admin/media/'+unused+'/ticket',{},'POST')
const output='.local/qa/resource-management';await mkdir(output,{recursive:true});const browser=await chromium.launch({channel:'chrome',headless:true})
try{
 const page=await browser.newPage({viewport:{width:2097,height:1272},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.route('**/api/**',async route=>{const u=new URL(route.request().url());if(!u.pathname.startsWith('/api/'))return route.continue();const response=await route.fetch({url:origin+u.pathname+u.search});await route.fulfill({response})})
 await page.addInitScript(t=>sessionStorage.setItem('sxb-admin-token',t),token);await page.goto('http://127.0.0.1:5180/#media')
 const manager=page.locator('.resource-management'),drawer=page.locator('.resource-drawer:visible')
 await expect(page.locator('.page-heading h1')).toHaveText('资源管理');await expect(manager.locator('tbody tr')).toHaveCount(inventory.items.length)
await page.getByRole('button',{name:'系统管理',exact:true}).click();await expect(page.locator('nav').getByRole('button',{name:'资源管理',exact:true})).toBeVisible();await expect(page.locator('nav').getByRole('button',{name:'媒体资源',exact:true})).toHaveCount(0)
 await page.screenshot({path:output+'/desktop.png',animations:'disabled'})
 const row=name=>manager.locator('tbody tr').filter({hasText:name})
 await expect(row('社会工作服务流程图.png').getByRole('button',{name:'清理资源'})).toBeDisabled()
 await row('社会工作服务流程图.png').getByRole('button',{name:'预览资源'}).click();await expect(drawer.locator('.resource-preview>img')).toBeVisible();await expect(drawer.locator('.resource-preview>img')).toHaveJSProperty('naturalWidth',1);await page.screenshot({path:output+'/image-preview.png',animations:'disabled'})
 await drawer.locator('.location-card').first().click();await expect(page.locator('.course-editor-drawer:visible')).toBeVisible();await expect(page.getByRole('textbox',{name:'课程标题'})).toHaveValue('社会工作价值观与伦理 · 资源测试课程');await page.locator('.course-editor-drawer:visible').getByRole('button',{name:'取消',exact:true}).click()
 await row('知识点配套讲义.docx').getByRole('button',{name:'预览资源'}).click();await expect(drawer.locator('.document-preview')).toContainText('专业价值观与伦理原则');await page.screenshot({path:output+'/document-preview.png',animations:'disabled'});await drawer.getByRole('button',{name:'关闭',exact:true}).click()
 await row('考点讲解音频.wav').getByRole('button',{name:'预览资源'}).click();await expect(drawer.locator('audio')).toBeVisible();await expect(drawer.locator('audio')).toHaveJSProperty('readyState',4);await drawer.getByRole('button',{name:'关闭',exact:true}).click()
 await row('精品课视频.mp4').getByRole('button',{name:'预览资源'}).click();await expect(drawer.locator('video')).toBeVisible();await expect(drawer.locator('video')).toHaveJSProperty('readyState',4);await drawer.locator('video').evaluate(v=>v.play());await expect.poll(()=>drawer.locator('video').evaluate(v=>v.currentTime)).toBeGreaterThan(0);await page.screenshot({path:output+'/video-preview.png',animations:'disabled'});await drawer.getByRole('button',{name:'关闭',exact:true}).click()
 await row('章节精讲讲义.pdf').getByRole('button',{name:'预览资源'}).click();await expect(drawer.locator('iframe')).toHaveAttribute('src',/preview=1/);await drawer.getByRole('button',{name:'关闭',exact:true}).click()
 await manager.getByRole('textbox',{name:'文件名称'}).fill('未使用的旧封面');await manager.getByRole('button',{name:'查询',exact:true}).click();await expect(manager.locator('tbody tr')).toHaveCount(1)
 await row('未使用的旧封面.png').getByRole('button',{name:'清理资源'}).click();await page.locator('.el-message-box').getByRole('button',{name:'取消',exact:true}).click();await expect(manager.locator('tbody tr')).toHaveCount(1)
 await row('未使用的旧封面.png').getByRole('button',{name:'清理资源'}).click();await page.locator('.el-message-box').getByRole('button',{name:'确认清理',exact:true}).click();await expect(manager.locator('tbody tr')).toHaveCount(0)
 await assert.rejects(access(join(process.env.MEDIA_DIR,file.disk_name)));assert.equal((await fetch(origin+oldTicket.url)).status,401);assert.equal((await db.query("SELECT count(*)::int n FROM audit_logs WHERE target_id=$1 AND action='resource.cleanup'",[unused])).rows[0].n,1)
 await manager.getByRole('button',{name:'重置',exact:true}).click();await expect(manager.locator('tbody tr')).toHaveCount(inventory.items.length-1)
 await manager.locator('.el-select').filter({has:page.getByRole('combobox',{name:'引用状态',exact:true})}).click();await page.getByRole('option',{name:'使用中',exact:true}).click();await expect(manager.locator('tbody .el-tag')).toHaveText(Array(inventory.summary.used).fill('使用中'))
 await manager.getByRole('button',{name:'重置',exact:true}).click();await page.setViewportSize({width:1280,height:1000});await page.screenshot({path:output+'/1280.png',animations:'disabled'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
 await row('资源回归分类').getByRole('button',{name:'预览资源'}).click();await drawer.locator('.location-card').first().click();await expect(page.locator('.page-heading h1')).toHaveText('考试分类');await expect(page.getByRole('dialog',{name:'编辑分类'})).toBeVisible()
 // Saving and cleanup may race, but cannot leave a saved reference pointing at a deleted file.
 const raceId=await upload('image','并发检查.png',png),raceOwner=await current('rm-course')
 const requests=[fetch(origin+'/api/admin/content/rm-course',{method:'PUT',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({...raceOwner,payload:{...raceOwner.payload,document:{type:'doc',content:[{type:'resource',attrs:{assetId:raceId,kind:'image',title:'并发保存'}}]}}})}),fetch(origin+'/api/admin/resources/'+raceId,{method:'DELETE',headers:{Authorization:'Bearer '+token}})]
 const results=await Promise.all(requests);assert.ok([[200,409],[400,200]].some(pair=>pair.every((s,i)=>results[i].status===s)))
 const persisted=await current('rm-course');if(JSON.stringify(persisted.payload).includes(raceId))assert.equal((await db.query('SELECT id FROM media_assets WHERE id=$1',[raceId])).rows.length,1)
 // A failed metadata transaction must restore the moved file.
 const rollbackId=await upload('image','事务回滚检查.png',png),rollbackFile=(await db.query('SELECT disk_name FROM media_assets WHERE id=$1',[rollbackId])).rows[0]
 await db.query("CREATE FUNCTION resource_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='resource.cleanup' THEN RAISE EXCEPTION 'test failure'; END IF; RETURN NEW; END $$");await db.query('CREATE TRIGGER resource_test_fail BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION resource_test_fail()')
 await call('/admin/resources/'+rollbackId,{},'DELETE',token,500);await access(join(process.env.MEDIA_DIR,rollbackFile.disk_name));assert.equal((await db.query('SELECT id FROM media_assets WHERE id=$1',[rollbackId])).rows.length,1);await db.query('DROP TRIGGER resource_test_fail ON audit_logs');await db.query('DROP FUNCTION resource_test_fail()')
 for(let n=0;n<22;n++)await upload('image','分页测试-'+n+'.png',png)
 const firstPage=await call('/admin/resources?search=分页测试'),secondPage=await call('/admin/resources?search=分页测试&page=2');assert.equal(firstPage.total,22);assert.equal(firstPage.items.length,20);assert.equal(secondPage.items.length,2)
 await page.goto('http://127.0.0.1:5180/#media');await manager.getByRole('textbox',{name:'文件名称'}).fill('分页测试');await manager.getByRole('button',{name:'查询',exact:true}).click();await expect(manager.locator('tbody tr')).toHaveCount(20);await manager.locator('.el-pagination .number').filter({hasText:/^2$/}).click();await expect(manager.locator('tbody tr')).toHaveCount(2)
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:output+'/390.png',animations:'disabled'})
 assert.deepEqual(errors,[]);console.log(JSON.stringify({status:'PASS',inventory:true,embeddedCovers:true,previews:['image','video','audio','pdf','docx','pptx'],referenceJump:true,draftProtection:true,offlineProtection:true,staleCleanupRejected:true,concurrency:true,rollback:true,pagination:true,cleanup:true,audit:true,contentWritesToLive:0}))
}finally{await browser.close();await new Promise(r=>server.close(r));await closeDatabase()}
