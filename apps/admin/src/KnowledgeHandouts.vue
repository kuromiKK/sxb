<script setup lang="ts">
import { ref, onBeforeUnmount } from 'vue'
import { FileText, Upload, Trash2 } from 'lucide-vue-next'
import { send } from './api'
import { uploadResource } from './utils/upload-resource'
type Handout = { assetId:string; title:string }
const props=defineProps<{modelValue:Handout[];examId:string;contentId:string}>()
const emit=defineEmits<{ 'update:modelValue':[Handout[]]; busy:[boolean] }>()
const source=ref('upload'),name=ref(''),url=ref(''),file=ref<File>(),busy=ref(false),progress=ref(0),error=ref('')
const input=ref<HTMLInputElement>();let xhr:ReturnType<typeof uploadResource>|undefined
function choose(event:Event){file.value=(event.target as HTMLInputElement).files?.[0];if(file.value&&!name.value)name.value=file.value.name;error.value=''}
function upload(){
  xhr=uploadResource(file.value!,{examId:props.examId,contentId:props.contentId,kind:'handout',onProgress:value=>progress.value=value})
  return xhr.promise
}
async function add(){
  if(busy.value)return;error.value=''
  if(!props.examId){error.value='请先选择所属考试';return}
  if(!name.value.trim()){error.value='请填写讲义名称';return}
  if(props.modelValue.length){error.value='每个知识点只能添加一份讲义，请先移除现有讲义';return}
  if(source.value==='upload'&&(!file.value||file.value.size>200*1024*1024)){error.value=file.value?'单个文件不能超过200MB':'请选择讲义文件';return}
  busy.value=true;emit('busy',true);progress.value=0
  try{
    const asset=source.value==='upload'?await upload():await send('/admin/media/external',{examId:props.examId,contentId:props.contentId,kind:'handout',filename:name.value.trim(),url:url.value})
    emit('update:modelValue',[...props.modelValue,{assetId:asset.id,title:name.value.trim()}])
    name.value='';url.value='';file.value=undefined;if(input.value)input.value.value=''
  }catch(e:any){error.value=e.message}finally{busy.value=false;emit('busy',false);xhr=undefined}
}
function remove(index:number){emit('update:modelValue',props.modelValue.filter((_,i)=>i!==index))}
onBeforeUnmount(()=>xhr?.abort())
</script>
<template>
  <section class="knowledge-handouts" aria-label="知识点配套讲义">
    <ul v-if="modelValue.length" class="handout-files">
      <li v-for="(item,index) in modelValue" :key="item.assetId"><FileText :size="20" aria-hidden="true" /><span>{{ item.title }}</span><el-button text type="danger" :disabled="busy" :aria-label="'移除讲义：'+item.title" @click="remove(index)"><Trash2 :size="16" aria-hidden="true" />移除</el-button></li>
    </ul>
    <template v-if="!modelValue.length">
    <label class="field-label" for="knowledge-handout-name">讲义名称</label>
    <el-input id="knowledge-handout-name" v-model="name" :disabled="busy" maxlength="200" placeholder="例如：服务对象自决·复习讲义" />
    <el-radio-group v-model="source" :disabled="busy" aria-label="讲义来源"><el-radio-button value="upload">上传文件</el-radio-button><el-radio-button value="external">HTTPS 外链</el-radio-button></el-radio-group>
    <template v-if="source==='upload'">
      <input ref="input" type="file" accept=".pdf,.docx,.pptx" hidden tabindex="-1" aria-hidden="true" :disabled="busy" @change="choose" />
      <div class="handout-file-picker"><el-button :disabled="busy" @click="input?.click()"><Upload :size="16" aria-hidden="true" />选择文件</el-button><span v-if="file" class="selected-filename" role="status">{{ file.name }}</span></div>
      <p class="handout-hint">支持PDF、docx、pptx，不超过200M</p>
    </template>
    <template v-else><label class="field-label" for="knowledge-handout-url">讲义外链地址</label><el-input id="knowledge-handout-url" v-model="url" :disabled="busy" placeholder="https://" /></template>
    <el-progress v-if="busy&&source==='upload'" :percentage="progress" />
    <p v-if="error" class="handout-error" role="alert">{{ error }}</p>
    <div class="handout-actions"><el-button type="primary" plain :loading="busy" @click="add"><Upload v-if="!busy" :size="16" aria-hidden="true" />{{ source==='upload'?'上传并添加讲义':'添加外链讲义' }}</el-button><el-button v-if="busy&&source==='upload'" @click="xhr?.abort()">取消上传</el-button></div>
    </template>
    <p class="handout-hint">添加或移除后，点击底部“保存内容”生效。</p>
  </section>
</template>
<style scoped>
.knowledge-handouts{width:100%;padding:16px;border:1px solid var(--el-border-color);border-radius:6px;background:var(--el-fill-color-lighter);box-sizing:border-box}.handout-hint{margin:0 0 12px;color:var(--el-text-color-regular);font-size:14px;line-height:1.65}.field-label{display:block;margin:0 0 6px;font-size:14px;color:var(--el-text-color-primary)}.el-radio-group{margin:16px 0 12px}.handout-file-picker{display:flex;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:10px}.handout-file-picker .el-button{flex:none}.handout-file-picker svg{margin-right:6px}.selected-filename{min-width:0;overflow-wrap:anywhere;font-size:14px;line-height:1.6;color:var(--el-text-color-regular)}.handout-files{padding:0;margin:0 0 16px;list-style:none}.handout-files li{display:flex;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid var(--el-border-color-lighter)}.handout-files li>svg{flex:none;color:var(--el-color-primary)}.handout-files li>span{flex:1;min-width:0;overflow-wrap:anywhere;font-size:15px;line-height:1.6}.handout-actions{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}.handout-error{color:var(--el-color-danger);font-size:14px;margin:8px 0}.handout-actions svg{margin-right:6px}
</style>
