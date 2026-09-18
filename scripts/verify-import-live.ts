import 'dotenv/config'
import assert from 'node:assert/strict'
import {db,closeDatabase} from '../apps/api/src/db.ts'
import {session,hash} from '../apps/api/src/security.ts'
const admin=(await db.query("SELECT id FROM users WHERE account_kind='admin' AND enabled AND admin_deleted_at IS NULL LIMIT 1")).rows[0]
const token=await session(admin.id,'admin')
try{
 const get=async(path:string)=>{const r=await fetch('http://127.0.0.1:4310/api'+path,{headers:{Authorization:'Bearer '+token}});assert.equal(r.status,200,await r.clone().text());return r.json()}
 const exams=await get('/admin/exam-projects');assert.equal(exams.length,2)
 assert.equal((await get('/admin/bulk-content?test=true')).total,0)
 const nodes=(await db.query("SELECT id FROM knowledge_nodes WHERE kind='knowledge' ORDER BY id LIMIT 1")).rows
 const questions=(await db.query('SELECT id FROM questions ORDER BY id LIMIT 1')).rows
 for(const r of [...nodes,...questions])assert.ok((await get('/admin/content?search='+encodeURIComponent(r.id))).items.some((item:any)=>item.id===r.id))
 const resources=await get('/admin/resources'),asset=resources.items[0];if(asset)assert.equal((await get('/admin/resources?search='+asset.id)).total,1)
 const jobs=await get('/admin/import-jobs?examId='+exams[0].id);assert.ok(Array.isArray(jobs))
 const dict=await get('/admin/data-dictionary');assert.equal(dict.summary.undocumented,0)
 assert.equal((await db.query("SELECT count(*)::int AS n FROM message_templates WHERE is_test_data")).rows[0].n,0)
 const result=(await db.query('SELECT kind,is_test_data,count(*)::int AS n FROM content GROUP BY kind,is_test_data ORDER BY kind')).rows
 console.log(JSON.stringify({exams:exams.length,content:result,resources:resources.summary.total,idSearch:'passed',importRoutes:'passed',sourceSchema:'passed',testSeed:'disabled'},null,2))
}finally{await db.query('DELETE FROM sessions WHERE token_hash=$1',[hash(token)]);await closeDatabase()}
