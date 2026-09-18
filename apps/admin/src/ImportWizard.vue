<script setup lang="ts">
import { computed,onBeforeUnmount,ref,useId } from 'vue'
import { Download,Upload,FileSpreadsheet,Check } from 'lucide-vue-next'
import { request,send } from './api'
import { uploadResource } from './utils/upload-resource'
import { structureFields,structureHeaders,type StructureImportOptions } from '../../shared/structure-import'
const props=defineProps<{exams:any[]}>(),emit=defineEmits(['saved'])
const visible=ref(false),examId=ref(''),fixed=ref(false),kind=ref<'structure'|'question'>('structure'),typeId=ref(''),types=ref<any[]>([]),isTest=ref(false),busy=ref(false),error=ref(''),job=ref<any>(),history=ref<any[]>([]),uploadProgress=ref(0),uploading=ref(false),fileInput=ref<HTMLInputElement>(),activePage=ref(1),onlyErrors=ref(false)
let disposed=false,uploadTask:ReturnType<typeof uploadResource>|undefined
const newOptions=():StructureImportOptions=>({mode:'create',fields:[],blankBehavior:'keep'})
const options=ref<StructureImportOptions>(newOptions())
const labelId=useId()
const canUpload=computed(()=>!!examId.value&&(kind.value==='question'?!!typeId.value:options.value.mode==='create'||options.value.fields.length>0))
const activeOptions=computed<StructureImportOptions>(()=>job.value?.options||options.value)
const states:Record<string,string>={pending:'待导入',success:'成功',skipped:'未变化 / 跳过',failed:'失败'},levels:Record<string,string>={subject:'科目',chapter:'章',section:'节',knowledge:'知识点'}
const step=computed(()=>!job.value?0:job.value.status==='preview'?1:job.value.status==='completed'?3:2)
const filtered=computed(()=>(job.value?.rows||[]).filter((r:any)=>!onlyErrors.value||r.status==='failed'))
const shown=computed(()=>filtered.value.slice((activePage.value-1)*15,activePage.value*15))
async function loadHistory(){history.value=examId.value?await request('/admin/import-jobs?examId='+encodeURIComponent(examId.value)):[]}
async function open(options:{examId?:string;kind?:'structure'|'question';jobId?:string}={}){
 visible.value=true;error.value='';job.value=null;activePage.value=1;onlyErrors.value=false;kind.value=options.kind||'structure';fixed.value=!!options.examId;examId.value=options.examId||props.exams[0]?.id||'';isTest.value=false;resetOptions()
 try{if(options.jobId){job.value=await request('/admin/import-jobs/'+options.jobId);examId.value=job.value.exam_id;kind.value=job.value.kind;fixed.value=true}
 if(kind.value==='question'){types.value=await request('/admin/question-types');typeId.value=types.value.find(t=>t.enabled)?.id||''}await loadHistory()}catch(e:any){error.value=e.message}
}
async function download(url:string,name:string){error.value='';try{const r=await fetch('/api'+url,{headers:{Authorization:'Bearer '+sessionStorage.getItem('sxb-admin-token')}});if(!r.ok)throw new Error((await r.json()).message);const blob=URL.createObjectURL(await r.blob());const a=document.createElement('a');a.href=blob;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(blob),1000)}catch(e:any){error.value=e.message}}
function resetOptions(){options.value=newOptions()}
function modeChanged(){options.value.blankBehavior='keep';error.value=''}
function template(){void download('/admin/import-jobs/template?'+new URLSearchParams({examId:examId.value,...(kind.value==='question'?{typeId:typeId.value}:{mode:options.value.mode,fields:options.value.fields.join(','),blankBehavior:options.value.blankBehavior})}),(props.exams.find(e=>e.id===examId.value)?.name||'考试')+'-'+(kind.value==='structure'?'知识目录':'题目')+'导入模板.xlsx')}
async function upload(event:Event){const input=event.target as HTMLInputElement,f=input.files?.[0];input.value='';if(!f)return;busy.value=true;uploading.value=true;uploadProgress.value=0;error.value='';job.value=null
 try{uploadTask=uploadResource(f,{kind:'import',examId:examId.value,contentId:crypto.randomUUID(),maxSizeMb:8,onProgress:p=>uploadProgress.value=p});const asset=await uploadTask.promise;uploading.value=false;job.value=await send('/admin/import-jobs/preview',{examId:examId.value,assetId:asset.id,kind:kind.value,typeId:typeId.value,isTest:isTest.value,...(kind.value==='structure'?{options:options.value}:{})});activePage.value=1;await loadHistory()}catch(e:any){error.value=e.message}finally{busy.value=false;uploading.value=false;uploadTask=undefined}}
