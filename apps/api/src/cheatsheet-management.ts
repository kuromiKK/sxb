import { Router } from 'express'
import { z } from 'zod'
import { db,transaction } from './db.ts'
import { fail,id } from './security.ts'
import { rights } from './membership.ts'
export async function migrateCheatsheetManagement(){await db.query(`CREATE TABLE IF NOT EXISTS cheatsheet_pushes(id text PRIMARY KEY,content_id text NOT NULL,actor_id text NOT NULL REFERENCES users(id),message_id text NOT NULL,recipient_count integer NOT NULL CHECK(recipient_count>0),pushed_at timestamptz NOT NULL DEFAULT now())`);await db.query('CREATE INDEX IF NOT EXISTS cheatsheet_push_content ON cheatsheet_pushes(content_id)')}
export const cheatsheetManagement=Router()
cheatsheetManagement.get('/',async(req,res)=>{
 const q=z.object({search:z.string().max(200).default(''),examId:z.string().default(''),status:z.enum(['','draft','review','published','offline']).default(''),pushed:z.enum(['','yes','no']).default(''),from:z.string().datetime({offset:true}).optional(),to:z.string().datetime({offset:true}).optional(),page:z.coerce.number().int().positive().default(1)}).parse(req.query)
 if(q.from&&q.to&&Date.parse(q.to)<Date.parse(q.from))fail(400,'结束时间不能早于开始时间')
 const params=[`%${q.search.trim()}%`,q.examId,q.status,q.pushed,q.from||null,q.to||null]
 const where=`FROM content c LEFT JOIN exams e ON e.id=c.exam_id WHERE c.kind='cheatsheet' AND (c.title ILIKE $1 OR c.id ILIKE $1) AND ($2='' OR c.exam_id=$2) AND ($3='' OR c.status=$3)
 AND ($4='' OR EXISTS(SELECT 1 FROM cheatsheet_pushes p WHERE p.content_id=c.id)=($4='yes'))
 AND ($5::timestamptz IS NULL OR (c.payload->>'closesAt')::timestamptz >= $5::timestamptz) AND ($6::timestamptz IS NULL OR (c.payload->>'opensAt')::timestamptz <= $6::timestamptz)`
 const total=(await db.query('SELECT count(*)::int n '+where,params)).rows[0].n
 const items=(await db.query(`SELECT c.*,e.name AS exam_name,(SELECT max(pushed_at) FROM cheatsheet_pushes p WHERE p.content_id=c.id) AS pushed_at,(SELECT recipient_count FROM cheatsheet_pushes p WHERE p.content_id=c.id ORDER BY pushed_at DESC LIMIT 1) AS recipient_count ${where} ORDER BY c.updated_at DESC,c.id LIMIT 20 OFFSET $7`,[...params,(q.page-1)*20])).rows
 res.json({items,total})
})
cheatsheetManagement.patch('/:id/status',async(req,res)=>{
 const b=z.object({version:z.number().int().positive(),enabled:z.boolean()}).strict().parse(req.body)
 await transaction(async c=>{
  await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[req.params.id])
  const row=(await c.query("SELECT * FROM content WHERE id=$1 AND kind='cheatsheet'",[req.params.id])).rows[0];if(!row)fail(404,'小抄不存在');if(row.version!==b.version)fail(409,'内容已修改，请刷新后再试')
  const payload={...row.payload};let status='offline'
  if(b.enabled){status=row.status==='offline'?(['draft','review','published'].includes(payload.statusBeforeDisable)?payload.statusBeforeDisable:'draft'):row.status;delete payload.statusBeforeDisable}else if(row.status!=='offline')payload.statusBeforeDisable=row.status
  await c.query('UPDATE content SET status=$2,payload=$3,version=version+1,updated_at=now() WHERE id=$1',[row.id,status,JSON.stringify(payload)])
  await c.query('INSERT INTO audit_logs(id,actor_id,action,target_id,details) VALUES($1,$2,$3,$4,$5)',[id(),res.locals.user.id,'cheatsheet.status',row.id,JSON.stringify({before:row.status,after:status})])
 });res.json({ok:true})
})
cheatsheetManagement.post('/:id/push',async(req,res)=>{
 const b=z.object({version:z.number().int().positive()}).strict().parse(req.body)
 const result=await transaction(async c=>{
  await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[req.params.id])
  const row=(await c.query("SELECT * FROM content WHERE id=$1 AND kind='cheatsheet'",[req.params.id])).rows[0]
  if(!row)fail(404,'小抄不存在');if(row.version!==b.version)fail(409,'内容已修改或已推送，请刷新后再试')
  if(row.status!=='published')fail(400,'只有已发布的小抄可以推送，停用内容不能推送')
  if(!Number.isFinite(Date.parse(row.payload.closesAt))||Date.parse(row.payload.closesAt)<=Date.now())fail(400,'小抄已关闭，请先调整关闭时间')
  const users=(await c.query("SELECT id FROM users WHERE account_kind='student' AND enabled=true")).rows,recipients=[]
  for(const user of users)if((await rights(user.id,row.exam_id,c)).permissions['cheatsheet.read'])recipients.push(user.id)
  if(!recipients.length)fail(400,'该考试当前没有具备小抄阅读权益的用户，未推送，开放时间未修改')
  const pushedAt=new Date().toISOString(),messageId=id(),title='考前小抄已开放：'+row.title.slice(0,180)
  if(Date.parse(row.payload.closesAt)<=Date.parse(pushedAt))fail(400,'小抄已关闭，请先调整关闭时间')
  const content=row.title+'已开放，点击查看资料。',document={type:'doc',content:[{type:'paragraph',content:[{type:'text',text:content}]}]},schedule={contentId:row.id,url:'/pages/cheatsheet-detail/index?id='+encodeURIComponent(row.id),requiredPermission:'cheatsheet.read'}
  await c.query(`INSERT INTO messages(id,title,document,content,send_type,channels,category_ids,exam_ids,permission_levels,user_ids,schedule,status,actor_id,is_test_data,sent_at) VALUES($1,$2,$3,$4,'manual','["h5"]','[]',$5,'["free","vip","svip"]',$6,$7,'sent',$8,$9,$10)`,[messageId,title,JSON.stringify(document),content,JSON.stringify([row.exam_id]),JSON.stringify(recipients),JSON.stringify(schedule),res.locals.user.id,row.is_test_data,pushedAt])
  for(const userId of recipients)await c.query("INSERT INTO message_deliveries(id,message_id,user_id,channel,status,delivered_at) VALUES($1,$2,$3,'h5','sent',$4)",[id(),messageId,userId,pushedAt])
  await c.query('UPDATE content SET payload=$2,version=version+1,updated_at=now() WHERE id=$1',[row.id,JSON.stringify({...row.payload,opensAt:pushedAt})])
  await c.query('INSERT INTO cheatsheet_pushes(id,content_id,actor_id,message_id,recipient_count,pushed_at) VALUES($1,$2,$3,$4,$5,$6)',[id(),row.id,res.locals.user.id,messageId,recipients.length,pushedAt])
  await c.query('INSERT INTO audit_logs(id,actor_id,action,target_id,details) VALUES($1,$2,$3,$4,$5)',[id(),res.locals.user.id,'cheatsheet.push',row.id,JSON.stringify({messageId,count:recipients.length,previousOpensAt:row.payload.opensAt,opensAt:pushedAt})])
  return {ok:true,count:recipients.length,pushedAt}
 });res.json(result)
})
