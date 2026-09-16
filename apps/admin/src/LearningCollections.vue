<script setup lang="ts">
import {computed,onMounted,onBeforeUnmount,reactive,ref,shallowRef,watch} from 'vue'
import {ElMessage} from 'element-plus'
import {Search,RotateCcw,Eye,Info} from 'lucide-vue-next'
import {request} from './api'
import LearningQuestionDetail from './LearningQuestionDetail.vue'
import ProductDocument from './ProductDocument.vue'
import RecordIdentifier from './RecordIdentifier.vue'
const props=defineProps<{kind:string;exams:any[];scopeUrl?:string}>()
const rows=shallowRef<any[]>([]),detail=shallowRef<any>(),types=shallowRef<any[]>([]),page=ref(1),total=ref(0),busy=ref(false),error=ref(''),open=ref(false),detailBusy=ref(false),detailError=ref('')
const filters=reactive({examId:'',user:'',title:'',text:'',kind:'',typeId:'',result:''}),dates=ref<string[]>([])
const configs:Record<string,any>={answers:{title:'答题记录',time:'提交时间'},wrong:{title:'错题本',time:'最近答错时间'},favorites:{title:'收藏',time:'收藏时间'},notes:{title:'笔记',time:'更新时间'}}
const config=computed(()=>configs[props.kind]),isQuestion=computed(()=>['answers','wrong'].includes(props.kind))
const names:Record<string,string>={question:'题目',knowledge:'知识点',course:'课程',unknown:'原内容已不存在'}
const typeNames:Record<string,string>={single:'单选题',multiple:'多选题',boolean:'判断题',subjective:'主观题',configured:'自定义题型'}
const statuses:Record<string,string>={ai_pending:'等待 AI 判分',ai_processing:'AI 判分中',ai_failed:'AI 判分失败',self_review:'待用户自评',self_graded:'已自评',ai_graded:'AI 已判分'}
const fmt=(v:any)=>v?new Date(v).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'—'
const resultLabel=(r:any)=>r.correct===true?'正确':r.correct===false?'错误':statuses[r.grading_status]||'未记录'
const tone=(r:any)=>r.correct===true?'success':r.correct===false?'danger':r.grading_status==='ai_failed'?'danger':r.score!=null?'info':'warning'
const short=(v:string,n=50)=>Array.from(v||'').length>n?Array.from(v).slice(0,n).join('')+'…':v
const question=computed(()=>detail.value?.question_snapshot||detail.value?.current_payload)
let revision=0,detailRevision=0,disposed=false
async function load(){const rev=++revision;busy.value=true;error.value='';try{const params=new URLSearchParams({...filters,page:String(page.value)});if(dates.value?.length===2){params.set('from',dates.value[0]);params.set('to',dates.value[1])}const data=await request((props.scopeUrl||'/admin/learning-data')+'/collections/'+props.kind+'?'+params);if(disposed||rev!==revision)return;rows.value=data.items;total.value=data.total;if(page.value>1&&!data.items.length)page.value=Math.max(1,Math.ceil(data.total/20))}catch(e:any){if(rev===revision){error.value=e.message;rows.value=[];total.value=0}}finally{if(rev===revision)busy.value=false}}
function search(){if(page.value===1)void load();else page.value=1}
function reset(){Object.assign(filters,{examId:'',user:'',title:'',text:'',kind:'',typeId:'',result:''});dates.value=[];search()}
async function inspect(row:{id:string},kind=props.kind){const rev=++detailRevision;detail.value=undefined;detailError.value='';detailBusy.value=true;open.value=true;try{const data=await request((props.scopeUrl||'/admin/learning-data')+'/collections/'+kind+'/'+encodeURIComponent(row.id));if(!disposed&&rev===detailRevision)detail.value=data}catch(e:any){if(rev===detailRevision)detailError.value=e.message}finally{if(rev===detailRevision)detailBusy.value=false}}
watch(page,load)
onMounted(async()=>{void load();try{types.value=await request('/admin/question-types')}catch(e:any){ElMessage.error(e.message)}})
onBeforeUnmount(()=>{disposed=true;revision++;detailRevision++})
defineExpose({load,inspect})
</script>
<template>
 <section class="learning-collections">
  <form class="admin-filters" @submit.prevent="search">
   <label v-if="!scopeUrl" class="admin-filter-field"><span>用户</span><el-input v-model="filters.user" placeholder="昵称或手机号" aria-label="筛选用户" clearable/></label>
   <label v-if="!scopeUrl" class="admin-filter-field"><span>考试项目</span><el-select v-model="filters.examId" filterable aria-label="考试项目" :empty-values="[null,undefined]"><el-option label="全部考试" value=""/><el-option v-for="e in exams" :key="e.id" :label="e.name" :value="e.id"/></el-select></label>
   <label class="admin-filter-field"><span>{{isQuestion?'题目标题':'关联内容'}}</span><el-input v-model="filters.title" placeholder="搜索标题" aria-label="内容标题" clearable/></label>
   <template v-if="isQuestion">
    <label class="admin-filter-field"><span>题型</span><el-select v-model="filters.typeId" filterable aria-label="题型" :empty-values="[null,undefined]"><el-option label="全部题型" value=""/><el-option v-for="t in types" :key="t.id" :label="t.name" :value="t.id"/></el-select></label>
    <label class="admin-filter-field"><span>{{kind==='wrong'?'最近作答结果':'作答结果'}}</span><el-select v-model="filters.result" aria-label="作答结果" :empty-values="[null,undefined]"><el-option label="全部结果" value=""/><el-option label="正确" value="correct"/><el-option label="错误" value="wrong"/><el-option v-for="(label,value) in statuses" :key="value" :label="label" :value="value"/></el-select></label>
   </template>
   <label v-else class="admin-filter-field"><span>内容类型</span><el-select v-model="filters.kind" aria-label="内容类型" :empty-values="[null,undefined]"><el-option label="全部类型" value=""/><el-option v-for="k in ['question','knowledge','course']" :key="k" :label="names[k]" :value="k"/></el-select></label>
   <label v-if="kind==='notes'" class="admin-filter-field"><span>笔记内容</span><el-input v-model="filters.text" placeholder="搜索笔记文字" aria-label="笔记内容" clearable/></label>
   <label class="admin-filter-field collection-date"><span>{{config.time}}</span><el-date-picker v-model="dates" type="daterange" value-format="YYYY-MM-DD" start-placeholder="不限开始日期" end-placeholder="不限结束日期" range-separator="至"/></label>
   <div class="admin-filter-actions"><el-button type="primary" native-type="submit"><Search :size="16"/>查询</el-button><el-button @click="reset"><RotateCcw :size="16"/>重置</el-button></div>
  </form>
  <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon/>
  <div class="table-toolbar"><span>{{config.title}} <b>{{total.toLocaleString()}}</b></span><small>只读查看 · 时间为北京时间</small></div>
  <el-table v-loading="busy" :data="rows" row-key="id" :aria-busy="busy">
   <template #empty><el-empty :description="'当前条件下暂无'+config.title" :image-size="86"/></template>
   <el-table-column v-if="!scopeUrl" label="用户" min-width="145"><template #default="{row}"><span>{{row.nickname}}</span><small class="collection-sub">{{row.phone}}</small></template></el-table-column>
   <el-table-column :label="isQuestion?'题目':'关联内容'" min-width="280"><template #default="{row}"><button class="collection-title" :title="row.title" @click="inspect(row)">{{short(row.title)}}</button><small class="collection-sub">{{row.exam_name||'考试已不存在'}}</small></template></el-table-column>
   <el-table-column :label="isQuestion?'题型':'内容类型'" width="130"><template #default="{row}"><el-tag effect="plain" type="info">{{isQuestion?(row.type_name||typeNames[row.type_id]||'自定义题型'):names[row.kind]}}</el-tag></template></el-table-column>
   <el-table-column v-if="kind==='notes'" label="笔记内容" min-width="260"><template #default="{row}"><span class="note-excerpt">{{row.note_preview||'空白笔记'}}</span></template></el-table-column>
   <el-table-column v-if="kind==='wrong'" label="累计答错" width="100"><template #default="{row}"><span class="wrong-count">{{row.wrong_count}}</span> 次</template></el-table-column>
   <el-table-column v-if="isQuestion" :label="kind==='wrong'?'最近作答':'作答结果'" width="145"><template #default="{row}"><el-tag :type="tone(row)" effect="light">{{resultLabel(row)}}</el-tag><small v-if="row.score!=null" class="collection-sub">{{row.score}} / {{row.max_score??'—'}} 分</small></template></el-table-column>
   <el-table-column v-else label="内容状态" width="110"><template #default="{row}"><el-tag :type="row.content_status==='published'?'success':'info'" effect="light">{{row.content_status==='published'?'已发布':row.content_status==='draft'?'草稿':row.content_status?'已停用':'已不存在'}}</el-tag></template></el-table-column>
   <el-table-column :label="config.time" width="183"><template #default="{row}">{{fmt(kind==='wrong'?row.last_wrong_at:kind==='notes'?row.updated_at:row.created_at)}}</template></el-table-column>
   <el-table-column label="操作" width="72" fixed="right"><template #default="{row}"><el-tooltip content="查看详情"><el-button link type="primary" :aria-label="'查看'+config.title+'详情'" @click="inspect(row)"><Eye :size="18"/></el-button></el-tooltip></template></el-table-column>
  </el-table>
  <div class="pagination"><span>共 {{total}} 条</span><el-pagination v-model:current-page="page" :page-size="20" :total="total" layout="prev,pager,next"/></div>
 </section>
 <el-drawer v-model="open" :title="config.title+'详情'" size="min(760px,100vw)" :close-on-click-modal="false" @close="detailRevision++">
  <div v-loading="detailBusy" class="collection-detail">
   <el-alert v-if="detailError" :title="detailError" type="error" :closable="false" show-icon/>
   <template v-if="detail">
    <div class="detail-heading"><el-tag v-if="isQuestion" :type="tone(detail)">{{resultLabel(detail)}}</el-tag><el-tag v-else effect="plain">{{names[detail.kind]}}</el-tag><h2>{{detail.title}}</h2><p>{{[detail.exam_name,...detail.path].filter(Boolean).join(' / ')}}</p></div>
    <RecordIdentifier :id="detail.record_id" :table="detail.source==='configured'?'question_submissions':detail.source==='legacy'?'answers':'user_records'"/>
    <el-descriptions :column="1" border><el-descriptions-item label="用户">{{detail.nickname}} · {{detail.phone}}</el-descriptions-item><el-descriptions-item label="考试项目">{{detail.exam_name}}</el-descriptions-item><el-descriptions-item :label="kind==='notes'?'创建时间':kind==='favorites'?'收藏时间':'提交时间'">{{fmt(detail.created_at)}}</el-descriptions-item><el-descriptions-item label="更新时间">{{fmt(detail.updated_at)}}</el-descriptions-item>
     <template v-if="isQuestion"><el-descriptions-item label="题型">{{detail.type_name||typeNames[detail.type_id]||'自定义题型'}}</el-descriptions-item><el-descriptions-item label="得分">{{detail.score==null?'未记录或尚未完成判分':detail.score+' / '+detail.max_score+' 分'}}{{detail.contains_self_score?'（含用户自评分）':''}}</el-descriptions-item></template>
     <template v-if="detail.wrong_count"><el-descriptions-item label="累计答错">{{detail.wrong_count}} 次</el-descriptions-item><el-descriptions-item label="首次答错">{{fmt(detail.first_wrong_at)}}</el-descriptions-item><el-descriptions-item label="最近答错">{{fmt(detail.last_wrong_at)}}</el-descriptions-item></template>
    </el-descriptions>
    <section v-if="kind==='notes'" class="detail-section"><h3>笔记正文</h3><div class="note-body">{{detail.note||'空白笔记'}}</div></section>
    <section v-if="detail.knowledgePoints.length" class="detail-section"><h3>当前关联知识点</h3><ul class="knowledge-links"><li v-for="k in detail.knowledgePoints" :key="k.id">{{k.title}}</li></ul></section>
    <section class="detail-section"><h3>{{isQuestion?'题目与作答':'关联内容'}}</h3>
     <el-alert v-if="isQuestion" :title="detail.question_snapshot?'题目为提交时保存的版本；目录与知识点为当前关联信息。':'此历史记录未保存题目版本。以下为当前题目，仅供参考；已记录的答案与判分保留原值。'" :type="detail.question_snapshot?'info':'warning'" :closable="false" show-icon/>
     <el-alert v-else-if="detail.content_status!=='published'" title="原内容已停用或不存在；用户保存的笔记和收藏记录仍保留。" type="warning" :closable="false" show-icon/>
     <LearningQuestionDetail v-if="detail.kind==='question'&&question" :question="question" :selection="detail.selection" :result="detail.result" :show-answer="isQuestion"/>
     <template v-else-if="detail.current_payload"><p class="content-description">{{detail.current_payload.summary||detail.current_payload.description||detail.current_payload.intro||''}}</p><ProductDocument v-if="detail.current_payload.document" :document="detail.current_payload.document"/><p v-else-if="detail.current_payload.content" class="content-description">{{detail.current_payload.content}}</p><p v-if="detail.kind==='course'" class="collection-muted">课程形式：{{({article:'图文',video:'视频',audio:'音频'} as any)[detail.current_payload.type]||'图文'}}。此处展示关联信息与图文正文。</p></template>
     <el-empty v-else description="原内容已不存在" :image-size="60"/>
    </section>
    <section v-if="detail.history" class="detail-section"><h3>最近 20 次作答</h3><p class="collection-muted">完整历史可在答题记录中按用户与题目查询。</p><el-table :data="detail.history"><el-table-column label="提交时间" min-width="175"><template #default="{row}">{{fmt(row.created_at)}}</template></el-table-column><el-table-column label="结果" min-width="110"><template #default="{row}">{{resultLabel(row)}}</template></el-table-column><el-table-column label="得分" width="100"><template #default="{row}">{{row.score??'—'}}</template></el-table-column></el-table></section>
    <div class="collection-hint"><Info :size="17" aria-hidden="true"/><span>此处仅供查看，不代替用户修改、删除或移出数据。</span></div>
   </template>
  </div><template #footer><el-button @click="open=false">关闭</el-button></template>
 </el-drawer>
