import {test} from 'node:test'
import assert from 'node:assert/strict'
import {profileFixture} from './helpers/user-profile-fixture.ts'

test('bulk actions preserve fields, restore status, validate publication and isolate failures',async()=>{
 const f=await profileFixture()
 try{
  await f.db.query("UPDATE content SET is_test_data=false WHERE id LIKE 'a-%'")
  const row=async(id:string)=>(await f.db.query('SELECT * FROM content WHERE id=$1',[id])).rows[0]
  const post=async(body:any,expected=200,auth=f.token,path='/apply')=>{const r=await fetch(f.origin+'/api/admin/bulk-content'+path,{method:'POST',headers:{Authorization:'Bearer '+auth,'Content-Type':'application/json'},body:JSON.stringify(body)});const result=await r.json();assert.equal(r.status,expected,JSON.stringify(result));return result}
  const act=async(action:string,ids:string[],extra:any={})=>post({action,items:await Promise.all(ids.map(async id=>({id,version:(await row(id)).version}))),...extra})
  await f.call('/admin/bulk-content',403,f.student)
  await post({action:'disable',items:[{id:'a-k',version:1}]},403,f.student)
  const all=await f.call('/admin/bulk-content'),formal=await f.call('/admin/bulk-content?test=false'),demo=await f.call('/admin/bulk-content?test=true');assert.equal(all.total,formal.total+demo.total);assert.ok(formal.total&&demo.total)
  const graph=await f.call('/admin/bulk-content?module=knowledge');assert.ok(graph.items.every((r:any)=>['subject','chapter','section','knowledge'].includes(r.kind)));assert.equal((await f.call('/admin/bulk-content?module=knowledge&kind=question')).total,0)
  for(const [module,kind] of [['question','question'],['course','course'],['articles','faq'],['cheatsheet','cheatsheet']])assert.ok((await f.call('/admin/bulk-content?module='+module)).items.every((r:any)=>r.kind===kind))
  assert.equal((await act('disable',['a-q1'],{filters:{module:'knowledge'}})).results[0].success,false)
  const original=await row('a-k');assert.equal((await act('disable',['a-k'])).results[0].success,true);assert.equal((await row('a-k')).payload.statusBeforeDisable,'published')
  assert.equal((await act('enable',['a-k'])).results[0].after,'published');assert.deepEqual((await row('a-k')).payload,original.payload)
  const beforeNoop=await row('a-k');assert.equal((await act('enable',['a-k'])).results[0].changed,false);assert.equal((await row('a-k')).version,beforeNoop.version)
  await act('draft',['a-k']);assert.equal((await row('a-k')).status,'draft');assert.ok(!('statusBeforeDisable' in (await row('a-k')).payload));assert.equal((await act('publish',['a-k'])).results[0].success,false)
  assert.equal((await act('review',['a-k'])).results[0].after,'review');const publication=(await act('publish',['a-k'])).results[0];assert.equal(publication.after,'published');assert.equal(publication.message,'已发布（已发布）');assert.ok(!publication.message.includes('上架'))
  await act('unpublish',['a-k']);assert.equal((await row('a-k')).status,'offline');assert.equal((await act('publish',['a-k'])).results[0].success,true)
  await act('disable',['a-k']);await act('draft',['a-k']);await act('enable',['a-k']);assert.equal((await row('a-k')).status,'draft','draft clears the old published restore status')
  for(const field of ['title','exam_id','parent_id','source','is_test_data'])assert.equal((await row('a-k'))[field],original[field])
  assert.deepEqual((await row('a-k')).payload,original.payload)
  // Formal/test records both participate; disabled drafts restore to draft.
  await f.db.query("INSERT INTO content(id,kind,exam_id,parent_id,title,status,payload,is_test_data) VALUES('bulk-test','knowledge',$1,'a-t','批量测试','draft','{}',true)",[f.exam])
  assert.equal((await act('disable',['a-k','bulk-test'])).results.filter((r:any)=>r.success).length,2)
  const restores=await act('enable',['a-k','bulk-test']);assert.ok(restores.results.every((r:any)=>r.success&&r.after==='draft'))
  assert.equal((await act('disable',['a-k'],{testOnly:true})).results[0].success,false)
  assert.equal((await act('disable',['a-k'],{filters:{examId:f.second}})).results[0].success,false)
  assert.equal((await act('disable',['bulk-test'],{filters:{test:'false'}})).results[0].success,false)
  assert.equal((await act('disable',['a-k'],{filters:{status:'published'}})).results[0].success,false)
  const draftRows=await f.call('/admin/bulk-content?status=draft&examId='+f.exam);assert.ok(draftRows.items.every((r:any)=>r.status==='draft'&&r.exam_id===f.exam))
  // Failed publishing validation must leave that row untouched without rolling back good rows.
  const bad=await row('a-q1');await f.db.query("UPDATE content SET status='review',payload=$2,version=version+1 WHERE id=$1",[bad.id,JSON.stringify({...bad.payload,answer:[]})]);await act('review',['a-k'])
  const published=await act('publish',['a-k','a-q1']);assert.equal(published.results.find((r:any)=>r.id==='a-k').success,true);assert.equal(published.results.find((r:any)=>r.id==='a-q1').success,false);assert.equal((await row('a-q1')).status,'review')
  const stale=await row('a-k');await act('draft',['a-k']);const good=await row('bulk-test');const mixed=await post({action:'disable',items:[{id:stale.id,version:stale.version},{id:'missing',version:1},{id:f.exam,version:1},{id:good.id,version:good.version}]});assert.equal(mixed.results.filter((r:any)=>r.success).length,1);assert.equal(mixed.results.filter((r:any)=>!r.success).length,3)
  const point=await row('a-k2');await f.db.query("UPDATE content SET status='review',payload=$2,version=version+1 WHERE id=$1",[point.id,JSON.stringify({...point.payload,starsPendingReview:true})]);assert.equal((await act('publish',['a-k2'])).results[0].success,false)
  const v=(await row('a-k')).version;await post({action:'disable',items:[{id:'a-k',version:v},{id:'a-k',version:v}]},400);await post({action:'delete',items:[{id:'a-k',version:v}]},400)
  assert.equal((await post({items:[{id:'a-k',version:v}]},200,f.token,'/disable')).results[0].success,true)
  const article=(await f.db.query("SELECT id FROM content WHERE kind='faq' LIMIT 1")).rows[0];assert.ok((await act('unpublish',[article.id],{filters:{module:'articles'}})).results[0].message.includes('已下架'));assert.ok((await act('publish',[article.id],{filters:{module:'articles'}})).results[0].message.includes('已上架'))
  const logs=(await f.db.query("SELECT action FROM audit_logs WHERE action LIKE 'content.bulk_%'")).rows.map((r:any)=>r.action);for(const action of ['enable','disable','publish','unpublish','draft','review'])assert.ok(logs.includes('content.bulk_'+action))
 }finally{await f.close()}
})
