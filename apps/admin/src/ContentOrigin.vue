<script setup lang="ts">
import {ref,watch} from 'vue'
import {request,send} from './api'
import ImportWizard from './ImportWizard.vue'
const importer=ref<InstanceType<typeof ImportWizard>>(),exams=ref<any[]>([])
async function showJob(jobId:string){try{exams.value=await request('/admin/exam-projects');await importer.value?.open({jobId})}catch(e:any){error.value=e.message}}
const props=defineProps<{id:string;source?:string}>(),rows=ref<any[]>([]),error=ref(''),busy=ref(false)
let revision=0
watch(()=>props.id,async id=>{const rev=++revision;rows.value=[];error.value='';if(!id)return;try{const result=await request('/admin/content-origins/'+encodeURIComponent(id));if(rev===revision)rows.value=result}catch(e:any){if(rev===revision)error.value=e.message}},{immediate:true})
async function download(asset:string){busy.value=true;error.value='';try{const result=await send('/admin/resources/'+asset+'/preview',{});const a=document.createElement('a');a.href=result.downloadUrl;a.click()}catch(e:any){error.value=e.message}finally{busy.value=false}}
</script>
<template><ImportWizard ref="importer" :exams="exams"/><div class="content-origin"><span v-if="!rows.length">{{source==='manual'?'手工录入':source||'手工录入'}}</span><div v-for="r in rows" :key="r.id"><el-button link type="primary" :disabled="busy" @click="download(r.asset_id)">{{r.filename}}</el-button><small>{{r.sheet}} · 第 {{r.line}} 行 · {{new Date(r.imported_at).toLocaleString('zh-CN')}}</small><small>资源 ID：{{r.asset_id}}</small><el-button link type="primary" @click="showJob(r.job_id)">查看导入结果</el-button><small>导入批次：{{r.job_id}}</small></div><p v-if="error" role="alert">{{error}}</p></div></template>
<style scoped>.content-origin{line-height:1.7;overflow-wrap:anywhere}.content-origin>div{padding:6px 0}.content-origin small{display:block;color:var(--el-text-color-secondary)}.content-origin p{color:var(--el-color-danger)}</style>
