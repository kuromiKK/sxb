import 'dotenv/config'
import assert from 'node:assert/strict'
import {mkdtemp,mkdir} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {chromium,expect} from '@playwright/test'
import express from 'express'
import {ZodError} from 'zod'
process.env.APP_MODE='test';process.env.DATABASE_URL='';process.env.LOCAL_DATABASE_DIR=await mkdtemp(join(tmpdir(),'sxb-learning-'));process.env.MEDIA_DIR=await mkdtemp(join(tmpdir(),'sxb-learning-media-'));process.env.SECRET_KEY='e'.repeat(64);process.env.ADMIN_PHONE='18600000000';process.env.ADMIN_PASSWORD='Learning-Tests-42!'
const {db,closeDatabase}=await import('../apps/api/src/db.ts'),{seed}=await import('../apps/api/src/seed.ts'),{initSecrets,session}=await import('../apps/api/src/security.ts'),{api}=await import('../apps/api/src/routes.ts')
await initSecrets();await seed()
const admin=(await db.query("SELECT id FROM users WHERE account_kind='admin' LIMIT 1")).rows[0],adminToken=await session(admin.id,'admin'),uid='test-student-001',student=await session(uid),other=(await db.query("SELECT id FROM users WHERE account_kind='student' AND id<>$1 LIMIT 1",[uid])).rows[0],otherToken=await session(other.id)
const app=express();app.use(express.json({limit:'40mb'}));app.use('/api',api);app.use((e,_q,r,_n)=>{if(!(e instanceof ZodError)&&!e.status)console.error(e);r.status(e instanceof ZodError?400:e.status||500).json({message:e.message})})
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const origin='http://127.0.0.1:'+server.address().port
async function call(path,body,method='GET',auth=adminToken,status=200){const r=await fetch(origin+'/api'+path,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+auth},body:body===undefined?undefined:JSON.stringify(body)});const d=await r.json();assert.equal(r.status,status,JSON.stringify(d));return d}
const exam='junior-social-worker',kp=(await db.query("SELECT * FROM content WHERE kind='knowledge' AND exam_id=$1 AND status='published' LIMIT 1",[exam])).rows[0],course=(await db.query("SELECT * FROM content WHERE kind='course' AND exam_id=$1 AND status='published' LIMIT 1",[exam])).rows[0],question=(await db.query("SELECT * FROM questions WHERE exam_id=$1 AND status='published' LIMIT 1",[exam])).rows[0]
const day=new Date(Date.now()+8*3600000).toISOString().slice(0,10),query='from='+day+'&to='+day+'&examId='+exam
const begin=(sessionId,contentId=kp.id,auth=student)=>call('/learning-visits',{examId:exam,contentId,sessionId},'POST',auth)
let browser
try{
 await call('/admin/learning-data/overview?'+query,undefined,'GET',student,403)
 await call('/admin/learning-data/overview?from=2026-02-30&to=2026-03-01',undefined,'GET',adminToken,400)
 await call('/admin/learning-data/visits?from=2020-01-01&to=2026-01-01',undefined,'GET',adminToken,400)
 const baseline=await call('/admin/learning-data/overview?'+query)
 const body={examId:exam,contentId:kp.id,sessionId:'same-session-001'}
 const duplicates=await Promise.all(Array.from({length:4},()=>call('/learning-visits',body,'POST',student)))
 assert(duplicates.every(x=>x.id===duplicates[0].id))
 assert.equal((await call('/admin/learning-data/overview?'+query)).total.visits,baseline.total.visits+1)
 await call('/learning-visits',{...body,contentId:question.id},'POST',student,404)
 await call('/learning-visits',{...body,examId:'mid-social-worker'},'POST',student,404)
 await call('/learning-visits/'+duplicates[0].id+'/progress',{positionSeconds:5,durationSeconds:60,sequence:1},'PUT',otherToken,404)
 await call('/learning-visits/'+duplicates[0].id+'/progress',{positionSeconds:5,durationSeconds:60,sequence:1},'PUT',student,400)
 // Exercise actual course entitlement checks, then grant access only inside the test DB.
 await db.query('DELETE FROM memberships WHERE user_id=$1',[uid]);await db.query('DELETE FROM manual_entitlements WHERE user_id=$1',[uid])
 await call('/learning-visits',{...body,contentId:course.id,sessionId:'locked-course-001'},'POST',student,403)
 const cycle=(await db.query('SELECT id FROM exam_cycles WHERE exam_id=$1 AND starts_at<=now() AND ends_at>now() ORDER BY ends_at LIMIT 1',[exam])).rows[0]
 await db.query("INSERT INTO manual_entitlements(user_id,exam_id,cycle_id,level,actor_id,reason) VALUES($1,$2,$3,'svip',$4,'isolated test')",[uid,exam,cycle.id,admin.id])
 await db.query("UPDATE content SET payload=payload||'{\"type\":\"video\",\"requiredLevel\":\"vip\"}'::jsonb WHERE id=$1",[course.id])
 const video=await begin('video-session-001',course.id)
 await call('/learning-visits/'+video.id+'/progress',{positionSeconds:30,durationSeconds:600,sequence:1},'PUT',student)
 await call('/learning-visits/'+video.id+'/progress',{positionSeconds:100,durationSeconds:600,sequence:2},'PUT',student)
 assert.equal((await call('/admin/learning-data/visits/'+video.id)).position_seconds,30,'server limits rapid updates')
 await db.query("UPDATE learning_visits SET last_activity_at=now()-interval '11 seconds' WHERE id=$1",[video.id])
 await call('/learning-visits/'+video.id+'/progress',{positionSeconds:15,durationSeconds:600,sequence:3},'PUT',student)
 await call('/learning-visits/'+video.id+'/progress',{positionSeconds:120,durationSeconds:600,sequence:2},'PUT',student)
 assert.equal((await call('/admin/learning-data/visits/'+video.id)).position_seconds,15,'out of order updates do not overwrite newer position')
 assert.equal((await db.query("SELECT payload FROM user_records WHERE user_id=$1 AND source_id=$2 AND kind='courseProgress'",[uid,course.id])).rows[0].payload.positionSeconds,15)
 // Configured answers count once, including waiting subjective work; later grading adds nothing.
 const answersBefore=(await call('/admin/learning-data/overview?'+query)).total.answers
 await db.query("INSERT INTO question_submissions(id,user_id,exam_id,question_id,request_id,answers,result) VALUES('learning-sub',$1,$2,$3,'learning-configured','{}','{\"status\":\"self_review\"}')",[uid,exam,question.id])
 await db.query("INSERT INTO answers(id,user_id,exam_id,question_id,selection,correct,request_id) VALUES('learning-answer',$1,$2,$3,'[]',true,'learning-configured')",[uid,exam,question.id])
 await db.query("UPDATE question_submissions SET result='{\"status\":\"graded\"}' WHERE id='learning-sub'")
 assert.equal((await call('/admin/learning-data/overview?'+query)).total.answers,answersBefore+1)
 // Shanghai midnight boundaries and cross-day unique users.
 for(const [n,time] of [[1,'2026-08-31T15:59:59Z'],[2,'2026-08-31T16:00:00Z'],[3,'2026-09-01T16:00:00Z']])await db.query("INSERT INTO learning_visits(id,user_id,exam_id,session_id,content_id,title,kind,media_type,path,started_at,last_activity_at) VALUES($1,$2,$3,$1,$4,'边界测试','knowledge','article','[]',$5,$5)",['boundary-'+n,uid,exam,kp.id,time])
 const boundary=await call('/admin/learning-data/overview?from=2026-09-01&to=2026-09-02&examId='+exam)
 assert.equal(boundary.total.visits,2);assert.equal(boundary.total.visitors,1);assert.equal(boundary.series.reduce((n,r)=>n+r.visitors,0),2)
 for(let n=0;n<23;n++)await begin('pagination-session-'+n)
 const list=await call('/admin/learning-data/visits?'+query);assert.equal(list.items.length,20)
 assert((await call('/admin/learning-data/visits?'+query+'&page=2')).items.length>0)
 assert((await call('/admin/learning-data/visits?'+query+'&kind=course')).items.every(x=>x.kind==='course'))
 assert.equal((await call('/admin/learning-data/visits?'+query+'&title=unmatched')).total,0)
 assert(list.items.every(x=>/^\d{3}\*{4}\d{4}$/.test(x.phone)))
 browser=await chromium.launch({channel:'chrome',headless:true})
 const page=await browser.newPage({viewport:{width:1733,height:1100},reducedMotion:'reduce'}),errors=[]
 page.on('pageerror',e=>errors.push(e.message))
 const proxy=async route=>{const u=new URL(route.request().url());if(!u.pathname.startsWith('/api/'))return route.continue();const r=await route.fetch({url:origin+u.pathname+u.search});await route.fulfill({response:r})}
 await page.route('**/api/**',proxy);await page.addInitScript(t=>sessionStorage.setItem('sxb-admin-token',t),adminToken)
 await page.goto('http://127.0.0.1:5180/#records')
 await expect(page.locator('.learning-metrics article')).toHaveCount(4)
 await expect(page.locator('.learning-trend')).toHaveCount(2)
 await page.locator('.learning-trend').first().getByText('人数',{exact:true}).click()
 await page.getByRole('button',{name:'查看每日数据',exact:true}).first().click()
 await expect(page.locator('.learning-trend .el-table')).toBeVisible()
 await mkdir('.local/qa/learning-data',{recursive:true});await page.screenshot({path:'.local/qa/learning-data/overview.png',fullPage:true})
 await page.getByRole('tab',{name:'学习记录',exact:true}).click()
 await expect(page.locator('.learning-data tbody tr')).toHaveCount(20)
 await page.getByRole('button',{name:'查看学习记录详情',exact:true}).first().click()
 await expect(page.locator('.learning-detail')).toContainText('唯一标识(ID)')
 await page.screenshot({path:'.local/qa/learning-data/detail.png',fullPage:true})
 await page.locator('.el-drawer:visible').getByRole('button',{name:'关闭',exact:true}).click()
 await page.getByRole('textbox',{name:'内容标题',exact:true}).fill('unmatched')
 await page.getByRole('button',{name:'查询',exact:true}).click();await expect(page.getByText('当前条件下暂无学习记录',{exact:true})).toBeVisible()
 await page.getByRole('button',{name:'重置',exact:true}).click();await expect(page.locator('.learning-data tbody tr')).toHaveCount(20)
 await page.screenshot({path:'.local/qa/learning-data/records.png',fullPage:true})
 await page.getByRole('tab',{name:'学习概览',exact:true}).click();await page.setViewportSize({width:390,height:844})
 await expect(page.locator('.learning-metrics article')).toHaveCount(4)
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
 await page.screenshot({path:'.local/qa/learning-data/mobile.png',fullPage:true})
 // Real user page: successful content load creates one visit, reload reuses it.
 const mobile=await browser.newPage({viewport:{width:390,height:844}});mobile.on('pageerror',e=>errors.push(e.message));await mobile.route('**/api/**',proxy)
 await mobile.addInitScript(({token,exam})=>{localStorage.setItem('sxb-api-token',JSON.stringify({type:'string',data:token}));localStorage.setItem('sxb-current-exam',JSON.stringify({type:'object',data:{id:exam,name:'初级社会工作师'}}))},{token:student,exam})
 let captured=0;mobile.on('response',r=>{if(r.url().endsWith('/api/learning-visits')&&r.status()===200)captured++})
 const before=(await db.query('SELECT count(*)::int AS n FROM learning_visits')).rows[0].n
 await mobile.goto('http://127.0.0.1:5174/#/pages/knowledge-detail/index?id='+kp.id)
 await expect.poll(()=>captured,{timeout:20000}).toBeGreaterThan(0)
 await expect(mobile.getByText('加载中',{exact:true})).toBeHidden({timeout:20000})
 const count=(await db.query('SELECT count(*)::int AS n FROM learning_visits')).rows[0].n;assert.equal(count,before+1)
 const previous=captured;await mobile.reload();await expect.poll(()=>captured,{timeout:20000}).toBeGreaterThan(previous)
 assert.equal((await db.query('SELECT count(*)::int AS n FROM learning_visits')).rows[0].n,count)
 await expect(mobile.getByText('加载中',{exact:true})).toBeHidden({timeout:20000})
 const nextVisit=captured;await mobile.locator('.next-button').click();await expect.poll(()=>captured).toBeGreaterThan(nextVisit)
 const returnVisit=captured;await mobile.locator('.previous-button').click();await expect.poll(()=>captured).toBeGreaterThan(returnVisit)
 assert.equal((await db.query('SELECT count(*)::int AS n FROM learning_visits')).rows[0].n,count+2,'leaving a content item and returning creates a new visit')
 assert.deepEqual(errors,[])
 console.log(JSON.stringify({status:'PASS',deduplication:true,authorization:true,progressThrottle:true,answerCounts:true,shanghaiBoundaries:true,pagination:true,adminOverview:true,recordDetails:true,mobileCapture:true,reloadDedup:true,liveWrites:0}))
}finally{await browser?.close();await new Promise(r=>server.close(r));await closeDatabase()}
