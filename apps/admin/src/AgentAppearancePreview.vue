<script setup lang="ts">
import {ref} from 'vue'
import {Bot,Check,Send} from 'lucide-vue-next'
import type {AgentAppearance} from '../../shared/workspace-tools'
import {useAgentAppearance} from './utils/agent-appearance'
import './styles/agent-appearance.css'
const props=defineProps<{appearance:AgentAppearance;name:string}>()
const {style,mode}=useAgentAppearance(()=>props.appearance),confirmed=ref(false),message=ref('')
</script>
<template>
 <div class="appearance-preview-heading"><h3>外观实时预览</h3><span>{{mode==='dark'?'深色':'浅色'}} · 示例</span></div>
 <section class="agent-panel agent-themed agent-appearance-preview" :style="style" :data-theme="mode" aria-label="AI员工外观预览" data-page-agent-ignore="true">
  <header><div class="agent-panel-title"><Bot :size="24"/><div><strong>{{name||'AI员工'}}</strong><small>Page Agent · 中文工作助手</small></div></div></header>
  <div class="agent-panel-body">
   <div class="agent-progress"><span class="agent-running-dot"/>{{confirmed?'示例操作已确认':'等待你确认'}}</div>
   <ol class="agent-steps"><li><span>1</span><div><strong>填写文章内容</strong><p>已填写标题与正文，请检查后继续。</p></div></li></ol>
   <div v-if="confirmed" class="agent-answer">配色预览完成，没有修改任何业务内容。<el-button text @click="confirmed=false">再次预览确认卡片</el-button></div>
   <section v-else class="agent-confirm"><h3>确认下一步操作</h3><p>将文章保存为草稿</p><div><el-button type="primary" @click="confirmed=true"><Check :size="15"/>确认示例</el-button><el-button @click="confirmed=true">取消</el-button></div></section>
  </div>
  <footer><el-input v-model="message" type="textarea" :rows="2" placeholder="在这里交代任务…" aria-label="预览任务输入"/><div><small>仅预览，不调用模型</small><el-button type="primary" @click="message='这是一条预览任务，不会实际执行。'"><Send :size="14"/>示例任务</el-button></div></footer>
 </section>
</template>
<style scoped>
.appearance-preview-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}.appearance-preview-heading h3{font-size:16px;margin:0}.appearance-preview-heading span{font-size:12px;color:var(--muted)}
.agent-appearance-preview{position:relative;inset:auto;width:100%;max-width:none;z-index:auto;border:1px solid var(--admin-border);border-radius:14px;overflow:hidden;box-shadow:0 8px 30px #17264112;margin-bottom:16px}.agent-appearance-preview .agent-panel-body{overflow:visible;padding:18px}.agent-appearance-preview>header{padding:18px}.agent-appearance-preview>footer{padding:16px 18px}.agent-appearance-preview .agent-progress{padding-top:0}.agent-appearance-preview .agent-confirm{margin-bottom:0}.agent-appearance-preview .agent-answer .el-button{display:block;margin-top:8px}
</style>
