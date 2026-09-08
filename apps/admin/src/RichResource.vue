<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'
import { FileText } from 'lucide-vue-next'
import { send } from './api'
const props=defineProps(nodeViewProps)
const url=ref('');const error=ref('')
onMounted(async()=>{try{url.value=(await send(`/admin/media/${props.node.attrs.assetId}/ticket`,{})).url}catch(e:any){error.value=e.message}})
</script>
<template><NodeViewWrapper class="rich-resource" contenteditable="false"><p class="resource-title">{{ node.attrs.title }}</p><img v-if="url&&node.attrs.kind==='image'" :src="url" :alt="node.attrs.title" /><video v-else-if="url&&node.attrs.kind==='video'" :src="url" controls preload="metadata" /><audio v-else-if="url&&node.attrs.kind==='audio'" :src="url" controls preload="metadata" /><a v-else-if="url" :href="url" target="_blank" rel="noreferrer"><FileText :size="18" />{{ node.attrs.title }}</a><span v-if="error" role="alert">{{ error }}</span></NodeViewWrapper></template>
<style scoped>.rich-resource{margin:16px 0;padding:12px;border:1px solid #dce3eb;border-radius:6px;background:#f8fafc;overflow:hidden}.resource-title{font-size:14px;color:#475569;overflow-wrap:anywhere}.rich-resource img,.rich-resource video{display:block;width:100%;max-height:320px;object-fit:contain}.rich-resource audio{width:100%}.rich-resource a{display:flex;align-items:center;gap:8px;color:#2563eb}</style>
