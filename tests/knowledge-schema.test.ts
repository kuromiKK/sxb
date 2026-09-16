import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { migrateKnowledgeTables } from '../apps/api/src/knowledge-schema.ts'

test('populated legacy migration preserves IDs, payloads, references and enforces multi-point links',async()=>{
  const db=new PGlite()
  try {
    await db.exec(`
      CREATE TABLE schema_versions(version integer PRIMARY KEY);
      CREATE TABLE exam_categories(id text PRIMARY KEY);
      CREATE TABLE exams(id text PRIMARY KEY,name text NOT NULL,short_title text,enabled boolean NOT NULL DEFAULT true,is_test_data boolean NOT NULL DEFAULT true,category_id text REFERENCES exam_categories(id),intro text,cover_url text);
      CREATE TABLE content(id text PRIMARY KEY,exam_id text REFERENCES exams(id),kind text NOT NULL,parent_id text REFERENCES content(id),title text NOT NULL,status text NOT NULL DEFAULT 'draft',payload jsonb NOT NULL DEFAULT '{}',source text NOT NULL DEFAULT 'test',is_test_data boolean NOT NULL DEFAULT true,version integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE course_links(course_id text REFERENCES content(id),target_id text REFERENCES content(id),PRIMARY KEY(course_id,target_id));
      CREATE TABLE answers(id text PRIMARY KEY,question_id text REFERENCES content(id));
      CREATE TABLE orders(id text PRIMARY KEY,exam_id text REFERENCES exams(id));
      INSERT INTO exams(id,name) VALUES('e','考试'),('other','另一考试');
      INSERT INTO content(id,exam_id,kind,parent_id,title,status,payload) VALUES
      ('s','e','subject',NULL,'科目','published','{}'),('c','e','chapter','s','章','published','{}'),('t','e','section','c','节','published','{}'),
      ('k','e','knowledge','t','知识点','published','{"content":"原正文","handouts":[{"assetId":"asset","title":"原讲义"}]}'),
      ('k2','e','knowledge','t','知识点二','published','{}'),
      ('q','e','question','k','原题目','published','{"knowledgePointId":"k","answer":[0]}'),
      ('course','e','course','t','精品课','published','{"mediaUrl":"original.mp4"}'),
      ('extra','e','course','k','配套课','published','{}'),
      ('h','e','handout','course','讲义','published','{}');
      INSERT INTO answers VALUES('a','q'); INSERT INTO orders VALUES('o','e');
      INSERT INTO course_links VALUES('course','t'),('extra','k');
    `)
    const before=(await db.query('SELECT * FROM content ORDER BY id')).rows
    await db.query("INSERT INTO course_links VALUES('course','k')")
    await assert.rejects(db.transaction(tx=>migrateKnowledgeTables(tx as any)),/共享课程/)
    assert.equal((await db.query<any>("SELECT relkind FROM pg_class WHERE oid='content'::regclass")).rows[0].relkind,'r')
    assert.equal((await db.query('SELECT * FROM content')).rows.length,before.length)
    await db.query("DELETE FROM course_links WHERE course_id='course' AND target_id='k'")
    await db.transaction(tx=>migrateKnowledgeTables(tx as any))
    await db.transaction(tx=>migrateKnowledgeTables(tx as any))
    const after=(await db.query<any>('SELECT * FROM content ORDER BY id')).rows
    assert.equal(after.length,before.length)
    for(let i=0;i<before.length;i++){
      const original:any=before[i],migrated=after[i]
      assert.equal(migrated.id,original.id)
      assert.equal(migrated.parent_id,original.parent_id)
      assert.deepEqual(migrated.created_at,original.created_at)
      if(original.kind!=='question')assert.deepEqual(migrated,original)
      else assert.deepEqual(migrated.payload,{...original.payload,knowledgePointIds:['k']})
    }
    assert.equal((await db.query<any>("SELECT kind,parent_id FROM knowledge_nodes WHERE id='s'")).rows[0].parent_id,'e')
    assert.equal((await db.query<any>("SELECT relkind FROM pg_class WHERE oid='exams'::regclass")).rows[0].relkind,'v')
    assert.equal((await db.query<any>('SELECT * FROM questions')).rows.length,1)
    assert.equal((await db.query<any>('SELECT * FROM premium_courses')).rows.length,1)
    assert.equal((await db.query<any>('SELECT * FROM knowledge_courses')).rows.length,1)
    assert.equal((await db.query<any>('SELECT * FROM answers JOIN questions ON questions.id=answers.question_id')).rows.length,1)
    assert.equal((await db.query<any>('SELECT * FROM orders JOIN exams ON exams.id=orders.exam_id')).rows.length,1)
    await db.query(`UPDATE content SET payload=payload||'{"knowledgePointIds":["k","k2"]}' WHERE id='q'`)
    assert.equal((await db.query('SELECT * FROM question_knowledge_points')).rows.length,2)
    await assert.rejects(db.query("DELETE FROM question_knowledge_points WHERE question_id='q' AND is_primary"),/主知识点/)
    await assert.rejects(db.query("UPDATE content SET payload=payload||'{\"knowledgePointIds\":[\"k2\"]}' WHERE id='q'"),/主知识点/)
    await db.query("INSERT INTO content(id,exam_id,kind,parent_id,title) VALUES('course2','e','course','t','第二精品课')")
    await db.query("INSERT INTO content(id,exam_id,kind,parent_id,title) VALUES('extra2','e','course','k','第二配套课')")
    await assert.rejects(db.query("INSERT INTO knowledge_courses(id,exam_id,kind,parent_id,title) VALUES('course2','e','course','k','重复ID')"),/已被其他表/)
    await assert.rejects(db.query("UPDATE content SET parent_id='k2' WHERE id='extra2'"),/归属/)
    await assert.rejects(db.query("UPDATE knowledge_nodes SET exam_id='other' WHERE id='k2'"),/考试归属/)
    await db.query("INSERT INTO content(id,exam_id,kind,title) VALUES('os','other','subject','其他科目')")
    await db.query("INSERT INTO content(id,exam_id,kind,parent_id,title) VALUES('oc','other','chapter','os','其他章')")
    await db.query("INSERT INTO content(id,exam_id,kind,parent_id,title) VALUES('ot','other','section','oc','其他节')")
    await db.query("INSERT INTO content(id,exam_id,kind,parent_id,title) VALUES('ok','other','knowledge','ot','其他知识点')")
    await assert.rejects(db.query("UPDATE content SET payload=payload||'{\"knowledgePointIds\":[\"k\",\"ok\"]}' WHERE id='q'"),/同一考试/)
    await assert.rejects(db.query("INSERT INTO premium_courses(id,exam_id,kind,parent_id,title) VALUES('bad','e','course','k','错误归属')"),/父级/)
  } finally {await db.close()}
})

