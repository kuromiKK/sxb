<script setup lang="ts">
import {computed,nextTick,onMounted,onBeforeUnmount,reactive,ref,watch} from 'vue'
import {ElMessage} from 'element-plus'
import {Users,BookOpen,ClipboardCheck,Send,Search,RotateCcw,Eye,Info,CalendarDays,Copy,ArrowUpRight} from 'lucide-vue-next'
import {request} from './api'
import LearningTrend from './LearningTrend.vue'
import LearningCollections from './LearningCollections.vue'
const collections=ref<InstanceType<typeof LearningCollections>|null>(null)
const collectionTabs=['answers','wrong','favorites','notes']
const tab=ref('overview'),exams=ref<any[]>([]),busy=ref(false),error=ref(''),overview=ref<any>(),rows=ref<any[]>([]),total=ref(0),page=ref(1),detail=ref<any>(),detailOpen=ref(false),detailBusy=ref(false)
const day=(n=0)=>new Date(Date.now()+8*3600000-n*86400000).toISOString().slice(0,10)
const dates=ref<[string,string]>([day(6),day()]),examId=ref(''),preset=ref('7')
const filters=reactive({user:'',title:'',kind:''})
const kinds:Record<string,string>={subject:'科目正文',chapter:'章正文',section:'节正文',knowledge:'知识点',course:'课程'}
const types:Record<string,string>={article:'图文',video:'视频',audio:'音频'}
const fmt=(v:any)=>v?new Date(v).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'—'
const position=(n:number|null)=>n==null?'尚无播放位置':`${Math.floor(n/60)}分${String(n%60).padStart(2,'0')}秒`
const number=(n:number)=>Number(n||0).toLocaleString('zh-CN')
const metrics=computed(()=>[
 {key:'visitors',label:'内容访问人数',unit:'人',icon:Users,note:'所选时间内，访问过学习内容的去重用户',tone:'blue'},
 {key:'visits',label:'内容访问次数',unit:'次',icon:BookOpen,note:'每次进入内容计一次，同次访问重试不重复计数',tone:'violet'},
 {key:'answerers',label:'提交答题人数',unit:'人',icon:ClipboardCheck,note:'所选时间内，提交过有效答案的去重用户',tone:'green'},
 {key:'answers',label:'提交答题次数',unit:'次',icon:Send,note:'每道题每次有效提交计一次，含待判分的主观题',tone:'amber'},
])
let revision=0,disposed=false,detailRevision=0
function query(){if(!dates.value?.[0]||!dates.value?.[1])throw new Error('请选择完整的统计时间');return {examId:examId.value,from:dates.value[0],to:dates.value[1]}}
async function load(){
 if(collectionTabs.includes(tab.value)){revision++;busy.value=false;await nextTick();await collections.value?.load();return}
 const rev=++revision;busy.value=true;error.value=''
 try{
  const common=query(),params=new URLSearchParams(common)
  const data=tab.value==='overview'?await request('/admin/learning-data/overview?'+params):await request('/admin/learning-data/visits?'+new URLSearchParams({...common,...filters,page:String(page.value)}))
  if(disposed||rev!==revision)return
  if(tab.value==='overview')overview.value=data;else{rows.value=data.items;total.value=data.total}
 }catch(e:any){if(rev===revision){error.value=e.message;overview.value=undefined;rows.value=[];total.value=0}}
 finally{if(rev===revision)busy.value=false}
}
function search(){if(page.value!==1)page.value=1;else void load()}
function choosePreset(value:string){preset.value=value;dates.value=[day(Number(value)-1),day()];search()}
function reset(){examId.value='';dates.value=[day(6),day()];preset.value='7';Object.assign(filters,{user:'',title:'',kind:''});search()}
async function inspect(row:any){const rev=++detailRevision;detail.value=null;detailOpen.value=true;detailBusy.value=true;try{const result=await request('/admin/learning-data/visits/'+encodeURIComponent(row.id));if(rev===detailRevision)detail.value=result}catch(e:any){ElMessage.error(e.message);detailOpen.value=false}finally{if(rev===detailRevision)detailBusy.value=false}}
async function copy(){try{await navigator.clipboard.writeText(detail.value.id);ElMessage.success('已复制唯一标识')}catch{ElMessage.error('复制失败，请手动复制')}}
watch(page,load);watch(tab,()=>{if(collectionTabs.includes(tab.value)){revision++;busy.value=false;return}if(page.value!==1)page.value=1;else void load()})
onMounted(async()=>{void load();try{exams.value=await request('/admin/exam-projects')}catch(e:any){error.value=e.message}})
onBeforeUnmount(()=>{disposed=true;revision++;detailRevision++})
async function openAnswer(id:string){tab.value='answers';await nextTick();await collections.value?.inspect({id},'answers')}
defineExpose({load,openAnswer})
</script>
<template>
 <section class="learning-data">
  <el-tabs v-model="tab" class="learning-tabs" aria-label="学习数据类型"><el-tab-pane label="学习概览" name="overview"/><el-tab-pane label="学习记录" name="records"/><el-tab-pane label="答题记录" name="answers"/><el-tab-pane label="错题本" name="wrong"/><el-tab-pane label="收藏" name="favorites"/><el-tab-pane label="笔记" name="notes"/></el-tabs>
  <LearningCollections v-if="collectionTabs.includes(tab)" :key="tab" ref="collections" :kind="tab" :exams="exams"/>
  <template v-else>
  <form class="admin-filters" @submit.prevent="search">
   <label class="admin-filter-field"><span>考试项目</span><el-select v-model="examId" filterable :empty-values="[null,undefined]" aria-label="考试项目"><el-option label="全部考试" value=""/><el-option v-for="e in exams" :key="e.id" :label="e.name" :value="e.id"/></el-select></label>
   <label class="admin-filter-field learning-date"><span>{{tab==='overview'?'统计时间':'访问开始时间'}}</span><el-date-picker v-model="dates" type="daterange" value-format="YYYY-MM-DD" start-placeholder="开始日期" end-placeholder="结束日期" range-separator="至" :clearable="false" @change="preset=''"/></label>
   <template v-if="tab==='records'"><label class="admin-filter-field"><span>用户</span><el-input v-model="filters.user" placeholder="昵称或手机号" clearable aria-label="筛选用户"/></label><label class="admin-filter-field"><span>内容标题</span><el-input v-model="filters.title" placeholder="搜索学习内容" clearable aria-label="内容标题"/></label><label class="admin-filter-field"><span>内容类型</span><el-select v-model="filters.kind" :empty-values="[null,undefined]" aria-label="内容类型"><el-option label="全部类型" value=""/><el-option v-for="(name,key) in kinds" :key="key" :value="key" :label="name"/></el-select></label></template>
   <div class="admin-filter-actions"><el-button type="primary" native-type="submit"><Search :size="16"/>查询</el-button><el-button @click="reset"><RotateCcw :size="16"/>重置</el-button></div>
  </form>
  <div class="learning-range"><div class="range-shortcuts"><button v-for="n in ['1','7','30']" :key="n" :class="{selected:preset===n}" :aria-pressed="preset===n" @click="choosePreset(n)">{{n==='1'?'今天':'近'+n+'天'}}</button></div><span><CalendarDays :size="14"/>北京时间 · 自然日统计 · 最长366天</span></div>
  <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon/>
  <div v-loading="busy" class="learning-body" :aria-busy="busy">
   <template v-if="tab==='overview'&&overview">
    <div class="learning-metrics"><article v-for="metric in metrics" :key="metric.key"><div class="learning-metric-top"><span>{{metric.label}}</span><span class="learning-metric-icon" :class="metric.tone"><component :is="metric.icon" :size="20" aria-hidden="true"/></span></div><div class="learning-metric-value">{{number(overview.total[metric.key])}}<small>{{metric.unit}}</small></div><p>{{metric.note}}</p></article></div>
    <div class="learning-charts"><LearningTrend title="内容访问趋势" subtitle="成功进入学习内容后记录，不含目录与锁定页" :series="overview.series" count-key="visits" people-key="visitors"/><LearningTrend title="答题提交趋势" subtitle="按题目提交计数，重复请求与判分更新不再计数" :series="overview.series" count-key="answers" people-key="answerers" tone="var(--el-color-success)"/></div>
    <section class="learning-definition"><Info :size="20"/><div><h3>数据口径</h3><p>内容访问自 {{fmt(overview.collectedSince)}} 开始记录，历史访问不补造；答题统计包含系统已有的有效提交。仅统计已登录用户。</p><p>人数按当前考试与时间范围去重；一张20题试卷全部提交计20次，组合题按一整题的一次提交计数。不推算学习时长、活跃程度或掌握程度。</p><small>数据生成于 {{fmt(overview.generatedAt)}}</small></div><el-button link type="primary" @click="tab='records'">查看学习记录<ArrowUpRight :size="15"/></el-button></section>
   </template>
   <template v-else-if="tab==='records'">
    <div class="table-toolbar"><span>访问记录 <b>{{number(total)}}</b></span><span class="learning-table-note">一次内容访问一条记录 · 播放位置不等于观看时长</span></div>
    <el-table :data="rows" row-key="id"><template #empty><el-empty description="当前条件下暂无学习记录" :image-size="80"><p class="learning-empty-note">上线后的真实内容访问会显示在这里，您也可以调整考试或日期。</p></el-empty></template>
     <el-table-column label="用户" min-width="155"><template #default="{row}"><strong class="learning-user">{{row.nickname}}</strong><small class="cell-sub">{{row.phone}}</small></template></el-table-column>
     <el-table-column label="学习内容" min-width="260"><template #default="{row}"><el-tooltip :content="row.title" placement="top"><button class="learning-title" @click="inspect(row)">{{row.title}}</button></el-tooltip><small class="cell-sub">{{row.path.slice(1,-1).join(' / ')||'—'}}</small></template></el-table-column>
     <el-table-column prop="exam_name" label="考试项目" min-width="165"/>
     <el-table-column label="内容类型" width="140"><template #default="{row}"><el-tag effect="plain" :type="row.kind==='course'?'success':'primary'">{{kinds[row.kind]||row.kind}}{{row.kind==='course'?' · '+(types[row.media_type]||'图文'):''}}</el-tag></template></el-table-column>
     <el-table-column label="开始时间" width="182"><template #default="{row}">{{fmt(row.started_at)}}</template></el-table-column>
     <el-table-column label="最近活动时间" width="182"><template #default="{row}">{{fmt(row.last_activity_at)}}</template></el-table-column>
     <el-table-column label="记录结果" min-width="160"><template #default="{row}">{{row.position_seconds==null?'已访问':'播放位置 '+position(row.position_seconds)}}</template></el-table-column>
     <el-table-column label="操作" width="72" fixed="right"><template #default="{row}"><el-tooltip content="查看详情"><el-button link type="primary" aria-label="查看学习记录详情" @click="inspect(row)"><Eye :size="18"/></el-button></el-tooltip></template></el-table-column>
    </el-table><div class="pagination"><span>共 {{total}} 条</span><el-pagination v-model:current-page="page" :page-size="20" :total="total" layout="prev,pager,next"/></div>
   </template>
  </div>
  </template>
 </section>
 <el-drawer v-model="detailOpen" title="学习记录详情" size="min(620px,100vw)" :close-on-click-modal="false" @closed="detailRevision++">
  <div v-loading="detailBusy" class="learning-detail" v-if="detailOpen"><template v-if="detail"><el-tag effect="plain">{{kinds[detail.kind]}}</el-tag><h2>{{detail.title}}</h2><p class="learning-path">{{detail.path.join(' / ')}}</p><button class="learning-identifier" @click="copy">唯一标识(ID)：{{detail.id}}<Copy :size="14"/></button>
   <el-descriptions :column="1" border><el-descriptions-item label="用户">{{detail.nickname}} · {{detail.phone}}</el-descriptions-item><el-descriptions-item label="考试项目">{{detail.exam_name}}</el-descriptions-item><el-descriptions-item label="访问开始">{{fmt(detail.started_at)}}</el-descriptions-item><el-descriptions-item label="最近活动">{{fmt(detail.last_activity_at)}}</el-descriptions-item><el-descriptions-item label="内容形式">{{types[detail.media_type]||'图文'}}</el-descriptions-item><el-descriptions-item label="记录结果">已访问</el-descriptions-item><template v-if="['video','audio'].includes(detail.media_type)"><el-descriptions-item label="最后播放位置">{{position(detail.position_seconds)}}</el-descriptions-item><el-descriptions-item label="媒体总时长">{{detail.duration_seconds?position(detail.duration_seconds):'尚未上报'}}</el-descriptions-item></template></el-descriptions>
   <div class="learning-detail-note"><Info :size="18"/><p>这是一次内容访问的关键结果，不记录逐次播放、暂停或拖动操作。访问不代表学会，播放位置不代表实际观看时长；未收到离开事件时不推算结束时间。</p></div>
  </template></div><template #footer><el-button @click="detailOpen=false">关闭</el-button></template>
 </el-drawer>
