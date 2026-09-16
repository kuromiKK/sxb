import {existsSync,readFileSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
import {resolve} from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
import pg from 'pg'
import dotenv from 'dotenv'

const root=fileURLToPath(new URL('../',import.meta.url))
export async function startLocalPostgres(){
 const settings=resolve(root,'.local/postgresql/connection.json')
 if(!existsSync(settings))return
 const env=dotenv.parse(readFileSync(resolve(root,'.env')))
 if(!env.DATABASE_URL)return
 const c=JSON.parse(readFileSync(settings,'utf8')),url=new URL(env.DATABASE_URL)
 // Only manage this project's portable database, never another configured server.
 if(url.hostname!=='127.0.0.1'||Number(url.port||5432)!==c.port||decodeURIComponent(url.pathname.slice(1))!==c.database)return
 const executable=resolve(root,'.local/postgresql-runtime/pgsql/bin/pg_ctl.exe'),data=resolve(root,'.local/postgresql/data')
 try{execFileSync(executable,['status','-D',data],{stdio:'ignore',windowsHide:true})}
 catch{execFileSync(executable,['start','-D',data,'-l',resolve(root,'.local/postgresql/server.log'),'-w','-t','30'],{stdio:'ignore',windowsHide:true})}
 const client=new pg.Client({connectionString:env.DATABASE_URL,connectionTimeoutMillis:5000})
 try{await client.connect();await client.query('SELECT 1')}finally{await client.end()}
 console.log('postgresql: ready on 127.0.0.1:'+c.port)
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)startLocalPostgres().catch(()=>{console.error('PostgreSQL 启动失败，请检查 .local/postgresql/server.log');process.exitCode=1})
