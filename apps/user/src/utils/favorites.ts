export type FavoriteType = 'knowledge' | 'course' | 'question'

export type FavoriteRecord = {
  id: string
  type: FavoriteType
  createdAt: number
}

const RECORDS_KEY = 'sxb-favorite-records'
const LEGACY_KEY = 'sxb-favorite-items'
const DEFAULT_IDS = ['kp-1-1-1', 'course-ability-section-1-1', 'q-001']

export const inferFavoriteType = (id: string): FavoriteType => {
  if (id.startsWith('q-')) return 'question'
  if (id.startsWith('course-')) return 'course'
  return 'knowledge'
}

const writeFavoriteRecords = (records: FavoriteRecord[]) => {
  uni.setStorageSync(RECORDS_KEY, records)
  uni.setStorageSync(LEGACY_KEY, records.map(item => item.id))
}

export const getFavoriteRecords = (): FavoriteRecord[] => {
  const records = uni.getStorageSync(RECORDS_KEY)
  const legacy = uni.getStorageSync(LEGACY_KEY)
  const legacyIds = Array.isArray(legacy) ? legacy.map(String) : []
  if (Array.isArray(records)) {
    const normalized = records
      .filter(item => item?.id)
      .map(item => ({ id: String(item.id), type: item.type || inferFavoriteType(String(item.id)), createdAt: Number(item.createdAt) || Date.now() })) as FavoriteRecord[]
    const recordIds = new Set(normalized.map(item => item.id))
    const additions = legacyIds.filter(id => !recordIds.has(id)).map((id, index) => ({ id, type: inferFavoriteType(id), createdAt: Date.now() + index }))
    const legacySet = new Set(legacyIds)
    const synced = legacyIds.length ? [...normalized.filter(item => legacySet.has(item.id)), ...additions] : normalized
    if (additions.length || synced.length !== normalized.length) writeFavoriteRecords(synced)
    return synced
  }
  const ids = legacyIds.length ? legacyIds : DEFAULT_IDS
  const now = Date.now()
  const migrated = ids.map((id, index) => ({ id, type: inferFavoriteType(id), createdAt: now - index * 1000 }))
  writeFavoriteRecords(migrated)
  return migrated
}

export const getFavoriteIds = () => getFavoriteRecords().map(item => item.id)

export const setFavorite = (id: string, type: FavoriteType, favorite: boolean) => {
  const records = getFavoriteRecords().filter(item => item.id !== id)
  if (favorite) records.push({ id, type, createdAt: Date.now() })
  writeFavoriteRecords(records)
  return records
}

export const removeFavorites = (ids: string[]) => {
  const idSet = new Set(ids)
  const records = getFavoriteRecords().filter(item => !idSet.has(item.id))
  writeFavoriteRecords(records)
  return records
}
