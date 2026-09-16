// Offline, one-way migration into an EMPTY local PostgreSQL database.
// The API must be stopped. Original PGlite data is retained; .env changes only after verification.
import {readFile,writeFile,mkdir,cp,readdir,access} from 'node:fs/promises'
import {resolve,join} from 'node:path'
import {execFileSync,spawnSync} from 'node:child_process'
import {createHash,createDecipheriv} from 'node:crypto'
import net from 'node:net'
import dotenv from 'dotenv'
import pg from 'pg'
import {PGlite} from '@electric-sql/pglite'
import {pgDump} from '@electric-sql/pglite-tools/pg_dump'

const quote=s=>'"'+s.replaceAll('"','""')+'"'
const envText=await readFile('.env','utf8'),env=dotenv.parse(envText)
if(env.DATABASE_URL)throw Error('DATABASE_URL already configured; refusing to migrate over an existing connection')
const listening=await new Promise(r=>{const s=net.connect({host:'127.0.0.1',port:Number(env.API_PORT||4310)});s.once('connect',()=>{s.destroy();r(true)});s.once('error',()=>r(false))})
if(listening)throw Error('Stop this project API before migration')
const config=JSON.parse(await readFile('.local/postgresql/connection.json','utf8'))
if(config.host!=='127.0.0.1'||config.database!=='sxb_local')throw Error('Expected this project local PostgreSQL target')
const target=new pg.Client({host:config.host,port:config.port,user:config.user,password:config.password,database:config.database})
await target.connect()
let source
const backup=resolve('.local/backups/postgresql-migration-'+new Date().toISOString().replace(/[:.]/g,'-'))
const sourceDir=resolve(env.LOCAL_DATABASE_DIR||'.local/database'),mediaDir=resolve(env.MEDIA_DIR||'.local/media')
const objectsSQL="SELECT n.nspname schema,c.relname name,c.relkind kind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND c.relkind IN ('r','v','S') ORDER BY 1,2"
async function inventory(client){
 await client.query("SET TIME ZONE 'UTC'")
 const objects=(await client.query(objectsSQL)).rows
 const tables=[]
 for(const o of objects.filter(o=>o.kind==='r')){
  const name=quote(o.schema)+'.'+quote(o.name)
  const row=(await client.query(`SELECT count(*)::int count,md5(COALESCE(string_agg(md5(row_to_json(t)::text),'' ORDER BY md5(row_to_json(t)::text)),'')) digest FROM ${name} t`)).rows[0]
  tables.push({schema:o.schema,name:o.name,...row})
 }
 const columns=(await client.query("SELECT table_schema,table_name,column_name,ordinal_position,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema IN ('public','migration_archive') ORDER BY 1,2,4")).rows
 const constraints=(await client.query("SELECT n.nspname schema,c.conname name,pg_get_constraintdef(c.oid) definition FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname IN ('public','migration_archive') ORDER BY 1,2,3")).rows
 const indexes=(await client.query("SELECT schemaname,tablename,indexname,indexdef FROM pg_indexes WHERE schemaname IN ('public','migration_archive') ORDER BY 1,2,3")).rows
 return {objects,tables,columns,constraints,indexes}
}
async function fileInventory(directory,prefix=''){
 const result=[]
 for(const entry of await readdir(join(directory,prefix),{withFileTypes:true})){
  const name=join(prefix,entry.name)
  if(entry.isDirectory())result.push(...await fileInventory(directory,name))
  else if(entry.isFile()){const contents=await readFile(join(directory,name));result.push({name,size:contents.length,sha256:createHash('sha256').update(contents).digest('hex')})}
 }
 return result.sort((a,b)=>a.name.localeCompare(b.name))
}
function equal(a,b,label){if(JSON.stringify(a)!==JSON.stringify(b))throw Error(label+' verification failed; connection not switched')}
try{
 if((await target.query(objectsSQL)).rows.length)throw Error('Target database is not empty; refusing to overwrite')
 await access(join(sourceDir,'PG_VERSION'))
 await mkdir(backup,{recursive:false})
 if(process.platform==='win32'){
  const sid=execFileSync('whoami',['/user','/fo','csv','/nh'],{encoding:'utf8'}).trim().split(',')[1].replaceAll('"','')
  execFileSync('icacls',[backup,'/inheritance:r','/grant:r','*'+sid+':(OI)(CI)F','*S-1-5-18:(OI)(CI)F'],{stdio:'ignore',windowsHide:true})
 }
 await cp(sourceDir,join(backup,'pglite'),{recursive:true,errorOnExist:true,force:false})
 await cp(mediaDir,join(backup,'media'),{recursive:true,errorOnExist:true,force:false})
 await cp('.env',join(backup,'.env'))
 for(const [from,to] of [['.local/secret.key','secret.key'],['.local/go-captcha/sxb-config.json','gocaptcha-config.json'],['.local/postgresql/connection.json','postgresql-connection.json']]){
  try{await access(from)}catch{continue}
  await cp(from,join(backup,to))
 }
 const mediaBefore=await fileInventory(mediaDir)
 equal(mediaBefore,await fileInventory(join(backup,'media')),'Media backup')
 console.log('Offline backup ready: '+backup+'; media files: '+mediaBefore.length)
 // Export the backup copy; even recovery or export cannot alter the original directory.
 source=await PGlite.create(join(backup,'pglite'))
 const before=await inventory(source)
 console.log('Exporting '+before.tables.length+' tables, '+before.tables.reduce((n,t)=>n+t.count,0)+' rows')
 const dump=await pgDump({pg:source,args:['--no-owner','--no-acl']})
 const dumpPath=join(backup,'database.sql')
 await writeFile(dumpPath,Buffer.from(await dump.arrayBuffer()),{mode:0o600,flag:'wx'})
 const restore=spawnSync(resolve('.local/postgresql-runtime/pgsql/bin/psql.exe'),['-X','--no-password','-h',config.host,'-p',String(config.port),'-U',config.user,'-d',config.database,'--set=ON_ERROR_STOP=1','--single-transaction','--file',dumpPath],{env:{...process.env,PGPASSWORD:config.password,PGCLIENTENCODING:'UTF8'},encoding:'utf8',windowsHide:true,maxBuffer:32*1024*1024})
 await writeFile(join(backup,'restore.log'),(restore.stdout||'')+'\n'+(restore.stderr||''),{mode:0o600})
 if(restore.status!==0)throw Error('Restore failed; transaction rolled back. See protected backup restore.log')
 const after=await inventory(target)
 for(const name of Object.keys(before))equal(before[name],after[name],name)
 const key=Buffer.from(env.SECRET_KEY||await readFile('.local/secret.key','utf8'),'hex')
 let verifiedSecrets=0
 for(const [table,column] of [['ai_features','encrypted_key'],['integration_settings','secrets'],['provider_payments','secrets']]){
  const {rows}=await target.query(`SELECT ${quote(column)} value FROM ${quote(table)} WHERE ${quote(column)} IS NOT NULL AND ${quote(column)}<>''`)
  for(const row of rows){const [iv,tag,data]=row.value.split('.').map(v=>Buffer.from(v,'base64'));const decipher=createDecipheriv('aes-256-gcm',key,iv);decipher.setAuthTag(tag);decipher.update(data);decipher.final();verifiedSecrets++}
 }
 equal(mediaBefore,await fileInventory(mediaDir),'Live media files')
 const report={backup,source:'PGlite',target:'PostgreSQL',database:config.database,serverVersion:(await target.query('SHOW server_version')).rows[0].server_version,verifiedSecrets,media:mediaBefore,...after}
 await writeFile(join(backup,'verification.json'),JSON.stringify(report,null,2),{mode:0o600})
 await writeFile('.local/postgresql/migration.json',JSON.stringify({backup,tables:after.tables.length,rows:after.tables.reduce((n,t)=>n+t.count,0),mediaFiles:mediaBefore.length,verifiedSecrets,completedAt:new Date().toISOString()},null,2),{mode:0o600})
 // Change only the database setting, after all checks pass; preserve every other value.
 equal(await readFile('.env','utf8'),envText,'Unchanged environment')
 const connection=`postgresql://${encodeURIComponent(config.user)}:${encodeURIComponent(config.password)}@127.0.0.1:${config.port}/${config.database}`
 const updated=/^DATABASE_URL\s*=/m.test(envText)?envText.replace(/^DATABASE_URL\s*=.*$/m,'DATABASE_URL='+connection):envText.trimEnd()+'\nDATABASE_URL='+connection+'\n'
 await writeFile('.env',updated,{mode:0o600})
 console.log('Verified all table contents, columns, constraints, indexes, media and '+verifiedSecrets+' encrypted settings. DATABASE_URL switched; original PGlite retained.')
}finally{if(source)await source.close();await target.end()}
