<script setup lang="ts">
import RecordIdentifier from './RecordIdentifier.vue'
import { computed, onMounted, ref,watch } from 'vue'
import { ElMessage,ElMessageBox } from 'element-plus'
import { Plus, Pencil, Power, Search, RotateCcw,CalendarDays,Trash2 } from 'lucide-vue-next'
import { hasExamGuide,currentExamTerm } from '../../shared/exam-guide'
import { request, send } from './api'
import RichEditor from './RichEditor.vue'
import CoverImagePicker from './CoverImagePicker.vue'

const rows = ref<any[]>([]), categories = ref<any[]>([])
const drawer = ref(false), busy = ref(false), imageBusy = ref(false)
const error = ref(''), search = ref(''), drawerMode = ref<'create'|'edit'>('create')
const keyword = ref('')
function applySearch() { search.value = keyword.value.trim() }
function resetSearch() { keyword.value = ''; search.value = '' }
const formSession = ref(0)
const edit = ref<any>({})
const activeTab=ref('basic'),selectedTermId=ref('')
const selectedTerm=computed(()=>edit.value.yearEntries?.find((y:any)=>y.id===selectedTermId.value))
watch(()=>JSON.stringify([edit.value.name,edit.value.categoryId,edit.value.yearEntries?.map((y:any)=>[y.year,y.startsAt,y.endsAt])]),()=>{error.value=''})
function periodTime(value:string){return value?new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date(value)):''}
function periodISO(value:string){return value.replace(' ','T')+'+08:00'}
const guideYears=(row:any)=>row.year_entries.filter((y:any)=>hasExamGuide(y.guideDocument)).map((y:any)=>y.year+' 年').join('、')
function beforeTabLeave(){return !imageBusy.value&&!busy.value}
const roots = computed(() => categories.value.filter(c => !c.parent_id))
const filtered = computed(() => rows.value.filter(r => !search.value || r.name.includes(search.value) || r.short_title?.includes(search.value)))

