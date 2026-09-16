import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import express from 'express'
import { ZodError } from 'zod'
import { activeDates, allocate, schedule, chinaDate, addDays } from '../apps/user/src/utils/plan-schedule.ts'

test('plan integer allocation and Beijing calendar',()=>{
  const dates=activeDates('2027-05-22','2027-05-30',[],[])
  assert.deepEqual(allocate(480,dates).map(d=>d.count),[54,54,54,53,53,53,53,53,53])
  for(let n=0;n<1000;n++){
    const result=allocate(n,dates)
    assert.equal(result.reduce((s,d)=>s+d.count,0),n)
    assert(Math.max(...result.map(d=>d.count))-Math.min(...result.map(d=>d.count))<=1)
  }
  assert.deepEqual(allocate(10,[]),[])
  assert.equal(chinaDate('2026-09-07T16:01:00Z'),'2026-09-08')
  assert.deepEqual(activeDates('2026-09-07','2026-09-13',[0,6],['2026-09-07']),['2026-09-08','2026-09-09','2026-09-10','2026-09-11'])
  assert.equal(addDays('2028-02-28',1),'2028-02-29')
  const ten=activeDates('2027-05-21','2027-05-30',[],[])
  const partiallyDone=schedule(480,20,ten,ten[0],null)
  assert.equal(partiallyDone[0].count,30)
  assert.equal(partiallyDone.reduce((s,d)=>s+d.count,0),480)
  assert.deepEqual(schedule(480,0,dates,dates[0],null).map(d=>d.count),[54,54,54,53,53,53,53,53,53])
  assert.equal(schedule(480,0,dates,dates[0],30).reduce((s,d)=>s+d.count,0),270)
  assert.equal(schedule(3,0,dates,dates[0],100)[0].count,3)
})