</template>
<style scoped>
.learning-data{color:var(--el-text-color-primary)}.learning-tabs{margin-bottom:10px}.learning-tabs :deep(.el-tabs__item){font-weight:600;font-size:15px;height:46px}.learning-date{flex:1.5 1 330px;min-width:0}.learning-date :deep(.el-date-editor){width:100%;box-sizing:border-box}.learning-range{display:flex;align-items:center;justify-content:space-between;gap:16px;margin:16px 0 24px}.learning-range>span{display:flex;align-items:center;gap:6px;color:var(--el-text-color-regular);font-size:12px}.range-shortcuts{display:flex;gap:6px}.range-shortcuts button{border:1px solid transparent;border-radius:6px;padding:8px 14px;font:inherit;font-size:12px;background:var(--el-fill-color-light);color:var(--el-text-color-regular);cursor:pointer;min-height:36px}.range-shortcuts button.selected{background:var(--el-color-primary-light-9);color:var(--el-color-primary);border-color:var(--el-color-primary-light-7)}.range-shortcuts button:hover{border-color:var(--el-color-primary)}.learning-body{min-height:300px}.learning-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:18px;margin-bottom:22px}.learning-metrics article{padding:22px;background:var(--el-bg-color);border:1px solid var(--el-border-color-light);border-radius:14px}.learning-metric-top{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:13px;font-weight:500}.learning-metric-icon{display:grid;place-items:center;width:38px;height:38px;border-radius:10px;flex:none;color:var(--el-color-primary);background:var(--el-color-primary-light-9)}.learning-metric-icon.green{color:var(--el-color-success);background:var(--el-color-success-light-9)}.learning-metric-icon.amber{color:var(--el-color-warning);background:var(--el-color-warning-light-9)}.learning-metric-icon.violet{color:#7757c7;background:#f3efff}.learning-metric-value{margin:14px 0 12px;font-size:34px;font-weight:650;line-height:1.2;font-variant-numeric:tabular-nums}.learning-metric-value small{font-size:12px;font-weight:400;color:var(--el-text-color-regular);margin-left:8px}.learning-metrics p{font-size:12px;line-height:1.8;color:var(--el-text-color-regular);margin:0}.learning-charts{display:grid;grid-template-columns:1fr 1fr;gap:22px}.learning-definition{display:flex;align-items:flex-start;gap:14px;padding:22px;margin-top:22px;border:1px solid var(--el-border-color-light);border-radius:12px;background:var(--el-fill-color-extra-light)}.learning-definition>svg{flex:none;color:var(--el-color-primary);margin-top:2px}.learning-definition>div{flex:1;min-width:0}.learning-definition h3{font-size:14px;margin:0 0 10px}.learning-definition p{font-size:12px;line-height:1.9;margin:5px 0;color:var(--el-text-color-regular)}.learning-definition small{display:block;margin-top:12px;font-size:12px;color:var(--el-text-color-regular)}.learning-table-note,.learning-empty-note{font-size:12px;color:var(--el-text-color-regular)}.learning-user{font-weight:500}.learning-title{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;text-align:left;border:0;background:none;font:inherit;line-height:1.7;color:var(--el-text-color-primary);padding:0;cursor:pointer;overflow-wrap:anywhere}.learning-title:hover{color:var(--el-color-primary)}.learning-detail{min-height:200px}.learning-detail h2{font-size:22px;line-height:1.6;margin:14px 0}.learning-path{font-size:13px;color:var(--el-text-color-regular);line-height:1.8}.learning-identifier{display:flex;align-items:center;gap:6px;text-align:left;overflow-wrap:anywhere;border:0;background:none;padding:0;margin:16px 0 24px;color:var(--el-text-color-regular);font-size:12px;cursor:pointer}.learning-detail-note{display:flex;align-items:flex-start;gap:10px;padding:16px;background:var(--el-fill-color-light);border-radius:8px;margin-top:22px}.learning-detail-note svg{flex:none;color:var(--el-color-primary)}.learning-detail-note p{margin:0;font-size:12px;line-height:1.9;color:var(--el-text-color-regular)}@media(max-width:1200px){.learning-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.learning-charts{grid-template-columns:1fr}}@media(max-width:600px){.learning-range{align-items:flex-start;flex-direction:column;gap:12px}.learning-metrics{gap:10px}.learning-metrics article{padding:14px}.learning-metric-value{font-size:28px}.learning-metric-top{align-items:flex-start}.learning-metric-icon{width:28px;height:28px}.learning-definition{display:grid;grid-template-columns:20px minmax(0,1fr);padding:16px}.learning-definition>.el-button{grid-column:2;justify-self:start}.learning-table-note{display:none}.learning-empty-note{max-width:250px;line-height:1.8}.learning-date{flex-basis:100%;width:100%}.learning-detail h2{font-size:19px}}
</style>
