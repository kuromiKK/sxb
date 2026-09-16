<script setup lang="ts">
import RecordIdentifier from './RecordIdentifier.vue'
import { computed, onMounted, ref, watch } from 'vue'
import { GraduationCap, List, Network, GitBranch } from 'lucide-vue-next'
import { request } from './api'
import { introText } from './utils/intro-text'
import { createGraphWorkbook, graphExportFilename } from './utils/knowledge-graph-export'
import KnowledgeList from './KnowledgeList.vue'
import KnowledgeRelation from './KnowledgeRelation.vue'
import KnowledgeMindMap from './KnowledgeMindMap.vue'
const emit=defineEmits<{edit:[row:any];course:[node:any];courses:[node:any];preview:[row:any]}>()
const exams=ref<any[]>([]),selected=ref<any>(),tab=ref('list'),error=ref(''),busy=ref(false),exportBusy=ref(false)
const structure=ref<any>({subjects:[],rows:[],counts:{}})
const search=ref(''),category=ref(''),page=ref(1)
const metrics=[{key:'subject',label:'科目'},{key:'chapter',label:'章'},{key:'section',label:'节'},{key:'knowledge',label:'知识点'},{key:'course',label:'课程'},{key:'question',label:'题目'}]
const views=[{key:'list',label:'列表管理',icon:List},{key:'graph',label:'关系图谱',icon:Network},{key:'mind',label:'思维导图',icon:GitBranch}]
function tabKeydown(event:KeyboardEvent,index:number){
  let next=index
  if(event.key==='ArrowRight')next=(index+1)%views.length
  else if(event.key==='ArrowLeft')next=(index+views.length-1)%views.length
  else if(event.key==='Home')next=0
  else if(event.key==='End')next=views.length-1
  else return
  event.preventDefault();tab.value=views[next].key
  document.getElementById('graph-tab-'+tab.value)?.focus()
}
const name=(e:any)=>e?.name||'未命名考试',cover=(e:any)=>e?.cover_url||''
const categories=computed(()=>[...new Map(exams.value.filter(e=>e.category_id).map(e=>[e.category_id,{id:e.category_id,name:e.category_name}])).values()])
const filtered=computed(()=>exams.value.filter(e=>(!category.value||e.category_id===category.value)&&name(e).includes(search.value.trim())))
const current=computed(()=>structure.value),root=computed(()=>({id:selected.value?.id,type:'exam',title:name(selected.value),children:current.value.subjects}))
function editNode(n:any){const row=current.value.rows.find((r:any)=>r.id===n.id);if(row)emit('edit',row)}
async function loadDetail(){
  const id=selected.value?.id;if(!id)return
  const data=await request('/admin/knowledge-structure/'+encodeURIComponent(id))
  if(selected.value?.id===id){structure.value=data;selected.value=exams.value.find(e=>e.id===id)||data.exam}
}
async function open(e:any){selected.value=e;structure.value={subjects:[],rows:[],counts:{}};tab.value='list';error.value='';busy.value=true;try{await loadDetail()}catch(e:any){error.value=e.message}finally{busy.value=false}}
function back(){selected.value=undefined;error.value=''}
async function load(){busy.value=true;error.value='';try{exams.value=await request('/admin/exam-projects');await loadDetail()}catch(e:any){error.value=e.message}finally{busy.value=false}}
async function exportExcel(){
  if(!selected.value||exportBusy.value)return
  exportBusy.value=true
  try{
    const data={categoryTitle:selected.value.category_name||'',examTitle:name(selected.value),subjects:current.value.subjects,isDemo:false}
    const bytes=await createGraphWorkbook(data).xlsx.writeBuffer()
    const url=URL.createObjectURL(new Blob([bytes as BlobPart],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}))
    const link=document.createElement('a');link.href=url;link.download=graphExportFilename(data.examTitle,false);link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
  }catch(e:any){error.value=e.message}finally{exportBusy.value=false}
}
watch([search,category],()=>page.value=1)
onMounted(load)
defineExpose({isDetail:computed(()=>!!selected.value),back,load,exportBusy,exportExcel})
</script>
<template>
<section class="kg" v-loading="busy">
  <el-alert v-if="error" :title="error" type="error" :closable="false"/>
  <template v-if="!selected">
    <div class="filters"><el-input v-model="search" aria-label="搜索考试项目" placeholder="搜索考试项目" clearable/><el-select v-model="category" aria-label="考试分类" placeholder="考试分类" clearable><el-option v-for="c in categories" :key="c.id" :value="c.id" :label="c.name"/></el-select></div>
    <div class="grid"><button v-for="e in filtered.slice((page-1)*12,page*12)" :key="e.id" @click="open(e)"><div class="cover"><img v-if="cover(e)" :src="cover(e)" :alt="name(e)"/><GraduationCap v-else/></div><strong>{{name(e)}}</strong><small>{{e.category_name||'未分类'}}</small></button></div>
    <el-empty v-if="!filtered.length&&!busy" description="暂无匹配考试"/>
    <div class="pagination"><el-pagination v-model:current-page="page" :total="filtered.length" :page-size="12" layout="total,prev,pager,next"/></div>
  </template>
  <template v-else>
    <div class="summary">
      <div class="summary-cover"><img v-if="cover(selected)" :src="cover(selected)" :alt="name(selected)"/><GraduationCap v-else/></div>
      <div class="summary-main">
        <h2 class="exam-heading">{{name(selected)}} <RecordIdentifier :id="selected.id" table="knowledge_nodes" inline/></h2>
        <p class="exam-intro">{{introText(selected.intro)||'考试知识结构与内容资源总览'}}</p>
        <div class="summary-tabs" role="tablist" aria-label="知识图谱视图">
          <button v-for="(view,index) in views" :id="'graph-tab-'+view.key" :key="view.key" role="tab" type="button" :aria-selected="tab===view.key" :aria-controls="'graph-panel-'+view.key" :tabindex="tab===view.key?0:-1" :class="{active:tab===view.key}" @click="tab=view.key" @keydown="tabKeydown($event,index)"><component :is="view.icon" :size="16" aria-hidden="true"/>{{view.label}}</button>
        </div>
      </div>
      <dl class="summary-stats" aria-label="考试内容统计"><div v-for="metric in metrics" :key="metric.key" class="summary-stat" :data-metric="metric.key"><dt>{{metric.label}}</dt><dd>{{busy?'—':Number(current.counts[metric.key]||0).toLocaleString('zh-CN')}}</dd></div></dl>
    </div>
    <div class="graph-panels">
      <section v-show="tab==='list'" id="graph-panel-list" role="tabpanel" aria-labelledby="graph-tab-list" tabindex="0">
        <KnowledgeList :rows="current.rows" :subjects="current.subjects" :exam="selected" @edit="emit('edit',$event)" @course="emit('course',$event)" @courses="emit('courses',$event)" @preview="emit('preview',$event)" @reload="load"/>
      </section>
      <section v-if="tab==='graph'" id="graph-panel-graph" role="tabpanel" aria-labelledby="graph-tab-graph" tabindex="0"><KnowledgeRelation :root="root" @edit="editNode"/></section>
      <section v-if="tab==='mind'" id="graph-panel-mind" role="tabpanel" aria-labelledby="graph-tab-mind" tabindex="0"><KnowledgeMindMap :root="root" @edit="editNode"/></section>
    </div>
  </template>
