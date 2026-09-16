import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import {profileFixture} from './helpers/user-profile-fixture.ts'

test('captcha proof isolation, real SMS adapter, secrets and delivery limits',async()=>{
 const upstream=express();upstream.use(express.json());let upstreamDown=false
 upstream.get('/api/v1/public/get-data',(_q,r)=>upstreamDown?r.status(503).end():r.json({code:200,data:{captcha_key:crypto.randomUUID(),master_image_base64:'data:image/png;base64,eA==',thumb_image_base64:'data:image/png;base64,eA==',master_width:300,master_height:220,thumb_width:60,thumb_height:60,display_x:12,display_y:20}}))
 const checkedVariants:string[]=[]
 upstream.post('/api/v1/public/check-data',(q,r)=>{checkedVariants.push(q.body.id);const expected=q.body.id==='rotate-default'?'135':q.body.id.startsWith('click')?'40,50,100,120':'180,20';r.json({code:200,data:q.body.value===expected?'ok':'failure'})})
 const server=upstream.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));process.env.GOCAPTCHA_URL='http://127.0.0.1:'+(server.address() as any).port
 const f=await profileFixture(),{sendLoginCode,consumeCaptcha,integration}=await import('../apps/api/src/integrations.ts'),{hash}=await import('../apps/api/src/security.ts')
 const req=(phone:string,proof?:string)=>({body:{phone,...(proof?{captchaProof:proof}:{})},headers:{},ip:'127.0.0.1'})
 async function call(path:string,body:any,expected=200,token=''){const r=await fetch(f.origin+'/api'+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});const d:any=await r.json();assert.equal(r.status,expected,JSON.stringify(d));return d}
 async function save(key:string,config:any,extras={}){const setting=await integration(key as any);const r=await fetch(f.origin+'/api/admin/integrations/'+key,{method:'PUT',headers:{'Content-Type':'application/json',Authorization:'Bearer '+f.token},body:JSON.stringify({revision:setting.revision,config,...extras})});return {status:r.status,data:await r.json()}}
 async function proof(scope='sms',target='18800001111',token=''){const c=await call('/verification/challenge',{scope,target},200,token);assert.equal(c.data.captcha_key,undefined);return (await call('/verification/check',{scope,target,challengeId:c.challengeId,x:180,y:20},200,token)).proof}
 try{
  assert.equal((await fetch(f.origin+'/api/admin/integrations')).status,401)
  const cap={...(await integration('captcha')).config,mode:'gocaptcha',sms:true};assert.equal((await save('captcha',cap)).status,200)
  const c=await call('/verification/challenge',{scope:'sms',target:'18800001111'})
  await call('/verification/check',{scope:'sms',target:'18800002222',challengeId:c.challengeId,x:180,y:20},400)
  await call('/verification/check',{scope:'sms',target:'18800001111',challengeId:c.challengeId,x:0,y:20},400)
  await call('/verification/check',{scope:'sms',target:'18800001111',challengeId:c.challengeId,x:180,y:20},400)
  const p=await proof();await assert.rejects(()=>consumeCaptcha('sms','18800002222',req('18800002222'),p),/无效/)
  const results=await Promise.allSettled([consumeCaptcha('sms','18800001111',req('18800001111'),p),consumeCaptcha('sms','18800001111',req('18800001111'),p)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1)
  const preview=await call('/admin/integrations/captcha/preview',cap,200,f.token)
  await call('/verification/check',{scope:'sms',target:'18800001111',challengeId:preview.challengeId,x:180,y:20},400)
  const handout=await proof('handout','media:a',f.student)
  await assert.rejects(()=>consumeCaptcha('handout','media:b',{headers:{authorization:'Bearer '+f.student}},handout),/无效/)
  await assert.rejects(()=>consumeCaptcha('handout','media:a',{headers:{authorization:'Bearer wrong-session'}},handout),/无效/)
  await consumeCaptcha('handout','media:a',{headers:{authorization:'Bearer '+f.student}},handout)
  const expired=await proof();await f.db.query("UPDATE verification_challenges SET proof_expires_at=now()-interval '1 second' WHERE proof_hash=$1",[hash(expired)]);await assert.rejects(()=>consumeCaptcha('sms','18800001111',req('18800001111'),expired),/无效/)
  upstreamDown=true;await call('/verification/challenge',{scope:'sms',target:'18800001111'},503);upstreamDown=false
  const sms={...(await integration('sms')).config,mode:'aliyun',codeLength:6,signName:'测试签名',templateCode:'SMS_TEST',dailyLimit:2}
  assert.equal((await save('sms',sms,{accessKeyId:'test-access-id',accessKeySecret:'test-secret-value'})).status,200)
  const publicSettings=await f.call('/verification/settings');assert.equal(publicSettings.sms.signName,undefined)
  const adminSettings=await f.call('/admin/integrations');assert.equal(adminSettings.find((s:any)=>s.key==='sms').hasCredentials,true);assert.ok(!JSON.stringify(adminSettings).includes('test-secret'))
  assert.ok(!(await integration('sms')).secrets.includes('test-secret'))
  assert.equal((await save('captcha',{...cap,mode:'frontend'})).status,400)
  await assert.rejects(()=>sendLoginCode(req('18800001111'),async()=>{throw Error('must not send')}),/安全验证/)
  const sends:any[]=[],transport=async(input:any)=>{sends.push(input);return {code:'OK',requestId:'request-test',bizId:'biz-test'}}
  const sent=await sendLoginCode(req('18800001111',await proof()),transport);assert.equal((sent as any).testCode,undefined);assert.equal(sent.isTest,false);assert.equal(sends.length,1);assert.match(sends[0].code,/^\d{6}$/);assert.equal(sends[0].credentials.accessKeySecret,'test-secret-value')
  assert.equal((await f.db.query('SELECT code_hash FROM login_codes WHERE phone=$1',['18800001111'])).rows[0].code_hash,hash('18800001111'+sends[0].code))
  await assert.rejects(()=>sendLoginCode(req('18800001111','invalid'),transport))
  await assert.rejects(async()=>sendLoginCode(req('18800001111',await proof()),transport),/秒后/)
  const login=await call('/auth/phone',{phone:'18800001111',code:sends[0].code});assert.ok(login.token||login.consentRequired)
  const failPhone='18800002222';await assert.rejects(async()=>sendLoginCode(req(failPhone,await proof('sms',failPhone)),async()=>({code:'isv.BUSINESS_LIMIT_CONTROL'})),/频繁/);assert.equal((await f.db.query('SELECT * FROM login_codes WHERE phone=$1',[failPhone])).rows.length,0)
  assert.equal((await f.db.query('SELECT status FROM sms_deliveries WHERE phone=$1',[failPhone])).rows[0].status,'failed')
  await f.db.query("UPDATE sms_deliveries SET created_at=now()-interval '5 minutes' WHERE phone='18800001111'")
  const pa=await proof(),pb=await proof();const concurrent=await Promise.allSettled([sendLoginCode(req('18800001111',pa),transport),sendLoginCode(req('18800001111',pb),transport)]);assert.equal(concurrent.filter(r=>r.status==='fulfilled').length,1)
  await f.db.query("UPDATE sms_deliveries SET created_at=now()-interval '5 minutes' WHERE phone='18800001111'");await f.db.query("UPDATE login_codes SET sent_at=now()-interval '5 minutes' WHERE phone='18800001111'")
  await assert.rejects(async()=>sendLoginCode(req('18800001111',await proof()),transport),/上限/)
  assert.ok(!JSON.stringify((await f.db.query("SELECT details FROM audit_logs WHERE action='integration.configure'")).rows).includes('test-secret'))
  await f.db.query("INSERT INTO content(id,exam_id,kind,parent_id,title,status,payload) VALUES('captcha-course',$1,'course','a-t','验证课程','published',$2)",[f.exam,JSON.stringify({type:'article',downloadUrl:'https://example.com/handout.pdf',content:'课程'})])
  const detail=await f.call('/courses/captcha-course',200,f.student);assert.equal(detail.downloadUrl,undefined);assert.equal(detail.handoutDownloadPath,'/courses/captcha-course/handout')
  await f.call('/courses/captcha-course/handout',400,f.student)
  const courseProof=await proof('handout','course:captcha-course',f.student)
  const download=await fetch(f.origin+'/api/courses/captcha-course/handout',{headers:{Authorization:'Bearer '+f.student,'X-Captcha-Proof':courseProof}});assert.equal(download.status,200)
  const again=await fetch(f.origin+'/api/courses/captcha-course/handout',{headers:{Authorization:'Bearer '+f.student,'X-Captcha-Proof':courseProof}});assert.equal(again.status,400)
  await f.db.query("INSERT INTO media_assets(id,exam_id,content_id,owner_id,kind,source,filename,mime,external_url) VALUES('captcha-pdf',$1,'captcha-course',$2,'handout','external','讲义.pdf','application/pdf','https://example.com/handout.pdf')",[f.exam,f.admin.id])
  await f.db.query("UPDATE content SET payload=payload||'{\"handouts\":[{\"assetId\":\"captcha-pdf\",\"title\":\"讲义\"}]}'::jsonb WHERE id='captcha-course'")
  await f.call('/study-handouts/captcha-pdf/download',400,f.student);await call('/media/captcha-pdf/ticket',{},400,f.student)
  const mediaProof=await proof('handout','media:captcha-pdf',f.student)
  const media=await fetch(f.origin+'/api/study-handouts/captcha-pdf/download',{headers:{Authorization:'Bearer '+f.student,'X-Captcha-Proof':mediaProof}});assert.equal(media.status,200);assert.match((await media.json()).url,/media\/t\//)
  const {captchaVariants}=await import('../apps/shared/captcha.ts'),{newChallenge,verifyChallenge,captchaSchema,captchaAnswerSchema,migrateIntegrations}=await import('../apps/api/src/integrations.ts')
  assert.equal((await save('captcha',{...cap,variant:'unknown'})).status,400)
  assert.equal(captchaAnswerSchema.safeParse({angle:361}).success,false);assert.equal(captchaAnswerSchema.safeParse({points:[]}).success,false)
  for(const v of captchaVariants){
   const config=captchaSchema.parse({...cap,variant:v.id,appearance:'dark',color:'#ffffff'}),ch=await newChallenge('preview','test-binding',config)
   assert.equal(ch.variant,v.id);assert.equal(ch.type,v.type);assert.equal(ch.appearance,'dark')
   const answer=v.type==='rotate'?{angle:135}:v.type==='click'?{points:[{x:40,y:50},{x:100,y:120}]}:{x:180,y:20}
   // Challenge identity, not the subsequently changed global selection, chooses the verifier.
   await f.db.query("UPDATE integration_settings SET config=jsonb_set(config,'{variant}','\"rotate-default\"') WHERE key='captcha'")
   assert.ok((await verifyChallenge(ch.challengeId,'test-binding','preview',answer)).proof);assert.equal(checkedVariants.at(-1),v.id)
   await assert.rejects(()=>verifyChallenge(ch.challengeId,'test-binding','preview',answer),/失效/)
   const malformed=await newChallenge('preview','test-binding',config)
   await assert.rejects(()=>verifyChallenge(malformed.challengeId,'test-binding','preview',v.type==='rotate'?{x:180,y:20}:{angle:135}),/不匹配/)
  }
  await migrateIntegrations();assert.equal((await f.db.query('SELECT version FROM schema_versions WHERE version=24')).rows.length,1)
  await f.db.query("UPDATE platform_environment SET mode='production' WHERE id=1");assert.equal((await save('sms',{...sms,mode:'test'})).status,400)
 }finally{process.env.APP_MODE='test';await f.close();await new Promise<void>(r=>server.close(()=>r()))}
})
