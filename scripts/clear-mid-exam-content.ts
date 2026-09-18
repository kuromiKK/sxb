/** One-time, explicitly requested local cleanup. Default is a read-only plan. */
import 'dotenv/config'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {mkdir,writeFile,stat} from 'node:fs/promises'
import {resolve,join} from 'node:path'
import {spawnSync} from 'node:child_process'
import {db,transaction,closeDatabase} from '../apps/api/src/db.ts'
import {lockResourceReferences} from '../apps/api/src/editor-images.ts'

const examId='mid-social-worker',expected={subject:1,chapter:13,section:42,knowledge:81,question:517}
const url=new URL(process.env.DATABASE_URL||'')
assert.ok(['127.0.0.1','localhost'].includes(url.hostname)&&url.pathname==='/sxb_local','Only local sxb_local is supported')
const digest=(rows:any[])=>createHash('sha256').update(JSON.stringify(rows)).digest('hex')
async function verify(c:typeof db){
 assert.equal((await c.query('SELECT mode FROM platform_environment')).rows[0]?.mode,'test','Only the test environment is supported')
 const exam=(await c.query("SELECT * FROM knowledge_nodes WHERE id=$1 AND kind='exam'",[examId])).rows[0]
 assert.equal(exam?.title,'中级社会工作师')
 const rows=(await c.query('SELECT * FROM content WHERE exam_id=$1 ORDER BY id',[examId])).rows
 const counts:Record<string,number>={};for(const r of rows)counts[r.kind]=(counts[r.kind]||0)+1
 assert.deepEqual(counts,expected,'Content counts changed; nothing deleted')
 // The inspected exam has no dependent learning, commercial, resource or import records.
 // Recheck to avoid deleting newly added work between inspection and execution.
 for(const table of ['answers','question_submissions','learning_events','learning_visits','learning_daily_users','monthly_reports','user_records','import_jobs','import_batches','media_assets','orders','memberships']){
  assert.equal((await c.query(`SELECT count(*)::int n FROM ${table} WHERE exam_id=$1`,[examId])).rows[0].n,0,`New ${table} dependencies require inspection`)
 }
 return {exam,rows,counts}
}
try{
 const plan=await verify(db)
 console.log(JSON.stringify({examId,title:plan.exam.title,counts:plan.counts,apply:process.argv.includes('--apply')}))
 if(process.argv.includes('--apply')){
  const result=await transaction(async c=>{
   await lockResourceReferences(c)
   await c.query('LOCK TABLE knowledge_nodes,questions,question_knowledge_points,content_identity,content_notices_seen,content_origins,cheatsheet_pushes,answers,question_submissions,learning_events,learning_visits,learning_daily_users,monthly_reports,user_records,import_jobs,import_batches,media_assets,orders,memberships,other_content,premium_courses,knowledge_courses IN SHARE ROW EXCLUSIVE MODE')
   const current=await verify(c),ids=current.rows.map(r=>r.id),questions=current.rows.filter(r=>r.kind==='question').map(r=>r.id)
   const examsBefore=(await c.query("SELECT * FROM knowledge_nodes WHERE kind='exam' ORDER BY id")).rows
   const otherBefore=digest((await c.query('SELECT * FROM content WHERE exam_id IS DISTINCT FROM $1 ORDER BY id',[examId])).rows)
   assert.equal((await c.query('SELECT count(*)::int n FROM question_knowledge_points WHERE knowledge_id=ANY($1::text[]) AND NOT(question_id=ANY($2::text[]))',[ids,questions])).rows[0].n,0,'References from outside this exam')
   const backup=resolve('.local/backups','before-mid-exam-clear-'+new Date().toISOString().replace(/[:.]/g,'-'))
   await mkdir(backup,{recursive:false})
   const dumpPath=join(backup,'database.dump'),dump=spawnSync(resolve('.local/postgresql-runtime/pgsql/bin/pg_dump.exe'),['-h',url.hostname,'-p',url.port||'5432','-U',decodeURIComponent(url.username),'-d',url.pathname.slice(1),'-Fc','-f',dumpPath],{env:{...process.env,PGPASSWORD:decodeURIComponent(url.password)},windowsHide:true,encoding:'utf8'})
   assert.equal(dump.status,0,'Database backup failed; nothing deleted: '+dump.stderr)
   assert.ok((await stat(dumpPath)).size>0,'Backup is empty')
   const inventory=spawnSync(resolve('.local/postgresql-runtime/pgsql/bin/pg_restore.exe'),['--list',dumpPath],{windowsHide:true,encoding:'utf8'})
   assert.equal(inventory.status,0,'Backup archive cannot be read')
   await writeFile(join(backup,'target-content.json'),JSON.stringify({exam:current.exam,rows:current.rows},null,2))
   const removed:Record<string,number>={}
   const remove=async(table:string,where:string,args:any[])=>{removed[table]=(await c.query(`DELETE FROM ${table} WHERE ${where} RETURNING 1`,args)).rows.length}
   // These are content-only references, never accounts, exam settings or unrelated history.
   for(const table of ['content_notices_seen','content_origins','cheatsheet_pushes'])await remove(table,'content_id=ANY($1::text[])',[ids])
   await remove('question_knowledge_points','question_id=ANY($1::text[])',[questions])
   await remove('questions','exam_id=$1 AND id=ANY($2::text[])',[examId,questions])
   for(const kind of ['knowledge','section','chapter','subject']){
    const deleted=await c.query('DELETE FROM knowledge_nodes WHERE exam_id=$1 AND kind=$2 AND id=ANY($3::text[]) RETURNING id',[examId,kind,ids]);removed[kind]=deleted.rows.length
   }
   await remove('content_identity','id=ANY($1::text[])',[ids])
   assert.equal((await c.query('SELECT count(*)::int n FROM content WHERE exam_id=$1',[examId])).rows[0].n,0)
   assert.deepEqual((await c.query("SELECT * FROM knowledge_nodes WHERE kind='exam' ORDER BY id")).rows,examsBefore,'Exam roots changed')
   assert.equal(digest((await c.query('SELECT * FROM content WHERE exam_id IS DISTINCT FROM $1 ORDER BY id',[examId])).rows),otherBefore,'Unrelated content changed')
   assert.equal((await c.query("SELECT value FROM system_settings WHERE key='demo_seed_disabled'")).rows[0]?.value,'true','Demo seeding must remain disabled')
   await c.query('SET CONSTRAINTS ALL IMMEDIATE')
   const result={examId,title:current.exam.title,backup,removed,remainingContent:0,examPreserved:true,otherContentUnchanged:true}
   await c.query("INSERT INTO audit_logs(id,action,target_id,details) VALUES(gen_random_uuid()::text,'maintenance.test_cleanup',$1,$2)",[examId,JSON.stringify({...result,reason:'按用户要求清空中级社会工作师内容，保留考试项目，准备导入真实数据'})])
   return result
  })
  await writeFile(join(result.backup,'cleanup-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2))
 }
}finally{await closeDatabase()}
