<script setup lang="ts">
import {computed,reactive,ref} from 'vue'
import {ElMessage} from 'element-plus'
import {Save,Settings2,Play,ShieldCheck} from 'lucide-vue-next'
import {agentPages,pageAgentUiSchema,agentAppearanceSchema} from '../../shared/workspace-tools'
import {send} from './api'
import AgentAppearancePreview from './AgentAppearancePreview.vue'
const props=defineProps<{row:any}>(),emit=defineEmits<{saved:[]}>()
const form=reactive(pageAgentUiSchema.parse(props.row.config)),busy=ref(false),error=ref('')
const dirty=computed(()=>JSON.stringify(form)!==JSON.stringify(pageAgentUiSchema.parse(props.row.config)))
async function save(){const parsed=pageAgentUiSchema.safeParse(form);if(!parsed.success){error.value=parsed.error.issues.map(i=>i.message).join('；');return}busy.value=true;error.value='';try{await send('/admin/integrations/page-agent',{revision:props.row.revision,config:parsed.data},'PUT');window.dispatchEvent(new Event('sxb-agent-settings'));emit('saved');ElMessage.success('AI员工配置已保存')}catch(e:any){error.value=e.message}finally{busy.value=false}}
function preview(){window.dispatchEvent(new CustomEvent('sxb-agent-open',{detail:{navigate:form.allowedPages[0]}}))}
function configureService(){location.hash='ai'}
</script>
<template>
 <div class="agent-settings-layout">
  <el-form label-position="top" class="tool-form" :disabled="busy">
   <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon/>
   <div class="tool-section"><div><h3>连接与身份</h3><p>让 AI 在当前后台页面中执行任务</p></div><el-switch v-model="form.enabled" aria-label="启用 Page Agent" active-text="启用"/></div>
   <el-form-item label="员工名称" required><el-input v-model="form.name" maxlength="20" show-word-limit/></el-form-item>
   <div class="tool-section"><div><h3>外观与主题</h3><p>修改后实时预览，保存后应用于工作面板</p></div><el-button text @click="form.appearance=agentAppearanceSchema.parse({})">恢复默认外观</el-button></div>
   <el-form-item label="主题模式"><el-radio-group v-model="form.appearance.theme" aria-label="AI员工主题模式"><el-radio-button value="auto">跟随系统</el-radio-button><el-radio-button value="light">浅色</el-radio-button><el-radio-button value="dark">深色</el-radio-button></el-radio-group></el-form-item>
   <el-form-item label="主色"><div class="agent-color-control"><el-color-picker v-model="form.appearance.primaryColor" :predefine="['#315bea','#7c3aed','#089181','#dc6b24','#cf467c']" aria-label="选择AI员工主色"/><el-input v-model="form.appearance.primaryColor" aria-label="AI员工主色" maxlength="7" placeholder="#315bea"/></div></el-form-item>
   <div class="tool-two"><el-form-item label="浅色面板背景"><div class="agent-color-control"><el-color-picker v-model="form.appearance.backgroundLight" aria-label="选择浅色面板背景"/><el-input v-model="form.appearance.backgroundLight" aria-label="浅色面板背景" maxlength="7"/></div></el-form-item><el-form-item label="深色面板背景"><div class="agent-color-control"><el-color-picker v-model="form.appearance.backgroundDark" aria-label="选择深色面板背景"/><el-input v-model="form.appearance.backgroundDark" aria-label="深色面板背景" maxlength="7"/></div></el-form-item></div>
   <p class="tool-help">跟随系统使用设备的深浅色偏好。文字和按钮文字自动适配背景；入口位置暂保持顶部。</p>
   <div class="agent-service-link"><div><strong>服务与模型</strong><p class="tool-help">前往 AI配置与数据 → AI员工，统一配置服务商、API Key、模型和用量限制。</p></div><el-button @click="configureService"><Settings2 :size="16"/>配置服务与模型</el-button></div>
   <div class="tool-section"><div><h3>执行规则</h3><p>中文交流，沿用管理员当前登录身份</p></div></div>
   <el-form-item label="每个任务最多执行步数"><el-input-number v-model="form.maxSteps" :min="3" :max="60"/></el-form-item>
   <el-form-item label="操作前确认"><el-switch v-model="form.confirmActions" aria-label="操作前确认"/><span class="tool-help">开启后，点击、填写与选择操作逐步确认；可随时停止任务。</span></el-form-item>
   <el-form-item label="允许操作的页面" required><el-checkbox-group v-model="form.allowedPages" class="agent-page-options"><el-checkbox v-for="p in agentPages" :key="p.id" :value="p.id">{{p.name}}</el-checkbox></el-checkbox-group></el-form-item>
   <el-form-item label="业务与工作说明"><el-input v-model="form.instructions" type="textarea" :rows="6" maxlength="6000" show-word-limit/><span class="tool-help">可补充内容规范、考试层级及工作要求。</span></el-form-item>
   <div class="tool-save"><el-button type="primary" :loading="busy" :disabled="!dirty" @click="save"><Save :size="16"/>保存配置</el-button><el-tag v-if="dirty" type="warning" effect="plain">有未保存修改</el-tag></div>
  </el-form>
  <aside class="tool-preview agent-intro">
   <AgentAppearancePreview :appearance="form.appearance" :name="form.name"/>
   <p class="tool-help">预览不需要 API Key，也不会产生模型用量。</p>
   <div class="agent-capability"><ShieldCheck :size="18"/><span>当前页面操作 · 中文界面 · 过程可见</span></div>
   <el-button type="primary" plain :disabled="dirty||busy||!row.config.enabled" @click="preview"><Play :size="16"/>打开员工试用</el-button>
   <p class="tool-help">前往已开放的后台页面后开始任务。网页关闭后任务停止；此入口用于后台操作，不执行服务器代码。</p>
  </aside>
 </div>
</template>
<style scoped>
.agent-service-link{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;border:1px solid var(--admin-border);background:var(--el-fill-color-light);padding:18px;border-radius:10px;margin-bottom:24px}.agent-service-link .tool-help{margin-bottom:0}
.agent-color-control{display:flex;align-items:center;gap:10px;width:100%}.agent-color-control .el-input{min-width:0;max-width:150px}.agent-color-control .el-color-picker{flex-shrink:0}
.agent-settings-layout{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:24px;align-items:start}.agent-emblem{display:grid;place-items:center;width:64px;height:64px;border-radius:18px;background:var(--el-color-primary-light-9);color:var(--el-color-primary);margin-bottom:18px}.agent-intro>h3{font-size:20px;margin:0 0 8px}.agent-intro>p{color:var(--el-text-color-regular);line-height:1.8;font-size:14px}.agent-example{padding:18px;background:var(--el-fill-color-light);border-radius:10px;font-size:14px;line-height:1.8;margin:22px 0}.agent-capability{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--el-text-color-regular);margin-bottom:24px}.agent-page-options{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));width:100%}.agent-intro>.el-button{width:100%;margin-left:0}.agent-intro{position:sticky;top:20px}@media(max-width:1150px){.agent-settings-layout{grid-template-columns:1fr}.agent-intro{position:static}}
</style>
