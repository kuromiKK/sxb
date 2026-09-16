import { Router } from 'express'
import { z } from 'zod'
import { db, transaction, type Queryable } from './db.ts'
import { fail, id, audit } from './security.ts'
import { flattenFields, isAnswer, newField, examDefinition, optionsFor, type QuestionField, type TypeDefinition } from '../../shared/question-types.ts'

const rule=z.object({maxScore:z.number().positive().max(10000),scoring:z.enum(['exact','partial']),partialScore:z.number().positive().max(10000)})
const field:z.ZodType<QuestionField>=z.lazy(()=>z.object({id:z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/),kind:z.enum(['material','options','single','multiple','boolean','text','group']),label:z.string().trim().min(1).max(80),help:z.string().max(500),required:z.boolean(),answerRequired:z.boolean(),defaultValue:z.string().max(20000),minOptions:z.number().int().min(2).max(26),maxOptions:z.number().int().min(2).max(26),optionsSource:z.string().max(80),aiGrading:z.boolean().optional(),...rule.shape,children:z.array(field).max(30)}))
export const definitionSchema=z.object({fields:z.array(field).min(1).max(40),examRules:z.record(z.string(),z.record(z.string(),rule)).default({})})
export function validateDefinition(raw:unknown){
  const def=definitionSchema.parse(raw),all=flattenFields(def.fields)
  if(all.length>80||new Set(all.map(f=>f.id)).size!==all.length)fail(400,'组件最多80个，且组件标识不能重复')
  if(!all.some(isAnswer))fail(400,'请至少添加一个作答组件')
  const visit=(fields:QuestionField[],depth=0)=>{for(const f of fields){
    if(depth>2)fail(400,'小题组最多嵌套两层')
    if(f.kind==='group'){if(!f.children.length)fail(400,'小题组至少包含一个组件');visit(f.children,depth+1)}
    else if(f.children.length)fail(400,'只有小题组可以包含子组件')
    if(f.minOptions>f.maxOptions)fail(400,'选项下限不能超过上限')
    if(f.optionsSource&&(!['single','multiple'].includes(f.kind)||!all.some(x=>x.id===f.optionsSource&&x.kind==='options')))fail(400,'共用选项来源无效')
    if(f.aiGrading&&f.kind!=='text')fail(400,'AI 判分仅适用于主观作答组件')
    if(f.scoring==='partial'&&f.kind!=='multiple')fail(400,'只有多选组件支持漏选部分得分')
  }};visit(def.fields)
  for(const rules of Object.values(def.examRules))for(const [key,r] of Object.entries(rules)){
    const f=all.find(f=>f.id===key);if(!f||!isAnswer(f)||(r.scoring==='partial'&&f.kind!=='multiple'))fail(400,'考试评分配置引用了无效作答组件')
  }
  return def
}
export async function migrateQuestionTypes(){await transaction(async c=>{
  await c.query('LOCK TABLE schema_versions IN EXCLUSIVE MODE')
  if((await c.query('SELECT 1 FROM schema_versions WHERE version=13')).rows.length)return
  await c.query(`CREATE TABLE question_types(id text PRIMARY KEY,name text NOT NULL UNIQUE,description text NOT NULL DEFAULT '',enabled boolean NOT NULL DEFAULT true,builtin boolean NOT NULL DEFAULT false,version integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now())`)
  await c.query(`CREATE TABLE question_type_versions(type_id text REFERENCES question_types(id),version integer NOT NULL,definition jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(type_id,version))`)
  await c.query(`CREATE TABLE question_submissions(id text PRIMARY KEY,user_id text NOT NULL REFERENCES users(id),exam_id text NOT NULL REFERENCES knowledge_nodes(id),question_id text NOT NULL REFERENCES questions(id),request_id text NOT NULL,answers jsonb NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(user_id,request_id))`)
  for(const [key,name,description] of [['single','单选题','多个选项中选择一个正确答案'],['multiple','多选题','支持全对得分与漏选部分得分'],['subjective','主观题','文字作答，保留参考答案与评分要点'],['boolean','判断题','从正确与错误中选择答案']]){
    const f=newField(key==='subjective'?'text':key as any,'response')
    f.label='题目';f.maxScore=key==='multiple'?2:f.maxScore
    await c.query('INSERT INTO question_types(id,name,description,builtin) VALUES($1,$2,$3,true)',[key,name,description])
    await c.query('INSERT INTO question_type_versions(type_id,version,definition) VALUES($1,1,$2)',[key,JSON.stringify({fields:[f],examRules:{}})])
  }
  await c.query('INSERT INTO schema_versions(version) VALUES(13)')
})}
export async function getQuestionType(typeId:string,version?:number,c:Queryable=db){
  const t=(await c.query(`SELECT t.*,v.definition,v.version AS version FROM question_types t JOIN question_type_versions v ON v.type_id=t.id AND v.version=coalesce($2::int,t.version) WHERE t.id=$1`,[typeId,version??null])).rows[0]
  if(!t)fail(400,'题型或历史版本不存在');return t
}
export async function validateConfiguredQuestion(payload:any,examId:string,c:Queryable=db,oldPayload?:any){
  const ref=z.object({templateId:z.string().min(1),templateVersion:z.number().int().positive(),values:z.record(z.string(),z.any())}).parse(payload)
  const t=await getQuestionType(ref.templateId,ref.templateVersion,c)
  const same=(oldPayload?.templateId===t.id&&oldPayload?.templateVersion===t.version)||(oldPayload?.type===t.id&&t.version===1)
  const latest=(await c.query('SELECT version FROM question_types WHERE id=$1 FOR SHARE',[t.id])).rows[0].version
  if(!same&&(!t.enabled||latest!==t.version))fail(409,'题型已停用或版本已更新，请重新选择题型')
  const def:TypeDefinition=same&&oldPayload.definition?oldPayload.definition:examDefinition(t.definition,examId)
  if(same&&oldPayload.type==='subjective'&&oldPayload.maxScore)flattenFields(def.fields).filter(isAnswer).forEach(f=>{f.maxScore=oldPayload.maxScore})
  if(!payload.stem?.trim())fail(400,'请填写题目标题')
  if(JSON.stringify(ref.values).length>500000)fail(400,'题目内容过大')
  for(const f of flattenFields(def.fields)){
    const v=ref.values[f.id]
    if(f.kind==='group')continue
    if(f.kind==='material'){z.string().max(100000).parse(v??'');if(f.required&&!v?.trim())fail(400,`${f.label}不能为空`);continue}
    if(f.kind==='options'){const o=z.array(z.string().trim().min(1).max(20000)).min(f.minOptions).max(f.maxOptions).parse(v);continue}
    const a=z.object({prompt:z.string().max(100000),options:z.array(z.string().max(20000)).max(26).default([]),answer:z.array(z.number().int().min(0)).max(26).default([]),reference:z.string().max(100000).default(''),rubric:z.string().max(100000).default(''),explanation:z.string().max(100000).default('')}).parse(v)
    if(f.kind==='text'||f.optionsSource)a.options=[]
    if(f.kind==='boolean')a.options=['正确','错误']
    if(f.kind==='text'){
      a.answer=[]
      if(f.aiGrading&&(!a.reference.trim()||!a.rubric.trim()))fail(400,`${f.label}开启 AI 判分后必须填写参考答案和评分要点`)
    }
    if(f.required&&!a.prompt.trim())fail(400,`${f.label}的题干不能为空`)
    if(f.kind!=='text'){
      const options=optionsFor(f,ref.values)
      if(!Array.isArray(options)||(f.kind!=='boolean'&&(options.length<f.minOptions||options.length>f.maxOptions))||options.some(v=>typeof v!=='string'||!v.trim()))fail(400,`${f.label}的选项数量或内容不正确（需 ${f.minOptions}～${f.maxOptions} 个非空选项）`)
      if(!a.answer.length||new Set(a.answer).size!==a.answer.length||a.answer.some(i=>i>=options.length)||(['single','boolean'].includes(f.kind)&&a.answer.length!==1))fail(400,`${f.label}的正确答案无效`)
    }
    ref.values[f.id]=a
  }
  payload.values=ref.values;payload.definition=def;payload.typeName=same&&oldPayload.typeName?oldPayload.typeName:t.name;payload.options=[];payload.answer=[]
}
export function gradeConfigured(payload:any,answers:Record<string,any>){
  const results:Record<string,any>={};let pending=false,total=0,max=0,allCorrect=true
  for(const f of flattenFields(payload.definition.fields).filter(isAnswer)){
    const v=payload.values[f.id],a=answers[f.id]
    if(f.kind==='text'){
      const value=z.string().max(100000).default('').parse(a)
      if(f.answerRequired&&!value.trim())fail(400,`请完成${f.label}`)
      pending=true;allCorrect=false;results[f.id]={status:f.aiGrading?'ai_pending':'self_review',method:f.aiGrading?'ai':'self',score:null,maxScore:f.maxScore,reference:v.reference||'',rubric:v.rubric||'',explanation:v.explanation||''};max+=f.maxScore;continue
    }
    const selection=z.array(z.number().int().min(0)).max(26).default([]).parse(a)
    const options=optionsFor(f,payload.values)
    if((f.answerRequired&&!selection.length)||new Set(selection).size!==selection.length||selection.some(i=>i>=options.length)||(['single','boolean'].includes(f.kind)&&selection.length>1))fail(400,`${f.label}的作答无效`)
    const correct=selection.length===v.answer.length&&selection.every(i=>v.answer.includes(i))
    const score=correct?f.maxScore:f.scoring==='partial'&&selection.every(i=>v.answer.includes(i))?Math.min(f.maxScore,selection.length*f.partialScore):0
    total+=score;max+=f.maxScore;allCorrect&&=correct;results[f.id]={status:'graded',correct,score,maxScore:f.maxScore,answer:v.answer,explanation:v.explanation||''}
  }
  return {status:pending?Object.values(results).some((r:any)=>r.status==='ai_pending')?'ai_pending':'self_review':'graded',score:pending?null:Math.round(total*10000)/10000,objectiveScore:Math.round(total*10000)/10000,maxScore:max,correct:pending?null:allCorrect,fields:results}
}
export const questionTypes=Router()
questionTypes.get('/',async(_req,res)=>res.json((await db.query(`SELECT t.*,v.definition,(SELECT count(*)::int FROM questions q WHERE coalesce(q.payload->>'templateId',q.payload->>'type')=t.id) AS question_count FROM question_types t JOIN question_type_versions v ON v.type_id=t.id AND v.version=t.version ORDER BY t.builtin DESC,array_position(ARRAY['single','multiple','subjective','boolean'],t.id),t.created_at,t.id`)).rows))
questionTypes.get('/:id/versions',async(req,res)=>res.json((await db.query('SELECT version,created_at FROM question_type_versions WHERE type_id=$1 ORDER BY version DESC',[req.params.id])).rows))
questionTypes.get('/:id/versions/:version',async(req,res)=>res.json(await getQuestionType(req.params.id,z.coerce.number().int().positive().parse(req.params.version))))
questionTypes.put('/:id',async(req,res)=>{
  const b=z.object({name:z.string().trim().min(1).max(80),description:z.string().max(500),version:z.number().int().positive().optional(),definition:definitionSchema}).parse(req.body)
  const def=validateDefinition(b.definition)
  const typeId=z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/).parse(req.params.id)
  await transaction(async c=>{
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',['type:'+typeId])
    const old=(await c.query('SELECT * FROM question_types WHERE id=$1 FOR UPDATE',[typeId])).rows[0]
    if(old&&old.version!==b.version)fail(409,'题型已被修改，请刷新后重试')
    for(const examId of Object.keys(def.examRules))if(!(await c.query('SELECT id FROM exams WHERE id=$1',[examId])).rows.length)fail(400,'评分配置的考试不存在')
    const version=old?old.version+1:1
    if(old)await c.query('UPDATE question_types SET name=$2,description=$3,version=$4,updated_at=now() WHERE id=$1',[typeId,b.name,b.description,version])
    else await c.query('INSERT INTO question_types(id,name,description) VALUES($1,$2,$3)',[typeId,b.name,b.description])
    await c.query('INSERT INTO question_type_versions(type_id,version,definition) VALUES($1,$2,$3)',[typeId,version,JSON.stringify(def)])
  });await audit(res.locals.user.id,'question-type.save',typeId,{name:b.name});res.json(await getQuestionType(typeId))
})
questionTypes.patch('/:id',async(req,res)=>{
  const b=z.object({enabled:z.boolean()}).parse(req.body)
  if(!(await db.query('UPDATE question_types SET enabled=$2,updated_at=now() WHERE id=$1 RETURNING id',[req.params.id,b.enabled])).rows.length)fail(404,'题型不存在')
  await audit(res.locals.user.id,'question-type.status',req.params.id,b);res.json({ok:true})
})
