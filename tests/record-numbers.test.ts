import test from 'node:test'
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
import { migrateRecordNumberTables } from '../apps/api/src/record-numbers.ts'
test('per-table entry numbers preserve keys, chronology and tombstones and are migration-idempotent',async()=>{
 const db=new PGlite()
 try{
  await db.exec(`CREATE TABLE schema_versions(version integer PRIMARY KEY); CREATE TABLE things(id text PRIMARY KEY,created_at timestamptz,title text); CREATE TABLE categories(id text PRIMARY KEY); INSERT INTO things VALUES('second','2026-02-01','B'),('first','2026-01-01','A'); INSERT INTO categories VALUES('cat');`)
  const before=(await db.query('SELECT * FROM things ORDER BY id')).rows
  await db.transaction(c=>migrateRecordNumberTables(c as any))
  assert.deepEqual((await db.query('SELECT * FROM things ORDER BY id')).rows,before)
  const num=async(id:string,table='things')=>Number((await db.query<any>('SELECT entry_no FROM record_numbers WHERE table_name=$1 AND record_id=$2',[table,id])).rows[0].entry_no)
  assert.equal(await num('first'),1);assert.equal(await num('second'),2);assert.equal(await num('cat','categories'),1)
  await db.exec("UPDATE things SET title='changed' WHERE id='first'; DELETE FROM things WHERE id='second'; INSERT INTO things(id) VALUES('third');")
  assert.equal(await num('first'),1);assert.equal(await num('third'),3)
  await db.transaction(c=>migrateRecordNumberTables(c as any))
  await db.exec("INSERT INTO things(id) VALUES('fourth');")
  assert.equal(await num('fourth'),4)
  await assert.rejects(db.exec("UPDATE things SET id='new' WHERE id='first'"),/唯一标识不能修改/)
  assert.equal(await num('first'),1)
 }finally{await db.close()}
})
