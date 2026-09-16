<script setup lang="ts">
import {onMounted,ref} from 'vue'
import {ElMessage} from 'element-plus'
import {ShieldCheck,FlaskConical} from 'lucide-vue-next'
import {request,send} from './api'
const emit=defineEmits<{changed:[]}>()
type Mode='test'|'production'
const data=ref<{mode:Mode;revision:number;productionIssues:string[]}>(),selected=ref<Mode>('test')
const loading=ref(false),saving=ref(false),error=ref(''),dialog=ref(false),password=ref(''),dialogError=ref('')
async function load(){loading.value=true;error.value='';try{data.value=await request('/admin/platform-mode');selected.value=data.value!.mode}catch(e:any){error.value=e.message}finally{loading.value=false}}
function confirm(){password.value='';dialogError.value='';dialog.value=true}
async function save(){
 if(saving.value||!data.value)return
 if(!password.value){dialogError.value='请输入当前管理员密码';return}
 saving.value=true;dialogError.value=''
 try{await send('/admin/platform-mode',{mode:selected.value,revision:data.value.revision,password:password.value,confirmation:selected.value==='test'?'切换测试环境':'切换生产环境'},'PUT');dialog.value=false;password.value='';await load();emit('changed');ElMessage.success('环境已切换，立即生效，学生需重新登录')}
 catch(e:any){dialogError.value=e.message}
 finally{saving.value=false}
}
onMounted(load)
</script>
<template>
 <section class="mode-settings" v-loading="loading" aria-labelledby="mode-title">
  <header><div><h2 id="mode-title"><ShieldCheck :size="19"/>环境设置</h2><p>本机与服务器均可使用测试环境，确认切换后立即生效。</p></div><el-tag v-if="data" :type="data.mode==='production'?'success':'warning'">当前：{{data.mode==='test'?'测试环境':'生产环境'}}</el-tag></header>
  <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon/>
  <template v-if="data">
   <el-radio-group v-model="selected" class="mode-options" :disabled="saving" aria-label="运行环境">
    <el-radio value="test" border><span class="mode-option"><strong><FlaskConical :size="17"/>测试环境</strong><small>允许测试验证码、模拟支付，用于功能验收。</small></span></el-radio>
    <el-radio value="production" border><span class="mode-option"><strong><ShieldCheck :size="17"/>生产环境</strong><small>禁止测试验证码与模拟支付，使用真实服务。</small></span></el-radio>
   </el-radio-group>
   <p class="mode-note">测试验证码会显示在登录页，不验证手机号所有权。测试环境仅用于测试账号；两种环境均保留管理员密码、登录验证、权限校验与操作日志。</p>
   <el-alert v-if="selected==='production'&&data.productionIssues.length" title="切换生产环境前需完成以下配置" type="warning" :closable="false" show-icon><ul><li v-for="issue in data.productionIssues" :key="issue">{{issue}}</li></ul></el-alert>
   <footer><span>环境切换不会清空业务数据，也不会自动把测试数据变成正式数据。</span><el-button type="primary" :disabled="saving||selected===data.mode||(selected==='production'&&data.productionIssues.length>0)" @click="confirm">确认切换环境</el-button></footer>
  </template>
 </section>
 <el-dialog v-model="dialog" title="确认切换运行环境" width="min(520px,94vw)" :close-on-click-modal="false" :close-on-press-escape="!saving" :show-close="!saving" @closed="password=''" data-page-agent-ignore="true">
  <p>即将切换为<strong>{{selected==='test'?'测试环境':'生产环境'}}</strong>。现有验证码和学生登录状态将失效，管理员登录保留。</p>
  <p v-if="selected==='test'">启用测试短信后，登录页会公开显示验证码，仅供测试账号使用。</p>
  <p v-else>测试短信将不可用；如需手机号登录，请在接口配置中开通阿里云真实短信。模拟支付和测试订单删除功能将关闭。</p>
  <el-form label-position="top" @submit.prevent="save"><el-form-item label="当前管理员密码" required><el-input v-model="password" type="password" show-password autocomplete="current-password" :disabled="saving" placeholder="验证当前管理员身份"/></el-form-item><el-alert v-if="dialogError" :title="dialogError" type="error" :closable="false" show-icon/></el-form>
  <template #footer><el-button :disabled="saving" @click="dialog=false">取消</el-button><el-button type="primary" :loading="saving" @click="save">确认切换</el-button></template>
 </el-dialog>
</template>
<style scoped>
.mode-settings{padding:24px;margin:8px 0 24px;border:1px solid var(--admin-border);border-radius:12px;background:var(--el-bg-color)}header,footer{display:flex;align-items:center;justify-content:space-between;gap:16px}h2,.mode-option strong{display:flex;align-items:center;gap:8px}h2{margin:0;font-size:17px}header p,.mode-note,footer span{font-size:13px;line-height:1.8;color:var(--el-text-color-regular)}header p{margin:8px 0 0}.mode-options{display:flex;flex-wrap:wrap;gap:16px;margin:22px 0 4px;width:100%}.mode-options :deep(.el-radio){height:auto;min-height:84px;flex:1;margin:0;padding:16px;white-space:normal}.mode-options :deep(.el-radio__label){white-space:normal}.mode-option{display:flex;flex-direction:column;gap:8px}.mode-option small{font-size:13px;line-height:1.6;color:var(--el-text-color-regular)}footer{margin-top:18px;padding-top:18px;border-top:1px solid var(--admin-border)}ul{padding-left:18px;line-height:1.8}footer .el-button{flex-shrink:0}@media(max-width:700px){header,footer{align-items:flex-start;flex-direction:column}.mode-options{flex-direction:column;align-items:stretch}.mode-settings{padding:18px}}
</style>
