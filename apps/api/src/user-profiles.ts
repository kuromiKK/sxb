import {Router} from 'express'
import {z} from 'zod'
import {db} from './db.ts'
import {fail} from './security.ts'
import {rights,manualEntitlement,manualEffective} from './membership.ts'
import {learningRecords,attempts,wrongStateSql} from './learning-records.ts'
import {orderSelect} from './order-management.ts'

// Every exam-dependent endpoint is mounted beneath a validated user + exam scope.
const activity=`SELECT user_id,exam_id FROM learning_visits UNION SELECT user_id,exam_id FROM answers
 UNION SELECT user_id,exam_id FROM question_submissions UNION SELECT user_id,exam_id FROM user_records
 UNION SELECT user_id,exam_id FROM orders WHERE deleted_at IS NULL UNION SELECT user_id,exam_id FROM manual_entitlements
 UNION SELECT user_id,exam_id FROM memberships UNION SELECT user_id,exam_id FROM referral_uses WHERE exam_id IS NOT NULL`
const fields='u.id,u.nickname,u.phone,u.enabled,u.is_developer,u.invite_code,u.inviter_id,u.created_at,u.last_login_at'
const pageInput=z.object({page:z.coerce.number().int().min(1).max(100000).default(1),search:z.string().trim().max(150).default('')})
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s=>{const d=new Date(s+'T00:00:00Z');return !isNaN(+d)&&d.toISOString().slice(0,10)===s})
export const userProfiles=Router()
userProfiles.get('/',async(req,res)=>{
 const q=pageInput.extend({developer:z.enum(['','true','false']).default('')}).parse(req.query)
 const args=[q.search,q.developer===''?null:q.developer==='true']
 const where="u.account_kind='student' AND ($1='' OR strpos(u.nickname,$1)>0 OR strpos(u.phone,$1)>0 OR strpos(u.id,$1)>0) AND ($2::boolean IS NULL OR u.is_developer=$2)"
 const total=(await db.query('SELECT count(*)::int AS n FROM users u WHERE '+where,args)).rows[0].n
 const items=(await db.query(`SELECT ${fields},i.nickname AS inviter FROM users u LEFT JOIN users i ON i.id=u.inviter_id WHERE ${where} ORDER BY u.created_at DESC,u.id LIMIT 20 OFFSET $3`,[...args,(q.page-1)*20])).rows
 res.json({items,total})
})
userProfiles.use('/:userId',async(req,res,next)=>{
 const user=(await db.query(`SELECT ${fields},i.nickname AS inviter_name,i.phone AS inviter_phone,i.invite_code AS inviter_code FROM users u LEFT JOIN users i ON i.id=u.inviter_id WHERE u.id=$1 AND u.account_kind='student'`,[req.params.userId])).rows[0]
 if(!user)fail(404,'学员账号不存在')
 res.locals.profileUser=user;next()
})
userProfiles.get('/:userId',async(_req,res)=>{
 const user=res.locals.profileUser
 const exams=(await db.query(`WITH activity AS (${activity}) SELECT e.id,e.name,e.enabled,EXISTS(SELECT 1 FROM activity a WHERE a.user_id=$1 AND a.exam_id=e.id) AS has_records FROM exams e ORDER BY has_records DESC,e.name,e.id`,[user.id])).rows
 res.json({user,exams})
})
userProfiles.get('/:userId/account-logs',async(req,res)=>{
 const q=pageInput.parse(req.query),uid=res.locals.profileUser.id
 const where="a.target_id=$1 AND a.action IN ('user.developer','user.disable','user.enable','user.status','user.inviter')"
 const total=(await db.query('SELECT count(*)::int AS n FROM audit_logs a WHERE '+where,[uid])).rows[0].n
 const items=(await db.query(`SELECT a.id,a.action,a.created_at,a.details->>'reason' AS reason,a.details->'enabled' AS enabled,u.nickname AS actor_name FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id WHERE ${where} ORDER BY a.created_at DESC,a.id DESC LIMIT 20 OFFSET $2`,[uid,(q.page-1)*20])).rows
 res.json({items,total})
})
userProfiles.use('/:userId/exams/:examId',async(req,res,next)=>{
 const exam=(await db.query('SELECT id,name,enabled FROM exams WHERE id=$1',[req.params.examId])).rows[0]
 if(!exam)fail(404,'请选择有效的考试项目')
 res.locals.profileScope={userId:res.locals.profileUser.id,examId:exam.id};res.locals.profileExam=exam;next()
})
const scoped=Router({mergeParams:true})
scoped.use(learningRecords)
scoped.get('/overview',async(_req,res)=>{
 const {userId,examId}=res.locals.profileScope,args=[userId,examId]
 const summary=(await db.query(`WITH raw AS (${attempts}), days AS (
 SELECT (started_at AT TIME ZONE 'Asia/Shanghai')::date AS day FROM learning_visits WHERE user_id=$1 AND exam_id=$2
 UNION SELECT (created_at AT TIME ZONE 'Asia/Shanghai')::date FROM raw WHERE user_id=$1 AND exam_id=$2)
 SELECT (SELECT count(*)::int FROM days) AS study_days,
 (SELECT count(*)::int FROM learning_visits WHERE user_id=$1 AND exam_id=$2) AS visits,
 (SELECT count(*)::int FROM raw WHERE user_id=$1 AND exam_id=$2) AS answers,
 (SELECT count(*)::int FROM (${wrongStateSql}) w WHERE user_id=$1 AND exam_id=$2 AND in_wrong_book) AS wrong,
 (SELECT count(*)::int FROM user_records WHERE user_id=$1 AND exam_id=$2 AND kind='favorite') AS favorites,
 (SELECT count(*)::int FROM user_records WHERE user_id=$1 AND exam_id=$2 AND kind='note') AS notes,
 greatest((SELECT max(last_activity_at) FROM learning_visits WHERE user_id=$1 AND exam_id=$2),(SELECT max(created_at) FROM raw WHERE user_id=$1 AND exam_id=$2)) AS last_studied_at`,args)).rows[0]
 const current=await rights(userId,examId)
 // Lifetime eligibility is intentionally global, while purchases and grants below remain exam scoped.
 const prior=(await db.query("SELECT product,paid_at FROM orders WHERE user_id=$1 AND paid_at IS NOT NULL AND product IN ('vip','svip','trial','upgrade') ORDER BY paid_at LIMIT 1",[userId])).rows[0]
 const trial={lifetimeEligible:!prior,eligible:!prior&&current.level==='free',reason:prior?(prior.product==='trial'?'该账号已购买过体验权益，终身体验资格已使用':'该账号已购买过正式权益，不再具备体验资格'):current.level!=='free'?'当前考试已有有效会员权益':'账号符合体验资格，购买时仍需检查商品及考期剩余时长'}
 const orders=(await db.query("SELECT count(*)::int AS total,count(*) FILTER(WHERE paid_at IS NOT NULL)::int AS paid,coalesce(sum(amount_cents) FILTER(WHERE paid_at IS NOT NULL),0)::bigint AS paid_cents,coalesce(sum(amount_cents) FILTER(WHERE status='refunded'),0)::bigint AS refunded_cents FROM orders WHERE user_id=$1 AND exam_id=$2 AND deleted_at IS NULL",args)).rows[0]
 res.json({summary,current,trial,orders,exam:res.locals.profileExam})
})
scoped.get('/visits',async(req,res)=>{
 const q=pageInput.extend({from:date.optional(),to:date.optional(),kind:z.enum(['','subject','chapter','section','knowledge','course']).default('')}).parse(req.query)
 if(Boolean(q.from)!==Boolean(q.to)||(q.from&&q.to&&q.from>q.to))fail(400,'请选择完整且有效的时间范围')
 const {userId,examId}=res.locals.profileScope,args=[userId,examId,q.search,q.kind,q.from?q.from+'T00:00:00+08:00':null,q.to?new Date(Date.parse(q.to+'T00:00:00+08:00')+86400000).toISOString():null]
 const where="user_id=$1 AND exam_id=$2 AND ($3='' OR strpos(title,$3)>0 OR strpos(id,$3)>0 OR strpos(content_id,$3)>0) AND ($4='' OR kind=$4) AND ($5::timestamptz IS NULL OR started_at>=$5) AND ($6::timestamptz IS NULL OR started_at<$6)"
 const total=(await db.query('SELECT count(*)::int AS n FROM learning_visits WHERE '+where,args)).rows[0].n
 const items=(await db.query('SELECT * FROM learning_visits WHERE '+where+' ORDER BY started_at DESC,id DESC LIMIT 20 OFFSET $7',[...args,(q.page-1)*20])).rows
 res.json({items,total})
})
scoped.get('/mastery',async(_req,res)=>{
 const {userId,examId}=res.locals.profileScope
 const nodes=(await db.query(`WITH RECURSIVE visible AS (
 SELECT id,parent_id,title,kind,payload FROM content WHERE exam_id=$1 AND kind='subject' AND status='published' AND NOT(payload ? 'deletedAt')
 UNION ALL SELECT c.id,c.parent_id,c.title,c.kind,c.payload FROM content c JOIN visible p ON c.parent_id=p.id WHERE c.exam_id=$1 AND c.kind IN ('chapter','section','knowledge') AND c.status='published' AND NOT(c.payload ? 'deletedAt')) SELECT * FROM visible`,[examId])).rows
 const links=(await db.query("SELECT k.knowledge_id,q.id FROM question_knowledge_points k JOIN questions q ON q.id=k.question_id WHERE q.exam_id=$1 AND q.status='published' AND NOT(q.payload ? 'deletedAt')",[examId])).rows
 const latest=(await db.query(`SELECT DISTINCT ON(question_id) question_id,correct FROM answers WHERE user_id=$1 AND exam_id=$2 AND correct IS NOT NULL AND NOT coalesce((response->>'containsSelfScore')::boolean,false) ORDER BY question_id,created_at DESC,id DESC`,[userId,examId])).rows
 const raw=(await db.query(`WITH raw AS (${attempts}) SELECT DISTINCT content_id FROM raw WHERE user_id=$1 AND exam_id=$2`,[userId,examId])).rows
 const wrong=(await db.query(`SELECT question_id FROM (${wrongStateSql}) w WHERE user_id=$1 AND exam_id=$2 AND in_wrong_book`,[userId,examId])).rows
 const byId=new Map(nodes.map(n=>[n.id,n])),questionSets=new Map<string,Set<string>>()
 for(const l of links){let node=byId.get(l.knowledge_id);const seen=new Set<string>();while(node&&!seen.has(node.id)){seen.add(node.id);if(!questionSets.has(node.id))questionSets.set(node.id,new Set());questionSets.get(node.id)!.add(l.id);node=byId.get(node.parent_id)}}
 const answered=new Set(raw.map(r=>r.content_id)),graded=new Map(latest.map(r=>[r.question_id,r.correct])),wrongIds=new Set(wrong.map(r=>r.question_id))
 function build(parent:string|null):any[]{return nodes.filter(n=>n.parent_id===parent&&n.kind!=='knowledge').sort((a,b)=>(Number(a.payload.no)||0)-(Number(b.payload.no)||0)||a.title.localeCompare(b.title,'zh-CN')).map(n=>{const ids=[...(questionSets.get(n.id)||[])],done=ids.filter(i=>answered.has(i)).length,judged=ids.filter(i=>graded.has(i)).length,correct=ids.filter(i=>graded.get(i)===true).length;return {id:n.id,title:n.title,kind:n.kind,total:ids.length,answered:done,graded:judged,correct,wrong:ids.filter(i=>wrongIds.has(i)).length,coverage:ids.length?Math.round(done/ids.length*100):null,accuracy:judged?Math.round(correct/judged*100):null,children:build(n.id)}})}
 res.json({items:build(null)})
})
scoped.get('/orders',async(req,res)=>{
 const {userId,examId}=res.locals.profileScope,q=pageInput.extend({status:z.enum(['','pending_payment','paid','closed','refunding','refunded']).default('')}).parse(req.query),args=[userId,examId,q.search,q.status]
 const where="user_id=$1 AND exam_id=$2 AND deleted_at IS NULL AND ($3='' OR strpos(id,$3)>0 OR strpos(product_title,$3)>0) AND ($4='' OR status=$4)"
 const base=`WITH records AS (${orderSelect})`
 const total=(await db.query(base+' SELECT count(*)::int AS n FROM records WHERE '+where,args)).rows[0].n
 const items=(await db.query(base+' SELECT * FROM records WHERE '+where+' ORDER BY created_at DESC,id DESC LIMIT 20 OFFSET $5',[...args,(q.page-1)*20])).rows
 res.json({items,total})
})
scoped.get('/orders/:id',async(req,res)=>{
 const {userId,examId}=res.locals.profileScope
 const order=(await db.query(orderSelect+' WHERE o.id=$1 AND o.user_id=$2 AND o.exam_id=$3 AND o.deleted_at IS NULL',[req.params.id,userId,examId])).rows[0]
 if(!order)fail(404,'此考试下不存在该用户的订单')
 const payments=(await db.query('SELECT id,status,method,error,created_at FROM payments WHERE order_id=$1 ORDER BY created_at DESC,id',[order.id])).rows
 const history=(await db.query("SELECT a.id,a.action,a.created_at,a.details,u.nickname AS actor_name FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id WHERE a.target_id=$1 AND a.action LIKE 'order.%' ORDER BY a.created_at DESC,a.id",[order.id])).rows
 res.json({order,payments,history})
})
scoped.get('/fulfillment',async(req,res)=>{
 const {userId,examId}=res.locals.profileScope,q=pageInput.parse(req.query),args=[userId,examId]
 const current=await rights(userId,examId),manual=await manualEntitlement(userId,examId)
 const total=(await db.query('SELECT count(*)::int AS n FROM memberships WHERE user_id=$1 AND exam_id=$2',args)).rows[0].n
 const grants=(await db.query(`SELECT m.*,c.year,CASE WHEN m.entitlement_ends_at IS NOT NULL THEN m.starts_at ELSE c.starts_at END AS starts_at,CASE WHEN m.level='trial' THEN least(m.trial_ends_at,coalesce(m.entitlement_ends_at,c.ends_at)) ELSE coalesce(m.entitlement_ends_at,c.ends_at) END AS ends_at,o.status AS order_status,o.deleted_at,o.product_snapshot->>'title' AS title,o.fulfillment_snapshot,o.refund_reason,o.refunded_at FROM memberships m JOIN orders o ON o.id=m.order_id JOIN exam_cycles c ON c.id=m.cycle_id WHERE m.user_id=$1 AND m.exam_id=$2 ORDER BY m.starts_at DESC,m.order_id LIMIT 20 OFFSET $3`,[...args,(q.page-1)*20])).rows.map(r=>({...r,state:r.revoked?'revoked':new Date(r.ends_at).getTime()<=Date.now()?'expired':new Date(r.starts_at).getTime()>Date.now()?'pending':'active'}))
 const history=(await db.query(`SELECT a.id,a.action,a.created_at,a.details,u.nickname AS actor_name FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id WHERE (a.target_id=$1 AND a.action='entitlement.adjust' AND a.details->>'examId'=$2) OR (a.action LIKE 'order.%' AND EXISTS(SELECT 1 FROM orders o WHERE o.id=a.target_id AND o.user_id=$1 AND o.exam_id=$2)) ORDER BY a.created_at DESC,a.id DESC LIMIT 100`,args)).rows
 res.json({current,manual:manual?{...manual,active:!!manualEffective(manual)}:null,grants,total,history})
})
scoped.get('/relations',async(req,res)=>{
 const {userId,examId}=res.locals.profileScope,q=pageInput.parse(req.query)
 const uses=(await db.query('SELECT x.used_at,x.permission_level,x.permission_hours,r.code,r.channel FROM referral_uses x JOIN referral_codes r ON r.id=x.referral_id WHERE x.user_id=$1 AND x.exam_id=$2',[userId,examId])).rows
 const prefix=`WITH activity AS (${activity})`,where="u.account_kind='student' AND u.inviter_id=$1 AND EXISTS(SELECT 1 FROM activity a WHERE a.user_id=u.id AND a.exam_id=$2)"
 const total=(await db.query(prefix+' SELECT count(*)::int AS n FROM users u WHERE '+where,[userId,examId])).rows[0].n
 const invited=(await db.query(prefix+' SELECT u.id,u.nickname,u.phone,u.created_at FROM users u WHERE '+where+' ORDER BY u.created_at DESC,u.id LIMIT 20 OFFSET $3',[userId,examId,(q.page-1)*20])).rows
 res.json({uses,invited,total})
})
userProfiles.use('/:userId/exams/:examId',scoped)
