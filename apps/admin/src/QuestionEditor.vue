<script setup lang="ts">
import ContentOrigin from './ContentOrigin.vue'
import { computed, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { request, send } from './api'
import { initialValues, legacyValues, type TypeRecord } from '../../shared/question-types'
import QuestionFields from './QuestionFields.vue'
import KnowledgePointPicker from './KnowledgePointPicker.vue'
import RecordIdentifier from './RecordIdentifier.vue'
const props=defineProps<{exams:any[]}>(),emit=defineEmits(['saved'])
const visible=ref(false),loading=ref(false),saving=ref(false),error=ref(''),row=ref<any>({}),types=ref<TypeRecord[]>([]),selected=ref<TypeRecord|null>(null),options=ref<any[]>([])
const typeId=ref('')
const latestType=computed(()=>types.value.find(t=>t.id===typeId.value))
async function upgrade(){if(!latestType.value||!selected.value)return;try{await ElMessageBox.confirm('更新到最新题型版本；保留标识相同的组件内容，新增必填项需补充。','更新题型版本',{confirmButtonText:'更新版本',cancelButtonText:'取消'})}catch{return};selected.value=cloneQuestionData(latestType.value);row.value.payload.values={...initialValues(selected.value.definition),...row.value.payload.values}}
async function open(record?:any){
  visible.value=true;loading.value=true;error.value='';selected.value=null
  row.value=record?cloneQuestionData(record):{id:crypto.randomUUID(),kind:'question',exam_id:props.exams[0]?.id||null,parent_id:null,title:'',status:'draft',source:'manual',is_test_data:false,grade:null,payload:{}}
  row.value.payload.knowledgePointIds=row.value.payload.knowledgePointIds||[row.value.parent_id].filter(Boolean)
  try{
    [types.value,options.value]=await Promise.all([request('/admin/question-types'),request('/admin/content-options')])
    typeId.value=record?(record.payload.templateId||record.payload.type):types.value.find(t=>t.enabled)?.id||''
    if(record){
      selected.value=await request(`/admin/question-types/${typeId.value}/versions/${record.payload.templateVersion||1}`)
      if(record.payload.type==='configured')selected.value!.definition=cloneQuestionData(record.payload.definition)
      row.value.payload.values=legacyValues(cloneQuestionData(row.value.payload),selected.value!.definition)
    }else if(typeId.value){selected.value=types.value.find(t=>t.id===typeId.value)!;row.value.payload.values=initialValues(selected.value.definition)}
  }catch(e:any){error.value=e.message}finally{loading.value=false}
}
async function changeType(next:string){
  if(selected.value){try{await ElMessageBox.confirm('切换题型将重置题型组件中的内容，标题与知识点关联会保留。','切换题型',{confirmButtonText:'切换',cancelButtonText:'取消'})}catch{typeId.value=selected.value.id;return}}
  selected.value=cloneQuestionData(types.value.find(t=>t.id===next)!);row.value.payload.values=initialValues(selected.value.definition)
}
async function save(){
  if(saving.value||!selected.value)return;error.value='';saving.value=true
  try{
    if(!row.value.title.trim())throw new Error('请填写题目标题')
    if(!row.value.exam_id||!row.value.payload.knowledgePointIds.length)throw new Error('请选择考试并关联知识点')
    const r=cloneQuestionData(row.value);r.parent_id=r.payload.knowledgePointIds.includes(r.parent_id)?r.parent_id:r.payload.knowledgePointIds[0]
    r.payload={...r.payload,type:'configured',templateId:selected.value.id,templateVersion:selected.value.version,stem:r.title,knowledgePointId:r.parent_id}
    await send('/admin/content/'+r.id,r,'PUT');visible.value=false;ElMessage.success('题目已保存');emit('saved')
  }catch(e:any){error.value=e.message}finally{saving.value=false}
}
// JSON API records can contain nested Vue proxies; snapshot them recursively.
function cloneQuestionData<T>(value:T):T{return JSON.parse(JSON.stringify(value))}
defineExpose({open})
</script>
<template><el-drawer v-model="visible" :title="row.version?'编辑题目':'新增题目'" size="760px" class="editor-drawer" :close-on-click-modal="false" :close-on-press-escape="!saving" :before-close="(done:()=>void)=>{if(!saving)done()}" destroy-on-close><div v-loading="loading"><el-alert v-if="error" :title="error" type="error" :closable="false"/><el-form v-if="!loading" label-position="top"><RecordIdentifier v-if="row.version" :id="row.id" table="questions"/><el-form-item label="题目标题" required><el-input v-model="row.title" type="textarea" :rows="2" placeholder="用于题目列表检索；各小题内容在下方录入" maxlength="2000"/></el-form-item><div class="form-columns"><el-form-item label="所属考试" required><el-select v-model="row.exam_id" :disabled="!!row.version" @change="row.parent_id=null;row.payload.knowledgePointIds=[]"><el-option v-for="e in exams" :key="e.id" :label="e.name" :value="e.id"/></el-select></el-form-item><el-form-item label="题型" required><el-select v-model="typeId" @change="changeType"><el-option v-for="t in types" :key="t.id" :label="t.name" :value="t.id" :disabled="!t.enabled"/></el-select></el-form-item></div><p v-if="selected" class="qe-version">{{selected.name}} · v{{selected.version}} · 按此版本配置录入 <el-button v-if="latestType && selected.version < latestType.version" link type="primary" @click="upgrade">更新至 v{{latestType.version}}</el-button></p><el-form-item label="关联知识点" required><KnowledgePointPicker v-model="row.payload.knowledgePointIds" :nodes="options" :exam-id="row.exam_id" :disabled="saving"/></el-form-item><div class="form-columns"><el-form-item label="等级"><el-select v-model="row.grade" clearable placeholder="未设置" @clear="row.grade=null"><el-option v-for="g in ['A','B','C','D','E']" :key="g" :label="g+'级'" :value="g"/></el-select></el-form-item><el-form-item label="状态"><el-select v-model="row.status"><el-option label="草稿" value="draft"/><el-option label="审核中" value="review"/><el-option label="已发布" value="published"/><el-option label="已下架" value="offline"/></el-select></el-form-item></div><div class="qe-content"><QuestionFields v-if="selected&&row.payload.values" :fields="selected.definition.fields" :values="row.payload.values"/></div><div class="form-columns"><el-form-item label="真题年份"><el-input v-model="row.payload.year" placeholder="非真题可留空"/></el-form-item><el-form-item label="真题"><el-switch :model-value="row.payload.source==='真题'" @change="row.payload.source=$event?'真题':''"/></el-form-item></div><el-form-item label="来源"><ContentOrigin :id="row.id" :source="row.source"/></el-form-item><el-form-item label="测试内容"><el-switch v-model="row.is_test_data"/></el-form-item></el-form></div><template #footer><el-button :disabled="saving" @click="visible=false">取消</el-button><el-button type="primary" :loading="saving" :disabled="loading||!selected" @click="save">保存题目</el-button></template></el-drawer></template>
<style scoped>.qe-version{margin:-6px 0 20px;font-size:12px;color:var(--muted)}.qe-content{border-top:1px solid var(--line);padding-top:24px;margin-top:8px}</style>
