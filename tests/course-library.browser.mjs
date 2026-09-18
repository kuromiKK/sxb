import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium, expect } from '@playwright/test'
import { profileFixture } from './helpers/user-profile-fixture.ts'
const f=await profileFixture()
const browser=await chromium.launch({channel:'chrome',headless:true})
const output='.local/qa/course-library'
await mkdir(output,{recursive:true})
try{
 const {db,exam,uid,student}=f
 // A populated chapter, several horizontally scrolling chapters and another subject.
 await db.query("UPDATE content SET title='社会工作综合能力',payload=payload||'{\"shortTitle\":\"初级综合\"}'::jsonb WHERE id='a-s'")
 await db.query("UPDATE content SET title='社会工作服务的内涵',payload=payload||'{\"no\":1}'::jsonb WHERE id='a-c'")
 for(let n=2;n<=9;n++)await db.query("INSERT INTO content(id,exam_id,kind,parent_id,title,status,payload) VALUES($1,$2,'chapter','a-s',$3,'published',$4)",['a-c'+n,exam,'课程章节'+n,JSON.stringify({no:n})])
 const titles=['社会工作服务的目标与功能','社会工作价值观与专业伦理','社会工作者的角色与使命','社会工作服务的实践方法','读懂社会工作服务的基本原则','专业关系：从理解走向行动']
 for(let n=0;n<6;n++)await db.query("INSERT INTO content(id,exam_id,kind,parent_id,title,status,payload) VALUES($1,$2,'course','a-t',$3,'published',$4)",['grid-'+n,exam,titles[n],JSON.stringify({type:['video','audio','article'][n%3],totalMinutes:n%3===2?0:25+n,content:'课程正文',hasHandout:false})])
 await db.query("INSERT INTO learning_visits(id,user_id,exam_id,session_id,content_id,title,kind,media_type,path) VALUES('grid-visit',$1,$2,'grid-visit','grid-1','音频课','course','audio','[]')",[uid,exam])
 await db.query("INSERT INTO user_records(id,user_id,exam_id,kind,source_id,payload) VALUES('grid-progress',$1,$2,'courseProgress','grid-1','{\"progress\":36,\"currentMinute\":9}')",[uid,exam])
 const recent=await f.call('/learning-visits/recent-course?examId='+exam,200,student)
 assert.equal(recent.courseId,'grid-1')
 assert.equal(await f.call('/learning-visits/recent-course?examId='+f.second,200,student),null)
 const {session}=await import('../apps/api/src/security.ts')
 const other=await session(f.other)
 assert.equal(await f.call('/learning-visits/recent-course?examId='+exam,200,other),null)
 const {resourceInventory}=await import('../apps/api/src/resource-index.ts')
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=','base64')
 const form=new FormData();form.append('file',new Blob([png],{type:'image/png'}),'course-cover.png')
 const upload=await fetch(f.origin+'/api/admin/media/upload?kind=image&contentId=grid-0&examId='+exam,{method:'POST',headers:{Authorization:'Bearer '+f.token},body:form})
 assert.equal(upload.status,200);const asset=await upload.json()
 const row=(await db.query("SELECT * FROM content WHERE id='grid-0'")).rows[0]
 const saved=await fetch(f.origin+'/api/admin/content/grid-0',{method:'PUT',headers:{Authorization:'Bearer '+f.token,'Content-Type':'application/json'},body:JSON.stringify({...row,payload:{...row.payload,posterAssetId:asset.id},source:'manual',is_test_data:true})})
 assert.equal(saved.status,200,await saved.text())
 // All media types keep their registered cover when saved through the real admin endpoint.
 for(const type of ['audio','article','video']){
  const current=(await db.query("SELECT * FROM content WHERE id='grid-0'")).rows[0]
  const response=await fetch(f.origin+'/api/admin/content/grid-0',{method:'PUT',headers:{Authorization:'Bearer '+f.token,'Content-Type':'application/json'},body:JSON.stringify({...current,payload:{...current.payload,type},source:'manual',is_test_data:true})})
  assert.equal(response.status,200,await response.text())
  assert.equal((await db.query("SELECT payload FROM content WHERE id='grid-0'")).rows[0].payload.posterAssetId,asset.id)
 }
 const cover=await fetch(f.origin+'/api/course-covers/grid-0');assert.equal(cover.status,200);assert.match(cover.headers.get('content-type'),/image\/png/)
 assert.equal((await fetch(f.origin+'/api/course-covers/'+asset.id)).status,404)
 assert.equal((await fetch(f.origin+'/api/media/image/'+asset.id)).status,403)
 const inventory=await resourceInventory(),resource=inventory.find(x=>x.id===asset.id)
 assert.equal(resource.filename,'course-cover.png');assert.equal(resource.size,png.length);assert.ok(resource.createdAt)
 assert.ok(resource.references.some(r=>r.id==='grid-0'&&r.location==='课程封面'))
 assert.equal((await fetch(f.origin+'/api/admin/resources/'+asset.id,{method:'DELETE',headers:{Authorization:'Bearer '+f.token}})).status,409)
 await db.query("UPDATE content SET status='offline' WHERE id='a-c'")
 assert.equal((await fetch(f.origin+'/api/course-covers/grid-0')).status,404)
 assert.equal(await f.call('/learning-visits/recent-course?examId='+exam,200,student),null)
 await db.query("UPDATE content SET status='published' WHERE id='a-c'")
 // Use designed fallback for the 1px test cover in screenshots, not a fictitious production image.
 await db.query("UPDATE content SET payload=payload-'posterAssetId' WHERE id='grid-0'")
 const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'})
 await context.addInitScript(({token,exam})=>{
  if(localStorage.getItem('course-fixture-initialized'))return
  localStorage.setItem('course-fixture-initialized','true')
  localStorage.setItem('sxb-api-token',token)
  localStorage.setItem('sxb-current-exam',JSON.stringify({type:'object',data:{id:exam,name:'初级社会工作师'}}))
  localStorage.setItem('sxb-course-directory-'+exam,JSON.stringify({type:'object',data:{subjectId:'a-s',chapters:{'a-s':'a-c'}}}))
 },{token:student,exam})
 await context.route('**/api/**',async route=>{const u=new URL(route.request().url());if(!u.pathname.startsWith('/api/'))return route.continue();await route.fulfill({response:await route.fetch({url:f.origin+u.pathname+u.search})})})
 const page=await context.newPage(),errors=[]
 page.on('pageerror',e=>errors.push(e.message))
 await page.goto('http://127.0.0.1:5174/#/pages/courses/index')
 await expect(page.locator('.course-card')).toHaveCount(6,{timeout:30000})
 await expect(page.locator('.resume-dock')).toContainText('继续收听')
 await expect(page.locator('.resume-dock')).toContainText('36%')
 for(const [width,height] of [[320,740],[375,812],[390,844],[430,932],[844,390]]){
  await page.setViewportSize({width,height})
  await expect(page.locator('.course-card')).toHaveCount(6)
  const covers=await page.locator('.course-grid .course-cover').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}}))
  assert.equal(covers[0].y,covers[1].y);assert.ok(covers[2].y>covers[0].y)
  assert.ok(Math.abs(covers[0].width/covers[0].height-16/9)<.02)
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
  const dock=await page.locator('.resume-dock').boundingBox(),nav=await page.locator('.app-tabbar').boundingBox()
  assert.ok(dock.y+dock.height<=nav.y-8)
  await page.screenshot({path:output+'/'+width+'.png',fullPage:true})
  await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight))
  const last=await page.locator('.course-card').last().boundingBox(),fixed=await page.locator('.resume-dock').boundingBox()
  assert.ok(last.y+last.height<=fixed.y,'Last course can scroll fully clear of the floating controls')
  await page.evaluate(()=>window.scrollTo(0,0))
 }
 await page.setViewportSize({width:390,height:844})
 const rail=page.locator('.chapter-navigation .scroll-tabs')
 await rail.evaluate(e=>e.scrollLeft=0)
 await page.getByRole('button',{name:'第3章',exact:true}).click()
 await expect(page.locator('.empty')).toBeVisible()
 assert.ok(await rail.evaluate(e=>e.scrollLeft)<2,'Visible chapter must not jump to left')
 await page.getByRole('button',{name:'第1章',exact:true}).click()
 await expect(page.locator('.course-card')).toHaveCount(6)
 const alternative=page.locator('.course-subject').filter({hasNotText:'初级综合'}).first()
 await alternative.click();await expect(alternative).toHaveAttribute('aria-pressed','true')
 await expect(page.getByRole('button',{name:'初级综合',exact:true})).toHaveAttribute('aria-pressed','false')
 await page.getByRole('button',{name:'初级综合',exact:true}).click();await expect(page.locator('.course-card')).toHaveCount(6)
 await rail.hover();await page.mouse.wheel(400,0)
 await expect.poll(()=>rail.evaluate(e=>e.scrollLeft)).toBeGreaterThan(20)
 await page.reload()
 await expect(page.locator('.course-card')).toHaveCount(6)
 await page.locator('.resume-dock').click()
 await expect(page).toHaveURL(/course-detail.*grid-1/)
 assert.deepEqual(errors,[])
 // No fabricated continue entry for accounts without learning records.
 await page.evaluate(t=>localStorage.setItem('sxb-api-token',t),other)
 await page.goto('http://127.0.0.1:5174/#/pages/courses/index')
 await expect(page.locator('.course-card')).toHaveCount(6)
 await expect(page.locator('.resume-dock')).toHaveCount(0)
 await page.evaluate(()=>localStorage.removeItem('sxb-api-token'))
 await page.reload();await expect(page.locator('.course-card')).toHaveCount(6)
 await page.locator('.course-card').first().click();await expect(page).toHaveURL(/pages\/login\/index/)
 console.log('PASS: two-column responsive layout, navigation, scoped recent learning, covers and resource protection')
}finally{await browser.close();await f.close()}