function parseIntro(value: any) {
  if (!value) return ''
  if (typeof value !== 'string') return structuredClone(value)
  try {
    const document = JSON.parse(value)
    if (document?.type === 'doc') return document
  } catch { /* Older records contain plain text or HTML. */ }
  return value
}
async function load() {
  const [projects, groups] = await Promise.all([request('/admin/exam-projects'), request('/admin/exam-categories')])
  rows.value = projects
  categories.value = groups
}
function open(row?: any,guideYear?:number) {
  if (busy.value) return
  formSession.value++
  drawerMode.value = row ? 'edit' : 'create'
  edit.value = {
    id: row?.id || crypto.randomUUID(),
    name: row?.name || '', shortTitle: row?.short_title || '', categoryId: row?.category_id || '',
    intro: parseIntro(row?.intro), coverUrl: row?.cover_url || '', enabled: row?.enabled ?? true,
    yearEntries: row?.year_entries?.map((entry: any) => ({ ...entry,startsAt:periodTime(entry.startsAt),endsAt:periodTime(entry.endsAt),guideDocument:entry.guideDocument?JSON.parse(JSON.stringify(entry.guideDocument)):null })) || [{id:crypto.randomUUID(),year:new Date().getFullYear(),startsAt:'',endsAt:'',guideDocument:null}]
  }
  activeTab.value=guideYear?'guide':'basic'
  selectedTermId.value=(guideYear?edit.value.yearEntries.find((y:any)=>y.year===guideYear):currentExamTerm<any>(edit.value.yearEntries))?.id||''
  error.value = ''
  imageBusy.value = false
  drawer.value = true
}
function close() {
  if (busy.value||imageBusy.value) return
  drawer.value = false
  imageBusy.value = false
  error.value = ''
}
function beforeClose(done: () => void) {
  if (busy.value||imageBusy.value) return
  close()
  done()
}
function addYear() {
  const last=Math.max(new Date().getFullYear()-1,...edit.value.yearEntries.map((y:any)=>y.year))
  const entry={id:crypto.randomUUID(),year:Math.min(2100,last+1),startsAt:'',endsAt:'',guideDocument:null}
  edit.value.yearEntries.push(entry)
  if(!selectedTermId.value)selectedTermId.value=entry.id
}
async function removeYear(index:number){
  const entry=edit.value.yearEntries[index]
  if(hasExamGuide(entry.guideDocument))try{await ElMessageBox.confirm(`删除 ${entry.year} 年考期也会移除它的“了解考试”图文，保存后生效。`,'删除考期',{type:'warning',confirmButtonText:'删除考期',cancelButtonText:'取消'})}catch{return}
  edit.value.yearEntries.splice(index,1)
  if(selectedTermId.value===entry.id)selectedTermId.value=currentExamTerm<any>(edit.value.yearEntries)?.id||''
}
async function save() {
  if (busy.value || imageBusy.value) return
  error.value = ''
  if (!edit.value.name.trim()) { activeTab.value='basic';error.value = '请输入考试名称'; return }
  if (!edit.value.categoryId) { activeTab.value='basic';error.value = '请选择考试分类'; return }
  if (!edit.value.yearEntries.length) {activeTab.value='terms';error.value='请至少配置一个考期';return}
  if(edit.value.yearEntries.some((y:any)=>!y.year||!y.startsAt||!y.endsAt)){activeTab.value='terms';error.value='请填写每个考期的年份、开始时间和结束时间';return}
  if(edit.value.yearEntries.some((y:any)=>y.startsAt>=y.endsAt)){activeTab.value='terms';error.value='结束时间必须晚于开始时间';return}
  const periods=[...edit.value.yearEntries].sort((a:any,b:any)=>a.startsAt.localeCompare(b.startsAt))
  if(periods.some((y:any,i:number)=>i>0&&y.startsAt<periods[i-1].endsAt)){activeTab.value='terms';error.value='同一考试的考期时间不能重叠';return}
  if(new Set(edit.value.yearEntries.map((y:any)=>y.year)).size!==edit.value.yearEntries.length){activeTab.value='terms';error.value='考期年份不能重复';return}
  busy.value = true
  try {
    const draft = edit.value
    await send('/admin/exam-projects/' + draft.id, {
      name: draft.name, shortTitle: draft.shortTitle, categoryId: draft.categoryId,
      intro: typeof draft.intro === 'string' ? draft.intro : JSON.stringify(draft.intro),
      coverUrl: draft.coverUrl, enabled: draft.enabled, yearEntries: draft.yearEntries.map((y:any)=>({...y,startsAt:periodISO(y.startsAt),endsAt:periodISO(y.endsAt)}))
    }, 'PUT')
    drawer.value = false
    ElMessage.success('考试项目已保存')
    try { await load() } catch { ElMessage.warning('已保存，列表刷新失败，请点击刷新') }
  } catch (failure: any) {
    error.value = failure.message
  } finally {
    busy.value = false
  }
}
async function toggleStatus(row: any) {
  try { await send('/admin/exam-projects/' + row.id + '/status', { enabled: !row.enabled }, 'PATCH'); await load() }
  catch (failure: any) { ElMessage.error(failure.message) }
}
onMounted(() => load().catch(failure => ElMessage.error(failure.message)))
defineExpose({ open, load })
</script>