</section>
</template>
<style scoped>.kg{padding:8px 0 40px}.filters{display:flex;gap:12px;margin-bottom:20px}.filters .el-input{width:280px}.filters .el-select{width:180px}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,260px));gap:18px}.grid button{padding:0 0 14px;border:1px solid #e3e9f2;border-radius:12px;background:#fff;text-align:left;overflow:hidden;cursor:pointer}.cover{aspect-ratio:3/4;background:#eef3fb;display:grid;place-items:center;color:#3569e8}.cover img{width:100%;height:100%;object-fit:cover}.grid strong,.grid small{display:block;padding:0 14px}.grid strong{margin-top:12px}.grid small{margin-top:5px;color:#7b8ba0}.graph-toolbar{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;color:#71839a}.g6-canvas{height:520px;border:1px solid #e1e8f0;border-radius:14px;background:radial-gradient(circle,#f8fbff,#eef4fc)}.mind{padding:24px;background:#f7f9fc;border-radius:12px}.mind-root{margin:auto;width:max-content;padding:16px 24px;border-radius:28px;background:#3569e8;color:#fff}.mind-sub{margin:24px 0;padding:16px;background:#fff;border-radius:10px}.mind-section{margin:10px 0;padding:10px 14px;border-left:3px solid #9bb5e5}.mind button{margin:5px;padding:7px 10px;border:1px solid #dbe4f2;border-radius:6px;background:#fff;cursor:pointer}.actions{display:flex;justify-content:flex-end;gap:8px;margin-bottom:14px}.phone{padding:24px;background:#eef2f8}.phone-screen{width:320px;min-height:560px;padding:22px;border:10px solid #202a3b;border-radius:30px;background:#fff}@media(max-width:900px){.grid{grid-template-columns:repeat(2,1fr)}}
/* Exam overview: compact cover, working context, six statistics. */
.summary{display:grid;grid-template-columns:120px minmax(0,1fr) 336px;align-items:stretch;gap:24px;padding:24px;background:var(--surface);border:1px solid var(--admin-border);border-radius:12px;margin-bottom:24px}
.summary-cover{width:120px;height:160px;align-self:start;overflow:hidden;border-radius:8px;background:var(--el-fill-color-light);display:grid;place-items:center;color:var(--primary)}
.summary-cover img{width:100%;height:100%;object-fit:cover}
.summary-main{display:flex;flex-direction:column;min-width:0;gap:12px}
.exam-heading{font-size:20px;line-height:1.5;font-weight:650;overflow-wrap:anywhere;color:var(--admin-text)}
.exam-intro{margin:0;color:var(--muted);font-size:14px;line-height:1.8;overflow-wrap:anywhere}
.summary-tabs{display:flex;align-self:flex-start;gap:4px;margin-top:auto;padding:4px;border-radius:10px;background:var(--el-fill-color-light)}
.summary-tabs button{display:flex;align-items:center;justify-content:center;gap:7px;min-height:38px;padding:8px 12px;border:1px solid transparent;border-radius:7px;background:transparent;color:var(--muted);font-size:14px;white-space:nowrap;transition:background .18s,color .18s}
.summary-tabs button:hover{color:var(--primary);background:var(--surface)}
.summary-tabs button.active{background:var(--surface);color:var(--primary);border-color:var(--admin-border);font-weight:600;box-shadow:0 1px 3px #2036570a}
.summary-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));grid-template-rows:repeat(2,minmax(74px,1fr));gap:10px;margin:0;padding:0}
.summary-stat{display:flex;flex-direction:column;justify-content:center;gap:4px;padding:10px 14px;background:var(--el-fill-color-light);border:1px solid var(--admin-border);border-radius:8px;min-width:0}
.summary-stat dt{font-size:12px;color:var(--muted)}.summary-stat dd{margin:0;font-size:24px;font-weight:600;line-height:1.25;font-variant-numeric:tabular-nums;color:var(--admin-text);overflow-wrap:anywhere}
.summary-stat[data-metric="question"]{background:var(--el-color-primary-light-9);border-color:var(--el-color-primary-light-8)}
.summary-stat[data-metric="question"] dd{color:var(--primary)}
.graph-panels{min-width:0}.mind-canvas{height:620px;border:1px solid var(--admin-border);border-radius:12px;overflow:hidden}
@media(max-width:1250px){.summary{grid-template-columns:108px minmax(0,1fr);gap:20px}.summary-cover{width:108px;height:144px}.summary-stats{grid-column:1/-1;grid-template-columns:repeat(6,minmax(0,1fr));grid-template-rows:auto}.summary-stat{padding:12px}}
@media(max-width:600px){.summary{grid-template-columns:72px minmax(0,1fr);gap:14px;padding:16px}.summary-cover{width:72px;height:96px}.exam-heading{font-size:17px}.exam-intro{font-size:13px;line-height:1.7}.summary-main{display:contents}.exam-heading{align-self:center}.exam-intro,.summary-tabs{grid-column:1/-1}.summary-tabs{align-self:stretch;display:grid;grid-template-columns:repeat(3,minmax(0,1fr))}.summary-tabs button{gap:5px;padding:8px 6px;font-size:13px;min-height:44px}.summary-stats{grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.summary-stat dd{font-size:22px}.graph-toolbar{gap:12px;flex-wrap:wrap}}
@media(prefers-reduced-motion:reduce){.summary-tabs button{transition:none}}
</style>
