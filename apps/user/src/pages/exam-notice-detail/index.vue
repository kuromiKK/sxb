<script setup lang="ts">
import { ref } from 'vue'
import { onLoad,onShow } from '@dcloudio/uni-app'
import uniIcons from '@dcloudio/uni-ui/lib/uni-icons/uni-icons.vue'
import { api,selectedExamId } from '@/services/api'
import { backOrFallback } from '@/utils/navigation'
const article=ref<any>(null),busy=ref(false),error=ref(''),termId=ref('')
let revision=0
onLoad(options=>{termId.value=String(options?.termId||'')})
onShow(()=>void load())
async function load(){const current=++revision;busy.value=true;error.value='';article.value=null;try{const data=await api('/exam-guide/'+encodeURIComponent(selectedExamId())+(termId.value?'?termId='+encodeURIComponent(termId.value):''));if(current===revision)article.value=data}catch(e:any){if(current===revision)error.value=e.message}finally{if(current===revision)busy.value=false}}
const back=()=>backOrFallback('/pages/index/index')
const date=(v:string)=>new Date(v).toLocaleDateString('zh-CN')
</script>
<template>
 <view class="exam-guide-page safe-top">
  <view class="guide-header"><button aria-label="返回" @tap="back"><uni-icons type="back" size="22" color="#26384d"/></button><text>了解考试</text></view>
  <view v-if="busy" class="guide-state" role="status">正在加载…</view>
  <view v-else-if="error" class="guide-state" role="alert"><text>{{error}}</text><button @tap="load">重新加载</button></view>
  <template v-else-if="article">
   <view class="guide-heading"><text v-if="article.term" class="term-label">{{article.term.year}} 年考期</text><h1>{{article.examName}}</h1><text v-if="article.hasGuide&&article.updatedAt" class="guide-updated">更新于 {{date(article.updatedAt)}}</text></view>
   <rich-text v-if="article.hasGuide" class="guide-prose" :nodes="article.html"/>
   <view v-else class="guide-state"><uni-icons type="info" size="32" color="#8795a8"/><text class="empty-title">了解考试暂未更新</text><text class="empty-hint">{{article.term?'本考期的图文内容准备中，请稍后查看。':'考试考期待配置，请稍后查看。'}}</text></view>
  </template>
 </view>
</template>
<style scoped>
.exam-guide-page{box-sizing:border-box;max-width:640px;min-height:100vh;margin:auto;padding:16px 20px 48px;background:#fff;color:#26384d}.guide-header{display:flex;align-items:center;gap:12px;padding-bottom:24px;font-size:18px;font-weight:600}.guide-header button{display:grid;place-items:center;width:44px;height:44px;margin:0;padding:0;background:#f4f6fa;border-radius:10px}.guide-header button::after{display:none}.guide-heading{padding:8px 0 24px;margin-bottom:24px;border-bottom:1px solid #e6ebf2}.term-label{display:inline-block;padding:5px 10px;background:#edf3ff;color:#345fcc;border-radius:6px;font-size:13px}.guide-heading h1{font-size:24px;line-height:1.5;margin:14px 0 10px;overflow-wrap:anywhere}.guide-updated{font-size:13px;color:#68778b}.guide-prose{display:block;font-size:16px;line-height:1.85;overflow-wrap:anywhere}.guide-prose :deep(img){max-width:100%;height:auto}.guide-prose :deep(p){margin:12px 0}.guide-prose :deep(h2){font-size:20px;line-height:1.5;margin:24px 0 12px}.guide-prose :deep(table){max-width:100%;table-layout:fixed}.guide-state{display:flex;flex-direction:column;align-items:center;gap:12px;padding:48px 8px;text-align:center;line-height:1.8;color:#64748b;font-size:15px}.empty-title{font-size:17px;color:#334155}.empty-hint{font-size:14px}.guide-state button{font-size:16px;min-height:44px;padding:0 24px;background:#edf3ff;color:#345fcc;border-radius:8px}.guide-header button:focus-visible,.guide-state button:focus-visible{outline:2px solid #3569e8;outline-offset:2px}
</style>
