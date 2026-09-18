import 'dotenv/config'
import {db,closeDatabase} from '../apps/api/src/db.ts'
const tables=(await db.query("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND column_name IN ('is_test_data','is_test') AND table_name IN(SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE') ORDER BY table_name")).rows
for(const t of tables){const r=(await db.query(`SELECT count(*)::int AS total,count(*) FILTER(WHERE ${t.column_name})::int AS test FROM ${t.table_name}`)).rows[0];console.log(t.table_name,t.column_name,JSON.stringify(r))}
console.log('content',JSON.stringify((await db.query('SELECT kind,is_test_data,count(*)::int AS n FROM content GROUP BY kind,is_test_data ORDER BY kind')).rows))
console.log('dependencies',JSON.stringify((await db.query("SELECT conrelid::regclass::text AS child,confrelid::regclass::text AS parent,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE contype='f' AND connamespace='public'::regnamespace ORDER BY 2,1")).rows))
await closeDatabase()
