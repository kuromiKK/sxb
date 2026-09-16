import { mkdir, writeFile, unlink } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { transaction } from './db.ts'
import { resourceInventory } from './resource-index.ts'
import { lockResourceReferences } from './editor-images.ts'

// Preserve historical JSON snapshots byte-for-byte. The hash links legacy data URLs
// to the registered file so cleanup still sees every historical reference.
export async function migrateRegisteredImages() {
  const written: string[] = []
  try {
    await transaction(async c => {
      await c.query('LOCK TABLE schema_versions IN EXCLUSIVE MODE')
      if ((await c.query('SELECT 1 FROM schema_versions WHERE version=19')).rows.length) return
      await lockResourceReferences(c)
      await c.query('ALTER TABLE media_assets ADD COLUMN legacy_image_hash text UNIQUE')
      const images = (await resourceInventory(c)).filter(r => r.storage === 'embedded')
      if (images.length) {
        const owner = (await c.query("SELECT id FROM users WHERE account_kind='admin' ORDER BY created_at,id LIMIT 1")).rows[0]
        if (!owner) throw new Error('历史图片登记需要一个现有管理员账号')
        const directory = resolve(process.env.MEDIA_DIR || '.local/media')
        await mkdir(directory, { recursive: true })
        for (const image of images) {
          const assetId = randomUUID(), diskName = randomUUID(), path = join(directory, diskName)
          const bytes = Buffer.from(image.data!.slice(image.data!.indexOf(',') + 1), 'base64')
          await writeFile(path, bytes, { flag: 'wx' }); written.push(path)
          await c.query(`INSERT INTO media_assets(id,exam_id,content_id,owner_id,kind,source,filename,mime,size_bytes,disk_name,legacy_image_hash)
            VALUES($1,NULL,$2,$3,'image','upload',$4,$5,$6,$7,$8)`,
          [assetId,image.references[0].id,owner.id,image.filename.slice(0,200),image.mime,bytes.length,diskName,image.id.slice('embedded-'.length)])
          const url = '/api/message-images/' + assetId
          // Only current covers change storage representation; snapshots keep their original contents.
          await c.query('UPDATE products SET cover_url=$1 WHERE cover_url=$2', [url,image.data])
          await c.query("UPDATE knowledge_nodes SET cover_url=$1 WHERE kind='exam' AND cover_url=$2", [url,image.data])
          await c.query('UPDATE exam_categories SET cover_url=$1 WHERE cover_url=$2', [url,image.data])
        }
      }
      await c.query('INSERT INTO schema_versions(version) VALUES(19)')
    })
  } catch (error) {
    await Promise.all(written.map(path => unlink(path).catch(() => {})))
    throw error
  }
}
