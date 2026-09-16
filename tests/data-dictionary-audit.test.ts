import {test} from 'node:test'
import assert from 'node:assert/strict'
import {profileFixture} from './helpers/user-profile-fixture.ts'
import {auditActions,auditActionLabel,auditDetailRows,redactAuditDetails} from '../apps/shared/audit.ts'

test('dictionary metadata and audit history are administrator-only, read-only and complete',async()=>{
 const f=await profileFixture()
 try{
  for(const path of ['/admin/data-dictionary','/admin/audit/options','/admin/audit/records','/admin/audit/records/a-log']){
   await f.call(path,403,f.student)
   await f.call(path,401,'invalid')
  }
  await f.db.query("UPDATE ai_features SET encrypted_key='do-not-return-this-key' WHERE id='chat'")
  const d=await f.call('/admin/data-dictionary')
  assert.equal(d.summary.undocumented,0)
  assert(d.summary.columns>400)
  assert(!JSON.stringify(d).includes('do-not-return-this-key'))
  assert(!JSON.stringify(d).includes('18700001111'))
  assert.equal(d.tables.find((t:any)=>t.name==='content'&&t.schema==='public').kind,'视图')
  assert.equal(d.tables.find((t:any)=>t.name==='questions').kind,'数据表')
  assert(d.tables.some((t:any)=>t.schema==='migration_archive'))
  const orders=d.tables.find((t:any)=>t.name==='orders')
  const fk=orders.constraints.find((c:any)=>c.type==='f'&&c.columns.includes('user_id'))
  assert.equal(fk.target_table,'users');assert.deepEqual(fk.target_columns,['id'])
  assert(orders.indexes.some((i:any)=>i.primary))
  const unique=d.tables.find((t:any)=>t.name==='user_records').constraints.find((c:any)=>c.type==='u')
  assert.deepEqual(unique.columns,['user_id','exam_id','kind','source_id'])
  const rename=await fetch(f.origin+'/api/admin/data-dictionary',{method:'POST',headers:{Authorization:'Bearer '+f.token,'Content-Type':'application/json'},body:JSON.stringify({sql:'DROP TABLE users'})})
  assert.equal(rename.status,404)
  const users=(await f.db.query('SELECT count(*)::int n FROM users')).rows[0].n
  assert(users>0)
  // Live schema introspection must include a newly migrated table and mark missing documentation honestly.
  await f.db.query('CREATE TABLE dictionary_future (id text PRIMARY KEY,new_field text)')
  const fresh=await f.call('/admin/data-dictionary')
  const future=fresh.tables.find((t:any)=>t.name==='dictionary_future')
  assert.equal(future.documented,false);assert.equal(future.columns[1].documented,false)
  await f.db.query(`INSERT INTO audit_logs(id,actor_id,action,target_id,details,created_at) SELECT 'audit-page-'||i,$1,'product.restore-v3','audit-object','{"before":{"status":"draft"},"after":{"status":"published"},"apiKey":"hidden-value","nested":{"privateKey":"hidden-private"}}'::jsonb,'2026-01-01'::timestamptz+i*interval '1 second' FROM generate_series(1,225) i`,[f.admin.id])
  const all=await f.call('/admin/audit/records?action=product.restore-v3&pageSize=100')
  assert.equal(all.total,225);assert.equal(all.items.length,100)
  const last=await f.call('/admin/audit/records?action=product.restore-v3&pageSize=100&page=3')
  assert.equal(last.items.length,25)
  assert.equal(last.items[0].action_label,'恢复商品历史版本（第3版）')
  const filtered=await f.call('/admin/audit/records?target=audit-object&actor='+encodeURIComponent('最高管理员')+'&from=2026-01-01T00:00:01Z&to=2026-01-01T00:00:02Z')
  assert.equal(filtered.total,2)
  assert.equal((await f.call('/admin/audit/records?actor='+encodeURIComponent("' OR 1=1 --"))).total,0)
  await f.call('/admin/audit/records?from=2026-03-01T00:00:00Z&to=2026-01-01T00:00:00Z',400)
  await f.call('/admin/audit/records?pageSize=9999',400)
  await f.call('/admin/audit/records/not-found',404)
  const detail=await f.call('/admin/audit/records/audit-page-1')
  assert.equal(detail.details.apiKey,'已隐藏');assert.equal(detail.details.nested.privateKey,'已隐藏')
  assert(!JSON.stringify(detail).includes('hidden-value'))
  assert((await f.call('/admin/audit/options')).some((o:any)=>o.value==='product.restore-v3'&&o.label==='恢复商品历史版本（第3版）'))
  assert(Array.isArray(await f.call('/admin/audit')),'Legacy audit consumers remain compatible')
  for(const label of Object.values(auditActions))assert(/[\u4e00-\u9fff]/.test(label))
  assert.equal(auditActionLabel('legacy.unknown'),'其他历史操作')
  const human=auditDetailRows({before:{status:'draft'},after:{status:'published'}})
  assert.deepEqual(human,[{label:'变更前 / 状态',value:'草稿'},{label:'变更后 / 状态',value:'已发布'}])
  assert.deepEqual(redactAuditDetails([{password:'private'}]),[{password:'已隐藏'}])
 }finally{await f.close()}
})
