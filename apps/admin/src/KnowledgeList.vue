<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Pencil, Power, Plus, Search, RotateCcw, BookPlus, BookOpen, Eye } from 'lucide-vue-next'
import { send } from './api'
import { buildKnowledgeRows, nodeLabels, shortTitle } from './utils/knowledge-list'
const props=defineProps<{rows:any[];subjects:any[];exam:any}>()
const emit=defineEmits<{edit:[row:any];reload:[];course:[node:any];courses:[node:any];preview:[row:any]}>()
const kind=ref('knowledge'),subject=ref(''),chapter=ref(''),section=ref(''),keyword=ref(''),status=ref(''),course=ref(''),page=ref(1),saving=ref('')
const data=computed(()=>buildKnowledgeRows(props.rows,props.subjects))
const subjects=computed(()=>data.value.filter(r=>r.kind==='subject'))
const chapters=computed(()=>data.value.filter(r=>r.kind==='chapter'&&(!subject.value||r.subjectId===subject.value)))
const sections=computed(()=>data.value.filter(r=>r.kind==='section'&&(!subject.value||r.subjectId===subject.value)&&(!chapter.value||r.chapterId===chapter.value)))
const filtered=computed(()=>data.value.filter(r=>r.kind===kind.value&&(!subject.value||r.subjectId===subject.value)&&(!chapter.value||r.chapterId===chapter.value)&&(!section.value||r.sectionId===section.value)&&(!keyword.value||r.displayTitle.toLowerCase().includes(keyword.value.trim().toLowerCase()))&&(!status.value||r.status===status.value)&&(!course.value||r.hasCourse===(course.value==='yes'))))
const visible=computed(()=>filtered.value.slice((page.value-1)*20,page.value*20))
const statuses:Record<string,string>={draft:'草稿',review:'审核中',published:'已发布',offline:'停用'}
const parentLabel=computed(()=>({knowledge:'节',section:'章',chapter:'科目',subject:'考试项目'})[kind.value])
function reset(){subject.value='';chapter.value='';section.value='';keyword.value='';status.value='';course.value='';page.value=1}
watch(kind,reset)
watch(subject,()=>{chapter.value='';section.value=''})
watch(chapter,()=>section.value='')
watch([subject,chapter,section,keyword,status,course],()=>page.value=1)
watch(()=>props.exam.id,reset)
watch(filtered,()=>page.value=Math.min(page.value,Math.max(1,Math.ceil(filtered.value.length/20))))
function edit(row:any){emit('edit',props.rows.find(r=>r.id===row.id))}
function create(){emit('edit',{id:crypto.randomUUID(),kind:kind.value,exam_id:props.exam.id,parent_id:kind.value==='knowledge'?section.value||null:kind.value==='section'?chapter.value||null:kind.value==='chapter'?subject.value||null:null,title:'',status:'draft',payload:{stars:3,no:1},source:'manual',is_test_data:false})}
async function toggle(row:any){
  const enabled=row.status==='offline'
  try{await ElMessageBox.confirm(`${enabled?'启用':'停用'}“${row.displayTitle}”？${!enabled&&row.kind!=='knowledge'?'停用后，前端将隐藏该目录及其下的内容。':''}`,enabled?'启用确认':'停用确认',{type:'warning',confirmButtonText:enabled?'启用':'停用',cancelButtonText:'取消'})}catch{return}
  saving.value=row.id
  try{await send('/admin/knowledge-nodes/'+encodeURIComponent(row.id)+'/status',{enabled,version:row.version},'PATCH');ElMessage.success(enabled?'已启用':'已停用');emit('reload')}
  catch(e:any){ElMessage.error(e.message)}finally{saving.value=''}
}
const date=(value:any)=>value?new Date(value).toLocaleString('zh-CN',{hour12:false}):'—'
</script>
<template>
  <section class="knowledge-list-manager">
    <div class="table-toolbar"><el-radio-group v-model="kind" aria-label="内容层级"><el-radio-button v-for="(label,k) in nodeLabels" :key="k" :value="k">{{label}}</el-radio-button></el-radio-group><el-button type="primary" @click="create"><Plus :size="16"/>新增{{nodeLabels[kind]}}</el-button></div>
    <div class="knowledge-filters">
      <label class="title-filter"><span>标题</span><el-input v-model="keyword" placeholder="搜索标题" clearable><template #prefix><Search :size="15"/></template></el-input></label>
      <label v-if="kind!=='subject'"><span>科目</span><el-select :empty-values="[null,undefined]" v-model="subject" aria-label="筛选科目" filterable><el-option label="全部科目" value=""/><el-option v-for="s in subjects" :key="s.id" :value="s.id" :label="s.title"/></el-select></label>
      <label v-if="['section','knowledge'].includes(kind)"><span>章</span><el-select :empty-values="[null,undefined]" v-model="chapter" aria-label="筛选章" filterable><el-option label="全部章" value=""/><el-option v-for="c in chapters" :key="c.id" :value="c.id" :label="c.displayTitle"/></el-select></label>
      <label v-if="kind==='knowledge'"><span>节</span><el-select :empty-values="[null,undefined]" v-model="section" aria-label="筛选节" filterable><el-option label="全部节" value=""/><el-option v-for="s in sections" :key="s.id" :value="s.id" :label="s.displayTitle"/></el-select></label>
      <label><span>状态</span><el-select :empty-values="[null,undefined]" v-model="status" aria-label="筛选状态"><el-option label="全部状态" value=""/><el-option v-for="(label,value) in statuses" :key="value" :label="label" :value="value"/></el-select></label>
      <label v-if="kind==='knowledge'||kind==='section'"><span>{{kind==='knowledge'?'配套课':'精品课'}}</span><el-select :empty-values="[null,undefined]" v-model="course" :aria-label="kind==='knowledge'?'筛选配套课':'筛选精品课'"><el-option label="全部" value=""/><el-option label="有" value="yes"/><el-option label="无" value="no"/></el-select></label>
      <el-button class="reset-filter" @click="reset"><RotateCcw :size="15"/>重置</el-button>
    </div>
    <el-table :key="kind" :data="visible" row-key="id" empty-text="暂无符合条件的内容">
      <el-table-column label="标题" min-width="280"><template #default="{row}"><el-tooltip :trigger="['hover','focus']" :content="row.displayTitle" placement="top" :show-after="350"><button class="table-title" :aria-label="row.displayTitle" @click="edit(row)">{{shortTitle(row.displayTitle)}}</button></el-tooltip></template></el-table-column>
      <el-table-column :label="parentLabel" min-width="220"><template #default="{row}"><template v-if="kind==='subject'">{{exam.name}}</template><template v-else><span class="parent-title">{{row.parentTitle}}</span><small v-if="kind!=='chapter'" class="cell-sub">{{row.parentPath}}</small></template></template></el-table-column>
      <el-table-column v-if="kind==='knowledge'" label="题数" width="80"><template #default="{row}">{{row.questionCount||0}}</template></el-table-column>
      <el-table-column v-if="kind==='chapter'||kind==='section'" :label="kind==='chapter'?'节数':'知识点数'" width="100"><template #default="{row}">{{row.childCount||0}}</template></el-table-column>
      <el-table-column v-if="kind==='knowledge'||kind==='section'" :label="kind==='knowledge'?'配套课':'精品课'" width="95"><template #default="{row}"><el-button v-if="row.hasCourse" link type="primary" :aria-label="'管理'+(kind==='knowledge'?'配套课':'精品课')" @click="emit('courses',row)">有</el-button><el-tag v-else type="info" effect="plain">无</el-tag></template></el-table-column>
      <el-table-column label="状态" width="100"><template #default="{row}"><el-tag :type="row.status==='published'?'success':row.status==='review'?'warning':'info'">{{statuses[row.status]}}</el-tag></template></el-table-column>
      <el-table-column label="更新时间" width="180"><template #default="{row}">{{date(row.updated_at)}}</template></el-table-column>
