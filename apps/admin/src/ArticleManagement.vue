<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Pencil, ArrowUpToLine, ArrowDownToLine, Trash2, Search, RotateCcw } from 'lucide-vue-next'
import { request, send } from './api'
import RichEditor from './RichEditor.vue'
import RecordIdentifier from './RecordIdentifier.vue'
import { shortTitle } from './utils/knowledge-list'
import { plainDoc } from '../../shared/messages'

const exams=ref<any[]>([])
const rows=ref<any[]>([]),total=ref(0),page=ref(1),loading=ref(false),loadError=ref('')
const filters=reactive({title:'',examId:'',status:''}),applied=reactive({...filters})
const drawer=ref(false),saving=ref(false),imageBusy=ref(false),formError=ref(''),form=ref<any>({})
watch(form,()=>{formError.value=''},{deep:true})
let revision=0
async function load(){
 const rev=++revision;loading.value=true;loadError.value=''
 try{const [r,projects]=await Promise.all([request('/admin/articles?'+new URLSearchParams({...applied,page:String(page.value)})),request('/admin/exam-projects')]);if(rev===revision){exams.value=projects;rows.value=r.items;total.value=r.total;if(page.value>1&&!r.items.length){page.value--;await load()}}}
 catch(e:any){if(rev===revision){rows.value=[];total.value=0;loadError.value=e.message}}
 finally{if(rev===revision)loading.value=false}
}
function search(){Object.assign(applied,filters);page.value=1;void load()}
function reset(){Object.assign(filters,{title:'',examId:'',status:''});search()}
const examNames=(row:any)=>row.scope==='all'?'全站':row.exam_ids.map((id:string)=>exams.value.find(e=>e.id===id)?.name||'考试已不存在').join('、')
const fmt=(v:string)=>new Date(v).toLocaleString('zh-CN',{hour12:false})
async function open(row?:any){
 try{
  const r=row?await request('/admin/articles/'+encodeURIComponent(row.id)):null
  form.value=r?{id:r.id,version:r.version,title:r.title,category:'faq',scope:r.scope,examIds:[...r.exam_ids],status:r.status==='published'?'published':'offline',document:r.payload.document||plainDoc(r.payload.content||''),creatorName:r.creator_name,createdAt:r.created_at}:{id:crypto.randomUUID(),title:'',category:'',scope:'all',examIds:[],status:'offline',document:plainDoc('')}
  formError.value='';imageBusy.value=false;drawer.value=true
 }catch(e:any){ElMessage.error(e.message)}
}
async function save(){
 if(saving.value||imageBusy.value)return
 formError.value=''
 if(!form.value.title.trim()){formError.value='请填写文章标题';return}
 if(!form.value.category){formError.value='请选择文章分类';return}
 if(form.value.scope==='exams'&&!form.value.examIds.length){formError.value='请至少选择一个考试项目';return}
 saving.value=true
 try{
  const {id,creatorName,createdAt,...body}=form.value
  await send('/admin/articles/'+encodeURIComponent(id),body,'PUT');drawer.value=false;ElMessage.success('文章已保存');await load()
 }catch(e:any){formError.value=e.message}finally{saving.value=false}
}
async function toggle(row:any){
 const status=row.status==='published'?'offline':'published'
 try{await ElMessageBox.confirm(status==='offline'?'下架后，用户将无法在常见问题中看到这篇文章。':'上架后，适用考试的用户可在“我的 → 常见问题”中看到这篇文章。',status==='offline'?'下架文章':'上架文章',{confirmButtonText:'确认',cancelButtonText:'取消',type:'warning'});await send('/admin/articles/'+row.id+'/status',{version:row.version,status},'PATCH');ElMessage.success(status==='offline'?'已下架':'已上架');await load()}
 catch(e:any){if(e!=='cancel'&&e!=='close')ElMessage.error(e.message)}
}
async function remove(row:any){
 try{await ElMessageBox.confirm('删除后文章将从后台列表和用户端移除，无法在页面中恢复。确认删除这篇文章？','删除文章',{type:'warning',confirmButtonText:'确认删除',cancelButtonText:'取消'});await send('/admin/articles/'+row.id,{version:row.version},'DELETE');ElMessage.success('文章已删除');await load()}
 catch(e:any){if(e!=='cancel'&&e!=='close')ElMessage.error(e.message)}
}
onMounted(load)
defineExpose({load,open})
</script>
<template>
 <section class="articles-page">
  <form class="admin-filters" @submit.prevent="search">
   <label class="admin-filter-field"><span>标题</span><el-input v-model="filters.title" aria-label="标题" placeholder="搜索文章标题" clearable/></label>
   <label class="admin-filter-field"><span>考试项目</span><el-select v-model="filters.examId" aria-label="考试项目" :empty-values="[null,undefined]" filterable><el-option label="全部" value=""/><el-option label="全站" value="all"/><el-option v-for="e in exams" :key="e.id" :label="e.name" :value="e.id"/></el-select></label>
   <label class="admin-filter-field"><span>状态</span><el-select v-model="filters.status" aria-label="状态" :empty-values="[null,undefined]"><el-option label="全部状态" value=""/><el-option label="已上架" value="published"/><el-option label="未上架 / 已下架" value="offline"/></el-select></label>
   <div class="admin-filter-actions"><el-button type="primary" native-type="submit"><Search :size="16"/>查询</el-button><el-button @click="reset"><RotateCcw :size="16"/>重置</el-button></div>
  </form>
  <el-alert v-if="loadError" :title="loadError" type="error" :closable="false" show-icon/>
  <div class="table-toolbar"><span>全部文章 <b>{{total}}</b></span><span class="subtle-label">常见问题</span></div>
  <el-table v-loading="loading" :data="rows" row-key="id">
   <template #empty><el-empty description="当前条件下暂无文章" :image-size="80"/></template>
   <el-table-column label="标题" min-width="320"><template #default="{row}"><el-tooltip :content="row.title" :show-after="350" placement="top" :trigger="['hover','focus']"><button class="table-title article-title" :aria-label="row.title" @click="open(row)">{{shortTitle(row.title)}}</button></el-tooltip></template></el-table-column>
   <el-table-column label="考试项目" min-width="240" show-overflow-tooltip><template #default="{row}">{{examNames(row)}}</template></el-table-column>
   <el-table-column label="状态" width="105"><template #default="{row}"><el-tag :type="row.status==='published'?'success':'info'">{{row.status==='published'?'已上架':row.status==='offline'?'已下架':'未上架'}}</el-tag></template></el-table-column>
   <el-table-column prop="creator_name" label="创建人" width="125" show-overflow-tooltip/>
   <el-table-column label="更新时间" width="185"><template #default="{row}">{{fmt(row.updated_at)}}</template></el-table-column>
   <el-table-column label="操作" width="132" fixed="right"><template #default="{row}"><div class="row-actions">
    <el-tooltip content="编辑"><el-button link type="primary" aria-label="编辑文章" @click="open(row)"><Pencil :size="17"/></el-button></el-tooltip>
    <el-tooltip :content="row.status==='published'?'下架':'上架'"><el-button link :type="row.status==='published'?'warning':'success'" :aria-label="row.status==='published'?'下架文章':'上架文章'" @click="toggle(row)"><ArrowDownToLine v-if="row.status==='published'" :size="17"/><ArrowUpToLine v-else :size="17"/></el-button></el-tooltip>
    <el-tooltip content="删除"><el-button link type="danger" aria-label="删除文章" @click="remove(row)"><Trash2 :size="17"/></el-button></el-tooltip>
   </div></template></el-table-column>
  </el-table>
  <div class="pagination"><span>共 {{total}} 条</span><el-pagination v-model:current-page="page" :total="total" :page-size="20" layout="prev,pager,next" @current-change="load"/></div>
 </section>
 <el-drawer v-model="drawer" :title="form.version?'编辑文章':'新增文章'" size="min(860px, 100vw)" :close-on-click-modal="false" :close-on-press-escape="!saving&&!imageBusy" :show-close="!saving&&!imageBusy">
  <RecordIdentifier v-if="form.version" :id="form.id" table="other_content"/>
  <el-form label-position="top" class="article-form" @submit.prevent="save">
   <el-form-item label="文章标题" required><el-input v-model="form.title" aria-label="文章标题" placeholder="填写清晰易懂的问题或标题" maxlength="2000"/></el-form-item>
   <div class="article-form-row"><el-form-item label="文章分类" required><el-select v-model="form.category" aria-label="文章分类" placeholder="请选择分类"><el-option label="常见问题" value="faq"/></el-select></el-form-item><el-form-item label="发布状态" required><el-select v-model="form.status" aria-label="发布状态"><el-option label="已上架" value="published"/><el-option label="已下架" value="offline"/></el-select></el-form-item></div>
   <el-form-item label="适用范围" required><el-radio-group v-model="form.scope" @change="form.examIds=[]"><el-radio-button value="all">全站</el-radio-button><el-radio-button value="exams">指定考试</el-radio-button></el-radio-group></el-form-item>
   <el-form-item v-if="form.scope==='exams'" label="考试项目" required><el-select v-model="form.examIds" aria-label="适用考试项目" multiple filterable placeholder="可选择多个考试项目"><el-option v-for="e in exams" :key="e.id" :label="e.name" :value="e.id"/></el-select></el-form-item>
   <el-form-item label="文章正文" required><RichEditor v-model="form.document" :content-id="form.id" :allow-media="false" :allow-handouts="false" @busy="imageBusy=$event"/></el-form-item>
   <p v-if="form.version" class="article-meta">创建人：{{form.creatorName}}<span>创建时间：{{fmt(form.createdAt)}}</span></p>
   <el-alert v-if="formError" :title="formError" type="error" show-icon :closable="false"/>
  </el-form>
  <template #footer><el-button :disabled="saving||imageBusy" @click="drawer=false">取消</el-button><el-button type="primary" :loading="saving" :disabled="imageBusy" @click="save">保存文章</el-button></template>
 </el-drawer>
</template>
<style scoped>
.articles-page{min-width:0}.article-title{display:block;width:100%;max-width:100%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;text-align:left}.row-actions{flex-wrap:nowrap}.table-toolbar b{margin-left:6px}.article-form{margin-top:20px}.article-form-row{display:grid;grid-template-columns:1fr 1fr;gap:20px}.article-form .el-select{width:100%}.article-form :deep(.rich-editor){width:100%}.article-meta{display:flex;flex-wrap:wrap;gap:10px 24px;color:var(--el-text-color-secondary);font-size:12px;line-height:1.8}@media(max-width:600px){.article-form-row{grid-template-columns:1fr;gap:0}}
</style>
