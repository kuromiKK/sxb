import { writeRecord, deleteRecord } from '@/services/api'
export type NoteSourceType = 'question' | 'knowledge' | 'course'

export type NoteRecord = {
  id: string
  sourceId: string
  sourceType: NoteSourceType
  content: string
  createdAt: number
  updatedAt: number
}

const RECORDS_KEY = 'sxb-note-records'

const legacyKey = (sourceId: string, sourceType: NoteSourceType) => `sxb-${sourceType === 'question' ? 'question' : sourceType === 'knowledge' ? 'knowledge' : 'course'}-note-${sourceId}`

const createNoteId = () => `note-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

const writeNotes = (notes: NoteRecord[]) => uni.setStorageSync(RECORDS_KEY, notes)

export const getNotes = (): NoteRecord[] => {
  const saved = uni.getStorageSync(RECORDS_KEY)
  return Array.isArray(saved) ? saved.filter(item => item?.id && item?.sourceId && item?.content) : []
}

export const getNoteBySource = (sourceId: string, sourceType: NoteSourceType) => getNotes().find(item => item.sourceId === sourceId && item.sourceType === sourceType)

export const getNoteById = (id: string) => getNotes().find(item => item.id === id)

export const saveNoteRecord = async (sourceId: string, sourceType: NoteSourceType, content: string) => {
  const value = content.trim()
  if (!value) return undefined
  const notes = getNotes()
  const existing = notes.find(item => item.sourceId === sourceId && item.sourceType === sourceType)
  const now = Date.now()
  const record: NoteRecord = existing
    ? { ...existing, content: value, updatedAt: now }
    : { id: createNoteId(), sourceId, sourceType, content: value, createdAt: now, updatedAt: now }
  await writeRecord('note', `${sourceType}:${sourceId}`, record)
  writeNotes([...notes.filter(item => item.id !== record.id), record])
  uni.setStorageSync(legacyKey(sourceId, sourceType), value)
  return record
}

export const removeNotes = async (ids: string[]) => {
  const idSet = new Set(ids)
  const notes = getNotes()
  for (const item of notes.filter(item => idSet.has(item.id))) await deleteRecord('note', `${item.sourceType}:${item.sourceId}`)
  notes.filter(item => idSet.has(item.id)).forEach(item => uni.removeStorageSync(legacyKey(item.sourceId, item.sourceType)))
  const remaining = notes.filter(item => !idSet.has(item.id))
  writeNotes(remaining)
  return remaining
}

export const migrateLegacyNotes = (sources: Array<{ sourceId: string; sourceType: NoteSourceType }>) => {
  let notes = getNotes()
  const now = Date.now()
  sources.forEach((source, index) => {
    if (notes.some(item => item.sourceId === source.sourceId && item.sourceType === source.sourceType)) return
    const content = uni.getStorageSync(legacyKey(source.sourceId, source.sourceType))
    if (typeof content !== 'string' || !content.trim()) return
    notes.push({ id: createNoteId(), ...source, content: content.trim(), createdAt: now - index * 1000, updatedAt: now - index * 1000 })
  })
  writeNotes(notes)
  return notes
}
