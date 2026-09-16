<script setup lang="ts">
import {computed} from 'vue'
import {generateHTML} from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import {Table,TableRow,TableHeader,TableCell} from '@tiptap/extension-table'
const props=defineProps<{document?:any}>()
const html=computed(()=>{
  if(!props.document?.content?.length)return ''
  try{return generateHTML(props.document,[StarterKit.configure({link:false,codeBlock:false}),Image,Table,TableRow,TableHeader,TableCell])}catch{return ''}
})
</script>
<template><div class="product-document" v-html="html"/></template>
<style scoped>
.product-document{font-size:13px;line-height:1.8;overflow-wrap:anywhere;min-width:0}.product-document :deep(img){display:block;max-width:100%;height:auto;border-radius:6px}.product-document :deep(p){margin:8px 0}.product-document :deep(h2){font-size:18px;line-height:1.5}.product-document :deep(h3){font-size:16px}.product-document :deep(table){width:100%;border-collapse:collapse;table-layout:fixed}.product-document :deep(td),.product-document :deep(th){border:1px solid var(--el-border-color);padding:6px}.product-document :deep(ul),.product-document :deep(ol){padding-left:20px}.product-document :deep(blockquote){border-left:3px solid var(--el-border-color);margin:12px 0;padding-left:12px;color:var(--el-text-color-secondary)}
</style>