async function run(){if(!job.value||busy.value)return;busy.value=true;error.value='';try{do{job.value=await send('/admin/import-jobs/'+job.value.id+'/advance',{});if(disposed)return}while(job.value.status!=='completed');emit('saved');await loadHistory()}catch(e:any){error.value=e.message+'；已完成部分已保存，可继续此批次。'}finally{busy.value=false}}
async function resume(id:string){error.value='';try{job.value=await request('/admin/import-jobs/'+id);kind.value=job.value.kind;activePage.value=1}catch(e:any){error.value=e.message}}
function resetFile(){if(job.value){if(job.value.kind==='structure')options.value={...job.value.options,fields:[...(job.value.options?.fields||[])]};isTest.value=job.value.is_test}job.value=null;error.value='';activePage.value=1;onlyErrors.value=false}
function changeValue(value:unknown){return value===null||value===undefined||value===''?'（空）':String(value)}
function changed(){resetFile();void loadHistory()}
onBeforeUnmount(()=>{disposed=true;uploadTask?.abort()});defineExpose({open})
</script>
<template>
 <el-dialog v-model="visible" :title="kind==='structure'?'导入知识结构':'按题型导入题目'" width="min(960px, 94vw)" :close-on-click-modal="false" :close-on-press-escape="!busy" :before-close="(done:()=>void)=>{if(!busy)done()}" class="import-wizard" align-center>
  <el-steps :active="step" finish-status="success" simple><el-step title="上传文件"/><el-step title="校验预览"/><el-step title="导入进度"/><el-step title="导入结果"/></el-steps>
  <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon role="alert"/>
  <el-form label-position="top"><div class="form-columns"><el-form-item label="考试项目"><el-select v-model="examId" :disabled="fixed||busy||!!job" @change="changed"><el-option v-for="e in exams" :key="e.id" :label="e.name" :value="e.id"/></el-select></el-form-item><el-form-item v-if="kind==='question'&&!job" label="题型"><el-select v-model="typeId" :disabled="busy"><el-option v-for="t in types.filter(t=>t.enabled)" :key="t.id" :label="t.name" :value="t.id"/></el-select></el-form-item></div></el-form>
  <template v-if="!job">
   <section v-if="kind==='structure'" class="field-settings" aria-label="导入设置">
    <div class="setting-row">
     <span class="setting-label" :id="labelId+'-mode'">导入方式</span>
     <el-radio-group v-model="options.mode" :disabled="busy" :aria-labelledby="labelId+'-mode'" @change="modeChanged">
      <el-radio-button value="create">新增基础架构</el-radio-button>
      <el-radio-button value="update">更新已有内容</el-radio-button>
     </el-radio-group>
    </div>
    <p class="setting-help">{{options.mode==='create'?'按科目、章、节、知识点名称匹配。只新增缺少的节点，已有节点保持原值。':'按节点唯一 ID 精确更新。星级、正文填写知识点 ID；短标题填写科目 ID。考试、归属、状态和测试标记保持不变。'}}</p>
    <div class="setting-row field-choice">
     <span class="setting-label" :id="labelId+'-fields'">{{options.mode==='create'?'附加字段（选填）':'需要更新的字段'}}</span>
     <el-checkbox-group v-model="options.fields" :disabled="busy" :aria-labelledby="labelId+'-fields'">
      <el-checkbox v-for="field in structureFields" :key="field.key" :value="field.key">{{field.label}}</el-checkbox>
     </el-checkbox-group>
    </div>
    <p v-if="options.mode==='update'&&!options.fields.length" class="setting-help">请至少选择一个字段；仅更新星级时，模板只有「节点ID」和「知识点星级」两列。</p>
    <div v-if="options.mode==='update'&&options.fields.length" class="setting-row">
     <span class="setting-label" :id="labelId+'-blank'">空单元格处理</span>
     <el-radio-group v-model="options.blankBehavior" :disabled="busy" :aria-labelledby="labelId+'-blank'">
      <el-radio value="keep">保留原值（推荐）</el-radio><el-radio value="clear">清空对应字段</el-radio>
     </el-radio-group>
    </div>
    <el-alert v-if="options.blankBehavior==='clear'" type="warning" title="选中字段的空单元格将清空旧值，请在校验预览中逐项确认。未选择的字段始终保留。" :closable="false" show-icon/>
    <el-alert v-if="options.fields.includes('document')" type="info" title="正文按纯文字导入并保留换行。更新正文将替换原有图文排版；图片、音视频仍在编辑器中管理。" :closable="false" show-icon/>
    <div class="template-columns"><span>本次模板列</span><el-tag v-for="header in structureHeaders(options)" :key="header" effect="plain">{{header}}</el-tag></div>
   </section>
   <div class="import-guide"><FileSpreadsheet :size="32"/><div><strong>{{kind==='question'?'一行一道完整题目':options.mode==='update'?'一行更新一个节点':'一行一条目录路径'}}</strong><p>{{kind==='question'?'下载当前题型模板；知识点 ID 必填，可在模板内的知识点对照表查询。':options.mode==='update'?'从模板「节点对照表」或知识图谱导出中复制唯一 ID，再填写所选字段。':'章、节顺序按首次出现自动生成。选中的附加字段只写入新节点。'}}</p><p>先选择字段，再下载模板。原文件保存在资源管理，可追溯文件与行号。</p></div></div>
   <div class="import-controls">
    <el-button :disabled="busy||!canUpload" @click="template"><Download :size="16"/>下载对应模板</el-button>
    <el-button type="primary" :disabled="busy||!canUpload" @click="fileInput?.click()"><Upload :size="16"/>上传 Excel 并校验</el-button>
    <el-checkbox v-if="kind==='question'||options.mode==='create'" v-model="isTest" :disabled="busy">标记为测试内容</el-checkbox>
    <input ref="fileInput" hidden type="file" accept=".xlsx" @change="upload"/>
   </div>
   <el-progress v-if="uploading" :percentage="uploadProgress"/><p v-else-if="busy" role="status">文件已上传，正在解析和校验，请稍候…</p>
   <div v-if="history.length" class="import-history"><strong>最近导入 · 可查看结果或继续未完成批次</strong><el-button v-for="h in history.filter(h=>h.kind===kind).slice(0,5)" :key="h.id" link type="primary" :disabled="busy" @click="resume(h.id)">{{new Date(h.created_at).toLocaleString('zh-CN')}} · {{h.status==='completed'?'查看结果':'继续处理'}}</el-button></div>
  </template>
  <template v-else>
   <div class="import-file"><FileSpreadsheet :size="18"/><strong>{{job.filename}}</strong><el-tag v-if="kind==='structure'&&activeOptions.mode==='update'">更新已有内容 · 保留测试标记</el-tag><el-tag v-else :type="job.is_test?'warning':'info'">{{job.is_test?'测试内容':'正式资料'}}</el-tag></div>
   <div v-if="kind==='structure'" class="template-columns"><el-tag>{{activeOptions.mode==='update'?'按 ID 更新':'新增架构'}}</el-tag><span>字段：{{structureFields.filter(f=>activeOptions.fields.includes(f.key)).map(f=>f.label).join('、')||'四级名称'}}</span><span v-if="activeOptions.mode==='update'">空值：{{activeOptions.blankBehavior==='clear'?'清空对应字段':'保留原值'}}</span></div>
   <div class="import-counts" aria-live="polite"><div v-for="(label,key) in {total:'文件总行数',success:'成功',skipped:'未变化 / 跳过',failed:'失败',pending:'待导入'}" :key="key"><strong>{{job.counts[key]}}</strong><span>{{label}}</span></div></div>
   <el-progress v-if="job.status!=='preview'" :percentage="job.percentage" :status="job.status==='completed'?(job.counts.failed?'warning':'success'):undefined"/>
   <p v-if="job.status==='preview'" class="import-hint">{{kind==='structure'?'已比对当前数据，请核对下方修改前后的值。尚未写入；确认时再次检查版本，已变化的记录会提示重新校验。':'已检查文件格式；确认后逐项比对现有数据。重复项复用 ID，冲突项保留失败原因。'}}</p>
   <div v-if="kind==='structure'&&job.status==='preview'" class="import-plan"><span>新增行 {{job.planned.create}}</span><span>更新行 {{job.planned.update}}</span><span>未变化 / 重复 {{job.planned.unchanged}}</span><span>异常行 {{job.planned.failed}}</span></div>
   <div v-if="kind==='structure'&&job.status!=='preview'" class="import-nodes"><span v-for="(label,key) in levels" :key="key">{{label}}：新增 {{job.nodes[key]?.created||0}} / 复用 {{job.nodes[key]?.reused||0}} / 更新 {{job.nodes[key]?.updated||0}}</span></div>
   <div class="import-controls"><el-checkbox v-model="onlyErrors" @change="activePage=1">只看失败项</el-checkbox><el-button v-if="job.counts.failed" link type="primary" @click="download('/admin/import-jobs/'+job.id+'/failures','失败项-修正后重新导入.xlsx')">下载失败项及原因</el-button></div>
   <el-table :data="shown" max-height="350" row-key="line">
    <el-table-column prop="line" label="Excel 行号" width="95"/>
    <el-table-column label="目录路径 / 题目" min-width="210"><template #default="{row}"><span>{{row.title}}</span><small v-if="activeOptions.mode==='update'&&row.id" class="node-id">{{row.id}}</small></template></el-table-column>
    <el-table-column v-if="kind==='structure'" label="修改预览" min-width="260"><template #default="{row}">
     <div v-for="(change,index) in row.changes" :key="index" class="field-change"><strong>{{change.label}}<small v-if="change.target"> · {{change.target}}</small></strong><div class="value-before">原值：{{changeValue(change.before)}}</div><div class="value-after">新值：{{changeValue(change.after)}}</div><small v-if="change.replaceBody">将替换原正文及其排版</small></div>
     <span v-if="!row.changes?.length" class="setting-help">{{row.action==='create'?'仅新增目录节点':'无字段变更'}}</span>
    </template></el-table-column>
    <el-table-column label="状态" width="115"><template #default="{row}"><el-tag :type="row.status==='failed'?'danger':row.status==='success'?'success':'info'">{{states[row.status]}}</el-tag></template></el-table-column>
    <el-table-column prop="message" label="结果 / 失败原因" min-width="210"/>
   </el-table>
   <el-pagination v-model:current-page="activePage" :total="filtered.length" :page-size="15" layout="total,prev,pager,next"/>
  </template>
  <template #footer><el-button :disabled="busy" @click="visible=false">{{job?.status==='completed'?'完成':'关闭'}}</el-button><el-button v-if="job" :disabled="busy" @click="resetFile">上传修正文件 / 重新导入</el-button><el-button v-if="job?.counts.pending" type="primary" :loading="busy" @click="run"><Check :size="16"/>{{job.status==='preview'?'确认导入有效内容':'继续导入'}}</el-button></template>
 </el-dialog>
