import ExcelJS from 'exceljs'
import { Router } from 'express'
import { z } from 'zod'
import { db } from './db.ts'
import { fail, id, audit } from './security.ts'
import { getQuestionType, validateConfiguredQuestion } from './question-types.ts'
import { flattenFields, isAnswer, initialValues, legacyValues, type TypeDefinition } from '../../shared/question-types.ts'

function legacyColumns(def:TypeDefinition){
  const cols:{title:string;field?:string;part?:string}[]=['题目ID','标题','知识点ID（多个用逗号分隔）','等级（A-E，留空未设置）','年份','是否真题'].map(title=>({title}))
  flattenFields(def.fields).filter(f=>f.kind!=='group').forEach((f,i)=>{
    const parts=isAnswer(f)?['题干',...(['text','boolean'].includes(f.kind)||f.optionsSource?[]:['选项（每行一个）']),...(f.kind==='text'?['参考答案','评分要点']:['正确答案（如A,C）']), '解析']:['内容']
    const keys:Record<string,string>={'题干':'prompt','选项（每行一个）':'options','参考答案':'reference','评分要点':'rubric','正确答案（如A,C）':'answer','解析':'explanation','内容':'value'}
    for(const part of parts)cols.push({title:`${i+1}.${f.label}·${part}`,field:f.id,part:keys[part]})
  });return cols
}
type Column={title:string;field?:string;part?:string;option?:number;required?:boolean;boolean?:boolean}
export function questionColumns(def:TypeDefinition):Column[]{
  const all=flattenFields(def.fields).filter(f=>f.kind!=='group'),simple=all.length===1&&isAnswer(all[0])
  const cols:Column[]=['题目ID','标题','知识点ID（多个用逗号分隔）','等级（A-E，留空未设置）','年份','是否真题','题型'].map(title=>({title}))
  for(const [i,f] of all.entries()){
    const prefix=simple?'':`${i+1}.${f.label}·`
    const add=(label:string,part:string,required=false)=>cols.push({title:prefix+label+(required?'（必填）':''),field:f.id,part,required,boolean:f.kind==='boolean'})
    if(f.kind==='material'){add('材料内容','value',f.required);continue}
    if(isAnswer(f)){add('题干内容','prompt',f.required);add('题目解析','explanation')}
    if(f.kind==='text'){add('参考答案','reference',!!f.aiGrading);add('评分要点','rubric',!!f.aiGrading);continue}
    if(isAnswer(f))add(f.kind==='boolean'?'正确答案（正确/错误）':'正确答案','answer',true)
    if(f.kind==='options'||(['single','multiple'].includes(f.kind)&&!f.optionsSource)){
      for(let n=0;n<f.maxOptions;n++)cols.push({title:prefix+`选项 ${String.fromCharCode(65+n)}`+(n<f.minOptions?'（必填）':''),field:f.id,part:f.kind==='options'?'value':'options',option:n,required:n<f.minOptions})
    }
  }
  return cols
}
const text=(v:any):string=>v==null?'':typeof v==='object'?v.richText?.map((r:any)=>r.text).join('')??v.text??String(v.result??''):String(v)
function workbook(t:any){
  const w=new ExcelJS.Workbook(),s=w.addWorksheet('题目'),cols=questionColumns(t.definition)
  s.addRow(cols.map(c=>c.title));s.views=[{state:'frozen',ySplit:1}]
  s.columns=cols.map((c,i)=>({width:i===1?42:i<6?24:40}))
  s.getRow(1).height=44;s.getRow(1).font={name:'微软雅黑',size:11,bold:true,color:{argb:'FFFFFFFF'}};s.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF315FD1'}}
  s.getRow(1).alignment={vertical:'middle',wrapText:true}
  const meta=w.addWorksheet('题型版本');meta.addRow(['题型ID',t.id]);meta.addRow(['版本',t.version]);meta.addRow(['模板格式',2]);meta.state='veryHidden'
  const guide=w.addWorksheet('填写说明');guide.addRows([['题型',t.name],['版本',t.version],['题目ID','新增时留空自动生成；不使用题库ID；不支持覆盖已有题目'],['标题','可填写检索标题；留空时使用首个作答组件的题干（最多2000字）'],['知识点','必填：同一考试下的知识点ID，多个用英文逗号分隔'],['题型列',`可留空；填写时必须为“${t.name}”，混合题型请分别下载模板、分别导入`],['选项','选项 A、B、C…各占一列；标记必填的列必须填写，可选列从左到右连续填写，不可跳空'],['正确答案','单选一个字母，多选使用 A,C 或 AC；判断题只填“正确”或“错误”'],['年份与真题','年份如2025；是否真题支持 是/否 或 1/2，留空为否'],['等级','A、B、C、D、E，留空为未设置；原表的题目难度不自动转成等级'],['组合题','一行是一道完整题，公共材料、共用选项、各小题分别填写对应列'],['发布状态','导入后为草稿；全部通过校验后才可确认导入'],['评分','分值沿用题型及考试配置。AI 主观题必须填写参考答案和评分要点；其他主观题用于自评'],['版本说明','请勿修改题目表的表头；旧版本仅供导出，新增录入使用当前启用版本']]);guide.columns=[{width:20},{width:100}]
  for(const f of flattenFields(t.definition.fields))if(f.kind==='options'||(['single','multiple'].includes(f.kind)&&!f.optionsSource))guide.addRow([f.label,`选项最少 ${f.minOptions} 个，最多 ${f.maxOptions} 个；前 ${f.minOptions} 列必填`])
  guide.eachRow(r=>{r.alignment={wrapText:true,vertical:'middle'};r.height=36});guide.getColumn(1).font={bold:true}
  s.autoFilter={from:{row:1,column:1},to:{row:1,column:cols.length}}
  for(const [i,col] of cols.entries()){
    s.getColumn(i+1).numFmt='@'
    if(col.boolean&&col.part==='answer')(s as any).dataValidations.add(`${s.getColumn(i+1).letter}2:${s.getColumn(i+1).letter}2001`,{type:'list',allowBlank:false,formulae:['"正确,错误"'],showErrorMessage:true,error:'判断题答案只能为正确或错误'})
  }
  return {w,s,cols}
}
export const typeImports=Router()
typeImports.get('/file',async(req,res)=>{
  const b=z.object({typeId:z.string().min(1),version:z.coerce.number().int().positive().optional(),examId:z.string().optional(),mode:z.enum(['template','export']).default('template')}).parse(req.query)
  if(b.mode==='export'&&!b.examId)fail(400,'请选择考试')
  const t=await getQuestionType(b.typeId,b.version),{w,s,cols}=workbook(t)
  if(b.mode==='export'){
    const rows=(await db.query(`SELECT q.*,q.title FROM questions q WHERE exam_id=$1 AND coalesce(payload->>'templateId',payload->>'type')=$2 AND coalesce((payload->>'templateVersion')::int,1)=$3 ORDER BY created_at,id`,[b.examId,t.id,t.version])).rows
    for(const row of rows){
      const values=legacyValues(row.payload,t.definition)
      s.addRow(cols.map((col,i)=>{
        if(!col.field)return [row.id,row.title,(row.payload.knowledgePointIds||[row.payload.knowledgePointId]).join(','),row.grade||'',row.payload.year||'',row.payload.source==='真题'?'是':'否',t.name][i]
        const v=col.part==='value'?values[col.field]:values[col.field]?.[col.part!]
        if(col.option!==undefined)return v?.[col.option]??''
        if(col.boolean&&col.part==='answer')return v?.[0]===0?'正确':v?.[0]===1?'错误':''
        if(col.part==='answer')return (v||[]).map((i:number)=>String.fromCharCode(65+i)).join(',')
        return Array.isArray(v)?v.join('\n'):v??''
      }))
    }
  }
  res.setHeader('Content-Disposition',`attachment; filename="questions-${b.mode}.xlsx"`);res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(Buffer.from(await w.xlsx.writeBuffer()))
})
typeImports.post('/preview',async(req,res)=>{
  const b=z.object({examId:z.string().min(1),typeId:z.string().min(1),filename:z.string().max(200),data:z.string().max(12000000)}).parse(req.body)
  if(Buffer.byteLength(b.data,'base64')>8*1024*1024)fail(400,'文件不能超过8MB')
  const w=new ExcelJS.Workbook();try{await w.xlsx.load(Buffer.from(b.data,'base64') as any)}catch{fail(400,'无法读取xlsx文件')}
  const meta=w.getWorksheet('题型版本'),s=w.getWorksheet('题目')
  if(!meta||!s)return fail(400,'请使用所选题型的标准模板')
  if(!meta||text(meta.getCell(1,2).value)!==b.typeId)fail(400,'文件题型与所选题型不一致，请下载对应模板')
  const t=await getQuestionType(b.typeId)
  if(!t.enabled||Number(meta.getCell(2,2).value)!==t.version)fail(409,'题型已停用或模板版本已更新，请重新下载模板')
  const modern=Number(meta.getCell(3,2).value)===2
  const cols:Column[]=modern?questionColumns(t.definition):legacyColumns(t.definition)
  if(!s||cols.some((col,i)=>text(s.getCell(1,i+1).value)!==col.title)||s.columnCount!==cols.length)fail(400,'模板表头不匹配，请勿增加、删除或调整列')
  if(s.rowCount>2001)fail(400,'一次最多导入2000道题')
  const rows:any[]=[],errors:any[]=[],seen=new Set<string>()
  for(let line=2;line<=s.rowCount;line++){
    const cells=cols.map((_,i)=>text(s.getCell(line,i+1).value).trim());if(cells.every(v=>!v))continue
    const qid=cells[0]||id()
    try{
      if(seen.has(qid)||(await db.query('SELECT id FROM content WHERE id=$1',[qid])).rows.length)fail(400,'题目ID重复或已存在，导入不会覆盖原题')
      seen.add(qid);z.string().max(160).parse(qid)
      const pointIds=cells[2].split(/[,，\s]+/).filter(Boolean)
      if(!pointIds.length||new Set(pointIds).size!==pointIds.length)fail(400,'知识点ID不能为空或重复')
      if((await db.query("SELECT id FROM knowledge_nodes WHERE id=ANY($1::text[]) AND exam_id=$2 AND kind='knowledge'",[pointIds,b.examId])).rows.length!==pointIds.length)fail(400,'知识点不存在或不属于该考试')
      const grade=z.enum(['A','B','C','D','E']).nullable().parse(cells[3]||null)
      if(modern&&cells[6]&&cells[6]!==t.name)fail(400,`题型必须为“${t.name}”，其他题型请使用对应模板`)
      if(cells[5]&&!['是','否','1','2'].includes(cells[5]))fail(400,'是否真题只能填是、否、1或2')
      const values=initialValues(t.definition)
      cols.forEach((col,i)=>{if(!col.field)return;const v=cells[i]
        if(col.option!==undefined){if(col.required&&!v)fail(400,`${col.title}不能为空`);const options=col.part==='value'?values[col.field]:values[col.field].options;options[col.option]=v;return}
        if(col.boolean&&col.part==='answer'){if(!['正确','错误'].includes(v))fail(400,`${col.title}只能填写正确或错误`);values[col.field].answer=[v==='正确'?0:1];return}
        if(col.part==='value')values[col.field]=flattenFields(t.definition.fields).find(f=>f.id===col.field)!.kind==='options'?v.split(/\r?\n/).filter(Boolean):v
        else values[col.field][col.part!]=col.part==='options'?v.split(/\r?\n/).filter(Boolean):col.part==='answer'?(v?v.toUpperCase().split(/[,，、\s]+/).join('').split('').map(s=>s.charCodeAt(0)-65):[]):v
      })
      for(const f of flattenFields(t.definition.fields)){
        if(f.kind==='options'||(['single','multiple'].includes(f.kind)&&!f.optionsSource)){
          const options=f.kind==='options'?values[f.id]:values[f.id].options
          while(options.length&&!options.at(-1))options.pop()
          if(options.some((v:string)=>!v))fail(400,`${f.label}的选项不能跳空，请从选项 A 开始连续填写`)
        }
      }
      const first=flattenFields(t.definition.fields).find(isAnswer)
      const stem=cells[1]||(first?values[first.id]?.prompt:'')
      if(stem.length>2000)fail(400,'标题超过2000字，请填写简短的检索标题')
      const payload={type:'configured',templateId:t.id,templateVersion:t.version,values,stem,knowledgePointId:pointIds[0],knowledgePointIds:pointIds,year:cells[4],source:['是','1'].includes(cells[5])?'真题':''}
      await validateConfiguredQuestion(payload,b.examId)
      rows.push({line,id:qid,grade,payload})
    }catch(e:any){errors.push({line,id:qid,message:e.issues?.map((i:any)=>i.message).join('；')||e.message})}
  }
  if(!rows.length&&!errors.length)fail(400,'文件中没有题目')
  const batchId=id()
  await db.query('INSERT INTO import_batches(id,actor_id,exam_id,filename,rows,errors) VALUES($1,$2,$3,$4,$5,$6)',[batchId,res.locals.user.id,b.examId,b.filename,JSON.stringify(rows),JSON.stringify(errors)])
  await audit(res.locals.user.id,'import.preview',batchId,{typeId:t.id,version:t.version,valid:rows.length,invalid:errors.length})
  res.json({id:batchId,rows,errors})
})
