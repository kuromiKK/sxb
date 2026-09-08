import { Router } from 'express'
import { z } from 'zod'
import { db, transaction, type Queryable } from './db.ts'
import { fail, id } from './security.ts'

export const permissionCatalog = [
  {key:'knowledge.text.read',name:'知识点图文',group:'知识点',levels:['free','vip','svip'],fixed:true},
  {key:'knowledge.video.play',name:'知识点视频播放',group:'知识点',levels:['vip','svip']},
  {key:'knowledge.audio.play',name:'知识点音频播放',group:'知识点',levels:['vip','svip']},
  {key:'knowledge.handout.download',name:'知识点讲义下载',group:'知识点',levels:['vip','svip'],note:'沿用原会员门槛，产品规则待最终确认'},
  {key:'courses',name:'节级精讲课及配套讲义',group:'精讲课',levels:['vip','svip']},
  {key:'questions',name:'客观题练习',group:'学习',levels:['free','vip','svip'],fixed:true},
  {key:'knowledge',name:'知识点目录',group:'学习',levels:['free','vip','svip'],fixed:true},
  {key:'notes',name:'本人笔记',group:'学习',levels:['free','vip','svip'],fixed:true},
  {key:'plan',name:'学习计划',group:'学习',levels:['free','vip','svip'],fixed:true},
  {key:'cheatsheet.read',name:'考前小抄阅读',group:'考前小抄',levels:['svip']},
  {key:'cheatsheet.handout.download',name:'考前小抄讲义下载',group:'考前小抄',levels:['svip']},
  {key:'reports',name:'学习报告',group:'学习报告',levels:['svip']},
  {key:'aiChat',name:'知识点 AI 答疑（非 AI 老师）',group:'AI 服务',levels:['vip','svip']},
  {key:'aiReview',name:'AI 复习资料生成',group:'AI 服务',levels:['svip']},
  {key:'ai.wrong',name:'AI 错题分析',group:'AI 服务',levels:['vip','svip']},
  {key:'ai.report',name:'AI 报告解读',group:'AI 服务',levels:['svip']},
  {key:'ai.plan',name:'AI 学习计划建议',group:'AI 服务',levels:['vip','svip']},
] as const
export function defaultPermissions(level:string): Record<string,boolean> {
  return Object.fromEntries(permissionCatalog.map(p=>[p.key,(p.levels as readonly string[]).includes(level)]))
}
export async function resolvePermissions(examId:string,level:string,c:Queryable=db) {
  const row=(await c.query('SELECT permissions FROM permission_policies WHERE exam_id=$1 AND level=$2',[examId,level])).rows[0]
  const defaults=defaultPermissions(level)
  for(const p of permissionCatalog)if(!('fixed' in p) && typeof row?.permissions?.[p.key]==='boolean')defaults[p.key]=row.permissions[p.key]
  return defaults
}
export const permissionPolicies=Router()
permissionPolicies.get('/:examId',async(req,res)=>{
  if(!(await db.query('SELECT id FROM exams WHERE id=$1',[req.params.examId])).rows.length)fail(404,'考试不存在')
  const policies=[]
  for(const level of ['free','vip','svip']) {
    const row=(await db.query('SELECT version,updated_at FROM permission_policies WHERE exam_id=$1 AND level=$2',[req.params.examId,level])).rows[0]
    policies.push({level,version:row?.version||0,permissions:await resolvePermissions(req.params.examId,level)})
  }
  res.json({catalog:permissionCatalog,policies})
})
permissionPolicies.put('/:examId/:level',async(req,res)=>{
  const level=z.enum(['free','vip','svip']).parse(req.params.level)
  const b=z.object({version:z.number().int().min(0),reason:z.string().trim().min(2).max(200),permissions:z.record(z.string(),z.boolean())}).strict().parse(req.body)
  if(Object.keys(b.permissions).some(key=>!permissionCatalog.some(p=>p.key===key)))fail(400,'包含未知权限')
  for(const p of permissionCatalog)if('fixed' in p && b.permissions[p.key]!==true)fail(400,'基础图文及学习功能保持全员可用')
  await transaction(async c=>{
    const exam=(await c.query('SELECT id FROM exams WHERE id=$1 FOR UPDATE',[req.params.examId])).rows[0]
    if(!exam)fail(404,'考试不存在')
    const before=(await c.query('SELECT * FROM permission_policies WHERE exam_id=$1 AND level=$2',[exam.id,level])).rows[0]
    if((before?.version||0)!==b.version)fail(409,'权限已被修改，请刷新后重试')
    const next={...defaultPermissions(level),...b.permissions}
    await c.query(`INSERT INTO permission_policies(exam_id,level,permissions,actor_id) VALUES($1,$2,$3,$4) ON CONFLICT(exam_id,level) DO UPDATE SET permissions=$3,actor_id=$4,version=permission_policies.version+1,updated_at=now()`,[exam.id,level,JSON.stringify(next),res.locals.user.id])
    await c.query('INSERT INTO audit_logs(id,actor_id,action,target_id,details) VALUES($1,$2,$3,$4,$5)',[id(),res.locals.user.id,'permissions.update',exam.id,JSON.stringify({level,reason:b.reason,before:before?.permissions||defaultPermissions(level),after:next})])
  })
  res.json({ok:true})
})
