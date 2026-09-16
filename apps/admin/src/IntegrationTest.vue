<script setup lang="ts">
import {ref,watch} from 'vue'
import {PlugZap,CheckCircle2,AlertTriangle,XCircle} from 'lucide-vue-next'
import {send} from './api'
const props=defineProps<{provider:string;revision:number;dirty?:boolean;disabled?:boolean}>()
const busy=ref(false),result=ref<any>(),error=ref('')
let generation=0
watch(()=>[props.provider,props.revision,props.dirty],()=>{generation++;result.value=undefined;error.value=''})
const labels:Record<string,string>={success:'测试通过',warning:'部分验证 / 待确认',error:'测试未通过'}
const scope:Record<string,string>={captcha:'此测试验证验证码生成接口；请再通过预览完成一次交互，确认答案核验。',sms:'查询测试不发送短信，实际送达仍需发送登录验证码验证。',wechat:'接口鉴权通过后，仍需在对应设备完成一次真实登录与回调验证。',payment:'此测试不创建交易；API v3 通知解密、回调及各支付渠道仍需实际验证。',alipay:'此测试不创建交易；通知回调及电脑、手机支付仍需实际验证。'}
async function test(){if(busy.value||props.dirty||props.disabled)return;const current=++generation;busy.value=true;result.value=undefined;error.value='';try{const r=await send('/admin/integrations/'+props.provider+'/test',{revision:props.revision});if(current===generation)result.value=r}catch(e:any){if(current===generation)error.value=e.message}finally{busy.value=false}}
</script>
<template>
 <section class="connection-test" :aria-busy="busy" aria-label="接口连接测试">
  <div class="test-heading"><h3>接口连接</h3><span v-if="!result&&!busy">未测试</span></div>
  <p>{{dirty?'配置有未保存修改，请先保存再测试。':'使用已保存配置发起接口请求，不发送短信、不创建支付。'}}</p>
  <el-button :loading="busy" :disabled="dirty||disabled" @click="test"><PlugZap v-if="!busy" :size="16" aria-hidden="true"/>{{busy?'正在测试连接…':'测试连接'}}</el-button>
  <div class="test-results" aria-live="polite" aria-atomic="true">
   <el-alert v-if="error" :title="error" type="error" show-icon :closable="false"/>
   <template v-if="result"><strong :class="result.status">{{labels[result.status]}}</strong><ul><li v-for="(item,i) in result.checks" :key="i"><component :is="item.status==='success'?CheckCircle2:item.status==='warning'?AlertTriangle:XCircle" :class="item.status" :size="16" aria-hidden="true"/><div><b>{{item.name}}</b><p>{{item.message}}</p></div></li></ul><small>{{new Date(result.testedAt).toLocaleString()}} · {{result.durationMs}} ms · 配置版本 {{result.revision}}</small><p class="test-scope">{{scope[provider]}}</p></template>
  </div>
 </section>
</template>
<style scoped>
.connection-test{margin-bottom:24px;padding-bottom:22px;border-bottom:1px solid var(--admin-border)}.test-heading{display:flex;align-items:center;justify-content:space-between;gap:12px}.test-heading h3{margin:0;font-size:16px}.test-heading span{font-size:12px;color:var(--el-text-color-secondary)}.connection-test p{font-size:13px;line-height:1.8;color:var(--el-text-color-regular);margin:10px 0 14px}.connection-test>.el-button{width:100%;margin:0}.test-results>strong{display:block;margin-top:18px;font-size:14px}.test-results ul{list-style:none;margin:12px 0;padding:0}.test-results li{display:flex;align-items:flex-start;gap:8px;margin:14px 0}.test-results li>svg{flex:none;margin-top:3px}.test-results b{font-size:13px}.test-results li p{margin:4px 0;font-size:12px;overflow-wrap:anywhere}.success{color:var(--el-color-success)}.warning{color:var(--el-color-warning)}.error{color:var(--el-color-danger)}.test-results small{font-size:12px;color:var(--el-text-color-secondary);line-height:1.7}.test-results .test-scope{font-size:12px;margin-bottom:0}
</style>
