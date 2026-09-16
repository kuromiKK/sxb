<script setup lang="ts">
import { ref, watch } from 'vue'
import uniIcons from '@dcloudio/uni-ui/lib/uni-icons/uni-icons.vue'
import { api, token } from '@/services/api'
import VerificationGate from './VerificationGate.vue'
import {verifiedDownload,openDownload} from '@/utils/verified-download'
const verification=ref<InstanceType<typeof VerificationGate>>()
const props=defineProps<{blocks:any[];preview?:boolean}>()
const urls=ref<Record<string,string>>({}),busy=ref(''),errors=ref<Record<string,string>>({})
watch(()=>props.blocks,()=>{urls.value={};errors.value={}})
function membership(){const redirect=location.hash.slice(1)||'/pages/knowledge/index';uni.navigateTo({url:token()?'/pages/profile-center/index?mode=rights':`/pages/login/index?redirect=${encodeURIComponent(redirect)}`})}
async function open(block:any){
  if(props.preview){
    if(!block.url?.startsWith('/api/content-preview/')){errors.value[block.assetId]='该资源暂时无法预览';return}
    if(block.kind==='handout'){
      // #ifdef H5
      const a=document.createElement('a');a.href=block.url;a.target='_blank';a.rel='noreferrer';a.click()
      // #endif
    }else urls.value[block.assetId]=block.url
    return
  }
  if(block.locked){uni.showModal({title:'当前考试会员专属',content:'音视频和讲义需具备对应考试的会员权限。',confirmText:token()?'查看权益':'去登录',success:r=>{if(r.confirm)membership()}});return}
  busy.value=block.assetId;delete errors.value[block.assetId]
  try{if(block.kind==='handout'){const data=await verifiedDownload(verification.value!,`/media/${block.assetId}/ticket`);openDownload(data.url)}else{const data=await api(`/media/${block.assetId}/ticket`,'POST',{});urls.value[block.assetId]=data.url}}catch(e:any){errors.value[block.assetId]=e.message}finally{busy.value=''}
}
</script>
<template><view class="study-content">
  <VerificationGate ref="verification"/>
  <view v-for="(block,index) in blocks" :key="`${index}-${block.assetId||'text'}`" class="content-block">
    <rich-text v-if="block.kind==='text'" class="study-prose" :nodes="block.html" />
    <image v-else-if="block.kind==='image'&&block.url" class="study-image" :src="block.url" mode="widthFix" :alt="block.title" @error="errors[block.assetId]='图片加载失败，请重新打开页面'" />
    <template v-else>
      <video v-if="block.kind==='video'&&urls[block.assetId]" class="study-video" :src="urls[block.assetId]" :poster="block.poster" controls :autoplay="true" @error="delete urls[block.assetId];errors[block.assetId]='播放失败，请重试'" />
      <audio v-else-if="block.kind==='audio'&&urls[block.assetId]" class="study-audio" :src="urls[block.assetId]" controls autoplay @error="delete urls[block.assetId];errors[block.assetId]='播放失败，请重试'" />
      <button v-else class="resource-button" :class="{ 'video-cover':block.kind==='video',locked:block.locked }" :disabled="busy===block.assetId" @tap="open(block)">
        <image v-if="block.poster" class="resource-poster" :src="block.poster" mode="aspectFill" :alt="block.title" />
        <view class="resource-label"><uni-icons :type="block.locked?'locked':block.kind==='handout'?'download':'videocam'" size="24" color="#3569e8" /><view><text class="resource-name">{{ block.title }}</text><text class="resource-meta">{{ busy===block.assetId?'正在加载…':block.locked?'当前考试会员专属':block.kind==='handout'?'下载讲义':'点击播放' }}</text></view></view>
      </button>
    </template>
    <text v-if="errors[block.assetId]" class="resource-error" role="alert">{{ errors[block.assetId] }}</text>
  </view>
</view></template>
<style scoped>
.study-content{font-size:16px;line-height:1.85;color:#34445b;overflow-wrap:anywhere;letter-spacing:0}.content-block{margin:16px 0}.study-prose{font-size:16px;line-height:1.85}.study-prose :deep(p){margin:8px 0;white-space:pre-wrap}.study-prose :deep(h1),.study-prose :deep(h2){font-size:20px;line-height:1.5;margin:20px 0 12px;color:#22354e}.study-prose :deep(h3){font-size:18px;line-height:1.5}.study-prose :deep(ul),.study-prose :deep(ol){padding-left:24px}.study-prose :deep(blockquote){border-left:3px solid #b4c8e9;padding-left:12px;color:#52647e}.study-image{display:block;width:100%;border-radius:4px}.study-video{width:100%;aspect-ratio:16/9;height:auto;background:#121721}.study-audio{display:block;width:100%}.resource-button{width:100%;min-height:72px;margin:0;padding:16px;border:1px solid #d9e4f4;border-radius:6px;background:#f4f8ff;text-align:left;overflow:hidden;position:relative}.resource-button::after{display:none}.resource-button:active{background:#e9f0fc}.resource-button:focus-visible{outline:2px solid #3569e8;outline-offset:2px}.video-cover{min-height:175px;display:flex;align-items:flex-end}.resource-poster{position:absolute;inset:0;width:100%;height:100%}.resource-label{position:relative;display:flex;align-items:center;gap:12px;max-width:100%;background:rgba(255,255,255,.94);padding:8px;border-radius:4px}.resource-label>view{min-width:0}.resource-name{display:block;font-size:16px;line-height:1.5;font-weight:600;color:#263b5a;overflow-wrap:anywhere;white-space:normal}.resource-meta{display:block;margin-top:4px;font-size:14px;line-height:1.5;color:#536782}.resource-error{display:block;color:#b42318;font-size:14px;margin-top:8px}
</style>
