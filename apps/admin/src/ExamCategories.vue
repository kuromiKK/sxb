<script setup lang="ts">
import RecordIdentifier from './RecordIdentifier.vue'
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Pencil, Trash2 } from 'lucide-vue-next'
import { request, send } from './api'
import RichEditor from './RichEditor.vue'
import CoverImagePicker from './CoverImagePicker.vue'
const rows=ref<any[]>([]),drawer=ref(false),busy=ref(false),imageBusy=ref(false),mode=ref<'create'|'edit'>('create'),formKey=ref(0),error=ref(''),edit=ref<any>({})
const keyword=ref('')
const filtered=computed(()=>rows.value.filter(r=>(r.name+' '+r.id).toLowerCase().includes(keyword.value.trim().toLowerCase())))
const title=computed(()=>mode.value==='create'?'新增分类':'编辑分类')
function parseIntro(v:any){if(!v)return '';if(typeof v!=='string')return structuredClone(v);try{return JSON.parse(v)}catch{return v}}
function displayIntro(v:any){if(!v)return '—';try{const d=typeof v==='string'?JSON.parse(v):v;return (d.content||[]).flatMap((n:any)=>n.content||[]).map((n:any)=>n.text||'').join('')||'—'}catch{return String(v)}}
async function load(){rows.value=await request('/admin/exam-categories')}
function open(row?:any){mode.value=row?'edit':'create';formKey.value++;edit.value={id:row?.id||crypto.randomUUID(),name:row?.name||'',intro:parseIntro(row?.intro),coverUrl:row?.cover_url||'',sortOrder:row?.sort_order||0,enabled:row?.enabled??true};error.value='';imageBusy.value=false;drawer.value=true}
function close(){if(busy.value)return;drawer.value=false;error.value='';imageBusy.value=false}
async function remove(row:any){if(row.exam_count>0)return ElMessage.warning('该分类已关联考试，不能删除');await ElMessageBox.confirm('删除后不可恢复，确定删除吗？','删除分类',{type:'warning'});await send('/admin/exam-management/categories/'+row.id,{},'DELETE');await load();ElMessage.success('已删除')}
async function save(){
  if(busy.value||imageBusy.value)return
  error.value=''
  if(!edit.value.name.trim()){error.value='请输入分类名称';return}
  busy.value=true
  try{
    await send('/admin/exam-management/categories/'+edit.value.id,{name:edit.value.name,parentId:null,intro:typeof edit.value.intro==='string'?edit.value.intro:JSON.stringify(edit.value.intro||''),coverUrl:edit.value.coverUrl||'',sortOrder:edit.value.sortOrder,enabled:edit.value.enabled},'PUT')
    drawer.value=false
    ElMessage.success('分类已保存')
    try{await load()}catch{ElMessage.warning('分类已保存，列表刷新失败，请点击刷新')}
  }catch(e:any){error.value=e.message}finally{busy.value=false}
}
onMounted(()=>load().catch(e=>ElMessage.error(e.message)));defineExpose({open,load})
</script>
<template>
<section class="category-page"><el-input v-model="keyword" placeholder="搜索分类名称或唯一 ID" clearable style="max-width:320px;margin-bottom:16px"/><el-table :data="filtered" empty-text="暂无考试分类"><el-table-column label="分类名称" prop="name" min-width="180"/><el-table-column label="分类简介" min-width="260"><template #default="{row}"><span class="ellipsis">{{displayIntro(row.intro)}}</span></template></el-table-column><el-table-column label="关联考试" prop="exam_count" width="100"/><el-table-column label="排序" prop="sort_order" width="80"/><el-table-column label="状态" width="90"><template #default="{row}"><el-tag :type="row.enabled?'success':'info'">{{row.enabled?'启用':'停用'}}</el-tag></template></el-table-column><el-table-column label="操作" width="120"><template #default="{row}"><el-button link type="primary" title="编辑" @click="open(row)"><Pencil :size="16"/></el-button><el-button link type="danger" title="删除" @click="remove(row)"><Trash2 :size="16"/></el-button></template></el-table-column></el-table></section>
<el-drawer v-model="drawer" :title="title" direction="rtl" size="560px" destroy-on-close :close-on-click-modal="false"><el-form v-if="drawer" :key="formKey" label-position="top" :disabled="busy"><RecordIdentifier v-if="mode==='edit'" :id="edit.id" table="exam_categories"/><el-form-item label="分类名称" required><el-input v-model="edit.name" maxlength="100"/></el-form-item><el-form-item label="分类简介"><RichEditor v-model="edit.intro" :content-id="edit.id" :allow-media="false" :allow-handouts="false" @busy="imageBusy=$event"/></el-form-item><el-form-item label="分类封面图"><CoverImagePicker v-model="edit.coverUrl" :content-id="edit.id" :disabled="busy" :max-size-mb="200" @busy="imageBusy=$event"/></el-form-item><el-form-item label="排序"><el-input-number v-model="edit.sortOrder" :min="0"/></el-form-item><el-form-item label="启用"><el-switch v-model="edit.enabled"/></el-form-item><el-alert v-if="error" :title="error" type="error" :closable="false" show-icon/></el-form><template #footer><el-button :disabled="busy" @click="close">返回</el-button><el-button type="primary" :loading="busy" :disabled="imageBusy" @click="save">保存</el-button></template></el-drawer>
</template>
<style scoped>.category-page{padding:4px 0 40px}.ellipsis{display:block;max-width:300px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}</style>
