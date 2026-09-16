import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import express from 'express'
import { ZodError } from 'zod'

test('FAQ articles: category, exam scope, immutable creation, publication, registered images and deletion',async()=>{
 process.env.APP_MODE='test';process.env.DATABASE_URL='';process.env.LOCAL_DATABASE_DIR=await mkdtemp(join(tmpdir(),'sxb-articles-'));process.env.MEDIA_DIR=await mkdtemp(join(tmpdir(),'sxb-articles-media-'));process.env.SECRET_KEY='e'.repeat(64);process.env.ADMIN_PHONE='18600000000';process.env.ADMIN_PASSWORD='Articles-Tests-42!'
 const {db,closeDatabase}=await import('../apps/api/src/db.ts'),{seed}=await import('../apps/api/src/seed.ts'),{initSecrets,session}=await import('../apps/api/src/security.ts'),{api}=await import('../apps/api/src/routes.ts')
 await initSecrets();await seed()
 const admin=(await db.query("SELECT id,nickname FROM users WHERE account_kind='admin' LIMIT 1")).rows[0],token=await session(admin.id,'admin'),student=await session('test-student-001')
 const app=express();app.use(express.json({limit:'40mb'}));app.use('/api',api);app.use((e:any,_q:any,r:any,_n:any)=>r.status(e instanceof ZodError?400:e.status||500).json({message:e.message}))
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const origin='http://127.0.0.1:'+(server.address() as any).port
 async function call(path:string,body?:any,method='GET',status=200,auth=token){const r=await fetch(origin+'/api'+path,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+auth},body:body===undefined?undefined:JSON.stringify(body)});const d:any=await r.json();assert.equal(r.status,status,JSON.stringify(d));return d}
 const doc={type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'图文内容与学习说明'}]}]},base={title:'全站常见问题',category:'faq',scope:'all',examIds:[],status:'published',document:doc},exam='junior-social-worker',other='mid-social-worker'
 try{
  await call('/admin/articles',undefined,'GET',403,student)
  await call('/admin/articles/invalid',{...base,category:''},'PUT',400)
  await call('/admin/articles/invalid',{...base,scope:'exams'},'PUT',400)
  await call('/admin/articles/invalid',{...base,examIds:[exam]},'PUT',400)
  await call('/admin/articles/invalid',{...base,scope:'exams',examIds:['missing']},'PUT',400)
  await call('/admin/articles/invalid',{...base,document:{type:'doc',content:[]}},'PUT',400)
  await call('/admin/articles/all',base,'PUT')
  await call('/admin/articles/multi',{...base,title:'两个考试常见问题',scope:'exams',examIds:[exam,other]},'PUT')
  await call('/admin/articles/single',{...base,title:'中级专属问题',scope:'exams',examIds:[other]},'PUT')
  await call('/admin/articles/offline',{...base,title:'尚未上架',status:'offline'},'PUT')
  const ids=(rows:any[])=>rows.map(r=>r.id)
  const first=await call('/admin/articles/all');assert.equal(first.creator_name,admin.nickname);assert.equal(first.payload.article.creatorId,admin.id)
  const publicRows=await call('/faqs/'+exam);assert(ids(publicRows).includes('all'));assert(ids(publicRows).includes('multi'));assert(!ids(publicRows).includes('single'));assert(!ids(publicRows).includes('offline'));assert(!JSON.stringify(publicRows).includes('creatorId'))
  assert.deepEqual(ids((await call('/catalog/'+exam)).faqs),ids(publicRows))
  const ordered=await call('/admin/articles');assert(ids(ordered.items).indexOf('multi')<ids(ordered.items).indexOf('all'))
  await call('/admin/articles/all',{...base,title:'编辑老文章不改变排序',version:1},'PUT')
  const edited=await call('/admin/articles/all');assert.equal(edited.created_at,first.created_at);assert.equal(edited.payload.article.creatorId,admin.id)
  assert(ids((await call('/admin/articles')).items).indexOf('multi')<ids((await call('/admin/articles')).items).indexOf('all'))
  await call('/admin/articles/all',{...base,version:1},'PUT',409)
  await call('/admin/articles/all',{...base,version:2,creatorId:'fake'},'PUT',400)
  const legacy=await call('/admin/articles/faq-1');assert.equal(legacy.scope,'all');assert.equal(legacy.creator_name,'未记录')
  await db.query("INSERT INTO content(id,exam_id,kind,title,status,payload) VALUES('legacy-exam',$1,'faq','旧单考试文章','published','{\"content\":\"旧正文\"}')",[other])
  assert(!ids(await call('/faqs/'+exam)).includes('legacy-exam'));assert(ids(await call('/faqs/'+other)).includes('legacy-exam'))
  await call('/admin/articles/legacy-exam',{...base,scope:'exams',examIds:[exam],version:1},'PUT')
  assert(ids(await call('/faqs/'+exam)).includes('legacy-exam'));assert(!ids(await call('/faqs/'+other)).includes('legacy-exam'))
  assert.equal((await call('/admin/articles/legacy-exam')).creator_name,'未记录')
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=','base64'),upload=new FormData();upload.append('file',new Blob([png]),'文章插图.png')
  const uploaded=await fetch(origin+'/api/admin/media/upload?contentId=illustrated&kind=image',{method:'POST',headers:{Authorization:'Bearer '+token},body:upload});assert.equal(uploaded.status,200);const asset:any=await uploaded.json()
  const document={...doc,content:[...doc.content,{type:'image',attrs:{src:'/api/message-images/'+asset.id,alt:'说明图片'}}]}
  await call('/admin/articles/illustrated',{...base,document},'PUT')
  const used=await call('/admin/resources/'+asset.id);assert(used.inUse);assert(used.references.some((r:any)=>r.id==='illustrated'&&r.kind==='faq'));assert.equal(used.filename,'文章插图.png')
  await call('/admin/resources/'+asset.id,{},'DELETE',409)
  assert.equal((await call('/admin/resources/location?kind=faq&id=illustrated')).id,'illustrated')
  assert((await call('/faqs/'+exam)).find((r:any)=>r.id==='illustrated').contentHtml.includes('/api/message-images/'+asset.id))
  await call('/admin/articles/illustrated/status',{version:1,status:'offline'},'PATCH');assert(!ids(await call('/faqs/'+exam)).includes('illustrated'));assert((await call('/admin/resources/'+asset.id)).inUse)
  await call('/admin/articles/illustrated/status',{version:2,status:'published'},'PATCH');assert(ids(await call('/faqs/'+exam)).includes('illustrated'))
  await call('/admin/articles/illustrated',{version:2},'DELETE',409)
  await call('/admin/articles/illustrated',{version:3},'DELETE');assert(!ids(await call('/faqs/'+exam)).includes('illustrated'));assert(!ids((await call('/admin/articles')).items).includes('illustrated'))
  await call('/admin/articles/illustrated/status',{version:4,status:'published'},'PATCH',404)
  await call('/admin/articles/illustrated',{...base,version:4},'PUT',404)
  assert.equal((await call('/admin/resources/'+asset.id)).inUse,false)
  await call('/admin/resources/'+asset.id,{},'DELETE')
  await call('/admin/articles/bad-image',{...base,document},'PUT',400)
  const row=await call('/admin/articles/all')
  await call('/admin/content/all',{id:row.id,kind:'faq',exam_id:null,parent_id:null,title:row.title,status:'published',payload:{content:'bypass'},source:'manual',is_test_data:false,version:row.version},'PUT',400)
  for(let i=0;i<21;i++)await call('/admin/articles/paging-'+i,{...base,title:'分页检验'+i,status:'offline'},'PUT')
  assert.equal((await call('/admin/articles?title='+encodeURIComponent('分页检验'))).items.length,20);assert.equal((await call('/admin/articles?title='+encodeURIComponent('分页检验')+'&page=2')).items.length,1)
  assert((await call('/admin/articles?examId='+other)).items.every((r:any)=>r.exam_ids.includes(other)))
  assert((await call('/admin/articles?examId=all')).items.every((r:any)=>r.scope==='all'))
  assert((await call('/admin/articles?status=published')).items.every((r:any)=>r.status==='published'))
 }finally{await new Promise<void>(r=>server.close(()=>r()));await closeDatabase()}
})
