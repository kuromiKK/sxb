import { Router } from 'express'
import ExcelJS from 'exceljs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { db,transaction,type Queryable } from './db.ts'
import { fail,id } from './security.ts'
import { mediaDirectory } from './study-content.ts'
import { lockResourceReferences } from './editor-images.ts'
import { previewTypedQuestions,workbook } from './question-type-imports.ts'
import { getQuestionType,validateConfiguredQuestion } from './question-types.ts'
import { addStructureTemplate,applyStructureUpdate,defaultStructureOptions,previewStructure,structureOptionsSchema,structurePatch } from './structure-import.ts'
import { validateDocument } from './rich-document.ts'

export const importJobs=Router()
export const normalizeTitle=(v:string)=>v.normalize('NFKC').trim().replace(/\s+/g,' ')
const cell=(v:any):string=>v==null?'':typeof v==='object'?v.richText?.map((x:any)=>x.text).join('')??v.text??String(v.result??''):String(v)
const kinds=['subject','chapter','section','knowledge']
async function assetBytes(a:any){if(!/^[a-f0-9-]{36}$/.test(a.disk_name))fail(400,'资源存储路径无效');return readFile(join(mediaDirectory,a.disk_name))}
async function examName(exam:string){const e=(await db.query('SELECT name FROM exams WHERE id=$1',[exam])).rows[0];if(!e)fail(404,'考试不存在');return e.name}
async function readJob(jobId:string,actor:string,c:Queryable=db){const j=(await c.query('SELECT j.*,a.filename FROM import_jobs j JOIN media_assets a ON a.id=j.asset_id WHERE j.id=$1 AND j.actor_id=$2',[jobId,actor])).rows[0];if(!j)fail(404,'导入批次不存在');return j}
export function jobSummary(j:any){const rows=j.rows;const counts={total:rows.length,success:0,skipped:0,failed:0,pending:0};const planned={create:0,update:0,unchanged:0,failed:0};const nodes:Record<string,{created:number;reused:number;updated:number}>={},unique=new Map<string,any>();for(const r of rows){counts[r.status as 'success']++;planned[r.status==='failed'?'failed':r.status==='skipped'?'unchanged':(r.action||'unchanged') as keyof typeof planned]++;for(const n of r.nodes||[])unique.set(n.id,{...n,created:n.created||unique.get(n.id)?.created,updated:n.updated||unique.get(n.id)?.updated})}for(const n of unique.values()){nodes[n.kind]??={created:0,reused:0,updated:0};nodes[n.kind][n.created?'created':'reused']++;if(n.updated)nodes[n.kind].updated++}return {...j,options:j.kind==='structure'&&!Array.isArray(j.headers)?j.headers:defaultStructureOptions(),counts,planned,nodes,percentage:rows.length?Math.round((rows.length-counts.pending)/rows.length*100):0}}
importJobs.get('/template',async(req,res)=>{
 const exam=z.string().min(1).parse(req.query.examId),name=await examName(exam)
 let w:ExcelJS.Workbook
 if(req.query.typeId){const t=await getQuestionType(String(req.query.typeId));if(!t.enabled)fail(400,'题型已停用');w=workbook(t).w}
 else {w=new ExcelJS.Workbook();const options=structureOptionsSchema.parse({mode:req.query.mode,fields:typeof req.query.fields==='string'?req.query.fields.split(',').filter(Boolean):[],blankBehavior:req.query.blankBehavior});addStructureTemplate(w,name,options)}
 const meta=w.addWorksheet('所属考试');meta.addRows([['考试ID',exam],['考试名称',name]]);meta.state='veryHidden'
 const points=w.addWorksheet('知识点对照表');points.addRow(['知识点ID','科目','章','节','知识点'])
 const all=(await db.query("SELECT * FROM knowledge_nodes WHERE exam_id=$1 AND NOT(payload ? 'deletedAt') ORDER BY created_at,id",[exam])).rows,byId=new Map(all.map(r=>[r.id,r]))
 for(const p of all.filter(r=>r.kind==='knowledge')){const s=byId.get(p.parent_id),ch=byId.get(s?.parent_id),su=byId.get(ch?.parent_id);points.addRow([p.id,su?.title||'',ch?.title||'',s?.title||'',p.title])}points.columns=[{width:40},...Array(4).fill({width:32})]
 if(!req.query.typeId){const lookup=w.addWorksheet('节点对照表');lookup.addRow(['节点ID','层级','名称','父级名称','当前星级','当前短标题']);for(const n of all)lookup.addRow([n.id,({subject:'科目',chapter:'章',section:'节',knowledge:'知识点'} as Record<string,string>)[n.kind],n.title,byId.get(n.parent_id)?.title||name,n.payload.stars??'',n.payload.shortTitle||'']);lookup.columns=[{width:40},{width:12},{width:45},{width:40},{width:12},{width:24}]}
 res.attachment('import-template.xlsx').send(Buffer.from(await w.xlsx.writeBuffer()))
})
importJobs.get('/',async(req,res)=>{const exam=z.string().min(1).parse(req.query.examId);res.json((await db.query('SELECT id,kind,status,created_at FROM import_jobs WHERE exam_id=$1 AND actor_id=$2 ORDER BY created_at DESC LIMIT 30',[exam,res.locals.user.id])).rows)})
importJobs.post('/preview',async(req,res)=>{
 const b=z.object({examId:z.string().min(1),assetId:z.string().min(1),kind:z.enum(['structure','question']),typeId:z.string().optional(),isTest:z.boolean().default(false),options:structureOptionsSchema.optional()}).parse(req.body)
 const options=b.options||defaultStructureOptions()
 await examName(b.examId)
 const a=(await db.query("SELECT * FROM media_assets WHERE id=$1 AND kind='import' AND exam_id=$2 AND owner_id=$3",[b.assetId,b.examId,res.locals.user.id])).rows[0];if(!a)fail(400,'请先上传当前考试的导入文件')
 const bytes=await assetBytes(a),w=new ExcelJS.Workbook();try{await w.xlsx.load(bytes as any)}catch{fail(400,'无法读取 XLSX 文件')}
 const meta=w.getWorksheet('所属考试');if(!meta||cell(meta.getCell(1,2).value)!==b.examId)fail(400,'模板所属考试不匹配，请下载当前考试模板')
 let rows:any[]=[]
 if(b.kind==='structure'){
  rows=await previewStructure(w,b.examId,b.isTest,options)
 }else{
  const parsed=await previewTypedQuestions(res.locals.user.id,{examId:b.examId,typeId:b.typeId,filename:a.filename,data:bytes.toString('base64')},true)
  rows=[...parsed.rows.map(r=>({...r,title:r.payload.stem,status:'pending',message:''})),...parsed.errors.map(r=>({...r,title:cell(w.getWorksheet('题目')?.getCell(r.line,2).value),status:'failed'}))].sort((a,b)=>a.line-b.line)
 }
 if(!rows.length)fail(400,'文件没有可导入内容')
 const jobId=id();await transaction(async c=>{await lockResourceReferences(c);if(!(await c.query('SELECT id FROM media_assets WHERE id=$1',[a.id])).rows.length)fail(409,'文件已被清理，请重新上传');await c.query('INSERT INTO import_jobs(id,actor_id,exam_id,asset_id,kind,is_test,rows,headers) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[jobId,res.locals.user.id,b.examId,a.id,b.kind,b.isTest,JSON.stringify(rows),JSON.stringify(b.kind==='structure'?options:[])])})
 res.json(jobSummary(await readJob(jobId,res.locals.user.id)))
})
async function origin(c:Queryable,j:any,contentId:string,line:number){await c.query('INSERT INTO content_origins(id,content_id,job_id,asset_id,sheet,line) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(content_id,job_id,line) DO NOTHING',[id(),contentId,j.id,j.asset_id,j.kind==='structure'?'知识目录':'题目',line])}
async function importStructure(c:Queryable,j:any,r:any){
 if(j.headers?.mode==='update'){await applyStructureUpdate(c,j,r);await origin(c,j,r.id,r.line);return}
 let parent=j.exam_id;const nodes=[]
 for(const [index,title] of r.path.entries()){
  const kind=kinds[index];const siblings=(await c.query('SELECT id,title,is_test_data,payload,version FROM knowledge_nodes WHERE parent_id=$1 AND kind=$2 ORDER BY created_at,id FOR UPDATE',[parent,kind])).rows
  const matches=siblings.filter(n=>normalizeTitle(n.title)===title);if(matches.length>1)fail(409,`${title} 存在多个同名节点，请先消除歧义`)
  let node=matches[0],created=false
  if(node&&(node.is_test_data!==j.is_test||node.payload.deletedAt))fail(409,`${title} 的测试标记不同或已删除，请人工确认后重试`)
  if(r.expected){const expected=r.expected[index];if(expected.id){if(!node||node.id!==expected.id||node.version!==expected.version)fail(409,`${title} 在预览后已变化，请重新校验`)}else if(node&&!(await c.query('SELECT 1 FROM content_origins WHERE content_id=$1 AND job_id=$2',[node.id,j.id])).rows.length)fail(409,`${title} 在预览后已被其他操作创建，请重新校验`)}
  if(!node){node={id:id()};const no=Math.max(0,...siblings.map(n=>Number(n.payload.no)||0))+1;const payload=structurePatch({no},r.nodeValues?.[index]||r.values||{},kind).payload;if(payload.document)await validateDocument(payload.document,node.id,j.exam_id,c);await c.query("INSERT INTO content(id,exam_id,kind,parent_id,title,payload,status,source,is_test_data) VALUES($1,$2,$3,$4,$5,$6,'draft',$7,$8)",[node.id,j.exam_id,kind,index===0?null:parent,title,JSON.stringify(payload),j.filename,j.is_test]);created=true}
  await origin(c,j,node.id,r.line);nodes.push({id:node.id,kind,title,created});parent=node.id
 }
 r.nodes=nodes;r.id=parent;r.status=nodes.some(n=>n.created)?'success':'skipped';r.message=r.status==='skipped'?'已存在，复用原 ID':'已导入草稿'
}
function canonical(v:any):any{if(typeof v==='string')return normalizeTitle(v);if(Array.isArray(v))return v.map(canonical);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])]));return v}
export function questionSignature(payload:any){return JSON.stringify(canonical({template:payload.templateId||payload.type,version:payload.templateVersion||1,values:payload.values||{stem:payload.stem,options:payload.options,answer:payload.answer},points:[...(payload.knowledgePointIds||[payload.knowledgePointId])].sort(),year:payload.year||'',source:payload.source||'',explanation:payload.explanation||''}))}
async function importQuestion(c:Queryable,j:any,r:any){
 await validateConfiguredQuestion(r.payload,j.exam_id,c)
 const existing=(await c.query("SELECT * FROM content WHERE kind='question' AND exam_id=$1 AND NOT(payload ? 'deletedAt')",[j.exam_id])).rows
 const same=existing.find(q=>questionSignature(q.payload)===questionSignature(r.payload))
 if(same){if(same.is_test_data!==j.is_test)fail(409,'已有相同题目，但测试标记不同，请人工确认');if((same.grade||null)!==(r.grade||null)&&r.grade!=null){const grade=(await c.query('SELECT grade FROM questions WHERE id=$1',[same.id])).rows[0]?.grade;if(grade!==r.grade)fail(409,'已有相同题目，但等级不同，请人工确认')}r.id=same.id;r.status='skipped';r.message='完全重复，复用原题';await origin(c,j,same.id,r.line);return}
 if(existing.some(q=>normalizeTitle(q.payload.stem||q.title)===normalizeTitle(r.payload.stem)))fail(409,'题干相同但题目内容或关联不同，请人工核对')
 await c.query("INSERT INTO content(id,exam_id,kind,parent_id,title,payload,status,source,is_test_data) VALUES($1,$2,'question',$3,$4,$5,'draft',$6,$7)",[r.id,j.exam_id,r.payload.knowledgePointId,r.payload.stem,JSON.stringify(r.payload),j.filename,j.is_test])
 if(r.grade)await c.query('UPDATE questions SET grade=$2 WHERE id=$1',[r.id,r.grade]);await origin(c,j,r.id,r.line);r.status='success';r.message='已导入草稿'
}
// Each advancement is durable and serialized. Interrupted clients can resume the same job safely.
export async function advanceJob(jobId:string,actor:string){return transaction(async c=>{
 await lockResourceReferences(c)
 await c.query('SELECT id FROM import_jobs WHERE id=$1 AND actor_id=$2 FOR UPDATE',[jobId,actor])
 const j=await readJob(jobId,actor,c);if(j.status==='completed')return jobSummary(j)
 await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',['import-exam:'+j.exam_id])
 for(const r of j.rows.filter((r:any)=>r.status==='pending').slice(0,15)){
  await c.query('SAVEPOINT import_row')
  try{if(j.kind==='structure')await importStructure(c,j,r);else await importQuestion(c,j,r);await c.query('RELEASE SAVEPOINT import_row')}
  catch(e:any){await c.query('ROLLBACK TO SAVEPOINT import_row');await c.query('RELEASE SAVEPOINT import_row');r.status='failed';r.nodes=[];r.message=e.issues?.map((x:any)=>x.message).join('；')||(['23505','23503','23514'].includes(e.code)?'记录重复或关联已变化，请重新核对':e.message)}
 }
 j.status=j.rows.some((r:any)=>r.status==='pending')?'running':'completed';await c.query('UPDATE import_jobs SET rows=$2,status=$3,updated_at=now() WHERE id=$1',[j.id,JSON.stringify(j.rows),j.status])
 if(j.status==='completed')await c.query('INSERT INTO audit_logs(id,actor_id,action,target_id,details) VALUES($1,$2,$3,$4,$5)',[id(),actor,'import.completed',j.id,JSON.stringify(jobSummary(j).counts)])
 return jobSummary(j)
})}
importJobs.post('/:id/advance',async(req,res)=>res.json(await advanceJob(req.params.id,res.locals.user.id)))
importJobs.get('/:id',async(req,res)=>res.json(jobSummary(await readJob(req.params.id,res.locals.user.id))))
importJobs.get('/:id/failures',async(req,res)=>{
 const j=await readJob(req.params.id,res.locals.user.id),a=(await db.query('SELECT * FROM media_assets WHERE id=$1',[j.asset_id])).rows[0],w=new ExcelJS.Workbook();await w.xlsx.load(await assetBytes(a) as any)
 const s=w.getWorksheet(j.kind==='structure'?'知识目录':'题目')!,failed=new Set(j.rows.filter((r:any)=>r.status==='failed').map((r:any)=>r.line))
 for(let line=s.rowCount;line>=2;line--)if(!failed.has(line))s.spliceRows(line,1)
 const old=w.getWorksheet('失败原因');if(old)w.removeWorksheet(old.id)
 if(j.kind==='structure'&&!Array.isArray(j.headers)){const settings=w.getWorksheet('导入设置')||w.addWorksheet('导入设置');settings.getCell(1,1).value='配置';settings.getCell(1,2).value=JSON.stringify(j.headers);settings.state='veryHidden';const guide=w.getWorksheet('填写说明');if(guide)for(let row=1;row<=guide.rowCount;row++)if(cell(guide.getCell(row,1).value)==='空值')guide.getCell(row,2).value=j.headers.blankBehavior==='clear'?'选中字段的空值将清空旧值；未选字段保留。':'空值保留原值；未选字段保留。'}
 const reasons=w.addWorksheet('失败原因');reasons.addRow(['原始行号','内容','原因']);for(const r of j.rows.filter((r:any)=>r.status==='failed'))reasons.addRow([r.line,r.title,r.message]);reasons.columns=[{width:14},{width:60},{width:80}]
 res.attachment('failed-rows.xlsx').send(Buffer.from(await w.xlsx.writeBuffer()))
})
export async function contentOrigins(contentId:string){return (await db.query('SELECT o.*,a.filename,j.created_at AS imported_at FROM content_origins o JOIN media_assets a ON a.id=o.asset_id JOIN import_jobs j ON j.id=o.job_id WHERE o.content_id=$1 ORDER BY o.created_at DESC',[contentId])).rows}
