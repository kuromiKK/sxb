import { db, transaction } from './db.ts'
import { id, audit, fail } from './security.ts'
import { z } from 'zod'
import { messageDocument } from '../../shared/message-document.ts'
import { lockResourceReferences,validateEditorImages } from './editor-images.ts'

const base = z.object({ title:z.string().trim().min(1).max(200), content:z.string().max(10000).default(''), document:z.record(z.string(),z.any()).default({}), channels:z.array(z.enum(['h5','app','miniapp'])).min(1), l1Ids:z.array(z.string()).default([]), l2Ids:z.array(z.string()).default([]), permissionLevels:z.array(z.enum(['free','vip','svip'])).min(1), schedule:z.record(z.string(),z.any()).default({}), templateId:z.string().nullable().optional() })
export const messageAdmin = {
  async templates(){ return (await db.query('SELECT * FROM message_templates ORDER BY updated_at DESC')).rows },
  async saveTemplate(actor:string,input:any){
    const b=z.object({id:z.string().min(1),name:z.string().trim().min(1).max(120),status:z.enum(['draft','published','offline']),title:z.string().trim().min(1).max(200),content:z.string().max(10000),document:z.record(z.string(),z.any()),variables:z.array(z.string()).default([])}).parse(input)
    const checked=messageDocument(b.document)
const row=await transaction(async c=>{await lockResourceReferences(c);await validateEditorImages(checked.document,c);return (await c.query(`INSERT INTO message_templates(id,name,status,title,content,document,variables,actor_id,is_test_data) VALUES($1,$2,$3,$4,$5,$6,$7,$8,true) ON CONFLICT(id) DO UPDATE SET name=$2,status=$3,title=$4,content=$5,document=$6,variables=$7,actor_id=$8,updated_at=now() RETURNING *`,[b.id,b.name,b.status,b.title,checked.text,JSON.stringify(checked.document),JSON.stringify(b.variables),actor])).rows[0]})
    await audit(actor,'message.template.save',b.id,{name:b.name}); return row
  },
  async list(input:any){
    const q=typeof input?.search==='string'?input.search.trim().slice(0,100):''; const type=input?.sendType; const params:any[]=[]; const where:string[]=[]
    if(q){params.push('%'+q+'%');where.push(`title ILIKE $${params.length}`)}
    if(type&&['manual','scheduled','preset','draft'].includes(type)){params.push(type);where.push(`send_type=$${params.length}`)}
    return (await db.query(`SELECT m.*,t.name AS template_name,(SELECT count(*)::int FROM message_deliveries d WHERE d.message_id=m.id) AS sent_count,(SELECT count(*)::int FROM message_deliveries d WHERE d.message_id=m.id AND d.read_at IS NOT NULL) AS read_count FROM messages m LEFT JOIN message_templates t ON t.id=m.template_id ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY m.created_at DESC LIMIT 200`,params)).rows
  },
  async saveMessage(actor:string,input:any){
    const b=base.extend({id:z.string().min(1),sendType:z.enum(['manual','scheduled','preset','draft']),status:z.enum(['draft','scheduled','active','sent','cancelled']).default('draft'),userIds:z.array(z.string()).default([])}).parse(input)
    const checked=messageDocument(b.document)
    if(!b.permissionLevels.length)fail(400,'请选择至少一项会员权限')
    if(!b.channels.includes('h5')) { /* future channels are stored but not sent */ }
    const row=await transaction(async c=>{await lockResourceReferences(c);await validateEditorImages(checked.document,c);return (await c.query(`INSERT INTO messages(id,template_id,title,document,content,send_type,channels,category_ids,exam_ids,permission_levels,user_ids,schedule,status,actor_id,is_test_data) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,true) ON CONFLICT(id) DO UPDATE SET template_id=$2,title=$3,document=$4,content=$5,send_type=$6,channels=$7,category_ids=$8,exam_ids=$9,permission_levels=$10,user_ids=$11,schedule=$12,status=$13,updated_at=now() RETURNING *`,[b.id,b.templateId||null,b.title,JSON.stringify(checked.document),checked.text,b.sendType,JSON.stringify(b.channels),JSON.stringify(b.l1Ids),JSON.stringify(b.l2Ids),JSON.stringify(b.permissionLevels),JSON.stringify(b.userIds),JSON.stringify(b.schedule),b.status,actor])).rows[0]})
    await audit(actor,'message.save',b.id,{sendType:b.sendType,status:b.status}); return row
  },
  async remove(actor:string,messageId:string){await db.query('DELETE FROM messages WHERE id=$1',[messageId]);await audit(actor,'message.delete',messageId);return {ok:true}},
  async send(actor:string,messageId:string,force=false){
    const row=(await db.query('SELECT * FROM messages WHERE id=$1',[messageId])).rows[0];if(!row)fail(404,'消息不存在')
    if(row.send_type==='preset'||row.status==='active')fail(400,'系统预置或循环计划不能手动发送')
    if(row.status==='scheduled'&&!force) return {needsConfirm:true,scheduledAt:row.schedule?.scheduledAt||row.schedule?.at||null}
    const users= row.user_ids?.length ? (await db.query(`SELECT id FROM users WHERE account_kind='student' AND id=ANY($1::text[])`,[row.user_ids])).rows : (await db.query(`SELECT DISTINCT u.id FROM users u LEFT JOIN memberships m ON m.user_id=u.id WHERE u.account_kind='student' AND u.enabled AND ($1::text[]='{}' OR m.exam_id=ANY($1::text[])) AND ($2::text[]='{}' OR coalesce(m.level,'free')=ANY($2::text[]))`,[row.exam_ids||[],row.permission_levels||[]])).rows
    await transaction(async c=>{for(const u of users)if(row.channels.includes('h5'))await c.query(`INSERT INTO message_deliveries(id,message_id,user_id,channel,status,delivered_at) VALUES($1,$2,$3,'h5','sent',now()) ON CONFLICT DO NOTHING`,[id(),row.id,u.id]);await c.query(`UPDATE messages SET status='sent',sent_at=now(),updated_at=now() WHERE id=$1`,[row.id])})
    await audit(actor,'message.send',row.id,{count:users.length});return {ok:true,count:users.length}
  }
}
