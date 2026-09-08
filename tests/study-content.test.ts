import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readdir } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import express from 'express'
import { ZodError } from 'zod'

test('rich content, exam permissions and protected media',async t=>{
  process.env.APP_MODE='test';process.env.DATABASE_URL=''
  process.env.LOCAL_DATABASE_DIR=await mkdtemp(join(tmpdir(),'sxb-content-'))
  process.env.MEDIA_DIR=join(await mkdtemp(join(tmpdir(),'sxb-media-')),'.local','media')
  process.env.SECRET_KEY='4'.repeat(64)
  process.env.ADMIN_PHONE='18600513966';process.env.ADMIN_PASSWORD='Content-Test-1234!'
  const {db,closeDatabase}=await import('../apps/api/src/db.ts')
  const {seed}=await import('../apps/api/src/seed.ts')
  const {api}=await import('../apps/api/src/routes.ts')
  const {initSecrets,session,id}=await import('../apps/api/src/security.ts')
  const {inspectDocument,renderText}=await import('../apps/api/src/rich-document.ts')
  const {externalUrl,availability}=await import('../apps/api/src/study-content.ts')
  await initSecrets();await seed()
  const adminId=(await db.query("SELECT id FROM users WHERE account_kind='admin' LIMIT 1")).rows[0].id
  const admin=await session(adminId,'admin'),student=await session('test-student-003')
  await db.query("DELETE FROM memberships WHERE user_id='test-student-003'")
  const app=express();app.use(express.json());app.use('/api',api);app.use((e:any,_q:any,r:any,_n:any)=>r.status(e instanceof ZodError?400:e.status||500).json({message:e.message}))
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r))
  const base=`http://127.0.0.1:${(server.address() as any).port}/api`
  async function req(path:string,method='GET',body?:any,auth=student){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(auth?{Authorization:`Bearer ${auth}`}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json() as any}}
  const exam='junior-social-worker',point='kp-1-1-1',sheet='study-test-sheet'
  const paragraph={type:'paragraph',content:[{type:'text',text:'测试正文 <script>alert(1)</script>',marks:[{type:'bold'}]}]}
  const resource=(assetId:string,kind:string)=>({type:'resource',attrs:{assetId,kind,title:'测试资源',posterAssetId:null}})
  let audioId='',imageId='',handoutId='',issued=''
  async function external(kind:string,contentId:string){const r=await req('/admin/media/external','POST',{examId:exam,contentId,kind,url:'https://example.com/test',filename:'测试资源'},admin);assert.equal(r.status,200);return r.data.id}
  async function save(row:any){return req('/admin/content/'+row.id,'PUT',row,admin)}
  const current=async(contentId:string)=>(await db.query('SELECT * FROM content WHERE id=$1',[contentId])).rows[0]
  try {
    await t.test('document whitelist, safe text and external addresses',()=>{
      const doc={type:'doc',content:[paragraph]};assert(inspectDocument(doc).text.includes('<script>'));assert(!renderText(paragraph).includes('<script>'))
      for(const bad of [{type:'doc',content:[{type:'iframe'}]},{type:'doc',content:[{type:'paragraph',attrs:{onclick:'x'}}]},{type:'doc',content:[{type:'text',text:'x',marks:[{type:'link',attrs:{href:'javascript:alert(1)'}}]}]}])assert.throws(()=>inspectDocument(bad))
      for(const url of ['http://example.com/x','https://localhost/x','https://127.0.0.1/x','https://[::1]/','https://user:pass@example.com/','file:///x'])assert.throws(()=>externalUrl(url))
      assert.equal(externalUrl('https://example.com/file.pdf'),'https://example.com/file.pdf')
    })
    await t.test('admin-only uploads, real file signature, range and no public directory',async()=>{
      assert.equal((await req('/admin/media/external','POST',{},student)).status,403)
      const upload=async(content:Buffer,filename:string,kind:string)=>{const form=new FormData();form.append('file',new Blob([new Uint8Array(content)]),filename);const r=await fetch(`${base}/admin/media/upload?${new URLSearchParams({examId:exam,contentId:point,kind})}`,{method:'POST',headers:{Authorization:`Bearer ${admin}`},body:form});return {status:r.status,data:await r.json() as any}}
      assert.equal((await upload(Buffer.from('<svg onload="x"/>'),'fake.png','image')).status,400)
      const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=','base64')
      const r=await upload(png,'test.png','image');assert.equal(r.status,200);imageId=r.data.id
      const ticket=await req(`/admin/media/${imageId}/ticket`,'POST',{},admin);assert.equal(ticket.status,200)
      const range=await fetch(base.replace('/api','')+ticket.data.url,{headers:{Range:'bytes=0-7'}});assert.equal(range.status,206);assert.equal((await range.arrayBuffer()).byteLength,8)
      assert.equal((await fetch(base+'/media/image/'+imageId)).status,404)
    })
    await t.test('single knowledge document, explicit course flag, no protected URL leakage',async()=>{
      audioId=await external('audio',point)
      const row=await current(point);row.payload={...row.payload,isKnowledgeCourse:false,document:{type:'doc',content:[paragraph,resource(imageId,'image'),resource(audioId,'audio')]}}
      assert.equal((await save(row)).status,200)
      const publicResult=await req(`/knowledge-content/${point}`,'GET',undefined,'');assert.equal(publicResult.status,200);assert.equal(publicResult.data.isKnowledgeCourse,false)
      assert.equal(publicResult.data.blocks.find((b:any)=>b.kind==='audio').locked,true)
      assert(!JSON.stringify(publicResult.data).includes('https://example.com'))
      const catalog=await req('/catalog/'+exam);assert(!JSON.stringify(catalog.data).includes('assetId'))
      assert.equal((await req(`/media/${audioId}/ticket`,'POST',{})).status,403)
      const another=await external('audio','different-content');const invalid=await current(point);invalid.payload.document.content.push(resource(another,'audio'));assert.equal((await save(invalid)).status,400)
      const valid=await current(point);valid.payload.isKnowledgeCourse=true;assert.equal((await save(valid)).status,200);assert.equal((await req(`/knowledge-content/${point}`)).data.isKnowledgeCourse,true)
    })
    await t.test('independent knowledge handouts, legacy extraction and private download library',async()=>{
      const pdf=Buffer.from('%PDF-1.4\n% local test handout\n%%EOF')
      const form=new FormData();form.append('file',new Blob([pdf],{type:'application/pdf'}),'test-handout.pdf')
      const uploadResponse=await fetch(`${base}/admin/media/upload?${new URLSearchParams({examId:exam,contentId:point,kind:'handout'})}`,{method:'POST',headers:{Authorization:`Bearer ${admin}`},body:form})
      assert.equal(uploadResponse.status,200);const assetId=(await uploadResponse.json() as any).id
      const row=await current(point);row.payload.document.content.push(resource(assetId,'handout'))
      // Existing inline attachments continue to work before the next edit/save.
      await db.query('UPDATE content SET payload=$2 WHERE id=$1',[point,JSON.stringify(row.payload)])
      const legacy=(await req(`/knowledge-content/${point}`,'GET',undefined,'')).data
      assert.equal(legacy.blocks.some((b:any)=>b.kind==='handout'),false);assert.equal(legacy.handouts[0].assetId,assetId)
      assert.equal((await save(row)).status,200)
      const stored=await current(point);assert.equal(stored.payload.handouts[0].assetId,assetId)
      assert.equal(stored.payload.document.content.some((n:any)=>n.attrs?.kind==='handout'),false)
      const cross=await external('handout','foreign-point');const bad=structuredClone(stored);bad.payload.handouts=[{assetId:cross,title:'外部讲义'}];assert.equal((await save(bad)).status,400)
      const wrongKind=structuredClone(stored);wrongKind.payload.handouts=[{assetId:imageId,title:'图片不能当讲义'}];assert.equal((await save(wrongKind)).status,400)
      const duplicate=structuredClone(stored);duplicate.payload.handouts.push(duplicate.payload.handouts[0]);assert.equal((await save(duplicate)).status,400)
      const second=await external('handout',point)
      const two=structuredClone(stored);two.payload.handouts.push({assetId:second,title:'第二份讲义'});assert.equal((await save(two)).status,400)
      const inlineSecond=structuredClone(stored);inlineSecond.payload.document.content.push(resource(second,'handout'));assert.equal((await save(inlineSecond)).status,400)
      assert.equal((await current(point)).payload.handouts.length,1)
      assert.equal((await req(`/study-handouts/${assetId}/download`)).status,403)
      assert.equal((await req('/handout-library/'+exam)).data.length,0)
      const vip=await session('test-student-002')
      assert.equal((await req('/rights/'+exam,'GET',undefined,vip)).data.level,'vip')
      const result=await req(`/study-handouts/${assetId}/download`,'GET',undefined,vip);assert.equal(result.status,200)
      const download=await fetch(base.replace('/api','')+result.data.url);assert.equal(download.status,200);assert.match(download.headers.get('content-disposition')||'',/attachment/);assert.deepEqual(Buffer.from(await download.arrayBuffer()),pdf)
      await req(`/study-handouts/${assetId}/download`,'GET',undefined,vip)
      const library=(await req('/handout-library/'+exam,'GET',undefined,vip)).data
      const mine=library.filter((r:any)=>r.id===assetId);assert.equal(mine.length,1);assert.equal(mine[0].fileType,'PDF');assert.equal(mine[0].systemState,'active')
      assert.equal((await req('/handout-library/'+exam)).data.some((r:any)=>r.id===assetId),false)
      assert.equal((await req('/handout-library/mid-social-worker','GET',undefined,vip)).data.some((r:any)=>r.id===assetId),false)
      const removed=await current(point);removed.payload.handouts=[];assert.equal((await save(removed)).status,200)
      assert.equal((await req(`/study-handouts/${assetId}/download`,'GET',undefined,vip)).status,404)
      assert.equal((await fetch(base.replace('/api','')+result.data.url)).status,404)
      assert.equal((await req('/handout-library/'+exam,'GET',undefined,vip)).data.find((r:any)=>r.id===assetId).systemState,'removed')
    })
    await t.test('streamed upload above 200MB is rejected and temporary file removed',async()=>{
      const before=await readdir(process.env.MEDIA_DIR!)
      const boundary='sxb-test-upload-boundary'
      const chunk=Buffer.alloc(64*1024)
      async function* body(){
        yield Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="oversize.mp4"\r\nContent-Type: video/mp4\r\n\r\n`)
        for(let i=0;i<3200;i++)yield chunk
        yield Buffer.from('x')
        yield Buffer.from(`\r\n--${boundary}--\r\n`)
      }
      const r=await fetch(`${base}/admin/media/upload?${new URLSearchParams({examId:exam,contentId:point,kind:'video'})}`,{method:'POST',headers:{Authorization:`Bearer ${admin}`,'Content-Type':`multipart/form-data; boundary=${boundary}`},body:Readable.from(body()),duplex:'half'} as any)
      assert.equal(r.status,413)
      assert.match((await r.json() as any).message,/200MB/)
      assert.deepEqual((await readdir(process.env.MEDIA_DIR!)).sort(),before.sort())
    })
    await t.test('per-exam policy versioning, auditing and immediate playback revocation',async()=>{
      const path='/admin/permission-policies/'+exam
      assert.equal((await req(path)).status,403)
      const data=(await req(path,'GET',undefined,admin)).data
      const policy=data.policies.find((p:any)=>p.level==='free');policy.permissions['knowledge.audio.play']=true
      const b={...policy,reason:'测试临时开放音频'};delete b.level
      assert.equal((await req(path+'/free','PUT',b,admin)).status,200)
      assert.equal((await req(path+'/free','PUT',b,admin)).status,409)
      assert.equal((await req('/rights/'+exam)).data.permissions['knowledge.audio.play'],true)
      assert((await req('/rights/'+exam)).data.permissionLabels.includes('知识点音频播放'))
      assert.equal((await req('/rights/mid-social-worker')).data.permissions['knowledge.audio.play'],false)
      const ticket=await req(`/media/${audioId}/ticket`,'POST',{});assert.equal(ticket.status,200);issued=ticket.data.url
      assert.equal((await fetch(base.replace('/api','')+issued,{redirect:'manual'})).status,302)
      b.version=1;b.permissions['knowledge.audio.play']=false
      assert.equal((await req(path+'/free','PUT',b,admin)).status,200)
      assert.equal((await fetch(base.replace('/api','')+issued,{redirect:'manual'})).status,403)
      assert(!(await req('/rights/'+exam)).data.permissionLabels.includes('知识点音频播放'))
      b.version=2;b.permissions['knowledge.text.read']=false;assert.equal((await req(path+'/free','PUT',b,admin)).status,400)
      assert.equal((await db.query("SELECT count(*)::int AS n FROM audit_logs WHERE action='permissions.update'")).rows[0].n,2)
    })
    await t.test('cheatsheet publication, window, locked preview and attachment access',async()=>{
      handoutId=await external('handout',sheet)
      const row={id:sheet,exam_id:exam,kind:'cheatsheet',parent_id:null,title:'【测试内容】考前小抄',status:'review',payload:{intro:'测试简介',opensAt:new Date(Date.now()-60_000).toISOString(),closesAt:new Date(Date.now()+3600_000).toISOString(),document:{type:'doc',content:[paragraph,resource(handoutId,'handout')]}},source:'test',is_test_data:true}
      assert.equal((await save({...row,status:'published'})).status,400)
      assert.equal((await save(row)).status,200);assert.equal((await save({...await current(sheet),status:'published'})).status,200)
      const list=await req('/cheatsheets/'+exam,'GET',undefined,'');assert.equal(list.data[0].state,'open');assert(!JSON.stringify(list.data).includes('测试正文'))
      assert.equal((await req('/cheatsheet/'+sheet)).data.blocks.length,0);assert.equal((await req(`/media/${handoutId}/ticket`,'POST',{})).status,403)
      const policy=(await req('/admin/permission-policies/'+exam,'GET',undefined,admin)).data.policies.find((p:any)=>p.level==='free');policy.permissions['cheatsheet.read']=true;policy.permissions['cheatsheet.handout.download']=true
      assert.equal((await req(`/admin/permission-policies/${exam}/free`,'PUT',{version:policy.version,permissions:policy.permissions,reason:'测试小抄授权'},admin)).status,200)
      assert.equal((await req('/cheatsheet/'+sheet)).data.locked,false)
      const ticket=await req(`/media/${handoutId}/ticket`,'POST',{});assert.equal(ticket.status,200);issued=ticket.data.url
      const updated=await current(sheet);updated.payload.closesAt=new Date(Date.now()-1000).toISOString();assert.equal((await save(updated)).status,200)
      assert.equal((await req('/cheatsheet/'+sheet)).data.locked,true)
      assert.equal((await fetch(base.replace('/api','')+issued,{redirect:'manual'})).status,403)
      assert.equal(availability({payload:{opensAt:'2030-01-01',closesAt:'2030-02-01'}},Date.parse('2029-01-01')),'upcoming')
    })
    await t.test('opening notice is explicit, once per user, independent from rest and reminder preference',async()=>{
      const row=await current(sheet);row.payload.closesAt=new Date(Date.now()+3600_000).toISOString();await save(row)
      await req('/learning-plan/'+exam,'PUT',{subjectIds:['ability'],chapterIds:['ability-chapter-1'],restWeekdays:[0,6],skipDates:[],round:'coverage',includeCheatSheets:false})
      const path='/content-notices/'+exam
      assert((await req(path)).data.some((n:any)=>n.id===sheet));assert((await req(path)).data.some((n:any)=>n.id===sheet))
      assert.equal((await req(`/content-notices/${sheet}/seen`,'POST',{})).status,200)
      assert(!(await req(path)).data.some((n:any)=>n.id===sheet))
      const other=await session('test-student-002');assert((await req(path,'GET',undefined,other)).data.some((n:any)=>n.id===sheet))
    })
    await t.test('logout and unpublication revoke issued tickets',async()=>{
      const ticket=await req(`/media/${handoutId}/ticket`,'POST',{});assert.equal(ticket.status,200)
      await req('/auth/logout','POST',{})
      assert.equal((await fetch(base.replace('/api','')+ticket.data.url,{redirect:'manual'})).status,401)
      await db.query("UPDATE content SET status='offline' WHERE id=$1",[point]);assert.equal((await req('/knowledge-content/'+point,'GET',undefined,'')).status,404);assert.equal((await fetch(base+'/media/image/'+imageId)).status,404)
    })
  }finally{await new Promise<void>(r=>server.close(()=>r()));await closeDatabase()}
})
