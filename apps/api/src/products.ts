import { Router } from 'express'
import { z } from 'zod'
import { db, transaction, type Queryable } from './db.ts'
import { fail, id } from './security.ts'
import { lockResourceReferences, validateEditorImages, registeredCoverUrl } from './editor-images.ts'
import { messageDocument, messageHtml } from '../../shared/message-document.ts'
import { permissionCatalog, resolvePermissions } from './permission-policy.ts'

export async function migrateProducts(){await transaction(async c=>{
  await c.query('LOCK TABLE schema_versions IN EXCLUSIVE MODE')
  if((await c.query('SELECT 1 FROM schema_versions WHERE version=16')).rows.length)return
  await c.query(`CREATE TABLE products(id text PRIMARY KEY,type text NOT NULL,title text NOT NULL,price_cents integer NOT NULL CHECK(price_cents>0),original_price_cents integer,cover_url text NOT NULL DEFAULT '',intro text NOT NULL DEFAULT '',document jsonb,status text NOT NULL CHECK(status IN ('draft','published','offline')),sort_order integer NOT NULL DEFAULT 0,version integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now())`)
  await c.query(`CREATE TABLE product_entitlements(product_id text PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,exam_id text NOT NULL REFERENCES knowledge_nodes(id),cycle_id text NOT NULL REFERENCES exam_cycles(id),level text NOT NULL CHECK(level IN ('vip','svip')),trial_hours numeric,minimum_hours numeric,short_notice text)`)
  await c.query(`CREATE TABLE product_versions(product_id text NOT NULL REFERENCES products(id) ON DELETE CASCADE,version integer NOT NULL,snapshot jsonb NOT NULL,actor_id text REFERENCES users(id),action text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(product_id,version))`)
  await c.query('ALTER TABLE orders ADD COLUMN product_id text REFERENCES products(id)')
  await c.query('ALTER TABLE orders ADD COLUMN product_snapshot jsonb')
  await c.query('ALTER TABLE orders ADD COLUMN checkout_confirmation jsonb')
  await c.query('ALTER TABLE memberships ADD COLUMN entitlement_ends_at timestamptz')
  await c.query('ALTER TABLE memberships ADD COLUMN trial_level text')
  await c.query('CREATE SEQUENCE entry_number_products')
  await c.query("CREATE TRIGGER record_number_insert AFTER INSERT OR UPDATE OF id ON products FOR EACH ROW EXECUTE FUNCTION assign_record_number('entry_number_products')")
  await c.query('INSERT INTO schema_versions(version) VALUES(16)')
})}

export async function migrateProductNames(){await transaction(async c=>{
  await c.query('LOCK TABLE schema_versions IN EXCLUSIVE MODE')
  if((await c.query('SELECT 1 FROM schema_versions WHERE version=18')).rows.length)return
  await c.query('ALTER TABLE products ADD COLUMN frontend_title text')
  await c.query('UPDATE products SET frontend_title=title')
  await c.query('ALTER TABLE products ALTER COLUMN frontend_title SET NOT NULL')
  await c.query("ALTER TABLE products ADD CONSTRAINT products_frontend_title_nonempty CHECK(length(trim(frontend_title)) BETWEEN 1 AND 100)")
  // Historical versions and order snapshots remain immutable; missing names use their original title.
  await c.query('INSERT INTO schema_versions(version) VALUES(18)')
})}

