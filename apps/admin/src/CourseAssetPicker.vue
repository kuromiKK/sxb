<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue'
import { Upload, Trash2 } from 'lucide-vue-next'
import { send, request } from './api'
import { uploadResource } from './utils/upload-resource'
const props=defineProps<{modelValue?:string;kind:'image'|'video'|'audio'|'handout';examId:string;contentId:string;label:string;legacyUrl?:string}>()
const emit=defineEmits<{'update:modelValue':[string];busy:[boolean];clear:[]}>()
const source=ref('upload'),url=ref(''),file=ref<File>(),error=ref(''),busy=ref(false),progress=ref(0),filename=ref('')
const input=ref<HTMLInputElement>();let xhr:ReturnType<typeof uploadResource>|undefined
const preview=ref('')
watch(()=>props.modelValue,async value=>{preview.value='';if(!value)return;try{const asset=await request('/admin/media/'+encodeURIComponent(value));if(props.modelValue!==value)return;filename.value=asset.filename;if(props.kind==='image'){const result=await send('/admin/media/'+encodeURIComponent(value)+'/ticket',{});if(props.modelValue===value)preview.value=result.url}}catch(e:any){error.value=e.message}},{immediate:true})
function choose(e:Event){file.value=(e.target as HTMLInputElement).files?.[0];error.value=''}
function upload(){xhr=uploadResource(file.value!,{examId:props.examId,contentId:props.contentId,kind:props.kind,onProgress:value=>progress.value=value});return xhr.promise}
async function add(){if(busy.value)return;error.value='';if(source.value==='upload'&&(!file.value||file.value.size>200*1024*1024)){error.value=file.value?'单个文件不能超过200MB':'请选择文件';return}busy.value=true;emit('busy',true);progress.value=0;try{const asset=source.value==='upload'?await upload():await send('/admin/media/external',{examId:props.examId,contentId:props.contentId,kind:props.kind,filename:props.label,url:url.value});filename.value=file.value?.name||props.label;emit('update:modelValue',asset.id)}catch(e:any){error.value=e.message}finally{busy.value=false;emit('busy',false);xhr=undefined}}
function remove(){emit('update:modelValue','');emit('clear');filename.value='';file.value=undefined;url.value=''}
onBeforeUnmount(()=>{xhr?.abort();emit('busy',false)})
</script>
<template>
 <div class="course-asset" :aria-label="label">
  <div v-if="modelValue||legacyUrl" class="asset-attached"><img v-if="preview" :src="preview" :alt="label" style="width:96px;height:72px;object-fit:contain;border-radius:6px"/><span>{{filename||('已配置'+label)}}</span><el-button text type="danger" :aria-label="'移除'+label" :disabled="busy" @click="remove"><Trash2 :size="16"/>移除</el-button></div>
  <template v-else>
   <el-radio-group v-if="kind!=='image'" v-model="source" :aria-label="label+'来源'" :disabled="busy"><el-radio-button value="upload">上传文件</el-radio-button><el-radio-button value="external">链接</el-radio-button></el-radio-group>
   <div class="asset-input" v-if="source==='upload'"><input ref="input" type="file" :aria-label="'选择'+label+'文件'" hidden :accept="kind==='image'?'image/png,image/jpeg,image/webp,image/gif':kind==='video'?'video/mp4,video/webm':kind==='audio'?'audio/*':'.pdf,.docx,.pptx'" @change="choose"/><el-button :disabled="busy" @click="input?.click()"><Upload :size="16"/>选择文件</el-button><span>{{file?.name||'尚未选择文件'}}</span><el-button type="primary" plain :loading="busy" @click="add">上传{{label}}</el-button></div>
   <div v-else class="asset-input"><el-input v-model="url" :aria-label="label+'链接'" placeholder="https://" :disabled="busy"/><el-button type="primary" plain :loading="busy" @click="add">添加链接</el-button></div>
   <small v-if="source==='upload'">{{kind==='handout'?'支持 PDF、DOCX、PPTX；':''}}单个文件不超过 200MB</small>
  </template>
  <el-progress v-if="busy" :percentage="progress"/><p v-if="error" class="asset-error" role="alert">{{error}}</p>
 </div>
</template>
<style scoped>.course-asset{width:100%;border:1px solid var(--admin-border);background:var(--el-fill-color-lighter);border-radius:8px;padding:14px;box-sizing:border-box}.asset-input,.asset-attached{display:flex;align-items:center;gap:10px;margin-top:12px}.asset-input span,.asset-attached span{flex:1;overflow-wrap:anywhere;min-width:0}.asset-attached{margin:0}.course-asset small{display:block;color:var(--el-text-color-secondary);margin-top:8px}.asset-error{color:var(--el-color-danger);margin:8px 0 0}.course-asset svg{margin-right:5px}.asset-input .el-input{flex:1;min-width:0}@media(max-width:600px){.asset-input{flex-wrap:wrap}}</style>
