import { db,transaction,type Queryable } from './db.ts'
import { fail } from './security.ts'
import { createHash } from 'node:crypto'
export async function registeredCoverUrl(value:string,c:Queryable=db):Promise<string>{
 if(!value.startsWith('data:'))return value
 const hash=createHash('sha256').update(value).digest('hex')
 const row=(await c.query('SELECT id FROM media_assets WHERE legacy_image_hash=$1',[hash])).rows[0]
 if(!row)fail(400,'封面图片需先上传并登记资源，请重新选择图片')
 return '/api/message-images/'+row.id
}
export async function migrateEditorImages(){
 await transaction(async c=>{
  await c.query("SELECT pg_advisory_xact_lock(hashtext('editor-images-schema'))")
  await c.query('ALTER TABLE media_assets ALTER COLUMN exam_id DROP NOT NULL')
 })
}
export async function lockResourceReferences(c:Queryable){await c.query("SELECT pg_advisory_xact_lock(hashtext('resource-references'))")}
export async function validateEditorImages(value:any,c:Queryable=db){
 const ids=new Set<string>();const walk=(v:any)=>{if(typeof v==='string'){for(const m of v.matchAll(/\/api\/message-images\/([\w-]+)/g))ids.add(m[1])}else if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')Object.values(v).forEach(walk)};walk(value)
 for(const id of ids)if(!(await c.query("SELECT id FROM media_assets WHERE id=$1 AND kind='image' AND exam_id IS NULL",[id])).rows.length)fail(400,'正文图片已被清理，请重新上传')
}
