<script setup lang="ts">
import { ref, watch } from 'vue'
import { request } from './api'
import { ElMessage } from 'element-plus'
import { Copy } from 'lucide-vue-next'
const props=defineProps<{id?:string|number|null;inline?:boolean;table?:string}>()
const copying=ref(false)
const displayId=ref(''),loading=ref(false),lookupError=ref(false)
let revision=0
watch(()=>[props.id,props.table],async()=>{
  const rev=++revision,value=props.id;displayId.value='';lookupError.value=false;loading.value=false
  if(value===undefined||value===null||value==='')return
  loading.value=true
  try{const result=await request('/admin/record-identifier/'+encodeURIComponent(String(value))+(props.table?'?table='+encodeURIComponent(props.table):''));if(revision===rev)displayId.value=result.displayId||''}
  catch{if(revision===rev)lookupError.value=true}
  finally{if(revision===rev)loading.value=false}
},{immediate:true})
async function copy(){
  if(copying.value||loading.value)return
  if(!displayId.value){ElMessage.warning(lookupError.value?'标识加载失败，请重新打开详情':'保存后生成入库编号');return}
  copying.value=true
  try{
    await navigator.clipboard.writeText(displayId.value)
    ElMessage.success('唯一标识已复制')
  }catch{ElMessage.error('复制失败，请允许浏览器访问剪贴板后重试')}
  finally{copying.value=false}
}
</script>
<template>
  <button v-if="id!==undefined&&id!==null&&id!==''" type="button" class="record-identifier" :class="{'is-inline':inline}" :disabled="copying||loading" :aria-label="'复制唯一标识(ID)：'+displayId" title="点击复制唯一标识" @click="copy">
    <template v-if="inline"><span class="identifier-value">(ID：{{displayId||(loading?'加载中':lookupError?'加载失败':'保存后生成')}})</span></template>
    <template v-else><span class="identifier-label">唯一标识(ID)：</span><span class="identifier-value">{{displayId||(loading?'加载中':lookupError?'加载失败':'保存后生成')}}</span><Copy :size="15" aria-hidden="true"/></template>
  </button>
</template>
<style scoped>
.record-identifier{display:flex;align-items:center;gap:6px;width:100%;min-height:40px;margin:0 0 20px;padding:10px 12px;border:1px solid var(--admin-border,#e1e8f0);border-radius:var(--admin-radius,8px);background:var(--el-fill-color-light,#f5f7fa);color:var(--el-text-color-regular,#4d596b);font-size:13px;text-align:left;line-height:1.6;transition:border-color .18s,background .18s}
.identifier-label{flex-shrink:0}.identifier-value{min-width:0;overflow-wrap:anywhere}.record-identifier svg{flex-shrink:0;margin-left:auto;color:var(--primary,#315bd6)}
.record-identifier:hover{border-color:var(--primary,#315bd6);background:var(--el-color-primary-light-9,#ecf5ff)}
.record-identifier:focus-visible{outline:2px solid var(--primary,#315bd6);outline-offset:2px}
.record-identifier.is-inline{display:inline-flex;vertical-align:baseline;width:auto;max-width:100%;min-height:0;margin:0;padding:2px 0;border:0;border-radius:3px;background:transparent;font-weight:400;font-size:14px;color:var(--el-text-color-secondary,#68798e)}
.record-identifier.is-inline:hover{color:var(--primary,#315bd6);text-decoration:underline;text-underline-offset:3px}
@media(prefers-reduced-motion:reduce){.record-identifier{transition:none}}
</style>
