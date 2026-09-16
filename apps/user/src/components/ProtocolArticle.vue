<script setup lang="ts">
import {computed,onMounted} from 'vue'
import {siteSettings,refreshSiteSettings} from '@/services/site-settings'
const props=defineProps<{kind:string}>()
const protocol=computed(()=>siteSettings.protocols.find(p=>p.kind===props.kind))
onMounted(()=>{void refreshSiteSettings().catch(()=>{})})
</script>
<template><view class="protocol-article"><text v-if="siteSettings.error">{{siteSettings.error}}</text><template v-else-if="protocol"><text class="article-title">{{protocol.title}}</text><text class="article-version">版本 V{{protocol.version}} · 更新于 {{new Date(protocol.publishedAt).toLocaleDateString('zh-CN')}}</text><rich-text :nodes="protocol.html"/></template><text v-else>正在加载协议…</text></view></template>
<style scoped>.protocol-article{padding:22px 18px;background:white;border:1px solid #e0e6f0;border-radius:12px;color:#34445b;font-size:15px;line-height:1.85;overflow-wrap:anywhere}.article-title{display:block;font-size:21px;font-weight:700;color:#22354e}.article-version{display:block;margin:10px 0 22px;font-size:12px;color:#65758b}</style>