test('API catalog counts shared questions once per scope and preserves draft visibility',async()=>{
  process.env.APP_MODE='test';process.env.DATABASE_URL='';process.env.LOCAL_DATABASE_DIR=await mkdtemp(join(tmpdir(),'sxb-schema-'))
  const {db,closeDatabase}=await import('../apps/api/src/db.ts')
  const {seed}=await import('../apps/api/src/seed.ts')
  const {catalog,validateContent}=await import('../apps/api/src/content.ts')
  try{
    await seed()
    const points=(await db.query("SELECT * FROM content WHERE kind='knowledge' AND exam_id='junior-social-worker' ORDER BY id")).rows
    const a=points[0],b=points.find(p=>p.parent_id!==a.parent_id)!
    const q=(await db.query("SELECT * FROM content WHERE kind='question' AND exam_id='junior-social-worker' LIMIT 1")).rows[0]
    await db.query('UPDATE content SET parent_id=$2,payload=payload||$3::jsonb WHERE id=$1',[q.id,a.id,JSON.stringify({knowledgePointId:a.id,knowledgePointIds:[a.id,b.id]})])
    const data=await catalog('junior-social-worker')
    const exported=data.practiceQuestions.find(x=>x.id===q.id)!
    assert.deepEqual(new Set(exported.knowledgePointIds),new Set([a.id,b.id]))
    assert.equal(exported.linkedSectionIds.length,2)
    assert.equal(data.practiceQuestions.filter(x=>x.id===q.id).length,1)
    for(const point of data.knowledgeSubjects.flatMap(s=>s.chapters.flatMap((c:any)=>c.sections.flatMap((sec:any)=>sec.points)))){
      assert.equal(point.questionTotal,data.practiceQuestions.filter(x=>x.knowledgePointIds.includes(point.id)).length)
    }
    await assert.rejects(validateContent({...q,parent_id:a.id,payload:{...q.payload,knowledgePointId:a.id,knowledgePointIds:[a.id,'mid-point-test']}}),/不属于该考试/)
    await db.query("UPDATE content SET status='offline' WHERE id=$1",[b.id])
    assert.deepEqual((await catalog('junior-social-worker')).practiceQuestions.find(x=>x.id===q.id)?.knowledgePointIds,[a.id])
    await seed() // restart is idempotent; edited associations survive
    assert.equal((await db.query('SELECT * FROM question_knowledge_points WHERE question_id=$1',[q.id])).rows.length,2)
  } finally {await closeDatabase()}
})
