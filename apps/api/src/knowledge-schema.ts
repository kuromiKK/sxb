import { type Queryable, transaction } from './db.ts'

/** Version 10: physical domain tables; old SQL names become compatibility views. */
export async function migrateKnowledgeSchema() {
  await transaction(migrateKnowledgeTables)
}

export async function migrateKnowledgeTables(c: Queryable) {
  await c.query('LOCK TABLE schema_versions IN EXCLUSIVE MODE')
  if ((await c.query('SELECT 1 FROM schema_versions WHERE version=10')).rows.length) return
  const invalid=(await c.query(`SELECT c.id FROM content c LEFT JOIN content p ON p.id=c.parent_id LEFT JOIN exams e ON e.id=c.exam_id WHERE
    c.kind IN ('subject','chapter','section','knowledge','question','course') AND
    (e.id IS NULL OR (c.kind='subject' AND c.parent_id IS NOT NULL) OR
     (c.kind<>'subject' AND (p.id IS NULL OR p.exam_id IS DISTINCT FROM c.exam_id OR
      NOT ((c.kind='chapter' AND p.kind='subject') OR (c.kind='section' AND p.kind='chapter') OR
      (c.kind='knowledge' AND p.kind='section') OR (c.kind='question' AND p.kind='knowledge') OR
      (c.kind='course' AND p.kind IN ('section','knowledge'))))))
    UNION SELECT c.id FROM content c JOIN exams e ON e.id=c.id
    UNION SELECT l.course_id FROM course_links l JOIN content c ON c.id=l.course_id WHERE l.target_id IS DISTINCT FROM c.parent_id LIMIT 10`)).rows
  if(invalid.length)throw new Error('迁移前发现无效层级、重复 ID 或共享课程：'+invalid.map(x=>x.id).join('、'))
  await c.query(`CREATE SCHEMA IF NOT EXISTS migration_archive`)
  // Keep a historical snapshot for audit/recovery; application writes use only the new tables.
  await c.query(`CREATE TABLE migration_archive.content_v9 AS TABLE content`)
  await c.query(`CREATE TABLE migration_archive.exams_v9 AS TABLE exams`)
  await c.query(`CREATE TABLE migration_archive.course_links_v9 AS TABLE course_links`)
  await c.query(`ALTER TABLE exams RENAME TO knowledge_nodes`)
  await c.query(`ALTER TABLE knowledge_nodes RENAME COLUMN name TO title`)
  await c.query(`ALTER TABLE knowledge_nodes
    ADD COLUMN kind text NOT NULL DEFAULT 'exam',
    ADD COLUMN exam_id text REFERENCES knowledge_nodes(id),
    ADD COLUMN parent_id text REFERENCES knowledge_nodes(id),
    ADD COLUMN status text NOT NULL DEFAULT 'published' CHECK(status IN ('draft','review','published','offline')),
    ADD COLUMN payload jsonb NOT NULL DEFAULT '{}', ADD COLUMN source text NOT NULL DEFAULT 'test',
    ADD COLUMN version integer NOT NULL DEFAULT 1,
    ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(), ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
    ADD CONSTRAINT knowledge_node_kind CHECK(kind IN ('exam','subject','chapter','section','knowledge'))`)
  await c.query(`INSERT INTO knowledge_nodes(id,title,kind,exam_id,parent_id,status,payload,source,is_test_data,version,created_at,updated_at)
    SELECT id,title,kind,exam_id,CASE WHEN kind='subject' THEN exam_id ELSE parent_id END,status,payload,source,is_test_data,version,created_at,updated_at
    FROM content WHERE kind IN ('subject','chapter','section','knowledge')`)
  for (const table of ['questions','premium_courses','knowledge_courses','other_content']) {
    await c.query(`CREATE TABLE ${table} (LIKE content INCLUDING DEFAULTS INCLUDING CONSTRAINTS)`)
    await c.query(`ALTER TABLE ${table} ADD PRIMARY KEY(id)`)
    await c.query(`ALTER TABLE ${table} ADD FOREIGN KEY(exam_id) REFERENCES knowledge_nodes(id)`)
    await c.query(`CREATE INDEX ${table}_exam_status ON ${table}(exam_id,status)`)
  }
  await c.query(`INSERT INTO questions SELECT * FROM content WHERE kind='question'`)
  await c.query(`INSERT INTO premium_courses SELECT c.* FROM content c JOIN content p ON p.id=c.parent_id WHERE c.kind='course' AND p.kind='section'`)
  await c.query(`INSERT INTO knowledge_courses SELECT c.* FROM content c JOIN content p ON p.id=c.parent_id WHERE c.kind='course' AND p.kind='knowledge'`)
  await c.query(`INSERT INTO other_content SELECT * FROM content WHERE kind NOT IN ('subject','chapter','section','knowledge','question','course')`)
  const before=(await c.query('SELECT count(*)::int AS n FROM content')).rows[0].n
  const after=(await c.query(`SELECT (SELECT count(*) FROM knowledge_nodes WHERE kind<>'exam')+(SELECT count(*) FROM questions)+(SELECT count(*) FROM premium_courses)+(SELECT count(*) FROM knowledge_courses)+(SELECT count(*) FROM other_content) AS n`)).rows[0].n
  if(Number(before)!==Number(after)) throw new Error('知识结构迁移失败：存在无法归类的记录，已回滚')
  await c.query(`ALTER TABLE questions ADD CONSTRAINT question_kind CHECK(kind='question'), ALTER COLUMN exam_id SET NOT NULL, ALTER COLUMN parent_id SET NOT NULL,
    ADD FOREIGN KEY(parent_id) REFERENCES knowledge_nodes(id)`)
  for(const table of ['premium_courses','knowledge_courses']) await c.query(`ALTER TABLE ${table} ADD CHECK(kind='course'), ALTER COLUMN exam_id SET NOT NULL, ALTER COLUMN parent_id SET NOT NULL, ADD FOREIGN KEY(parent_id) REFERENCES knowledge_nodes(id)`)
  await c.query(`ALTER TABLE other_content ADD CHECK(kind NOT IN ('exam','subject','chapter','section','knowledge','question','course'))`)
  await c.query(`CREATE TABLE content_identity (id text PRIMARY KEY, kind text NOT NULL, owner_table text NOT NULL)`)
  await c.query(`INSERT INTO content_identity SELECT id,kind,'knowledge_nodes' FROM knowledge_nodes`)
  for(const table of ['questions','premium_courses','knowledge_courses','other_content']) await c.query(`INSERT INTO content_identity SELECT id,kind,'${table}' FROM ${table}`)
  for(const table of ['questions','premium_courses','knowledge_courses','other_content']) await c.query(`ALTER TABLE ${table} ADD FOREIGN KEY(id) REFERENCES content_identity(id) DEFERRABLE INITIALLY DEFERRED`)
  // Existing record references keep their IDs and move to the new physical owners.
  const refs=(await c.query(`SELECT conrelid::regclass::text AS tbl,conname,pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE contype='f' AND confrelid='content'::regclass`)).rows
  for(const ref of refs) {
    if(ref.tbl==='content'||ref.tbl==='course_links') continue
    const target=ref.tbl==='answers'?'questions':'content_identity'
    await c.query(`ALTER TABLE ${ref.tbl} DROP CONSTRAINT "${ref.conname}"`)
    await c.query(`ALTER TABLE ${ref.tbl} ADD CONSTRAINT "${ref.conname}" ${ref.def.replace(/REFERENCES content\(id\)/,`REFERENCES ${target}(id)`)}`)
  }
  await c.query('DROP TABLE course_links')
  await c.query('DROP TABLE content')
  await c.query(`CREATE TABLE question_knowledge_points (
    question_id text NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    knowledge_id text NOT NULL REFERENCES knowledge_nodes(id),
    is_primary boolean NOT NULL DEFAULT false, PRIMARY KEY(question_id,knowledge_id))`)
  await c.query(`CREATE UNIQUE INDEX question_one_primary ON question_knowledge_points(question_id) WHERE is_primary`)
  await c.query(`CREATE INDEX knowledge_question_lookup ON question_knowledge_points(knowledge_id,question_id)`)
  await c.query(`INSERT INTO question_knowledge_points SELECT DISTINCT q.id,k.id,k.id=q.parent_id FROM questions q CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(q.payload->'knowledgePointIds',jsonb_build_array(q.parent_id))) k(id)`)
  if((await c.query(`SELECT q.id FROM questions q WHERE
    NOT EXISTS(SELECT 1 FROM question_knowledge_points k WHERE k.question_id=q.id AND k.is_primary) OR
    EXISTS(SELECT 1 FROM question_knowledge_points k JOIN knowledge_nodes n ON n.id=k.knowledge_id WHERE k.question_id=q.id AND (n.kind<>'knowledge' OR n.exam_id<>q.exam_id)) LIMIT 1`)).rows.length)throw new Error('原题目关联包含无效或跨考试知识点，迁移已回滚')
  await c.query(`CREATE VIEW exams AS SELECT id,title AS name,short_title,enabled,is_test_data,category_id,intro,cover_url FROM knowledge_nodes WHERE kind='exam' WITH LOCAL CHECK OPTION`)
  const cols='id,exam_id,kind,parent_id,title,status,payload,source,is_test_data,version,created_at,updated_at'
  await c.query(`CREATE VIEW content AS
    SELECT id,exam_id,kind,CASE WHEN kind='subject' THEN NULL::text ELSE parent_id END AS parent_id,title,status,payload,source,is_test_data,version,created_at,updated_at FROM knowledge_nodes WHERE kind<>'exam'
    UNION ALL SELECT q.id,q.exam_id,q.kind,q.parent_id,q.title,q.status,q.payload || jsonb_build_object('knowledgePointId',q.parent_id,'knowledgePointIds',COALESCE((SELECT jsonb_agg(k.knowledge_id ORDER BY k.is_primary DESC,k.knowledge_id) FROM question_knowledge_points k WHERE k.question_id=q.id),'[]'::jsonb)),q.source,q.is_test_data,q.version,q.created_at,q.updated_at FROM questions q
    UNION ALL SELECT ${cols} FROM premium_courses UNION ALL SELECT ${cols} FROM knowledge_courses UNION ALL SELECT ${cols} FROM other_content`)
  await c.query(`CREATE VIEW course_links AS SELECT id AS course_id,parent_id AS target_id FROM premium_courses UNION ALL SELECT id,parent_id FROM knowledge_courses`)
  await c.query(`CREATE INDEX knowledge_nodes_catalog ON knowledge_nodes(exam_id,kind,status,parent_id)`)
  await c.query(`CREATE FUNCTION validate_knowledge_owner() RETURNS trigger LANGUAGE plpgsql AS $$
  DECLARE p knowledge_nodes; expected text; existing_kind text; existing_table text;
  BEGIN
    IF TG_OP='UPDATE' AND (NEW.id<>OLD.id OR NEW.kind<>OLD.kind OR NEW.exam_id IS DISTINCT FROM OLD.exam_id) THEN RAISE EXCEPTION '内容ID、类型和考试归属不能更改' USING ERRCODE='23514'; END IF;
    IF TG_OP='UPDATE' AND NEW.kind='course' AND NEW.parent_id IS DISTINCT FROM OLD.parent_id THEN RAISE EXCEPTION '课程归属不能更换' USING ERRCODE='23514'; END IF;
    INSERT INTO content_identity(id,kind,owner_table) VALUES(NEW.id,NEW.kind,TG_TABLE_NAME) ON CONFLICT(id) DO NOTHING;
    SELECT kind,owner_table INTO existing_kind,existing_table FROM content_identity WHERE id=NEW.id;
    IF existing_kind<>NEW.kind OR existing_table<>TG_TABLE_NAME THEN RAISE EXCEPTION '内容 ID 已被其他表或类型占用' USING ERRCODE='23505'; END IF;
    IF NEW.kind='exam' THEN
      IF NEW.parent_id IS NOT NULL OR NEW.exam_id IS NOT NULL THEN RAISE EXCEPTION '考试必须是根节点' USING ERRCODE='23514'; END IF;
      RETURN NEW;
    END IF;
    IF NEW.kind IN ('subject','chapter','section','knowledge','question','course') THEN
      PERFORM 1 FROM knowledge_nodes WHERE id=NEW.exam_id AND kind='exam';
      IF NOT FOUND THEN RAISE EXCEPTION '所属考试不存在' USING ERRCODE='23514'; END IF;
      SELECT * INTO p FROM knowledge_nodes WHERE id=NEW.parent_id FOR SHARE;
      expected:=CASE NEW.kind WHEN 'subject' THEN 'exam' WHEN 'chapter' THEN 'subject' WHEN 'section' THEN 'chapter' WHEN 'knowledge' THEN 'section' WHEN 'question' THEN 'knowledge' ELSE CASE TG_TABLE_NAME WHEN 'premium_courses' THEN 'section' ELSE 'knowledge' END END;
      IF p.id IS NULL OR p.kind<>expected OR (CASE WHEN p.kind='exam' THEN p.id ELSE p.exam_id END)<>NEW.exam_id THEN RAISE EXCEPTION '父级类型或考试归属不正确' USING ERRCODE='23514'; END IF;
    END IF;
    RETURN NEW;
  END $$`)
  for(const table of ['knowledge_nodes','questions','premium_courses','knowledge_courses','other_content']) await c.query(`CREATE TRIGGER validate_owner BEFORE INSERT OR UPDATE ON ${table} FOR EACH ROW EXECUTE FUNCTION validate_knowledge_owner()`)
  await c.query(`CREATE FUNCTION validate_question_links() RETURNS trigger LANGUAGE plpgsql AS $$
  DECLARE q questions; qid text; link_count integer; primary_count integer;
  BEGIN
    IF TG_TABLE_NAME='questions' THEN qid:=COALESCE(NEW.id,OLD.id); ELSE qid:=COALESCE(NEW.question_id,OLD.question_id); END IF;
    SELECT * INTO q FROM questions WHERE id=qid;
    IF NOT FOUND THEN RETURN NULL; END IF;
    SELECT count(*),count(*) FILTER(WHERE k.is_primary AND k.knowledge_id=q.parent_id) INTO link_count,primary_count FROM question_knowledge_points k WHERE k.question_id=qid;
    IF link_count=0 OR primary_count<>1 OR EXISTS(SELECT 1 FROM question_knowledge_points k JOIN knowledge_nodes n ON n.id=k.knowledge_id WHERE k.question_id=qid AND (n.kind<>'knowledge' OR n.exam_id<>q.exam_id)) THEN RAISE EXCEPTION '题目必须关联同一考试的知识点，且恰有一个主知识点' USING ERRCODE='23514'; END IF;
    RETURN NULL;
  END $$`)
  await c.query(`CREATE CONSTRAINT TRIGGER question_links_check AFTER INSERT OR UPDATE ON questions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_question_links()`)
  await c.query(`CREATE CONSTRAINT TRIGGER question_links_check AFTER INSERT OR UPDATE OR DELETE ON question_knowledge_points DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_question_links()`)
  // Compatibility writes are routed into exactly one domain table, never mirrored.
  await c.query(`CREATE FUNCTION write_content_view() RETURNS trigger LANGUAGE plpgsql AS $$
  DECLARE tbl text; owner_kind text; record content; ids jsonb; item text;
  BEGIN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION '请通过内容管理接口下架内容'; END IF;
    IF NEW.kind IN ('subject','chapter','section','knowledge') THEN tbl:='knowledge_nodes';
    ELSIF NEW.kind='question' THEN tbl:='questions';
    ELSIF NEW.kind='course' THEN
      SELECT kind INTO owner_kind FROM knowledge_nodes WHERE id=NEW.parent_id;
      IF owner_kind NOT IN ('section','knowledge') OR owner_kind IS NULL THEN RAISE EXCEPTION '课程必须归属节或知识点' USING ERRCODE='23514'; END IF;
      tbl:=CASE owner_kind WHEN 'section' THEN 'premium_courses' ELSE 'knowledge_courses' END;
      IF TG_OP='UPDATE' AND NEW.parent_id IS DISTINCT FROM OLD.parent_id THEN RAISE EXCEPTION '课程归属由创建位置决定，不能更换' USING ERRCODE='23514'; END IF;
    ELSE tbl:='other_content'; END IF;
    IF TG_OP='UPDATE' AND (NEW.id<>OLD.id OR NEW.kind<>OLD.kind OR NEW.exam_id IS DISTINCT FROM OLD.exam_id) THEN RAISE EXCEPTION '不能更改内容身份' USING ERRCODE='23514'; END IF;
    NEW.status:=COALESCE(NEW.status,'draft'); NEW.payload:=COALESCE(NEW.payload,'{}'); NEW.source:=COALESCE(NEW.source,'test'); NEW.is_test_data:=COALESCE(NEW.is_test_data,true); NEW.version:=COALESCE(NEW.version,1); NEW.created_at:=COALESCE(NEW.created_at,now()); NEW.updated_at:=COALESCE(NEW.updated_at,now());
    record:=NEW;
    IF NEW.kind='subject' THEN record.parent_id:=NEW.exam_id; END IF;
    IF TG_OP='INSERT' THEN
      EXECUTE format('INSERT INTO %I (${cols}) SELECT ($1).*',tbl) USING record;
    ELSE
      EXECUTE format('UPDATE %I SET parent_id=$1,title=$2,status=$3,payload=$4,source=$5,is_test_data=$6,version=$7,updated_at=$8 WHERE id=$9',tbl) USING record.parent_id,NEW.title,NEW.status,NEW.payload,NEW.source,NEW.is_test_data,NEW.version,NEW.updated_at,NEW.id;
    END IF;
    IF NEW.kind='question' THEN
      ids:=COALESCE(NEW.payload->'knowledgePointIds',jsonb_build_array(NEW.parent_id));
      IF jsonb_typeof(ids)<>'array' OR NOT ids @> jsonb_build_array(NEW.parent_id) THEN RAISE EXCEPTION '主知识点必须在关联知识点中' USING ERRCODE='23514'; END IF;
      DELETE FROM question_knowledge_points WHERE question_id=NEW.id;
      FOR item IN SELECT DISTINCT jsonb_array_elements_text(ids) LOOP
        INSERT INTO question_knowledge_points(question_id,knowledge_id,is_primary) VALUES(NEW.id,item,item=NEW.parent_id);
      END LOOP;
    END IF;
    RETURN NEW;
  END $$`)
  await c.query(`CREATE TRIGGER content_write INSTEAD OF INSERT OR UPDATE OR DELETE ON content FOR EACH ROW EXECUTE FUNCTION write_content_view()`)
  await c.query(`COMMENT ON VIEW content IS 'Legacy API projection; physical owners are knowledge_nodes, questions, premium_courses, knowledge_courses, other_content'`)
  await c.query(`COMMENT ON VIEW exams IS 'Compatibility projection of exam roots in knowledge_nodes'`)
  await c.query('INSERT INTO schema_versions(version) VALUES(10)')
}
