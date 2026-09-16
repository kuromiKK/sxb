<script setup lang="ts">
import {computed,ref,watch} from 'vue'
import {PlugZap} from 'lucide-vue-next'
import {send} from './api'
const props=defineProps<{edit:any;disabled?:boolean}>(),emit=defineEmits<{busy:[boolean];model:[string]}>()
const models=ref<string[]>(props.edit.has_key||props.edit.config.mode==='mock'?[props.edit.config.model]:[]),testing=ref(false),error=ref(''),message=ref('')
const hasKey=computed(()=>Boolean(props.edit.apiKey?.trim()||props.edit.has_key))
watch([()=>props.edit.config.baseUrl,()=>props.edit.apiKey],()=>{models.value=[];props.edit.config.model='';error.value='';message.value=''}, {flush:'sync'})
watch(()=>props.edit.config.mode,mode=>{if(mode==='live'&&!props.edit.has_key){models.value=[];props.edit.config.model=''}})
async function discover(){
 testing.value=true;emit('busy',true);error.value='';message.value='';models.value=[]
 const selected=props.edit.config.model;props.edit.config.model=''
 try{const data=await send('/admin/ai/'+props.edit.id+'/models',{revision:props.edit.revision,baseUrl:props.edit.config.baseUrl.trim(),apiKey:props.edit.apiKey?.trim()||undefined});props.edit.config.baseUrl=data.baseUrl;models.value=data.models;props.edit.config.model=models.value.includes(selected)?selected:'';message.value=data.message}catch(e:any){error.value=e.message}finally{testing.value=false;emit('busy',false)}
}
</script>
<template>
 <el-form-item label="API Key" :required="edit.config.mode==='live'"><div class="ai-key-test"><el-input v-model="edit.apiKey" aria-label="API Key" type="password" show-password autocomplete="new-password" :disabled="disabled||testing" :placeholder="edit.has_key?'已加密保存，留空使用原密钥':'请输入服务商密钥'"/><el-button :loading="testing" :disabled="disabled||!hasKey" @click="discover"><PlugZap :size="15"/>测试并获取模型</el-button></div><small class="field-help">直接测试当前填写内容，无需先保存。更换 API 地址时请重新填写密钥。</small></el-form-item>
 <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon class="ai-discovery-result"/>
 <el-alert v-if="message" :title="message" type="success" :closable="false" show-icon class="ai-discovery-result"/>
 <el-form-item label="模型 ID" required><el-select v-model="edit.config.model" filterable :disabled="disabled||testing||(!models.length&&edit.config.mode==='live')" placeholder="先测试获取模型，再选择" aria-label="模型 ID" @change="emit('model',$event)"><el-option v-for="model in models" :key="model" :value="model" :label="model"/><el-option v-if="edit.config.mode==='mock'&&!models.length" value="local-test" label="本地测试模型"/></el-select><small class="field-help">列表来自服务商，支持搜索。保存后可在列表中测试模型调用能力。</small></el-form-item>
</template>
<style scoped>
.ai-key-test{display:flex;gap:10px;width:100%;align-items:center}.ai-key-test .el-input{flex:1;min-width:0}.ai-key-test .el-button{flex-shrink:0}.ai-discovery-result{margin-bottom:18px}.field-help{display:block;width:100%;margin-top:8px;line-height:1.7;color:var(--el-text-color-secondary)}@media(max-width:600px){.ai-key-test{flex-wrap:wrap}.ai-key-test .el-input{flex-basis:100%}}
</style>
