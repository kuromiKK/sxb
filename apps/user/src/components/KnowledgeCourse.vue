<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { onHide } from '@dcloudio/uni-app'
import uniIcons from '@dcloudio/uni-ui/lib/uni-icons/uni-icons.vue'
import StudyContent from './StudyContent.vue'
import ReadingAudio from './ReadingAudio.vue'
import VerificationGate from './VerificationGate.vue'
import { api, token, selectedExamId } from '@/services/api'
import { openLogin, currentPageUrl, openPage } from '@/utils/navigation'
import { verifiedDownload, openDownload } from '@/utils/verified-download'
import { createLearningVisit } from '@/utils/learning-visit'
const props=withDefaults(defineProps<{courseId:string;title?:string;mediaType?:string;hideHandout?:boolean;active?:boolean}>(),{title:'配套课',mediaType:'article',hideHandout:false,active:true})
const emit=defineEmits<{loaded:[value:{id:string;ready:boolean;title?:string;downloadPath?:string;handouts?:Array<{assetId:string;title:string}>}];layout:[]}>()
const content=ref<any>(),busy=ref(false),error=ref(''),downloadError=ref(''),downloading=ref(false)
const verification=ref<InstanceType<typeof VerificationGate>>()
const visit=createLearningVisit()
let revision=0
async function load(){
 const v=++revision,exam=selectedExamId(),session=token();error.value='';content.value=null
 emit('loaded',{id:props.courseId,ready:false})
 if(!session){error.value='登录后查看当前考试的课程权益';return}
 busy.value=true
 try{const result=await api('/courses/'+encodeURIComponent(props.courseId));if(v!==revision||exam!==selectedExamId()||session!==token())return;content.value=result;emit('loaded',{id:props.courseId,ready:true,title:result.title||props.title,downloadPath:result.handoutDownloadPath,handouts:result.handouts});if(props.active)void visit.begin(props.courseId)}
 catch(e:any){if(v===revision)error.value=e.message}
 finally{if(v===revision){busy.value=false;await nextTick();emit('layout')}}
}
watch(()=>props.active,active=>{if(active&&content.value)void visit.begin(props.courseId);else visit.leave()})
function progress(e:any){visit.progress(Number(e.detail.currentTime),Number(e.detail.duration))}
async function download(){if(!content.value?.handoutDownloadPath||downloading.value)return;downloading.value=true;downloadError.value='';try{openDownload((await verifiedDownload(verification.value!,content.value.handoutDownloadPath)).url)}catch(e:any){downloadError.value=e.message}finally{downloading.value=false}}
onMounted(load)
onHide(()=>{revision++;content.value=null;visit.leave()})
onBeforeUnmount(()=>{revision++;visit.close()})
</script>
<template><view class="inline-course" :class="'inline-'+mediaType"><VerificationGate ref="verification"/>
 <view v-if="busy" class="course-state" role="status">正在加载课程…</view>
 <view v-else-if="error" class="course-state" role="alert"><text>{{error}}</text><view class="state-actions"><button v-if="!token()" @tap="openLogin(currentPageUrl())">去登录</button><button v-else @tap="openPage('/pages/profile-center/index?mode=rights')">查看当前考试权益</button><button @tap="load">重新加载</button></view></view>
 <template v-else-if="content&&active">
  <view v-if="content.type==='video'&&content.mediaUrl" class="course-video-wrap"><video class="course-video" :src="content.mediaUrl" :poster="content.posterUrl" controls :autoplay="false" @timeupdate="progress" @pause="visit.flush()" @ended="visit.flush()" @error="error='视频加载失败，请重新加载'"/><text class="video-caption">{{title}}</text></view>
  <ReadingAudio v-else-if="content.type==='audio'&&content.mediaUrl" :src="content.mediaUrl" :title="content.title" @progress="visit.progress" @pause="visit.flush()" @error="error='音频加载失败，请重新加载'"/>
  <StudyContent v-else-if="content.type==='article'&&content.blocks?.length" :blocks="content.blocks" @layout="emit('layout')"/>
  <text v-else class="course-state">课程内容暂未发布</text>
  <button v-if="!hideHandout&&content.handoutDownloadPath" class="course-download" :disabled="downloading" @tap="download"><uni-icons type="download" size="16" color="#3569e8"/><text>{{downloading?'正在获取…':'下载讲义'}}</text></button><text v-if="downloadError" role="alert">{{downloadError}}</text>
 </template>
</view></template>
<style scoped>
.inline-course{margin:0}.course-video{display:block;width:100%;height:auto;aspect-ratio:16/9;background:#182538;border-radius:14px;overflow:hidden}.video-caption{display:block;margin:9px 2px 0;font-size:12px;line-height:1.6;color:#6a7c94}.course-state{display:flex;flex-direction:column;justify-content:center;min-height:110px;padding:20px;border:1px solid #e4ebf5;border-radius:14px;background:#f6f8fc;color:#62738a;font-size:14px;line-height:1.8}.inline-video .course-state{aspect-ratio:16/9;background:#eef2f8}.inline-article .course-state{min-height:160px}.state-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.state-actions button,.course-download{min-height:44px;margin:0;padding:0 12px;font-size:12px;background:#edf3ff;color:#3569e8;border-radius:8px;line-height:44px}.course-download{margin-top:14px;background:none;color:#657b96;text-align:left;padding:0;border-bottom:1px solid #edf0f5;border-radius:0}button:after{border:0}button:focus-visible{outline:2px solid #3569e8}
</style>
