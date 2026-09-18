export const structureFields = [
  { key:'stars', label:'知识点星级', kind:'knowledge', hint:'0–5 的整数；0 表示未评级' },
  { key:'shortTitle', label:'科目短标题', kind:'subject', hint:'最多 12 个字' },
  { key:'document', label:'知识点正文', kind:'knowledge', hint:'纯文字，保留换行；更新时替换原正文' },
] as const
export type StructureField = typeof structureFields[number]['key']
export type StructureImportOptions = { mode:'create'|'update'; fields:StructureField[]; blankBehavior:'keep'|'clear' }
export const structurePathHeaders = ['科目名称','章名称','节名称','知识点名称']
export function structureHeaders(options:StructureImportOptions) {
  return [...(options.mode==='update'?['节点ID']:structurePathHeaders),...structureFields.filter(f=>options.fields.includes(f.key)).map(f=>f.label)]
}
