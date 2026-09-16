import 'dotenv/config'
import assert from 'node:assert/strict'
import {mkdtemp,mkdir} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {chromium,expect} from '@playwright/test'
import express from 'express'
import {ZodError} from 'zod'
process.env.APP_MODE='test';process.env.DATABASE_URL='';process.env.LOCAL_DATABASE_DIR=await mkdtemp(join(tmpdir(),'sxb-collections-'));process.env.MEDIA_DIR=await mkdtemp(join(tmpdir(),'sxb-collections-media-'));process.env.SECRET_KEY='e'.repeat(64);process.env.ADMIN_PHONE='18600000000';process.env.ADMIN_PASSWORD='Collections-Tests-42!'
const {db,closeDatabase}=await import('../apps/api/src/db.ts'),{seed}=await import('../apps/api/src/seed.ts'),{initSecrets,session}=await import('../apps/api/src/security.ts'),{api}=await import('../apps/api/src/routes.ts'),{newField}=await import('../apps/shared/question-types.ts')
await initSecrets();await seed()
await db.query('DELETE FROM question_submissions');await db.query('DELETE FROM answers');await db.query("DELETE FROM user_records WHERE kind IN ('note','favorite','wrongDismissal')")
const admin=(await db.query("SELECT id FROM users WHERE account_kind='admin' LIMIT 1")).rows[0],adminToken=await session(admin.id,'admin'),uid='test-student-001',student=await session(uid),other=(await db.query("SELECT id FROM users WHERE account_kind='student' AND id<>$1 LIMIT 1",[uid])).rows[0],otherToken=await session(other.id)
const app=express();app.use(express.json({limit:'40mb'}));app.use('/api',api);app.use((e,_q,r,_n)=>{if(!(e instanceof ZodError)&&!e.status)console.error(e);r.status(e instanceof ZodError?400:e.status||500).json({message:e.message})})
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const origin='http://127.0.0.1:'+server.address().port
async function call(path,body,method='GET',auth=adminToken,status=200){const r=await fetch(origin+'/api'+path,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+auth},body:body===undefined?undefined:JSON.stringify(body)});const d=await r.json();assert.equal(r.status,status,JSON.stringify(d));return d}
const exam='junior-social-worker',kp=(await db.query("SELECT * FROM content WHERE kind='knowledge' AND exam_id=$1 AND status='published' LIMIT 1",[exam])).rows[0],course=(await db.query("SELECT * FROM content WHERE kind='course' AND exam_id=$1 AND status='published' LIMIT 1",[exam])).rows[0],q=(await db.query("SELECT * FROM questions WHERE exam_id=$1 AND status='published' AND payload->>'type'='single' LIMIT 1",[exam])).rows[0]
const root='/admin/learning-data/collections/',list=(kind,query='')=>call(root+kind+'?examId='+exam+query)
let browser
try{
 for(const kind of ['answers','wrong','favorites','notes'])await call(root+kind,undefined,'GET',student,403)
 await call(root+'answers?from=2026-02-30&to=2026-03-01',undefined,'GET',adminToken,400)
 const wrong=q.payload.options.findIndex((_,i)=>!q.payload.answer.includes(i))
 const answer=(selection,requestId,auth=student)=>call('/answers',{examId:exam,questionId:q.id,selection,requestId},'POST',auth)
 await answer([wrong],'collection-wrong-001');await answer([wrong],'collection-wrong-001')
 assert.equal((await list('answers')).total,1)
 const first=(await list('answers')).items[0]
 await answer(q.payload.answer,'collection-correct-001')
 let book=await list('wrong');assert.equal(book.total,1);assert.equal(book.items[0].correct,true);assert.equal(book.items[0].wrong_count,1)
 assert.equal((await call('/stats/'+exam,undefined,'GET',student)).latest.find(r=>r.question_id===q.id).in_wrong_book,true)
 await call('/wrong/'+exam,undefined,'DELETE',student);assert.equal((await list('wrong')).total,0)
 await answer([wrong],'collection-wrong-002');assert.equal((await list('wrong')).total,1)
 await answer(q.payload.answer,'collection-other-user',otherToken)
 assert.equal((await list('wrong')).total,1,'other user correct attempts do not alter notebook')
 assert.equal((await call(root+'answers?examId=mid-social-worker')).total,0)
 await db.query("UPDATE questions SET title='修改后的题干',payload=jsonb_set(payload,'{stem}','\"修改后的题干\"'::jsonb) WHERE id=$1",[q.id])
 const snapshot=await call(root+'answers/'+encodeURIComponent(first.id));assert.equal(snapshot.question_snapshot.title,q.title);assert.equal(snapshot.current_payload.stem,'修改后的题干')
 assert.equal((await list('answers','&title='+encodeURIComponent(q.title))).total,4)
 await db.query('UPDATE answers SET question_snapshot=NULL WHERE id=$1',[first.record_id]);assert.equal((await call(root+'answers/'+encodeURIComponent(first.id))).question_snapshot,null)
 const field=newField('single','answer'),definition={fields:[field],examRules:{}},payload={type:'configured',stem:'配置题型测试',title:'配置题型测试',templateId:'single',typeName:'单选题',templateVersion:1,definition,values:{answer:{prompt:'选 A',options:['A选项','B选项'],answer:[0],explanation:'解析内容'}}}
 await db.query('UPDATE questions SET payload=$2,title=$3 WHERE id=$1',[q.id,JSON.stringify(payload),'配置题型测试'])
 const submitted=await call('/answers/configured',{examId:exam,questionId:q.id,answers:{answer:[0]},requestId:'collection-configured-001'},'POST',student)
 assert.equal((await list('answers')).total,5,'configured objective mirror is deduplicated')
 assert.equal((await call(root+'answers/configured:'+submitted.submissionId)).selection.answer[0],0)
 const text=newField('text','essay'),essay={...payload,stem:'主观题自评',templateId:'subjective',typeName:'主观题',definition:{fields:[text],examRules:{}},values:{essay:{prompt:'说明服务目标',reference:'促进社会发展',rubric:'符合要点',explanation:'参考解析'}}}
 await db.query('UPDATE questions SET payload=$2,title=$3 WHERE id=$1',[q.id,JSON.stringify(essay),'主观题自评'])
 const self=await call('/answers/configured',{examId:exam,questionId:q.id,answers:{essay:'用户主观答案'},requestId:'collection-self-001'},'POST',student)
 assert.equal((await list('answers','&result=self_review')).total,1);assert.equal((await list('answers','&result=wrong')).total,2)
 await call('/answers/submissions/'+self.submissionId+'/self-score',{fieldId:'essay',score:7},'POST',student)
 assert.equal((await list('answers','&result=self_graded')).items[0].score,7)
 assert.equal((await list('wrong')).items[0].wrong_count,2,'subjective score does not become a wrong attempt')
 const note=await call('/records/'+exam,{kind:'note',sourceId:'knowledge:'+kp.id,payload:{sourceId:kp.id,sourceType:'knowledge',content:'记住服务的目标\n重点复习第二段'}},'PUT',student)
 for(const source of [q,kp,course])await call('/records/'+exam,{kind:'favorite',sourceId:source.id,payload:{type:source.kind}},'PUT',student)
 assert.equal((await list('favorites')).total,3);assert.equal((await list('favorites','&kind=knowledge')).total,1)
 await call('/records/'+exam,{kind:'note',sourceId:'course:'+course.id,payload:{sourceId:course.id,content:'课程笔记'}},'PUT',student)
 await call('/records/'+exam,{kind:'note',sourceId:'question:'+q.id,payload:{sourceId:q.id,content:'题目笔记'}},'PUT',student)
 await call('/records/'+exam,{kind:'note',sourceId:'knowledge:'+kp.id,payload:{sourceId:kp.id,content:'更新后的笔记\n保留换行'}},'PUT',student)
 const notes=await list('notes','&text='+encodeURIComponent('更新后的'));assert.equal(notes.total,1);assert.equal((await call(root+'notes/'+note.id)).note,'更新后的笔记\n保留换行')
 await call('/records/'+exam+'/favorite/'+kp.id,undefined,'DELETE',student);assert.equal((await list('favorites')).total,2)
 const nickname=(await db.query('SELECT nickname FROM users WHERE id=$1',[uid])).rows[0].nickname
 assert((await list('answers','&user='+encodeURIComponent(nickname))).items.every(r=>r.user_id===uid))
 // Preserve a registered image referenced only by a submission snapshot.
 await db.query("INSERT INTO media_assets(id,exam_id,content_id,owner_id,kind,source,filename,mime,size_bytes,disk_name) VALUES('snapshot-image',NULL,$1,$2,'image','upload','image.png','image/png',10,'00000000-0000-0000-0000-000000000001')",[q.id,admin.id])
 await db.query("UPDATE question_submissions SET question_snapshot=question_snapshot||$2::jsonb WHERE id=$1",[submitted.submissionId,JSON.stringify({illustration:'/api/message-images/snapshot-image'})])
 const resource=await call('/admin/resources/snapshot-image');assert(resource.inUse);assert(resource.references.some(r=>r.kind==='learning-answer'))
 await call('/admin/resources/snapshot-image',{},'DELETE',adminToken,409)
 // Many attempts for pagination, without adding to the live database.
 for(let i=0;i<21;i++)await db.query("INSERT INTO answers(id,user_id,exam_id,question_id,selection,correct,request_id,response,question_snapshot) VALUES($1,$2,$3,$4,'[0]',true,$1,'{\"correct\":true}', $5)",[ 'collection-page-'+i,uid,exam,q.id,JSON.stringify({...q.payload,title:q.title})])
 assert.equal((await list('answers')).items.length,20);assert.equal((await list('answers','&page=2')).items.length,7)
 browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1550,height:1050}}),errors=[]
 page.on('pageerror',e=>errors.push(e.message))
 await page.route('**/api/**',async route=>{const u=new URL(route.request().url());if(!u.pathname.startsWith('/api/'))return route.continue();await route.fulfill({response:await route.fetch({url:origin+u.pathname+u.search})})})
 await page.addInitScript(token=>sessionStorage.setItem('sxb-admin-token',token),adminToken)
 await mkdir('.local/qa/learning-collections',{recursive:true})
 await page.goto('http://127.0.0.1:5180/#records');await expect(page.getByRole('tab',{name:'答题记录',exact:true})).toBeVisible()
 for(const [kind,name]of [['answers','答题记录'],['wrong','错题本'],['favorites','收藏'],['notes','笔记']]){
  await page.getByRole('tab',{name,exact:true}).click();await expect(page.locator('.learning-collections tbody tr').first()).toBeVisible()
  await page.getByRole('button',{name:'查看'+name+'详情',exact:true}).first().click();const drawer=page.locator('.el-drawer:visible');await expect(drawer).toContainText('唯一标识(ID)')
  await page.mouse.click(30,400);await expect(drawer).toBeVisible()
  await page.screenshot({path:'.local/qa/learning-collections/'+kind+'-detail.png',fullPage:true,animations:'disabled'})
  await drawer.getByRole('button',{name:'关闭',exact:true}).click();await expect(drawer).toBeHidden()
  await page.screenshot({path:'.local/qa/learning-collections/'+kind+'.png',fullPage:true,animations:'disabled'})
 }
 await page.getByRole('tab',{name:'答题记录',exact:true}).click()
 await page.locator('.el-select').filter({has:page.getByRole('combobox',{name:'作答结果',exact:true})}).click();await page.getByRole('option',{name:'已自评',exact:true}).click();await page.getByRole('button',{name:'查询',exact:true}).click()
 await expect(page.locator('.learning-collections tbody tr')).toHaveCount(1)
 await page.getByRole('button',{name:'查看答题记录详情',exact:true}).click()
 await expect(page.locator('.el-drawer:visible')).toContainText('用户主观答案');await expect(page.locator('.el-drawer:visible')).toContainText('用户自评：7 / 10分')
 await page.screenshot({path:'.local/qa/learning-collections/self-scoring.png',fullPage:true,animations:'disabled'})
 await page.locator('.el-drawer:visible').getByRole('button',{name:'关闭',exact:true}).click()
 await page.getByRole('tab',{name:'笔记',exact:true}).click()
 await page.getByRole('textbox',{name:'笔记内容',exact:true}).fill('不存在的笔记');await page.getByRole('button',{name:'查询',exact:true}).click();await expect(page.getByText('当前条件下暂无笔记',{exact:true})).toBeVisible()
 await page.getByRole('button',{name:'重置',exact:true}).click();await expect(page.locator('.learning-collections tbody tr')).toHaveCount(3)
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
 await page.screenshot({path:'.local/qa/learning-collections/mobile.png',fullPage:true,animations:'disabled'})
 // Real H5 retry: the correct answer must preserve the notebook in local storage and after refresh.
 await db.query('UPDATE questions SET payload=$2,title=$3 WHERE id=$1',[q.id,JSON.stringify(q.payload),q.title])
 const mobile=await browser.newPage({viewport:{width:390,height:844}});mobile.on('pageerror',e=>errors.push(e.message))
 await mobile.route('**/api/**',async route=>{const u=new URL(route.request().url());if(!u.pathname.startsWith('/api/'))return route.continue();await route.fulfill({response:await route.fetch({url:origin+u.pathname+u.search})})})
 await mobile.addInitScript(({token,exam})=>{localStorage.setItem('sxb-api-token',JSON.stringify({type:'string',data:token}));localStorage.setItem('sxb-current-exam',JSON.stringify({type:'object',data:{id:exam,name:'初级社会工作师'}}))},{token:student,exam})
 await mobile.goto('http://127.0.0.1:5174/#/pages/practice-session/index?mode=wrong&questionId='+q.id)
 await expect(mobile.locator('.question-stem')).toHaveText(q.payload.stem,{timeout:20000})
 await mobile.locator('.options .option').nth(q.payload.answer[0]).click();await expect(mobile.getByText('回答正确',{exact:true})).toBeVisible()
 const retained=()=>mobile.evaluate(id=>{const value=JSON.parse(localStorage.getItem('sxb-wrong-questions')||'null');return (value?.data||[]).includes(id)},q.id)
 await expect.poll(retained).toBe(true);await mobile.reload();await expect.poll(retained).toBe(true)
 assert.deepEqual(errors,[])
 console.log(JSON.stringify({status:'PASS',readonlyAuthorization:true,wrongRetainedAfterCorrect:true,explicitDismissAndReadd:true,snapshot:true,configuredDedup:true,selfScoring:true,notesAndFavorites:true,resourceProtection:true,pagination:true,browserTabs:4,backdropProtection:true,mobile:true,liveWrites:0}))
}finally{await browser?.close();await new Promise(r=>server.close(r));await closeDatabase()}
