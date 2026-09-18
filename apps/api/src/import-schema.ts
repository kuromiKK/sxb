import { transaction } from './db.ts'

export async function migrateImports(){await transaction(async c=>{
  await c.query('LOCK TABLE schema_versions IN EXCLUSIVE MODE')
  if((await c.query('SELECT 1 FROM schema_versions WHERE version=30')).rows.length)return
  await c.query("ALTER TABLE media_assets DROP CONSTRAINT IF EXISTS media_assets_kind_check")
  await c.query("ALTER TABLE media_assets ADD CONSTRAINT media_assets_kind_check CHECK(kind IN ('image','video','audio','handout','import'))")
  await c.query('ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS file_hash text')
  await c.query('CREATE INDEX IF NOT EXISTS media_file_hash ON media_assets(file_hash)')
  await c.query(`CREATE TABLE import_jobs(id text PRIMARY KEY,actor_id text NOT NULL REFERENCES users(id),exam_id text NOT NULL REFERENCES knowledge_nodes(id),asset_id text NOT NULL REFERENCES media_assets(id),kind text NOT NULL CHECK(kind IN ('structure','question')),status text NOT NULL DEFAULT 'preview',is_test boolean NOT NULL DEFAULT false,rows jsonb NOT NULL DEFAULT '[]',headers jsonb NOT NULL DEFAULT '[]',created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now())`)
  await c.query(`CREATE TABLE content_origins(id text PRIMARY KEY,content_id text NOT NULL,job_id text NOT NULL REFERENCES import_jobs(id),asset_id text NOT NULL REFERENCES media_assets(id),sheet text NOT NULL,line integer NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(content_id,job_id,line))`)
  for(const table of ['import_jobs','content_origins']){
    await c.query(`CREATE SEQUENCE entry_number_${table}`)
    await c.query(`CREATE TRIGGER record_number_insert AFTER INSERT OR UPDATE OF id ON ${table} FOR EACH ROW EXECUTE FUNCTION assign_record_number('entry_number_${table}')`)
  }
  await c.query('INSERT INTO schema_versions(version) VALUES(30)')
})}
