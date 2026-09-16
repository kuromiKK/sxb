<script setup lang="ts">
import { onMounted,reactive,ref,watch } from 'vue'
import { ElMessage,ElMessageBox } from 'element-plus'
import { Search,RotateCcw,Pencil,Power,Send } from 'lucide-vue-next'
import { request,send } from './api'
const props=defineProps<{exams:any[]}>(),emit=defineEmits<{edit:[row:any]}>()
const rows=ref<any[]>([]),total=ref(0),page=ref(1),busy=ref(false),working=ref(''),error=ref(''),range=ref<string[]>([])
const filters=reactive({search:'',examId:'',status:'',pushed:''}),statuses:Record<string,string>={draft:'草稿',review:'审核中',published:'已发布',offline:'停用'}
let revision=0
const date=(value:string)=>value?new Date(value).toLocaleString('zh-CN',{hour12:false}):'—'
async function load(){const rev=++revision;busy.value=true;error.value='';try{const q=new URLSearchParams({...filters,page:String(page.value)});if(range.value?.length===2){q.set('from',range.value[0]);q.set('to',range.value[1])}const r=await request('/admin/cheatsheets?'+q);if(rev===revision){rows.value=r.items;total.value=r.total}}catch(e:any){if(rev===revision)error.value=e.message}finally{if(rev===revision)busy.value=false}}
function search(){if(page.value===1)void load();else page.value=1}
function reset(){Object.assign(filters,{search:'',examId:'',status:'',pushed:''});range.value=[];search()}
function pushReason(row:any){return row.status==='offline'?'停用的小抄不能推送':row.status!=='published'?'请先发布小抄':Date.parse(row.payload.closesAt)<=Date.now()?'小抄已关闭，请先调整关闭时间':row.pushed_at?'再次推送':'推送'}
const canPush=(row:any)=>row.status==='published'&&Date.parse(row.payload.closesAt)>Date.now()
async function toggle(row:any){if(working.value)return;const enabled=row.status==='offline';try{await ElMessageBox.confirm(enabled?'启用后恢复停用前的发布状态，开放时间保持不变。':'停用后用户将无法阅读此小抄。',enabled?'启用小抄':'停用小抄',{type:'warning',confirmButtonText:enabled?'启用':'停用',cancelButtonText:'取消'});working.value=row.id;await send('/admin/cheatsheets/'+encodeURIComponent(row.id)+'/status',{enabled,version:row.version},'PATCH');await load();ElMessage.success(enabled?'已启用':'已停用')}catch(e:any){if(e!=='cancel'&&e!=='close')ElMessage.error(e.message)}finally{working.value=''}}
async function push(row:any){if(working.value||!canPush(row))return;try{await ElMessageBox.confirm(`确认${row.pushed_at?'再次':''}推送“${row.title}”？开放时间会改为本次推送时间，关闭时间不变。站内消息将发送给该考试当前具有小抄阅读权益的用户。`,row.pushed_at?'再次推送小抄':'推送小抄',{type:'warning',confirmButtonText:'确认推送',cancelButtonText:'取消'});working.value=row.id;const result=await send('/admin/cheatsheets/'+encodeURIComponent(row.id)+'/push',{version:row.version});await load();ElMessage.success(`已推送给 ${result.count} 位用户`)}catch(e:any){if(e!=='cancel'&&e!=='close'){ElMessage.error(e.message);await load()}}finally{working.value=''}}
watch(page,load);onMounted(load);defineExpose({load})
</script>
<template>
 <section class="cheatsheet-management">
  <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon/>
  <form class="admin-filters" @submit.prevent="search">
   <label class="admin-filter-field"><span>标题</span><el-input v-model="filters.search" aria-label="筛选标题" placeholder="搜索小抄标题" clearable @clear="search"><template #prefix><Search :size="16"/></template></el-input></label>
   <label class="admin-filter-field"><span>考试项目</span><el-select v-model="filters.examId" aria-label="筛选考试项目" filterable :empty-values="[null,undefined]" @change="search"><el-option label="全部考试" value=""/><el-option v-for="exam in props.exams" :key="exam.id" :label="exam.name" :value="exam.id"/></el-select></label>
   <label class="admin-filter-field"><span>状态</span><el-select v-model="filters.status" aria-label="筛选状态" :empty-values="[null,undefined]" @change="search"><el-option label="全部状态" value=""/><el-option v-for="(label,value) in statuses" :key="value" :value="value" :label="label"/></el-select></label>
   <label class="admin-filter-field"><span>推送状态</span><el-select v-model="filters.pushed" aria-label="筛选推送状态" :empty-values="[null,undefined]" @change="search"><el-option label="全部" value=""/><el-option label="已推送" value="yes"/><el-option label="未推送" value="no"/></el-select></label>
   <label class="admin-filter-field window-filter"><span>开放时间至关闭时间</span><el-date-picker v-model="range" type="datetimerange" aria-label="筛选开放时间段" start-placeholder="开始时间" end-placeholder="结束时间" range-separator="至" value-format="YYYY-MM-DDTHH:mm:ssZ" @change="search"/></label>
   <div class="admin-filter-actions"><el-button type="primary" native-type="submit"><Search :size="16"/>查询</el-button><el-button @click="reset"><RotateCcw :size="16"/>重置</el-button></div>
  </form>
  <div class="table-toolbar"><span class="table-count">考前小抄 <b>{{total}}</b></span></div>
  <el-table v-loading="busy" :data="rows" row-key="id" empty-text="暂无符合条件的小抄">
   <el-table-column label="标题" min-width="240"><template #default="{row}"><button class="table-title sheet-title" :title="row.title" @click="emit('edit',row)">{{Array.from(row.title).slice(0,50).join('')}}{{Array.from(row.title).length>50?'…':''}}</button></template></el-table-column>
   <el-table-column label="考试项目" prop="exam_name" min-width="160"/>
   <el-table-column label="状态" width="100"><template #default="{row}"><el-tag :type="row.status==='published'?'success':row.status==='review'?'warning':'info'">{{statuses[row.status]}}</el-tag></template></el-table-column>
   <el-table-column label="开放时间至关闭时间" min-width="225"><template #default="{row}"><div class="sheet-window"><span>{{date(row.payload.opensAt)}}</span><small>至 {{date(row.payload.closesAt)}}</small></div></template></el-table-column>
   <el-table-column label="推送状态" width="105"><template #default="{row}"><el-tooltip v-if="row.pushed_at" :content="`最近推送：${date(row.pushed_at)}，${row.recipient_count} 位用户`"><el-tag type="success" effect="plain">是</el-tag></el-tooltip><span v-else class="sheet-unpushed">否</span></template></el-table-column>
   <el-table-column label="更新时间" width="180"><template #default="{row}">{{date(row.updated_at)}}</template></el-table-column>
   <el-table-column label="操作" width="148" fixed="right"><template #default="{row}"><div class="row-actions"><el-tooltip content="编辑"><el-button link type="primary" aria-label="编辑小抄" :disabled="!!working" @click="emit('edit',row)"><Pencil :size="17"/></el-button></el-tooltip><el-tooltip :content="row.status==='offline'?'启用':'停用'"><el-button link :type="row.status==='offline'?'success':'danger'" :aria-label="row.status==='offline'?'启用':'停用'" :disabled="!!working" @click="toggle(row)"><Power :size="17"/></el-button></el-tooltip><el-tooltip :content="pushReason(row)"><span><el-button link type="primary" aria-label="推送小抄" :disabled="!canPush(row)||!!working" @click="push(row)"><Send :size="17"/></el-button></span></el-tooltip></div></template></el-table-column>
  </el-table>
  <div class="pagination"><span>共 {{total}} 条</span><el-pagination v-model:current-page="page" :page-size="20" :total="total" layout="prev,pager,next"/></div>
 </section>
</template>
<style scoped>
.window-filter{flex:2 1 360px;min-width:280px}.window-filter :deep(.el-date-editor){width:100%;min-height:40px;box-sizing:border-box}.sheet-title{display:block;text-align:left;overflow-wrap:anywhere;line-height:1.6}.sheet-window{display:flex;flex-direction:column;gap:5px;font-variant-numeric:tabular-nums}.sheet-window small,.sheet-unpushed{color:var(--el-text-color-regular)}.sheet-window small{font-size:12px}.cheatsheet-management :deep(.el-alert){margin-bottom:16px}@media(max-width:600px){.window-filter{min-width:0;flex-basis:100%}}
</style>
