export type KnowledgeHandout = { assetId: string; title: string }

// Read old inline handouts without losing attachments when an existing article is edited.
export function splitKnowledgeHandouts(payload: any) {
  const handouts: KnowledgeHandout[] = [...(payload.handouts || [])]
  const content = payload.document?.content?.filter((node: any) => {
    if (node.type !== 'resource' || node.attrs?.kind !== 'handout') return true
    if (!handouts.some(item => item.assetId === node.attrs.assetId)) {
      handouts.push({ assetId: node.attrs.assetId, title: node.attrs.title })
    }
    return false
  })
  return { handouts, document: payload.document ? { ...payload.document, content } : undefined }
}