<template>
  <section class="projects-page">
    <form class="admin-filters" @submit.prevent="applySearch">
      <label class="admin-filter-field exam-search-field"><span>考试名称</span><el-input v-model="keyword" aria-label="搜索考试名称或短标题" clearable placeholder="输入考试名称或短标题" @clear="applySearch"><template #prefix><Search :size="16" /></template></el-input></label>
      <div class="admin-filter-actions"><el-button type="primary" native-type="submit"><Search :size="16" />查询</el-button><el-button @click="resetSearch"><RotateCcw :size="16" />重置</el-button></div>
    </form>
    <el-table :data="filtered" empty-text="暂无考试项目">
      <el-table-column label="考试项目" min-width="240">
        <template #default="{ row }"><strong>{{ row.name }}</strong><small v-if="row.short_title" class="cell-sub">{{ row.short_title }}</small></template>
      </el-table-column>
      <el-table-column label="分类" prop="category_name" width="170" />
      <el-table-column label="考期与起止时间" min-width="300">
        <template #default="{ row }">
          <div v-if="row.year_entries?.length" class="period-list"><div v-for="entry in row.year_entries" :key="entry.id"><span>{{entry.year}} 年考期</span><small class="cell-sub">{{periodTime(entry.startsAt)||'未设置'}} 至 {{periodTime(entry.endsAt)||'未设置'}}</small></div></div>
          <span v-else class="subtle-label">未设置</span>
        </template>
      </el-table-column>
      <el-table-column label="了解考试" width="115"><template #default="{row}"><el-tooltip v-if="row.has_guide" :content="'已填写：'+guideYears(row)"><el-tag type="success" effect="plain">有</el-tag></el-tooltip><span v-else class="subtle-label">无</span></template></el-table-column>
      <el-table-column label="状态" width="100">
        <template #default="{ row }"><el-tag :type="row.enabled ? 'success' : 'info'">{{ row.enabled ? '启用' : '禁用' }}</el-tag></template>
      </el-table-column>
      <el-table-column label="操作" width="100" fixed="right">
        <template #default="{ row }">
          <el-tooltip content="编辑考试项目"><el-button link type="primary" :aria-label="`编辑${row.name}`" title="编辑" @click="open(row)"><Pencil :size="16" aria-hidden="true" /></el-button></el-tooltip>
          <el-tooltip :content="row.enabled ? '禁用考试项目' : '启用考试项目'"><el-button link :type="row.enabled ? 'danger' : 'success'" :aria-label="row.enabled ? `禁用${row.name}` : `启用${row.name}`" :title="row.enabled ? '禁用' : '启用'" @click="toggleStatus(row)"><Power :size="16" aria-hidden="true" /></el-button></el-tooltip>
        </template>
      </el-table-column>
    </el-table>
  </section>
  <el-drawer v-model="drawer" :title="drawerMode === 'create' ? '新增考试项目' : '编辑考试项目'"
    direction="rtl" size="min(820px,100vw)" class="exam-project-drawer" destroy-on-close :close-on-click-modal="false" :before-close="beforeClose">
    <el-form v-if="drawer" :key="formSession" label-position="top" :disabled="busy">
      <RecordIdentifier v-if="drawerMode==='edit'" :id="edit.id" table="knowledge_nodes"/>
      <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon class="project-error"/>
      <el-tabs v-model="activeTab" :before-leave="beforeTabLeave" class="project-tabs">
      <el-tab-pane label="基本信息" name="basic">
      <div v-if="activeTab==='basic'" class="project-tab-body">
      <div class="tab-intro"><strong>考试基本信息</strong><span>带 * 的项目为必填项</span></div>
      <el-form-item label="考试名称" required><el-input v-model="edit.name" maxlength="100" /></el-form-item>
      <el-form-item label="短标题"><el-input v-model="edit.shortTitle" maxlength="40" placeholder="用于空间有限的展示区域" /></el-form-item>
      <el-form-item label="所属分类" required>
        <el-select v-model="edit.categoryId" placeholder="请选择分类"><el-option v-for="category in roots" :key="category.id" :label="category.name" :value="category.id" /></el-select>
      </el-form-item>
      <el-form-item label="考试简介"><RichEditor v-model="edit.intro" :content-id="edit.id" :allow-media="false" :allow-handouts="false" @busy="imageBusy=$event" /></el-form-item>
      <el-form-item label="封面图">
        <CoverImagePicker v-model="edit.coverUrl" :content-id="edit.id" :disabled="busy" @busy="imageBusy = $event" />
      </el-form-item>
      <el-form-item label="启用"><el-switch v-model="edit.enabled" /></el-form-item>
      </div></el-tab-pane>
      <el-tab-pane label="考期" name="terms">
      <div class="project-tab-body">
      <div class="tab-intro"><strong>考期配置 <span class="required-note">必填</span></strong><span>填写考期年份、开始时间和结束时间，统一使用北京时间。同一考试的考期不能重叠。</span><span>修改时间会同步影响该考期的会员有效期；已关联订单或人工权益的考期不能删除或修改年份。</span></div>
        <div class="exam-year-entries">
          <div v-for="(item, index) in edit.yearEntries" :key="item.id" class="year-card">
            <div class="year-card-heading"><span><CalendarDays :size="17"/>考期 {{Number(index)+1}}</span><el-tag v-if="hasExamGuide(item.guideDocument)" type="success" effect="plain">已填写了解考试</el-tag><el-tooltip content="删除考期"><el-button link type="danger" :aria-label="'删除'+item.year+'年考期'" @click="removeYear(Number(index))"><Trash2 :size="17"/></el-button></el-tooltip></div>
            <el-form-item label="考期年份" required class="period-year"><el-input-number v-model="item.year" :min="2000" :max="2100" aria-label="考期年份" /></el-form-item>
            <div class="year-row"><el-form-item label="开始时间（北京时间）" required><el-date-picker v-model="item.startsAt" type="datetime" value-format="YYYY-MM-DD HH:mm:ss" placeholder="选择开始时间" aria-label="开始时间" :editable="true" /></el-form-item>
            <el-form-item label="结束时间（北京时间）" required><el-date-picker v-model="item.endsAt" type="datetime" value-format="YYYY-MM-DD HH:mm:ss" placeholder="选择结束时间" aria-label="结束时间" :default-time="new Date(2000,0,1,23,59,59)" :editable="true" /></el-form-item></div>
          </div>
          <el-button plain class="add-term" :disabled="edit.yearEntries.length>=30" @click="addYear"><Plus :size="16" />新增考期</el-button>
        </div>
      </div></el-tab-pane>
      <el-tab-pane label="了解考试" name="guide">
      <div v-if="activeTab==='guide'" class="project-tab-body">
        <div class="tab-intro"><strong>了解考试 <span class="optional-note">选填</span></strong><span>每个考期一篇图文，可填写报考指南、考试规则和平台学习指导。</span></div>
        <el-form-item label="所属考期"><el-select v-model="selectedTermId" aria-label="了解考试所属考期" placeholder="选择考期" :disabled="imageBusy"><el-option v-for="term in edit.yearEntries" :key="term.id" :label="term.year+' 年考期'" :value="term.id"/></el-select></el-form-item>
        <template v-if="selectedTerm"><el-form-item label="图文正文（选填）"><RichEditor :key="selectedTerm.id" v-model="selectedTerm.guideDocument" :content-id="'exam-guide-'+selectedTerm.id" :allow-media="false" :allow-handouts="false" @busy="imageBusy=$event"/></el-form-item><p class="guide-save-note">保存后，前端“了解考试”展示当前考期对应的图文。</p></template>
        <el-empty v-else description="请先配置考期" :image-size="80"><el-button @click="activeTab='terms'">配置考期</el-button></el-empty>
      </div></el-tab-pane>
      </el-tabs>
    </el-form>
    <template #footer>
      <el-button :disabled="busy||imageBusy" @click="close">返回</el-button>
      <el-button type="primary" :loading="busy" :disabled="imageBusy" @click="save">保存</el-button>
    </template>
  </el-drawer>
