import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {chromium,expect} from '@playwright/test'
import {profileFixture} from './helpers/user-profile-fixture.ts'
import {newField} from '../apps/shared/question-types.ts'
const f=await profileFixture(),browser=await chromium.launch({channel:'chrome',headless:true})
const origin='http://127.0.0.1:5174',out='.local/qa/practice-directory'
await mkdir(out,{recursive:true})
try{
 await f.db.query("UPDATE content SET title='社会工作综合能力',payload=payload||'{\"shortTitle\":\"初级综合\"}'::jsonb WHERE id='a-s'")
 await f.db.query("UPDATE content SET title='第一章 社会工作服务的内涵' WHERE id='a-c'")
 for(const [id,kind,parent,title] of [['a-t2','section','a-c','服务目标与社会工作实践'],['a-k3','knowledge','a-t2','服务目标'],...Array.from({length:8},(_,i)=>['extra-c'+i,'chapter','a-s','沟通与会谈技巧及社会工作服务中的重点应用 '+(i+1)]),...Array.from({length:5},(_,i)=>['extra-s'+i,'subject',null,'扩展科目 '+(i+1)]),['other-c','chapter','extra-s0','社会工作实务'],['other-t','section','other-c','实践方法'],['other-k','knowledge','other-t','专业关系']])await f.db.query("INSERT INTO content(id,exam_id,kind,parent_id,title,status,payload) VALUES($1,$2,$3,$4,$5,'published','{}')",[id,f.exam,kind,parent,title])
 await f.db.query("UPDATE content SET payload=payload||'{\"knowledgePointIds\":[\"a-k\",\"a-k2\",\"a-k3\"]}'::jsonb WHERE id='a-q1'")
 const essay={type:'configured',typeName:'案例分析',templateId:'qa-essay',templateVersion:1,definition:{fields:[newField('text','essay')],examRules:{}},values:{essay:{prompt:'如何建立专业关系？',reference:'尊重接纳',rubric:'说明专业原则'}},knowledgePointIds:['a-k'],knowledgePointId:'a-k'}
 await f.db.query("INSERT INTO content(id,exam_id,kind,parent_id,title,status,payload) VALUES('directory-essay',$1,'question','a-k','案例分析','published',$2)",[f.exam,JSON.stringify(essay)])
 await f.db.query("INSERT INTO content(id,exam_id,kind,parent_id,title,status,payload) VALUES('other-q',$1,'question','other-k','另一科目题目','published',$2)",[f.exam,JSON.stringify({type:'single',stem:'另一科目题目',options:['是','否'],answer:[0],knowledgePointIds:['other-k'],knowledgePointId:'other-k'})])
 const catalog=await f.call('/catalog/'+f.exam,200,''),qs=catalog.practiceQuestions
 const saved={version:1,ids:['a-q1','a-q3','directory-essay'],currentId:'a-q3',updatedAt:Date.now(),attempts:{'a-q1':{answers:{answer:[0]},result:{status:'graded',correct:true}},'a-q3':{answers:{answer:[0]}},'directory-essay':{history:true,answers:{},result:{status:'self_graded'}}},versions:Object.fromEntries(qs.map(q=>[q.id,String(q.updatedAt)])),elapsedMs:1000}
 const ctx=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'})
 await ctx.addInitScript(({token,exam,uid,saved})=>{
  if(location.origin!=='http://127.0.0.1:5174'||localStorage.getItem('directory-fixture'))return
  localStorage.setItem('directory-fixture','1');localStorage.setItem('sxb-api-token',JSON.stringify({type:'string',data:token}));localStorage.setItem('sxb-current-exam',JSON.stringify({type:'object',data:{id:exam,name:'初级社会工作师'}}))
  localStorage.setItem('sxb-practice-session-'+uid+'-'+exam+'-chapter-a-c',JSON.stringify({type:'object',data:saved}))
 },{token:f.student,exam:f.exam,uid:f.uid,saved})
 let failCatalog=false,emptyCatalog=false,failPersonal=false
 await ctx.route('**/api/**',async route=>{
  const u=new URL(route.request().url());if(!u.pathname.startsWith('/api/'))return route.continue()
  if(failCatalog&&u.pathname.includes('/catalog/'))return route.fulfill({status:500,json:{message:'题库服务暂不可用'}})
  if(emptyCatalog&&u.pathname.includes('/catalog/'))return route.fulfill({json:{...catalog,knowledgeSubjects:[],practiceQuestions:[]}})
  if(failPersonal&&u.pathname.includes('/records/'))return route.fulfill({status:500,json:{message:'学习记录暂不可用'}})
  await route.fulfill({response:await route.fetch({url:f.origin+u.pathname+u.search})})
 })
 const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.goto(origin+'/#/pages/practice/index')
 await expect(page.locator('.subject-tab').filter({hasText:'初级综合'})).toBeVisible({timeout:20000})
 await page.locator('.subject-tab').filter({hasText:'初级综合'}).click()
 const first=page.locator('[data-chapter-id="a-c"]')
 await expect(first).toContainText('共 3 题');await expect(first).toContainText('本轮已答 1')
 await expect(first.locator('.chapter-title')).toHaveText('社会工作服务的内涵')
 await expect(first.locator('.chapter-mastery')).toHaveText('掌握 50%')
 await expect(first.getByRole('button',{name:'继续练习'})).toBeVisible()
 await expect(page.locator('.section-list')).toHaveCount(0)
 for(const [width,height] of [[320,740],[375,812],[390,844],[430,932],[844,390]]){
  await page.setViewportSize({width,height});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
  await page.screenshot({path:out+'/list-'+width+'.png'})
 }
 await page.setViewportSize({width:390,height:844})
 await first.getByRole('button',{name:/查看范围/}).click()
 await expect(first.locator('.section-row')).toHaveCount(2)
 await expect(first.locator('.section-count').first()).toHaveText('3 题');await expect(first.locator('.section-count').last()).toHaveText('1 题')
 await expect(first.locator('.section-list')).not.toContainText('掌握')
 await page.screenshot({path:out+'/range.png'})
 // Continue opens the saved question/draft; coming back restores the expanded range.
 await first.getByRole('button',{name:'继续练习'}).click();await expect(page).toHaveURL(/chapterId=a-c/)
 await expect(page.locator('.question-reader')).toBeVisible();await expect(page.locator('.progress-head')).toContainText('/ 3 题')
 await expect(page.locator('.progress-head')).toContainText('已答 1 题');await expect(page.locator('.answer-option.selected')).toHaveCount(1)
 await page.getByRole('button',{name:'返回',exact:true}).click();await expect(first.locator('.section-list')).toBeVisible()
 await first.getByRole('button',{name:/收起范围/}).click()
 await page.locator('[data-chapter-id="extra-c7"]').scrollIntoViewIfNeeded()
 const scroll=await page.evaluate(()=>scrollY);await page.reload();await expect(first).toBeAttached()
 await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(scroll-30)
 await expect(page.locator('[data-chapter-id="extra-c7"] .start-chapter')).toBeDisabled()
 // Horizontal subject strip stays scrollable and uses backend labels.
 const strip=page.locator('.native-scroll-tabs')
 await strip.evaluate(el=>el.scrollLeft=el.scrollWidth)
 await page.locator('.subject-tab').filter({hasText:'扩展科目 5'}).click();await expect(page.locator('.chapter-content')).toContainText('本科目暂无章节')
 await strip.evaluate(el=>el.scrollLeft=0);await page.locator('.subject-tab').filter({hasText:'初级综合'}).click();await expect(first).toBeVisible()
 await page.locator('.plan-link').click();await expect(page).toHaveURL(/pages\/learning-plan\/index/)
 await page.goBack();await expect(first).toBeAttached()
 // Personal sync failure does not show stale percentages or reset a previous round.
 failPersonal=true;await page.reload();await expect(page.locator('.personal-error')).toBeVisible({timeout:20000})
 await page.locator('uni-modal').getByText('知道了',{exact:true}).click()
 await expect(first.locator('.chapter-mastery')).toHaveText('掌握程度 —');await expect(first.locator('.start-chapter')).toBeDisabled()
 failPersonal=false;await page.locator('.personal-error').click();await expect(first).toContainText('本轮已答 1')
 failCatalog=true;await page.reload();await expect(page.locator('.directory-state')).toContainText('题库服务暂不可用',{timeout:20000})
 await page.locator('uni-modal').getByText('知道了',{exact:true}).click()
 failCatalog=false;await page.getByRole('button',{name:'重新加载',exact:true}).click();await expect(first).toBeAttached()
 emptyCatalog=true;await page.reload();await expect(page.locator('.directory-state')).toContainText('当前考试暂无题库内容',{timeout:20000})
 await expect(page.locator('.chapter-card')).toHaveCount(0)
 assert.deepEqual(errors,[])
 console.log('PASS: responsive directory, backend short titles, deduplicated chapter/section counts including configured subjective questions, objective mastery, draft resume, scroll/range restore, subject scrolling, empty/error states')
 await ctx.close()
}finally{await browser.close();await f.close()}
