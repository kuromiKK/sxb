import assert from 'node:assert/strict'
import test from 'node:test'
import { introText } from '../apps/admin/src/utils/intro-text.ts'

test('exam intro accepts plain text, empty values and malformed legacy JSON', () => {
  assert.equal(introText('普通考试简介'), '普通考试简介')
  assert.equal(introText(null), '')
  assert.equal(introText(''), '')
  assert.equal(introText('{旧版简介'), '{旧版简介')
})

test('exam intro extracts nested rich text without JSON syntax or HTML execution', () => {
  const doc = { type: 'doc', content: [
    { type: 'paragraph', content: [
      { type: 'text', text: '初级', marks: [{ type: 'bold' }] },
      { type: 'text', text: '社会工作师' }
    ] },
    { type: 'bulletList', content: [{ type: 'listItem', content: [
      { type: 'paragraph', content: [{ type: 'text', text: '考试说明' }] }
    ] }] }
  ] }
  assert.equal(introText(doc), '初级社会工作师\n考试说明')
  assert.equal(introText(JSON.stringify(doc)), introText(doc))
  assert.equal(introText({type:'doc', content:[]}), '')
  assert.equal(introText({type:'text', text:'<script>demo</script>'}), '<script>demo</script>')
})
