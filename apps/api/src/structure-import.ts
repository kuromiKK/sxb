import ExcelJS from 'exceljs'
import { isDeepStrictEqual } from 'node:util'
import { z } from 'zod'
import { db,type Queryable } from './db.ts'
import { fail } from './security.ts'
import { inspectDocument,validateDocument } from './rich-document.ts'
import { structureFields,structureHeaders,structurePathHeaders,type StructureImportOptions } from '../../shared/structure-import.ts'

export const structureOptionsSchema=z.object({mode:z.enum(['create','update']).default('create'),fields:z.array(z.enum(['stars','shortTitle','document'])).default([]),blankBehavior:z.enum(['keep','clear']).default('keep')}).superRefine((v,c)=>{
 if(new Set(v.fields).size!==v.fields.length)c.addIssue({code:'custom',message:'导入字段不能重复'})
 if(v.mode==='update'&&!v.fields.length)c.addIssue({code:'custom',message:'请至少选择一个需要更新的字段'})
 if(v.mode==='create'&&v.blankBehavior==='clear')c.addIssue({code:'custom',message:'清空空值仅适用于更新已有内容'})
})
export const defaultStructureOptions=()=>structureOptionsSchema.parse({})
export const normalizeStructureTitle=(v:string)=>v.normalize('NFKC').trim().replace(/\s+/g,' ')
const text=(v:any):string=>v==null?'':typeof v==='object'?v.richText?.map((x:any)=>x.text).join('')??v.text??String(v.result??''):String(v)
const kinds=['subject','chapter','section','knowledge']
const plainDocument=(value:string)=>({type:'doc',content:value.split(/\r?\n/).map(line=>({type:'paragraph',content:line?[{type:'text',text:line}]:[]}))})

export function addStructureTemplate(w:ExcelJS.Workbook,name:string,options:StructureImportOptions){
 const headers=structureHeaders(options),s=w.addWorksheet('知识目录');s.addRow(headers);s.columns=headers.map(h=>({width:h==='知识点正文'?60:36}));s.views=[{state:'frozen',ySplit:1}];s.getRow(1).font={bold:true}
 const meta=w.addWorksheet('导入设置');meta.addRow(['配置',JSON.stringify(options)]);meta.state='veryHidden'
 const guide=w.addWorksheet('填写说明');guide.addRows([
  ['考试项目',name],['导入模式',options.mode==='update'?'按节点唯一 ID 更新已有内容；ID 必须属于当前考试，不改变归属、标题、状态和测试标记。':'一行一条路径，重复填写上级名称；不支持合并单元格。允许末尾层级留空，不允许中间缺层。'],
  ['所选字段',structureFields.filter(f=>options.fields.includes(f.key)).map(f=>f.label+'：'+f.hint).join('；')||'只导入四级名称'],
  ['适用范围','星级、正文只用于知识点；短标题只用于科目。其他层级对应字段请留空。'],
  ['空值',options.blankBehavior==='clear'?'更新模式：选中字段的空值将清空对应旧值。未选字段始终保留。':'空单元格保留原值；新增节点留空不设置。未选字段始终保留。'],
  ['正文','纯文本导入，不解析 HTML，不导入嵌入图片；更新正文将替换原有图文排版。图片、音视频请在编辑器管理。'],
  ['去重','新增模式下，同一父级、同层级的规范化名称相同则复用 ID，不覆盖已有字段。补充已有内容请使用更新模式。'],
  ['排序与状态','新增内容为草稿；同一父级下按首次出现顺序追加编号。'],
 ]);guide.columns=[{width:18},{width:100}]
}

