import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import express from 'express'
import {ZodError} from 'zod'

test('order management and manual refund lifecycle',async t=>{
 process.env.APP_MODE='test';process.env.DATABASE_URL='';process.env.LOCAL_DATABASE_DIR=await mkdtemp(join(tmpdir(),'sxb-orders-'));process.env.SECRET_KEY='f'.repeat(64);process.env.ADMIN_PHONE='18600000000';process.env.ADMIN_PASSWORD='Orders-Test-42!'
 const {db,closeDatabase}=await import('../apps/api/src/db.ts'),{seed}=await import('../apps/api/src/seed.ts'),{initSecrets,session}=await import('../apps/api/src/security.ts'),{api}=await import('../apps/api/src/routes.ts'),{rights}=await import('../apps/api/src/membership.ts')
 await initSecrets();await seed()
 const admin=(await db.query("SELECT id FROM users WHERE account_kind='admin' LIMIT 1")).rows[0],adminToken=await session(admin.id,'admin'),tokens:string[]=[]
 for(let i=0;i<6;i++){await db.query('INSERT INTO users(id,phone,nickname,invite_code) VALUES($1,$2,$3,$1)',['order-user-'+i,'1880000010'+i,'订单回归'+i]);tokens.push(await session('order-user-'+i))}
 const exam='junior-social-worker',cycle=(await db.query('SELECT * FROM exam_cycles WHERE exam_id=$1 AND starts_at<=now() AND ends_at>now()',[exam])).rows[0]
 const app=express();app.use(express.json());app.use('/api',api);app.use((e:any,_q:any,r:any,_n:any)=>r.status(e instanceof ZodError?400:e.status||500).json({message:e.message}))
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const origin='http://127.0.0.1:'+(server.address() as any).port+'/api'
 async function call(path:string,body?:any,method='GET',expected=200,token=adminToken){const r=await fetch(origin+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)});const d:any=await r.json();assert.equal(r.status,expected,JSON.stringify(d));return d}
 const base={title:'订单回归商品',type:'entitlement',examId:exam,cycleId:cycle.id,level:'vip',priceCents:2990,status:'published'}
 const ids:string[]=[],create=async(i:number,productId='order-good')=>{const result=await call('/orders',{productId},'POST',200,tokens[i]);ids[i]=result.order.id;return result.order}
 const pay=(i:number,outcome='success',confirmationToken?:string)=>call('/orders/'+ids[i]+'/test-payment',{outcome,...(confirmationToken?{confirmationToken}:{})},'POST',200,tokens[i])
 const change=(i:number,status:string,expectedStatus:string,extra:any={},expected=200)=>call('/admin/orders/'+ids[i],{status,expectedStatus,reason:'订单人工处理回归',...extra},'PATCH',expected)
 try{
  await call('/admin/products/order-good',{version:0,config:base},'PUT')
  for(let i=0;i<4;i++)await create(i)
  await pay(0);await pay(1);await pay(2,'failure')
  await t.test('paginated filters, amount summary and frozen product snapshots',async()=>{
   await call('/admin/orders',undefined,'GET',403,tokens[0]);await call('/admin/orders?page=0',undefined,'GET',400)
   await call('/admin/products/order-good',{version:1,config:{...base,title:'新的商品名称',priceCents:5990}},'PUT')
   const result=await call('/admin/orders?search='+encodeURIComponent('订单回归')+'&pageSize=2');assert.equal(result.total,4);assert.equal(result.items.length,2);assert.equal(result.summary.pending,2);assert.equal(result.summary.paid,2);assert.equal(Number(result.summary.today_paid_cents),5980)
   assert(result.items.every((o:any)=>o.product_title==='订单回归商品'))
   const failed=await call('/admin/orders?productId=order-good&status=payment_failed');assert.equal(failed.total,1);assert.equal(failed.items[0].id,ids[2]);assert.equal(failed.items[0].status,'pending_payment')
   const byCycle=await call('/admin/orders?examId='+exam+'&cycleId='+cycle.id+'&productId=order-good');assert.equal(byCycle.total,4)
   const later=await call('/admin/orders?createdFrom=2099-01-01T00:00:00Z');assert.equal(later.total,0)
   const d=await call('/admin/orders/'+ids[0]);assert.equal(d.order.product_snapshot.version,1);assert.equal(d.payments[0].status,'success');assert.equal(d.order.entitlement_level,'vip')
  })
  await t.test('manual refunds work without a payment provider and revoke only after confirmation',async()=>{
   await change(0,'refunded','paid',{refundReference:'BANK-01'},409)
   await db.query("UPDATE platform_environment SET mode='production' WHERE id=1")
   await change(0,'refunding','paid');assert.equal((await rights('order-user-0',exam)).level,'vip')
   await change(0,'refunding','paid',{},409);await change(0,'refunded','refunding',{},400)
   await change(0,'refunded','refunding',{refundReference:'线下银行转账-0001'});assert.equal((await rights('order-user-0',exam)).level,'free')
   await change(0,'refunded','refunding',{refundReference:'重复确认'},409)
   const d=await call('/admin/orders/'+ids[0]);assert.equal(d.order.status,'refunded');assert.equal(d.order.refund_reference,'线下银行转账-0001');assert(d.order.refunded_at);assert.equal(d.history.length,2);assert.equal(d.history[0].actor_id,admin.id)
   assert.equal(Number((await call('/admin/orders?productId=order-good')).summary.refunded_cents),2990)
   await db.query("UPDATE platform_environment SET mode='test' WHERE id=1")
  })
  await t.test('close after failure is guarded; prices cannot be manually rewritten',async()=>{
   await change(2,'closed','pending_payment');await change(2,'closed','pending_payment',{},409)
   await call('/admin/orders/'+ids[3],{amountCents:1,reason:'随意更改价格'},'PATCH',400)
   await call('/orders/'+ids[2]+'/test-payment',{outcome:'success'},'POST',409,tokens[2])
  })
  await t.test('deleting a test order removes it from lists, revokes its grant and preserves other grants',async()=>{
   const otherCycle=(await db.query("SELECT * FROM exam_cycles WHERE exam_id='mid-social-worker' AND starts_at<=now() AND ends_at>now() LIMIT 1")).rows[0]
   await db.query("INSERT INTO orders(id,user_id,exam_id,cycle_id,product,amount_cents,status,expires_at,paid_at) VALUES('other-order','order-user-1','mid-social-worker',$1,'svip',100,'paid',now(),now())",[otherCycle.id])
   await db.query("INSERT INTO memberships(order_id,user_id,exam_id,cycle_id,level) VALUES('other-order','order-user-1','mid-social-worker',$1,'svip')",[otherCycle.id])
   const body={confirmation:ids[1],reason:'清除指定测试订单'}
   await call('/admin/orders/'+ids[1],{...body,confirmation:'wrong'},'DELETE',400)
   await db.query("UPDATE platform_environment SET mode='production' WHERE id=1");await call('/admin/orders/'+ids[1],body,'DELETE',403);await db.query("UPDATE platform_environment SET mode='test' WHERE id=1")
   await db.query('UPDATE orders SET is_test_data=false WHERE id=$1',[ids[3]]);await call('/admin/orders/'+ids[3],{confirmation:ids[3],reason:'尝试删除正式订单'},'DELETE',403)
   await call('/admin/orders/'+ids[1],body,'DELETE');assert.equal((await rights('order-user-1',exam)).level,'free');assert.equal((await rights('order-user-1','mid-social-worker')).level,'svip')
   assert.equal((await call('/admin/orders?search='+ids[1])).total,0);await call('/admin/orders/'+ids[1],undefined,'GET',404)
   assert(!(await call('/orders',undefined,'GET',200,tokens[1])).some((o:any)=>o.id===ids[1]));await call('/orders/'+ids[1]+'/test-payment',{outcome:'success'},'POST',404,tokens[1])
   const audit=(await db.query("SELECT * FROM audit_logs WHERE target_id=$1 AND action='order.delete_test'",[ids[1]])).rows[0];assert(audit.details.revokedOrderEntitlement)
   await call('/orders',{productId:'order-good'},'POST',400,tokens[1])
  })
  await t.test('short trial fulfillment preserves actual duration and consent evidence',async()=>{
   await call('/admin/products/order-trial',{version:0,config:{...base,type:'trial',trialHours:36,minimumHours:10,shortNotice:'体验剩余 {{实际可用时长}}'}},'PUT')
   await db.query("UPDATE exam_cycles SET ends_at=now()+interval '12 hours' WHERE id=$1",[cycle.id]);await create(4,'order-trial')
   const preview=await call('/orders/'+ids[4]+'/checkout',{},'POST',200,tokens[4]);await pay(4,'success',preview.confirmationToken)
   const d=await call('/admin/orders/'+ids[4]);assert(d.order.fulfillment_snapshot.shortConfirmationAccepted);assert(d.order.fulfillment_snapshot.actualHours<12);assert.equal(d.order.fulfillment_snapshot.configuredHours,36)
   const {migrateOrderManagement}=await import('../apps/api/src/order-management.ts');await migrateOrderManagement()
  })
 }finally{process.env.APP_MODE='test';await new Promise<void>(r=>server.close(()=>r()));await closeDatabase()}
})
