import { Router } from 'express'
import { z } from 'zod'
import { mkdir,readFile,rename,unlink } from 'node:fs/promises'
import { join } from 'node:path'
import JSZip from 'jszip'
import ExcelJS from 'exceljs'
import { db,transaction } from './db.ts'
import { fail,hash,id } from './security.ts'
import { mediaDirectory,ticket } from './study-content.ts'
import { resourceInventory,publicResource } from './resource-index.ts'
import { lockResourceReferences } from './editor-images.ts'

export const resourceManagement=Router()
resourceManagement.get('/',async(req,res)=>{
 const q=z.object({search:z.string().max(200).default(''),kind:z.enum(['','image','video','audio','handout','import']).default(''),usage:z.enum(['','used','unused']).default(''),page:z.coerce.number().int().positive().default(1)}).parse(req.query)
 const all=await resourceInventory(),used=all.filter(r=>r.references.length),unused=all.filter(r=>!r.references.length)
 const diskGroups=new Map<string,typeof all>();for(const r of all){const key=r.diskName||r.id;diskGroups.set(key,[...(diskGroups.get(key)||[]),r])}
 const groups=[...diskGroups.values()]
 const filtered=all.filter(r=>(!q.kind||r.kind===q.kind)&&(!q.usage||(q.usage==='used'?!!r.references.length:!r.references.length))&&(!q.search||(r.filename+' '+r.id).toLowerCase().includes(q.search.trim().toLowerCase())))
 res.json({items:filtered.slice((q.page-1)*20,q.page*20).map(publicResource),total:filtered.length,summary:{total:all.length,used:used.length,unused:unused.length,bytes:groups.reduce((n,r)=>n+r[0].size,0),unusedBytes:groups.filter(g=>g.every(r=>!r.references.length)).reduce((n,g)=>n+g[0].size,0)}})
})
resourceManagement.get('/location',async(req,res)=>{
 const q=z.object({kind:z.string(),id:z.string()}).parse(req.query)
 const row=q.kind==='product'?(await db.query('SELECT * FROM products WHERE id=$1',[q.id])).rows[0]:q.kind==='message'||q.kind==='message-template'?(await db.query(`SELECT * FROM ${q.kind==='message'?'messages':'message_templates'} WHERE id=$1`,[q.id])).rows[0]:q.kind==='exam'?(await db.query('SELECT * FROM exams WHERE id=$1',[q.id])).rows[0]:q.kind==='category'?(await db.query('SELECT * FROM exam_categories WHERE id=$1',[q.id])).rows[0]:(await db.query("SELECT * FROM content WHERE id=$1 AND kind=$2 AND NOT (payload ? 'deletedAt')",[q.id,q.kind])).rows[0]
 if(!row)fail(404,'引用内容已不存在');res.json(row)
})
resourceManagement.get('/:id',async(req,res)=>{
 const item=(await resourceInventory()).find(r=>r.id===req.params.id);if(!item)fail(404,'资源不存在或已被移除')
 res.json(publicResource(item!))
})
function diskPath(name:string){if(!/^[a-f0-9-]{36}$/.test(name))fail(400,'文件路径无效');return join(mediaDirectory,name)}
const xmlText=(xml:string)=>[...xml.matchAll(/<(?:w|a):t\b[^>]*>([\s\S]*?)<\/(?:w|a):t>|<\/(?:w|a):p>/g)].map(m=>m[1]===undefined?'\n':m[1].replace(/&(?:lt|gt|amp|quot|apos|#\d+|#x[a-f\d]+);/gi,e=>{const common:Record<string,string>={'&lt;':'<','&gt;':'>','&amp;':'&','&quot;':'"','&apos;':"'"};if(common[e])return common[e];const n=e.startsWith('&#x')?parseInt(e.slice(3,-1),16):Number(e.slice(2,-1));return n>0&&n<=0x10ffff?String.fromCodePoint(n):''})).join('').trim()
resourceManagement.post('/:id/preview',async(req,res)=>{
 const item=(await resourceInventory()).find(r=>r.id===req.params.id);if(!item)fail(404,'资源不存在')
 if(item!.storage==='embedded'){res.json({url:item!.data});return}
 const asset=(await db.query("SELECT * FROM media_assets WHERE id=$1 AND source='upload'",[req.params.id])).rows[0];if(!asset)fail(404,'资源不存在')
 const signed=await ticket(asset,hash(req.headers.authorization?.replace(/^Bearer /,'')||''))
 const result:any={url:signed.url+'?preview=1',downloadUrl:signed.url}
 if(asset.kind==='import'){
  const w=new ExcelJS.Workbook();await w.xlsx.load(await readFile(diskPath(asset.disk_name)) as any)
  result.text=w.worksheets.filter(s=>s.state==='visible'&&['知识目录','题目'].includes(s.name)).map(s=>s.name+'\n'+s.getRows(1,Math.min(s.rowCount,21))?.map(row=>(row.values as any[]).slice(1).map(v=>typeof v==='object'?v?.text||v?.richText?.map((x:any)=>x.text).join('')||'':String(v??'')).join(' | ')).join('\n')).join('\n\n')
  result.notice='前20行预览；完整内容请下载原始文件。'
 }
 if(/\.(docx|pptx)$/i.test(asset.filename)){
  // Preview text locally; never send private teaching materials to a third-party viewer.
  if(Number(asset.size_bytes)>32*1024*1024){result.notice='文件较大，请下载查看完整内容'}
  else try{
   const zip=await JSZip.loadAsync(await readFile(diskPath(asset.disk_name)))
   const entries=Object.values(zip.files).filter(f=>/^(word\/document\.xml|ppt\/slides\/slide\d+\.xml)$/.test(f.name)).sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}))
   let budget=2*1024*1024;const sections=[]
   for(const entry of entries.slice(0,100)){
    const data=await new Promise<Buffer>((resolve,reject)=>{const chunks:Buffer[]=[];const stream=entry.nodeStream() as import('node:stream').Readable;stream.on('data',(chunk:Buffer|string)=>{const buffer=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);budget-=buffer.length;if(budget<0){stream.destroy();reject(new Error('Preview too large'));return}chunks.push(buffer)});stream.on('error',reject);stream.on('end',()=>resolve(Buffer.concat(chunks)))})
    sections.push(xmlText(data.toString('utf8')))
   }
   result.text=sections.join('\n\n———\n\n');result.notice='文本预览，原始排版、图片与图表请下载查看';if(entries.length>100)result.notice+='（仅预览前100页）'
  }catch{result.notice='暂时无法生成文本预览，请下载原文件查看'}
 }
 res.json(result)
})
resourceManagement.delete('/:id',async(req,res)=>{
 let moved='';let original=''
 try{
  await transaction(async c=>{
   await lockResourceReferences(c)
   const info=(await c.query("SELECT content_id FROM media_assets WHERE id=$1 AND source='upload'",[req.params.id])).rows[0];if(!info)fail(404,'文件不存在，或是仍在使用的内嵌图片')
   // Same owner lock as content saves, then asset lock: an upload cannot become referenced mid-cleanup.
   await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[info.content_id])
   const asset=(await c.query("SELECT * FROM media_assets WHERE id=$1 AND source='upload' FOR UPDATE",[req.params.id])).rows[0];if(!asset)fail(404,'文件已被清理')
   const current=(await resourceInventory(c)).find(r=>r.id===asset.id)
   if(current?.references.length)fail(409,'此文件仍被内容引用，不能清理。请先在对应内容中移除引用。')
   original=diskPath(asset.disk_name);const trash=join(mediaDirectory,'.trash');await mkdir(trash,{recursive:true});const destination=join(trash,id())
   const shared=(await c.query('SELECT 1 FROM media_assets WHERE disk_name=$1 AND id<>$2 LIMIT 1',[asset.disk_name,asset.id])).rows.length
   if(!shared)try{await rename(original,destination);moved=destination}catch(e:any){if(e.code!=='ENOENT')throw e}
   await c.query('DELETE FROM media_tickets WHERE asset_id=$1',[asset.id]);await c.query('DELETE FROM media_assets WHERE id=$1',[asset.id])
   await c.query('INSERT INTO audit_logs(id,actor_id,action,target_id,details) VALUES($1,$2,$3,$4,$5)',[id(),res.locals.user.id,'resource.cleanup',asset.id,JSON.stringify({filename:asset.filename,size:Number(asset.size_bytes)})])
  })
 }catch(e){if(moved)await rename(moved,original);throw e}
 // Only erase bytes after the metadata transaction commits. Failed commits restore the file.
 let pendingRemoval=false;if(moved)try{await unlink(moved)}catch{pendingRemoval=true}
 res.json({ok:true,pendingRemoval})
})
