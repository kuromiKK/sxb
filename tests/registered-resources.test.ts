import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import express from 'express'
import { ZodError } from 'zod'

test('registered covers, immutable historical images and cleanup protection', async () => {
  process.env.APP_MODE='test';process.env.DATABASE_URL=''
  process.env.LOCAL_DATABASE_DIR=await mkdtemp(join(tmpdir(),'sxb-registered-db-'))
  process.env.MEDIA_DIR=await mkdtemp(join(tmpdir(),'sxb-registered-files-'))
  process.env.SECRET_KEY='d'.repeat(64);process.env.ADMIN_PHONE='18600000000';process.env.ADMIN_PASSWORD='Registered-Tests-42!'
  const {db,closeDatabase}=await import('../apps/api/src/db.ts')
  const {seed}=await import('../apps/api/src/seed.ts')
  const {initSecrets,session}=await import('../apps/api/src/security.ts')
  const {api}=await import('../apps/api/src/routes.ts')
  const {migrateRegisteredImages}=await import('../apps/api/src/registered-images.ts')
  await initSecrets();await seed()
  const owner=(await db.query("SELECT id FROM users WHERE account_kind='admin' LIMIT 1")).rows[0]
  const token=await session(owner.id,'admin')
  const app=express();app.use(express.json({limit:'40mb'}));app.use('/api',api)
  app.use((e:any,_q:any,r:any,_n:any)=>r.status(e instanceof ZodError?400:e.status||500).json({message:e.message}))
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r))
  const origin='http://127.0.0.1:'+(server.address() as any).port
  const headers={Authorization:'Bearer '+token}
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=','base64')
  async function call(path:string,body?:any,method='GET',expected=200){
    const response=await fetch(origin+'/api'+path,{method,headers:{...headers,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)})
    const data:any=await response.json();assert.equal(response.status,expected,JSON.stringify(data));return data
  }
  async function upload(filename:string,bytes=png,expected=200){
    const form=new FormData();form.append('file',new Blob([bytes]),filename)
    const response=await fetch(origin+'/api/admin/media/upload?contentId=registered-product&kind=image',{method:'POST',headers,body:form})
    assert.equal(response.status,expected);return await response.json() as any
  }
  try {
    const uploaded=await upload('商品原始头图.png')
    const resource=await call('/admin/resources/'+uploaded.id)
    assert.equal(resource.filename,'商品原始头图.png');assert.equal(resource.size,png.length)
    assert(resource.createdAt);assert.equal(resource.storage,'file');assert.equal(resource.inUse,false)
    const url='/api/message-images/'+uploaded.id
    const preview=await fetch(origin+url);assert.equal(preview.status,200)
    assert.deepEqual(Buffer.from(await preview.arrayBuffer()),png)
    await upload('伪装图片.png',Buffer.from('not an image'),400)
    const exam='junior-social-worker',cycle=(await db.query('SELECT id FROM exam_cycles WHERE exam_id=$1 ORDER BY year DESC LIMIT 1',[exam])).rows[0]
    const config={title:'登记回归商品',frontendTitle:'学习套餐',type:'entitlement',examId:exam,cycleId:cycle.id,level:'vip',priceCents:2990,status:'draft',coverUrl:url}
    await call('/admin/products/registered-product',{version:0,config},'PUT')
    let used=await call('/admin/resources/'+uploaded.id)
    assert(used.references.some((r:any)=>r.location==='商品头图'))
    assert(used.references.some((r:any)=>r.location==='商品历史版本 V1 · 头图'))
    await call('/admin/resources/'+uploaded.id,{},'DELETE',409)
    await call('/admin/products/registered-product',{version:1,config:{...config,coverUrl:''}},'PUT')
    used=await call('/admin/resources/'+uploaded.id)
    assert(!used.references.some((r:any)=>r.location==='商品头图'));assert(used.inUse)
    await call('/admin/resources/'+uploaded.id,{},'DELETE',409)
    const cancelled=await upload('未保存的封面.png')
    await call('/admin/resources/'+cancelled.id,{},'DELETE')
    await call('/admin/products/registered-product',{version:2,config:{...config,coverUrl:'/api/message-images/'+cancelled.id}},'PUT',400)
    await call('/admin/exam-management/categories/registered-category',{name:'分类',sortOrder:0,enabled:true,coverUrl:'/api/message-images/'+cancelled.id},'PUT',400)
    // Simulate a v18 database, where covers and snapshots still contained data URLs.
    const dataUrl='data:image/png;base64,'+png.toString('base64')
    const snapshot={...config,coverUrl:dataUrl}
    await db.query('UPDATE products SET cover_url=$1 WHERE id=$2',[dataUrl,'registered-product'])
    await db.query('UPDATE product_versions SET snapshot=$1 WHERE product_id=$2 AND version=1',[JSON.stringify(snapshot),'registered-product'])
    await db.query('UPDATE knowledge_nodes SET cover_url=$1 WHERE id=$2',[dataUrl,exam])
    await db.query("INSERT INTO exam_categories(id,name,sort_order,enabled,cover_url) VALUES('legacy-category','旧分类',1,true,$1)",[dataUrl])
    await db.query('DELETE FROM schema_versions WHERE version=19')
    await db.query('ALTER TABLE media_assets DROP COLUMN legacy_image_hash')
    await migrateRegisteredImages();await migrateRegisteredImages()
    const legacy=(await db.query('SELECT * FROM media_assets WHERE legacy_image_hash IS NOT NULL')).rows
    assert.equal(legacy.length,1)
    assert.deepEqual(await readFile(join(process.env.MEDIA_DIR!,legacy[0].disk_name)),png)
    const legacyUrl='/api/message-images/'+legacy[0].id
    assert.equal((await db.query("SELECT cover_url FROM products WHERE id='registered-product'")).rows[0].cover_url,legacyUrl)
    assert.equal((await db.query('SELECT cover_url FROM exams WHERE id=$1',[exam])).rows[0].cover_url,legacyUrl)
    assert.deepEqual((await db.query("SELECT snapshot FROM product_versions WHERE product_id='registered-product' AND version=1")).rows[0].snapshot,snapshot)
    const migrated=await call('/admin/resources/'+legacy[0].id)
    assert.equal(migrated.storage,'file');assert.equal(migrated.createdAt,null)
    assert(migrated.references.some((r:any)=>r.location==='商品头图'))
    assert(migrated.references.some((r:any)=>r.location==='商品历史版本 V1 · 头图'))
    assert(migrated.references.some((r:any)=>r.location==='分类封面'))
    await call('/admin/resources/'+legacy[0].id,{},'DELETE',409)
    await call('/admin/products/registered-product/restore',{version:2,sourceVersion:1},'POST')
    assert.equal((await db.query("SELECT cover_url FROM products WHERE id='registered-product'")).rows[0].cover_url,legacyUrl)
    await call('/admin/products/unregistered',{version:0,config:{...config,coverUrl:'data:image/png;base64,AAAA'}},'PUT',400)
  } finally { await new Promise<void>(r=>server.close(()=>r()));await closeDatabase() }
})
