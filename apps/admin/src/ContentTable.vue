<script setup lang="ts">
import { Pencil } from 'lucide-vue-next'
defineProps<{rows:any[],exams:any[]}>()
const emit=defineEmits<{edit:[row:any]}>()
const labels:Record<string,string>={draft:'草稿',review:'审核中',published:'已发布',offline:'已下架'}
const stateColor=(s:string)=>s==='published'?'success':s==='review'?'warning':'info'
const formatDate=(v:any)=>v?new Date(v).toLocaleString('zh-CN',{hour12:false}):'—'
</script>
<template><el-table :data="rows" row-key="id"><el-table-column label="标题" min-width="340"><template #default="{row}"><button class="table-title" @click="emit('edit',row)">{{ row.title }}</button></template></el-table-column><el-table-column label="考试" width="140"><template #default="{row}">{{ exams.find(x=>x.id===row.exam_id)?.name||'全平台' }}</template></el-table-column><el-table-column label="状态" width="105"><template #default="{row}"><el-tag :type="stateColor(row.status)" effect="light">{{ labels[row.status] }}</el-tag></template></el-table-column><el-table-column label="数据来源" width="105"><template #default="{row}"><span :class="row.is_test_data?'test-label':'source-label'">{{ row.is_test_data?'测试内容':'真实资料' }}</span></template></el-table-column><el-table-column label="更新时间" width="180"><template #default="{row}">{{ formatDate(row.updated_at) }}</template></el-table-column><el-table-column label="操作" width="75" fixed="right"><template #default="{row}"><el-tooltip content="编辑内容"><el-button link type="primary" aria-label="编辑内容" @click="emit('edit',row)"><Pencil :size="17" /></el-button></el-tooltip></template></el-table-column></el-table></template>
