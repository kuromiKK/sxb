// One-time, AST-based typography migration. Existing spacing and content are retained.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { parse } from '@vue/compiler-sfc'
import postcss from 'postcss'

const base = 'apps/user/src/pages'
let declarations = 0
const files = readdirSync(base).filter(name => !['index','courses'].includes(name)).map(name => `${base}/${name}/index.vue`)
files.push('apps/user/src/components/knowledge/SectionMindMap.vue', 'apps/user/src/components/knowledge/PriorityLearningRoute.vue')
for (const file of files) {
  const poster = file.includes('/monthly-report/')
  const component = file.includes('/components/')
  const source = readFileSync(file, 'utf8')
  const { descriptor } = parse(source)
  const edits = []
  for (const style of descriptor.styles) {
    const css = postcss.parse(style.content)
    const editable = decl => !poster || decl.source.start.offset < style.content.indexOf('.multi-page')
    css.walkDecls('font-size', decl => {
      if (!editable(decl)) return
      const match = /^(\d+)rpx$/.exec(decl.value)
      if (!match) return
      const size = Number(match[1])
      if (size > 60) return
      const value = size <= 18 ? 'meta' : size <= 20 ? 'small' : size <= 24 ? 'body' : size <= 26 ? 'item' : size <= 30 ? 'title' : size <= 36 ? 'heading' : size <= 42 ? 'page' : 'display'
      decl.value = `var(--sxb-text-${value})`
      declarations++
    })
    css.walkDecls('letter-spacing', decl => { if (editable(decl)) decl.value = '0' })
    css.walkDecls('font-weight', decl => { if (editable(decl) && Number(decl.value) > 700) decl.value = '700' })
    const extra = poster || component || style.content.includes("@import '@/styles/content-system.scss'") ? '' : "\n@import '@/styles/content-system.scss';\n"
    edits.push({ start: style.loc.start.offset, end: style.loc.end.offset, text: css.toString() + extra })
  }
  let result = source
  for (const edit of edits.reverse()) result = result.slice(0, edit.start) + edit.text + result.slice(edit.end)
  result = result.replace(/<style lang="scss">/g, '<style scoped lang="scss">')
  writeFileSync(file, result)
}
console.log(`Migrated ${declarations} typography declarations; report poster geometry retained.`)
