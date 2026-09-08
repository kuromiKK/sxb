import { db, type Queryable } from './db.ts'
import { fail } from './security.ts'

export type RichNode = { type:string; text?:string; attrs?:Record<string,any>; marks?:{type:string}[]; content?:RichNode[] }
const containers = new Set(['doc','paragraph','heading','bulletList','orderedList','listItem','blockquote'])
const marks = new Set(['bold','italic','strike','underline','code'])
export function inspectDocument(doc:any): {assets:string[];text:string} {
  let count=0; const assets:string[]=[]; const text:string[]=[]
  function visit(n:any,depth:number,parent:string) {
    if(++count>12000 || depth>16 || !n || typeof n!=='object' || Array.isArray(n))fail(400,'正文结构无效或过于复杂')
    if(Object.keys(n).some(k=>!['type','text','attrs','marks','content'].includes(k)))fail(400,'正文包含不支持的属性')
    if(n.marks && (!Array.isArray(n.marks)||n.marks.some((m:any)=>!marks.has(m.type)||Object.keys(m).some(k=>k!=='type'))))fail(400,'正文格式不受支持')
    if(n.type==='text') {
      if(typeof n.text!=='string'||n.text.length>100000||n.attrs||n.content)fail(400,'文本节点无效')
      text.push(n.text); return
    }
    if(n.type==='resource') {
      if(parent!=='doc'||n.content||n.text||!n.attrs||Object.keys(n.attrs).some(k=>!['assetId','kind','title','posterAssetId'].includes(k)))fail(400,'媒体必须单独成段')
      if(typeof n.attrs.assetId!=='string'||!['image','audio','video','handout'].includes(n.attrs.kind)||typeof n.attrs.title!=='string'||n.attrs.title.length>300)fail(400,'媒体信息不完整')
      assets.push(n.attrs.assetId)
      if(n.attrs.posterAssetId) {if(typeof n.attrs.posterAssetId!=='string')fail(400,'封面无效');assets.push(n.attrs.posterAssetId)}
      return
    }
    if(!containers.has(n.type)&&!['hardBreak','horizontalRule'].includes(n.type))fail(400,'正文节点不受支持')
    if(n.attrs && Object.keys(n.attrs).length && !(n.type==='heading'&&Object.keys(n.attrs).every(k=>k==='level')&&[1,2,3].includes(n.attrs.level)) && !(n.type==='orderedList'&&Object.keys(n.attrs).every(k=>k==='start'||k==='type')&&n.attrs.start===1&&!n.attrs.type))fail(400,'正文属性不受支持')
    if(n.content!==undefined&&!Array.isArray(n.content))fail(400,'正文结构无效')
    if(n.type==='doc'&&depth!==0)fail(400,'正文不能嵌套文档')
    for(const child of n.content||[])visit(child,depth+1,n.type)
    text.push('\n')
  }
  if(doc?.type!=='doc'||JSON.stringify(doc).length>1_000_000)fail(400,'正文无效或超过容量限制')
  visit(doc,0,'')
  return {assets:[...new Set(assets)],text:text.join('').trim()}
}
export async function validateDocument(doc:any,contentId:string,examId:string,c:Queryable=db) {
  const result=inspectDocument(doc)
  for(const assetId of result.assets) {
    const asset=(await c.query('SELECT * FROM media_assets WHERE id=$1 AND content_id=$2 AND exam_id=$3',[assetId,contentId,examId])).rows[0]
    if(!asset)fail(400,'正文资源不存在或不属于当前内容与考试')
    for(const n of doc.content||[])if(n.type==='resource') {
      if(n.attrs.assetId===assetId&&asset.kind!==n.attrs.kind)fail(400,'资源类型不匹配')
      if(n.attrs.posterAssetId===assetId&&asset.kind!=='image')fail(400,'视频封面必须是图片')
    }
  }
  return result
}
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
export function renderText(n:RichNode):string {
  if(n.type==='resource')return ''
  if(n.type==='text')return (n.marks||[]).reduce((s,m)=>{const tag:Record<string,string>={bold:'strong',italic:'em',strike:'s',underline:'u',code:'code'};return `<${tag[m.type]}>${s}</${tag[m.type]}>`},escape(n.text||''))
  if(n.type==='hardBreak')return '<br>'
  if(n.type==='horizontalRule')return '<hr>'
  const tag=({doc:'div',paragraph:'p',heading:`h${n.attrs?.level||2}`,bulletList:'ul',orderedList:'ol',listItem:'li',blockquote:'blockquote'} as Record<string,string>)[n.type]||'p'
  return `<${tag}>${(n.content||[]).map(renderText).join('')}</${tag}>`
}
