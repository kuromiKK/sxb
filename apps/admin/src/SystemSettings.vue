<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { request, send } from './api'
const domain=ref(''),saving=ref(false)
onMounted(async()=>{domain.value=(await request('/admin/settings/site-domain')).value||''})
async function save(){saving.value=true;try{await send('/admin/settings/site-domain',{value:domain.value},'PUT');ElMessage.success('系统设置已保存')}finally{saving.value=false}}
</script>
<template><section class="settings-page"><div class="settings-card"><h2>系统设置</h2><p>配置前端访问域名，推荐码二维码会使用此域名生成注册链接。</p><el-form label-position="top"><el-form-item label="网站域名"><el-input v-model="domain" placeholder="例如：https://www.example.com"/><div class="hint">请填写完整的 HTTPS 地址，不要填写页面路径。</div></el-form-item><el-button type="primary" :loading="saving" @click="save">保存设置</el-button></el-form></div></section></template>
<style scoped>.settings-page{padding:4px 0 40px}.settings-card{max-width:720px;padding:26px;background:#fff;border:1px solid #e1e8f0;border-radius:12px}.settings-card h2{margin:0;color:#1c2d42;font-size:22px}.settings-card p{margin:8px 0 24px;color:#8190a2;font-size:13px}.hint{margin-top:8px;color:#8a99aa;font-size:12px}</style>
