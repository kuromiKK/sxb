import 'dotenv/config'
import { PGlite } from '@electric-sql/pglite'
import pg from 'pg'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

export type Queryable = { query: (sql: string, values?: any[]) => Promise<{ rows: any[] }> }
let driver: PGlite | pg.Pool
let initializing: Promise<PGlite | pg.Pool> | undefined
export async function database() {
  if (!initializing) initializing = (async () => {
    if (process.env.DATABASE_URL) driver = new pg.Pool({ connectionString: process.env.DATABASE_URL })
    else {
      if (process.env.APP_MODE === 'production') throw new Error('Production requires DATABASE_URL')
      const path = resolve(process.env.LOCAL_DATABASE_DIR || '.local/database')
      await mkdir(path, { recursive: true })
      driver = new PGlite(path)
      await driver.waitReady
    }
    return driver
  })()
  return initializing
}
export const db: Queryable = { async query(sql, values = []) { const d = await database(); return d instanceof PGlite ? d.query(sql, values) : d.query(sql, values) } }
export async function transaction<T>(fn: (connection: Queryable) => Promise<T>): Promise<T> {
  const d = await database()
  if (d instanceof PGlite) return d.transaction(tx => fn(tx as Queryable))
  const c = await d.connect()
  try { await c.query('BEGIN'); const value = await fn(c); await c.query('COMMIT'); return value }
  catch (error) { await c.query('ROLLBACK'); throw error }
  finally { c.release() }
}
export async function closeDatabase() { if (driver instanceof PGlite) await driver.close(); else if (driver) await driver.end() }
