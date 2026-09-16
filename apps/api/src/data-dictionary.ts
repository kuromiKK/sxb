import {Router} from 'express'
import {db} from './db.ts'
import {fieldLabels,fieldNotes,jsonNotes,tableNotes} from './data-dictionary-notes.ts'
export const dataDictionary=Router()
export async function readDataDictionary(){
 // Only structural metadata. Never SELECT business rows or accept arbitrary SQL/table names.
 const [relations,columns,constraints,indexes]=await Promise.all([
  db.query(`SELECT n.nspname AS schema,c.relname AS name,c.relkind AS kind,obj_description(c.oid,'pg_class') AS comment FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','migration_archive') AND c.relkind IN ('r','p','v','m') ORDER BY n.nspname,c.relname`),
  db.query(`SELECT table_schema AS schema,table_name AS table,column_name AS name,ordinal_position AS position,data_type AS type,udt_name,column_default AS default_value,is_nullable='YES' AS nullable,character_maximum_length AS max_length,numeric_precision,numeric_scale FROM information_schema.columns WHERE table_schema IN ('public','migration_archive') ORDER BY table_schema,table_name,ordinal_position`),
  db.query(`SELECT n.nspname AS schema,c.relname AS table,k.conname AS name,k.contype AS type,pg_get_constraintdef(k.oid,true) AS definition,ARRAY(SELECT a.attname FROM unnest(k.conkey) WITH ORDINALITY AS key(num,ord) JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=key.num ORDER BY key.ord) AS columns,rn.nspname AS target_schema,r.relname AS target_table,ARRAY(SELECT a.attname FROM unnest(k.confkey) WITH ORDINALITY AS key(num,ord) JOIN pg_attribute a ON a.attrelid=r.oid AND a.attnum=key.num ORDER BY key.ord) AS target_columns FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_class r ON r.oid=k.confrelid LEFT JOIN pg_namespace rn ON rn.oid=r.relnamespace WHERE n.nspname IN ('public','migration_archive') AND k.contype IN ('p','u','f','c') ORDER BY k.conname`),
  db.query(`SELECT n.nspname AS schema,c.relname AS table,i.relname AS name,x.indisunique AS unique,x.indisprimary AS primary,pg_get_indexdef(i.oid) AS definition FROM pg_index x JOIN pg_class c ON c.oid=x.indrelid JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','migration_archive') ORDER BY i.relname`)
 ])
 const tables=relations.rows.map(r=>{
  const archived=r.schema==='migration_archive',base=archived?r.name.replace(/_v\d+$/,''):r.name,note=tableNotes[base]
  const cs=constraints.rows.filter(c=>c.schema===r.schema&&c.table===r.name)
  const archivedLabels:Record<string,string>={content:'迁移前内容备份',exams:'迁移前考试备份',course_links:'迁移前课程关联备份'}
  return {id:r.schema+'.'+r.name,schema:r.schema,name:r.name,label:archived?archivedLabels[base]||'历史表备份':note?.label||'待补充说明',group:archived?'迁移归档':note?.group||'其他',description:archived?'结构迁移时保留的历史数据快照，当前业务不向此表写入。':note?.description||r.comment||'该表尚未补充业务用途说明。',kind:['v','m'].includes(r.kind)?'视图':'数据表',documented:Boolean(note),
   columns:columns.rows.filter(c=>c.schema===r.schema&&c.table===r.name).map(c=>{
    const key=base+'.'+c.name,sensitive=/password|secret|encrypted|token_hash|code_hash|proof_hash|session_hash|upstream_key/.test(c.name)
    const own=cs.filter(k=>k.columns.includes(c.name))
    return {...c,label:base==='products'&&c.name==='title'?'后台商品名称':fieldLabels[c.name]||'待补充说明',documented:Boolean(fieldLabels[c.name]),sensitive,default_value:sensitive&&c.default_value!==null?'敏感默认值已隐藏':c.default_value,primary:own.some(k=>k.type==='p'),unique:own.some(k=>k.type==='u'||k.type==='p'),description:fieldNotes[key]||((c.name==='status'&&!['v','m'].includes(r.kind))?'可用状态见下方检查约束。':sensitive?'仅展示结构，不读取或展示实际值。':''),jsonDescription:jsonNotes[key]||(c.type==='jsonb'||c.type==='json'?(c.name.includes('document')||c.name==='document'?'富文本结构：type、content、attrs、marks；媒体节点保存登记资源标识或公开图片地址。':'业务扩展结构，具体含义由对应模块定义。'):'')}
   }),constraints:cs,indexes:indexes.rows.filter(i=>i.schema===r.schema&&i.table===r.name)}
 })
 const groups=['考试与内容','用户与权益','交易管理','学习数据','运营管理','系统管理','迁移归档','其他']
 tables.sort((a,b)=>groups.indexOf(a.group)-groups.indexOf(b.group)||a.name.localeCompare(b.name))
 return {tables,generatedAt:new Date().toISOString(),summary:{tables:tables.filter(t=>t.kind==='数据表').length,views:tables.filter(t=>t.kind==='视图').length,columns:columns.rows.length,undocumented:tables.reduce((n,t)=>n+(!t.documented?1:0)+t.columns.filter(c=>!c.documented).length,0)}}
}
dataDictionary.get('/',async(_req,res)=>{res.setHeader('Cache-Control','no-store');res.json(await readDataDictionary())})
