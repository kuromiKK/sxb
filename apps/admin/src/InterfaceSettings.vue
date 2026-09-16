<script setup lang="ts">
import {computed,onMounted,reactive,ref} from 'vue'
import {ElMessage} from 'element-plus'
import {ShieldCheck,MessageSquare,Save,ArrowLeft,Check,CreditCard,ScanLine,Sparkles,Wallet} from 'lucide-vue-next'
import ProviderSettings from './ProviderSettings.vue'
import PageAgentSettings from './PageAgentSettings.vue'
import GraphSettings from './GraphSettings.vue'
import {Bot,Network} from 'lucide-vue-next'
import './styles/workspace-tools.css'
import IntegrationTest from './IntegrationTest.vue'
import type {ProviderKey} from '../../shared/provider-settings'
import CaptchaPreview from './CaptchaPreview.vue'
import {captchaVariants,captchaColors,captchaVariant} from '../../shared/captcha'
import {request,send} from './api'
const selected=ref(''),loading=ref(false),saving=ref(false),error=ref(''),rows=reactive<Record<string,any>>({}),form=reactive<Record<string,any>>({})
const accessKeyId=ref(''),accessKeySecret=ref(''),clearCredentials=ref(false),logs=ref<any[]>([])
const options=[{key:'sms',title:'短信',description:'阿里云短信 · 登录验证码',icon:MessageSquare},{key:'captcha',title:'验证码',description:'GoCaptcha · 拼图、旋转与点选验证',icon:ShieldCheck},{key:'wechat',title:'微信登录',description:'网站扫码 · 微信内授权 · 小程序登录',icon:ScanLine},{key:'payment',title:'微信支付',description:'Native · H5 · JSAPI · 小程序',icon:CreditCard},{key:'alipay',title:'支付宝支付',description:'电脑网站 · 手机网站 · RSA2',icon:Wallet},{key:'ai',title:'AI 配置',description:'模型连接、功能权限与调用用量',icon:Sparkles}]
const providerSelected=computed(()=>['wechat','payment','alipay'].includes(selected.value))
options.splice(options.length-1,0,{key:'page-agent',title:'AI员工',description:'AI员工 · 配置Page Agent',icon:Bot},{key:'g6',title:'G6 图谱',description:'知识图谱与思维导图 · 颜色与样式',icon:Network})
function status(key:string){if(key==='g6')return '本地渲染';if(key==='ai')return '统一管理';if(key==='captcha')return rows.captcha?.config.mode==='gocaptcha'?'GoCaptcha':'前端生成';if(key==='sms')return rows.sms?.config.mode==='aliyun'?'阿里云':rows.sms?.config.mode==='disabled'?'已关闭':'本地测试';return rows[key]?.config.enabled?'已启用':'未启用'}
const current=computed(()=>options.find(x=>x.key===selected.value))
const dirty=computed(()=>selected.value&&rows[selected.value]&&(JSON.stringify(form[selected.value])!==JSON.stringify(rows[selected.value].config)||Boolean(accessKeyId.value||accessKeySecret.value||clearCredentials.value)))
async function load(){loading.value=true;try{for(const r of await request('/admin/integrations')){rows[r.key]=r;form[r.key]=JSON.parse(JSON.stringify(r.config))}error.value=''}catch(e:any){error.value=e.message}finally{loading.value=false}}
async function open(key:string){if(key==='ai'){location.hash='ai';return}selected.value=key;error.value='';if(key==='sms')try{logs.value=await request('/admin/integrations/sms/logs')}catch(e:any){error.value=e.message}}
async function save(){saving.value=true;error.value='';try{const body:any={revision:rows[selected.value].revision,config:form[selected.value]};if(selected.value==='sms')Object.assign(body,{...(accessKeyId.value?{accessKeyId:accessKeyId.value}:{}),...(accessKeySecret.value?{accessKeySecret:accessKeySecret.value}:{}),clearCredentials:clearCredentials.value});await send('/admin/integrations/'+selected.value,body,'PUT');accessKeyId.value='';accessKeySecret.value='';clearCredentials.value=false;await load();ElMessage.success('配置已保存并生效')}catch(e:any){error.value=e.message}finally{saving.value=false}}
function selectVariant(id:string){if(captchaVariants.some(v=>v.title===form.captcha.title))form.captcha.title=captchaVariant(id).title;form.captcha.variant=id}
onMounted(load)
</script>
<template>
 <section class="interfaces" v-loading="loading">
  <el-alert v-if="error" :title="error" type="error" show-icon :closable="false"/>
  <div v-if="!selected" class="interface-grid">
   <article v-for="item in options" :key="item.key" class="interface-card"><div class="interface-card-top"><component :is="item.icon" :size="22" aria-hidden="true"/><h2>{{item.title}}</h2><el-tag :type="['已启用','GoCaptcha','阿里云'].includes(status(item.key))?'success':'info'" effect="plain">{{status(item.key)}}</el-tag></div><p>{{item.description}}</p><el-button @click="open(item.key)">{{item.key==='ai'?'进入 AI 配置与数据':'配置'+item.title}}</el-button></article>
  </div>
  <template v-else-if="form[selected]">
   <div class="interface-heading"><el-button text @click="selected=''" :disabled="saving"><ArrowLeft :size="16"/>全部接口</el-button><h2>{{current?.title}}配置</h2><el-tag v-if="dirty" type="warning">未保存</el-tag></div>
   <ProviderSettings v-if="providerSelected" :key="selected+rows[selected].revision" :provider="selected as ProviderKey" :row="rows[selected]" @saved="load"/>
   <PageAgentSettings v-else-if="selected==='page-agent'" :key="rows[selected].revision" :row="rows[selected]" @saved="load"/>
   <GraphSettings v-else-if="selected==='g6'" :key="rows[selected].revision" :row="rows[selected]" @saved="load"/>
   <div v-else class="interface-layout">
    <el-form label-position="top" class="interface-form" :disabled="saving">
     <template v-if="selected==='captcha'">
      <el-form-item label="验证服务"><el-radio-group v-model="form.captcha.mode"><el-radio-button value="gocaptcha">GoCaptcha</el-radio-button><el-radio-button value="frontend">前端生成</el-radio-button></el-radio-group></el-form-item>
      <p class="interface-help">GoCaptcha 由服务端核验；前端生成只作简单操作确认，不能用于真实短信防刷。</p>
      <el-form-item label="使用场景"><el-checkbox v-model="form.captcha.sms">发送登录短信前</el-checkbox><el-checkbox v-model="form.captcha.handouts">讲义下载前</el-checkbox></el-form-item>
      <template v-if="form.captcha.mode==='gocaptcha'">
       <el-form-item label="验证方式"><div class="captcha-choices" role="group" aria-label="验证方式"><button v-for="v in captchaVariants" :key="v.id" type="button" class="captcha-choice" :class="{'is-selected':form.captcha.variant===v.id}" :aria-pressed="form.captcha.variant===v.id" :disabled="saving" @click="selectVariant(v.id)"><span>{{v.label}}<Check v-if="form.captcha.variant===v.id" :size="16" aria-hidden="true"/></span><small>{{v.hint}}</small></button></div></el-form-item>
       <el-form-item label="面板主题"><el-radio-group v-model="form.captcha.appearance"><el-radio-button value="light">浅色</el-radio-button><el-radio-button value="dark">深色</el-radio-button></el-radio-group></el-form-item>
       <el-form-item label="主题配色"><div class="captcha-colors" role="group" aria-label="主题配色"><button v-for="c in captchaColors" :key="c.value" type="button" :aria-pressed="form.captcha.color===c.value" :class="{'is-selected':form.captcha.color===c.value}" :disabled="saving" @click="form.captcha.color=c.value"><i :style="{background:c.value}" aria-hidden="true"/>{{c.label}}<Check v-if="form.captcha.color===c.value" :size="14" aria-hidden="true"/></button></div></el-form-item>
       <div class="interface-two"><el-form-item label="自定义颜色"><div class="captcha-custom-color"><el-color-picker v-model="form.captcha.color" :predefine="captchaColors.map(c=>c.value)"/><code>{{form.captcha.color||'请选择颜色'}}</code></div></el-form-item><el-form-item label="验证有效期（秒）" required><el-input-number v-model="form.captcha.expiresSeconds" :min="60" :max="300" :step="30"/></el-form-item></div>
       <el-form-item label="提示文字" required><el-input v-model="form.captcha.title" maxlength="35" show-word-limit/><span class="interface-help">切换验证方式时自动更新默认提示，也可自行修改。</span></el-form-item>
      </template>
      <p class="interface-help">验证成功凭据两分钟有效、仅可使用一次，并绑定当前手机号或讲义。服务故障时提示重试。</p>
     </template>
     <template v-else>
      <el-form-item label="发送模式"><el-radio-group v-model="form.sms.mode"><el-radio-button value="disabled">关闭</el-radio-button><el-radio-button value="test">本地测试</el-radio-button><el-radio-button value="aliyun">阿里云真实短信</el-radio-button></el-radio-group></el-form-item>
      <p class="interface-help">真实模式会产生阿里云短信费用，需已审核签名和验证码模板，并开启短信场景的 GoCaptcha。本地测试不发短信，生产环境禁止使用。</p>
      <el-form-item label="AccessKey ID"><el-input v-model="accessKeyId" type="password" show-password autocomplete="new-password" :placeholder="rows.sms.hasCredentials?'凭据已保存；不填写则保留':'请输入 RAM 用户 AccessKey ID'"/></el-form-item>
      <el-form-item label="AccessKey Secret"><el-input v-model="accessKeySecret" type="password" show-password autocomplete="new-password" placeholder="更换时同时填写 ID 和 Secret"/><p class="interface-help">凭据加密保存，不回显、不发送给学生端。RAM 用户需具有 dysms:SendSms 权限。</p></el-form-item>
      <el-checkbox v-if="rows.sms.hasCredentials" v-model="clearCredentials">清除已保存凭据</el-checkbox>
      <div class="interface-two"><el-form-item label="短信签名"><el-input v-model="form.sms.signName" maxlength="50" placeholder="阿里云审核通过的签名"/></el-form-item><el-form-item label="模板编号"><el-input v-model="form.sms.templateCode" maxlength="60" placeholder="SMS_…"/></el-form-item></div>
      <div class="interface-two"><el-form-item label="验证码变量名" required><el-input v-model="form.sms.codeVariable" placeholder="code"/></el-form-item><el-form-item label="验证码位数"><el-select v-model="form.sms.codeLength"><el-option :value="4" label="4位数字"/><el-option :value="6" label="6位数字"/></el-select></el-form-item></div>
      <div class="interface-two"><el-form-item label="有效期（秒）"><el-input-number v-model="form.sms.expiresSeconds" :min="300" :max="600" :step="60"/></el-form-item><el-form-item label="重新发送间隔（秒）"><el-input-number v-model="form.sms.intervalSeconds" :min="60" :max="300" :step="30"/></el-form-item><el-form-item label="每个手机号每日上限"><el-input-number v-model="form.sms.dailyLimit" :min="1" :max="30"/></el-form-item></div>
     </template>
     <div class="interface-save"><el-button type="primary" :loading="saving" :disabled="!dirty" @click="save"><Save :size="16"/>保存配置</el-button><span>保存后生效</span></div>
    </el-form>
    <aside class="interface-preview">
     <IntegrationTest :provider="selected" :revision="rows[selected].revision" :dirty="Boolean(dirty)" :disabled="saving"/>
     <CaptchaPreview v-if="selected==='captcha'" :config="form.captcha"/>
     <template v-else><h3>短信参数预览</h3><p class="sms-preview">【{{form.sms.signName||'短信签名'}}】验证码：{{'8'.repeat(form.sms.codeLength)}}</p><p class="interface-help">{{form.sms.codeVariable}} = {{'8'.repeat(form.sms.codeLength)}}<br/>{{form.sms.expiresSeconds/60}} 分钟有效 · {{form.sms.intervalSeconds}} 秒后可重发</p><p class="interface-help">实际短信文案由阿里云审核通过的模板决定。这里不会发送测试短信。</p><h3 class="delivery-heading">最近发送记录</h3><div v-if="!logs.length" class="interface-help">暂无发送记录</div><div v-for="log in logs" :key="log.id" class="delivery"><span>{{log.phone}}</span><el-tag size="small" :type="log.status==='failed'?'danger':'info'">{{({accepted:'已受理',failed:'发送失败',test:'本地测试',sending:'处理中'} as any)[log.status]}}</el-tag><small>{{new Date(log.created_at).toLocaleString()}} · {{log.provider_code||'—'}}</small></div><p class="interface-help">“已受理”表示阿里云接受请求，不代表手机已收到短信。</p></template>
    </aside>
   </div>
  </template>
 </section>
