import {test} from 'node:test'
import assert from 'node:assert/strict'
import {profileFixture} from './helpers/user-profile-fixture.ts'
import {hash} from '../apps/api/src/security.ts'
const doc=(text:string)=>({type:'doc',content:[{type:'paragraph',content:[{type:'text',text}]}]})
test('site settings publish, immutable protocols, consent challenges, resources and exam search',async t=>{
 const f=await profileFixture()
 const req=async(path:string,method='GET',body?:any,auth=f.token)=>{const r=await fetch(f.origin+'/api'+path,{method,headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+auth}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json() as any}}
 const settings=async()=>{const r=await req('/admin/site-settings');assert.equal(r.status,200);return r.data}
 const publish=async(kind:string,text:string)=>{let p=(await settings()).protocols.find((p:any)=>p.kind===kind);assert.equal((await req('/admin/site-settings/protocols/'+kind,'PUT',{revision:p.draft_revision,document:doc(text)})).status,200);p=(await settings()).protocols.find((p:any)=>p.kind===kind);const r=await req('/admin/site-settings/protocols/'+kind+'/publish','POST',{revision:p.draft_revision});assert.equal(r.status,200);return r.data.version}
 const login=async(phone:string)=>{await f.db.query("INSERT INTO login_codes(phone,code_hash,expires_at) VALUES($1,$2,now()+interval '5 minutes') ON CONFLICT(phone) DO UPDATE SET code_hash=$2,expires_at=now()+interval '5 minutes',attempts=0",[phone,hash(phone+'1234')]);return req('/auth/phone','POST',{phone,code:'1234'},'')}
 const confirm=(challenge:any,extra={})=>req('/auth/protocol-consent','POST',{challenge:challenge.challenge,confirmed:true,versions:challenge.protocols.map((p:any)=>({kind:p.kind,version:p.version})),...extra},'')
 let imageId=''
 try{
  await t.test('public settings expose published values only; administrator drafts use optimistic concurrency',async()=>{
   assert.equal((await req('/admin/site-settings','GET',undefined,f.student)).status,403)
   const p=(await settings()).preferences.find((p:any)=>p.key==='basic')
   const value={...p.draft,name:'配置测试平台'}
   assert.equal((await req('/admin/site-settings/preferences/basic','PUT',{revision:p.revision,value})).status,200)
   assert.equal((await req('/admin/site-settings/preferences/basic','PUT',{revision:p.revision,value})).status,409)
   assert.equal((await req('/site-settings','GET',undefined,'')).data.basic.name,'上行宝')
   assert.equal((await req('/admin/site-settings/preferences/basic/publish','POST',{revision:p.revision+1})).status,200)
   const live=(await req('/site-settings','GET',undefined,'')).data;assert.equal(live.basic.name,'配置测试平台');assert(!JSON.stringify(live).includes('draft_revision'))
  })
  await t.test('image registration and historical protocol references prevent cleanup',async()=>{
   const form=new FormData();form.append('file',new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=','base64')]),'协议图片.png')
   const upload=await fetch(f.origin+'/api/admin/media/upload?kind=image&contentId=site-protocol-agreement',{method:'POST',headers:{Authorization:'Bearer '+f.token},body:form});assert.equal(upload.status,200);imageId=(await upload.json() as any).id
   let p=(await settings()).protocols.find((p:any)=>p.kind==='agreement')
   const document:any=doc('用户服务协议图文版');document.content.push({type:'image',attrs:{src:'/api/message-images/'+imageId,alt:'协议图片'}})
   assert.equal((await req('/admin/site-settings/protocols/agreement','PUT',{revision:p.draft_revision,document})).status,200)
   p=(await settings()).protocols.find((p:any)=>p.kind==='agreement')
   assert.equal((await req('/admin/site-settings/protocols/agreement/publish','POST',{revision:p.draft_revision})).data.version,2)
   await publish('agreement','不再使用图片的协议')
   const asset=(await req('/admin/resources/'+imageId)).data;assert.equal(asset.inUse,true);assert(asset.references.some((r:any)=>r.kind==='site-settings'&&r.location==='协议历史版本 V2'));assert.equal(asset.filename,'协议图片.png');assert(asset.createdAt);assert(asset.size>0)
   assert.equal((await req('/admin/resources/'+imageId,'DELETE',{})).status,409)
   const preview=(await req('/admin/resources/'+imageId+'/preview','POST',{})).data;assert.equal((await fetch(f.origin+preview.url)).status,200)
   const versions=(await req('/admin/site-settings/protocols/agreement/versions')).data;assert.equal(versions.length,3);assert(JSON.stringify(versions.find((v:any)=>v.version===2)).includes(imageId))
  })
  await t.test('first login needs explicit current-version confirmation, and repeat login skips it',async()=>{
   const phone='18800001234',challenge=(await login(phone)).data;assert.equal(challenge.consentRequired,true);assert.equal(challenge.token,undefined)
   assert.equal((await f.db.query('SELECT 1 FROM users WHERE phone=$1',[phone])).rows.length,0)
   assert.equal((await confirm(challenge,{confirmed:false})).status,400)
   const accepted=await confirm(challenge);assert.equal(accepted.status,200);assert(accepted.data.token)
   assert.equal((await confirm(challenge)).status,400)
   const rows=(await f.db.query('SELECT * FROM user_protocol_consents WHERE user_id=$1',[accepted.data.user.id])).rows;assert.equal(rows.length,2);assert(rows.every(r=>r.accepted_at))
   const again=(await login(phone)).data;assert(again.token);assert.equal(again.consentRequired,undefined)
  })
  await t.test('publication during confirmation rejects stale versions; old consent history survives',async()=>{
   await publish('privacy','隐私政策第二版')
   const challenge=(await login('18800001234')).data;assert.deepEqual(challenge.changedKinds,['privacy'])
   await publish('privacy','隐私政策第三版')
   assert.equal((await confirm(challenge)).status,409)
   challenge.protocols=(await req('/site-settings','GET',undefined,'')).data.protocols
   const result=await confirm(challenge);assert.equal(result.status,200)
   assert.equal((await f.db.query('SELECT count(*)::int AS n FROM user_protocol_consents WHERE user_id=$1',[result.data.user.id])).rows[0].n,3)
   const p=(await settings()).protocols.find((p:any)=>p.kind==='privacy')
   assert.equal((await req('/admin/site-settings/protocols/privacy/publish','POST',{revision:p.draft_revision})).status,400)
   assert.equal((await req('/admin/site-settings/protocols/privacy','PUT',{revision:p.draft_revision-1,document:doc('stale')})).status,409)
  })
  await t.test('expired and disabled-account challenges cannot issue sessions',async()=>{
   const challenge=(await login('18800004321')).data
   await f.db.query('UPDATE protocol_login_challenges SET expires_at=now()-interval \'1 minute\' WHERE token_hash=$1',[hash(challenge.challenge)])
   assert.equal((await confirm(challenge)).status,400)
   const challenge2=(await login('18700001111')).data
   await f.db.query('UPDATE users SET enabled=false WHERE id=$1',[f.uid])
   assert.equal((await confirm(challenge2)).status,403)
   await f.db.query('UPDATE users SET enabled=true WHERE id=$1',[f.uid])
  })
  await t.test('search scopes exams, ancestors, publication, course parent kind, FAQ scope and pagination',async()=>{
   await f.db.query("UPDATE content SET title='精确测试词' WHERE id='a-k'")
   for(const [id,kind,parent,status,scope,exams] of [['search-course','course','a-t','published',null,[]],['search-support','course','a-k','published',null,[]],['search-draft','knowledge','a-t','draft',null,[]],['search-faq','faq',null,'published','all',[]],['search-scoped-faq','faq',null,'published','exams',[f.exam]],['search-foreign-faq','faq',null,'published','exams',[f.second]],['search-off-faq','faq',null,'offline','all',[]]] as const){await f.db.query('INSERT INTO content(id,exam_id,kind,parent_id,title,status,payload) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,kind==='faq'?null:f.exam,kind,parent,'精确测试词 '+id,status,JSON.stringify({type:'article',content:'私有正文不可回传',article:{scope,examIds:exams}})])}
   await f.db.query("UPDATE content SET title='精确测试词 其他考试' WHERE id='b-k'")
   const query='/search?'+new URLSearchParams({examId:f.exam,q:'精确测试词'})
   const r=await req(query,'GET',undefined,'');assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.total,4);assert.equal(r.data.items[0].id,'a-k');assert(!JSON.stringify(r.data).includes('私有正文'));assert(r.data.items.find((x:any)=>x.id==='a-k').path.length===4)
   assert.equal((await req(query+'&type=course','GET',undefined,'')).data.total,1)
   await f.db.query("UPDATE content SET status='offline' WHERE id='a-c'")
   assert.equal((await req(query,'GET',undefined,'')).data.total,2)
   await f.db.query("UPDATE content SET status='published' WHERE id='a-c'")
   for(let i=0;i<23;i++)await f.db.query("INSERT INTO content(id,exam_id,kind,parent_id,title,status,payload) VALUES($1,$2,'knowledge','a-t',$3,'published','{}')",['page-'+i,f.exam,'分页词 '+i])
   const paged='/search?'+new URLSearchParams({examId:f.exam,q:'分页词'})
   assert.equal((await req(paged,'GET',undefined,'')).data.items.length,20);assert.equal((await req(paged+'&page=2','GET',undefined,'')).data.items.length,3)
   assert.equal((await req('/search?'+new URLSearchParams({examId:f.exam,q:'%_\''}),'GET',undefined,'')).data.total,0)
   const p=(await settings()).preferences.find((p:any)=>p.key==='search')
   await req('/admin/site-settings/preferences/search','PUT',{revision:p.revision,value:{...p.draft,enabled:false}});await req('/admin/site-settings/preferences/search/publish','POST',{revision:p.revision+1})
   assert.equal((await req(query,'GET',undefined,'')).data.disabled,true)
  })
  await t.test('migration is idempotent',async()=>{const {migrateSiteSettings}=await import('../apps/api/src/site-settings.ts');await migrateSiteSettings();assert.equal((await settings()).protocols.find((p:any)=>p.kind==='privacy').published_version,3)})
 }finally{await f.close()}
})