</template>
<style scoped>
.field-settings{border:1px solid var(--admin-border);border-radius:var(--admin-radius);padding:18px;margin-bottom:18px}.setting-row{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.setting-label{font-size:13px;font-weight:600;color:var(--admin-text)}.setting-help{font-size:13px;line-height:1.7;color:var(--el-text-color-regular);margin:10px 0}.field-choice{margin-top:18px}.template-columns,.import-plan{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-top:14px;font-size:13px;color:var(--el-text-color-regular)}.import-plan{gap:20px;padding:12px 16px;background:var(--el-fill-color-light);border-radius:var(--admin-radius)}.field-settings .el-alert{margin-top:12px;margin-bottom:0}.field-change{padding:6px 0}.field-change strong{font-size:12px}.field-change small,.node-id{display:block;font-size:12px;color:var(--el-text-color-secondary)}.node-id{margin-top:5px;overflow-wrap:anywhere;user-select:all}.value-before,.value-after{max-height:110px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;line-height:1.6;padding:4px 6px;margin-top:4px;border-radius:4px}.value-before{background:var(--el-fill-color-light)}.value-after{background:var(--el-color-primary-light-9);color:var(--el-text-color-primary)}.import-controls>.el-button{margin-left:0}
.el-steps{margin-bottom:24px}.el-alert{margin-bottom:16px}.import-guide{display:flex;gap:18px;padding:22px;background:var(--el-color-primary-light-9);border-radius:16px;color:var(--el-color-primary)}.import-guide svg{flex:none}.import-guide p{margin:8px 0 0;color:var(--el-text-color-regular);line-height:1.7}.import-controls{display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin:18px 0}.import-history{display:flex;align-items:flex-start;flex-direction:column;gap:12px;padding:20px 0}.import-counts{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin:18px 0}.import-counts>div{padding:16px;background:var(--el-fill-color-light);border-radius:12px}.import-counts strong,.import-counts span{display:block}.import-counts strong{font-size:25px;font-variant-numeric:tabular-nums}.import-counts span{margin-top:6px;font-size:13px;color:var(--el-text-color-secondary)}.import-file,.import-nodes{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.import-nodes,.import-hint{margin-top:16px;line-height:1.8;color:var(--el-text-color-secondary)}.el-pagination{margin-top:16px}@media(max-width:600px){.import-counts{grid-template-columns:repeat(3,1fr)}}
</style>

<style>
.el-dialog.import-wizard{max-height:92vh;display:flex;flex-direction:column;border-radius:18px}.import-wizard .el-dialog__body{min-height:0;overflow:auto}.import-wizard .el-dialog__header,.import-wizard .el-dialog__footer{flex:none}.import-wizard .el-dialog__footer{padding-top:16px}
</style>