export const productSchema=z.object({
  title:z.string().trim().min(1,'请输入后台商品名称').max(100),frontendTitle:z.string().trim().min(1,'请输入前端商品名称').max(100).optional(),type:z.enum(['entitlement','trial']),
  examId:z.string().min(1,'请选择考试'),cycleId:z.string().min(1,'请选择考期'),level:z.enum(['vip','svip']),
  priceCents:z.number().int().min(1).max(100000000),originalPriceCents:z.number().int().min(1).max(100000000).nullable().default(null),
  coverUrl:z.string().max(30000000).default(''),intro:z.string().trim().max(500).default(''),document:z.any().nullable().default(null),
  status:z.enum(['draft','published','offline']).default('draft'),sortOrder:z.number().int().min(0).max(99999).default(0),
  trialHours:z.number().positive().max(8760).nullable().default(null),minimumHours:z.number().positive().max(8760).nullable().default(null),shortNotice:z.string().trim().max(1000).default(''),
}).strict().superRefine((p,ctx)=>{
  if(p.originalPriceCents!==null&&p.originalPriceCents<p.priceCents)ctx.addIssue({code:'custom',message:'划线原价不能低于售价',path:['originalPriceCents']})
  if(p.type==='trial'){
    if(!p.trialHours||!p.minimumHours||!p.shortNotice)ctx.addIssue({code:'custom',message:'体验时长、最低可购买时长和支付提示语均为必填',path:['trialHours']})
    if(p.minimumHours!>p.trialHours!)ctx.addIssue({code:'custom',message:'最低可购买时长不能超过体验时长',path:['minimumHours']})
  }
}).transform(p=>({...p,frontendTitle:p.frontendTitle??p.title}))
export type ProductConfig=z.infer<typeof productSchema>
const selectProduct=`SELECT p.*,g.exam_id,g.cycle_id,g.level,g.trial_hours,g.minimum_hours,g.short_notice,e.name AS exam_name,e.enabled AS exam_enabled,c.year,c.starts_at,c.ends_at,
  EXISTS(SELECT 1 FROM orders o WHERE o.product_id=p.id) AS has_orders,EXISTS(SELECT 1 FROM orders o WHERE o.product_id=p.id AND o.paid_at IS NOT NULL) AS has_paid
  FROM products p JOIN product_entitlements g ON g.product_id=p.id JOIN exams e ON e.id=g.exam_id JOIN exam_cycles c ON c.id=g.cycle_id`
export async function getProduct(productId:string,c:Queryable=db){return (await c.query(selectProduct+' WHERE p.id=$1',[productId])).rows[0]}
export function productConfig(p:any):ProductConfig{return {title:p.title,frontendTitle:p.frontend_title||p.title,type:p.type,examId:p.exam_id,cycleId:p.cycle_id,level:p.level,priceCents:p.price_cents,originalPriceCents:p.original_price_cents,coverUrl:p.cover_url,intro:p.intro,document:p.document,status:p.status,sortOrder:p.sort_order,trialHours:p.trial_hours==null?null:Number(p.trial_hours),minimumHours:p.minimum_hours==null?null:Number(p.minimum_hours),shortNotice:p.short_notice||''}}
export function saleState(p:any,now=Date.now()){
  if(new Date(p.ends_at).getTime()<=now)return 'expired'
  if(p.status!=='published')return p.status
  if(!p.exam_enabled)return 'unavailable'
  return new Date(p.starts_at).getTime()>now?'scheduled':'selling'
}
async function saveProduct(c:Queryable,productId:string,input:any,version:number,actor:string,action:string){
  const config=productSchema.parse(input)
  await lockResourceReferences(c)
  const before=(await c.query('SELECT * FROM products WHERE id=$1 FOR UPDATE',[productId])).rows[0]
  if((before?.version||0)!==version)fail(409,'商品已被修改，请刷新后重试')
  const old=before?await getProduct(productId,c):null
  if(old?.has_paid&&['type','examId','cycleId','level'].some(k=>(productConfig(old) as any)[k]!== (config as any)[k]))fail(409,'已有支付订单，商品类型、考试、考期和权益档位不能修改，恢复历史版本也不能改变这些信息')
  const cycle=(await c.query('SELECT c.*,e.enabled FROM exam_cycles c JOIN exams e ON e.id=c.exam_id WHERE c.id=$1 AND c.exam_id=$2 FOR SHARE OF c',[config.cycleId,config.examId])).rows[0]
  if(!cycle)fail(400,'考期不属于所选考试或已经删除')
  if(config.status==='published'&&(!cycle.enabled||new Date(cycle.ends_at).getTime()<=Date.now()))fail(400,'考试已停用或考期已结束，不能上架')
  if(config.document)config.document=messageDocument(config.document).document
  config.coverUrl=await registeredCoverUrl(config.coverUrl,c)
  await validateEditorImages(config,c)
  const next=version+1
  await c.query(`INSERT INTO products(id,type,title,price_cents,original_price_cents,cover_url,intro,document,status,sort_order,version,frontend_title) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    ON CONFLICT(id) DO UPDATE SET type=$2,title=$3,price_cents=$4,original_price_cents=$5,cover_url=$6,intro=$7,document=$8,status=$9,sort_order=$10,version=$11,frontend_title=$12,updated_at=now()`,[productId,config.type,config.title,config.priceCents,config.originalPriceCents,config.coverUrl,config.intro,JSON.stringify(config.document),config.status,config.sortOrder,next,config.frontendTitle])
  await c.query(`INSERT INTO product_entitlements(product_id,exam_id,cycle_id,level,trial_hours,minimum_hours,short_notice) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(product_id) DO UPDATE SET exam_id=$2,cycle_id=$3,level=$4,trial_hours=$5,minimum_hours=$6,short_notice=$7`,[productId,config.examId,config.cycleId,config.level,config.type==='trial'?config.trialHours:null,config.type==='trial'?config.minimumHours:null,config.type==='trial'?config.shortNotice:''])
  await c.query('INSERT INTO product_versions(product_id,version,snapshot,actor_id,action) VALUES($1,$2,$3,$4,$5)',[productId,next,JSON.stringify(config),actor,action])
  await c.query('INSERT INTO audit_logs(id,actor_id,action,target_id,details) VALUES($1,$2,$3,$4,$5)',[id(),actor,'product.'+action,productId,JSON.stringify({version:next})])
  return {id:productId,version:next}
}

