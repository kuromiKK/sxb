import { Router } from 'express'
import multer from 'multer'
import { fileTypeFromFile } from 'file-type'
import { mkdir, unlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import { randomBytes } from 'node:crypto'
import { isIP } from 'node:net'
import { z } from 'zod'
import { db } from './db.ts'
import { id, hash, fail, audit } from './security.ts'
import { publishedContent } from './content.ts'
import { rights } from './membership.ts'
import { inspectDocument, renderText } from './rich-document.ts'

export const mediaDirectory=resolve(process.env.MEDIA_DIR||'.local/media')
const upload=multer({storage:multer.diskStorage({destination:(_req,_file,done)=>{mkdir(mediaDirectory,{recursive:true}).then(()=>done(null,mediaDirectory),e=>done(e,mediaDirectory))},filename:(_req,_file,done)=>done(null,id())}),limits:{fileSize:200*1024*1024,files:1,fields:0}})
export const mediaAdmin=Router()
const assetInput=z.object({examId:z.string().min(1),contentId:z.string().min(1).max(160),kind:z.enum(['image','video','audio','handout'])})
export function externalUrl(value:string) {
  let url:URL;try{url=new URL(value)}catch{fail(400,'请输入完整 HTTPS 外链')}
  const host=url!.hostname.toLowerCase()
  if(url!.protocol!=='https:'||url!.username||url!.password||isIP(host)||host.includes(':')||!host.includes('.')||host==='localhost'||/\.(localhost|local|internal|test|invalid)$/.test(host))fail(400,'外链仅支持公网 HTTPS 地址')
  return url!.href
}
async function checkOwner(examId:string,contentId:string) {
  if(!(await db.query('SELECT id FROM exams WHERE id=$1',[examId])).rows.length)fail(404,'考试不存在')
  const existing=(await db.query('SELECT exam_id,kind FROM content WHERE id=$1',[contentId])).rows[0]
  if(existing&&(existing.exam_id!==examId||!['knowledge','cheatsheet'].includes(existing.kind)))fail(400,'资源只能绑定当前考试的知识点或考前小抄')
}
mediaAdmin.post('/upload',async(req,res,next)=>{
  const b=assetInput.parse(req.query);await checkOwner(b.examId,b.contentId)
  upload.single('file')(req,res,async(error)=>{
    if(error)return next(Object.assign(error,{status:error.code==='LIMIT_FILE_SIZE'?413:400,message:error.code==='LIMIT_FILE_SIZE'?'单个文件不能超过 200MB':'上传失败，请检查文件'}))
    const f=req.file;if(!f)return next(Object.assign(new Error('请选择文件'),{status:400}))
    try {
      const type=await fileTypeFromFile(f.path)
      const allowed:Record<string,string[]>={image:['image/jpeg','image/png','image/webp','image/gif'],video:['video/mp4','video/webm'],audio:['audio/mpeg','audio/mp4','audio/x-m4a','audio/wav','audio/ogg','audio/flac'],handout:['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.presentationml.presentation']}
      if(!type||!allowed[b.kind].includes(type.mime))fail(400,'文件实际格式不支持，请使用图片、MP4/WebM、音频或 PDF/Word/PPTX 讲义')
      const assetId=id();const filename=Buffer.from(f.originalname,'latin1').toString('utf8').slice(0,200)
      await db.query(`INSERT INTO media_assets(id,exam_id,content_id,owner_id,kind,source,filename,mime,size_bytes,disk_name) VALUES($1,$2,$3,$4,$5,'upload',$6,$7,$8,$9)`,[assetId,b.examId,b.contentId,res.locals.user.id,b.kind,filename,type!.mime,f.size,f.filename])
      await audit(res.locals.user.id,'media.upload',assetId,{contentId:b.contentId,kind:b.kind,size:f.size})
      res.json({id:assetId,kind:b.kind,filename})
    }catch(e){await unlink(f.path).catch(()=>{});next(e)}
  })
})
mediaAdmin.post('/external',async(req,res)=>{
  const b=assetInput.extend({url:z.string().max(2000),filename:z.string().trim().min(1).max(200)}).parse(req.body)
  const url=externalUrl(b.url);await checkOwner(b.examId,b.contentId);const assetId=id()
  await db.query(`INSERT INTO media_assets(id,exam_id,content_id,owner_id,kind,source,filename,mime,external_url) VALUES($1,$2,$3,$4,$5,'external',$6,'application/octet-stream',$7)`,[assetId,b.examId,b.contentId,res.locals.user.id,b.kind,b.filename,url])
  await audit(res.locals.user.id,'media.external',assetId,{contentId:b.contentId,kind:b.kind})
  res.json({id:assetId,kind:b.kind,filename:b.filename})
})
async function ticket(asset:any,sessionHash:string) {
  const token=randomBytes(32).toString('hex')
  await db.query('DELETE FROM media_tickets WHERE expires_at<now()')
  await db.query(`INSERT INTO media_tickets(token_hash,asset_id,content_id,session_hash,expires_at) VALUES($1,$2,$3,$4,now()+interval '2 hours')`,[hash(token),asset.id,asset.content_id,sessionHash])
  return {url:`/api/media/t/${token}`}
}
mediaAdmin.post('/:id/ticket',async(req,res)=>{
  const asset=(await db.query('SELECT * FROM media_assets WHERE id=$1',[req.params.id])).rows[0];if(!asset)fail(404,'资源不存在')
  res.json(await ticket(asset,hash(req.headers.authorization?.replace(/^Bearer /,'')||'')))
})
export function availability(row:any,now=Date.now()) {
  if(now<new Date(row.payload.opensAt).getTime())return 'upcoming'
  if(now>=new Date(row.payload.closesAt).getTime())return 'expired'
  return 'open'
}
function summary(row:any) {return {id:row.id,examId:row.exam_id,title:row.title,intro:row.payload.intro||'',opensAt:row.payload.opensAt,closesAt:row.payload.closesAt,state:availability(row),isTestData:row.is_test_data,updatedAt:row.updated_at}}
async function assetAccess(asset:any,userId?:string) {
  const row=await publishedContent(asset.content_id)
  if(!['knowledge','cheatsheet'].includes(row.kind)||row.exam_id!==asset.exam_id||!row.payload.document||!inspectDocument(row.payload.document).assets.includes(asset.id))fail(404,'资源不属于当前已发布正文')
  const p=userId?(await rights(userId,row.exam_id)).permissions:{}
  if(row.kind==='cheatsheet') {
    if(availability(row)!=='open')fail(403,'考前小抄不在开放时间内')
    if(!p['cheatsheet.read'])fail(403,'当前考试无考前小抄阅读权限')
    if(asset.kind==='handout'&&!p['cheatsheet.handout.download'])fail(403,'当前考试无讲义下载权限')
  } else if(asset.kind!=='image'&&!p[`knowledge.${asset.kind}.${asset.kind==='handout'?'download':'play'}`])fail(403,'当前考试无此资源权限，请开通对应会员')
  return row
}
export const studyPublic=Router()
studyPublic.get('/cheatsheets/:examId',async(req,res)=>res.json((await db.query(`SELECT * FROM content WHERE kind='cheatsheet' AND exam_id=$1 AND status='published' ORDER BY payload->>'opensAt' DESC,id`,[req.params.examId])).rows.map(summary)))
studyPublic.get('/knowledge-content/:id',async(req,res)=>{
  const row=await publishedContent(req.params.id,'knowledge')
  res.json({id:row.id,title:row.title,isKnowledgeCourse:row.payload.isKnowledgeCourse===true,blocks:await blocks(row)})
})
async function blocks(row:any,userId?:string,sessionHash?:string) {
  if(!row.payload.document)return [{kind:'text',html:renderText({type:'paragraph',content:[{type:'text',text:row.payload.content||''}]})}]
  const result:any[]=[]
  for(const node of row.payload.document.content||[]) {
    if(node.type!=='resource'){result.push({kind:'text',html:renderText(node)});continue}
    const asset=(await db.query('SELECT * FROM media_assets WHERE id=$1',[node.attrs.assetId])).rows[0];if(!asset)continue
    const item:any={kind:asset.kind,assetId:asset.id,title:node.attrs.title||asset.filename,locked:true}
    try{await assetAccess(asset,userId);item.locked=false}catch(e:any){if(![401,403].includes(e.status))throw e}
    if(asset.kind==='image'&&!item.locked)item.url=row.kind==='knowledge'?`/api/media/image/${asset.id}`:sessionHash?(await ticket(asset,sessionHash)).url:undefined
    if(node.attrs.posterAssetId&&row.kind==='knowledge')item.poster=`/api/media/image/${node.attrs.posterAssetId}`
    result.push(item)
  }
  return result
}
studyPublic.get('/media/image/:id',async(req,res)=>{
  const asset=(await db.query('SELECT * FROM media_assets WHERE id=$1',[req.params.id])).rows[0]
  if(!asset||asset.kind!=='image')fail(404,'图片不存在')
  await assetAccess(asset);serve(asset,res)
})
function serve(asset:any,res:any) {
  res.setHeader('Cache-Control','private, no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff')
  if(asset.source==='external')return res.redirect(externalUrl(asset.external_url))
  if(!/^[a-f0-9-]{36}$/.test(asset.disk_name))fail(404,'资源不存在')
  res.type(asset.mime)
  if(asset.kind==='handout')res.attachment(asset.filename)
  res.sendFile(asset.disk_name,{root:mediaDirectory})
}
studyPublic.get('/media/t/:token',async(req,res)=>{
  const t=(await db.query(`SELECT t.*,s.user_id,s.audience,u.role FROM media_tickets t JOIN sessions s ON s.token_hash=t.session_hash JOIN users u ON u.id=s.user_id WHERE t.token_hash=$1 AND t.expires_at>now() AND s.expires_at>now() AND u.enabled=true AND s.audience=u.account_kind`,[hash(req.params.token)])).rows[0]
  if(!t)fail(401,'资源地址已过期，请重新打开内容')
  const asset=(await db.query('SELECT * FROM media_assets WHERE id=$1',[t.asset_id])).rows[0];if(!asset)fail(404,'资源不存在')
  if(!(t.audience==='admin'&&t.role==='superadmin'))await assetAccess(asset,t.user_id)
  serve(asset,res)
})
export const studyStudent=Router()
studyStudent.get('/knowledge-content/:id/member',async(req,res)=>{
  const row=await publishedContent(req.params.id,'knowledge')
  res.json({id:row.id,title:row.title,isKnowledgeCourse:row.payload.isKnowledgeCourse===true,blocks:await blocks(row,res.locals.user.id)})
})
studyStudent.post('/media/:id/ticket',async(req,res)=>{
  const asset=(await db.query('SELECT * FROM media_assets WHERE id=$1',[req.params.id])).rows[0];if(!asset)fail(404,'资源不存在')
  await assetAccess(asset,res.locals.user.id)
  res.json(await ticket(asset,hash(req.headers.authorization?.replace(/^Bearer /,'')||'')))
})
studyStudent.get('/cheatsheet/:id',async(req,res)=>{
  const row=await publishedContent(req.params.id,'cheatsheet');const meta=summary(row)
  const allowed=(await rights(res.locals.user.id,row.exam_id)).permissions['cheatsheet.read']
  res.setHeader('Cache-Control','no-store')
  res.json({...meta,locked:!allowed||meta.state!=='open',blocks:allowed&&meta.state==='open'?await blocks(row,res.locals.user.id,hash(req.headers.authorization?.replace(/^Bearer /,'')||'')):[]})
})
studyStudent.get('/content-notices/:examId',async(req,res)=>{
  const rows=(await db.query(`SELECT c.* FROM content c LEFT JOIN content_notices_seen s ON s.content_id=c.id AND s.user_id=$1 WHERE c.kind='cheatsheet' AND c.exam_id=$2 AND c.status='published' AND s.content_id IS NULL ORDER BY c.created_at`,[res.locals.user.id,req.params.examId])).rows
  res.json(rows.filter(r=>availability(r)==='open').map(summary))
})
studyStudent.post('/content-notices/:id/seen',async(req,res)=>{
  const row=await publishedContent(req.params.id,'cheatsheet');if(availability(row)!=='open')fail(400,'小抄尚未开放或已结束')
  await db.query('INSERT INTO content_notices_seen(user_id,content_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[res.locals.user.id,row.id]);res.json({ok:true})
})
