import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import express from 'express'
import {ZodError} from 'zod'

test('configured products, version history and checkout rules',async t=>{
 process.env.APP_MODE='test';process.env.DATABASE_URL='';process.env.LOCAL_DATABASE_DIR=await mkdtemp(join(tmpdir(),'sxb-products-'));process.env.SECRET_KEY='a'.repeat(64);process.env.ADMIN_PHONE='18600000000';process.env.ADMIN_PASSWORD='Product-Test-42!'
 const {db,closeDatabase}=await import('../apps/api/src/db.ts'),{seed}=await import('../apps/api/src/seed.ts'),{initSecrets,session}=await import('../apps/api/src/security.ts'),{api}=await import('../apps/api/src/routes.ts'),{rights}=await import('../apps/api/src/membership.ts'),{trialWindow}=await import('../apps/api/src/product-orders.ts')
 await initSecrets();await seed()
 const admin=(await db.query("SELECT id FROM users WHERE account_kind='admin' LIMIT 1")).rows[0],adminToken=await session(admin.id,'admin')
 const users:string[]=[];for(let i=0;i<8;i++){await db.query('INSERT INTO users(id,phone,nickname,invite_code) VALUES($1,$2,$1,$1)',['product-user-'+i,'1880099900'+i]);users.push(await session('product-user-'+i))}
 const exam='junior-social-worker',cycle=(await db.query('SELECT * FROM exam_cycles WHERE exam_id=$1 AND starts_at<=now() AND ends_at>now()',[exam])).rows[0]
 const base={title:'正式VIP',type:'entitlement',examId:exam,cycleId:cycle.id,level:'vip',priceCents:2990,status:'published',intro:'测试商品',document:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'完整图文详情'}]}]}}
 const app=express();app.use(express.json({limit:'40mb'}));app.use('/api',api);app.use((e:any,_q:any,r:any,_n:any)=>r.status(e instanceof ZodError?400:e.status||500).json({message:e.message}))
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const origin='http://127.0.0.1:'+(server.address() as any).port+'/api'
 async function call(path:string,body?:any,method='GET',expected=200,token=adminToken){const r=await fetch(origin+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)});const data:any=await r.json();assert.equal(r.status,expected,JSON.stringify(data));return data}
 const save=(id:string,config:any,version=0,expected=200)=>call('/admin/products/'+id,{version,config},'PUT',expected)
 const order=(productId:string,user=0)=>call('/orders',{productId},'POST',200,users[user])
 const checkout=(id:string,user=0,expected=200)=>call('/orders/'+id+'/checkout',{},'POST',expected,users[user])
 const pay=(id:string,user=0,confirmationToken?:string,expected=200)=>call('/orders/'+id+'/test-payment',{outcome:'success',...(confirmationToken?{confirmationToken}:{})},'POST',expected,users[user])
 try{
  await t.test('authorization, validation and public catalog use configured content',async()=>{
   await call('/admin/products',undefined,'GET',403,users[0]);await call('/admin/products/vip',{version:0,config:base},'PUT',403,users[0])
   await save('bad',{...base,priceCents:0},0,400);await save('bad',{...base,type:'trial',trialHours:36},0,400);await save('bad',{...base,type:'trial',trialHours:10,minimumHours:36,shortNotice:'请确认'},0,400)
   await save('bad',{...base,examId:'mid-social-worker'},0,400)
   await save('vip',base);await save('draft',{...base,title:'草稿商品',status:'draft'})
   const list=await call('/products?examId='+exam,undefined,'GET',200,'');assert.equal(list.length,1);assert.equal(list[0].priceCents,2990);assert.match(list[0].html,/完整图文详情/);assert(list[0].permissions.length);assert(!('config' in list[0]))
   await call('/orders',{examId:exam,product:'upgrade'},'POST',400,users[0])
  })
  await t.test('every save and restore append immutable versions; stale saves rejected',async()=>{
   await save('vip',{...base,title:'新名称',priceCents:3990},1)
   await save('vip',{...base,title:'陈旧修改'},1,409)
   await call('/admin/products/vip/restore',{version:2,sourceVersion:1},'POST')
   const versions=await call('/admin/products/vip/versions');assert.deepEqual(versions.map((v:any)=>v.version),[3,2,1]);assert.equal(versions[0].snapshot.title,base.title);assert.equal(versions[1].snapshot.priceCents,3990)
   await call('/admin/products/vip/status',{version:3,status:'offline'},'PATCH');assert.equal((await call('/products?examId='+exam,undefined,'GET',200,'')).length,0)
   await call('/admin/products/vip/status',{version:4,status:'published'},'PATCH')
  })
  await t.test('order snapshots survive edits; successful payment is idempotent and locks identity',async()=>{
   const o=(await order('vip')).order;assert.equal(o.amount_cents,2990)
   await save('vip',{...base,priceCents:5990,title:'未来售价'},5)
   const before=await checkout(o.id);assert.equal(before.amountCents,2990);assert.equal(before.title,base.title)
   await pay(o.id);await pay(o.id)
   assert.equal((await rights('product-user-0',exam)).level,'vip')
   assert.equal((await db.query('SELECT count(*)::int AS n FROM memberships WHERE order_id=$1',[o.id])).rows[0].n,1)
   await save('vip',{...base,level:'svip'},6,409)
   await call('/admin/products/vip',{version:6},'DELETE',409)
   await call('/orders',{productId:'vip'},'POST',400,users[0])
   assert.equal((await call('/orders',undefined,'GET',200,users[0]))[0].product_snapshot.priceCents,2990)
  })
  const trial={...base,title:'36小时 SVIP 体验',frontendTitle:'安心备考体验',type:'trial',level:'svip',priceCents:990,trialHours:36,minimumHours:10,shortNotice:'本次体验 {{实际可用时长}}，于 {{考期结束时间}} 截止。'}
  await t.test('trial boundaries are exact; short trials require server confirmation and issue correct tier',async()=>{
   const now=Date.now(),end=(h:number)=>new Date(now+h*3600000).toISOString();assert.equal(trialWindow(36,10,end(36),now).shortened,false);assert.equal(trialWindow(36,10,end(10),now).allowed,true);assert.equal(trialWindow(36,10,end(10),now+1).allowed,false)
   await save('trial',trial)
   await db.query("UPDATE exam_cycles SET ends_at=now()+interval '12 hours' WHERE id=$1",[cycle.id])
   const o=(await order('trial',1)).order,preview=await checkout(o.id,1)
   assert(preview.shortened);assert(preview.availableHours<12&&preview.availableHours>11.9);assert.match(preview.notice,/本次体验/)
   await pay(o.id,1,undefined,409);await pay(o.id,2,preview.confirmationToken,404)
   await pay(o.id,1,preview.confirmationToken);const member=await rights('product-user-1',exam);assert.equal(member.level,'svip');assert.equal(member.trial,true)
   assert.equal(member.trialDetails?.title,trial.frontendTitle);assert.equal(member.trialDetails?.configuredHours,36);assert(member.trialDetails!.actualHours!>11.9&&member.trialDetails!.actualHours!<12)
   assert.equal((await rights('product-user-1','mid-social-worker')).trialDetails,null)
   const grant=(await db.query('SELECT * FROM memberships WHERE order_id=$1',[o.id])).rows[0];assert.equal(new Date(grant.trial_ends_at).getTime(),Date.parse(o.product_snapshot.endsAt))
   await save('trial',{...trial,trialHours:72},1);assert.equal(Date.parse((await rights('product-user-1',exam)).expiresAt!),new Date(grant.trial_ends_at).getTime())
   assert.equal((await rights('product-user-1',exam)).trialDetails?.configuredHours,36)
   const paidOrder=(await call('/orders',undefined,'GET',200,users[1])).find((row:any)=>row.id===o.id);assert.equal(Date.parse(paidOrder.entitlement_ends_at),new Date(grant.trial_ends_at).getTime())
   await call('/orders',{productId:'trial'},'POST',400,users[0]);await call('/orders',{productId:'trial'},'POST',400,users[1])
   const formal=(await order('vip',1)).order;await pay(formal.id,1);assert.equal((await rights('product-user-1',exam)).level,'vip');assert.equal((await rights('product-user-1',exam)).trial,false)
   assert.equal((await rights('product-user-1',exam)).trialDetails,null)
  })
  await t.test('payment rejects insufficient time, downlisted products and edited ownership',async()=>{
   const pending=(await order('trial',2)).order,preview=await checkout(pending.id,2)
   await db.query("UPDATE exam_cycles SET ends_at=now()+interval '9 hours' WHERE id=$1",[cycle.id]);await checkout(pending.id,2,400);await pay(pending.id,2,preview.confirmationToken,400)
   await db.query('UPDATE exam_cycles SET ends_at=$2 WHERE id=$1',[cycle.id,cycle.ends_at])
   const normal=(await order('vip',3)).order;await call('/admin/products/vip/status',{version:6,status:'offline'},'PATCH');await pay(normal.id,3,undefined,400)
   await call('/admin/products/vip/status',{version:7,status:'published'},'PATCH');await pay(normal.id,3)
   await save('mutable',base);const other=(await order('mutable',4)).order;await save('mutable',{...base,level:'svip'},1);await pay(other.id,4,undefined,409)
  })
  await t.test('restore cannot change paid identity and referenced versions cannot be deleted',async()=>{
   await save('identity',{...base,level:'svip'});await save('identity',base,1);const o=(await order('identity',5)).order;await pay(o.id,5)
   await call('/admin/products/identity/restore',{version:2,sourceVersion:1},'POST',409)
   await call('/admin/products/identity',{version:2},'DELETE',409)
   await call('/admin/products/draft',{version:1},'DELETE');assert.equal((await call('/admin/products/draft/versions')).length,0)
  })
  await t.test('frontend and internal names are independent and frozen in order snapshots',async()=>{
   const named={...base,title:'内部标识 · 2027 VIP',frontendTitle:'安心备考 VIP 套餐'}
   await save('named',named);await save('bad-name',{...named,frontendTitle:'   '},0,400)
   assert.equal((await call('/products?examId='+exam,undefined,'GET',200,'')).find((p:any)=>p.id==='named').title,named.frontendTitle)
   const p=(await call('/admin/products')).find((p:any)=>p.id==='named');assert.equal(p.title,named.title);assert.equal(p.config.frontendTitle,named.frontendTitle)
   const o=(await order('named',7)).order;assert.equal(o.product_snapshot.title,named.title);assert.equal(o.product_snapshot.frontendTitle,named.frontendTitle)
   await save('named',{...named,title:'新的内部名称',frontendTitle:'新版展示名称'},1)
   assert.equal((await checkout(o.id,7)).title,named.frontendTitle)
   assert.equal((await call('/admin/orders/'+o.id)).order.product_title,named.title)
   await call('/admin/products/named/restore',{version:2,sourceVersion:1},'POST')
   assert.equal((await call('/admin/products')).find((p:any)=>p.id==='named').config.frontendTitle,named.frontendTitle)
   // Old historical versions have no frontendTitle; restore uses the original title without rewriting history.
   await db.query("UPDATE product_versions SET snapshot=snapshot-'frontendTitle' WHERE product_id='named' AND version=1")
   await call('/admin/products/named/restore',{version:3,sourceVersion:1},'POST')
   assert.equal((await call('/admin/products')).find((p:any)=>p.id==='named').config.frontendTitle,named.title)
   const {migrateProductNames}=await import('../apps/api/src/products.ts');await migrateProductNames()
  })
  await t.test('expired and future products never appear for purchase; migration repeats safely',async()=>{
   await db.query("UPDATE exam_cycles SET ends_at=now()-interval '1 second' WHERE id=$1",[cycle.id]);assert.equal((await call('/products?examId='+exam,undefined,'GET',200,'')).length,0)
   await call('/orders',{productId:'vip'},'POST',400,users[6]);await save('vip',base,8,400)
   const {migrateProducts}=await import('../apps/api/src/products.ts');await migrateProducts();assert((await call('/admin/products/vip/versions')).length>=8)
  })
 }finally{await new Promise<void>(r=>server.close(()=>r()));await closeDatabase()}
})
