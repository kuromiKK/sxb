<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Search, ListFilter, X, RotateCcw, Check } from 'lucide-vue-next'
type Node={id:string;title:string;kind:string;exam_id:string;parent_id:string|null}
const props=defineProps<{modelValue:string[];nodes:Node[];examId:string|null;disabled?:boolean}>()
const emit=defineEmits<{ 'update:modelValue':[ids:string[]] }>()
const visible=ref(false),draft=ref<string[]>([]),keyword=ref(''),subject=ref(''),chapter=ref(''),section=ref(''),page=ref(1)
const scoped=computed(()=>props.nodes.filter(n=>n.exam_id===props.examId))
const byId=computed(()=>new Map(scoped.value.map(n=>[n.id,n])))
function ancestors(n:Node){const parents:Node[]=[];const visited=new Set([n.id]);let p=byId.value.get(n.parent_id||'');while(p&&!visited.has(p.id)){visited.add(p.id);parents.unshift(p);p=byId.value.get(p.parent_id||'')}return parents}
const subjects=computed(()=>scoped.value.filter(n=>n.kind==='subject'))
const chapters=computed(()=>scoped.value.filter(n=>n.kind==='chapter'&&(!subject.value||ancestors(n).some(p=>p.id===subject.value))))
const sections=computed(()=>scoped.value.filter(n=>n.kind==='section'&&(!subject.value||ancestors(n).some(p=>p.id===subject.value))&&(!chapter.value||ancestors(n).some(p=>p.id===chapter.value))))
const points=computed(()=>scoped.value.filter(n=>n.kind==='knowledge').map(n=>{const parents=ancestors(n);return {...n,path:parents.map(p=>p.title).join(' / '),ancestorIds:parents.map(p=>p.id)}}))
const pointMap=computed(()=>new Map(points.value.map(n=>[n.id,n])))
const resolve=(ids:string[])=>ids.map(id=>pointMap.value.get(id)||{id,title:'该知识点暂不可用',path:'请移除后重新选择',ancestorIds:[]})
const chosen=computed(()=>resolve(props.modelValue||[])),pending=computed(()=>resolve(draft.value))
const selectedIds=computed(()=>new Set(draft.value))
const filtered=computed(()=>points.value.filter(p=>[subject.value,chapter.value,section.value].every(id=>!id||p.ancestorIds.includes(id))&&(!keyword.value.trim()||(p.title+' '+p.path+' '+p.id).toLocaleLowerCase().includes(keyword.value.trim().toLocaleLowerCase()))))
const displayed=computed(()=>filtered.value.slice((page.value-1)*20,page.value*20))
watch(subject,()=>{chapter.value='';section.value=''})
watch(chapter,()=>{section.value=''})
watch([keyword,subject,chapter,section],()=>{page.value=1})
watch(()=>props.examId,()=>{visible.value=false;draft.value=[];reset()})
function reset(){keyword.value='';subject.value='';chapter.value='';section.value='';page.value=1}
function open(){draft.value=[...props.modelValue];reset();visible.value=true}
function toggle(id:string){draft.value=selectedIds.value.has(id)?draft.value.filter(v=>v!==id):[...draft.value,id]}
function remove(id:string){emit('update:modelValue',props.modelValue.filter(v=>v!==id))}
function confirm(){emit('update:modelValue',[...draft.value]);visible.value=false}
</script>
<template>
  <div class="knowledge-point-picker">
    <div class="kp-summary"><span>{{chosen.length?'已关联 '+chosen.length+' 个知识点':'尚未关联知识点'}}</span><el-button :disabled="disabled||!examId" @click="open"><ListFilter :size="16"/>选择知识点</el-button></div>
    <ul v-if="chosen.length" class="kp-chosen" aria-label="已关联知识点"><li v-for="p in chosen" :key="p.id"><div><span>{{p.title}}</span><small>{{p.path}}</small></div><el-button link :disabled="disabled" :aria-label="'移除关联：'+p.title" @click="remove(p.id)"><X :size="16"/></el-button></li></ul>
    <p v-else class="kp-hint">按科目、章、节查找，可关联本考试下的多个知识点。</p>
    <el-dialog v-model="visible" title="选择关联知识点" class="knowledge-picker-dialog" width="min(1040px, calc(100vw - 40px))" append-to-body :close-on-click-modal="false" destroy-on-close>
      <div class="kp-search"><el-input v-model="keyword" aria-label="搜索知识点名称或目录" placeholder="搜索知识点名称或所属目录" clearable><template #prefix><Search :size="17"/></template></el-input><el-button @click="reset"><RotateCcw :size="16"/>重置筛选</el-button></div>
      <div class="kp-filters">
        <label><span>科目</span><el-select v-model="subject" aria-label="选择器科目" :empty-values="[null,undefined]" filterable popper-class="kp-directory-options"><el-option label="全部科目" value=""/><el-option v-for="n in subjects" :key="n.id" :label="n.title" :value="n.id"/></el-select></label>
        <label><span>章</span><el-select v-model="chapter" aria-label="选择器章" :empty-values="[null,undefined]" filterable popper-class="kp-directory-options"><el-option label="全部章" value=""/><el-option v-for="n in chapters" :key="n.id" :label="n.title" :value="n.id"/></el-select></label>
        <label><span>节</span><el-select v-model="section" aria-label="选择器节" :empty-values="[null,undefined]" filterable popper-class="kp-directory-options"><el-option label="全部节" value=""/><el-option v-for="n in sections" :key="n.id" :label="n.title" :value="n.id"/></el-select></label>
      </div>
      <div class="kp-columns">
        <section class="kp-candidates"><header><strong>可选知识点</strong><span>{{filtered.length}} 个结果</span></header><div class="kp-scroll">
          <el-checkbox v-for="p in displayed" :key="p.id" class="kp-option" :class="{'is-picked':selectedIds.has(p.id)}" :model-value="selectedIds.has(p.id)" :aria-label="p.title" @change="toggle(p.id)"><span class="kp-option-title">{{p.title}}</span><small>{{p.path}}</small></el-checkbox>
          <el-empty v-if="!filtered.length" description="没有匹配的知识点，请调整筛选条件" :image-size="64"/>
        </div><div class="kp-pagination"><el-pagination v-model:current-page="page" :page-size="20" :total="filtered.length" layout="prev,pager,next" small :pager-count="5"/></div></section>
        <aside class="kp-selected"><header><strong>已选 <span aria-live="polite">{{draft.length}}</span></strong><el-button link :disabled="!draft.length" @click="draft=[]">清空</el-button></header><div class="kp-scroll"><ul v-if="pending.length"><li v-for="p in pending" :key="p.id"><div><b>{{p.title}}</b><small>{{p.path}}</small></div><el-button link :aria-label="'取消选择：'+p.title" @click="toggle(p.id)"><X :size="16"/></el-button></li></ul><div v-else class="kp-empty"><Check :size="24"/><p>勾选左侧知识点</p><span>已选项会保留，切换筛选不会清空</span></div></div></aside>
      </div>
      <template #footer><span class="kp-footer-note">确认后写入表单，保存题目后生效</span><el-button @click="visible=false">取消</el-button><el-button type="primary" @click="confirm">确认选择（{{draft.length}}）</el-button></template>
    </el-dialog>
  </div>
