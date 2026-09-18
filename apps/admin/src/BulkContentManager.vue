<script setup lang="ts">
import {computed,onMounted,ref,reactive,watch} from 'vue'
import {ElMessageBox} from 'element-plus'
import {request,send} from './api'
import {bulkActionsFor,bulkStatusesFor,bulkModuleKinds,bulkKindLabels,type BulkAction,type BulkModule} from '../../shared/bulk-content'
const props=defineProps<{exams:any[];examId?:string;module:BulkModule}>(),emit=defineEmits(['changed','edit','busy-change'])
const rows=ref<any[]>([]),selected=ref<any[]>([]),total=ref(0),page=ref(1),loading=ref(false),running=ref(false),error=ref('')
const filters=reactive({search:'',examId:props.examId||'',kind:'',test:'',status:'',module:props.module})
let appliedFilters={...filters},revision=0
const action=ref<BulkAction>(props.module==='articles'?'publish':'disable'),results=ref<any[]>([]),onlyFailures=ref(false),resultPage=ref(1),progress=ref(0),processingTotal=ref(0)
const busy=computed(()=>loading.value||running.value)
const availableKinds=computed(()=>Object.fromEntries(Object.entries(bulkKindLabels).filter(([kind])=>bulkModuleKinds(props.module)!.includes(kind))))
const policyKind=computed(()=>filters.kind||bulkModuleKinds(props.module)![0])
const actions=computed(()=>bulkActionsFor(policyKind.value))
const statuses=computed(()=>bulkStatusesFor(policyKind.value))
const choice=computed(()=>actions.value.find(a=>a.value===action.value)!)
const failures=computed(()=>results.value.filter(r=>!r.success))
const shownResults=computed(()=>(onlyFailures.value?failures.value:results.value).slice((resultPage.value-1)*10,resultPage.value*10))
watch(running,value=>emit('busy-change',value))
async function load(){
 const rev=++revision,query={...filters};loading.value=true;error.value=''
 try{const r=await request('/admin/bulk-content?'+new URLSearchParams({...query,page:String(page.value)}));if(rev===revision){rows.value=r.items;total.value=r.total;selected.value=[];appliedFilters=query}}
 catch(e:any){if(rev===revision)error.value=e.message}finally{if(rev===revision)loading.value=false}
}
function search(){if(page.value===1)void load();else page.value=1}
async function run(all=false){
 if(busy.value)return
 const operation=choice.value,scope={...appliedFilters},selection=[...selected.value]
 running.value=true;error.value='';progress.value=0;processingTotal.value=0
 let attempted=false
 try{
  let items=selection
  if(all){
   items=[]
   for(let p=1;p<=Math.ceil(total.value/50);p++){const r=await request('/admin/bulk-content?'+new URLSearchParams({...scope,page:String(p)}));items.push(...r.items)}
   items=[...new Map(items.map(r=>[r.id,r])).values()]
  }
  if(!items.length)throw new Error('没有可操作的内容，请刷新后重试')
  if(items.length>10000)throw new Error('单次最多10000条，请缩小筛选范围')
  const exam=props.exams.find(e=>e.id===scope.examId)?.name||'全部考试'
  const source=scope.test==='true'?'测试内容':scope.test==='false'?'正式内容':'正式及测试内容'
  try{await ElMessageBox.confirm('本次将'+operation.label+' '+items.length+' 条'+(all?'筛选结果':'所选内容')+'。范围：'+exam+' · '+source+' · '+(bulkKindLabels[scope.kind]||'全部类型')+'。'+operation.description+(props.module==='knowledge'?' 目录状态会影响下级内容的可见性，但不会批量改写下级状态。':''),'批量'+operation.label,{type:'warning',confirmButtonText:'确认'+operation.label,cancelButtonText:'取消'})}catch{return}
  attempted=true;results.value=[];resultPage.value=1;onlyFailures.value=false;processingTotal.value=items.length
  for(let offset=0;offset<items.length;offset+=100){
   const r=await send('/admin/bulk-content/apply',{action:operation.value,items:items.slice(offset,offset+100).map(x=>({id:x.id,version:x.version})),filters:scope})
   results.value.push(...r.results);progress.value=Math.round(results.value.length/items.length*100)
  }
 }catch(e:any){error.value=e.message+(attempted?'；已返回的结果已保存。若请求中断，请刷新后核对当前状态再操作。':'')}
 finally{if(attempted){const failure=error.value;await load();if(failure)error.value=failure;emit('changed')}running.value=false}
}
watch(page,load);onMounted(load)
</script>
<template>
 <section class="bulk-manager">
  <p class="bulk-intro">{{module==='articles'?'当前仅操作文章，使用文章管理的上下架状态。':'状态与当前模块一致：草稿、审核中、已发布、停用。启用恢复停用前的状态。'}} 正式内容和测试内容均可操作。<template v-if="module==='knowledge'">仅包含科目、章、节、知识点；停用上级目录会隐藏下级内容。</template></p>
  <form class="admin-filters" @submit.prevent="search">
   <label class="admin-filter-field"><span>标题 / 唯一 ID</span><el-input v-model="filters.search" :disabled="busy" placeholder="搜索标题或唯一 ID" clearable @clear="search"/></label>
   <label class="admin-filter-field"><span>数据标记</span><el-select v-model="filters.test" aria-label="数据标记" :empty-values="[null,undefined]" :disabled="busy" @change="search"><el-option label="全部内容" value=""/><el-option label="正式内容" value="false"/><el-option label="测试内容" value="true"/></el-select></label>
   <label class="admin-filter-field"><span>考试项目</span><el-select v-model="filters.examId" aria-label="考试项目" :disabled="!!examId||busy" :empty-values="[null,undefined]" @change="search"><el-option label="全部考试" value=""/><el-option v-for="e in exams" :key="e.id" :value="e.id" :label="e.name"/></el-select></label>
   <label class="admin-filter-field"><span>内容类型</span><el-select v-model="filters.kind" aria-label="内容类型" :disabled="busy" :empty-values="[null,undefined]" @change="search"><el-option label="全部类型" value=""/><el-option v-for="(label,key) in availableKinds" :key="key" :value="key" :label="label"/></el-select></label>
   <label class="admin-filter-field"><span>当前状态</span><el-select v-model="filters.status" aria-label="当前状态" :disabled="busy" :empty-values="[null,undefined]" @change="search"><el-option label="全部状态" value=""/><el-option v-for="(label,key) in statuses" :key="key" :value="key" :label="label"/></el-select></label>
   <el-button native-type="submit" :disabled="busy">查询</el-button>
  </form>
  <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon/>
  <div class="bulk-actions">
   <div><strong>已选 {{selected.length}} 条</strong><span> · 当前筛选共 {{total}} 条</span></div>
   <div class="bulk-buttons">
    <el-select v-model="action" aria-label="批量操作类型" :disabled="busy"><el-option v-for="a in actions" :key="a.value" :value="a.value" :label="a.label"/></el-select>
    <el-button type="primary" :disabled="busy||!selected.length" @click="run()">{{choice.label}}所选</el-button>
    <el-button :disabled="busy||!total||total>10000" @click="run(true)">{{choice.label}}全部筛选结果</el-button>
   </div>
  </div>
  <p class="bulk-help">{{choice.description}}</p>
  <el-progress v-if="running&&processingTotal" :percentage="progress"/><p v-if="running" role="status">{{processingTotal?'正在处理，请勿关闭弹窗…':'正在准备本次操作…'}}</p>
  <el-table v-loading="loading" :data="rows" row-key="id" max-height="360" @selection-change="selected=$event">
   <el-table-column type="selection" width="45" :selectable="()=>!running"/>
   <el-table-column label="标题" min-width="230"><template #default="{row}"><button class="table-title" :disabled="running" @click="emit('edit',row)">{{row.title}}</button></template></el-table-column>
   <el-table-column prop="id" label="唯一 ID" min-width="210"/>
   <el-table-column label="类型" width="90"><template #default="{row}">{{bulkKindLabels[row.kind]||row.kind}}</template></el-table-column>
   <el-table-column label="数据标记" width="105"><template #default="{row}">{{row.is_test_data?'测试内容':'正式内容'}}</template></el-table-column>
   <el-table-column label="状态" width="150"><template #default="{row}"><el-tag :type="row.status==='published'?'success':'info'">{{bulkStatusesFor(row.kind)[row.status]}}</el-tag></template></el-table-column>
  </el-table>
  <el-pagination v-model:current-page="page" :disabled="busy" :total="total" :page-size="50" layout="total,prev,pager,next"/>
  <section v-if="results.length" class="bulk-results" aria-label="批量操作结果">
   <div class="bulk-actions"><strong role="status">成功 {{results.length-failures.length}} 条，失败 {{failures.length}} 条</strong><el-checkbox v-model="onlyFailures" @change="resultPage=1">只看失败项</el-checkbox></div>
   <el-table :data="shownResults" max-height="260" row-key="id"><el-table-column prop="title" label="内容" min-width="200"/><el-table-column prop="id" label="唯一 ID" min-width="210"/><el-table-column label="结果" min-width="300"><template #default="{row}"><span :class="{'result-error':!row.success}">{{row.message}}</span></template></el-table-column></el-table>
   <el-pagination v-model:current-page="resultPage" :total="(onlyFailures?failures:results).length" :page-size="10" layout="total,prev,pager,next"/>
  </section>
 </section>
</template>
<style scoped>
.bulk-intro,.bulk-help{font-size:13px;line-height:1.7;color:var(--el-text-color-regular);margin:0 0 16px}.admin-filters .admin-filter-field{flex-basis:150px;min-width:130px}.bulk-actions,.bulk-buttons{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.bulk-actions{justify-content:space-between;margin:16px 0 10px}.bulk-actions span{color:var(--el-text-color-regular);font-size:13px}.bulk-buttons .el-select{width:145px}.bulk-buttons .el-button{margin-left:0}.el-alert,.el-pagination{margin:16px 0}.bulk-results{margin-top:24px;padding-top:8px;border-top:1px solid var(--admin-border)}.result-error{color:var(--el-color-danger)}.bulk-help{margin-bottom:16px}
</style>
