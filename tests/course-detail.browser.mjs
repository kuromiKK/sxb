import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { chromium,expect } from '@playwright/test'
import { profileFixture } from './helpers/user-profile-fixture.ts'
const f=await profileFixture(),browser=await chromium.launch({channel:'chrome',headless:true})
const out='.local/qa/course-detail';await mkdir(out,{recursive:true})
try{
 const {db,exam,uid,student}=f
 // Use consecutive sections, matching the actual premium-course hierarchy.
 for(const [id,title] of [['a-t-2','理解专业关系'],['a-t-3','服务行动']])await db.query("INSERT INTO content(id,exam_id,kind,parent_id,title,status,payload) VALUES($1,$2,'section','a-c',$3,'published','{}')",[id,exam,title])
 for(const [id,type,title,parent] of [['detail-video','video','社会工作服务的目标与功能','a-t'],['detail-audio','audio','理解社会工作中的专业关系','a-t'],['detail-article','article','把价值理念转化为服务行动','a-t'],['detail-support','article','知识点配套课','a-k'],['other-course','article','其他考试的课程','b-t']]){
  await db.query("INSERT INTO content(id,exam_id,kind,parent_id,title,status,payload) VALUES($1,$2,'course',$3,$4,'published',$5)",[id,id==='other-course'?f.second:exam,id==='detail-audio'?'a-t-2':id==='detail-article'?'a-t-3':parent,title,JSON.stringify({type,totalMinutes:32,intro:'从服务目标出发，理解社会工作如何回应个人与社会的需要。结合具体情境，梳理重点、建立清晰的知识结构。',content:type==='article'?'每一次专业行动，都从理解服务对象开始。\n\n社会工作的价值理念需要转化为具体、可执行的服务行动。坚持以人为本，尊重差异，在沟通中建立信任，在行动中促进改变。\n\n理解需求\n倾听并不只是收集信息，更是理解服务对象生活处境的过程。':'',handouts:[]})])
 }
 const maker=await browser.newPage()
 const media=await maker.evaluate(()=>{
  const c=document.createElement('canvas');c.width=640;c.height=360;const x=c.getContext('2d')
  const g=x.createLinearGradient(0,0,640,360);g.addColorStop(0,'#bdd4f3');g.addColorStop(1,'#e4efeb');x.fillStyle=g;x.fillRect(0,0,640,360);x.fillStyle='#294c7e';x.font='bold 32px sans-serif';x.fillText('社会工作服务的目标与功能',35,150);x.font='18px sans-serif';x.fillText('理解目标 · 连接实践',35,195)
  return {video:[],png:c.toDataURL('image/png').split(',')[1]}
 })
 await maker.close()
 // Requires Chrome and ffmpeg on PATH. All generated resources live in this isolated fixture.
 media.video=Array.from(execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=c=0xbdd4f3:s=640x360:d=2','-c:v','libvpx','-f','webm','pipe:1'],{windowsHide:true,maxBuffer:8*1024*1024}))
 async function upload(id,kind,bytes,name){
  const form=new FormData();form.append('file',new Blob([bytes]),name)
  const r=await fetch(f.origin+'/api/admin/media/upload?contentId='+id+'&examId='+exam+'&kind='+kind,{method:'POST',headers:{Authorization:'Bearer '+f.token},body:form})
  assert.equal(r.status,200);return (await r.json()).id
 }
 const video=await upload('detail-video','video',Buffer.from(media.video),'lesson.webm'),poster=await upload('detail-video','image',Buffer.from(media.png,'base64'),'poster.png')
 const wav=Buffer.alloc(44+8000*2*30);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40)
 const audio=await upload('detail-audio','audio',wav,'lesson.wav'),handout=await upload('detail-video','handout',Buffer.from('%PDF-1.4\n% test\n%%EOF'),'handout.pdf')
 await db.query("UPDATE content SET payload=payload||$1::jsonb WHERE id='detail-video'",[JSON.stringify({mediaAssetId:video,posterAssetId:poster,handouts:[{assetId:handout,title:'课程讲义'}]})])
 await db.query("UPDATE content SET payload=payload||$1::jsonb WHERE id='detail-audio'",[JSON.stringify({mediaAssetId:audio})])
 await db.query("INSERT INTO user_records(id,user_id,exam_id,kind,source_id,payload) VALUES('saved-audio',$1,$2,'courseProgress','detail-audio','{\"progress\":27,\"positionSeconds\":8,\"durationSeconds\":30}')",[uid,exam])
 const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'})
 await context.addInitScript(({student,exam})=>{
  if(location.origin!=='http://127.0.0.1:5174')return
  window.__mediaErrors=[];document.addEventListener('error',e=>{if(e.target instanceof HTMLMediaElement)window.__mediaErrors.push({code:e.target.error?.code,message:e.target.error?.message})},true)
  if(localStorage.getItem('detail-fixture'))return
  localStorage.setItem('detail-fixture','1');localStorage.setItem('sxb-api-token',student)
  localStorage.setItem('sxb-current-exam',JSON.stringify({type:'object',data:{id:exam,name:'初级社会工作师'}}))
 },{student,exam})
 let failNote=false
 await context.route('**/api/**',async route=>{
  const r=route.request(),u=new URL(r.url())
  if(!u.pathname.startsWith('/api/'))return route.continue()
  if(failNote&&r.method()==='PUT'&&u.pathname.includes('/records/')&&r.postDataJSON()?.kind==='note'){failNote=false;return route.fulfill({status:500,json:{message:'笔记暂时保存失败'}})}
  const response=await route.fetch({url:f.origin+u.pathname+u.search})
  await route.fulfill({response})
 })
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message))
 // Deep-link checks start a new document; same-page course transitions are tested via 下一课 above/below.
 async function deepLink(id){await page.goto('about:blank');await page.goto('http://127.0.0.1:5174/#/pages/course-detail/index?id='+id)}
 async function open(id){await deepLink(id);try{await expect(page.locator('.lesson-paper')).toBeVisible({timeout:20000})}catch(e){console.log(await page.locator('body').innerText(),errors);throw e}}
 await open('detail-video')
 await expect(page.locator('.course-title')).toHaveText('社会工作服务的目标与功能')
 try{await expect(page.locator('.lesson-video')).toBeVisible()}catch(e){console.log('media errors',await page.evaluate(()=>window.__mediaErrors));throw e}
 await expect(page.locator('video')).not.toHaveAttribute('autoplay')
 await expect(page.getByRole('button',{name:'下载讲义',exact:true})).toBeVisible()
 await expect(page.locator('.note-editor')).toHaveCount(0)
 await expect(page.locator('.knowledge-list,.course-directory')).toHaveCount(0)
 for(const [width,height] of [[320,740],[375,812],[390,844],[430,932],[844,390]]){
  await page.setViewportSize({width,height})
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
  await page.screenshot({path:out+'/video-'+width+'.png',fullPage:true})
 }
 await page.setViewportSize({width:390,height:844})
 await page.getByRole('button',{name:'收藏课程',exact:true}).click();await expect(page.getByRole('button',{name:'取消收藏',exact:true})).toBeVisible()
 await page.getByRole('button',{name:'记笔记',exact:true}).click()
 await page.locator('.note-editor textarea').fill('以服务对象为中心，理解需要再行动。')
 failNote=true;await page.getByRole('button',{name:'保存笔记',exact:true}).click()
 await expect(page.locator('.inline-error')).toContainText('笔记暂时保存失败')
 await expect(page.locator('.note-editor textarea')).toHaveValue('以服务对象为中心，理解需要再行动。')
 await page.getByRole('button',{name:'保存笔记',exact:true}).click();await expect(page.locator('.reading-sheet')).toHaveCount(0)
 await page.getByRole('button',{name:'我的笔记',exact:true}).click();await expect(page.locator('.note-editor textarea')).toHaveValue('以服务对象为中心，理解需要再行动。')
 await page.screenshot({path:out+'/notes.png'});await page.keyboard.press('Escape');await expect(page.locator('.reading-sheet')).toHaveCount(0)
 // Cancelling verification should not create a download error.
 await page.route('**/api/verification/challenge',r=>r.fulfill({json:{mode:'frontend',required:true}}))
 await page.getByRole('button',{name:'下载讲义',exact:true}).click();await expect(page.getByRole('dialog',{name:'安全验证'})).toBeVisible()
 await page.locator('[aria-label="取消验证"]').click();await expect(page.locator('.inline-error')).toHaveCount(0)
 await page.getByRole('button',{name:/关联知识点/}).focus();await page.keyboard.press('Enter')
 await expect(page.getByRole('dialog',{name:'关联知识点',exact:true})).toBeVisible()
 await expect(page.locator('uni-toast')).toBeHidden()
 await expect(page.locator('.knowledge-row')).toHaveCount(2)
 await page.screenshot({path:out+'/knowledge-sheet.png'})
 await page.keyboard.press('Escape');await expect(page.locator('.knowledge-list')).toHaveCount(0)
 await expect(page.getByRole('button',{name:/关联知识点/})).toBeFocused()
 await page.getByRole('button',{name:/课程目录/}).click()
 await expect(page.getByRole('dialog',{name:'课程目录',exact:true})).toBeVisible()
 await expect(page.locator('.directory-row')).toHaveCount(3)
 await expect(page.locator('.course-directory')).not.toContainText('知识点配套课')
 await expect(page.locator('.course-directory')).not.toContainText('其他考试')
 await page.screenshot({path:out+'/directory.png'})
 await page.locator('[aria-label="关闭面板"]').click();await expect(page.locator('.course-directory')).toHaveCount(0)
 await page.getByRole('button',{name:'下一课',exact:true}).click()
 await expect(page).toHaveURL(/id=detail-audio/);await expect(page.locator('.reading-audio')).toBeVisible()
 assert.equal((await db.query("SELECT payload FROM user_records WHERE user_id=$1 AND source_id='detail-video' AND kind='courseProgress'",[uid])).rows.some(r=>r.payload.completed),false)
 await expect(page.locator('.audio-times')).toContainText('00:08',{timeout:10000})
 await expect(page.getByRole('button',{name:'下载讲义',exact:true})).toHaveCount(0)
 await expect(page.locator('uni-toast')).toBeHidden();await page.screenshot({path:out+'/audio.png',fullPage:true})
 await page.getByRole('button',{name:'播放音频',exact:true}).click();await expect(page.getByRole('button',{name:'暂停音频',exact:true})).toBeVisible()
 await page.getByRole('button',{name:'暂停音频',exact:true}).click()
 await page.getByRole('button',{name:'下一课',exact:true}).click();await expect(page).toHaveURL(/id=detail-article/)
 await expect(page.locator('.article-body')).toContainText('每一次专业行动')
 await expect(page.locator('.lesson-video,.reading-audio')).toHaveCount(0)
 await page.getByRole('button',{name:'标记学完',exact:true}).click();await expect(page.locator('.finish-button')).toHaveText('已学完')
 await expect(page.locator('uni-toast')).toBeHidden();await page.screenshot({path:out+'/article.png',fullPage:true})
 await page.reload();await expect(page.locator('.finish-button')).toHaveText('已学完')
 await expect(page.getByRole('button',{name:'返回课程',exact:true})).toBeVisible()
 await open('detail-video');await expect(page.getByRole('button',{name:'取消收藏',exact:true})).toBeVisible()
 await page.getByRole('button',{name:'我的笔记',exact:true}).click();await expect(page.locator('.note-editor textarea')).toHaveValue('以服务对象为中心，理解需要再行动。');await page.keyboard.press('Escape')
 await deepLink('other-course')
 await expect(page.locator('.detail-state')).toContainText('不属于当前考试');await expect(page.locator('.lesson-paper')).toHaveCount(0)
 assert.deepEqual(errors,[])
 console.log('PASS: video/audio/article layout, audio resume/play/pause, notes retry/persistence, favorite, optional handout and cancellation, scoped directory, next without completion, completion persistence, exam guard')
}finally{await browser.close();await f.close()}
