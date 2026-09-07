import { db, transaction } from './db.ts'
export async function migrate() {
  // Append versioned migrations here; never reset a database on startup.
  await db.query(`CREATE TABLE IF NOT EXISTS schema_versions (version integer PRIMARY KEY, applied_at timestamptz DEFAULT now())`)
  const versions = await db.query('SELECT version FROM schema_versions WHERE version=1')
  if (versions.rows.length) { await migrateAIContext(); await migrateAnswerRequests(); return }
  const statements = [
    `CREATE TABLE users (id text PRIMARY KEY, phone text UNIQUE NOT NULL, nickname text NOT NULL, role text NOT NULL DEFAULT 'student' CHECK(role IN ('student','superadmin','editor','support','operator')), password_hash text, invite_code text UNIQUE NOT NULL, inviter_id text REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), is_test_data boolean NOT NULL DEFAULT true)`,
    `CREATE TABLE sessions (token_hash text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id), expires_at timestamptz NOT NULL, created_at timestamptz DEFAULT now())`,
    `CREATE TABLE login_codes (phone text PRIMARY KEY, code_hash text NOT NULL, expires_at timestamptz NOT NULL, sent_at timestamptz NOT NULL DEFAULT now(), attempts integer NOT NULL DEFAULT 0)`,
    `CREATE TABLE exams (id text PRIMARY KEY, name text NOT NULL, enabled boolean NOT NULL DEFAULT true, is_test_data boolean NOT NULL DEFAULT true)`,
    `CREATE TABLE exam_cycles (id text PRIMARY KEY, exam_id text NOT NULL REFERENCES exams(id), year integer NOT NULL, ends_at timestamptz NOT NULL, is_test_data boolean NOT NULL DEFAULT true, UNIQUE(exam_id,year))`,
    `CREATE TABLE content (id text PRIMARY KEY, exam_id text REFERENCES exams(id), kind text NOT NULL, parent_id text REFERENCES content(id), title text NOT NULL, status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','review','published','offline')), payload jsonb NOT NULL DEFAULT '{}', source text NOT NULL DEFAULT 'test', is_test_data boolean NOT NULL DEFAULT true, version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())`,
    `CREATE INDEX content_catalog ON content(exam_id,kind,status)`,
    `CREATE TABLE course_links (course_id text NOT NULL REFERENCES content(id), target_id text NOT NULL REFERENCES content(id), PRIMARY KEY(course_id,target_id))`,
    `CREATE TABLE orders (id text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id), exam_id text NOT NULL REFERENCES exams(id), cycle_id text NOT NULL REFERENCES exam_cycles(id), product text NOT NULL CHECK(product IN ('vip','svip','trial','upgrade')), amount_cents integer NOT NULL CHECK(amount_cents>=0), status text NOT NULL DEFAULT 'pending_payment' CHECK(status IN ('pending_payment','paid','closed','refunding','refunded')), created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL, paid_at timestamptz, close_reason text, is_test_data boolean NOT NULL DEFAULT true)`,
    `CREATE UNIQUE INDEX one_pending_order_per_user ON orders(user_id) WHERE status='pending_payment'`,
    `CREATE TABLE payments (id text PRIMARY KEY, order_id text NOT NULL REFERENCES orders(id), status text NOT NULL, method text NOT NULL, error text, created_at timestamptz NOT NULL DEFAULT now(), is_test_data boolean NOT NULL DEFAULT true)`,
    `CREATE TABLE memberships (order_id text PRIMARY KEY REFERENCES orders(id), user_id text NOT NULL REFERENCES users(id), exam_id text NOT NULL REFERENCES exams(id), cycle_id text NOT NULL REFERENCES exam_cycles(id), level text NOT NULL, starts_at timestamptz NOT NULL DEFAULT now(), trial_ends_at timestamptz, revoked boolean NOT NULL DEFAULT false)`,
    `CREATE TABLE answers (id text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id), exam_id text NOT NULL REFERENCES exams(id), question_id text NOT NULL REFERENCES content(id), selection jsonb NOT NULL, correct boolean, score numeric, created_at timestamptz NOT NULL DEFAULT now())`,
    `CREATE TABLE user_records (id text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id), exam_id text NOT NULL REFERENCES exams(id), kind text NOT NULL, source_id text NOT NULL, payload jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,exam_id,kind,source_id))`,
    `CREATE TABLE ai_features (id text PRIMARY KEY, name text NOT NULL, enabled boolean NOT NULL DEFAULT false, config jsonb NOT NULL, encrypted_key text, updated_at timestamptz NOT NULL DEFAULT now())`,
    `CREATE TABLE ai_calls (id text PRIMARY KEY, feature_id text NOT NULL REFERENCES ai_features(id), user_id text NOT NULL REFERENCES users(id), model text NOT NULL, endpoint text NOT NULL, status text NOT NULL, input_tokens integer, output_tokens integer, cached_tokens integer, cost_yuan numeric(18,8), pricing jsonb NOT NULL, duration_ms integer NOT NULL, error text, result text, is_test boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now())`,
    `CREATE TABLE audit_logs (id text PRIMARY KEY, actor_id text REFERENCES users(id), action text NOT NULL, target_id text, details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now())`,
    `CREATE TABLE import_batches (id text PRIMARY KEY, actor_id text NOT NULL REFERENCES users(id), exam_id text NOT NULL REFERENCES exams(id), filename text NOT NULL, rows jsonb NOT NULL, errors jsonb NOT NULL, status text NOT NULL DEFAULT 'preview', created_at timestamptz NOT NULL DEFAULT now())`,
    `INSERT INTO schema_versions(version) VALUES(1)`
  ]
  await transaction(async c => {
    await c.query('LOCK TABLE schema_versions IN EXCLUSIVE MODE')
    if ((await c.query('SELECT version FROM schema_versions WHERE version=1')).rows.length) return
    for (const sql of statements) await c.query(sql)
  })
  await migrateAIContext()
  await migrateAnswerRequests()
}

async function migrateAnswerRequests() {
  await transaction(async c => {
    await c.query('LOCK TABLE schema_versions IN EXCLUSIVE MODE')
    if ((await c.query('SELECT version FROM schema_versions WHERE version=3')).rows.length) return
    await c.query('ALTER TABLE answers ADD COLUMN request_id text, ADD COLUMN response jsonb')
    await c.query('CREATE UNIQUE INDEX answers_request ON answers(user_id,request_id)')
    await c.query('INSERT INTO schema_versions(version) VALUES(3)')
  })
}

async function migrateAIContext() {
  await transaction(async c => {
    await c.query('LOCK TABLE schema_versions IN EXCLUSIVE MODE')
    if ((await c.query('SELECT version FROM schema_versions WHERE version=2')).rows.length) return
    await c.query('ALTER TABLE ai_calls ADD COLUMN exam_id text REFERENCES exams(id)')
    await c.query("ALTER TABLE ai_calls ADD COLUMN context jsonb NOT NULL DEFAULT '{}' ")
    await c.query('CREATE INDEX ai_calls_user_exam ON ai_calls(user_id,exam_id,feature_id,created_at)')
    await c.query('INSERT INTO schema_versions(version) VALUES(2)')
  })
}
