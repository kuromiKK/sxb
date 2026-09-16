import { type Queryable, transaction } from './db.ts'

// A sidecar preserves all existing keys/views and retains numbers after deletion.
export async function migrateRecordNumbers(){await transaction(migrateRecordNumberTables)}
export async function migrateRecordNumberTables(c:Queryable){
  await c.query('LOCK TABLE schema_versions IN EXCLUSIVE MODE')
  if((await c.query('SELECT 1 FROM schema_versions WHERE version=11')).rows.length)return
  await c.query(`CREATE TABLE record_numbers(table_name text NOT NULL,record_id text NOT NULL,entry_no bigint NOT NULL CHECK(entry_no>0),PRIMARY KEY(table_name,record_id),UNIQUE(table_name,entry_no))`)
  await c.query(`CREATE FUNCTION assign_record_number() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF TG_OP='UPDATE' AND NEW.id IS DISTINCT FROM OLD.id THEN RAISE EXCEPTION '唯一标识不能修改' USING ERRCODE='23514'; END IF;
      IF NOT EXISTS(SELECT 1 FROM record_numbers WHERE table_name=TG_TABLE_NAME AND record_id=NEW.id::text) THEN
        INSERT INTO record_numbers VALUES(TG_TABLE_NAME,NEW.id::text,nextval(TG_ARGV[0]::regclass)) ON CONFLICT(table_name,record_id) DO NOTHING;
      END IF;
      RETURN NEW;
    END $$`)
  const tables=(await c.query(`SELECT t.table_name,bool_or(c.column_name='created_at') AS has_created FROM information_schema.tables t JOIN information_schema.columns c USING(table_schema,table_name) WHERE t.table_schema='public' AND t.table_type='BASE TABLE' AND t.table_name NOT IN ('content_identity','record_numbers') AND EXISTS(SELECT 1 FROM information_schema.columns i WHERE i.table_schema=t.table_schema AND i.table_name=t.table_name AND i.column_name='id') GROUP BY t.table_name ORDER BY t.table_name`)).rows
  for(const table of tables){
    const name=table.table_name as string
    if(!/^[a-z_][a-z0-9_]*$/.test(name))throw new Error('不支持的表名：'+name)
    const sequence='entry_number_'+name
    await c.query(`LOCK TABLE "${name}" IN EXCLUSIVE MODE`)
    await c.query(`CREATE SEQUENCE "${sequence}"`)
    await c.query(`INSERT INTO record_numbers SELECT $1,id::text,row_number() OVER(ORDER BY ${table.has_created?'created_at NULLS LAST,':''}id) FROM "${name}"`,[name])
    const total=(await c.query('SELECT count(*)::int AS n FROM record_numbers WHERE table_name=$1',[name])).rows[0].n
    await c.query('SELECT setval($1::regclass,$2,false)',[sequence,total+1])
    await c.query(`CREATE TRIGGER record_number_insert AFTER INSERT OR UPDATE OF id ON "${name}" FOR EACH ROW EXECUTE FUNCTION assign_record_number('${sequence}')`)
  }
  await c.query('INSERT INTO schema_versions(version) VALUES(11)')
}