<el-table-column label="操作" :width="['section','knowledge'].includes(kind)?184:112" fixed="right"><template #default="{row}"><div class="row-actions"><el-tooltip content="编辑"><el-button link type="primary" aria-label="编辑内容" @click="edit(row)"><Pencil :size="17"/></el-button></el-tooltip><el-tooltip v-if="['section','knowledge'].includes(kind)" :content="(row.hasCourse?'编辑':'添加')+(kind==='section'?'精品课':'配套课')"><el-button link type="primary" :aria-label="(row.hasCourse?'编辑':'添加')+(kind==='section'?'精品课':'配套课')" @click="emit('course',row)"><component :is="row.hasCourse?BookOpen:BookPlus" :size="17"/></el-button></el-tooltip><el-tooltip v-if="['section','knowledge'].includes(kind)" content="预览已保存内容"><el-button link type="primary" aria-label="预览内容" @click="emit('preview',row)"><Eye :size="17"/></el-button></el-tooltip><el-tooltip :content="row.status==='offline'?'启用':'停用'"><el-button link :type="row.status==='offline'?'success':'danger'" :aria-label="row.status==='offline'?'启用':'停用'" :loading="saving===row.id" :disabled="!!saving" @click="toggle(row)"><Power :size="17"/></el-button></el-tooltip></div></template></el-table-column>
    </el-table>
    <div class="pagination"><span>共 {{filtered.length}} 条内容</span><el-pagination v-model:current-page="page" :total="filtered.length" :page-size="20" layout="prev,pager,next"/></div>
  </section>
</template>
<style scoped>
.knowledge-filters{display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap;padding:16px;margin-bottom:20px;background:var(--el-fill-color-light);border:1px solid var(--admin-border);border-radius:var(--admin-radius)}
.knowledge-filters label{display:flex;flex-direction:column;gap:7px;flex:1 1 140px;min-width:120px;max-width:210px;font-size:13px;color:var(--el-text-color-regular)}.knowledge-filters .title-filter{flex-basis:190px;max-width:240px}.reset-filter{margin-left:auto}.parent-title{overflow-wrap:anywhere;line-height:1.65}.table-title{display:block;width:100%;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:left}.cell-sub{font-variant-numeric:tabular-nums}
@media(max-width:600px){.knowledge-filters{gap:12px;padding:12px}.knowledge-filters label,.knowledge-filters .title-filter{flex:1 1 125px;max-width:none}.knowledge-list-manager .table-toolbar{align-items:flex-start}.reset-filter{margin-left:0}}
</style>
