<script setup lang="ts">
import {computed,ref,onUnmounted} from 'vue'
import {onLoad} from '@dcloudio/uni-app'
import KnowledgeReading from '@/components/KnowledgeReading.vue'
import StudyContent from '@/components/StudyContent.vue'
const data=ref<any>(),error=ref(''),busy=ref(true),previewToken=ref(''),courseId=ref('')
const selectedCourse=computed(()=>data.value?.courses.find((c:any)=>c.id===courseId.value))
const path=computed(()=>data.value?.path.map((p:any)=>p.kind==='subject'?p.title:p.no?`第${p.no}${p.kind==='chapter'?'章':'节'}`:p.title)||[])
let expiry:ReturnType<typeof setTimeout>|undefined
async function load(){
 busy.value=true;error.value='';data.value=undefined;clearTimeout(expiry)
 try{
  if(!previewToken.value)throw new Error('缺少预览授权，请从后台打开预览')
  // Deliberately separate from the student API helper: never attach or mutate a student session.
  const result:any=await new Promise((resolve,reject)=>uni.request({url:`${import.meta.env.VITE_API_BASE||'/api'}/content-preview/${encodeURIComponent(previewToken.value)}`,method:'GET',success:r=>r.statusCode===200?resolve(r.data):reject(new Error((r.data as any)?.message||'预览加载失败')),fail:()=>reject(new Error('无法连接预览服务，请重试'))}))
  const remaining=Date.parse(result.expiresAt)-Date.now();if(remaining<=0)throw new Error('预览已过期，请在后台刷新预览')
  data.value=result
  expiry=setTimeout(()=>{data.value=undefined;error.value='预览已过期，请在后台刷新预览'},remaining)
 }catch(e:any){error.value=e.message}finally{busy.value=false}
}
onLoad(options=>{previewToken.value=String(options?.token||'');void load()})
onUnmounted(()=>clearTimeout(expiry))
</script>
<template>
 <view class="preview-page">
  <view class="preview-banner">内容预览 · 不记录学习数据</view>
  <view v-if="busy" class="preview-state">正在加载已保存内容…</view>
  <view v-else-if="error" class="preview-state" role="alert"><text>{{error}}</text><button @tap="load">重新加载</button></view>
  <template v-else-if="data">
   <view class="preview-top"><button v-if="selectedCourse" @tap="courseId=''">返回正文</button><text>{{selectedCourse?(data.node.kind==='section'?'精品课':'配套课'):data.node.kind==='section'?'节内容':'知识点详情'}}</text><text class="saved-state">{{data.node.status==='published'?'已发布':'未发布'}}</text></view>
   <template v-if="!selectedCourse">
    <KnowledgeReading :title="data.node.title" :path="path" :stars="data.node.kind==='knowledge'?data.node.stars:undefined" :question-total="data.questionCount" :blocks="data.node.blocks" :heading="data.node.kind==='section'?'节正文':'知识点内容'" preview/>
    <view v-if="data.courses.length" class="preview-courses"><text class="section-heading">{{data.node.kind==='section'?'本节精品课':'知识点配套课'}}</text><button v-for="course in data.courses" :key="course.id" class="course-link" @tap="courseId=course.id"><text>{{course.title}}</text><text class="course-meta">{{({article:'图文',video:'视频',audio:'音频'} as any)[course.type]}} · {{course.handouts.length?'含讲义':'暂无讲义'}}　›</text></button></view>
   </template>
   <view v-else class="preview-course">
    <h1>{{selectedCourse.title}}</h1><text class="course-intro">{{selectedCourse.intro}}</text>
    <video v-if="selectedCourse.type==='video'&&selectedCourse.mediaUrl" :key="selectedCourse.id" :src="selectedCourse.mediaUrl" :poster="selectedCourse.posterUrl" controls/>
    <audio v-else-if="selectedCourse.type==='audio'&&selectedCourse.mediaUrl" :key="selectedCourse.id" :src="selectedCourse.mediaUrl" :name="selectedCourse.title" controls/>
    <StudyContent v-if="selectedCourse.type==='article'" :blocks="selectedCourse.blocks" preview/>
    <text v-else-if="!selectedCourse.mediaUrl" class="course-intro">暂未添加媒体文件</text>
    <view class="handout-section"><text class="section-heading">配套讲义</text><StudyContent v-if="selectedCourse.handouts.length" :blocks="selectedCourse.handouts" preview/><text v-else class="course-intro">暂无配套讲义</text></view>
   </view>
   <view class="preview-foot">{{data.examName}} · 仅展示已保存内容</view>
  </template>
 </view>
</template>
<style scoped>
.preview-page{max-width:430px;min-height:100vh;margin:auto;padding:0 20px 28px;background:#f5f7fb;box-sizing:border-box;overflow-wrap:anywhere}.preview-banner{margin:0 -20px;padding:10px 16px;text-align:center;background:#eef3ff;color:#3559a6;font-size:12px;line-height:1.6}.preview-top{display:flex;gap:12px;align-items:center;justify-content:space-between;margin:20px 0;color:#243650;font-weight:700;font-size:16px}.saved-state{font-size:12px;color:#62758a;font-weight:400}.preview-top button{margin:0;padding:6px 10px;font-size:13px;color:#3569e8;background:#eaf0ff;line-height:1.8}.preview-state{padding:64px 8px;text-align:center;line-height:1.8;color:#52647c}.preview-state button{font-size:14px;margin-top:20px}.preview-courses,.preview-course{padding:18px;margin-top:16px;border:1px solid #e0e6f0;border-radius:12px;background:#fff}.section-heading{display:block;font-size:16px;font-weight:700;color:#22354e}.course-link{display:flex;flex-direction:column;gap:8px;margin:12px 0 0;padding:14px;text-align:left;background:#f4f2ff;line-height:1.6;font-size:15px;color:#514590;white-space:normal}.course-link:after{border:0}.course-meta{font-size:12px;color:#6b6488}.preview-course h1{font-size:21px;line-height:1.5;margin:0 0 12px}.course-intro{display:block;color:#607087;font-size:14px;line-height:1.8;margin:12px 0;white-space:pre-wrap}.preview-course video{width:100%;height:200px}.preview-course audio{width:100%}.handout-section{margin-top:24px;padding-top:18px;border-top:1px solid #e0e6f0}.preview-foot{margin-top:24px;color:#6c7c91;text-align:center;font-size:12px;line-height:1.8}
</style>