function readValues(s:ExcelJS.Worksheet,line:number,options:StructureImportOptions){
 const values:Record<string,any>={},offset=options.mode==='update'?1:4
 for(const [i,field] of structureFields.filter(f=>options.fields.includes(f.key)).entries()){
  const c=s.getCell(line,offset+i+1);if(c.isMerged)fail(400,'请取消合并单元格')
  if(c.type===ExcelJS.ValueType.Formula||c.type===ExcelJS.ValueType.Error)fail(400,`${field.label}不能使用公式或错误值`)
  const value=text(c.value).trim();if(!value){if(options.blankBehavior==='clear')values[field.key]=null;continue}
  if(field.key==='stars'){if(!/^[0-5]$/.test(value))fail(400,'星级必须为 0–5 的整数');values.stars=Number(value)}
  if(field.key==='shortTitle'){if(value.length>12)fail(400,'科目短标题最多12个字');values.shortTitle=value}
  if(field.key==='document'){if(value.length>32767)fail(400,'单个正文最多32767字');inspectDocument(plainDocument(value));values.document=value}
 }
 return values
}
export function structurePatch(payload:any,values:Record<string,any>,kind:string){
 const next={...payload};const changes:any[]=[]
 for(const field of structureFields){
  if(field.kind!==kind||!(field.key in values))continue
  const value=values[field.key],before=field.key==='document'?(payload.document?inspectDocument(payload.document).text:payload.content||''):payload[field.key]??null
  if(field.key==='document'){
   const document=plainDocument(value??'');if(isDeepStrictEqual(payload.document,document)&&(payload.content||'')===(value??''))continue
   // A text import intentionally replaces the whole body, including previous formatting/media.
   next.document=document;next.content=value??''
  }else{if(isDeepStrictEqual(before,value))continue;if(value===null)delete next[field.key];else next[field.key]=value}
  changes.push({field:field.key,label:field.label,before,after:value,replaceBody:field.key==='document'&&!!payload.document})
 }
 return {payload:next,changes}
}

