<script setup lang="ts">
import {computed,onMounted,reactive,ref} from 'vue'
import {Search,RotateCcw,Eye} from 'lucide-vue-next'
import {request} from './api'
import {auditDetailRows,auditTargetLabel} from '../../shared/audit'
const tab=ref('admin'),rows=ref<any[]>([]),options=ref<any[]>([]),total=ref(0),page=ref(1),pageSize=ref(20),busy=ref(false),error=ref('')
const filters=reactive({action:'',actor:'',target:'',range:[] as string[]}),applied=ref({...filters})
const detail=ref<any>(),opened=ref(false),detailBusy=ref(false),detailError=ref('')
const detailRows=computed(()=>auditDetailRows(detail.value?.details||{}))
const fmt=(v:string)=>v?new Date(v).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'—'
let rev=0,detailRev=0
async function load(){
 const r=++rev;busy.value=true;error.value=''
 const f=applied.value,q=new URLSearchParams({action:f.action,actor:f.actor,target:f.target,page:String(page.value),pageSize:String(pageSize.value)})
 if(f.range?.length===2){q.set('from',new Date(f.range[0]+'T00:00:00+08:00').toISOString());q.set('to',new Date(f.range[1]+'T23:59:59.999+08:00').toISOString())}
 try{const [data,actions]=await Promise.all([request('/admin/audit/records?'+q),request('/admin/audit/options')]);if(r===rev){rows.value=data.items;total.value=data.total;options.value=actions}}
 catch(e:any){if(r===rev){error.value=e.message;rows.value=[];total.value=0}}finally{if(r===rev)busy.value=false}
}
function search(){applied.value={...filters,range:[...(filters.range||[])]};page.value=1;void load()}
function reset(){Object.assign(filters,{action:'',actor:'',target:'',range:[]});search()}
async function inspect(row:any){const r=++detailRev;opened.value=true;detail.value=undefined;detailBusy.value=true;detailError.value='';try{const data=await request('/admin/audit/records/'+encodeURIComponent(row.id));if(r===detailRev)detail.value=data}catch(e:any){if(r===detailRev)detailError.value=e.message}finally{if(r===detailRev)detailBusy.value=false}}
onMounted(load);defineExpose({load})
</script>
<template>
 <section class="audit-management">
  <el-tabs v-model="tab" aria-label="日志类型"><el-tab-pane label="后台日志" name="admin"/><el-tab-pane label="用户行为" name="user"/></el-tabs>
  <template v-if="tab==='admin'">
   <form class="admin-filters" @submit.prevent="search">
    <label class="admin-filter-field"><span>操作</span><el-select v-model="filters.action" aria-label="操作" filterable :empty-values="[null,undefined]"><el-option label="全部操作" value=""/><el-option v-for="o in options" :key="o.value" :value="o.value" :label="o.label"/></el-select></label>
    <label class="admin-filter-field"><span>操作人</span><el-input v-model="filters.actor" aria-label="操作人" placeholder="姓名或手机号" clearable/></label>
    <label class="admin-filter-field"><span>操作对象</span><el-input v-model="filters.target" aria-label="操作对象" placeholder="搜索对象标识" clearable/></label>
    <label class="admin-filter-field date-field"><span>操作时间</span><el-date-picker v-model="filters.range" type="daterange" value-format="YYYY-MM-DD" start-placeholder="开始日期" end-placeholder="结束日期" range-separator="至" aria-label="操作时间范围"/></label>
    <div class="admin-filter-actions"><el-button native-type="submit" type="primary"><Search :size="16"/>查询</el-button><el-button @click="reset"><RotateCcw :size="16"/>重置</el-button></div>
   </form>
   <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon/>
   <div class="table-toolbar"><span>后台日志 <b>{{total}}</b></span></div>
   <el-table v-loading="busy" :data="rows" row-key="id"><template #empty><el-empty description="当前条件下暂无操作日志" :image-size="80"/></template>
    <el-table-column prop="action_label" label="操作" min-width="210" show-overflow-tooltip/>
    <el-table-column prop="module" label="所属模块" width="145"/>
    <el-table-column label="操作人" min-width="165"><template #default="{row}">{{row.actor_name}}<small v-if="row.phone" class="cell-sub">{{row.phone}}</small></template></el-table-column>
    <el-table-column label="操作对象" min-width="220" show-overflow-tooltip><template #default="{row}">{{auditTargetLabel(row.action,row.target_id)}}</template></el-table-column>
    <el-table-column label="操作时间" width="195"><template #default="{row}">{{fmt(row.created_at)}}</template></el-table-column>
    <el-table-column label="操作" width="80" fixed="right"><template #default="{row}"><el-tooltip content="查看详情"><el-button link type="primary" aria-label="查看日志详情" @click="inspect(row)"><Eye :size="17"/></el-button></el-tooltip></template></el-table-column>
   </el-table>
   <div class="pagination"><span>共 {{total}} 条</span><el-pagination v-model:current-page="page" v-model:page-size="pageSize" :page-sizes="[20,50,100]" :total="total" layout="sizes,prev,pager,next" @size-change="page=1;load()" @current-change="load"/></div>
  </template><el-empty v-else description="用户行为日志暂未开发" :image-size="80"/>
 </section>
 <el-drawer v-model="opened" title="操作日志详情" size="min(760px,100vw)" :close-on-click-modal="false"><div v-loading="detailBusy" class="audit-detail">
  <el-alert v-if="detailError" :title="detailError" type="error" :closable="false"/>
  <template v-if="detail"><el-descriptions :column="1" border><el-descriptions-item label="操作">{{detail.action_label}}</el-descriptions-item><el-descriptions-item label="所属模块">{{detail.module}}</el-descriptions-item><el-descriptions-item label="操作人">{{detail.actor_name}}{{detail.phone?' · '+detail.phone:''}}</el-descriptions-item><el-descriptions-item label="操作对象">{{auditTargetLabel(detail.action,detail.target_id)}}</el-descriptions-item><el-descriptions-item label="操作时间">{{fmt(detail.created_at)}}</el-descriptions-item></el-descriptions>
  <h3>变更详情</h3><el-table :data="detailRows" empty-text="未记录额外详情"><el-table-column prop="label" label="项目" min-width="180"/><el-table-column prop="value" label="内容" min-width="260"/></el-table></template>
 </div><template #footer><el-button @click="opened=false">关闭</el-button></template></el-drawer>
</template>
<style scoped>
.audit-management{min-width:0}.table-toolbar b{margin-left:6px}.date-field{flex:1.6 1 320px}.date-field :deep(.el-date-editor){width:100%;min-width:0}.pagination{gap:16px;flex-wrap:wrap}.audit-detail{min-height:160px;overflow-wrap:anywhere}.audit-detail h3{margin:26px 0 16px;font-size:16px}.audit-detail :deep(.cell){white-space:pre-wrap;overflow-wrap:anywhere}@media(max-width:600px){.date-field{flex-basis:100%;min-width:0}.pagination :deep(.el-pagination){flex-wrap:wrap}}
</style>
