import { createHash } from 'node:crypto'
import { db, type Queryable } from './db.ts'

export type ResourceReference={id:string;kind:string;title:string;examName:string;status:string;location:string}
export type ResourceItem={id:string;filename:string;kind:string;mime:string;size:number;createdAt:string|null;storage:'file'|'embedded';references:ResourceReference[];diskName?:string;data?:string;ownerId?:string;uploader?:string}
const digest=(value:string)=>createHash('sha256').update(value).digest('hex')
// Scan saved content, including drafts and offline content. Upload ownership alone is not a reference.
export async function resourceInventory(c:Queryable=db):Promise<ResourceItem[]> {
 const assets=(await c.query("SELECT a.*,u.nickname AS uploader FROM media_assets a LEFT JOIN users u ON u.id=a.owner_id WHERE a.source='upload' ORDER BY a.created_at DESC,a.id")).rows
 const items=new Map<string,ResourceItem>(assets.map(a=>[a.id,{id:a.id,filename:a.filename,kind:a.kind,mime:a.mime,size:Number(a.size_bytes),createdAt:a.legacy_image_hash?null:a.created_at,storage:'file',diskName:a.disk_name,ownerId:a.owner_id,uploader:a.uploader,references:[]}]))
 const legacyImages=new Map(assets.filter(a=>a.legacy_image_hash).map(a=>[a.legacy_image_hash,a.id]))
 const exams=(await c.query('SELECT id,name,cover_url,intro FROM exams')).rows
 const examNames=new Map(exams.map(e=>[e.id,e.name]))
 const content=(await c.query("SELECT id,kind,title,exam_id,status,payload FROM content WHERE NOT (payload ? 'deletedAt')")).rows
 const categories=(await c.query('SELECT id,name,cover_url,intro,enabled FROM exam_categories')).rows
 const link=(item:ResourceItem,ref:ResourceReference)=>{if(!item.references.some(r=>r.id===ref.id&&r.kind===ref.kind&&r.location===ref.location))item.references.push(ref)}
 if((await c.query('SELECT 1 FROM schema_versions WHERE version=30')).rows.length){
  for(const j of (await c.query('SELECT j.*,a.filename FROM import_jobs j JOIN media_assets a ON a.id=j.asset_id')).rows){const item=items.get(j.asset_id);if(item)link(item,{id:j.id,kind:'import-job',title:j.filename,examName:examNames.get(j.exam_id)||'',status:j.status,location:'导入批次与结果'})}
  for(const o of (await c.query('SELECT o.*,c.title,c.kind,c.exam_id,c.status FROM content_origins o JOIN content c ON c.id=o.content_id')).rows){const item=items.get(o.asset_id);if(item)link(item,{id:o.content_id,kind:o.kind,title:o.title,examName:examNames.get(o.exam_id)||'',status:o.status,location:`导入来源 · ${o.sheet} 第 ${o.line} 行`})}
 }
 function visit(value:any,ref:ResourceReference,depth=0){
  if(depth>40||value==null)return
  if(typeof value==='string'){
   const direct=items.get(value);if(direct)link(direct,ref)
   const image=/^data:(image\/(?:png|jpeg|webp|gif));base64,([a-zA-Z0-9+/=\s]+)$/.exec(value)
   if(image){const hash=digest(value),key=legacyImages.get(hash)||'embedded-'+hash;let item=items.get(key);if(!item){item={id:key,filename:ref.title+' · '+ref.location+'.'+image[1].split('/')[1],kind:'image',mime:image[1],size:Buffer.byteLength(image[2],'base64'),createdAt:null,storage:'embedded',references:[],data:value};items.set(key,item)}link(item,ref)}
   // Older content may store a local resource URL rather than its asset ID.
   for(const match of value.matchAll(/\/api\/(?:media\/image|message-images)\/([a-zA-Z0-9_-]+)/g)){const item=items.get(match[1]);if(item)link(item,ref)}
   if(value.startsWith('{')||value.startsWith('['))try{visit(JSON.parse(value),ref,depth+1)}catch{}
  }else if(Array.isArray(value)){for(const child of value)visit(child,ref,depth+1)}
  else if(typeof value==='object'){for(const [key,child] of Object.entries(value))visit(child,{...ref,location:depth===0?({document:'正文',handouts:'配套讲义',mediaAssetId:'课程媒体',posterAssetId:'课程封面'} as Record<string,string>)[key]||ref.location:ref.location},depth+1)}
 }
 for(const row of content)visit(row.payload,{id:row.id,kind:row.kind,title:row.title,examName:examNames.get(row.exam_id)||'',status:row.status,location:'内容资源'})
 // Submitted questions remain readable after the author changes the question.
 const snapshotTables=[['question_submissions','configured']]
 if((await c.query('SELECT 1 FROM schema_versions WHERE version=21')).rows.length)snapshotTables.push(['answers','legacy'])
 for(const [table,source] of snapshotTables)for(const row of (await c.query(`SELECT id,exam_id,question_snapshot FROM ${table} WHERE question_snapshot IS NOT NULL`)).rows){
  visit(row.question_snapshot,{id:source+':'+row.id,kind:'learning-answer',title:row.question_snapshot.title||row.question_snapshot.stem||'答题记录',examName:examNames.get(row.exam_id)||'',status:'',location:'答题记录 · 题目历史版本'})
 }
 for(const row of (await c.query('SELECT p.*,g.exam_id FROM products p JOIN product_entitlements g ON g.product_id=p.id')).rows){
  const ref={id:row.id,kind:'product',title:row.title,examName:examNames.get(row.exam_id)||'',status:row.status,location:'商品头图'}
  visit(row.cover_url,ref);visit(row.document,{...ref,location:'商品正文'})
 }
 // Historical versions and order snapshots remain restorable/readable; protect their files too.
 for(const row of (await c.query('SELECT v.*,p.title FROM product_versions v JOIN products p ON p.id=v.product_id')).rows){
  const ref={id:row.product_id,kind:'product',title:row.title,examName:examNames.get(row.snapshot.examId)||'',status:row.snapshot.status,location:'商品历史版本 V'+row.version}
  visit(row.snapshot.coverUrl,{...ref,location:ref.location+' · 头图'});visit(row.snapshot.document,{...ref,location:ref.location+' · 正文'})
 }
 for(const row of (await c.query('SELECT id,product_id,product_snapshot FROM orders WHERE product_snapshot IS NOT NULL')).rows){
  const ref={id:row.product_id,kind:'product',title:row.product_snapshot.title||'商品',examName:examNames.get(row.product_snapshot.examId)||'',status:'',location:'订单 '+row.id+' · 商品快照'}
  visit(row.product_snapshot.coverUrl,{...ref,location:ref.location+' · 头图'});visit(row.product_snapshot.document,{...ref,location:ref.location+' · 正文'})
 }
 for(const row of exams){const ref={id:row.id,kind:'exam',title:row.name,examName:row.name,status:'',location:'考试封面'};visit(row.cover_url,ref);visit(row.intro,{...ref,location:'考试简介'})}
 for(const row of (await c.query('SELECT exam_id,year,guide_document FROM exam_year_entries WHERE guide_document IS NOT NULL')).rows)visit(row.guide_document,{id:row.exam_id,kind:'exam',title:examNames.get(row.exam_id)||'考试项目',examName:examNames.get(row.exam_id)||'',status:'',location:row.year+' 年 · 了解考试'})
 for(const row of categories){const ref={id:row.id,kind:'category',title:row.name,examName:'',status:row.enabled?'published':'offline',location:'分类封面'};visit(row.cover_url,ref);visit(row.intro,{...ref,location:'分类简介'})}
 for(const [table,kind] of [['messages','message'],['message_templates','message-template']])for(const row of (await c.query(`SELECT id,title,status,document FROM ${table}`)).rows)visit(row.document,{id:row.id,kind,title:row.title,examName:'',status:row.status,location:'消息正文'})
 if((await c.query('SELECT 1 FROM schema_versions WHERE version=22')).rows.length){
  const names:Record<string,string>={basic:'基本设置',customer:'客服设置',about:'关于平台',search:'搜索设置'}
  for(const r of (await c.query('SELECT key,draft,published FROM site_preferences')).rows){const ref={id:r.key,kind:'site-settings',title:names[r.key],examName:'',status:'',location:'系统设置'};visit(r.draft,{...ref,location:'草稿'});visit(r.published,{...ref,location:'已发布配置'})}
  for(const r of (await c.query('SELECT kind,title,draft_document FROM site_protocols')).rows)visit(r.draft_document,{id:r.kind,kind:'site-settings',title:r.title,examName:'',status:'draft',location:'协议草稿'})
  for(const r of (await c.query('SELECT v.*,p.title FROM site_protocol_versions v JOIN site_protocols p ON p.kind=v.kind')).rows)visit(r.document,{id:r.kind,kind:'site-settings',title:r.title,examName:'',status:'',location:'协议历史版本 V'+r.version})
 }
 return [...items.values()]
}
export function publicResource(item:ResourceItem){const {diskName,data,...safe}=item;return {...safe,inUse:item.references.length>0}}