export async function previewStructure(w:ExcelJS.Workbook,examId:string,isTest:boolean,options:StructureImportOptions){
 const s=w.getWorksheet('知识目录'),headers=structureHeaders(options)
 if(!s||s.columnCount!==headers.length||headers.some((h,i)=>text(s.getCell(1,i+1).value)!==h))fail(400,'文件列与所选导入字段不一致，请按当前选择重新下载模板')
 const meta=w.getWorksheet('导入设置')
 if(meta){let config;try{config=structureOptionsSchema.parse(JSON.parse(text(meta.getCell(1,2).value)))}catch{fail(400,'模板导入设置无效，请重新下载')}
  if(config!.mode!==options.mode||!isDeepStrictEqual([...config!.fields].sort(),[...options.fields].sort()))fail(400,'模板模式或字段与当前选择不一致，请重新下载对应模板')
 }else if(options.mode!=='create'||options.fields.length)fail(400,'请下载支持字段选择的新模板')
 if(s!.rowCount>10001)fail(400,'一次最多导入10000行')
 const all=(await db.query('SELECT * FROM knowledge_nodes WHERE exam_id=$1',[examId])).rows,byId=new Map(all.map(n=>[n.id,n]))
 const siblings=new Map<string,any[]>();for(const n of all){const key=JSON.stringify([n.parent_id,n.kind,normalizeStructureTitle(n.title)]);siblings.set(key,[...(siblings.get(key)||[]),n])}
 const rows:any[]=[],duplicates=new Map<string,any[]>(),newFieldOwners=new Map<string,any[]>()
 for(let line=2;line<=s!.rowCount;line++){
  if(headers.every((_,i)=>!text(s!.getCell(line,i+1).value).trim()))continue
  const r:any={line,title:'',status:'pending',message:'',nodes:[],changes:[],expected:[],values:{},action:'unchanged'};rows.push(r)
  try{
   r.values=readValues(s!,line,options)
   const width=options.mode==='update'?1:4
   for(let i=1;i<=width;i++){const c=s!.getCell(line,i);if(c.isMerged)fail(400,'请取消合并单元格并逐行填写');if(c.type===ExcelJS.ValueType.Formula||c.type===ExcelJS.ValueType.Error)fail(400,'ID 和名称不能使用公式或错误值')}
   let key:string
   if(options.mode==='update'){
    r.id=text(s!.getCell(line,1).value).trim();r.title=r.id
    const node=byId.get(r.id);if(!node||node.payload.deletedAt)fail(400,'节点 ID 不存在、已删除或不属于当前考试')
    r.title=node.title;r.expected=[{id:node.id,kind:node.kind,version:node.version}]
    if(!structureFields.some(f=>options.fields.includes(f.key)&&f.kind===node.kind))fail(400,'所选字段不适用于这个节点层级')
    if(structureFields.some(f=>f.kind!==node.kind&&r.values[f.key]!=null))fail(400,'星级和正文只适用于知识点，短标题只适用于科目')
    r.changes=structurePatch(node.payload,r.values,node.kind).changes;r.action=r.changes.length?'update':'unchanged';key=r.id
   }else{
    const path=structurePathHeaders.map((_,i)=>normalizeStructureTitle(text(s!.getCell(line,i+1).value)))
    r.title=path.filter(Boolean).join(' / ');const last=path.reduce((n,v,i)=>v?i:n,-1)
    if(last<0||path.slice(0,last+1).some(v=>!v))fail(400,'目录中间不能缺层')
    if(path.some(v=>v.length>2000))fail(400,'名称超过2000字')
    r.path=path.slice(0,last+1);let parent:string|null=examId
    if(last<3&&(r.values.stars!=null||r.values.document!=null))fail(400,'填写星级或正文时必须提供完整知识点路径')
    for(const [index,title] of r.path.entries()){
     const kind=kinds[index],matches:any[]=parent?siblings.get(JSON.stringify([parent,kind,title]))||[]:[]
     if(matches.length>1)fail(409,`${title} 存在多个同名节点，请先消除歧义`)
     const node:any=matches[0];if(node&&(node.is_test_data!==isTest||node.payload.deletedAt))fail(409,`${title} 的测试标记不同或已删除，请人工确认`)
     r.expected.push({id:node?.id||null,kind,version:node?.version})
     if(!node){r.action='create';const ownerKey=JSON.stringify(r.path.slice(0,index+1));newFieldOwners.set(ownerKey,[...(newFieldOwners.get(ownerKey)||[]),{row:r,index,kind}])
     }
     parent=node?.id||null
    }
    key=JSON.stringify(r.path)
   }
   duplicates.set(key!,[...(duplicates.get(key!)||[]),r]);r.message=r.action==='update'?'将更新选中字段':r.action==='create'?'将新增缺少的节点；已有节点保持原值':'内容未变化，保留原值'
  }catch(e:any){r.status='failed';r.message=e.message}
 }
 for(const group of duplicates.values())if(group.length>1){const conflict=group.some(r=>!isDeepStrictEqual(r.values,group[0].values));for(const [index,r] of group.entries())if(conflict){r.status='failed';r.message='文件内同一节点的字段值冲突，请保留一条明确记录'}else if(index){r.status='skipped';r.message='文件内重复，跳过'}}
 for(const entries of newFieldOwners.values()){
  const group=entries.filter(g=>g.row.status!=='failed');if(!group.length)continue
  const values:Record<string,any>={};let conflict=false
  for(const field of structureFields.filter(f=>f.kind===group[0].kind)){
   const supplied=group.filter(g=>field.key in g.row.values).map(g=>g.row.values[field.key]);if(!supplied.length)continue
   if(supplied.some(v=>!isDeepStrictEqual(v,supplied[0])))conflict=true
   values[field.key]=supplied[0]
  }
  for(const {row,index} of group){if(conflict){row.status='failed';row.message='同一新增节点在不同行的字段值冲突，请统一后重试'}else{row.nodeValues??={};row.nodeValues[index]=values}}
 }
 for(const r of rows.filter(r=>r.path&&r.status!=='failed'))r.changes=r.expected.flatMap((n:any,index:number)=>n.id?[]:structurePatch({},r.nodeValues?.[index]||{},n.kind).changes.map(c=>({...c,target:r.path[index]})))
 return rows
}

export async function applyStructureUpdate(c:Queryable,j:any,r:any){
 const node=(await c.query('SELECT * FROM knowledge_nodes WHERE id=$1 FOR UPDATE',[r.id])).rows[0]
 if(!node||node.exam_id!==j.exam_id||node.payload.deletedAt)fail(409,'节点不存在或考试归属已变化，请重新预览')
 if(node.version!==r.expected[0].version||node.kind!==r.expected[0].kind)fail(409,'预览后内容已被修改，请重新上传校验，避免覆盖他人修改')
 const {payload,changes}=structurePatch(node.payload,r.values,node.kind)
 if(changes.some(x=>x.field==='document'))await validateDocument(payload.document,node.id,j.exam_id,c)
 if(changes.length)await c.query('UPDATE content SET payload=$2,version=version+1,updated_at=now() WHERE id=$1',[node.id,JSON.stringify(payload)])
 r.nodes=[{id:node.id,kind:node.kind,title:node.title,created:false,updated:!!changes.length}];r.status=changes.length?'success':'skipped';r.message=changes.length?'所选字段已更新；其他内容保留':'内容未变化，保留原值'
}
