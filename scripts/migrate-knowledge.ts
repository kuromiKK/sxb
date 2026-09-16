import 'dotenv/config'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { db, closeDatabase } from '../apps/api/src/db.ts'
import { migrate } from '../apps/api/src/schema.ts'

// Stop the local API and take an offline filesystem backup before invoking this script.
// For PostgreSQL use an independently verified database snapshot before migration.
const checksum=(rows:any[])=>createHash('sha256').update(JSON.stringify(rows)).digest('hex')
async function fingerprint(table:string){
  const rows=(await db.query(`SELECT to_jsonb(t) AS value FROM ${table} t ORDER BY to_jsonb(t)::text`)).rows
  return {count:rows.length,sha256:checksum(rows)}
}
try {
  const unchanged=['exams','exam_categories','exam_cycles','exam_year_entries','users','orders','memberships','answers','user_records','learning_events','media_assets','manual_entitlements','import_batches']
  const before:Record<string,any>={}
  for(const table of unchanged)if((await db.query('SELECT to_regclass($1) AS name',[table])).rows[0].name)before[table]=await fingerprint(table)
  const contentBefore=(await db.query('SELECT * FROM content ORDER BY id')).rows
  await migrate()
  const contentAfter=(await db.query('SELECT * FROM content ORDER BY id')).rows
  assert.equal(contentBefore.length,contentAfter.length)
  for(let i=0;i<contentBefore.length;i++){
    const old=contentBefore[i],current=contentAfter[i]
    assert.equal(current.id,old.id)
    if(old.kind==='question'){
      const expected=old.payload.knowledgePointIds||[old.parent_id]
      assert.deepEqual(new Set(current.payload.knowledgePointIds),new Set(expected))
      const {knowledgePointIds,knowledgePointId,...rest}=current.payload
      const {knowledgePointIds:oldIds,knowledgePointId:oldMain,...oldRest}=old.payload
      assert.deepEqual(rest,oldRest)
      assert.equal(knowledgePointId,old.parent_id)
      assert.deepEqual({...current,payload:null},{...old,payload:null})
    }else assert.deepEqual(current,old)
  }
  for(const table of Object.keys(before))assert.deepEqual(await fingerprint(table),before[table],table+' changed unexpectedly')
  const tables:Record<string,any>={}
  for(const table of ['knowledge_nodes','questions','question_knowledge_points','premium_courses','knowledge_courses','other_content'])tables[table]=(await db.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n
  const version=(await db.query('SELECT max(version) AS n FROM schema_versions')).rows[0].n
  console.log(JSON.stringify({version,contentRecordsPreserved:contentAfter.length,unchangedTables:before,tables,verifiedAt:new Date().toISOString()},null,2))
}finally{await closeDatabase()}
