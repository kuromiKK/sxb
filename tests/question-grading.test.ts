import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import express from 'express'
import {ZodError} from 'zod'
import {newField,initialValues} from '../apps/shared/question-types.ts'

test('subjective grading preserves submissions, separates self scores, validates AI and serializes retries',async()=>{
  process.env.APP_MODE='test';process.env.DATABASE_URL='';process.env.LOCAL_DATABASE_DIR=await mkdtemp(join(tmpdir(),'sxb-grading-'));process.env.SECRET_KEY='c'.repeat(64);process.env.ADMIN_PHONE='18600000000';process.env.ADMIN_PASSWORD='Grading-Tests-42!'
  const {db,closeDatabase}=await import('../apps/api/src/db.ts'),{seed}=await import('../apps/api/src/seed.ts'),{initSecrets,session}=await import('../apps/api/src/security.ts'),{api}=await import('../apps/api/src/routes.ts')
  const {runSubmissionGrading,parseGradingResult,saveSelfScore,migrateQuestionGrading}=await import('../apps/api/src/question-grading.ts')
  let server:ReturnType<express.Express['listen']>|undefined
  try{
    await initSecrets();await seed();await migrateQuestionGrading()
    const admin=(await db.query("SELECT id FROM users WHERE account_kind='admin' LIMIT 1")).rows[0],student=(await db.query("SELECT id FROM users WHERE account_kind='student' LIMIT 1")).rows[0]
    const adminToken=await session(admin.id,'admin'),studentToken=await session(student.id,'student')
    const app=express();app.use(express.json());app.use('/api',api);app.use((e:any,_q:any,r:any,_n:any)=>r.status(e instanceof ZodError?400:e.status||500).json({message:e.message}));server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server!.once('listening',r));const origin='http://127.0.0.1:'+(server.address() as any).port+'/api'
    const call=async(path:string,body?:any,method=body?'POST':'GET',token=adminToken)=>fetch(origin+path,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:body?JSON.stringify(body):undefined})
    const json=async(path:string,body?:any,method?:string,token?:string)=>{const r=await call(path,body,method,token),data=await r.json();assert.equal(r.status,200,JSON.stringify(data));return data}
    const p=(await db.query("SELECT * FROM knowledge_nodes WHERE kind='knowledge' ORDER BY id LIMIT 1")).rows[0]
    const ai=newField('text','ai'),self=newField('text','self'),choice=newField('single','choice');ai.aiGrading=true
    const definition={fields:[choice,ai,self],examRules:{}}
    await json('/admin/question-types/ai-case',{name:'AI 与自评组合题',description:'测试',definition},'PUT')
    const values=initialValues(definition);values.ai={prompt:'原始题干',options:[],answer:[],reference:'原始参考答案',rubric:'原始评分要点',explanation:''};values.self={prompt:'自行核对问题',options:[],answer:[],reference:'自评参考',rubric:'自评依据',explanation:''};values.choice={prompt:'选择题',options:['正确','错误'],answer:[0],reference:'',rubric:'',explanation:'解析'}
    const row:any={id:'grading-test',kind:'question',exam_id:p.exam_id,parent_id:p.id,title:'判分测试',status:'draft',source:'test',is_test_data:true,payload:{type:'configured',templateId:'ai-case',templateVersion:1,stem:'判分测试',knowledgePointId:p.id,values}}
    const missing=structuredClone(row);missing.payload.values.ai.reference='';assert.equal((await call('/admin/content/invalid-ai',{...missing,id:'invalid-ai'},'PUT')).status,400)
    missing.payload.values.ai.reference='答案';missing.payload.values.ai.rubric='';assert.equal((await call('/admin/content/invalid-ai',{...missing,id:'invalid-ai'},'PUT')).status,400)
    await json('/admin/content/'+row.id,row,'PUT')
    const stored=async()=>(await db.query('SELECT * FROM content WHERE id=$1',[row.id])).rows[0]
    for(const status of ['review','published'])await json('/admin/content/'+row.id,{...await stored(),status},'PUT')
    const answers={ai:'根据原始资料进行说明',self:'自评答案',choice:[0]},body={examId:p.exam_id,questionId:row.id,requestId:'grading-request-001',answers}
    const first=await json('/answers/configured',body,'POST',studentToken)
    assert.equal(first.status,'ai_failed');assert.equal(first.score,null);assert.equal(first.fields.ai.score,null);assert.equal(first.fields.self.method,'self')
    assert.equal((await db.query('SELECT count(*)::int AS n FROM ai_calls')).rows[0].n,0,'Unconfigured AI must not create fake grades or paid calls')
    assert.deepEqual(await json('/answers/configured',body,'POST',studentToken),first)
    assert.equal((await db.query('SELECT grading_attempt FROM question_submissions WHERE id=$1',[first.submissionId])).rows[0].grading_attempt,1,'Idempotent submit must not auto retry')
    assert.equal((await call('/answers/submissions/'+first.submissionId+'/self-score',{fieldId:'ai',score:10},'POST',studentToken)).status,400)
    assert.equal((await call('/answers/submissions/'+first.submissionId+'/self-score',{fieldId:'choice',score:1},'POST',studentToken)).status,400)
    for(const score of [-1,11,1.234])assert.equal((await call('/answers/submissions/'+first.submissionId+'/self-score',{fieldId:'self',score},'POST',studentToken)).status,400)
    assert.equal((await call('/answers/submissions/'+first.submissionId+'/self-score',{fieldId:'self',score:5},'POST',adminToken)).status,403)
    await assert.rejects(saveSelfScore(admin.id,first.submissionId,{fieldId:'self',score:5}),/作答记录不存在/)
    const zero=await json('/answers/submissions/'+first.submissionId+'/self-score',{fieldId:'self',score:0},'POST',studentToken);assert.equal(zero.fields.self.score,0);assert.equal(zero.score,null)
    const changed=await stored();changed.payload.values.ai.reference='修改后的参考答案';await json('/admin/content/'+row.id,changed,'PUT')
    let release!:()=>void,entered!:()=>void,calls=0
    const gate=new Promise<void>(r=>{release=r}),started=new Promise<void>(r=>{entered=r})
    const runner:any=async(userId:string,featureId:string,prompt:string,_test:boolean,examId:string,context:any,options:any)=>{
      calls++;assert.equal(userId,student.id);assert.equal(featureId,'grading');assert.equal(examId,p.exam_id);assert.equal(context.submissionId,first.submissionId);assert.equal(options.requireLive,true)
      const data=JSON.parse(prompt);assert.equal(data.tasks[0].referenceAnswer,'原始参考答案');assert.equal(data.tasks[0].studentAnswer,answers.ai);assert.equal(data.tasks.length,1)
      entered();await gate
      const result=JSON.stringify({fields:[{id:'ai',score:7.5,feedback:'对应评分要点得分，遗漏一个论证环节。'}]});options.validateResult(result)
      return {id:'fixture-call',status:'success',result,error:'',mode:'live'}
    }
    const pending=runSubmissionGrading(student.id,first.submissionId,runner);await started
    const duplicate=await runSubmissionGrading(student.id,first.submissionId,runner);assert.equal(duplicate.status,'ai_processing');assert.equal(calls,1)
    await saveSelfScore(student.id,first.submissionId,{fieldId:'self',score:6})
    release();const graded=await pending
    assert.equal(graded.status,'self_graded');assert.equal(graded.score,14.5);assert.equal(graded.fields.ai.method,'ai');assert.equal(graded.fields.self.score,6);assert.equal(graded.correct,null)
    assert.equal((await db.query('SELECT count(*)::int AS n FROM answers WHERE question_id=$1',[row.id])).rows[0].n,0,'Subjective/self scores must not become objective correctness')
    assert.deepEqual(await runSubmissionGrading(student.id,first.submissionId,runner),graded);assert.equal(calls,1)
    const restored=await json('/answers/configured/'+row.id,undefined,'GET',studentToken)
    assert.deepEqual(restored.answers,answers);assert.equal(restored.result.score,14.5);assert.equal(restored.question.values.ai.reference,undefined);assert.equal(restored.result.fields.ai.reference,'原始参考答案')
    const expected=[{id:'ai',maxScore:10}]
    for(const raw of ['not JSON',JSON.stringify({fields:[]}),JSON.stringify({fields:[{id:'ai',score:11,feedback:'越界'}]}),JSON.stringify({fields:[{id:'ai',score:2.123,feedback:'精度'}]}),JSON.stringify({fields:[{id:'other',score:2,feedback:'错题'}]}),JSON.stringify({fields:[{id:'ai',score:2,feedback:''}]})])assert.throws(()=>parseGradingResult(raw,expected))
    const next=await json('/answers/configured',{...body,requestId:'grading-request-002'},'POST',studentToken)
    const bad=await runSubmissionGrading(student.id,next.submissionId,(async()=>({id:'bad',mode:'live',status:'success',result:'{"fields":[{"id":"ai","score":999,"feedback":"越界"}]}'})) as any)
    assert.equal(bad.fields.ai.score,null);assert.equal(bad.status,'ai_failed')
    const failed=await runSubmissionGrading(student.id,next.submissionId,(async()=>{throw new Error('测试超时')}) as any);assert.equal(failed.status,'ai_failed');assert.equal(failed.fields.ai.error,'测试超时')
    const mock=await runSubmissionGrading(student.id,next.submissionId,(async()=>({id:'mock',mode:'mock',status:'success',result:'{"fields":[{"id":"ai","score":5,"feedback":"模拟"}]}'})) as any);assert.equal(mock.score,null);assert.equal(mock.status,'ai_failed')
  }finally{if(server)await new Promise<void>(r=>server!.close(()=>r()));await closeDatabase()}
})
