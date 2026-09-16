<script setup lang="ts">
import {computed,reactive,ref} from 'vue'
import {ElMessage} from 'element-plus'
import {ShieldCheck,Save,ExternalLink,KeyRound} from 'lucide-vue-next'
import {providerDefinitions,type ProviderKey} from '../../shared/provider-settings'
import {send} from './api'
import IntegrationTest from './IntegrationTest.vue'
const props=defineProps<{provider:ProviderKey;row:any}>(),emit=defineEmits(['saved'])
const config=reactive({...props.row.config}),credentials=reactive<Record<string,string>>({}),clearFields=ref<string[]>([]),busy=ref(false),error=ref(''),check=ref('')
const def=computed(()=>providerDefinitions[props.provider]),fields=computed(()=>def.value.fields.filter(f=>!f.when||config[f.when[0]]===f.when[1]))
const dirty=computed(()=>JSON.stringify(config)!==JSON.stringify(props.row.config)||Object.values(credentials).some(Boolean)||clearFields.value.length>0)
async function submit(validate=false){busy.value=true;error.value='';check.value='';try{const r=await send('/admin/integrations/'+props.provider+(validate?'/validate':''),{revision:props.row.revision,config,credentials:Object.fromEntries(Object.entries(credentials).filter(([,v])=>v.trim())),clearFields:clearFields.value},validate?'POST':'PUT');if(validate)check.value=r.message;else{Object.keys(credentials).forEach(k=>delete credentials[k]);clearFields.value=[];emit('saved');ElMessage.success('配置已保存')}}catch(e:any){error.value=e.message}finally{busy.value=false}}
</script>
<template>
 <div class="provider-layout">
  <el-form label-position="top" class="provider-form" :disabled="busy" @input="check=''" @change="check=''">
   <div class="provider-enable"><div><h3>启用{{def.title}}</h3><p>可先保存配置，凭据齐全后再开启。</p></div><el-switch v-model="config.enabled" :aria-label="'启用'+def.title"/></div>
   <el-alert v-if="error" :title="error" type="error" show-icon :closable="false"/>
   <el-alert v-if="check" :title="check" type="success" show-icon :closable="false"/>
   <div class="provider-fields">
    <el-form-item v-for="f in fields" :key="f.key" :label="f.label" :class="{'wide':f.multiline||f.hint||f.toggle}" :required="config.enabled&&!f.toggle">
     <el-switch v-if="f.toggle" v-model="config[f.key]" :aria-label="f.label"/>
     <el-select v-else-if="f.options" v-model="config[f.key]" :aria-label="f.label"><el-option v-for="o in f.options" :key="o.value" :value="o.value" :label="o.label"/></el-select>
     <template v-else-if="f.secret"><el-input v-model="credentials[f.key]" :type="f.multiline?'textarea':'password'" :rows="4" :show-password="!f.multiline" autocomplete="new-password" :aria-label="f.label" :placeholder="row.credentialFields?.[f.key]?'已安全保存；留空保留原值':f.multiline?'粘贴完整 PEM 内容（包含 BEGIN / END）':'请输入'+f.label"/><div class="credential-status"><span><KeyRound :size="12"/>{{row.credentialFields?.[f.key]?'已保存，不回显':'尚未填写'}}</span><el-checkbox v-if="row.credentialFields?.[f.key]" v-model="clearFields" :value="f.key">清除已保存值</el-checkbox></div></template>
     <el-input v-else v-model="config[f.key]" :aria-label="f.label" :placeholder="'请输入'+f.label"/>
     <p v-if="f.hint" class="field-hint">{{f.hint}}</p>
    </el-form-item>
   </div>
   <div class="provider-actions"><el-button type="primary" :loading="busy" :disabled="!dirty" @click="submit()"><Save :size="16"/>保存配置</el-button><el-button :disabled="busy" @click="submit(true)"><ShieldCheck :size="16"/>检查配置</el-button></div>
  </el-form>
  <aside class="provider-guide"><IntegrationTest :provider="provider" :revision="row.revision" :dirty="Boolean(dirty)" :disabled="busy"/><span class="guide-kicker">接入指南</span><h3>{{def.title}}</h3><p>{{def.description}}</p><ol><li>申请应用与对应业务权限</li><li>填写应用信息、密钥及回调地址</li><li>在服务商平台设置域名与商户绑定</li><li>检查配置并保存，完成真实环境联调</li></ol><el-alert title="密钥仅在服务端加密保存" type="info" :closable="false"/><p class="guide-foot">检查配置仅核对格式；测试连接会发起接口请求。真实登录与支付还需要公网 HTTPS、平台权限和正确的回调域名。</p><a :href="def.docs" target="_blank" rel="noopener noreferrer">查看官方接入文档<ExternalLink :size="14"/></a></aside>
 </div>
</template>
<style scoped>
.provider-layout{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:24px;align-items:start}.provider-form,.provider-guide{border:1px solid var(--admin-border);border-radius:12px;background:var(--el-bg-color);padding:26px}.provider-enable{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--admin-border);padding-bottom:18px;margin-bottom:26px}.provider-enable h3{font-size:16px;margin:0 0 8px}.provider-enable p,.field-hint,.guide-foot{font-size:13px;color:var(--el-text-color-regular);line-height:1.8;margin:0}.provider-fields{display:grid;grid-template-columns:1fr 1fr;gap:0 20px;margin-top:20px}.wide{grid-column:1/-1}.provider-fields :deep(.el-form-item__label){font-weight:600}.field-hint{width:100%;margin-top:7px}.credential-status{display:flex;align-items:center;justify-content:space-between;width:100%;font-size:12px;color:var(--el-text-color-secondary);gap:10px}.credential-status>span{display:flex;gap:5px;align-items:center}.provider-actions{display:flex;gap:8px;border-top:1px solid var(--admin-border);padding-top:22px}.provider-guide{position:sticky;top:20px}.guide-kicker{color:var(--el-color-primary);font-size:12px;letter-spacing:2px}.provider-guide h3{margin:12px 0;font-size:20px}.provider-guide p,.provider-guide li{color:var(--el-text-color-regular);font-size:13px;line-height:1.9}.provider-guide ol{padding-left:18px;margin:22px 0}.provider-guide li{margin:12px 0}.guide-foot{margin:16px 0}.provider-guide a{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--el-color-primary);text-decoration:none}@media(max-width:1100px){.provider-layout{grid-template-columns:1fr}.provider-guide{position:static}}@media(max-width:600px){.provider-fields{grid-template-columns:1fr}.provider-form,.provider-guide{padding:18px}}
</style>
