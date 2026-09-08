import { substitute } from './messages.ts'
export function messageDocument(doc:any) {
 let count=0;const text:string[]=[]
 const walk=(n:any,depth=0):any=>{
  if(++count>5000||depth>14||!n||typeof n!=='object')throw new Error('正文结构过于复杂')
  if(n.type==='text'){if(typeof n.text!=='string')throw new Error('文字格式错误');text.push(n.text);return {type:'text',text:n.text,...(n.marks?{marks:n.marks.map((m:any)=>{if(!['bold','italic','strike','code','underline'].includes(m.type))throw new Error('不支持的文字格式');return {type:m.type}})}:{})}}
  if(n.type==='image') {const src=String(n.attrs?.src||'');if(!/^https:\/\/[^\s]+$/.test(src)&&!/^\/api\/message-images\/[\w-]+$/.test(src))throw new Error('图片仅支持上传或HTTPS链接');return {type:'image',attrs:{src,alt:String(n.attrs?.alt||'消息图片').slice(0,200)}}}
  if(!['doc','paragraph','heading','bulletList','orderedList','listItem','blockquote','hardBreak','horizontalRule','table','tableRow','tableHeader','tableCell'].includes(n.type))throw new Error('消息正文不支持视频、音频或附件')
  if(n.type==='doc'&&depth!==0)throw new Error('文档不能嵌套')
  const attrs=n.type==='heading'?{level:[1,2,3].includes(n.attrs?.level)?n.attrs.level:2}:['tableCell','tableHeader'].includes(n.type)?{colspan:Math.min(10,Math.max(1,Number(n.attrs?.colspan)||1)),rowspan:Math.min(20,Math.max(1,Number(n.attrs?.rowspan)||1))}:undefined
  const result={type:n.type,...(attrs?{attrs}:{}),...(n.content?{content:n.content.map((c:any)=>walk(c,depth+1))}:{})};text.push('\n');return result
 }
 if(doc?.type!=='doc'||JSON.stringify(doc).length>500000)throw new Error('请填写有效正文（最大500KB）')
 const document=walk(doc);return {document,text:text.join('').trim()}
}
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
export function messageHtml(doc:any,values?:Record<string,unknown>):string {
 const walk=(n:any):string=>{
  if(n.type==='text'){let s=escape(values?substitute(n.text,values):n.text);for(const m of n.marks||[]){const t:Record<string,string>={bold:'strong',italic:'em',strike:'s',code:'code',underline:'u'};s=`<${t[m.type]}>${s}</${t[m.type]}>`}return s}
  if(n.type==='image')return `<img src="${escape(n.attrs.src)}" alt="${escape(n.attrs.alt||'消息图片')}" style="max-width:100%;height:auto" />`
  if(n.type==='hardBreak')return '<br>';if(n.type==='horizontalRule')return '<hr>'
  const t=({doc:'div',paragraph:'p',heading:'h'+(n.attrs?.level||2),bulletList:'ul',orderedList:'ol',listItem:'li',blockquote:'blockquote',table:'table',tableRow:'tr',tableHeader:'th',tableCell:'td'} as any)[n.type]
  const a=['td','th'].includes(t)?` style="border:1px solid #dbe3ed;padding:8px" colspan="${n.attrs?.colspan||1}" rowspan="${n.attrs?.rowspan||1}"`:t==='table'?' style="border-collapse:collapse;width:100%"':''
  return `<${t}${a}>${(n.content||[]).map(walk).join('')}</${t}>`
 };return walk(messageDocument(doc).document)
}
