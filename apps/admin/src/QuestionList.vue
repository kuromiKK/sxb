<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Pencil, Power, Search, RotateCcw, ChevronDown } from 'lucide-vue-next'
import { request, send } from './api'
import { shortTitle } from './utils/knowledge-list'
const props=defineProps<{exams:any[]}>()
const emit=defineEmits<{edit:[row:any]}>()
const rows=ref<any[]>([]),nodes=ref<any[]>([]),types=ref<any[]>([]),page=ref(1),total=ref(0),busy=ref(false),error=ref(''),saving=ref('')
const keyword=ref(''),typeId=ref(''),knowledgeId=ref(''),status=ref('')
const statuses:Record<string,string>={draft:'草稿',review:'审核中',published:'已发布',offline:'停用'}
const byId=computed(()=>new Map(nodes.value.map(n=>[n.id,n])))
function path(n:any){const parts=[n.title];let p=byId.value.get(n.parent_id);const seen=new Set([n.id]);while(p&&!seen.has(p.id)){seen.add(p.id);parts.unshift(p.title);p=byId.value.get(p.parent_id)}parts.unshift(props.exams.find(e=>e.id===n.exam_id)?.name||'');return parts.filter(Boolean).join(' / ')}
const points=computed(()=>nodes.value.filter(n=>n.kind==='knowledge').map(n=>({...n,path:path(n)})))
const pointMap=computed(()=>new Map(points.value.map(n=>[n.id,n])))
function linked(row:any){return (row.payload.knowledgePointIds||[row.parent_id]).filter(Boolean).map((id:string)=>pointMap.value.get(id)||{id,title:'知识点暂不可用',path:'知识点暂不可用'})}
const typeName=(row:any)=>types.value.find(t=>t.id===(row.payload.templateId||row.payload.type))?.name||row.payload.typeName||'未设置'
const date=(v:string)=>new Date(v).toLocaleString('zh-CN',{hour12:false})
let revision=0
async function load(){const rev=++revision;busy.value=true;error.value='';try{const q=new URLSearchParams({kind:'question',search:keyword.value.trim(),typeId:typeId.value,knowledgeId:knowledgeId.value,status:status.value,page:String(page.value)});const result=await request('/admin/content?'+q);if(rev===revision){rows.value=result.items;total.value=result.total;if(page.value>1&&!rows.value.length){page.value=Math.max(1,Math.ceil(total.value/20))}}}catch(e:any){if(rev===revision)error.value=e.message}finally{if(rev===revision)busy.value=false}}
function search(){if(page.value===1)load();else page.value=1}
function reset(){keyword.value='';typeId.value='';knowledgeId.value='';status.value='';search()}
watch(page,load)
async function toggle(row:any){if(saving.value)return;const enabled=row.status==='offline';try{await ElMessageBox.confirm(enabled?'恢复题目停用前的状态？':'停用后，学生将无法访问此题。',enabled?'启用题目':'停用题目',{confirmButtonText:enabled?'启用':'停用',cancelButtonText:'取消',type:'warning'});saving.value=row.id;await send('/admin/questions/'+row.id+'/status',{enabled,version:row.version},'PATCH');ElMessage.success(enabled?'题目已启用':'题目已停用');await load()}catch(e:any){if(e!=='cancel'&&e!=='close')ElMessage.error(e.message||'操作失败')}finally{saving.value=''}}
async function refresh(){try{[nodes.value,types.value]=await Promise.all([request('/admin/content-options'),request('/admin/question-types')]);await load()}catch(e:any){error.value=e.message}}
onMounted(refresh)
defineExpose({load:refresh})
</script>
<template>
  <section class="question-manager">
    <el-alert v-if="error" :title="error" type="error" :closable="false"/>
    <form class="admin-filters" @submit.prevent="search">
      <label class="admin-filter-field question-title-filter"><span>标题</span><el-input v-model="keyword" aria-label="筛选标题" placeholder="输入题目标题或唯一 ID" clearable @clear="search"><template #prefix><Search :size="16"/></template></el-input></label>
      <label class="admin-filter-field"><span>题型</span><el-select v-model="typeId" aria-label="筛选题型" :empty-values="[null,undefined]" filterable @change="search"><el-option label="全部题型" value=""/><el-option v-for="t in types" :key="t.id" :label="t.name" :value="t.id"/></el-select></label>
      <label class="admin-filter-field question-point-filter"><span>知识点</span><el-select v-model="knowledgeId" aria-label="筛选知识点" :empty-values="[null,undefined]" filterable @change="search" popper-class="question-point-options"><el-option label="全部知识点" value=""/><el-option v-for="p in points" :key="p.id" :label="p.path" :value="p.id"><span class="question-option-title">{{p.title}}</span><small class="question-option-path">{{p.path}}</small></el-option></el-select></label>
      <label class="admin-filter-field"><span>状态</span><el-select v-model="status" aria-label="筛选状态" :empty-values="[null,undefined]" @change="search"><el-option label="全部状态" value=""/><el-option v-for="(label,value) in statuses" :key="value" :label="label" :value="value"/></el-select></label>
      <div class="admin-filter-actions"><el-button type="primary" native-type="submit"><Search :size="16"/>查询</el-button><el-button @click="reset"><RotateCcw :size="16"/>重置</el-button></div>
    </form>
    <div class="table-toolbar"><span class="table-count">题目 <b>{{total}}</b></span></div>
    <el-table v-loading="busy" :data="rows" row-key="id" empty-text="暂无符合条件的题目">
      <el-table-column label="标题" min-width="340"><template #default="{row}"><el-tooltip :content="row.title" :show-after="350" :trigger="['hover','focus']"><button class="table-title question-title" :aria-label="row.title" @click="emit('edit',row)">{{shortTitle(row.title)}}</button></el-tooltip></template></el-table-column>
      <el-table-column label="知识点" min-width="250"><template #default="{row}"><el-popover v-if="linked(row).length" trigger="click" width="440" placement="bottom-start"><template #reference><button class="question-points" :aria-label="'查看关联的'+linked(row).length+'个知识点'"><span>{{linked(row)[0].title}}</span><em>{{linked(row).length}} 个</em><ChevronDown :size="14"/></button></template><div class="question-points-detail"><strong>关联知识点 · {{linked(row).length}}</strong><ol><li v-for="p in linked(row)" :key="p.id"><b>{{p.title}}</b><small>{{p.path}}</small></li></ol></div></el-popover><span v-else>—</span></template></el-table-column>
      <el-table-column label="题型" min-width="125"><template #default="{row}"><span>{{typeName(row)}}</span></template></el-table-column>
      <el-table-column label="状态" width="100"><template #default="{row}"><el-tag :type="row.status==='published'?'success':row.status==='review'?'warning':'info'">{{statuses[row.status]}}</el-tag></template></el-table-column>
      <el-table-column label="更新时间" width="180"><template #default="{row}">{{date(row.updated_at)}}</template></el-table-column>
      <el-table-column label="操作" width="112" fixed="right"><template #default="{row}"><div class="row-actions"><el-tooltip content="编辑"><el-button link type="primary" aria-label="编辑题目" @click="emit('edit',row)"><Pencil :size="17"/></el-button></el-tooltip><el-tooltip :content="row.status==='offline'?'启用':'停用'"><el-button link :type="row.status==='offline'?'success':'danger'" :aria-label="row.status==='offline'?'启用':'停用'" :loading="saving===row.id" :disabled="!!saving" @click="toggle(row)"><Power :size="17"/></el-button></el-tooltip></div></template></el-table-column>
    </el-table>
    <div class="pagination"><span>共 {{total}} 道题目</span><el-pagination v-model:current-page="page" :total="total" :page-size="20" layout="prev,pager,next"/></div>
  </section>
</template>
<style scoped>
.question-title-filter{flex-basis:240px}.question-point-filter{flex-basis:280px}
.question-title{display:block;max-width:100%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;text-align:left}
.question-points{display:flex;align-items:center;gap:8px;width:100%;min-height:32px;padding:0;background:none;border:0;text-align:left;color:var(--el-text-color-regular);cursor:pointer}.question-points>span{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.question-points em{flex:none;font-size:12px;font-style:normal;padding:2px 7px;border-radius:5px;color:var(--primary);background:var(--el-color-primary-light-9)}.question-points>svg{flex:none;color:var(--muted)}
.question-points-detail{max-height:330px;overflow:auto}.question-points-detail ol{padding-left:22px;margin:14px 0 0}.question-points-detail li{padding:0 0 14px 4px}.question-points-detail b,.question-points-detail small{display:block;overflow-wrap:anywhere;line-height:1.65}.question-points-detail small{font-size:12px;color:var(--el-text-color-secondary);margin-top:5px}
@media(min-width:1100px) and (max-width:1400px){.admin-filters{gap:12px}.admin-filter-field{flex-basis:120px;min-width:110px}.question-title-filter{flex-basis:170px}.question-point-filter{flex-basis:200px}}
</style>
