import {test} from 'node:test'
import assert from 'node:assert/strict'
import {profileFixture} from './helpers/user-profile-fixture.ts'
test('user profiles enforce exact account and exam isolation across all lists, details, mastery and grants',async()=>{
 const f=await profileFixture(),{call,base,scope,scopeB,uid,other,exam,second,db}=f
 try{
  await call(base,403,f.student);await call('/admin/user-profiles/'+f.admin.id,404);await call(base+'/exams/missing/overview',404)
  const profile=await call(base);assert.equal(profile.user.id,uid);assert(!('password_hash' in profile.user));assert(profile.exams.find((e:any)=>e.id===exam).has_records);assert(profile.exams.find((e:any)=>e.id===second).has_records)
  assert.equal((await call('/admin/user-profiles?search=18700001111')).total,1)
  const overview=await call(scope+'/overview');assert.equal(overview.summary.answers,3);assert.equal(overview.summary.visits,1);assert.equal(overview.summary.wrong,1);assert.equal(overview.summary.favorites,1);assert.equal(overview.summary.notes,1);assert.equal(overview.current.level,'vip');assert.equal(overview.orders.total,2);assert.equal(overview.trial.eligible,false)
  const b=await call(scopeB+'/overview');assert.equal(b.summary.answers,1);assert.equal(b.current.level,'svip');assert.equal(b.orders.total,1)
  for(const [kind,count] of [['answers',3],['wrong',1],['favorites',1],['notes',1]] as const){
   const a=await call(scope+'/collections/'+kind+'?examId='+second+'&userId='+other);assert.equal(a.total,count);assert(a.items.every((r:any)=>r.user_id===uid&&r.exam_id===exam))
   const otherExam=(await call(scopeB+'/collections/'+kind)).items[0];await call(scope+'/collections/'+kind+'/'+encodeURIComponent(otherExam.id),404)
   const otherUser=(await call('/admin/user-profiles/'+other+'/exams/'+exam+'/collections/'+kind)).items[0];await call(scope+'/collections/'+kind+'/'+encodeURIComponent(otherUser.id),404)
   const detail=await call(scope+'/collections/'+kind+'/'+encodeURIComponent(a.items[0].id));assert.equal(detail.user_id,uid);assert.equal(detail.exam_id,exam)
  }
  assert.equal((await call(scope+'/collections/wrong')).items[0].correct,true,'correct answer keeps explicit wrong notebook')
  assert.equal((await call(scope+'/visits')).items[0].id,'a-visit');assert.equal((await call(scopeB+'/visits')).items[0].id,'b-visit')
  await call(scope+'/visits?from=2026-02-30&to=2026-03-01',400)
  const mastery=await call(scope+'/mastery'),subject=mastery.items.find((r:any)=>r.id==='a-s');assert(subject);assert.equal(subject.total,3,'shared knowledge links deduplicate in parent totals');assert.equal(subject.answered,2);assert.equal(subject.graded,1);assert.equal(subject.accuracy,100,'subjective self score excluded');assert.equal(subject.coverage,67);assert.equal(subject.wrong,1);assert.equal(subject.children[0].children[0].total,3);assert(!JSON.stringify(mastery).includes('中级专属'))
  assert.equal((await call(scope+'/orders')).total,2);await call(scope+'/orders/b-order',404);await call(scope+'/orders/other-order',404);assert.equal((await call(scope+'/orders/a-refund')).order.refund_reference,'人工退款凭证')
  const grants=await call(scope+'/fulfillment');assert.equal(grants.total,2);assert(grants.grants.every((r:any)=>r.exam_id===exam&&r.user_id===uid));assert.equal(grants.grants.find((r:any)=>r.order_id==='a-refund').state,'revoked');assert(grants.history.some((r:any)=>r.id==='a-log'));assert(!grants.history.some((r:any)=>r.id==='b-log'))
  assert.equal((await call(scope+'/relations')).total,1);assert.equal((await call(scopeB+'/relations')).total,0);assert.equal((await call(base+'/account-logs')).items[0].id,'account-log')
  // Once the current published question is hidden it no longer affects mastery denominators.
  await db.query("UPDATE content SET status='offline' WHERE id='a-q3'");assert.equal((await call(scope+'/mastery')).items.find((r:any)=>r.id==='a-s').coverage,100)
  // Trial lifetime is global, even where this user has no paid records in an exam.
  await db.query("INSERT INTO knowledge_nodes(id,title) VALUES('profile-empty-exam','空白考试')");const empty=await call(base+'/exams/profile-empty-exam/overview');assert.equal(empty.orders.total,0);assert.equal(empty.summary.answers,0);assert.equal(empty.trial.eligible,false)
  // Read-only operations have not changed grant states or user learning records.
  assert.equal((await db.query('SELECT count(*)::int AS n FROM answers WHERE user_id=$1',[uid])).rows[0].n,3)
  assert.equal((await call('/admin/learning-data/collections/notes?examId='+exam)).total,2,'global learning-data remains functional')
  // Fulfillment display uses the same earlier trial expiry as effective rights.
  await db.query("UPDATE memberships SET trial_ends_at=now()-interval '1 hour',revoked=false WHERE order_id='a-refund'")
  const expired=(await call(scope+'/fulfillment')).grants.find((r:any)=>r.order_id==='a-refund');assert.equal(expired.state,'expired');assert.equal(new Date(expired.ends_at).getTime(),new Date(expired.trial_ends_at).getTime())
 }finally{await f.close()}
})
