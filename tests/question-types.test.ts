import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import express from 'express'
import {ZodError} from 'zod'
import ExcelJS from 'exceljs'
import {newField,initialValues,publicQuestion} from '../apps/shared/question-types.ts'

test('configurable question types: versioning, composite scoring, privacy, exam isolation and XLSX round trip',async()=>{
  process.env.APP_MODE='test';process.env.DATABASE_URL='';process.env.LOCAL_DATABASE_DIR=await mkdtemp(join(tmpdir(),'sxb-question-types-'));process.env.SECRET_KEY='a'.repeat(64);process.env.ADMIN_PHONE='18600000000';process.env.ADMIN_PASSWORD='Question-Type-Test-42!'
  const {db,closeDatabase}=await import('../apps/api/src/db.ts')
  const {seed}=await import('../apps/api/src/seed.ts')
  const {initSecrets,session}=await import('../apps/api/src/security.ts')
  const {api}=await import('../apps/api/src/routes.ts')
  const {catalog}=await import('../apps/api/src/content.ts')
  const {validateDefinition,gradeConfigured}=await import('../apps/api/src/question-types.ts')
  let server:ReturnType<express.Express['listen']>|undefined
  try{
    await initSecrets();await seed()
    const before=(await db.query('SELECT id,grade,payload FROM questions ORDER BY id')).rows
    await seed();assert.deepEqual((await db.query('SELECT id,grade,payload FROM questions ORDER BY id')).rows,before)
    const admin=(await db.query("SELECT id FROM users WHERE account_kind='admin' LIMIT 1")).rows[0]
    const student=(await db.query("SELECT id FROM users WHERE account_kind='student' LIMIT 1")).rows[0]
    const adminToken=await session(admin.id,'admin'),studentToken=await session(student.id,'student')
    const app=express();app.use(express.json({limit:'16mb'}));app.use('/api',api);app.use((e:any,_q:any,r:any,_n:any)=>r.status(e instanceof ZodError?400:e.status||500).json({message:e.message}))
    server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server!.once('listening',r));const origin='http://127.0.0.1:'+(server.address() as any).port+'/api'
    const call=async(path:string,body?:any,method=body?'POST':'GET',token=adminToken)=>fetch(origin+path,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:body?JSON.stringify(body):undefined})
    const json=async(path:string,body?:any,method?:string,token?:string)=>{const r=await call(path,body,method,token);const data=await r.json();assert.equal(r.status,200,JSON.stringify(data));return data}
    const types=await json('/admin/question-types');assert.deepEqual(types.map((t:any)=>t.name).sort(),['单选题','多选题','主观题','判断题'].sort())
    assert.equal((await call('/admin/question-types',undefined,'GET',studentToken)).status,403)
    const points=(await db.query("SELECT * FROM knowledge_nodes WHERE kind='knowledge' ORDER BY exam_id,id")).rows
    const point=points[0],second=points.find(p=>p.exam_id===point.exam_id&&p.id!==point.id),other=points.find(p=>p.exam_id!==point.exam_id)
    const material=newField('material','material'),shared=newField('options','shared'),group=newField('group','group'),choice=newField('multiple','choice'),written=newField('text','written')
    choice.optionsSource='shared';choice.maxScore=2;choice.scoring='partial';choice.partialScore=0.5;written.maxScore=10;group.children=[choice,written]
    const definition={fields:[material,shared,group],examRules:{[point.exam_id]:{choice:{maxScore:4,scoring:'partial',partialScore:1}}}}
    const template=await json('/admin/question-types/custom-case',{name:'可配置案例分析',description:'测试',definition},'PUT');assert.equal(template.version,1)
    const vals=initialValues(definition as any);Object.assign(vals,{material:'私密测试案例内容',shared:['甲','乙','丙','丁'],choice:{prompt:'选择正确项',options:[],answer:[0,2,3],explanation:'私密解析'},written:{prompt:'说明理由',options:[],answer:[],reference:'私密参考答案',rubric:'私密评分标准',explanation:'主观解析'}})
    const row:any={id:'configured-case',exam_id:point.exam_id,kind:'question',parent_id:point.id,title:'组合题测试',status:'draft',payload:{type:'configured',templateId:'custom-case',templateVersion:1,stem:'组合题测试',knowledgePointId:point.id,knowledgePointIds:[point.id,second.id],values:vals,definition:{fields:[]}},grade:'B',source:'test',is_test_data:true}
    await json('/admin/content/'+row.id,row,'PUT')
    const stored=async()=>(await db.query('SELECT * FROM content WHERE id=$1',[row.id])).rows[0]
    assert.equal((await stored()).payload.definition.fields[2].children[0].maxScore,4)
    assert.equal((await db.query('SELECT grade FROM questions WHERE id=$1',[row.id])).rows[0].grade,'B')
    assert.equal((await call('/admin/content/cross-exam',{...row,id:'cross-exam',payload:{...row.payload,knowledgePointIds:[point.id,other.id]}},'PUT')).status,400)
    const invalid=structuredClone(row);invalid.payload.values.choice.answer=[99];assert.equal((await call('/admin/content/invalid-choice',{...invalid,id:'invalid-choice'},'PUT')).status,400)
    for(const status of ['review','published'])await json('/admin/content/'+row.id,{...await stored(),status},'PUT')
    const publicRow=(await catalog(point.exam_id)).practiceQuestions.find(q=>q.id===row.id)!
    const serialized=JSON.stringify(publicRow);for(const secret of ['私密解析','私密参考答案','私密评分标准'])assert(!serialized.includes(secret))
    assert.equal(publicRow.values.choice.answer,undefined);assert.equal(publicRow.values.written.reference,undefined)
    const result=await json('/answers/configured',{examId:point.exam_id,questionId:row.id,requestId:'case-request-001',answers:{choice:[0],written:'这是我的作答'}},'POST',studentToken)
    assert.equal(result.score,null);assert.equal(result.status,'self_review');assert.equal(result.objectiveScore,1);assert.equal(result.fields.written.score,null);assert.equal(result.fields.written.method,'self')
    assert.equal((await db.query('SELECT count(*)::int AS n FROM question_submissions')).rows[0].n,1)
    assert.equal((await db.query('SELECT count(*)::int AS n FROM answers WHERE question_id=$1',[row.id])).rows[0].n,0)
    assert.deepEqual(await json('/answers/configured',{examId:point.exam_id,questionId:row.id,requestId:'case-request-001',answers:{written:'这是我的作答',choice:[0]}},'POST',studentToken),result)
    assert.equal((await call('/answers/configured',{examId:point.exam_id,questionId:row.id,requestId:'case-request-001',answers:{choice:[0,2],written:'改答案'}},'POST',studentToken)).status,409)
    assert.equal((await call('/answers/configured',{examId:point.exam_id,questionId:row.id,requestId:'case-request-002',answers:{choice:[0,0],written:'答'}},'POST',studentToken)).status,400)
    const payload=(await stored()).payload
    assert.equal(gradeConfigured(payload,{choice:[0,2,3],written:'答'}).objectiveScore,4)
    assert.equal(gradeConfigured(payload,{choice:[0,1],written:'答'}).objectiveScore,0)
    const exportFile=await call('/admin/question-type-imports/file?typeId=custom-case&examId='+point.exam_id+'&mode=export')
    assert.equal(exportFile.status,200);const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(Buffer.from(await exportFile.arrayBuffer()) as any)
    const sheet=workbook.getWorksheet('题目')!;assert.equal(sheet.rowCount,2);assert.equal(sheet.getCell(2,4).value,'B');assert.equal(sheet.getCell(2,3).value,[point.id,second.id].join(','))
    sheet.getCell(2,1).value='configured-imported'
    const fileData=Buffer.from(await workbook.xlsx.writeBuffer()).toString('base64')
    const preview=await json('/admin/question-type-imports/preview',{examId:point.exam_id,typeId:'custom-case',filename:'roundtrip.xlsx',data:fileData})
    assert.deepEqual(preview.errors,[]);assert.deepEqual(preview.rows[0].payload.values,(await stored()).payload.values)
    await json('/admin/import/'+preview.id+'/commit',{isTest:true});assert.equal((await db.query("SELECT grade FROM questions WHERE id='configured-imported'")).rows[0].grade,'B')
    assert.equal((await call('/admin/import/'+preview.id+'/commit',{isTest:true})).status,409)
    const nextDef=structuredClone(definition);nextDef.fields[0].label='新版材料'
    await json('/admin/question-types/custom-case',{name:template.name,description:'更新',definition:nextDef,version:1},'PUT')
    assert.equal((await call('/admin/question-types/custom-case',{name:template.name,description:'冲突',definition,version:1},'PUT')).status,409)
    await json('/admin/content/'+row.id,await stored(),'PUT');assert.equal((await stored()).payload.definition.fields[0].label,'公共材料')
    assert.equal((await call('/admin/content/stale-version',{...row,id:'stale-version'},'PUT')).status,409)
    assert.equal((await call('/admin/question-type-imports/preview',{examId:point.exam_id,typeId:'custom-case',filename:'old.xlsx',data:fileData})).status,409)
    await json('/admin/question-types/custom-case',{enabled:false},'PATCH');await json('/admin/content/'+row.id,await stored(),'PUT')
    assert.throws(()=>validateDefinition({fields:[{...choice,optionsSource:'missing'}],examRules:{}}))
    assert.throws(()=>validateDefinition({fields:[material],examRules:{}}))
    assert.equal(publicQuestion({type:'single',answer:[0],referenceAnswer:'SECRET',rubric:'SECRET'}).referenceAnswer,undefined)
    // Objective configured questions use the existing learning/answer pipeline.
    const booleanType=await json('/admin/question-types/boolean/versions/1'),bv=initialValues(booleanType.definition)
    bv.response.prompt='这是判断题';bv.response.answer=[1]
    const boolRow={...row,id:'configured-boolean',status:'draft',payload:{type:'configured',templateId:'boolean',templateVersion:1,stem:'判断题',knowledgePointId:point.id,values:bv}}
    await json('/admin/content/'+boolRow.id,boolRow,'PUT')
    for(const status of ['review','published']){const r=(await db.query('SELECT * FROM content WHERE id=$1',[boolRow.id])).rows[0];await json('/admin/content/'+r.id,{...r,status},'PUT')}
    const br=await json('/answers/configured',{examId:point.exam_id,questionId:boolRow.id,requestId:'boolean-request',answers:{response:[1]}},'POST',studentToken)
    assert.equal(br.correct,true);assert.equal(br.score,1);assert.equal((await db.query('SELECT correct FROM answers WHERE question_id=$1',[boolRow.id])).rows[0].correct,true)
    // Templates express the configured form, including separate option columns and boolean answers.
    const five=newField('single','response');five.minOptions=5;five.maxOptions=7
    await json('/admin/question-types/five-options',{name:'五选项测试',description:'',definition:{fields:[five],examRules:{}}},'PUT')
    const download=async(typeId:string)=>{const r=await call(`/admin/question-type-imports/file?typeId=${typeId}&examId=${point.exam_id}`);assert.equal(r.status,200);const w=new ExcelJS.Workbook();await w.xlsx.load(Buffer.from(await r.arrayBuffer()) as any);return w}
    const fiveBook=await download('five-options'),fiveSheet=fiveBook.getWorksheet('题目')!
    const headers=(fiveSheet.getRow(1).values as string[]).slice(1)
    assert.equal(headers.filter(h=>h.includes('选项 ')).length,7)
    assert.equal(headers.filter(h=>h.includes('选项 ')&&h.includes('必填')).length,5)
    assert.ok(headers.includes('选项 E（必填）'));assert.ok(!headers.some(h=>h.includes('每行一个')))
    const set=(header:string,value:any)=>fiveSheet.getCell(2,headers.indexOf(header)+1).value=value
    set('题目ID','five-imported');set('知识点ID（多个用逗号分隔）',[point.id,second.id].join(','));set('题型','五选项测试');set('题干内容（必填）','模板自动标题');set('正确答案（必填）','E');set('是否真题','1')
    for(const c of ['A','B','C','D','E'])set(`选项 ${c}（必填）`,'内容'+c)
    const previewBook=async(w:ExcelJS.Workbook,typeId:string)=>json('/admin/question-type-imports/preview',{examId:point.exam_id,typeId,filename:'generated.xlsx',data:Buffer.from(await w.xlsx.writeBuffer()).toString('base64')})
    let checked=await previewBook(fiveBook,'five-options');assert.deepEqual(checked.errors,[]);assert.equal(checked.rows[0].payload.stem,'模板自动标题');assert.equal(checked.rows[0].payload.source,'真题');assert.equal(checked.rows[0].payload.values.response.options.length,5)
    set('选项 E（必填）','');assert.match((await previewBook(fiveBook,'five-options')).errors[0].message,/选项 E.*不能为空/);set('选项 E（必填）','内容E')
    set('选项 G','内容G');assert.match((await previewBook(fiveBook,'five-options')).errors[0].message,/不能跳空/);set('选项 G','')
    set('题型','多选题');assert.match((await previewBook(fiveBook,'five-options')).errors[0].message,/题型必须/);set('题型','五选项测试')
    set('正确答案（必填）','F');assert.match((await previewBook(fiveBook,'five-options')).errors[0].message,/正确答案无效/);set('正确答案（必填）','E')
    checked=await previewBook(fiveBook,'five-options');await json('/admin/import/'+checked.id+'/commit',{isTest:true})
    const boolBook=await download('boolean'),boolSheet=boolBook.getWorksheet('题目')!,boolHeaders=(boolSheet.getRow(1).values as string[]).slice(1)
    assert.equal(boolHeaders.filter(h=>h.includes('选项 ')).length,0)
    const boolAnswer=boolHeaders.indexOf('正确答案（正确/错误）（必填）')+1;assert.ok(boolAnswer>0)
    boolSheet.getCell(2,3).value=point.id;boolSheet.getCell(2,boolHeaders.indexOf('题干内容（必填）')+1).value='判断题题干';boolSheet.getCell(2,boolAnswer).value='错误'
    assert.deepEqual((await previewBook(boolBook,'boolean')).rows[0].payload.values.response.answer,[1])
    boolSheet.getCell(2,boolAnswer).value='A';assert.match((await previewBook(boolBook,'boolean')).errors[0].message,/只能填写正确或错误/)
    // Server-side filtering matches secondary links and pagination totals, including legacy question types.
    let filtered=await json(`/admin/content?kind=question&search=模板自动标题&typeId=five-options&knowledgeId=${second.id}&status=draft`)
    assert.equal(filtered.total,1);assert.equal(filtered.items[0].id,'five-imported')
    assert.equal((await json(`/admin/content?kind=question&typeId=five-options&knowledgeId=${other.id}`)).total,0)
    assert.ok((await json('/admin/content?kind=question&typeId=single')).items.every((r:any)=>(r.payload.templateId||r.payload.type)==='single'))
    const getFive=async()=>(await db.query("SELECT * FROM content WHERE id='five-imported'")).rows[0]
    const original=await getFive()
    assert.equal((await call('/admin/questions/five-imported/status',{enabled:false,version:original.version},'PATCH',studentToken)).status,403)
    await json('/admin/questions/five-imported/status',{enabled:false,version:original.version},'PATCH')
    assert.equal((await getFive()).status,'offline')
    assert.equal((await call('/admin/questions/five-imported/status',{enabled:true,version:original.version},'PATCH')).status,409)
    await json('/admin/questions/five-imported/status',{enabled:true,version:(await getFive()).version},'PATCH')
    assert.equal((await getFive()).status,'draft')
    for(const status of ['review','published'])await json('/admin/content/five-imported',{...await getFive(),status},'PUT')
    await json('/admin/questions/five-imported/status',{enabled:false,version:(await getFive()).version},'PATCH')
    await json('/admin/questions/five-imported/status',{enabled:true,version:(await getFive()).version},'PATCH')
    assert.equal((await getFive()).status,'published');assert.deepEqual((await getFive()).payload.knowledgePointIds,original.payload.knowledgePointIds)
  }finally{if(server)await new Promise<void>(r=>server!.close(()=>r()));await closeDatabase()}
})
