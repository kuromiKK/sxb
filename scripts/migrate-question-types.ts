import 'dotenv/config'
import assert from 'node:assert/strict'
import {db,closeDatabase} from '../apps/api/src/db.ts'
import {migrate} from '../apps/api/src/schema.ts'
// Run with the API stopped when using the local PGlite database.
const tables=['questions','knowledge_nodes','question_knowledge_points','users','answers','orders']
async function snapshot(){const result:Record<string,any>={};for(const table of tables)result[table]=(await db.query(`SELECT count(*)::int AS count,md5(string_agg(row_to_json(t)::text,'|' ORDER BY row_to_json(t)::text)) AS checksum FROM ${table} t`)).rows[0];return result}
try{const before=await snapshot();await migrate();assert.deepEqual(await snapshot(),before);console.log(JSON.stringify({migration:(await db.query('SELECT max(version) AS version FROM schema_versions')).rows[0].version,originalDataUnchanged:true,questionCount:before.questions.count,gradingService:(await db.query("SELECT enabled,config->>'mode' AS mode,encrypted_key IS NOT NULL AS has_key FROM ai_features WHERE id='grading'")).rows[0],types:(await db.query('SELECT name FROM question_types ORDER BY id')).rows}))}finally{await closeDatabase()}
