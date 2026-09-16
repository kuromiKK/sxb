import {Router} from 'express'
import {z} from 'zod'
import {db} from './db.ts'
import {decrypt,encrypt,hash,fail} from './security.ts'
import {inspectDocument} from './rich-document.ts'
import {renderContentBlocks,serve} from './study-content.ts'

const claims=z.object({purpose:z.literal('content-preview'),root:z.string().min(1),exam:z.string().min(1),session:z.string().length(64),expires:z.number().int()})
export const previewAdmin=Router(),previewPublic=Router()
const ttl=15*60*1000
async function rootNode(id:string){
 const row=(await db.query("SELECT * FROM content WHERE id=$1 AND kind IN ('section','knowledge') AND NOT(payload ? 'deletedAt')",[id])).rows[0]
 if(!row)fail(404,'请先保存节或知识点，再进行预览')
 return row
}
previewAdmin.post('/:id',async(req,res)=>{
 const row=await rootNode(req.params.id),expires=Date.now()+ttl
 const token=Buffer.from(encrypt(JSON.stringify({purpose:'content-preview',root:row.id,exam:row.exam_id,session:hash(req.headers.authorization!.replace(/^Bearer /,'')),expires}))).toString('base64url')
 res.setHeader('Cache-Control','no-store')
 res.json({token,expiresAt:new Date(expires).toISOString(),title:row.title,kind:row.kind,userOrigin:process.env.USER_ORIGIN||'http://127.0.0.1:5174'})
})
async function scope(token:string){
 let c:z.infer<typeof claims>
 try{if(token.length>2000||!/^[\w-]+$/.test(token))throw new Error();c=claims.parse(JSON.parse(decrypt(Buffer.from(token,'base64url').toString())))}catch{fail(401,'预览链接无效，请从后台重新打开')}
 if(c!.expires<=Date.now())fail(401,'预览已过期，请在后台刷新预览')
 const session=(await db.query("SELECT 1 FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND s.audience='admin' AND u.account_kind='admin' AND u.role='superadmin' AND u.enabled",[c!.session])).rows[0]
 if(!session)fail(401,'预览授权已失效，请从后台重新打开')
 const root=await rootNode(c!.root)
 if(root.exam_id!==c!.exam)fail(401,'内容归属已变更，请重新生成预览')
 const courses=(await db.query("SELECT * FROM content WHERE parent_id=$1 AND exam_id=$2 AND kind='course' AND NOT(payload ? 'deletedAt') ORDER BY created_at,id",[root.id,root.exam_id])).rows
 return {root,courses,expires:c!.expires}
}
function references(row:any){
 const p=row.payload
 return new Set<string>([...(p.document?inspectDocument(p.document).assets:[]),p.mediaAssetId,p.posterAssetId,...(p.handouts||[]).map((h:any)=>h.assetId)].filter(Boolean))
}
async function assetFor(row:any,id:string){
 if(!references(row).has(id))fail(404,'资源不在此预览内容范围内')
 const asset=(await db.query('SELECT * FROM media_assets WHERE id=$1 AND content_id=$2 AND exam_id=$3',[id,row.id,row.exam_id])).rows[0]
 if(!asset)fail(404,'预览资源不存在')
 return asset
}
previewPublic.use((_req,res,next)=>{res.setHeader('Cache-Control','private, no-store');res.setHeader('Referrer-Policy','no-referrer');next()})
previewPublic.get('/:token',async(req,res)=>{
 const {root,courses,expires}=await scope(req.params.token)
 const url=(id:string)=>`/api/content-preview/${req.params.token}/media/${encodeURIComponent(id)}`
 async function serialize(row:any){
  const p=row.payload
  const blocks=await renderContentBlocks(row,async node=>{
   const asset=await assetFor(row,node.attrs.assetId)
   if(node.attrs.posterAssetId)await assetFor(row,node.attrs.posterAssetId)
   return {kind:asset.kind,assetId:asset.id,title:node.attrs.title||asset.filename,locked:false,url:url(asset.id),poster:node.attrs.posterAssetId?url(node.attrs.posterAssetId):undefined}
  })
  for(const id of [p.mediaAssetId,p.posterAssetId].filter(Boolean))await assetFor(row,id)
  const handouts=[]
  for(const h of p.handouts||[]){const asset=await assetFor(row,h.assetId);if(asset.kind==='handout')handouts.push({kind:'handout',assetId:asset.id,title:h.title||asset.filename,url:url(asset.id),locked:false})}
  return {id:row.id,title:row.title,kind:row.kind,status:row.status,updatedAt:row.updated_at,stars:Number(p.stars)||0,type:p.type||'article',intro:p.intro||'',blocks,handouts,mediaUrl:p.mediaAssetId?url(p.mediaAssetId):'',posterUrl:p.posterAssetId?url(p.posterAssetId):'',totalMinutes:p.totalMinutes||0}
 }
 const path=[];let parent=root.parent_id;const seen=new Set<string>([root.id])
 while(parent&&!seen.has(parent)&&path.length<6){seen.add(parent);const row=(await db.query('SELECT id,parent_id,title,kind,payload FROM content WHERE id=$1 AND exam_id=$2',[parent,root.exam_id])).rows[0];if(!row)break;path.unshift({id:row.id,title:row.title,kind:row.kind,no:row.payload.no||0});parent=row.parent_id}
 const exam=(await db.query('SELECT name FROM exams WHERE id=$1',[root.exam_id])).rows[0]
 const questionCount=(await db.query(`SELECT count(DISTINCT k.question_id)::int AS n FROM question_knowledge_points k JOIN content q ON q.id=k.question_id JOIN content n ON n.id=k.knowledge_id WHERE q.exam_id=$2 AND n.exam_id=$2 AND (n.id=$1 OR n.parent_id=$1) AND NOT(q.payload ? 'deletedAt')`,[root.id,root.exam_id])).rows[0].n
 res.json({node:await serialize(root),courses:await Promise.all(courses.map(serialize)),path,examName:exam?.name||'',questionCount,expiresAt:new Date(expires).toISOString()})
})
previewPublic.get('/:token/media/:id',async(req,res)=>{
 const {root,courses}=await scope(req.params.token)
 const row=[root,...courses].find(r=>references(r).has(req.params.id))
 if(!row)fail(404,'资源不在此预览内容范围内')
 serve(await assetFor(row,req.params.id),res,true)
})
