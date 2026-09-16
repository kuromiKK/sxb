import { Router } from 'express'
import { z } from 'zod'
import { db, transaction } from './db.ts'
import { audit, fail } from './security.ts'
import { lockResourceReferences,validateEditorImages,registeredCoverUrl } from './editor-images.ts'
export const examManagement = Router()
examManagement.get('/',async(_req,res)=>res.json({categories:(await db.query('SELECT * FROM exam_categories ORDER BY sort_order,id')).rows,exams:(await db.query('SELECT * FROM exams ORDER BY id')).rows}))
examManagement.put('/categories/:id',async(req,res)=>{
  const b=z.object({name:z.string().trim().min(1).max(100),parentId:z.null().optional(),sortOrder:z.number().int().min(0).max(9999),enabled:z.boolean(),intro:z.string().max(10000).optional().default(''),coverUrl:z.string().max(30000000).optional().default('')}).strict().parse(req.body)
  await transaction(async c=>{
    await lockResourceReferences(c);b.coverUrl=await registeredCoverUrl(b.coverUrl,c);await validateEditorImages(b,c)
    await c.query('LOCK TABLE exam_categories IN SHARE ROW EXCLUSIVE MODE')
    const old=(await c.query('SELECT * FROM exam_categories WHERE id=$1',[req.params.id])).rows[0]
    await c.query(`INSERT INTO exam_categories(id,parent_id,name,sort_order,enabled,intro,cover_url) VALUES($1,NULL,$2,$3,$4,$5,$6) ON CONFLICT(id) DO UPDATE SET name=$2,sort_order=$3,enabled=$4,intro=$5,cover_url=$6`,[req.params.id,b.name,b.sortOrder,b.enabled,b.intro,b.coverUrl])
  })
  await audit(res.locals.user.id,'exam.category',req.params.id,b);res.json({ok:true})
})
examManagement.delete('/categories/:id',async(req,res)=>{const n=Number((await db.query('SELECT count(*)::int AS n FROM exams WHERE category_id=$1',[req.params.id])).rows[0].n);if(n>0)fail(400,'该分类已关联考试，不能删除');await db.query('DELETE FROM exam_categories WHERE id=$1',[req.params.id]);res.json({ok:true})})
examManagement.put('/exams/:id',async(req,res)=>{
  const b=z.object({name:z.string().trim().min(1).max(100),shortTitle:z.string().trim().max(40).nullable().optional(),categoryId:z.string(),enabled:z.boolean()}).strict().parse(req.body)
  const category=(await db.query('SELECT * FROM exam_categories WHERE id=$1',[b.categoryId])).rows[0]
  if(!category)fail(400,'考试分类不存在')
  const changed=(await db.query('UPDATE exams SET name=$2,short_title=$3,category_id=$4,enabled=$5 WHERE id=$1 RETURNING id',[req.params.id,b.name,b.shortTitle||null,b.categoryId,b.enabled])).rows
  if(!changed.length)fail(404,'考试不存在')
  await audit(res.locals.user.id,'exam.settings',req.params.id,b);res.json({ok:true})
})

