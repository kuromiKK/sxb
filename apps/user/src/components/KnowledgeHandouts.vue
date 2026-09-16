<script setup lang="ts">
import { ref } from 'vue'
import uniIcons from '@dcloudio/uni-ui/lib/uni-icons/uni-icons.vue'
import { api, token } from '@/services/api'
import VerificationGate from './VerificationGate.vue'
import {verifiedDownload,openDownload} from '@/utils/verified-download'
const verification=ref<InstanceType<typeof VerificationGate>>()
defineProps<{items:Array<{assetId:string;title:string;locked:boolean;fileType:string;sizeBytes:number}>}>()
const busy=ref(''),error=ref('')
const openLibrary=()=>uni.navigateTo({url:'/pages/profile-center/index?mode=handouts'})
const size=(bytes:number)=>bytes?bytes>=1048576?`${(bytes/1048576).toFixed(1)} MB`:`${Math.ceil(bytes/1024)} KB`:''
async function download(item:any){
  if(busy.value)return
  error.value=''
  if(item.locked){uni.showModal({title:'当前考试会员专属',content:'下载讲义需要对应考试的会员权限。',confirmText:token()?'查看权益':'去登录',success:r=>{if(r.confirm)uni.navigateTo({url:token()?'/pages/profile-center/index?mode=rights':`/pages/login/index?redirect=${encodeURIComponent(location.hash.slice(1))}`})}});return}
  busy.value=item.assetId
  try{
    const result=await verifiedDownload(verification.value!,`/study-handouts/${encodeURIComponent(item.assetId)}/download`)
    openDownload(result.url)
    uni.showToast({title:'已发起下载，可在我的讲义中查看',icon:'none'})
  }catch(e:any){error.value=e.message}finally{busy.value=''}
}
</script>
<template>
  <VerificationGate ref="verification"/>
  <view v-if="items.length" class="knowledge-handouts">
    <view class="handout-heading"><text>配套讲义</text><button @tap="openLibrary">我的讲义<uni-icons type="right" size="14" color="#3569e8" /></button></view>
    <view v-for="item in items" :key="item.assetId" class="handout-row">
      <view class="handout-icon"><uni-icons type="paperclip" size="24" color="#3569e8" /></view>
      <view class="handout-copy"><text class="handout-title">{{ item.title }}</text><text class="handout-meta">{{ [item.fileType,size(item.sizeBytes),item.locked?'会员专属':'下载后收入我的讲义'].filter(Boolean).join(' · ') }}</text></view>
      <button class="handout-download" :disabled="Boolean(busy)" :aria-label="'下载讲义：'+item.title" @tap="download(item)">{{ busy===item.assetId?'获取中…':'下载讲义' }}</button>
    </view>
    <text v-if="error" class="handout-error" role="alert">{{ error }}</text>
  </view>
</template>
<style scoped>
.knowledge-handouts{padding:18px 16px;margin:16px 0;background:#fff;border:1px solid #e0e6f0;border-radius:10px}.handout-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px}.handout-heading>text{font-size:18px;font-weight:700;color:#22354e}.handout-heading button{display:flex;align-items:center;min-height:44px;margin:0;padding:0 4px;background:none;color:#3569e8;font-size:14px}.handout-heading button::after,.handout-download::after{display:none}.handout-row{display:flex;align-items:center;flex-wrap:wrap;gap:12px;padding:14px 0;border-top:1px solid #edf0f5}.handout-icon{flex:none;display:grid;place-items:center;width:40px;height:44px;background:#edf3ff;border-radius:6px}.handout-copy{flex:1;min-width:120px}.handout-title{display:block;overflow-wrap:anywhere;font-size:16px;font-weight:600;line-height:1.6;color:#263953}.handout-meta{display:block;font-size:13px;line-height:1.6;margin-top:4px;color:#65748b}.handout-download{flex:none;min-height:44px;margin:0 0 0 auto;padding:0 12px;border-radius:6px;background:#edf3ff;color:#3569e8;font-size:14px;line-height:44px;font-weight:600;transition:background .15s}.handout-download:active{background:#dfe9fd}.handout-download[disabled]{color:#8793a3;background:#f0f2f6}.handout-heading button:focus-visible,.handout-download:focus-visible{outline:2px solid #3569e8;outline-offset:2px}.handout-error{display:block;font-size:14px;line-height:1.6;color:#b42318}@media(prefers-reduced-motion:reduce){.handout-download{transition:none}}
</style>
