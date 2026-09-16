import {PGlite} from '@electric-sql/pglite'
import {randomBytes,createHash,randomUUID} from 'node:crypto'
// Only for isolated account/role fixtures; the full challenge flow is tested separately.
// Never generate login proofs for the real local PostgreSQL database.
export async function isolatedAdminProof(phone:string){
 const {db,database}=await import('../../apps/api/src/db.ts')
 if(!(await database() instanceof PGlite)||!process.env.LOCAL_DATABASE_DIR?.includes('sxb-'))throw Error('Requires isolated PGlite fixture')
 const hash=(value:string)=>createHash('sha256').update(value).digest('hex'),proof=randomBytes(32).toString('hex')
 await db.query("INSERT INTO verification_challenges(id,binding,scope,upstream_key,expires_at,claimed,proof_hash,proof_expires_at) VALUES($1,$2,'admin-login','fixture',now()+interval '1 minute',true,$3,now()+interval '1 minute')",[randomUUID(),hash('admin-login:'+phone+':127.0.0.1'),hash(proof)])
 return proof
}
