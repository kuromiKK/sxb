<script setup lang="ts">
import { ref, watch } from 'vue'
import { request } from './api'
const props=defineProps<{node:any}>()
const emit=defineEmits<{edit:[row:any]}>()
const courses=ref<any[]>([]),error=ref(''),busy=ref(false),page=ref(1),total=ref(0)
async function load(){busy.value=true;error.value='';try{const result=await request(`/admin/content?kind=course&page=${page.value}&parentId=${encodeURIComponent(props.node.id)}&examId=${encodeURIComponent(props.node.exam_id)}`);courses.value=result.items;total.value=result.total}catch(e:any){error.value=e.message}finally{busy.value=false}}
function create(){emit('edit',{id:crypto.randomUUID(),kind:'course',exam_id:props.node.exam_id,parent_id:props.node.id,title:'',status:'draft',payload:{type:'article',requiredLevel:'vip'},source:'manual',is_test_data:props.node.is_test_data})}
watch(()=>props.node.id,()=>{page.value=1;void load()},{immediate:true})
</script>
<template><div v-loading="busy"><el-alert v-if="error" :title="error" type="error" :closable="false"/><div class="table-toolbar"><strong>{{node.kind==='section'?'本节精品课程':'知识点配套课程'}}</strong><el-button type="primary" @click="create">新增课程</el-button></div><el-table :data="courses" empty-text="暂未配置课程"><el-table-column prop="title" label="课程名称"/><el-table-column label="状态" width="100"><template #default="{row}">{{({draft:'草稿',review:'审核中',published:'已发布',offline:'已下架'} as any)[row.status]}}</template></el-table-column><el-table-column label="操作" width="80"><template #default="{row}"><el-button link type="primary" @click="emit('edit',row)">编辑</el-button></template></el-table-column></el-table><el-pagination v-if="total>20" v-model:current-page="page" :page-size="20" :total="total" layout="prev, pager, next" @current-change="load" /></div></template>
