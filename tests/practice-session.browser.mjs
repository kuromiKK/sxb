import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {chromium,expect} from '@playwright/test'
import {profileFixture} from './helpers/user-profile-fixture.ts'
import {newField} from '../apps/shared/question-types.ts'
const f=await profileFixture(),origin='http://127.0.0.1:5174'
let browser
try{
 await f.db.query("UPDATE content SET title=CASE id WHEN 'a-s' THEN '社会工作综合能力' WHEN 'a-c' THEN '社会工作服务的内涵' WHEN 'a-t' THEN '社会工作服务的目标与功能' ELSE title END,payload=payload||'{\"no\":1}'::jsonb WHERE id=ANY($1::text[])",[['a-s','a-c','a-t']])
 await f.db.query("UPDATE content SET payload=payload||$1::jsonb WHERE id='a-q1'",[JSON.stringify({stem:'社会工作者小林在社区开展服务。下列做法中，最能体现“助人自助”理念的是？',options:['支持居民发掘自身优势，共同制定行动计划','替居民决定所有服务事项','仅提供一次性的物质援助','由专业人员包办全部问题'],explanation:'助人自助强调尊重服务对象的主体性，帮助其发展自主解决问题的能力。',typeName:'单选题',year:'2026',source:'模拟题'})])
 const multiple={...newField('multiple','multi'),label:'多选题',maxScore:4,scoring:'partial',partialScore:1}
 const boolean={...newField('boolean','judge'),label:'判断题'}
 const text={...newField('text','essay'),label:'案例分析',maxScore:10}
 const ai={...newField('text','ai'),label:'AI 主观题',aiGrading:true,maxScore:10}
 const shared=newField('options','shared'),group={...newField('group','group'),label:'材料题 · 社区服务',children:[{...newField('single','sub1'),optionsSource:'shared',label:'第 1 小题'},{...newField('multiple','sub2'),optionsSource:'shared',label:'第 2 小题'}]}
 const definitions=[
  ['multi',[multiple],{multi:{prompt:'社会工作服务应遵循哪些原则？',options:['尊重','接纳','替服务对象决定一切'],answer:[0,1],explanation:'尊重与接纳是专业服务的基本要求。'}}],
  ['judge',[boolean],{judge:{prompt:'社会工作应尊重服务对象的自决权。',answer:[0],explanation:'自决权是重要的专业伦理原则。'}}],
  ['essay',[text],{essay:{prompt:'如何支持居民提升解决问题的能力？',reference:'识别优势，协商目标，连接资源。',rubric:'识别优势 3 分、协商目标 3 分、连接资源 4 分。'}}],
  ['group',[newField('material','material'),shared,group],{material:'社区居民希望共同改善公共空间，社会工作者组织居民讨论并制定计划。',shared:['尊重居民意愿','支持居民参与','替代所有决策'],sub1:{prompt:'首先应该遵循哪项原则？',answer:[0]},sub2:{prompt:'哪些行动有助于居民成长？',answer:[0,1]}}],
  ['ai',[ai],{ai:{prompt:'分析服务目标。',reference:'自主能力',rubric:'根据专业性评分'}}]
 ]
 for(const [id,fields,values] of definitions)await f.db.query("INSERT INTO content(id,exam_id,kind,parent_id,title,status,payload) VALUES($1,$2,'question','a-k',$3,'published',$4)",['practice-'+id,f.exam,'练习 '+id,JSON.stringify({type:'configured',typeName:fields[0].label,templateId:'qa-'+id,templateVersion:1,definition:{fields,examRules:{}},values,stem:'练习 '+id,knowledgePointId:'a-k',knowledgePointIds:['a-k']})])
 const catalog=await f.call('/catalog/'+f.exam,200,''),ids=catalog.practiceQuestions.filter(q=>(q.linkedSectionIds||[q.sectionId]).includes('a-t')&&q.type!=='subjective').map(q=>q.id)
 browser=await chromium.launch({channel:'chrome',headless:true})
 const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'})
 await context.addInitScript(({token,exam})=>{if(!localStorage.getItem('sxb-api-token'))localStorage.setItem('sxb-api-token',JSON.stringify({type:'string',data:token}));if(!localStorage.getItem('sxb-current-exam'))localStorage.setItem('sxb-current-exam',JSON.stringify({type:'object',data:{id:exam,name:'初级社会工作师'}}))},{token:f.student,exam:f.exam})
 await context.route('**/api/**',async route=>{const u=new URL(route.request().url());if(!u.pathname.startsWith('/api/'))return route.continue();await route.fulfill({response:await route.fetch({url:f.origin+u.pathname+u.search})})})
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message))
 async function waitForToast(){await expect(page.locator('uni-toast')).not.toBeVisible({timeout:10000})}
 const url=origin+'/#/pages/practice-session/index?sectionId=a-t'
 await page.goto(url);await expect(page.locator('.question-reader')).toBeVisible({timeout:30000}).catch(async e=>{console.log('Page diagnostics:',await page.locator('body').innerText(),errors);throw e})
 async function card(){await page.locator('.card-button').click();await expect(page.locator('.number-grid')).toBeVisible()}
 async function go(id){await card();await page.locator('.number-item').filter({has:page.locator('text=/^'+(ids.indexOf(id)+1)+'$/')}).click()}
 // Explicit submit; drafts persist on navigation and reload without counting as completed.
 await go('a-q1');await page.locator('.answer-option').nth(0).focus();await page.keyboard.press('Space');await expect(page.locator('.submit-answer')).toBeVisible();await expect(page.locator('.answer-option.selected')).toHaveCount(1).catch(async e=>{console.log('keyboard',await page.locator('.answer-option').first().evaluate(el=>({html:el.outerHTML,focused:document.activeElement.outerHTML})),errors);throw e});await expect(page.locator('.progress-head')).toContainText('已答 0 题')
 await page.locator('.favorite-button').focus();await page.keyboard.press('Enter');await expect(page.locator('.favorite-button')).toHaveAttribute('aria-label','取消收藏')
 await page.reload();await expect(page.locator('.answer-option.selected')).toHaveCount(1,{timeout:30000})
 await mkdir('.local/qa/practice-session',{recursive:true});await waitForToast();await page.screenshot({path:'.local/qa/practice-session/single-390.png',fullPage:true})
 // Commit can succeed while response is lost. Retry must use the persisted request id.
 let loseResponse=true
 await context.route('**/api/answers',async route=>{const response=await route.fetch({url:f.origin+'/api/answers'});if(loseResponse){loseResponse=false;return route.abort('failed')}return route.fulfill({response})})
 await page.locator('.submit-answer').click();await expect(page.locator('.error-summary')).toContainText('无法连接')
 await page.locator('.submit-answer').click();await expect(page.locator('.result-summary')).toContainText('正确');await expect(page.locator('.progress-head')).toContainText('已答 1 题')
 const count=(await f.db.query("SELECT count(*)::int n FROM answers WHERE question_id='a-q1' AND user_id=$1 AND request_id NOT LIKE 'a-%'",[f.uid])).rows[0].n;assert.equal(count,1)
 await context.unroute('**/api/answers')
 // Partial scoring; historical snapshot is explicit and doesn't become this round's answer.
 await go('practice-multi');await page.locator('.answer-option').nth(0).click();await page.locator('.submit-answer').click();await expect(page.locator('.result-summary')).toContainText('部分得分');await expect(page.locator('.result-summary')).toContainText('1 / 4')
 await expect(page.locator('.question-paper')).toHaveClass(/has-mistake/)
 await expect(page.locator('.impact-stamp')).toBeVisible()
 await expect(page.locator('.impact-stamp')).toHaveCSS('animation-name','none')
 await page.locator('.result-summary uni-button').click();await page.locator('.history-link').click();await expect(page.locator('.history-banner')).toBeVisible();await expect(page.locator('.progress-head')).toContainText('已答 1 题');await page.locator('.history-banner uni-button').click();await expect(page.locator('.submit-answer')).toBeVisible()
 await page.locator('.answer-option').nth(0).click();await page.locator('.answer-option').nth(1).click();await page.locator('.submit-answer').click();await expect(page.locator('.result-summary')).toContainText('4 / 4')
 await expect(page.locator('.question-paper')).not.toHaveClass(/has-mistake/)
 await go('practice-judge');await page.emulateMedia({reducedMotion:'no-preference'});await page.locator('.answer-option').nth(1).click();await page.locator('.submit-answer').click();await expect(page.locator('.result-summary')).toContainText('错误');await expect(page.locator('.option-state').filter({hasText:'错选'})).toHaveCount(1)
 await expect(page.locator('.question-paper')).toHaveClass(/has-mistake/)
 await expect(page.locator('.question-paper')).toHaveCSS('border-top-color','rgb(198, 55, 67)')
 await expect(page.locator('.answer-option.wrong')).toHaveCSS('background-color','rgb(255, 240, 240)')
 await expect(page.locator('.answer-option.wrong')).toHaveCSS('border-top-color','rgb(198, 55, 67)')
 for(const selector of ['.option-copy','.option-letter','.option-state'])await expect(page.locator('.answer-option.wrong '+selector)).toHaveCSS('color','rgb(198, 55, 67)')
 await expect(page.locator('.wrong-verdict,.mistake-frame')).toHaveCount(0)
 await expect(page.locator('.field-feedback .impact-stamp')).toBeVisible()
 assert.match(await page.locator('.impact-stamp').evaluate(el=>getComputedStyle(el).animationName),/mistake-stamp/)
 // Capture the stamp after the impact settles; it overlaps the explanation, not a full-screen layer.
 await page.waitForTimeout(600)
 const stamp=await page.locator('.impact-stamp').boundingBox(),feedback=await page.locator('.field-feedback').boundingBox()
 assert.ok(stamp.y<feedback.y+90&&stamp.y+stamp.height>feedback.y)
 await page.screenshot({path:'.local/qa/practice-session/wrong-stamp.png',fullPage:true})
 await expect(page.locator('.mistake-impact')).toHaveCount(0,{timeout:5000})
 await expect(page.locator('.question-paper')).toHaveClass(/has-mistake/)
 await page.screenshot({path:'.local/qa/practice-session/wrong-after-stamp.png',fullPage:true})
 await page.emulateMedia({reducedMotion:'reduce'})
 // Nested validation locates the required field, shared options render for both children.
 await go('practice-group');await expect(page.locator('.question-paper')).not.toHaveClass(/has-mistake/);await page.locator('#answer-field-sub1 .answer-option').nth(0).click();await page.locator('.submit-answer').click();await expect(page.locator('.error-summary')).toContainText('第 2 小题');await expect(page.locator('#answer-field-sub2 .field-error')).toHaveText('请完成这一题')
 await page.locator('#answer-field-sub2 .answer-option').nth(0).click();await page.locator('#answer-field-sub2 .answer-option').nth(1).click();await page.locator('.submit-answer').click();await expect(page.locator('.result-summary')).toContainText('正确')
 await page.screenshot({path:'.local/qa/practice-session/group-390.png',fullPage:true})
 // Subjective answers stay drafts; self-score synchronizes card and summary.
 await go('practice-essay');await page.locator('.text-answer textarea').fill('先识别居民的优势，与居民协商目标，再连接社区资源。');await go('a-q3');await go('practice-essay');await expect(page.locator('.text-answer textarea')).toHaveValue('先识别居民的优势，与居民协商目标，再连接社区资源。')
 await page.locator('.submit-answer').click();await expect(page.locator('.result-summary')).toContainText('待自评');await page.locator('.self-score input').fill('11');await page.locator('.self-score uni-button').click();await expect(page.locator('.error-summary')).toContainText('0 至满分')
 await page.locator('.self-score input').fill('8.5');await page.locator('.self-score uni-button').click();await expect(page.locator('.result-summary')).toContainText('8.5 / 10').catch(async e=>{console.log('self-score diagnostics',await page.locator('.question-reader').innerText(),errors);throw e});await expect(page.locator('.result-summary')).toContainText('已评分')
 await page.screenshot({path:'.local/qa/practice-session/essay-390.png',fullPage:true})
 // AI failure/retry via mocked grading response, never charge a real model.
 const aiResult={status:'ai_failed',submissionId:'qa-ai-submission',score:null,maxScore:10,correct:null,fields:{ai:{status:'ai_failed',method:'ai',score:null,maxScore:10,reference:'自主能力',rubric:'根据专业性评分',error:'评分服务暂不可用'}}}
 await context.route('**/api/answers/configured',async route=>{if(route.request().postDataJSON().questionId==='practice-ai')return route.fulfill({json:aiResult});return route.fallback()})
 await context.route('**/api/answers/submissions/qa-ai-submission/retry',route=>route.fulfill({json:{...aiResult,status:'ai_pending',fields:{ai:{...aiResult.fields.ai,status:'ai_pending',error:undefined}}}}))
 await context.route('**/api/answers/configured/practice-ai',route=>route.fulfill({json:{result:{...aiResult,status:'ai_graded',score:7,fields:{ai:{...aiResult.fields.ai,status:'ai_graded',score:7,error:undefined,feedback:'已覆盖主要目标。'}}}}}))
 await go('practice-ai');await page.locator('.text-answer textarea').fill('帮助服务对象发展自主解决问题的能力。');await page.locator('.submit-answer').click();await expect(page.locator('.result-summary')).toContainText('评分失败');await expect(page.locator('.result-summary')).not.toContainText('0 / 10');await page.locator('.result-summary uni-button').click();await expect(page.locator('.result-summary')).toContainText('7 / 10',{timeout:10000})
 // Notes retain text across dismissal and save errors.
 await page.locator('.question-tools uni-button').filter({hasText:'记笔记'}).click();await page.locator('.note-input textarea').fill('注意助人自助与包办代替的区别');await page.locator('.sheet-close').click();await page.locator('.question-tools uni-button').filter({hasText:'记笔记'}).click();await expect(page.locator('.note-input textarea')).toHaveValue('注意助人自助与包办代替的区别')
 await context.route('**/api/records/**',async route=>route.request().method()==='PUT'?route.fulfill({status:503,json:{message:'笔记服务暂不可用'}}):route.fallback())
 await page.locator('.primary-button').click();await expect(page.locator('.reading-sheet')).toContainText('笔记服务暂不可用');await expect(page.locator('.note-input textarea')).toHaveValue('注意助人自助与包办代替的区别');await context.unroute('**/api/records/**');await page.locator('.primary-button').click();await expect(page.locator('.reading-sheet')).toHaveCount(0)
 // Last question does not imply the whole chapter/subject is finished.
 await go(ids.at(-1));await page.locator('.session-bottom uni-button').last().click()
 await expect(page.locator('.celebration-copy')).toContainText('还差 1 题')
 await page.locator('.completion-data').click()
 await expect(page.locator('.completion-stats')).toContainText('75%')
 await expect(page.locator('.subjective-score')).toHaveText('15.5 / 20')
 await expect(page.locator('.completion-question.wrong')).toHaveCount(1)
 await expect(page.locator('.completion-question.reviewed')).toHaveCount(2)
 await waitForToast()
 await expect.poll(async()=>{const b=await page.locator('.sheet-panel').boundingBox();return Math.round(b.y+b.height)}).toBe(844)
 await page.screenshot({path:'.local/qa/practice-session/completion-data.png'})
 await page.locator('.completion-question.wrong').click()
 await expect(page.locator('.result-summary')).toContainText('错误')
 await expect(page.locator('.question-paper')).toHaveClass(/has-mistake/);await expect(page.locator('.mistake-impact')).toHaveCount(0)
 await go(ids.at(-1));await page.locator('.session-bottom uni-button').last().click()
 await page.locator('.completion-primary').click();await expect(page.locator('.progress-head')).toContainText('第 '+(ids.indexOf('a-q3')+1))
 await card();await waitForToast();await page.screenshot({path:'.local/qa/practice-session/card-390.png',fullPage:true});await page.locator('.sheet-close').click()
 // Multiple linked points; back from reading returns to the same question and attempt.
 await go('a-q1');await page.locator('.question-tools uni-button').filter({hasText:'关联知识点'}).click();await expect(page.locator('.knowledge-entry')).toHaveCount(2);await page.locator('.knowledge-entry').first().click();await expect(page.locator('.knowledge-reader')).toBeVisible();await page.locator('.reader-nav .back-button').click();await expect(page.locator('.result-summary')).toContainText('正确')
 for(const [w,h] of [[320,568],[375,667],[430,932],[844,390]]){await page.setViewportSize({width:w,height:h});await page.evaluate(()=>scrollTo(0,0));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));const b=await page.locator('.session-bottom').boundingBox();assert.ok(b.y+b.height<=h+1);await page.screenshot({path:`.local/qa/practice-session/review-${w}.png`,fullPage:true})}
 // A hidden tab must not accumulate practice time.
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'))})
 const stopped=await page.locator('.top-title').innerText();await page.waitForTimeout(1300);assert.equal(await page.locator('.top-title').innerText(),stopped)
 await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'))})
 // Copying this browser's local cache does not restore another learner's current round.
 const {session}=await import('../apps/api/src/security.ts'),otherToken=await session(f.other)
 await page.evaluate(t=>localStorage.setItem('sxb-api-token',JSON.stringify({type:'string',data:t})),otherToken)
 await page.reload();await expect(page.locator('.question-reader')).toBeVisible({timeout:20000});await expect(page.locator('.progress-head')).toContainText('已答 0 题');await expect(page.locator('.result-summary')).toHaveCount(0)
 assert.deepEqual(errors,[])
 console.log('PASS: explicit submit, idempotent retry, multiple/boolean/group/text/AI, drafts, history, self-score, answer card, notes, linked knowledge, responsive layout')
}finally{await browser?.close();await f.close()}