</template>
<style scoped>
.captcha-choices{display:grid;grid-template-columns:1fr 1fr;gap:12px;width:100%}.captcha-choice{font:inherit;text-align:left;padding:14px;border:1px solid var(--admin-border);border-radius:8px;background:var(--el-bg-color);color:var(--el-text-color-primary);cursor:pointer;min-height:78px}.captcha-choice>span{display:flex;justify-content:space-between;align-items:center;gap:8px;font-weight:600;font-size:14px}.captcha-choice small{display:block;color:var(--el-text-color-regular);font-size:12px;margin-top:5px;line-height:1.5}.captcha-choice.is-selected,.captcha-colors button.is-selected{border-color:var(--el-color-primary);background:var(--el-color-primary-light-9);color:var(--el-color-primary)}.captcha-choice:hover,.captcha-colors button:hover{border-color:var(--el-color-primary)}.captcha-choice:focus-visible,.captcha-colors button:focus-visible{outline:2px solid var(--el-color-primary);outline-offset:3px}.captcha-colors{display:flex;gap:10px;flex-wrap:wrap}.captcha-colors button{font:inherit;display:flex;align-items:center;gap:8px;min-height:40px;padding:8px 12px;border:1px solid var(--admin-border);border-radius:7px;background:var(--el-bg-color);color:var(--el-text-color-primary);cursor:pointer;font-size:13px}.captcha-colors i{width:16px;height:16px;border-radius:50%;border:1px solid #00000015}.captcha-custom-color{display:flex;gap:12px;align-items:center}.captcha-custom-color code{color:var(--el-text-color-regular);font-size:13px}@media(max-width:640px){.captcha-choices{grid-template-columns:1fr}}
.interface-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px;padding:12px 0}.interface-card,.interface-form,.interface-preview{border:1px solid var(--admin-border);background:var(--el-bg-color);border-radius:12px;padding:24px;min-width:0}.interface-card-top{display:flex;align-items:center;gap:12px}.interface-card-top>svg{color:var(--el-color-primary)}.interface-card h2,.interface-heading h2{font-size:17px;margin:0}.interface-card .el-tag{margin-left:auto}.interface-card p{color:var(--el-text-color-regular);font-size:14px;margin:18px 0}.interface-heading{display:flex;gap:16px;align-items:center;margin:12px 0 24px}.interface-layout{display:grid;grid-template-columns:minmax(0,1fr) 380px;gap:24px;align-items:start}.interface-preview{position:sticky;top:18px}.interface-preview h3{font-size:16px;margin:0 0 12px}.interface-help{font-size:13px;line-height:1.8;color:var(--el-text-color-regular);margin:8px 0 20px}.interface-form :deep(.el-form-item__label){font-weight:600}.interface-form :deep(.el-form-item){margin-bottom:24px}.interface-two{display:grid;grid-template-columns:1fr 1fr;gap:0 20px}.interface-two .el-input-number{width:100%}.interface-save{display:flex;gap:16px;align-items:center;border-top:1px solid var(--admin-border);padding-top:22px}.interface-save span{font-size:13px;color:var(--el-text-color-secondary)}.captcha-preview{min-height:260px;margin:18px 0;display:flex;justify-content:center}.interface-preview>.el-button{width:100%;margin-top:16px}.interface-preview>.el-alert{margin-top:12px}.sms-preview,.local-preview>strong{display:block;padding:20px;background:var(--el-fill-color-light);border-radius:8px;font-size:16px;line-height:1.8;overflow-wrap:anywhere}.local-preview>strong{text-align:center;letter-spacing:6px;font-size:26px;margin:20px 0}.delivery-heading{margin-top:32px!important}.delivery{display:flex;gap:10px;justify-content:space-between;flex-wrap:wrap;padding:12px 0;border-bottom:1px solid var(--admin-border);font-size:13px}.delivery small{width:100%;color:var(--el-text-color-secondary)}@media(max-width:1150px){.interface-layout{grid-template-columns:1fr}.interface-preview{position:static;max-width:430px}}@media(max-width:640px){.interface-grid,.interface-two{grid-template-columns:1fr}.interface-card,.interface-form,.interface-preview{padding:16px}}
</style>