</template>

<style scoped>
.exam-search-field { flex: 0 1 360px; max-width: 100%; }
.period-list{display:grid;gap:12px}.period-year :deep(.el-input-number){width:160px}.year-row{grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important}@media(max-width:560px){.year-row{grid-template-columns:minmax(0,1fr)!important}}
.project-error{margin-bottom:16px}.project-tabs :deep(.el-tabs__item){height:48px;font-weight:600}.project-tab-body{padding-top:12px}.tab-intro{display:flex;flex-direction:column;gap:8px;margin-bottom:24px}.tab-intro strong{font-size:16px;color:var(--el-text-color-primary)}.tab-intro>span,.guide-save-note{font-size:13px;line-height:1.7;color:var(--el-text-color-secondary)}.required-note,.optional-note{font-size:12px;font-weight:400;margin-left:6px;color:var(--el-text-color-secondary)}
.exam-year-entries{width:100%;min-width:0;display:grid;gap:16px}.year-card{padding:18px 20px;border:1px solid var(--el-border-color-light);border-radius:8px;background:var(--el-fill-color-extra-light)}.year-card-heading{display:flex;align-items:center;gap:12px;margin-bottom:18px}.year-card-heading>span:first-child{display:flex;align-items:center;gap:8px;font-weight:600;flex:1}.year-row{display:grid;grid-template-columns:1fr 1.5fr;gap:20px}.year-row :deep(.el-form-item){margin-bottom:0}.year-row :deep(.el-input-number),.year-row :deep(.el-date-editor){width:100%}.add-term{width:100%;min-height:40px;border-style:dashed}.guide-save-note{margin:0 0 20px}@media(max-width:560px){.year-row{grid-template-columns:1fr}.year-card{padding:16px}.year-card-heading{flex-wrap:wrap}}
</style>