</template>
<style scoped>
.learning-collections{min-width:0}.collection-date{flex:1.5 1 330px;min-width:0}.collection-date :deep(.el-date-editor){width:100%;box-sizing:border-box}.collection-sub{display:block;font-size:12px;line-height:1.6;color:var(--el-text-color-regular);margin-top:6px}.collection-title{background:none;border:0;padding:0;text-align:left;font:inherit;line-height:1.7;color:var(--el-text-color-primary);cursor:pointer;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}.collection-title:hover{color:var(--el-color-primary)}.table-toolbar b{background:var(--el-fill-color-light);padding:3px 8px;border-radius:5px;font-size:12px;margin-left:6px}.table-toolbar small,.collection-muted{font-size:12px;color:var(--el-text-color-regular);line-height:1.8}.note-excerpt{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.7}.wrong-count{font-weight:650;color:var(--el-color-danger)}.collection-detail{min-height:220px;overflow-wrap:anywhere}.detail-heading h2{font-size:21px;line-height:1.6;margin:14px 0}.detail-heading p{font-size:12px;line-height:1.8;color:var(--el-text-color-regular)}.collection-id{display:flex;align-items:center;gap:8px;border:1px solid var(--el-border-color-light);border-radius:8px;background:var(--el-fill-color-light);color:var(--el-text-color-regular);font-size:12px;text-align:left;overflow-wrap:anywhere;cursor:pointer;padding:12px;width:100%;margin:18px 0}.collection-id svg{flex:none;margin-left:auto}.detail-section{margin-top:26px}.detail-section h3{font-size:15px;margin:0 0 14px}.note-body{padding:20px;background:var(--el-fill-color-extra-light);border:1px solid var(--el-border-color-light);border-radius:10px;white-space:pre-wrap;font-size:14px;line-height:1.9}.knowledge-links{padding-left:20px;font-size:13px;line-height:1.9}.content-description{white-space:pre-wrap;font-size:14px;line-height:1.9}.collection-hint{display:flex;align-items:flex-start;gap:8px;border-top:1px solid var(--el-border-color-light);padding-top:20px;margin-top:26px;color:var(--el-text-color-regular);font-size:12px;line-height:1.8}.collection-hint svg{flex:none;margin-top:2px}.learning-collections :deep(.el-alert){margin-top:16px}@media(max-width:600px){.collection-date{flex-basis:100%;width:100%}.table-toolbar small{display:none}.detail-heading h2{font-size:18px}.collection-id{font-size:12px}}
</style>
