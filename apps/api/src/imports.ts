import ExcelJS from 'exceljs'
import { db, transaction } from './db.ts'
import { fail, id, audit } from './security.ts'
import { validateQuestion } from './content.ts'
import { validateConfiguredQuestion } from './question-types.ts'

const headers = ['题目ID','题型','题目内容','选项A','选项B','选项C','选项D','选项E','正确答案','解析','知识点ID','年份','是否真题','参考答案','评分标准','满分']
export async function template() {
  const w = new ExcelJS.Workbook(); const s = w.addWorksheet('题目导入')
  s.addRow(headers)
  s.addRow(['test-import-001','单选题','【测试内容】社会工作的专业理念是？','助人自助','代替决定','','','','A','以支持服务对象发展能力为目标。','kp-1-1-1','','否','','',''])
  s.getRow(1).font={bold:true}; s.columns.forEach(c=>{c.width=20})
  return w.xlsx.writeBuffer()
}
const cellText = (value:any):string => value === null || value === undefined ? '' : typeof value === 'object' ? value.richText?.map((x:any)=>x.text).join('') ?? value.text ?? String(value.result ?? '') : String(value)
export async function preview(actor: string, examId: string, filename: string, data: string) {
  if (Buffer.byteLength(data,'base64')>8*1024*1024) fail(400,'文件不能超过8MB')
  const workbook = new ExcelJS.Workbook()
  try { await workbook.xlsx.load(Buffer.from(data,'base64') as any) } catch { fail(400,'无法读取Excel，请上传未损坏的xlsx文件') }
  const sheet=workbook.worksheets.find(s=>cellText(s.getCell(1,1).value)==='题目ID')
  if (!sheet || headers.some((header,index)=>cellText(sheet.getCell(1,index+1).value).trim()!==header)) return fail(400,'标准题目表头缺失或顺序不一致，请下载模板。原始资料需要先做字段映射，不能直接当标准模板导入。')
  if (sheet.rowCount>2001) fail(400,'每次最多导入2000题')
  const rows:any[]=[]; const errors:any[]=[]; const seen=new Set<string>()
  for (let n=2;n<=sheet.rowCount;n++) {
    const v=headers.map((_h,i)=>cellText(sheet.getCell(n,i+1).value).trim())
    if (v.every(x=>!x)) continue
    const [qid,type,stem,a,b,c,d,e,answer,explanation,knowledgePointId,year,real,referenceAnswer,rubric,score]=v
    try {
      if (!qid || seen.has(qid)) fail(400,'题目ID为空或在文件中重复')
      seen.add(qid)
      const options=[a,b,c,d,e]; while(options.length && !options.at(-1)) options.pop()
      const payload={id:qid,type:type==='单选题'?'single':type==='多选题'?'multiple':type==='主观题'?'subjective':type,stem,options,answer:answer?answer.toUpperCase().split(/[,，、\s]+/).join('').split('').map(x=>x.charCodeAt(0)-65):[],explanation,knowledgePointId,year,source:real==='是'?'真题':'',referenceAnswer,rubric,maxScore:score?Number(score):undefined}
      validateQuestion(payload)
      if ((await db.query('SELECT id FROM content WHERE id=$1',[qid])).rows.length) fail(400,'该题目ID已存在，导入不会覆盖已有题目')
      const point=(await db.query(`SELECT * FROM content WHERE id=$1 AND exam_id=$2 AND kind='knowledge'`,[knowledgePointId,examId])).rows[0]
      if (!point) fail(400,'知识点ID不存在或考试不匹配')
      rows.push({line:n,id:qid,payload})
    } catch(error) { errors.push({line:n,id:qid,message:error instanceof Error?error.message:'格式错误'}) }
  }
  if (!rows.length && !errors.length) fail(400,'文件没有题目')
  const batchId=id()
  await db.query('INSERT INTO import_batches(id,actor_id,exam_id,filename,rows,errors) VALUES($1,$2,$3,$4,$5,$6)',[batchId,actor,examId,filename,JSON.stringify(rows),JSON.stringify(errors)])
  await audit(actor,'import.preview',batchId,{filename,valid:rows.length,invalid:errors.length})
  return {id:batchId,rows,errors}
}
export async function commitImport(actor:string,batchId:string,isTest:boolean) {
  const count=await transaction(async c=>{
    const batch=(await c.query('SELECT * FROM import_batches WHERE id=$1 AND actor_id=$2 FOR UPDATE',[batchId,actor])).rows[0]
    if(!batch) fail(404,'导入批次不存在')
    if(batch.status!=='preview') fail(409,'此批次已经导入')
    if(batch.errors.length) fail(400,'请修复全部错误后重新上传')
    for(const row of batch.rows) {
      if(row.payload.type==='configured')await validateConfiguredQuestion(row.payload,batch.exam_id,c)
      const pointIds=row.payload.knowledgePointIds||[row.payload.knowledgePointId]
      if((await c.query("SELECT id FROM knowledge_nodes WHERE id=ANY($1::text[]) AND exam_id=$2 AND kind='knowledge' FOR SHARE",[pointIds,batch.exam_id])).rows.length!==pointIds.length)fail(400,'知识点不存在或归属已变化，请重新预览')
      await c.query(`INSERT INTO content(id,exam_id,kind,parent_id,title,payload,status,source,is_test_data) VALUES($1,$2,'question',$3,$4,$5,'draft',$6,$7)`,[row.id,batch.exam_id,row.payload.knowledgePointId,row.payload.stem,JSON.stringify(row.payload),batch.filename,isTest])
      if(row.grade!=null)await c.query('UPDATE questions SET grade=$2 WHERE id=$1',[row.id,row.grade])
    }
    await c.query(`UPDATE import_batches SET status='committed' WHERE id=$1`,[batchId])
    return batch.rows.length
  })
  await audit(actor,'import.commit',batchId,{count,isTest})
  return {count}
}
