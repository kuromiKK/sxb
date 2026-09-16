import {mkdtemp} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import express from 'express'
import {ZodError} from 'zod'
import assert from 'node:assert/strict'
export async function profileFixture(){
 process.env.APP_MODE='test';process.env.DATABASE_URL='';process.env.LOCAL_DATABASE_DIR=await mkdtemp(join(tmpdir(),'sxb-profiles-'));process.env.MEDIA_DIR=await mkdtemp(join(tmpdir(),'sxb-profiles-media-'));process.env.SECRET_KEY='e'.repeat(64);process.env.ADMIN_PHONE='18600000000';process.env.ADMIN_PASSWORD='Profile-Tests-42!'
 const {db,closeDatabase}=await import('../../apps/api/src/db.ts'),{seed}=await import('../../apps/api/src/seed.ts'),{initSecrets,session}=await import('../../apps/api/src/security.ts'),{api}=await import('../../apps/api/src/routes.ts')
 await initSecrets();await seed()
 const admin=(await db.query("SELECT id FROM users WHERE account_kind='admin' LIMIT 1")).rows[0],token=await session(admin.id,'admin'),uid='profile-student',other='profile-other',exam='junior-social-worker',second='mid-social-worker'
 for(const [id,phone,code] of [[uid,'18700001111','99111111'],[other,'18700002222','99222222']])await db.query("INSERT INTO users(id,phone,nickname,invite_code) VALUES($1,$2,'档案同名学员',$3)",[id,phone,code])
 await db.query('UPDATE users SET inviter_id=$2 WHERE id=$1',[other,uid])
 const student=await session(uid)
 for(const [prefix,e] of [['a',exam],['b',second]]){
  for(const [kind,key,parent] of [['subject','s',null],['chapter','c','s'],['section','t','c'],['knowledge','k','t'],['knowledge','k2','t']])await db.query("INSERT INTO content(id,exam_id,kind,parent_id,title,status,payload) VALUES($1,$2,$3,$4,$5,'published','{\"content\":\"学习正文\"}')",[prefix+'-'+key,e,kind,parent?prefix+'-'+parent:null,(prefix==='a'?'初级专属':'中级专属')+kind])
  for(const n of [1,2,3])await db.query("INSERT INTO content(id,exam_id,kind,parent_id,title,status,payload) VALUES($1,$2,'question',$3,$4,'published',$5)",[prefix+'-q'+n,e,prefix+'-k',(prefix==='a'?'初级专属题目':'中级专属题目')+n,JSON.stringify({type:n===2?'subjective':'single',stem:'服务目标是什么？',options:['促进发展','其他选项'],answer:[0],knowledgePointId:prefix+'-k',knowledgePointIds:n===1?[prefix+'-k',prefix+'-k2']:[prefix+'-k'],referenceAnswer:'促进发展',maxScore:10,rubric:'符合要点'})])
 }
 for(const [id,u,e,q,correct,when] of [['a-wrong',uid,exam,'a-q1',false,'2026-08-01'],['a-correct',uid,exam,'a-q1',true,'2026-08-02'],['b-wrong',uid,second,'b-q1',false,'2026-08-03'],['other-wrong',other,exam,'a-q1',false,'2026-08-04']] as const)await db.query('INSERT INTO answers(id,user_id,exam_id,question_id,selection,correct,request_id,created_at) VALUES($1,$2,$3,$4,$5,$6,$1,$7)',[id,u,e,q,JSON.stringify([correct?0:1]),correct,when+'T04:00:00Z'])
 await db.query("INSERT INTO question_submissions(id,user_id,exam_id,question_id,request_id,answers,result) VALUES('a-self',$1,$2,'a-q2','a-self','{\"essay\":\"用户答案\"}','{\"status\":\"self_graded\",\"score\":10,\"maxScore\":10,\"containsSelfScore\":true}')",[uid,exam])
 for(const [id,u,e,key,title] of [['a',uid,exam,'a-k','初级专属'],['b',uid,second,'b-k','中级专属'],['other',other,exam,'a-k','另一用户']]){
  await db.query("INSERT INTO learning_visits(id,user_id,exam_id,session_id,content_id,title,kind,media_type,path) VALUES($1,$2,$3,$1,$4,$5,'knowledge','article',$6)",[id+'-visit',u,e,key,title+'学习访问',JSON.stringify([title,'学习路径'])])
  for(const kind of ['note','favorite'])await db.query('INSERT INTO user_records(id,user_id,exam_id,kind,source_id,payload) VALUES($1,$2,$3,$4,$5,$6)',[id+'-'+kind,u,e,kind,key,JSON.stringify({sourceId:key,content:title+'笔记正文'})])
 }
 const starts=new Date(Date.now()-86400000).toISOString(),ends=new Date(Date.now()+86400000*30).toISOString()
 for(const [id,u,e,level,revoked] of [['a-order',uid,exam,'vip',false],['b-order',uid,second,'svip',false],['a-refund',uid,exam,'trial',true],['other-order',other,exam,'svip',false]] as const){
  const cycle=e+'-2027'
  await db.query("INSERT INTO orders(id,user_id,exam_id,cycle_id,product,amount_cents,status,expires_at,paid_at,product_snapshot,refund_reason,refunded_at,refund_reference) VALUES($1,$2,$3,$4,$5,2990,$6,$7,$8,$9,$10,$11,$12)",[id,u,e,cycle,level,revoked?'refunded':'paid',ends,starts,JSON.stringify({title:(e===exam?'初级':'中级')+'专属商品',level:level==='trial'?'vip':level,type:level==='trial'?'trial':'entitlement',year:2027,examName:e===exam?'初级社会工作师':'中级社会工作师'}),revoked?'人工退款测试':null,revoked?starts:null,revoked?'人工退款凭证':null])
  await db.query('INSERT INTO memberships(order_id,user_id,exam_id,cycle_id,level,starts_at,entitlement_ends_at,trial_ends_at,revoked) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[id,u,e,cycle,level,starts,ends,level==='trial'?ends:null,revoked])
 }
 await db.query("INSERT INTO audit_logs(id,actor_id,action,target_id,details) VALUES('a-log',$1,'order.manual_refund_confirmed','a-refund','{\"reason\":\"初级退款记录\"}'),('b-log',$1,'order.manual_refund_confirmed','b-order','{\"reason\":\"中级记录隔离\"}'),('account-log',$1,'user.developer',$2,'{\"enabled\":true}')",[admin.id,uid])
 const app=express();app.use(express.json({limit:'40mb',verify:(req,_res,b)=>{(req as any).rawBody=b.toString('utf8')}}));app.use('/api',api);app.use((e:any,_q:any,r:any,_n:any)=>r.status(e instanceof ZodError?400:e.status||500).json({message:e.message}))
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const origin='http://127.0.0.1:'+(server.address() as any).port
 async function call(path:string,expected=200,auth=token){const r=await fetch(origin+'/api'+path,{headers:{Authorization:'Bearer '+auth}});const d:any=await r.json();assert.equal(r.status,expected,JSON.stringify(d));return d}
 const base='/admin/user-profiles/'+uid,scope=base+'/exams/'+exam,scopeB=base+'/exams/'+second
 return {db,uid,other,exam,second,admin,token,student,call,base,scope,scopeB,origin,close:async()=>{await new Promise<void>(r=>server.close(()=>r()));await closeDatabase()}}
}