export const productManagement=Router()
productManagement.get('/',async(_req,res)=>{const rows=(await db.query(selectProduct+' ORDER BY p.sort_order,p.updated_at DESC,p.id')).rows;res.json(rows.map(p=>({...p,saleState:saleState(p),config:productConfig(p)})))})
productManagement.get('/:id/versions',async(req,res)=>res.json((await db.query('SELECT v.*,u.nickname AS actor_name FROM product_versions v LEFT JOIN users u ON u.id=v.actor_id WHERE product_id=$1 ORDER BY version DESC',[req.params.id])).rows.map(v=>({...v,html:v.snapshot.document?messageHtml(v.snapshot.document):''}))))
productManagement.put('/:id',async(req,res)=>{
  const b=z.object({version:z.number().int().min(0),config:z.any()}).strict().parse(req.body)
  res.json(await transaction(c=>saveProduct(c,String(req.params.id),b.config,b.version,res.locals.user.id,'save')))
})
productManagement.post('/:id/restore',async(req,res)=>{
  const b=z.object({version:z.number().int().min(1),sourceVersion:z.number().int().min(1)}).strict().parse(req.body)
  res.json(await transaction(async c=>{const saved=(await c.query('SELECT snapshot FROM product_versions WHERE product_id=$1 AND version=$2',[req.params.id,b.sourceVersion])).rows[0];if(!saved)fail(404,'历史版本不存在');return saveProduct(c,String(req.params.id),saved.snapshot,b.version,res.locals.user.id,'restore-v'+b.sourceVersion)}))
})
productManagement.patch('/:id/status',async(req,res)=>{
  const b=z.object({version:z.number().int().min(1),status:z.enum(['published','offline'])}).strict().parse(req.body)
  res.json(await transaction(async c=>{const old=await getProduct(String(req.params.id),c);if(!old)fail(404,'商品不存在');return saveProduct(c,old.id,{...productConfig(old),status:b.status},b.version,res.locals.user.id,b.status==='published'?'publish':'offline')}))
})
productManagement.delete('/:id',async(req,res)=>{
  const b=z.object({version:z.number().int().min(1)}).parse(req.body)
  await transaction(async c=>{await lockResourceReferences(c);const row=(await c.query('SELECT * FROM products WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];if(!row)fail(404,'商品不存在');if(row.version!==b.version)fail(409,'商品已修改，请刷新');if((await c.query('SELECT 1 FROM orders WHERE product_id=$1 LIMIT 1',[req.params.id])).rows.length)fail(409,'已有订单的商品只能下架，不能删除');await c.query('DELETE FROM products WHERE id=$1',[req.params.id]);await c.query('INSERT INTO audit_logs(id,actor_id,action,target_id,details) VALUES($1,$2,$3,$4,$5)',[id(),res.locals.user.id,'product.delete',req.params.id,JSON.stringify({title:row.title})])});res.json({ok:true})
})
export async function publicProducts(examId:string){
  const rows=(await db.query(selectProduct+" WHERE g.exam_id=$1 AND p.status='published' AND e.enabled AND c.starts_at<=now() AND c.ends_at>now() ORDER BY p.sort_order,p.id",[examId])).rows
  return Promise.all(rows.map(async p=>{const permissions=await resolvePermissions(p.exam_id,p.level);return {id:p.id,title:p.frontend_title||p.title,type:p.type,examId:p.exam_id,examName:p.exam_name,year:p.year,level:p.level,priceCents:p.price_cents,originalPriceCents:p.original_price_cents,coverUrl:p.cover_url,intro:p.intro,html:p.document?messageHtml(p.document):'',endsAt:p.ends_at,trialHours:p.trial_hours==null?null:Number(p.trial_hours),permissions:permissionCatalog.filter(x=>permissions[x.key]).map(x=>x.name)}}))
}
