/** Extract readable text from the plain-text or Tiptap JSON used by exam intros. */
export function introText(value: unknown): string {
  if (typeof value === 'string') {
    const text = value.trim()
    if (!text) return ''
    try {
      const parsed = JSON.parse(text)
      if (parsed && (typeof parsed === 'object' || typeof parsed === 'string')) return introText(parsed)
    } catch { /* Existing plain text remains readable. */ }
    return text
  }
  if (!value || typeof value !== 'object') return ''
  if (Array.isArray(value)) return value.map(introText).filter(Boolean).join('\n')
  const node = value as { type?: string; text?: string; content?: unknown[]; attrs?: { alt?: string } }
  if (node.type === 'text') return node.text || ''
  if (node.type === 'hardBreak') return '\n'
  if (node.type === 'image') return node.attrs?.alt || ''
  if (!Array.isArray(node.content)) return ''
  return node.content.map(introText).join(
    node.type === 'paragraph' || node.type === 'heading' ? '' : '\n'
  ).trim()
}
