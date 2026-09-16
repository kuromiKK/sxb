<script setup lang="ts">
import {ref,onBeforeUnmount} from 'vue'
import {RefreshCw,ExternalLink,Smartphone} from 'lucide-vue-next'
import {send} from './api'
const visible=ref(false),busy=ref(false),error=ref(''),url=ref(''),title=ref(''),expiresAt=ref(''),width=ref(390)
let contentId='',revision=0,expiry:ReturnType<typeof setTimeout>|undefined
async function refresh(){
 const rev=++revision;clearTimeout(expiry);url.value='';error.value='';busy.value=true
 try{
  const result=await send('/admin/content-preview/'+encodeURIComponent(contentId),{})
  if(rev!==revision||!visible.value)return
  const origin=new URL(import.meta.env.VITE_USER_ORIGIN||result.userOrigin)
  if(!['http:','https:'].includes(origin.protocol))throw new Error('用户端地址配置无效')
  title.value=result.title;expiresAt.value=new Date(result.expiresAt).toLocaleTimeString('zh-CN',{hour12:false})
  url.value=origin.origin+'/#/pages/content-preview/index?token='+encodeURIComponent(result.token)
  expiry=setTimeout(()=>{url.value='';error.value='预览已过期，点击刷新预览可重新打开'},Math.max(0,Date.parse(result.expiresAt)-Date.now()))
 }catch(e:any){if(rev===revision)error.value=e.message}finally{if(rev===revision)busy.value=false}
}
function open(row:{id:string;title:string}){contentId=row.id;title.value=row.title;width.value=390;visible.value=true;void refresh()}
function close(){revision++;clearTimeout(expiry);url.value='';busy.value=false}
onBeforeUnmount(close)
defineExpose({open})
</script>
<template>
 <el-drawer v-model="visible" title="内容预览" size="min(920px, 98vw)" class="content-preview-drawer" append-to-body :close-on-click-modal="false" destroy-on-close @close="close">
  <div class="preview-workspace">
   <div class="preview-heading"><div><h2>{{title}}</h2><p>已保存内容 · 不读取会员权益，不产生学习记录</p></div><el-tag type="info" effect="plain"><Smartphone :size="14"/>手机预览</el-tag></div>
   <div class="preview-toolbar"><el-radio-group v-model="width" size="small" aria-label="预览宽度"><el-radio-button :value="375">375</el-radio-button><el-radio-button :value="390">390</el-radio-button><el-radio-button :value="430">430</el-radio-button></el-radio-group><span class="preview-expiry" v-if="url">链接有效至 {{expiresAt}}</span><el-button :loading="busy" @click="refresh"><RefreshCw :size="15"/>刷新预览</el-button><a v-if="url" :href="url" target="_blank" rel="noopener noreferrer" class="preview-open"><ExternalLink :size="15"/>新窗口</a></div>
   <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon/>
   <div v-loading="busy" class="preview-stage"><div v-if="url" class="preview-device" :style="{width:width+'px'}"><iframe :src="url" title="用户端内容预览" referrerpolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-downloads allow-popups" allow="fullscreen"/></div><el-empty v-else-if="!busy" description="点击刷新预览，查看已保存内容"/></div>
  </div>
 </el-drawer>
</template>
<style scoped>
.preview-workspace{display:flex;flex-direction:column;min-height:100%;gap:18px}.preview-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.preview-heading h2{margin:0;font-size:19px;line-height:1.6;overflow-wrap:anywhere}.preview-heading p{color:var(--el-text-color-secondary);font-size:13px;line-height:1.6;margin:6px 0 0}.preview-heading :deep(.el-tag__content){display:flex;align-items:center;gap:5px;white-space:nowrap}.preview-toolbar{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.preview-expiry{font-size:12px;color:var(--el-text-color-secondary);margin-right:auto}.preview-open{display:flex;align-items:center;gap:6px;color:var(--el-color-primary);font-size:13px;text-decoration:none}.preview-open:focus-visible{outline:2px solid var(--el-color-primary);outline-offset:4px}.preview-stage{display:flex;justify-content:center;align-items:flex-start;flex:1;min-height:400px;padding:24px 12px;background:var(--el-fill-color-light);border:1px solid var(--admin-border);border-radius:12px}.preview-device{max-width:100%;height:clamp(480px,calc(100vh - 280px),880px);border:1px solid #c9d2df;border-radius:20px;overflow:hidden;box-shadow:0 12px 36px rgba(31,47,72,.12);background:#fff}.preview-device iframe{display:block;width:100%;height:100%;border:0}@media(max-width:600px){.preview-stage{padding:8px 0;border:0;background:transparent}.preview-device{border-radius:10px}.preview-heading{flex-direction:column}.preview-expiry{width:100%;order:2}}
</style>
