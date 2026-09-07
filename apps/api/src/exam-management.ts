import { Router } from 'express'
import { z } from 'zod'
import { db, transaction } from './db.ts'
import { audit, fail } from './security.ts'
export const examManagement = Router()
examManagement.get('/',async(_req,res)=>res.json({categories:(await db.query('SELECT * FROM exam_categories ORDER BY sort_order,id')).rows,exams:(await db.query('SELECT * FROM exams ORDER BY id')).rows}))
examManagement.put('/categories/:id',async(req,res)=>{
  const b=z.object({name:z.string().trim().min(1).max(100),parentId:z.string().nullable(),sortOrder:z.number().int().min(0).max(9999),enabled:z.boolean()}).strict().parse(req.body)
  await transaction(async c=>{
    await c.query('LOCK TABLE exam_categories IN SHARE ROW EXCLUSIVE MODE')
    const old=(await c.query('SELECT * FROM exam_categories WHERE id=$1',[req.params.id])).rows[0]
    if(b.parentId){const parent=(await c.query('SELECT * FROM exam_categories WHERE id=$1',[b.parentId])).rows[0];if(!parent||parent.parent_id||b.parentId===req.params.id)fail(400,'二级分类只能归属一级分类')}
    if(old&&old.parent_id!==b.parentId){const used=(await c.query('SELECT id FROM exam_categories WHERE parent_id=$1 UNION SELECT id FROM exams WHERE category_id=$1',[req.params.id])).rows;if(used.length)fail(400,'已有下级内容的分类不能调整层级')}
    await c.query(`INSERT INTO exam_categories(id,parent_id,name,sort_order,enabled) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET parent_id=$2,name=$3,sort_order=$4,enabled=$5`,[req.params.id,b.parentId,b.name,b.sortOrder,b.enabled])
  })
  await audit(res.locals.user.id,'exam.category',req.params.id,b);res.json({ok:true})
})
examManagement.put('/exams/:id',async(req,res)=>{
  const b=z.object({name:z.string().trim().min(1).max(100),categoryId:z.string(),enabled:z.boolean()}).strict().parse(req.body)
  const category=(await db.query('SELECT * FROM exam_categories WHERE id=$1',[b.categoryId])).rows[0]
  if(!category?.parent_id)fail(400,'考试必须归属二级分类')
  const changed=(await db.query('UPDATE exams SET name=$2,category_id=$3,enabled=$4 WHERE id=$1 RETURNING id',[req.params.id,b.name,b.categoryId,b.enabled])).rows
  if(!changed.length)fail(404,'考试不存在')
  await audit(res.locals.user.id,'exam.settings',req.params.id,b);res.json({ok:true})
})
