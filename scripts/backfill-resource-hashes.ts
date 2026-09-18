import 'dotenv/config'
import {createHash} from 'node:crypto'
import {createReadStream} from 'node:fs'
import {resolve,join} from 'node:path'
import {db,transaction,closeDatabase} from '../apps/api/src/db.ts'
import {lockResourceReferences} from '../apps/api/src/editor-images.ts'
const root=resolve(process.env.MEDIA_DIR||'.local/media')
let updated=0,missing=0
for(const a of (await db.query("SELECT id,disk_name FROM media_assets WHERE source='upload' AND file_hash IS NULL")).rows){
 if(!/^[a-f0-9-]{36}$/.test(a.disk_name))continue
 try{const h=createHash('sha256');for await(const chunk of createReadStream(join(root,a.disk_name)))h.update(chunk);const hash=h.digest('hex');await transaction(async c=>{await lockResourceReferences(c);await c.query('UPDATE media_assets SET file_hash=$2 WHERE id=$1 AND file_hash IS NULL',[a.id,hash])});updated++}catch(e:any){if(e.code!=='ENOENT')throw e;missing++}
}
console.log(JSON.stringify({updated,missing}));await closeDatabase()
