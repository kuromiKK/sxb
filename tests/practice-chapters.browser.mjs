import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {chromium,expect} from '@playwright/test'
import {profileFixture} from './helpers/user-profile-fixture.ts'
const f=await profileFixture(),origin='http://127.0.0.1:5174'
let browser
try{
 await f.db.query("UPDATE content SET title=CASE id WHEN 'a-s' THEN '社会工作综合能力' WHEN 'a-c' THEN '社会工作服务的内涵' ELSE title END WHERE id IN ('a-s','a-c')")
 for(const [id,kind,parent,title] of [['a-t2','section','a-c','第二节'],['a-k3','knowledge','a-t2','第二节知识点'],['a-empty','chapter','a-s','中间无题的章'],['a-last','chapter','a-s','社会工作专业伦理'],['a-last-t','section','a-last','专业伦理基础'],['a-last-k','knowledge','a-last-t','伦理原则'],['a-tail','chapter','a-s','末尾无题的章'],['other-s','subject',null,'社会工作实务'],['other-c','chapter','other-s','另一科目第一章'],['other-t','section','other-c','另一科目的节'],['other-k','knowledge','other-t','另一科目的知识点']])await f.db.query("INSERT INTO content(id,exam_id,kind,parent_id,title,status,payload) VALUES($1,$2,$3,$4,$5,'published','{}')",[id,f.exam,kind,parent,title])
 await f.db.query("UPDATE content SET parent_id='a-k3',payload=payload||'{\"knowledgePointId\":\"a-k3\",\"knowledgePointIds\":[\"a-k3\"]}'::jsonb WHERE id='a-q3'")
 for(const [id,parent,title] of [['last-q','a-last-k','尊重服务对象的自决权'],['other-q','other-k','另一个科目的题目']])await f.db.query("INSERT INTO content(id,exam_id,kind,parent_id,title,status,payload) VALUES($1,$2,'question',$3,$4,'published',$5)",[id,f.exam,parent,title,JSON.stringify({type:'single',typeName:'单选题',stem:title,options:['正确选项','错误选项'],answer:[0],knowledgePointId:parent,knowledgePointIds:[parent]})])
 const r=await fetch(f.origin+'/api/answers',{method:'POST',headers:{Authorization:'Bearer '+f.student,'Content-Type':'application/json'},body:JSON.stringify({examId:f.exam,questionId:'a-q1',selection:[0],requestId:'chapter-migration'})});assert.equal(r.status,200)
 const result=await r.json(),catalog=await f.call('/catalog/'+f.exam,200,''),q=catalog.practiceQuestions.find(q=>q.id==='a-q1')
 const legacy={version:1,ids:['a-q1'],currentId:'a-q1',attempts:{'a-q1':{answers:{answer:[0]},question:q,result:{status:'graded',correct:result.correct,legacy:true,fields:{answer:result}}}},versions:{'a-q1':String(q.updatedAt)},elapsedMs:12000}
 browser=await chromium.launch({channel:'chrome',headless:true})
 async function context(withLegacy){
  const ctx=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'})
  await ctx.addInitScript(({token,exam,uid,legacy})=>{
   if(!localStorage.getItem('sxb-api-token'))localStorage.setItem('sxb-api-token',JSON.stringify({type:'string',data:token}))
   if(!localStorage.getItem('sxb-current-exam'))localStorage.setItem('sxb-current-exam',JSON.stringify({type:'object',data:{id:exam,name:'初级社会工作師'}}))
   if(legacy&&!localStorage.getItem('qa-legacy')){localStorage.setItem('sxb-practice-session-'+uid+'-'+exam+'-'+JSON.stringify(['normal','','','a-t','']),JSON.stringify({type:'object',data:legacy}));localStorage.setItem('qa-legacy','1')}
  },{token:f.student,exam:f.exam,uid:f.uid,legacy:withLegacy?legacy:null})
  await ctx.route('**/api/**',async route=>{const u=new URL(route.request().url());if(!u.pathname.startsWith('/api/'))return route.continue();await route.fulfill({response:await route.fetch({url:f.origin+u.pathname+u.search})})})
  return ctx
 }
 const ctx=await context(true),page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.goto(origin+'/#/pages/practice-session/index?sectionId=a-t&returnUrl=%2Fpages%2Fpractice%2Findex')
 await expect(page.locator('.question-reader')).toBeVisible({timeout:20000});await expect(page.locator('.progress-head')).toContainText('/ 2 题');await expect(page.locator('.progress-head')).toContainText('已答 1 题')
 await page.locator('.card-button').click();await page.getByRole('button',{name:'查看本轮统计'}).click()
 await expect(page.locator('.data-title')).toHaveText('本章作答数据')
 await page.locator('.sheet-close').click()
 await page.locator('.session-bottom uni-button').last().click();await expect(page.locator('.session-bottom')).toContainText('本章结束')
 await page.locator('.session-bottom uni-button').last().click();await expect(page.locator('.celebration-copy')).toContainText('还差 1 题');await expect(page.locator('.continue-chapter')).toHaveCount(0)
 await mkdir('.local/qa/practice-chapters',{recursive:true});await page.screenshot({path:'.local/qa/practice-chapters/incomplete.png'})
 await expect(page.locator('.medal-rays')).toHaveCount(0)
 await page.locator('.completion-primary').click();await page.locator('.answer-option').first().click();await page.locator('.submit-answer').click();await expect(page.locator('.result-summary')).toContainText('正确');await page.locator('.session-bottom uni-button').last().click()
 await expect(page.locator('.celebration-title')).toContainText('这一章，拿下了！');await expect(page.locator('.continue-chapter')).toContainText('继续下一章')
 await mkdir('.local/qa/practice-chapters',{recursive:true});await page.screenshot({path:'.local/qa/practice-chapters/next-chapter.png'})
 // The common restart confirmation is a rounded card with separated inset buttons.
 await page.locator('.completion-retry').click()
 await expect(page.locator('uni-modal')).toBeVisible()
 await expect(page.locator('.uni-modal')).toHaveCSS('border-radius','24px')
 await expect(page.locator('.uni-modal__ft')).toHaveCSS('gap','12px')
 await expect(page.locator('.uni-modal__btn_primary')).toHaveCSS('background-color','rgb(53, 105, 232)')
 await expect(page.locator('uni-modal')).toHaveCSS('opacity','1')
 await page.screenshot({path:'.local/qa/practice-chapters/restart-dialog.png'})
 await page.locator('.uni-modal__btn_default').click()
 await expect(page.locator('uni-modal')).toBeHidden()
 await expect(page.locator('.celebration-title')).toContainText('这一章，拿下了！')
 // Data switches inside the same modal and leaves the timer paused.
 await expect(page.locator('.celebration-actions uni-button')).toHaveCount(3)
 await page.locator('.completion-data').click()
 await expect(page.locator('.completion-stats')).toContainText('100%')
 await expect(page.locator('.data-chapter')).toContainText('社会工作服务的内涵')
 await expect(page.locator('.completion-question.correct')).toHaveCount(2)
 await expect(page.locator('.reading-sheet')).toHaveCount(1)
 await page.screenshot({path:'.local/qa/practice-chapters/statistics.png'})
 await page.locator('.data-back').click()
 // Reduced-motion users get a still illustration; normal mode actually rotates the rays.
 assert.equal(await page.locator('.medal-rays').evaluate(el=>getComputedStyle(el).animationName),'none')
 await page.emulateMedia({reducedMotion:'no-preference'})
 assert.equal(await page.locator('.medal-rays').evaluate(el=>getComputedStyle(el).animationPlayState),'paused')
 await page.locator('.sheet-close').focus()
 const before=await page.locator('.medal-rays').evaluate(el=>getComputedStyle(el).transform)
 await page.waitForTimeout(180)
 assert.notEqual(await page.locator('.medal-rays').evaluate(el=>getComputedStyle(el).transform),before)
 await page.emulateMedia({reducedMotion:'reduce'})
 for(const size of [{width:320,height:568},{width:375,height:667},{width:430,height:932},{width:844,height:390}]){
  await page.setViewportSize(size)
  const box=await page.locator('.sheet-panel').boundingBox()
  assert.ok(box.x>=-1&&box.x+box.width<=size.width+1&&box.y>=0,'modal stays in viewport')
  await page.locator('.completion-retry').scrollIntoViewIfNeeded()
  const action=await page.locator('.completion-retry').boundingBox()
  assert.ok(action.height>=44&&action.y+action.height<=size.height+1,'secondary action reachable')
  await page.screenshot({path:`.local/qa/practice-chapters/complete-${size.width}.png`})
 }
 await page.setViewportSize({width:390,height:844})
 // Enlarged text still scrolls to reachable actions without horizontal overflow.
 const largeText=await page.addStyleTag({content:'.celebration-title{font-size:40px!important}.celebration-copy{font-size:24px!important}.celebration-actions uni-button{font-size:24px!important}'})
 await page.locator('.completion-retry').scrollIntoViewIfNeeded()
 assert.ok(await page.locator('.sheet-panel').evaluate(el=>el.scrollWidth<=el.clientWidth))
 await page.screenshot({path:'.local/qa/practice-chapters/large-text.png'})
 await largeText.evaluate(el=>el.remove())
 await page.locator('.continue-chapter').click();await expect(page).toHaveURL(/chapterId=a-last/);await expect(page.locator('.question-prompt')).toHaveText('尊重服务对象的自决权');await expect(page.locator('.progress-head')).toContainText('已答 0 题')
 await page.reload();await expect(page.locator('.question-reader')).toBeVisible({timeout:20000});await page.locator('.answer-option').first().click();await page.locator('.submit-answer').click();await expect(page.locator('.result-summary')).toContainText('正确');await page.locator('.session-bottom uni-button').last().click()
 await expect(page.locator('.celebration-title')).toContainText('本科目，全部拿下！');await expect(page.locator('.continue-chapter')).toHaveCount(0);await expect(page.locator('.finish-subject')).toContainText('完成本科目');await expect(page.locator('.reading-sheet')).not.toContainText('另一科目')
 await page.screenshot({path:'.local/qa/practice-chapters/subject-complete.png'})
 await page.locator('.finish-subject').click();await expect(page).toHaveURL(/pages\/practice\/index$/)
 await page.getByRole('button',{name:'社会工作综合能力',exact:true}).click()
 const firstChapter=page.locator('[data-chapter-id="a-c"]')
 await expect(firstChapter).toContainText('本轮已答 2')
 await firstChapter.getByRole('button',{name:'重练本章'}).click();await page.locator('uni-modal').getByText('取消',{exact:true}).click()
 await expect(firstChapter).toContainText('本轮已答 2')
 await firstChapter.getByRole('button',{name:'重练本章'}).click();await page.locator('uni-modal .uni-modal__btn').filter({hasText:'重练本章'}).click()
 await expect(page).toHaveURL(/chapterId=a-c/);await expect(page.locator('.progress-head')).toContainText('已答 0 题')
 // Entering the final chapter first cannot claim subject completion based on historical server answers.
 const fresh=await context(false),late=await fresh.newPage()
 await late.goto(origin+'/#/pages/practice-session/index?chapterId=a-last&subjectId=a-s');await expect(late.locator('.question-reader')).toBeVisible({timeout:20000});await late.locator('.answer-option').first().click();await late.locator('.submit-answer').click();await expect(late.locator('.result-summary')).toContainText('正确');await late.locator('.session-bottom uni-button').last().click()
 await expect(late.locator('.celebration-title')).toContainText('这一章，拿下了！');await expect(late.locator('.finish-subject')).toHaveCount(0);await expect(late.locator('.continue-chapter')).toContainText('继续未完成章节');await late.locator('.continue-chapter').click();await expect(late).toHaveURL(/chapterId=a-c/)
 assert.deepEqual(errors,[])
 await fresh.close();await ctx.close();console.log('PASS: whole-chapter queue, legacy section migration, incomplete gate, skip empty chapters, same-subject continuation, refresh, real subject completion and exit to subject selection')
}finally{await browser?.close();await f.close()}
