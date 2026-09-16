import {Router} from 'express'
import {z} from 'zod'
import {db} from './db.ts'
import {fail} from './security.ts'
import {publishedPreferences} from './site-settings.ts'
export const searchPublic=Router()
searchPublic.get('/search',async(req,res)=>{
 const q=z.object({examId:z.string().min(1).max(160),q:z.string().trim().max(100).default(''),type:z.enum(['','knowledge','course','faq']).default(''),page:z.coerce.number().int().min(1).max(10000).default(1)}).parse(req.query)
 if(!(await db.query('SELECT 1 FROM exams WHERE id=$1 AND enabled',[q.examId])).rows.length)fail(404,'考试不存在或已停用')
 const settings=(await publishedPreferences()).search
 if(!settings.enabled){res.json({items:[],total:0,page:q.page,disabled:true});return}
 const types=q.type?settings.types.filter(t=>t===q.type):settings.types
 if(!q.q||!types.length){res.json({items:[],total:0,page:q.page});return}
 // Follow only published nodes of this exam; an offline parent hides its descendants.
 const cte=`WITH RECURSIVE tree AS (
 SELECT c.*,ARRAY[c.title]::text[] AS path,ARRAY[c.id]::text[] AS visited,NULL::text AS parent_kind FROM content c
 WHERE c.exam_id=$1 AND c.kind='subject' AND c.parent_id IS NULL AND c.status='published' AND NOT(c.payload ? 'deletedAt')
 UNION ALL SELECT c.*,t.path||c.title,t.visited||c.id,t.kind AS parent_kind FROM content c JOIN tree t ON c.parent_id=t.id
 WHERE c.exam_id=$1 AND c.kind IN ('chapter','section','knowledge','course') AND c.status='published' AND NOT(c.payload ? 'deletedAt') AND NOT(c.id=ANY(t.visited))
 ), candidates AS (
 SELECT id,title,kind,path,coalesce(payload->>'content','')||' '||coalesce(payload->>'intro','') AS body FROM tree WHERE kind='knowledge' OR (kind='course' AND parent_kind='section')
 UNION ALL SELECT c.id,c.title,'faq'::text,ARRAY['常见问题']::text[],coalesce(c.payload->>'content','') FROM content c
 WHERE c.kind='faq' AND c.status='published' AND NOT(c.payload ? 'deletedAt') AND (coalesce(c.payload->'article'->>'scope',CASE WHEN c.exam_id IS NULL THEN 'all' ELSE 'exams' END)='all'
 OR coalesce(c.payload->'article'->'examIds',CASE WHEN c.exam_id IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(c.exam_id) END) ? $1)
 ), matches AS (SELECT id,title,kind,path,CASE WHEN lower(title)=lower($2) THEN 0 WHEN strpos(lower(title),lower($2))>0 THEN 1 ELSE 2 END AS rank FROM candidates WHERE kind=ANY($3::text[]) AND (strpos(lower(title),lower($2))>0 OR strpos(lower(body),lower($2))>0))`
 const params=[q.examId,q.q,types]
 const total=(await db.query(cte+' SELECT count(*)::int AS n FROM matches',params)).rows[0].n
 // Return titles and paths only. Search never exposes paid body text or media URLs.
 const items=(await db.query(cte+' SELECT id,title,kind,path FROM matches ORDER BY rank,title,id LIMIT 20 OFFSET $4',[...params,(q.page-1)*20])).rows
 res.setHeader('Cache-Control','no-store');res.json({items,total,page:q.page})
})
