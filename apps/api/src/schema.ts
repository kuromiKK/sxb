import { db, transaction } from './db.ts'
import {migrateSiteSettings} from './site-settings.ts'
import {migrateIntegrations} from './integrations.ts'
import {migrateWorkspaceTools} from './workspace-tools.ts'
import {migrateProviders} from './provider-config.ts'
import { migrateKnowledgeSchema } from './knowledge-schema.ts'
import { migrateRecordNumbers } from './record-numbers.ts'
import { migrateQuestionGrades } from './question-grades.ts'
import { migrateQuestionTypes } from './question-types.ts'
import { migrateQuestionGrading } from './question-grading.ts'
import { migrateEditorImages } from './editor-images.ts'
import { migrateExamGuide } from './exam-guide.ts'
import { migrateExamPeriods } from './exam-periods.ts'
import { migrateProducts, migrateProductNames } from './products.ts'
import { migrateRegisteredImages } from './registered-images.ts'
import { migrateLearningData } from './learning-data.ts'
import { migrateLearningRecords } from './learning-records.ts'
import { migrateOrderManagement } from './order-management.ts'
import { migrateCheatsheetManagement } from './cheatsheet-management.ts'
import {migratePlatformMode} from './platform-mode.ts'
export async function migrate() {await migrateCore();await migrateAdministratorDeletion();await migrateSiteSettings();await migrateIntegrations();await migrateProviders();await migrateWorkspaceTools();await migratePlatformMode()}
async function migrateAdministratorDeletion() {
  // Keep administrator identities for content ownership and historical audit references.
  await db.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_deleted_at timestamptz')
}
async function migrateCore() {
  // Append versioned migrations here; never reset a database on startup.
  await db.query(`CREATE TABLE IF NOT EXISTS schema_versions (version integer PRIMARY KEY, applied_at timestamptz DEFAULT now())`)
if ((await db.query('SELECT 1 FROM schema_versions WHERE version=10')).rows.length) {await migrateRecordNumbers();await migrateQuestionGrades();await migrateQuestionTypes();await migrateQuestionGrading();await migrateEditorImages();await migrateCheatsheetManagement();await migrateExamGuide();await migrateExamPeriods();await migrateProducts();await migrateOrderManagement();await migrateProductNames();await migrateRegisteredImages();await migrateLearningData();await migrateLearningRecords();return}
  const versions = await db.query('SELECT version FROM schema_versions WHERE version=1')
  if (versions.rows.length) { await migrateAIContext(); await migrateAnswerRequests(); await migrateAccountKinds(); await migrateManualEntitlements(); await migratePlanModel(); await migrateExamMeta(); await migrateStudyContent(); await migrateMessages(); await migrateReferrals(); await migrateAdminEnhancements(); await migrateExamProjectYears(); await migrateKnowledgeSchema(); await migrateRecordNumbers(); await migrateQuestionGrades(); await migrateQuestionTypes();await migrateQuestionGrading();await migrateEditorImages();await migrateCheatsheetManagement();await migrateExamGuide();await migrateExamPeriods();await migrateProducts();await migrateOrderManagement();await migrateProductNames();await migrateRegisteredImages();await migrateLearningData();await migrateLearningRecords(); return }
  const statements = [
    `CREATE TABLE users (id text PRIMARY KEY, phone text UNIQUE NOT NULL, nickname text NOT NULL, role text NOT NULL DEFAULT 'student' CHECK(role IN ('student','superadmin','editor','support','operator')), password_hash text, invite_code text UNIQUE NOT NULL, inviter_id text REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), is_test_data boolean NOT NULL DEFAULT true, is_developer boolean NOT NULL DEFAULT false)`,
    `CREATE TABLE sessions (token_hash text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id), expires_at timestamptz NOT NULL, created_at timestamptz DEFAULT now())`,
    `CREATE TABLE login_codes (phone text PRIMARY KEY, code_hash text NOT NULL, expires_at timestamptz NOT NULL, sent_at timestamptz NOT NULL DEFAULT now(), attempts integer NOT NULL DEFAULT 0)`,
    `CREATE TABLE exams (id text PRIMARY KEY, name text NOT NULL, short_title text, enabled boolean NOT NULL DEFAULT true, is_test_data boolean NOT NULL DEFAULT true)`,
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
  await migrateAccountKinds()
  await migrateManualEntitlements()
  await migratePlanModel()
  await migrateExamMeta()
  await migrateStudyContent()
  await migrateMessages()
  await migrateReferrals()
  await migrateAdminEnhancements()
  await migrateExamProjectYears()
  await migrateKnowledgeSchema()
  await migrateRecordNumbers()
  await migrateQuestionGrades()
  await migrateQuestionTypes()
  await migrateQuestionGrading();await migrateEditorImages();await migrateCheatsheetManagement();await migrateExamGuide();await migrateExamPeriods();await migrateProducts();await migrateOrderManagement();await migrateProductNames();await migrateRegisteredImages();await migrateLearningData();await migrateLearningRecords()
}
async function migrateExamProjectYears(){ await db.query(`CREATE TABLE IF NOT EXISTS exam_year_entries(id text PRIMARY KEY, exam_id text NOT NULL REFERENCES exams(id) ON DELETE CASCADE, year integer NOT NULL, cutoff_date date, UNIQUE(exam_id,year))`); await db.query('ALTER TABLE exams ADD COLUMN IF NOT EXISTS intro text'); await db.query('ALTER TABLE exams ADD COLUMN IF NOT EXISTS cover_url text') }

async function migrateAdminEnhancements() {
  await transaction(async c => {
    await c.query('ALTER TABLE exam_categories ADD COLUMN IF NOT EXISTS intro text NOT NULL DEFAULT \'\''); await c.query('ALTER TABLE exam_categories ADD COLUMN IF NOT EXISTS cover_url text NOT NULL DEFAULT \'\''); await c.query('ALTER TABLE exams ADD COLUMN IF NOT EXISTS short_title text');
    await c.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS is_developer boolean NOT NULL DEFAULT false');
  })
}

async function migrateReferrals() {
  await transaction(async c => {
    await c.query('LOCK TABLE schema_versions IN EXCLUSIVE MODE')
    if ((await c.query('SELECT version FROM schema_versions WHERE version=9')).rows.length) return
    await c.query(`CREATE TABLE IF NOT EXISTS referral_codes (
      id text PRIMARY KEY, code text UNIQUE NOT NULL, channel text NOT NULL CHECK(channel IN ('douyin','video_account','kuaishou','xiaohongshu','bilibili','community')),
      exam_id text REFERENCES exams(id), permission_level text CHECK(permission_level IN ('vip','svip')), permission_hours integer CHECK(permission_hours BETWEEN 1 AND 72),
      expires_at timestamptz, status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled','expired')), creator_id text NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    )`)
    await c.query(`CREATE TABLE IF NOT EXISTS referral_uses (
      id text PRIMARY KEY, referral_id text NOT NULL REFERENCES referral_codes(id), user_id text NOT NULL REFERENCES users(id), exam_id text REFERENCES exams(id), permission_level text, permission_hours integer, used_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id)
    )`)
    await c.query(`CREATE TABLE IF NOT EXISTS system_settings (key text PRIMARY KEY, value text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), actor_id text REFERENCES users(id))`)
    await c.query('INSERT INTO system_settings(key,value) VALUES($1,$2) ON CONFLICT DO NOTHING',['site_domain','http://127.0.0.1:5174'])
    await c.query('INSERT INTO schema_versions(version) VALUES(9)')
  })
}

async function migrateMessages() {
  await transaction(async c => {
    await c.query('LOCK TABLE schema_versions IN EXCLUSIVE MODE')
    if ((await c.query('SELECT version FROM schema_versions WHERE version=8')).rows.length) return
    await c.query(`CREATE TABLE IF NOT EXISTS message_templates (
      id text PRIMARY KEY, name text NOT NULL, status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','offline')),
      title text NOT NULL, document jsonb NOT NULL DEFAULT '{}', content text NOT NULL DEFAULT '', variables jsonb NOT NULL DEFAULT '[]',
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), actor_id text REFERENCES users(id), is_test_data boolean NOT NULL DEFAULT true
    )`)
    await c.query(`CREATE TABLE IF NOT EXISTS messages (
      id text PRIMARY KEY, template_id text REFERENCES message_templates(id), title text NOT NULL, document jsonb NOT NULL DEFAULT '{}', content text NOT NULL DEFAULT '',
      send_type text NOT NULL CHECK(send_type IN ('manual','scheduled','preset','draft')), channels jsonb NOT NULL DEFAULT '["h5"]', category_ids jsonb NOT NULL DEFAULT '[]', exam_ids jsonb NOT NULL DEFAULT '[]', permission_levels jsonb NOT NULL DEFAULT '[]', user_ids jsonb NOT NULL DEFAULT '[]',
      schedule jsonb NOT NULL DEFAULT '{}', status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','scheduled','sent','cancelled','active')), sent_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), actor_id text REFERENCES users(id), is_test_data boolean NOT NULL DEFAULT true
    )`)
    await c.query(`CREATE TABLE IF NOT EXISTS message_deliveries (id text PRIMARY KEY, message_id text NOT NULL REFERENCES messages(id) ON DELETE CASCADE, user_id text NOT NULL REFERENCES users(id), channel text NOT NULL, status text NOT NULL, read_at timestamptz, delivered_at timestamptz, error text, UNIQUE(message_id,user_id,channel))`)
    await c.query('INSERT INTO schema_versions(version) VALUES(8)')
  })
}

async function migrateStudyContent() {
  await transaction(async c => {
    await c.query('LOCK TABLE schema_versions IN EXCLUSIVE MODE')
    if ((await c.query("SELECT 1 WHERE to_regclass('media_assets') IS NOT NULL AND to_regclass('permission_policies') IS NOT NULL AND to_regclass('content_notices_seen') IS NOT NULL AND to_regclass('media_tickets') IS NOT NULL")).rows.length) return
    await c.query(`CREATE TABLE IF NOT EXISTS permission_policies (exam_id text NOT NULL REFERENCES exams(id), level text NOT NULL CHECK(level IN ('free','vip','svip')), permissions jsonb NOT NULL DEFAULT '{}', version integer NOT NULL DEFAULT 1, actor_id text REFERENCES users(id), updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(exam_id,level))`)
    await c.query(`CREATE TABLE IF NOT EXISTS media_assets (id text PRIMARY KEY, exam_id text NOT NULL REFERENCES exams(id), content_id text NOT NULL, owner_id text NOT NULL REFERENCES users(id), kind text NOT NULL CHECK(kind IN ('image','video','audio','handout')), source text NOT NULL CHECK(source IN ('upload','external')), filename text NOT NULL, mime text NOT NULL, size_bytes bigint NOT NULL DEFAULT 0, disk_name text, external_url text, created_at timestamptz NOT NULL DEFAULT now())`)
    await c.query(`CREATE INDEX IF NOT EXISTS media_content ON media_assets(content_id)`)
    await c.query(`CREATE TABLE IF NOT EXISTS media_tickets (token_hash text PRIMARY KEY, asset_id text NOT NULL REFERENCES media_assets(id), content_id text NOT NULL, session_hash text NOT NULL REFERENCES sessions(token_hash) ON DELETE CASCADE, expires_at timestamptz NOT NULL)`)
    await c.query(`CREATE TABLE IF NOT EXISTS content_notices_seen (user_id text NOT NULL REFERENCES users(id), content_id text NOT NULL REFERENCES content(id), PRIMARY KEY(user_id,content_id), seen_at timestamptz NOT NULL DEFAULT now())`)
    await c.query('INSERT INTO schema_versions(version) VALUES(7) ON CONFLICT DO NOTHING')
  })
}

async function migratePlanModel() {
  await transaction(async c => {
    await c.query('LOCK TABLE schema_versions IN EXCLUSIVE MODE')
    if ((await c.query('SELECT version FROM schema_versions WHERE version=6')).rows.length) return
    await c.query(`CREATE TABLE IF NOT EXISTS exam_categories (
      id text PRIMARY KEY, parent_id text REFERENCES exam_categories(id), name text NOT NULL,
      sort_order integer NOT NULL DEFAULT 0, enabled boolean NOT NULL DEFAULT true, is_test_data boolean NOT NULL DEFAULT true,
      UNIQUE(parent_id,name)
    )`)
    await c.query('ALTER TABLE exams ADD COLUMN IF NOT EXISTS category_id text REFERENCES exam_categories(id)')
    await c.query(`CREATE TABLE IF NOT EXISTS exam_plan_configs (
      exam_id text PRIMARY KEY REFERENCES exams(id), prep_days integer NOT NULL DEFAULT 90 CHECK(prep_days BETWEEN 1 AND 365),
      sprint_days integer NOT NULL DEFAULT 14 CHECK(sprint_days BETWEEN 1 AND 90), default_rest_days integer NOT NULL DEFAULT 1 CHECK(default_rest_days BETWEEN 0 AND 3),
      default_round text NOT NULL DEFAULT 'coverage' CHECK(default_round IN ('coverage','consolidation')),
      updated_at timestamptz NOT NULL DEFAULT now(), actor_id text REFERENCES users(id)
    )`)
    await c.query('INSERT INTO schema_versions(version) VALUES(6)')
  })
}

async function migrateExamMeta() {
  await transaction(async c => {
    await c.query('LOCK TABLE schema_versions IN EXCLUSIVE MODE')
    await c.query('ALTER TABLE exam_categories ADD COLUMN IF NOT EXISTS intro text NOT NULL DEFAULT \'\'')
    await c.query('ALTER TABLE exam_categories ADD COLUMN IF NOT EXISTS cover_url text NOT NULL DEFAULT \'\'')
  })
}

async function migrateManualEntitlements() {
  await transaction(async c => {
    await c.query('LOCK TABLE schema_versions IN EXCLUSIVE MODE')
    if ((await c.query('SELECT version FROM schema_versions WHERE version=5')).rows.length) return
    await c.query(`CREATE TABLE manual_entitlements (
      user_id text NOT NULL REFERENCES users(id), exam_id text NOT NULL REFERENCES exams(id),
      cycle_id text NOT NULL REFERENCES exam_cycles(id), level text NOT NULL CHECK(level IN ('free','vip','svip')),
      revoked boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1 CHECK(version>0),
      first_granted_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now(),
      actor_id text NOT NULL REFERENCES users(id), reason text NOT NULL,
      PRIMARY KEY(user_id,exam_id)
    )`)
    await c.query('INSERT INTO schema_versions(version) VALUES(5)')
  })
}

async function migrateAccountKinds() {
  await transaction(async c => {
    await c.query('LOCK TABLE schema_versions IN EXCLUSIVE MODE')
    if ((await c.query('SELECT version FROM schema_versions WHERE version=4')).rows.length) return
    // Separate principal IDs preserve every existing foreign key and audit entry.
    await c.query("ALTER TABLE users ADD COLUMN account_kind text NOT NULL DEFAULT 'student', ADD COLUMN enabled boolean NOT NULL DEFAULT true, ADD COLUMN last_login_at timestamptz, ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now()")
    await c.query("UPDATE users SET account_kind='admin' WHERE role<>'student'")
    await c.query('ALTER TABLE users DROP CONSTRAINT users_phone_key')
    await c.query('ALTER TABLE users ADD CONSTRAINT users_phone_kind_key UNIQUE(phone,account_kind)')
    await c.query("ALTER TABLE users ADD CONSTRAINT users_kind_role_check CHECK((account_kind='student' AND role='student') OR (account_kind='admin' AND role<>'student'))")
    await c.query("ALTER TABLE sessions ADD COLUMN audience text NOT NULL DEFAULT 'student' CHECK(audience IN ('student','admin'))")
    await c.query("DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE account_kind='admin')")
    await c.query('INSERT INTO schema_versions(version) VALUES(4)')
  })
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
