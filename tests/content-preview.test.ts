import {test} from 'node:test'
import assert from 'node:assert/strict'
import {previewFixture} from './helpers/content-preview-fixture.ts'
import {decrypt,encrypt,hash} from '../apps/api/src/security.ts'

test('preview is admin-issued, read-only, expires, and scopes content and media without student membership',async()=>{
 const f=await previewFixture()
 try{
  const counts=async()=>{const result=[];for(const table of ['learning_visits','learning_events','learning_daily_users','answers','question_submissions','user_records','orders','memberships'])result.push((await f.db.query('SELECT count(*)::int AS n FROM '+table)).rows[0].n);return result}
  const before=await counts()
  assert.equal((await f.create('a-k',f.student)).status,403)
  assert.equal((await f.create('a-q1')).status,404)
  const issued=await f.create('a-k');assert.equal(issued.status,200)
  const token=issued.data.token,base=f.origin+'/api/content-preview/'+token
  const response=await fetch(base);assert.equal(response.status,200);assert.match(response.headers.get('cache-control')!,/no-store/)
  const body:any=await response.json();assert.equal(body.node.title,'预览知识点');assert.equal(body.node.status,'draft');assert.equal(body.courses.length,1);assert.equal(body.courses[0].title,'预览配套视频课');assert(!JSON.stringify(body).includes('中级专属'));assert(!JSON.stringify(body).includes('password'));assert(!JSON.stringify(body).includes('permission'))
  for(const url of [body.node.blocks.find((b:any)=>b.kind==='image').url,body.courses[0].mediaUrl,body.courses[0].posterUrl,body.courses[0].handouts[0].url])assert.equal((await fetch(f.origin+url)).status,200)
  const range=await fetch(f.origin+body.courses[0].mediaUrl,{headers:{Range:'bytes=0-3'}});assert.equal(range.status,206)
  assert.equal((await fetch(base+'/media/preview-other')).status,404)
  assert.equal((await fetch(base+'/media/missing')).status,404)
  assert.equal((await fetch(f.origin+'/api/content-preview/'+token.slice(0,-8)+'invalid')).status,401)
  assert.equal((await fetch(f.origin+'/api/records/'+f.exam,{headers:{Authorization:'Bearer '+token}})).status,401)
  assert.equal((await fetch(base,{method:'POST'})).status,401)
  const section=await f.create('a-t');const sectionBody:any=await(await fetch(f.origin+'/api/content-preview/'+section.data.token)).json();assert.equal(sectionBody.node.kind,'section');assert.equal(sectionBody.node.status,'offline');assert.equal(sectionBody.courses.length,1);assert.equal(sectionBody.courses[0].id,'preview-section-course')
  const original=JSON.parse(decrypt(Buffer.from(token,'base64url').toString()))
  const expired=Buffer.from(encrypt(JSON.stringify({...original,expires:Date.now()-1}))).toString('base64url')
  assert.equal((await fetch(f.origin+'/api/content-preview/'+expired)).status,401)
  assert.equal((await fetch(f.origin+'/api/content-preview/'+expired+'/media/preview-image')).status,401)
  await f.db.query("UPDATE content SET payload=payload||'{\"deletedAt\":\"test\"}'::jsonb WHERE id='preview-course'")
  assert.equal((await fetch(base+'/media/preview-video')).status,404)
  assert.deepEqual(await counts(),before)
  await f.db.query('DELETE FROM sessions WHERE token_hash=$1',[hash(f.token)])
  assert.equal((await fetch(base)).status,401)
 }finally{await f.close()}
})