test('learning plans and editable exam taxonomy use real scoped records',async t=>{
  process.env.APP_MODE='test';process.env.DATABASE_URL=''
  process.env.LOCAL_DATABASE_DIR=await mkdtemp(join(tmpdir(),'sxb-plans-'))
  process.env.SECRET_KEY='3'.repeat(64)
  process.env.ADMIN_PHONE='18600513966';process.env.ADMIN_PASSWORD='Plan-Test-1234!'
  const {db,closeDatabase}=await import('../apps/api/src/db.ts')
  const {seed}=await import('../apps/api/src/seed.ts')
  const {api}=await import('../apps/api/src/routes.ts')
  const {initSecrets,session,id}=await import('../apps/api/src/security.ts')
  await initSecrets();await seed()
  const student=await session('test-student-003')
  const other=await session('test-student-002')
  const adminId=(await db.query("SELECT id FROM users WHERE account_kind='admin' LIMIT 1")).rows[0].id
  const admin=await session(adminId,'admin')
  const app=express();app.use(express.json());app.use('/api',api)
  app.use((e:any,_q:any,r:any,_n:any)=>r.status(e instanceof ZodError?400:e.status||500).json({message:e.message}))
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r))
  async function req(path:string,method='GET',body?:any,token=student){const r=await fetch(`http://127.0.0.1:${(server.address() as any).port}/api${path}`,{method,headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json() as any}}
  const route='/learning-plan/junior-social-worker'
  const payload={subjectIds:['ability'],chapterIds:['ability-chapter-1'],dailyTarget:50,targetCustomized:true,restWeekdays:[6,0],skipDates:[],round:'coverage',includeCourses:true,includeWrong:true,includeNotes:true,includeCheatSheets:true}
  try{
    await t.test('default plan, rights and chapter-derived totals',async()=>{
      const r=await req(route);assert.equal(r.status,200);assert.equal(r.data.config.prepDays,90)
      assert.equal((await req('/learning-plan/mid-social-worker')).data.config.prepDays,120)
      const save=await req(route,'PUT',{...payload,total:99999})
      assert.equal(save.status,200);assert.equal(save.data.plan.total,3)
      assert.deepEqual(save.data.plan.questionIds,['q-001','q-002','q-003'])
      assert.equal(save.data.plan.target,50)
      assert.equal((await req(route)).data.plan.target,50)
      assert.equal((await req(route,'GET',undefined,other)).data.plan.targetCustomized,false)
      assert.equal((await req(route,'GET',undefined,'')).status,401)
    })
    await t.test('reject foreign IDs, sections masquerading as chapters, mismatches and invalid dates',async()=>{
      for(const changes of [{chapterIds:['mid-chapter-test']},{chapterIds:['ability-section-1-1']},{subjectIds:['practice']},{questionIds:['q-001']},{restWeekdays:[0,1,2,3]},{skipDates:['2027-02-31']},{dailyTarget:-1}]) assert.equal((await req(route,'PUT',{...payload,...changes})).status,400)
    })
    await t.test('empty-question chapters retain their subject and cannot bypass plan validation',async()=>{
      await db.query("INSERT INTO content(id,exam_id,kind,parent_id,title,payload,status,source,is_test_data) VALUES('plan-empty-chapter','junior-social-worker','chapter','ability','测试无题章','{}','published','test',true)")
      const save=await req(route,'PUT',{...payload,chapterIds:['plan-empty-chapter']})
      assert.equal(save.status,200)
      assert(save.data.plan.subjectIds.includes('ability'))
      assert.equal(save.data.plan.total,0)
      assert.equal((await req('/records/junior-social-worker','PUT',{kind:'plan',sourceId:'current',payload:{dailyTarget:-10}})).status,400)
      assert.equal((await req(route)).data.plan.target,50)
    })
    await t.test('skip today means zero; custom shortfall is visible; refresh keeps choices',async()=>{
      const r=await req(route,'PUT',{...payload,skipDates:[chinaDate()],dailyTarget:0})
      assert.equal(r.status,200);assert.equal(r.data.progress.todayTarget,0);assert.equal(r.data.progress.isRest,true)
      assert.equal(r.data.preview[0].count,0);assert.equal(r.data.progress.unscheduled,r.data.progress.remaining)
      assert.equal((await req(route)).data.plan.skipDates[0],chinaDate())
    })
    await t.test('actual answers advance rounds without counting out-of-scope questions',async()=>{
      const uid='plan-fresh-student'
      await db.query("INSERT INTO users(id,phone,nickname,invite_code) VALUES($1,'18899990000','测试计划学员','89012345')",[uid])
      const fresh=await session(uid)
      await req(route,'PUT',{...payload,restWeekdays:[],dailyTarget:1,targetCustomized:false},fresh)
      assert.equal((await req(route,'GET',undefined,fresh)).data.progress.completed,0)
      for(const [i,q] of ['q-004','q-001','q-002','q-003'].entries())await db.query('INSERT INTO answers(id,user_id,exam_id,question_id,selection,correct,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)',[id(),uid,'junior-social-worker',q,'[0]',q!=='q-002',new Date(Date.now()-10000+i*1000).toISOString()])
      const r=(await req(route,'GET',undefined,fresh)).data
      assert.equal(r.progress.roundNumber,2);assert.equal(r.progress.round,'consolidation');assert.equal(r.progress.completed,0);assert.equal(r.progress.remaining,3)
      assert.equal(r.questionIds[0],'q-002');assert(!r.questionIds.includes('q-004'))
      await db.query('INSERT INTO answers(id,user_id,exam_id,question_id,selection,correct) VALUES($1,$2,$3,$4,$5,true)',[id(),uid,'junior-social-worker','q-002','[0]'])
      assert.equal((await req(route,'GET',undefined,fresh)).data.progress.completed,1)
      assert.equal((await req('/learning-plan/mid-social-worker','GET',undefined,fresh)).data.progress.completed,0)
    })
    await t.test('published descendants only; course reminders require actual section courses',async()=>{
      await req(route,'PUT',{...payload,restWeekdays:[]})
      await db.query("UPDATE content SET status='offline' WHERE id='ability-section-1-2'")
      const r=(await req(route)).data
      assert(!r.plan.questionIds.includes('q-003'))
      assert(r.reminders.every((v:any)=>!v.url.includes('course-point-')))
      await db.query("UPDATE content SET status='published' WHERE id='ability-section-1-2'")
    })
    await t.test('admin-only configuration, flat categories and disable propagation',async()=>{
      const config='/admin/exams/junior-social-worker/plan-config'
      const body={prepDays:100,sprintDays:14,defaultRestDays:2,defaultRound:'coverage'}
      assert.equal((await req(config,'PUT',body)).status,403)
      assert.equal((await req(config,'PUT',body,admin)).status,200)
      assert.equal((await req(route)).data.config.prepDays,100)
      const parent={name:'测试分类',parentId:null,sortOrder:30,enabled:true}
      assert.equal((await req('/admin/exam-management/categories/test-root','PUT',parent,admin)).status,200)
      // Category editing already uses a flat taxonomy; the knowledge hierarchy is separate.
      assert.equal((await req('/admin/exam-management/categories/test-child','PUT',{...parent,parentId:'test-root'},admin)).status,400)
      assert.equal((await req('/admin/exam-management/categories/test-third','PUT',{...parent,parentId:'test-child'},admin)).status,400)
      assert.equal((await req('/admin/exam-management/categories/test-root','PUT',{...parent,enabled:false},admin)).status,200)
      assert(!(await req('/exam-tree')).data.some((c:any)=>c.id==='test-root'))
    })
    await t.test('one global current cycle for manual grants',async()=>{
      const cycles=(await db.query('SELECT * FROM exam_cycles WHERE exam_id=$1 AND ends_at>now() ORDER BY ends_at',['junior-social-worker'])).rows
      const r=await req('/admin/users/test-student-003/entitlements/junior-social-worker','PUT',{action:'set',level:'vip',version:0,reason:'测试未来考期',cycleId:cycles[1].id},admin)
      assert.equal(r.status,400)
    })
  }finally{await new Promise<void>(r=>server.close(()=>r()));await closeDatabase()}
})
