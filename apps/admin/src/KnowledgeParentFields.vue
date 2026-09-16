<script setup lang="ts">
import { computed, ref, watch } from 'vue'
const props=defineProps<{row:any;exams:any[];options:any[]}>()
const subject=ref(''),chapter=ref('')
const subjects=computed(()=>props.options.filter(n=>n.kind==='subject'&&n.exam_id===props.row.exam_id))
const chapters=computed(()=>props.options.filter(n=>n.kind==='chapter'&&n.parent_id===subject.value&&n.exam_id===props.row.exam_id))
const sections=computed(()=>props.options.filter(n=>n.kind==='section'&&n.parent_id===chapter.value&&n.exam_id===props.row.exam_id))
function restore(){
 const parent=props.options.find(n=>n.id===props.row.parent_id)
 const ch=props.row.kind==='knowledge'?props.options.find(n=>n.id===parent?.parent_id):props.row.kind==='section'?parent:undefined
 subject.value=props.row.kind==='chapter'?parent?.id||'':ch?.parent_id||''
 chapter.value=ch?.id||''
}
watch(()=>props.row.id,restore,{immediate:true})
function examChanged(){subject.value='';chapter.value='';props.row.parent_id=null}
function subjectChanged(){chapter.value='';props.row.parent_id=props.row.kind==='chapter'?subject.value||null:null}
function chapterChanged(){props.row.parent_id=props.row.kind==='section'?chapter.value||null:null}
</script>
<template>
 <div class="parent-fields">
  <el-form-item label="所属考试" required><el-select v-model="row.exam_id" aria-label="所属考试" :disabled="!!row.version" filterable placeholder="请选择考试" @change="examChanged"><el-option v-for="e in exams" :key="e.id" :label="e.name" :value="e.id"/></el-select></el-form-item>
  <el-form-item v-if="row.kind!=='subject'" label="所属科目" required><el-select v-model="subject" aria-label="所属科目" filterable clearable :disabled="!row.exam_id" :placeholder="row.exam_id?'请选择科目':'请先选择考试'" @change="subjectChanged"><el-option v-for="n in subjects" :key="n.id" :label="n.title" :value="n.id"/></el-select></el-form-item>
  <el-form-item v-if="['section','knowledge'].includes(row.kind)" label="所属章" required><el-select v-model="chapter" aria-label="所属章" filterable clearable :disabled="!subject" :placeholder="subject?'请选择章':'请先选择科目'" @change="chapterChanged"><el-option v-for="n in chapters" :key="n.id" :label="n.title" :value="n.id"/></el-select></el-form-item>
  <el-form-item v-if="row.kind==='knowledge'" label="所属节" required><el-select v-model="row.parent_id" aria-label="所属节" filterable clearable :disabled="!chapter" :placeholder="chapter?'请选择节':'请先选择章'" ><el-option v-for="n in sections" :key="n.id" :label="n.title" :value="n.id"/></el-select></el-form-item>
 </div>
</template>
<style scoped>.parent-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 16px}.parent-fields .el-select{width:100%}@media(max-width:600px){.parent-fields{grid-template-columns:1fr}}</style>
