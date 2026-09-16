<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, RotateCcw, Pencil, Power, ChevronRight } from 'lucide-vue-next'
import { request, send } from './api'
import { shortTitle } from './utils/knowledge-list'
const props=defineProps<{exams:any[]}>(),emit=defineEmits<{edit:[row:any]}>()
const type=ref('premium'),rows=ref<any[]>([]),nodes=ref<any[]>([]),page=ref(1),total=ref(0),busy=ref(false),saving=ref(''),error=ref('')
const filters=reactive({search:'',examId:'',subjectId:'',chapterId:'',sectionId:'',knowledgeId:'',status:''})
const levels=[{key:'subjectId',kind:'subject',label:'科目'},{key:'chapterId',kind:'chapter',label:'章'},{key:'sectionId',kind:'section',label:'节'},{key:'knowledgeId',kind:'knowledge',label:'知识点'}] as const
const visibleLevels=computed(()=>type.value==='premium'?levels.slice(0,3):levels)
const statuses:Record<string,string>={draft:'草稿',review:'审核中',published:'已发布',offline:'停用'}
const byId=computed(()=>new Map(nodes.value.map(n=>[n.id,n])))
function lineage(node:any){const result:Record<string,string>={};let n=node;const seen=new Set();while(n&&!seen.has(n.id)){seen.add(n.id);result[n.kind]=n.id;n=byId.value.get(n.parent_id)}return result}
function options(kind:string){return nodes.value.filter(n=>{if(n.kind!==kind||(filters.examId&&n.exam_id!==filters.examId))return false;const path=lineage(n);return levels.every(l=>!filters[l.key]||levels.findIndex(x=>x.kind===l.kind)>=levels.findIndex(x=>x.kind===kind)||path[l.kind]===filters[l.key])})}
function optionPath(node:any){const parts:string[]=[];let p=byId.value.get(node.parent_id);while(p){parts.unshift(p.title);p=byId.value.get(p.parent_id)}parts.unshift(props.exams.find(e=>e.id===node.exam_id)?.name||'');return parts.filter(Boolean).join(' / ')}
let revision=0
async function load(){const rev=++revision;busy.value=true;error.value='';try{const q=new URLSearchParams({...filters,type:type.value,page:String(page.value)});const data=await request('/admin/courses?'+q);if(rev===revision){rows.value=data.items;total.value=data.total;if(page.value>1&&!rows.value.length)page.value=Math.max(1,Math.ceil(total.value/20))}}catch(e:any){if(rev===revision)error.value=e.message}finally{if(rev===revision)busy.value=false}}
function search(){if(page.value===1)void load();else page.value=1}
function reset(){Object.assign(filters,{search:'',examId:'',subjectId:'',chapterId:'',sectionId:'',knowledgeId:'',status:''});search()}
function changed(key:string){const order=['examId',...levels.map(l=>l.key)];for(const lower of order.slice(order.indexOf(key)+1))(filters as any)[lower]='';search()}
watch(type,reset);watch(page,load)
async function refresh(){try{nodes.value=await request('/admin/content-options');await load()}catch(e:any){error.value=e.message}}
async function toggle(row:any){if(saving.value)return;const enabled=row.status==='offline';try{await ElMessageBox.confirm(enabled?'恢复课程停用前的发布状态？':'停用后，学生将无法访问此课程。',enabled?'启用课程':'停用课程',{type:'warning',confirmButtonText:enabled?'启用':'停用',cancelButtonText:'取消'});saving.value=row.id;await send('/admin/courses/'+encodeURIComponent(row.id)+'/status',{enabled,version:row.version},'PATCH');ElMessage.success(enabled?'课程已启用':'课程已停用');await load()}catch(e:any){if(e!=='cancel'&&e!=='close')ElMessage.error(e.message||'操作失败')}finally{saving.value=''}}
function parentPath(row:any){return [row.exam_name,row.subject_name,row.chapter_name,...(type.value==='supporting'?[row.section_name]:[])]}
const date=(v:string)=>v?new Date(v).toLocaleString('zh-CN',{hour12:false}):'—'
onMounted(refresh);defineExpose({load:refresh})
</script>
<template>
 <section class="course-management">
  <el-tabs v-model="type" aria-label="课程分类"><el-tab-pane label="精品课" name="premium"/><el-tab-pane label="配套课" name="supporting"/></el-tabs>
  <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon/>
  <form class="admin-filters" @submit.prevent="search">
   <label class="admin-filter-field course-title-filter"><span>标题</span><el-input v-model="filters.search" aria-label="筛选标题" placeholder="输入课程标题" clearable @clear="search"><template #prefix><Search :size="16"/></template></el-input></label>
   <label class="admin-filter-field"><span>考试</span><el-select v-model="filters.examId" aria-label="筛选考试" filterable :empty-values="[null,undefined]" @change="changed('examId')"><el-option label="全部考试" value=""/><el-option v-for="e in exams" :key="e.id" :label="e.name" :value="e.id"/></el-select></label>
   <label v-for="level in visibleLevels" :key="level.key" class="admin-filter-field"><span>{{level.label}}</span><el-select v-model="filters[level.key]" :aria-label="'筛选'+level.label" filterable :empty-values="[null,undefined]" popper-class="question-point-options" @change="changed(level.key)"><el-option :label="'全部'+level.label" value=""/><el-option v-for="n in options(level.kind)" :key="n.id" :label="n.title" :value="n.id"><span class="question-option-title">{{n.title}}</span><small class="question-option-path">{{optionPath(n)}}</small></el-option></el-select></label>
   <label class="admin-filter-field"><span>状态</span><el-select v-model="filters.status" aria-label="筛选状态" :empty-values="[null,undefined]" @change="search"><el-option label="全部状态" value=""/><el-option v-for="(label,value) in statuses" :key="value" :label="label" :value="value"/></el-select></label>
   <div class="admin-filter-actions"><el-button type="primary" native-type="submit"><Search :size="16"/>查询</el-button><el-button @click="reset"><RotateCcw :size="16"/>重置</el-button></div>
  </form>
  <div class="table-toolbar"><span class="table-count">{{type==='premium'?'精品课':'配套课'}} <b>{{total}}</b></span></div>
  <el-table :key="type" v-loading="busy" :data="rows" row-key="id" empty-text="暂无符合条件的课程">
   <el-table-column label="标题" min-width="280"><template #default="{row}"><el-tooltip :content="row.title" :show-after="350" :trigger="['hover','focus']"><button class="table-title course-title" @click="emit('edit',row)">{{shortTitle(row.title)}}</button></el-tooltip></template></el-table-column>
   <el-table-column :label="type==='premium'?'所属节':'所属知识点'" min-width="420"><template #default="{row}"><div class="course-parent"><strong>{{row.parent_title}}</strong><div class="course-path"><span v-for="(part,index) in parentPath(row)" :key="index"><ChevronRight v-if="index" :size="12" aria-hidden="true"/><span>{{part}}</span></span></div></div></template></el-table-column>
   <el-table-column label="讲义" width="80"><template #default="{row}">{{row.payload.hasHandout||row.payload.handouts?.some((h:any)=>h.assetId)||row.payload.downloadUrl?'有':'无'}}</template></el-table-column>
   <el-table-column label="状态" width="100"><template #default="{row}"><el-tag :type="row.status==='published'?'success':row.status==='review'?'warning':'info'">{{statuses[row.status]}}</el-tag></template></el-table-column>
   <el-table-column label="更新时间" width="180"><template #default="{row}">{{date(row.updated_at)}}</template></el-table-column>
   <el-table-column label="操作" width="112" fixed="right"><template #default="{row}"><div class="row-actions"><el-tooltip content="编辑"><el-button link type="primary" aria-label="编辑课程" @click="emit('edit',row)"><Pencil :size="17"/></el-button></el-tooltip><el-tooltip :content="row.status==='offline'?'启用':'停用'"><el-button link :type="row.status==='offline'?'success':'danger'" :aria-label="row.status==='offline'?'启用':'停用'" :loading="saving===row.id" :disabled="!!saving" @click="toggle(row)"><Power :size="17"/></el-button></el-tooltip></div></template></el-table-column>
  </el-table>
  <div class="pagination"><span>共 {{total}} 门课程</span><el-pagination v-model:current-page="page" :page-size="20" :total="total" layout="prev,pager,next"/></div>
 </section>
</template>
<style scoped>
.course-title-filter{flex-basis:220px}.course-title{display:block;max-width:100%;text-align:left;overflow-wrap:anywhere}.course-parent{padding:5px 0}.course-parent strong{display:block;font-weight:500;color:var(--admin-text);line-height:1.6;overflow-wrap:anywhere}.course-path{display:flex;flex-wrap:wrap;gap:2px 5px;margin-top:6px;font-size:12px;line-height:1.6;color:var(--el-text-color-secondary)}.course-path>span{display:inline-flex;align-items:baseline;gap:5px;min-width:0}.course-path>span>span{overflow-wrap:anywhere}.course-path svg{flex:none;align-self:center}.course-management :deep(.el-tabs__header){margin-bottom:20px}.course-management :deep(.el-tabs__item){font-size:15px}.course-management :deep(.el-alert){margin-bottom:16px}
</style>
