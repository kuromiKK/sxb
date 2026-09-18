/** Explicit local maintenance: snapshot database + resources before removing marked records. */
import 'dotenv/config'
import {resolve,join} from 'node:path'
import {mkdir,cp,writeFile,access} from 'node:fs/promises'
import {spawnSync} from 'node:child_process'
import {db,transaction,closeDatabase} from '../apps/api/src/db.ts'
import {lockResourceReferences} from '../apps/api/src/editor-images.ts'
const apply=process.argv.includes('--apply')
const url=new URL(process.env.DATABASE_URL||'');if(!['127.0.0.1','localhost'].includes(url.hostname)||url.pathname!=='/sxb_local')throw Error('Only the confirmed local sxb_local database is supported')
const marked=(await db.query("SELECT c.table_name,c.column_name FROM information_schema.columns c JOIN information_schema.tables t USING(table_schema,table_name) WHERE c.table_schema='public' AND t.table_type='BASE TABLE' AND c.column_name IN ('is_test_data','is_test') ORDER BY c.table_name")).rows
const plan:any[]=[]
for(const t of marked){const where=t.column_name+'=true'+(t.table_name==='knowledge_nodes'?" AND kind<>'exam'":t.table_name==='users'?" AND account_kind='student'":'');const rows=(await db.query(`SELECT id FROM ${t.table_name} WHERE ${where}`)).rows;plan.push({...t,where,ids:rows.map(r=>r.id)})}
console.log('Marked targets',JSON.stringify(plan.map(p=>({table:p.table_name,count:p.ids.length}))))
if(!apply){await closeDatabase();process.exit(0)}
const backup=resolve('.local/backups','before-test-cleanup-'+new Date().toISOString().replace(/[:.]/g,'-'));await mkdir(backup,{recursive:true})
const executable=resolve('.local/postgresql-runtime/pgsql/bin/pg_dump.exe')
const dump=spawnSync(executable,['-h',url.hostname,'-p',url.port||'5432','-U',decodeURIComponent(url.username),'-d',url.pathname.slice(1),'-Fc','-f',join(backup,'database.dump')],{env:{...process.env,PGPASSWORD:decodeURIComponent(url.password)},windowsHide:true,encoding:'utf8'})
if(dump.status!==0)throw Error('Database backup failed; nothing deleted: '+dump.stderr)
const media=resolve(process.env.MEDIA_DIR||'.local/media');try{await access(media);await cp(media,join(backup,'media'),{recursive:true})}catch(e:any){if(e.code!=='ENOENT')throw e}
await cp(resolve('.env'),join(backup,'environment.env'));try{await cp(resolve('.local/secret.key'),join(backup,'secret.key'))}catch(e:any){if(e.code!=='ENOENT')throw e}
const result=await transaction(async c=>{
 await lockResourceReferences(c)
 const examsBefore=(await c.query("SELECT * FROM knowledge_nodes WHERE kind='exam' ORDER BY id")).rows
 const removed:Record<string,number>={},blocked:any[]=[]
 await c.query("INSERT INTO system_settings(key,value) VALUES('demo_seed_disabled','true') ON CONFLICT(key) DO UPDATE SET value='true',updated_at=now()")
 const count=async(table:string,sql:string,args:any[])=>{const result=await c.query(sql+' RETURNING 1',args);removed[table]=(removed[table]||0)+result.rows.length}
 const tests=plan.find(p=>p.table_name==='questions')?.ids||[],students=plan.find(p=>p.table_name==='users')?.ids||[],contents=(await c.query('SELECT id FROM content WHERE is_test_data')).rows.map(r=>r.id)
 // Dependent learning records are scoped to explicitly marked questions/users/content, never all records.
 for(const table of ['answers','question_submissions'])await count(table,`DELETE FROM ${table} WHERE question_id=ANY($1::text[]) OR user_id=ANY($2::text[])`,[tests,students])
 for(const table of ['learning_events','learning_visits','learning_daily_users','monthly_reports','user_protocol_consents','wechat_identities','referral_uses','user_records','content_notices_seen','sessions'])await count(table,`DELETE FROM ${table} WHERE user_id=ANY($1::text[])`,[students])
 await count('content_notices_seen','DELETE FROM content_notices_seen WHERE content_id=ANY($1::text[])',[contents])
 const orders=plan.find(p=>p.table_name==='orders')?.ids||[]
 for(const table of ['memberships','provider_payments'])await count(table,`DELETE FROM ${table} WHERE order_id=ANY($1::text[])`,[orders])
 let pending=plan.flatMap(p=>p.ids.map((id:string)=>({...p,id}))),progress=true
 while(progress&&pending.length){progress=false;const next=[];for(const p of pending){await c.query('SAVEPOINT cleanup_row');try{const r=await c.query(`DELETE FROM ${p.table_name} WHERE id=$1 AND ${p.where} RETURNING id`,[p.id]);await c.query('RELEASE SAVEPOINT cleanup_row');removed[p.table_name]=(removed[p.table_name]||0)+r.rows.length;progress=true}catch(e:any){await c.query('ROLLBACK TO SAVEPOINT cleanup_row');await c.query('RELEASE SAVEPOINT cleanup_row');if(e.code!=='23503')throw e;next.push({...p,reason:e.detail||e.message})}}pending=next}
 for(const p of pending)blocked.push({table:p.table_name,id:p.id,reason:p.reason})
 const examsAfter=(await c.query("SELECT * FROM knowledge_nodes WHERE kind='exam' ORDER BY id")).rows
 if(JSON.stringify(examsBefore)!==JSON.stringify(examsAfter))throw Error('Exam preservation check failed')
 await c.query("INSERT INTO audit_logs(id,action,details) VALUES(gen_random_uuid()::text,'maintenance.test_cleanup',$1)",[JSON.stringify({backup,removed,blocked})])
 return {backup,removed,blocked,examsPreserved:examsAfter.length}
})
await writeFile(join(backup,'cleanup-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));await closeDatabase()