</template>
<style scoped>
.knowledge-point-picker{width:100%;min-width:0}.kp-summary{display:flex;align-items:center;justify-content:space-between;gap:12px;color:var(--el-text-color-secondary);font-size:13px}.kp-summary .el-button{color:var(--primary)}.kp-hint{margin:8px 0 0;color:var(--el-text-color-secondary);font-size:12px;line-height:1.6}
.kp-chosen{list-style:none;margin:12px 0 0;padding:0 14px;max-height:210px;overflow:auto;border:1px solid var(--admin-border);border-radius:var(--admin-radius);background:var(--el-fill-color-light)}.kp-chosen li{display:flex;align-items:flex-start;gap:10px;padding:12px 0;line-height:1.7}.kp-chosen li+li{border-top:1px solid var(--admin-border)}.kp-chosen li>div{flex:1;min-width:0}.kp-chosen span{display:block;white-space:normal;overflow-wrap:anywhere}.kp-chosen small{display:block;color:var(--el-text-color-secondary);font-size:12px;overflow-wrap:anywhere;margin-top:3px}.kp-chosen .el-button{flex:none;height:28px;width:28px}
.kp-search{display:flex;gap:12px;margin:4px 0 16px}.kp-search .el-input{flex:1}.kp-filters{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-bottom:20px}.kp-filters label{display:flex;flex-direction:column;gap:7px;font-size:12px;color:var(--el-text-color-secondary)}
.kp-columns{display:grid;grid-template-columns:minmax(0,1.65fr) minmax(0,1fr);border:1px solid var(--admin-border);border-radius:var(--admin-radius);overflow:hidden}.kp-columns header{height:48px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 16px;border-bottom:1px solid var(--admin-border);font-size:13px}.kp-columns header>span{color:var(--el-text-color-secondary);font-size:12px}.kp-candidates{min-width:0}.kp-scroll{height:min(390px,40vh);overflow:auto;overscroll-behavior:contain}.kp-candidates .kp-scroll{padding:8px}.kp-option{display:flex;height:auto;min-height:64px;margin:0;width:100%;padding:12px;border-radius:6px;box-sizing:border-box;align-items:flex-start;border:1px solid transparent}.kp-option:hover{background:var(--el-fill-color-light)}.kp-option.is-picked{background:var(--el-color-primary-light-9);border-color:var(--el-color-primary-light-7)}.kp-option+.kp-option{margin-top:4px}.kp-option :deep(.el-checkbox__input){margin-top:4px}.kp-option :deep(.el-checkbox__label){min-width:0;white-space:normal;overflow-wrap:anywhere;line-height:1.65;padding-left:10px}.kp-option-title{display:block;font-weight:500;font-size:14px}.kp-option small{display:block;margin-top:6px;font-size:12px;color:var(--el-text-color-secondary);font-weight:400}.kp-pagination{padding:10px 16px;border-top:1px solid var(--admin-border);display:flex;justify-content:flex-end;min-height:48px;box-sizing:border-box}
.kp-selected{min-width:0;border-left:1px solid var(--admin-border);background:var(--el-fill-color-light)}.kp-selected header strong span{margin-left:5px;color:var(--primary)}.kp-selected .kp-scroll{height:min(438px,calc(40vh + 48px))}.kp-selected ul{list-style:none;padding:0 16px;margin:0}.kp-selected li{display:flex;gap:8px;padding:14px 0;align-items:flex-start}.kp-selected li+li{border-top:1px solid var(--admin-border)}.kp-selected li>div{flex:1;min-width:0}.kp-selected b{display:block;font-weight:500;font-size:13px;line-height:1.7;overflow-wrap:anywhere}.kp-selected small{display:block;font-size:12px;line-height:1.65;color:var(--el-text-color-secondary);margin-top:5px;overflow-wrap:anywhere}.kp-selected li .el-button{width:26px;height:26px;flex:none}.kp-empty{text-align:center;padding:70px 20px;color:var(--el-text-color-secondary)}.kp-empty svg{color:var(--primary)}.kp-empty p{font-size:14px;margin:12px 0 6px}.kp-empty span{font-size:12px;line-height:1.7}.kp-footer-note{float:left;font-size:12px;color:var(--el-text-color-secondary);line-height:40px}
@media(max-width:700px){.kp-columns{grid-template-columns:1fr}.kp-selected{border-left:0;border-top:1px solid var(--admin-border)}.kp-selected .kp-scroll{height:130px}.kp-scroll{height:240px}.kp-filters{gap:8px}.kp-footer-note{display:none}}
</style>
<style>
.knowledge-picker-dialog{--admin-border:#e1e8f0;--admin-radius:8px;--primary:var(--el-color-primary);padding:24px!important;margin-top:6vh!important;margin-bottom:6vh!important}.knowledge-picker-dialog .el-dialog__header{padding-bottom:20px}.knowledge-picker-dialog .el-dialog__title{font-size:18px;font-weight:600}.knowledge-picker-dialog .el-dialog__footer{padding-top:20px}.knowledge-picker-dialog .el-input__wrapper,.knowledge-picker-dialog .el-select__wrapper{min-height:40px;border-radius:8px}.knowledge-picker-dialog .el-button{height:40px;border-radius:8px}.knowledge-picker-dialog .el-button [class*=lucide]{margin-right:6px}.knowledge-picker-dialog .el-button:focus-visible{outline:2px solid var(--el-color-primary);outline-offset:2px}.kp-directory-options{max-width:min(540px,90vw)}.kp-directory-options .el-select-dropdown__item{height:auto;min-height:36px;white-space:normal;overflow-wrap:anywhere;line-height:1.6;padding-top:8px;padding-bottom:8px}
</style>
