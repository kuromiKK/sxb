import test from 'node:test'
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import express from 'express'
import { ZodError } from 'zod'
import { migrateQuestionGradeTable } from '../apps/api/src/question-grades.ts'

test('question grade migration preserves existing rows and constrains all five grades',async()=>{
  const db=new PGlite()
  try{
    await db.exec("CREATE TABLE schema_versions(version integer PRIMARY KEY); CREATE TABLE questions(id text PRIMARY KEY,payload jsonb); INSERT INTO questions VALUES('old','{\"answer\":[0]}')")
    await db.transaction(c=>migrateQuestionGradeTable(c as any))
    await db.transaction(c=>migrateQuestionGradeTable(c as any))
    assert.deepEqual((await db.query('SELECT * FROM questions')).rows,[{id:'old',payload:{answer:[0]},grade:null}])
    for(const grade of ['A','B','C','D','E']){
      await db.query('UPDATE questions SET grade=$1',[grade])
      assert.equal((await db.query<any>('SELECT grade FROM questions')).rows[0].grade,grade)
    }
    for(const grade of ['F','a','',1])await assert.rejects(db.query('UPDATE questions SET grade=$1',[grade]),/questions_grade_check/)
    await db.query('UPDATE questions SET grade=NULL')
    await db.query("INSERT INTO questions(id) VALUES('new')")
    assert((await db.query<any>('SELECT grade FROM questions')).rows.every(q=>q.grade===null))
  }finally{await db.close()}
})

test('question API persists grades, rejects invalid values, preserves omitted grades and public catalog',async()=>{
  process.env.APP_MODE='test';process.env.DATABASE_URL='';process.env.LOCAL_DATABASE_DIR=await mkdtemp(join(tmpdir(),'sxb-question-grades-'))
  process.env.SECRET_KEY='1'.repeat(64);process.env.ADMIN_PHONE='18600000000';process.env.ADMIN_PASSWORD='Isolated-grade-test-42!'
  const {db,closeDatabase}=await import('../apps/api/src/db.ts')
  const {seed}=await import('../apps/api/src/seed.ts')
  const {session,initSecrets}=await import('../apps/api/src/security.ts')
  const {api}=await import('../apps/api/src/routes.ts')
  const {catalog}=await import('../apps/api/src/content.ts')
  let server:ReturnType<express.Express['listen']>|undefined
  try{
    await initSecrets();await seed()
    const user=(await db.query("SELECT id FROM users WHERE account_kind='admin' LIMIT 1")).rows[0]
    const token=await session(user.id,'admin')
    const app=express();app.use(express.json());app.use('/api',api)
    app.use((e:any,_req:any,res:any,_next:any)=>res.status(e instanceof ZodError?400:e.status||500).json({message:e.message}))
    server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server!.once('listening',r))
    const origin='http://127.0.0.1:'+(server.address() as any).port
    const headers={'Content-Type':'application/json',Authorization:'Bearer '+token}
    const original=(await db.query("SELECT * FROM content WHERE kind='question' AND status='published' LIMIT 1")).rows[0]
    const publicBefore=await catalog(original.exam_id)
    const linksBefore=(await db.query('SELECT * FROM question_knowledge_points WHERE question_id=$1 ORDER BY knowledge_id',[original.id])).rows
    const row=async()=>(await db.query('SELECT * FROM content WHERE id=$1',[original.id])).rows[0]
    const save=async(body:any)=>fetch(origin+'/api/admin/content/'+body.id,{method:'PUT',headers,body:JSON.stringify(body)})
    const read=async()=>(await (await fetch(origin+'/api/admin/content?kind=question&search='+encodeURIComponent(original.title),{headers})).json()).items.find((q:any)=>q.id===original.id)
    assert.equal((await read()).grade,null)
    for(const grade of ['A','B','C','D','E']){
      assert.equal((await save({...await row(),grade})).status,200)
      assert.equal((await read()).grade,grade)
      assert.equal((await db.query('SELECT grade FROM questions WHERE id=$1',[original.id])).rows[0].grade,grade)
    }
    const beforeBad=await row()
    for(const grade of ['F','a','',1,{},[]])assert.equal((await save({...beforeBad,grade})).status,400)
    assert.deepEqual(await row(),beforeBad)
    assert.equal((await save({...await row(),title:original.title+' 已编辑'})).status,200)
    assert.equal((await db.query('SELECT grade FROM questions WHERE id=$1',[original.id])).rows[0].grade,'E')
    assert.equal((await save({...await row(),title:original.title,grade:null})).status,200)
    assert.equal((await read()).grade,null)
    const fresh={...await row(),id:'grade-test-new',version:undefined,status:'draft',grade:'B'}
    assert.equal((await save(fresh)).status,200)
    await seed()
    assert.equal((await db.query("SELECT grade FROM questions WHERE id='grade-test-new'")).rows[0].grade,'B')
    // Public fields and answer visibility stay unchanged (apart from update time).
    const publicAfter=await catalog(original.exam_id)
    const clean=(q:any)=>{const {updatedAt,...rest}=q;return rest}
    assert.deepEqual(publicAfter.practiceQuestions.map(clean),publicBefore.practiceQuestions.map(clean))
    assert(publicAfter.practiceQuestions.every((q:any)=>!('grade' in q)))
    assert.deepEqual((await db.query('SELECT * FROM question_knowledge_points WHERE question_id=$1 ORDER BY knowledge_id',[original.id])).rows,linksBefore)
  }finally{if(server)await new Promise<void>(r=>server!.close(()=>r()));await closeDatabase()}
})
