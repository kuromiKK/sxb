<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Trash2 } from 'lucide-vue-next'
import { request, send } from './api'
import RichEditor from './RichEditor.vue'
import RecordIdentifier from './RecordIdentifier.vue'
import CourseAssetPicker from './CourseAssetPicker.vue'
const emit=defineEmits<{saved:[]}>()
const visible=ref(false),row=ref<any>({payload:{}}),parent=ref<any>({}),saving=ref(false),error=ref(''),busy=ref<Record<string,boolean>>({})
const legacyHandout=ref<any>(null)
const uploading=computed(()=>Object.values(busy.value).some(Boolean)),label=computed(()=>parent.value.kind==='section'?'精品课':'配套课')
async function open(value:any){
 try{const options=await request('/admin/content-options');parent.value=options.find((n:any)=>n.id===value.parent_id);if(!parent.value)throw new Error('请先保存所属节或知识点');row.value=JSON.parse(JSON.stringify(value));row.value.payload.type ||= 'article';row.value.payload.handouts ||= [];legacyHandout.value=null;if(value.version&&!row.value.payload.handouts.length&&!row.value.payload.removeLegacyHandout){const result=await request('/admin/content?kind=handout&parentId='+encodeURIComponent(value.id));legacyHandout.value=result.items.find((h:any)=>h.status!=='offline')}if(!row.value.payload.document&&!row.value.payload.content&&row.value.payload.articleSections)row.value.payload.content=row.value.payload.articleSections.flatMap((s:any)=>[s.title,...(s.paragraphs||[])]).join('\n');busy.value={};error.value='';visible.value=true}catch(e:any){ElMessage.error(e.message)}
}
async function save(){if(saving.value||uploading.value)return;error.value='';if(!row.value.title.trim()){error.value='请填写课程标题';return}saving.value=true;try{const data=JSON.parse(JSON.stringify(row.value));data.payload.sectionName=data.title;await send('/admin/content/'+data.id,data,'PUT');visible.value=false;emit('saved');ElMessage.success(label.value+'已保存')}catch(e:any){error.value=e.message}finally{saving.value=false}}
async function remove(){
 try{await ElMessageBox.confirm('删除后，该课程将从列表和前端移除。是否继续？','删除'+label.value,{type:'warning',confirmButtonText:'删除',cancelButtonText:'取消'})}catch{return}
 saving.value=true;error.value='';try{await send('/admin/courses/'+row.value.id,{version:row.value.version},'DELETE');visible.value=false;emit('saved');ElMessage.success('课程已删除')}catch(e:any){error.value=e.message}finally{saving.value=false}
}
function close(done:()=>void){if(!uploading.value&&!saving.value)done()}
defineExpose({open})
</script>
<template>
 <el-drawer v-model="visible" :title="(row.version?'编辑':'新增')+label" size="720px" class="course-editor-drawer" :close-on-click-modal="false" :before-close="close">
  <el-form v-if="visible" label-position="top" class="editor-form">
   <RecordIdentifier v-if="row.version" :id="row.id" :table="parent.kind==='section'?'premium_courses':'knowledge_courses'"/>
   <el-form-item label="标题" required><el-input v-model="row.title" aria-label="课程标题" maxlength="2000"/></el-form-item>
   <el-form-item :label="parent.kind==='section'?'所属节':'所属知识点'"><el-input :model-value="parent.title" aria-label="课程归属" disabled type="textarea" autosize/></el-form-item>
   <el-form-item label="发布状态"><el-select v-model="row.status" aria-label="课程发布状态"><el-option v-for="(text,key) in {draft:'草稿',review:'审核中',published:'已发布',offline:'停用'}" :key="key" :value="key" :label="text"/></el-select></el-form-item>
   <el-form-item label="简介"><el-input v-model="row.payload.intro" aria-label="课程简介" type="textarea" :rows="3"/></el-form-item>
   <el-form-item label="课程类型" required><el-radio-group v-model="row.payload.type" aria-label="课程类型" :disabled="uploading" @change="row.payload.mediaAssetId='';row.payload.mediaUrl='' "><el-radio-button value="article">图文</el-radio-button><el-radio-button value="video">视频</el-radio-button><el-radio-button value="audio">音频</el-radio-button></el-radio-group></el-form-item>
   <el-form-item v-if="row.payload.type==='article'" label="正文"><RichEditor :key="row.id" v-model="row.payload.document" :plain-text="row.payload.content" :exam-id="row.exam_id" :content-id="row.id" :allow-media="false" :allow-images="true" :allow-handouts="false" @busy="busy.document=$event"/></el-form-item>
   <template v-else>
    <el-form-item :label="row.payload.type==='video'?'视频':'音频'"><CourseAssetPicker :key="row.id+row.payload.type" v-model="row.payload.mediaAssetId" :kind="row.payload.type" :label="row.payload.type==='video'?'视频':'音频'" :exam-id="row.exam_id" :content-id="row.id" :legacy-url="row.payload.mediaUrl" @clear="row.payload.mediaUrl=''" @busy="busy.media=$event"/></el-form-item>
    <el-form-item v-if="row.payload.type==='video'" label="封面图"><CourseAssetPicker :key="row.id+'cover'" v-model="row.payload.posterAssetId" kind="image" label="封面图" :exam-id="row.exam_id" :content-id="row.id" @busy="busy.poster=$event"/></el-form-item>
    <el-form-item label="时长（分钟）"><el-input-number v-model="row.payload.totalMinutes" aria-label="时长（分钟）" :min="0" :max="100000" :precision="2"/></el-form-item>
   </template>
   <el-form-item label="上传讲义"><CourseAssetPicker :key="row.id+'handout'" :model-value="row.payload.handouts[0]?.assetId" kind="handout" label="讲义" :exam-id="row.exam_id" :content-id="row.id" :legacy-url="row.payload.downloadUrl||legacyHandout?.id" @update:model-value="row.payload.handouts=$event?[{assetId:$event,title:(row.title||'课程').slice(0,190)+' · 讲义'}]:[]" @clear="row.payload.downloadUrl='';row.payload.removeLegacyHandout=true;legacyHandout=null" @busy="busy.handout=$event"/></el-form-item>
   <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon/>
  </el-form>
  <template #footer><div class="course-footer"><el-button v-if="row.version" type="danger" plain :disabled="saving||uploading" @click="remove"><Trash2 :size="16"/>删除{{label}}</el-button><div><el-button :disabled="saving||uploading" @click="visible=false">取消</el-button><el-button type="primary" :loading="saving" :disabled="uploading" @click="save">保存{{label}}</el-button></div></div></template>
 </el-drawer>
</template>
<style scoped>.course-footer{display:flex;justify-content:space-between;align-items:center;gap:12px}.course-footer>div{margin-left:auto;display:flex;gap:10px}.course-footer .el-button+.el-button{margin:0}.course-footer svg{margin-right:5px}.editor-form :deep(.el-select){width:100%}</style>
