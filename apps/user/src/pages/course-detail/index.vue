<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad, onShow, onHide, onUnload } from '@dcloudio/uni-app'
import uniIcons from '@dcloudio/uni-ui/lib/uni-icons/uni-icons.vue'
import CircleAction from '@/components/ui/CircleAction.vue'
import ReadingAudio from '@/components/ReadingAudio.vue'
import ReadingSheet from '@/components/ui/ReadingSheet.vue'
import ReadingExcerpt from '@/components/ui/ReadingExcerpt.vue'
import StudyContent from '@/components/StudyContent.vue'
import ActionButton from '@/components/ui/ActionButton.vue'
import VerificationGate from '@/components/VerificationGate.vue'
import { courseCatalog, knowledgeSubjects, type CourseLesson, type KnowledgeSubject } from '@/mock/data'
import { api, token, selectedExamId, refreshPersonalData, writeRecord, showApiError } from '@/services/api'
import { refreshCatalog } from '@/services/catalog'
import { getFavoriteIds, setFavorite } from '@/utils/favorites'
import { getNoteBySource, saveNoteRecord } from '@/utils/notes'
import { verifiedDownload, openDownload } from '@/utils/verified-download'
import { backOrFallback, openPage, openLogin, currentPageUrl } from '@/utils/navigation'
import { learningReady } from '@/utils/learning-bootstrap'
import { createLearningVisit } from '@/utils/learning-visit'

type CourseDetail = Partial<CourseLesson> & { id:string; mediaUrl?:string; posterUrl?:string; blocks?:any[]; content?:string; articleSections?:Array<{title:string;paragraphs:string[]}>; handoutDownloadPath?:string }
const id=ref(''),detail=ref<CourseDetail>(),courses=ref<CourseLesson[]>([]),subjects=ref<KnowledgeSubject[]>([])
const busy=ref(true),error=ref(''),active=ref(true),personalError=ref(''),personalReady=ref(false)
const favorite=ref(false),favoriteBusy=ref(false),completed=ref(false),finishing=ref(false)
const progress=ref(0),position=ref(0),duration=ref(0),initialPosition=ref(0)
const mediaError=ref(''),downloading=ref(false),downloadError=ref('')
const resourceSheet=ref<''|'knowledge'|'directory'>(''),sheet=ref(false),note=ref(''),draft=ref(''),saving=ref(false),noteError=ref('')
const verification=ref<InstanceType<typeof VerificationGate>>()
const visit=createLearningVisit()
let revision=0,ownerExam='',ownerToken=''
const course=computed(()=>({...courses.value.find(c=>c.id===id.value),...detail.value}) as CourseDetail)
const typeName=computed(()=>({video:'视频精讲',audio:'音频精讲',article:'图文精讲'}[course.value.type||'article']))
const title=computed(()=>course.value.title||course.value.sectionName||'精讲课')
const record=computed(()=>{
 for(const subject of subjects.value)for(const chapter of subject.chapters){const section=chapter.sections.find(s=>s.id===course.value.sectionId);if(section)return {subject,chapter,section}}
})
const points=computed(()=>(record.value?.section.points||[]).filter(p=>!course.value.knowledgePointId||p.id===course.value.knowledgePointId))
const directory=computed(()=>courses.value.filter(c=>c.subjectId===course.value.subjectId&&(course.value.knowledgePointId?c.knowledgePointId===course.value.knowledgePointId:!c.knowledgePointId)).sort((a,b)=>a.chapterNo-b.chapterNo||a.sectionNo-b.sectionNo))
const currentIndex=computed(()=>directory.value.findIndex(c=>c.id===id.value))
const previous=computed(()=>directory.value[currentIndex.value-1])
const next=computed(()=>directory.value[currentIndex.value+1])
const directoryGroups=computed(()=>[...new Set(directory.value.map(c=>c.chapterId))].map(chapterId=>({id:chapterId,title:directory.value.find(c=>c.chapterId===chapterId)?.chapterName,items:directory.value.filter(c=>c.chapterId===chapterId)})))
const status=computed(()=>completed.value?'已学完':progress.value>0?'已学 '+progress.value+'%':'未开始')
const isOwner=()=>ownerExam===selectedExamId()&&ownerToken===token()
function mediaUrl(url?:string){const base=import.meta.env.VITE_API_BASE||'/api';return url?.startsWith('/api/')?base.replace(/\/$/,'')+url.slice(4):url||''}
async function load(){
 const v=++revision;busy.value=true;error.value='';personalError.value='';personalReady.value=false;mediaError.value='';downloadError.value='';detail.value=undefined
 try{
  await learningReady
  if(v!==revision)return
  if(!id.value)throw new Error('缺少课程编号，请返回课程目录重新选择')
  if(!token()){busy.value=false;error.value='登录后学习课程';openLogin('/pages/course-detail/index?id='+encodeURIComponent(id.value));return}
  ownerExam=selectedExamId();ownerToken=token()
  await refreshCatalog()
  if(v!==revision||!isOwner())return
  courses.value=courseCatalog.map(c=>({...c}));subjects.value=JSON.parse(JSON.stringify(knowledgeSubjects))
  if(!courses.value.some(c=>c.id===id.value))throw new Error('课程已下架或不属于当前考试')
  const result=await api<CourseDetail>('/courses/'+encodeURIComponent(id.value))
  if(v!==revision||!isOwner())return
  // Personal data is loaded before mounting the player, so its initial seek uses saved progress.
  const personal=await Promise.allSettled([refreshPersonalData(),api<any[]>('/records/'+ownerExam+'?kind=courseProgress')])
  if(v!==revision||!isOwner())return
  const [synced,records]=personal
  completed.value=false;progress.value=0;initialPosition.value=0;position.value=0;duration.value=0;favorite.value=false;note.value=''
  if(synced.status==='fulfilled'&&records.status==='fulfilled'){
   const saved=records.value.find(r=>r.source_id===id.value)?.payload
   completed.value=Boolean(saved?.completed);progress.value=completed.value?100:Math.max(0,Math.min(100,Number(saved?.progress)||0))
   initialPosition.value=completed.value?0:Math.max(0,Number(saved?.positionSeconds)||Number(saved?.currentMinute)*60||0)
   position.value=initialPosition.value;duration.value=Number(saved?.durationSeconds)||0
   favorite.value=getFavoriteIds().includes(id.value);note.value=getNoteBySource(id.value,'course')?.content||''
   personalReady.value=true
  }else personalError.value='学习记录暂未同步，请重试后收藏或保存笔记'
  detail.value=result;busy.value=false
  await visit.begin(id.value)
 }catch(e){if(v===revision){error.value=e instanceof Error?e.message:'课程加载失败';busy.value=false}}
}
function mediaProgress(seconds:number,total:number){
 if(!active.value||!isOwner())return
 if(Number.isFinite(seconds))position.value=Math.max(0,seconds)
 if(Number.isFinite(total)&&total>0){duration.value=total;if(!completed.value)progress.value=Math.min(100,Math.round(position.value/total*100))}
 visit.progress(seconds,total)
}
function videoProgress(e:any){mediaProgress(Number(e.detail.currentTime),Number(e.detail.duration))}
async function finish(){
 if(finishing.value||completed.value||!personalReady.value||!isOwner())return
 finishing.value=true
 try{
  await visit.flush()
  await writeRecord('courseProgress',id.value,{completed:true,progress:100,positionSeconds:Math.floor(position.value),durationSeconds:Math.ceil(duration.value),currentMinute:Math.floor(position.value/60)})
  if(!isOwner())return
  completed.value=true;progress.value=100;uni.showToast({title:'这门课已学完',icon:'success'})
 }catch(e){showApiError(e)}finally{finishing.value=false}
}
async function favoriteCourse(){
 if(favoriteBusy.value||!personalReady.value||!isOwner())return
 favoriteBusy.value=true
 try{await setFavorite(id.value,'course',!favorite.value);if(isOwner())favorite.value=!favorite.value}catch(e){showApiError(e)}finally{favoriteBusy.value=false}
}
function openNotes(){draft.value=note.value;noteError.value='';sheet.value=true}
function closeNotes(){
 if(saving.value)return
 if(draft.value!==note.value){uni.showModal({title:'笔记还没保存',content:'要放弃这次修改吗？',confirmText:'放弃修改',cancelText:'继续编辑',success:r=>{if(r.confirm)sheet.value=false}})}
 else sheet.value=false
}
async function saveNote(){
 if(saving.value||!isOwner())return
 if(!draft.value.trim()){noteError.value='请先写下笔记内容';return}
 saving.value=true;noteError.value=''
 try{await saveNoteRecord(id.value,'course',draft.value);if(!isOwner())return;note.value=draft.value.trim();draft.value=note.value;sheet.value=false;uni.showToast({title:'笔记已保存',icon:'success'})}
 catch(e){noteError.value=e instanceof Error?e.message:'保存失败，请重试'}finally{saving.value=false}
}
async function download(){
 if(downloading.value||!course.value.handoutDownloadPath||!verification.value)return
 downloading.value=true;downloadError.value=''
 try{const result=await verifiedDownload(verification.value,course.value.handoutDownloadPath);if(isOwner())openDownload(result.url)}
 catch(e:any){if(e.code!=='VERIFICATION_CANCELLED')downloadError.value=e.message||'下载失败，请重试'}finally{downloading.value=false}
}
function goCourse(target?:CourseLesson){
 if(!target||target.id===id.value)return
 resourceSheet.value=''
 visit.leave()
 uni.redirectTo({url:'/pages/course-detail/index?id='+encodeURIComponent(target.id)})
}
function activateButton(event:any){
 // #ifdef H5
 if(event.defaultPrevented||!['Enter',' '].includes(event.key)||typeof event.target?.closest!=='function')return
 const button=(event.target as HTMLElement)?.closest('uni-button')
 if(!button||button.hasAttribute('disabled')||button.getAttribute('aria-disabled')==='true')return
 event.preventDefault();(button as HTMLElement).click()
 // #endif
}
const back=()=>backOrFallback('/pages/courses/index')
const openKnowledge=(pointId:string)=>openPage('/pages/knowledge-detail/index?id='+encodeURIComponent(pointId))
function practice(){const key=course.value.knowledgePointId?'knowledgePointId':'sectionId',value=course.value.knowledgePointId||course.value.sectionId;if(value)openPage('/pages/practice-session/index?'+key+'='+encodeURIComponent(value)+'&returnUrl='+encodeURIComponent(currentPageUrl()))}
onLoad(options=>{id.value=String(options?.id||'')})
onShow(()=>{active.value=true;void load()})
onHide(()=>{resourceSheet.value='';active.value=false;revision++;visit.leave()})
onUnload(()=>{revision++;visit.close()})
</script>

<template>
 <view @keydown="activateButton" class="course-detail-page" :class="'detail-'+(course.type||'article')">
  <template v-if="busy || error">
   <view class="loading-nav"><CircleAction @tap="back"/><text>精讲课</text></view>
   <view class="detail-state" :role="error?'alert':'status'"><image src="/static/illustrations/course-studio.svg" mode="aspectFit" aria-hidden="true"/><text>{{error||'正在准备课程…'}}</text><view v-if="error" class="state-actions"><button role="button" tabindex="0" @tap="load">重新加载</button><button role="button" tabindex="0" v-if="!token()" @tap="openLogin()">去登录</button><button role="button" tabindex="0" v-else-if="error.includes('权限')||error.includes('会员')" @tap="openPage('/pages/products/index')">查看课程权益</button></view></view>
  </template>
  <template v-else-if="detail">
   <view class="lesson-stage" :class="'stage-'+course.type">
    <view class="detail-top"><CircleAction compact :tone="course.type==='video'?'light':'ink'" @tap="back"/><view class="top-actions"><CircleAction compact :tone="course.type==='video'?'light':'ink'" :icon="favorite?'heart-filled':'heart'" :label="favorite?'取消收藏':'收藏课程'" :active="favorite" :disabled="favoriteBusy||!personalReady" @tap="favoriteCourse"/><CircleAction compact :tone="course.type==='video'?'light':'ink'" icon="redo" label="分享（暂未开放）" disabled/></view></view>
    <template v-if="course.type==='video'">
     <video v-if="course.mediaUrl && !mediaError && active" id="lesson-video" class="lesson-video" :src="mediaUrl(course.mediaUrl)" :poster="mediaUrl(course.posterUrl)" :initial-time="initialPosition" :autoplay="false" controls @timeupdate="videoProgress" @pause="visit.flush()" @ended="visit.flush();finish()" @error="mediaError='视频暂时无法播放，请重新加载'"/>
     <view v-else class="media-empty"><uni-icons aria-hidden="true" type="videocam" size="32" color="#b6c9e5"/><text>{{mediaError||'视频正在准备中'}}</text><button role="button" tabindex="0" v-if="mediaError" @tap="load">重新加载</button></view>
    </template>
    <template v-else-if="course.type==='audio'">
     <ReadingAudio v-if="course.mediaUrl && !mediaError && active" :key="course.mediaUrl" class="lesson-audio" presentation="course" :poster="mediaUrl(course.posterUrl||course.coverUrl)" :src="mediaUrl(course.mediaUrl)" :title="title" label="音频精讲" :initial-position="initialPosition" @progress="mediaProgress" @pause="visit.flush()" @ended="finish" @error="mediaError='音频暂时无法播放，请重新加载'"/>
     <view v-else class="audio-empty"><text>{{mediaError||'音频正在准备中'}}</text><button role="button" tabindex="0" v-if="mediaError" @tap="load">重新加载</button></view>
    </template>
    <view v-else class="article-stage" aria-hidden="true"/>
   </view>
   <view class="lesson-paper">
    <view class="course-heading">
     <view class="lesson-location"><text class="lesson-type">{{typeName}}</text><text>{{record?.subject.shortTitle||course.subjectName}}</text><text v-if="course.chapterNo">第{{course.chapterNo}}章</text></view>
     <text class="course-title" role="heading" aria-level="1">{{title}}</text>
     <view class="lesson-meta">
      <view class="meta-copy"><text v-if="course.type!=='article' && course.totalMinutes">{{course.totalMinutes}} 分钟</text><text :class="{finished:completed}">{{status}}</text></view>
      <ActionButton v-if="course.handoutDownloadPath" class="handout-pill" :disabled="downloading" @tap="download"><uni-icons aria-hidden="true" type="download" size="15" color="#3c669f"/>{{downloading?'获取中…':'下载讲义'}}</ActionButton>
     </view>
     <text v-if="downloadError" class="inline-error" role="alert">{{downloadError}}</text>
     <ActionButton v-if="personalError" class="personal-retry" @tap="load">{{personalError}}</ActionButton>
    </view>
    <view class="lesson-content">
     <view class="content-heading"><text class="content-label">{{course.type==='article'?'课程正文':'课程简介'}}</text><ActionButton class="finish-button" :class="{finished:completed}" :disabled="completed||finishing||!personalReady" @tap="finish"><uni-icons v-if="completed" type="checkmarkempty" size="14" color="#39816f" aria-hidden="true"/>{{completed?'已学完':finishing?'保存中…':'标记学完'}}</ActionButton></view>
     <ReadingExcerpt v-if="course.intro" :key="'intro-'+id" :available-height="166" class="course-intro"><text class="intro-text">{{course.intro}}</text></ReadingExcerpt>
     <text v-else-if="course.type!=='article'" class="intro-empty">暂无课程简介</text>
    <view v-if="course.type==='article'" class="article-body">
     <StudyContent v-if="course.blocks?.length" :blocks="course.blocks"/>
     <text v-else-if="course.content" class="plain-body">{{course.content}}</text>
     <template v-else-if="course.articleSections?.length"><view v-for="(section,index) in course.articleSections" :key="index" class="legacy-section"><text class="legacy-title">{{section.title}}</text><text v-for="(paragraph,p) in section.paragraphs" :key="p" class="plain-body">{{paragraph}}</text></view></template>
     <view v-else class="section-empty">图文内容正在准备中</view>
    </view>
    </view>
    <view class="resource-tools">
     <ActionButton aria-haspopup="dialog" :aria-expanded="resourceSheet==='knowledge'" @tap="resourceSheet='knowledge'"><view class="resource-icon"><uni-icons type="map" size="19" color="#4b73aa" aria-hidden="true"/></view><text>关联知识点</text><text class="resource-count">{{points.length}}</text></ActionButton>
     <ActionButton aria-haspopup="dialog" :aria-expanded="resourceSheet==='directory'" @tap="resourceSheet='directory'"><view class="resource-icon"><uni-icons type="list" size="19" color="#457d7a" aria-hidden="true"/></view><text>课程目录</text><text class="resource-count">{{directory.length}}</text></ActionButton>
    </view>
   </view>
   <view class="lesson-toolbar"><button role="button" tabindex="0" class="note-entry" :disabled="!personalReady" @tap="openNotes"><uni-icons aria-hidden="true" type="compose" size="20" color="#45678c"/><text>{{note?'我的笔记':'记笔记'}}</text><view v-if="note" class="note-dot"/></button><button role="button" tabindex="0" class="previous-course" :disabled="!previous" @tap="goCourse(previous)"><uni-icons aria-hidden="true" type="left" size="17" :color="previous?'#45678c':'#a6b0bb'"/><text>上一课</text></button><button role="button" tabindex="0" class="next-course" @tap="next?goCourse(next):back()"><text>{{next?'下一课':'返回课程'}}</text><uni-icons aria-hidden="true" type="right" size="16" color="#fff"/></button></view>
  </template>
  <ReadingSheet v-if="resourceSheet" :title="resourceSheet==='knowledge'?'关联知识点':'课程目录'" @close="resourceSheet=''">
     <view v-if="resourceSheet==='knowledge'" class="knowledge-list">
      <view v-if="!points.length" class="section-empty">本课程暂未关联知识点</view>
      <button role="button" tabindex="0" v-for="(point,index) in points" :key="point.id" class="knowledge-row" @tap="openKnowledge(point.id)"><text class="point-index">{{String(index+1).padStart(2,'0')}}</text><view class="point-copy"><text>{{point.title}}</text><view class="point-meta"><text v-if="point.stars" class="point-stars">{{'★'.repeat(Math.max(0,Math.min(5,Math.round(point.stars))))}}</text><text>{{point.questionTotal||0}} 道题</text></view></view><uni-icons aria-hidden="true" type="right" size="15" color="#8091a8"/></button>
      <button role="button" tabindex="0" v-if="points.some(p=>p.questionTotal>0)" class="practice-entry" @tap="practice"><uni-icons aria-hidden="true" type="compose" size="17" color="#547aa4"/><text>学完练一练</text><uni-icons aria-hidden="true" type="right" size="14" color="#547aa4"/></button>
     </view>
     <view v-else class="course-directory"><view v-for="group in directoryGroups" :key="group.id" class="directory-group"><text class="directory-heading">{{group.title}}</text><button role="button" tabindex="0" v-for="item in group.items" :key="item.id" class="directory-row" :class="{current:item.id===id}" :aria-current="item.id===id?'true':undefined" @tap="goCourse(item)"><image :src="'/static/icons/course-'+item.type+'.svg'" mode="aspectFit" aria-hidden="true"/><view><text>{{item.title||item.sectionName}}</text><text class="directory-meta">{{item.typeName}}<template v-if="item.type!=='article'&&item.totalMinutes"> · {{item.totalMinutes}} 分钟</template></text></view><text v-if="item.id===id" class="current-label">当前</text><uni-icons aria-hidden="true" v-else type="right" size="14" color="#8091a8"/></button></view></view>
  </ReadingSheet>
  <ReadingSheet v-if="sheet" title="我的课程笔记" @close="closeNotes"><view class="note-context">{{title}}</view><textarea v-model="draft" class="note-editor" aria-label="课程笔记" maxlength="1200" :disabled="saving" placeholder="记下老师强调的重点，或自己的理解…"/><view class="note-count">{{draft.length}} / 1200</view><text v-if="noteError" class="inline-error" role="alert">{{noteError}}</text><button role="button" tabindex="0" class="save-note" :disabled="saving||!draft.trim()" @tap="saveNote">{{saving?'正在保存…':'保存笔记'}}</button></ReadingSheet>
  <VerificationGate ref="verification"/>
 </view>
</template>

<style scoped lang="scss">

.course-detail-page{
 --lesson-ink:var(--sxb-ink,#24364f);--lesson-muted:var(--sxb-muted,#5d6e83);--lesson-blue:var(--sxb-blue,#3569e8);
 --lesson-line:var(--sxb-ui-line,#e9edf2);--lesson-soft:#f2f6fc;
 max-width:430px;min-height:100vh;min-height:100dvh;box-sizing:border-box;margin:0 auto;
 padding-bottom:calc(86px + env(safe-area-inset-bottom,0px));background:#fff;color:var(--lesson-ink);
}
.lesson-stage{position:relative;padding-top:env(safe-area-inset-top,0px);background:#edf4ff}
.detail-top{position:absolute;top:env(safe-area-inset-top,0px);left:8px;right:8px;z-index:4;display:flex;align-items:center;justify-content:space-between;pointer-events:none}
.top-actions{display:flex;pointer-events:auto}
.stage-video .detail-top{left:0;right:0;padding:0 8px;background:linear-gradient(#0e1c3266,transparent)}
.lesson-video{display:block;width:100%;height:auto;aspect-ratio:16/9;background:#142439}
.media-empty{box-sizing:border-box;display:flex;align-items:center;justify-content:center;gap:12px;flex-direction:column;aspect-ratio:16/9;padding:48px 20px 20px;background:#172c47;color:#c4d5eb;font-size:14px}
.media-empty button{font-size:13px;color:white;background:#ffffff20;padding:0 16px;min-height:44px;border-radius:24px}
.stage-audio{padding:calc(54px + env(safe-area-inset-top,0px)) 20px 24px;background:linear-gradient(135deg,#e8f0fc,#e6f1ee)}
.lesson-audio{position:relative}
.audio-empty{padding:24px;color:var(--lesson-muted);font-size:14px}
.audio-empty button{margin-top:12px;font-size:13px;border-radius:20px;color:var(--lesson-blue)}
.stage-article{background:transparent}
.article-stage{height:50px}
.detail-article{background:#fff url('@/static/illustrations/course-reader-texture.svg') center top / 100% auto no-repeat}
.lesson-paper{position:relative;padding:20px 22px 24px}
.detail-article .lesson-paper{padding-top:12px}
.lesson-location{display:flex;align-items:center;flex-wrap:wrap;gap:8px;font-size:12px;line-height:1.6;color:var(--lesson-muted)}
.lesson-type{padding:3px 7px;border-radius:5px;font-size:11px;font-weight:600;background:#edf3fd;color:#426995}
.lesson-location>text:last-child:not(.lesson-type){padding-left:8px;border-left:1px solid #d6deea}
.course-title{display:block;margin-top:12px;font-size:23px;font-weight:700;line-height:1.5;letter-spacing:.2px;overflow-wrap:anywhere}
.lesson-meta{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:8px;min-height:44px}
.meta-copy{display:flex;align-items:center;flex-wrap:wrap;gap:10px;color:var(--lesson-muted);font-size:12px;line-height:1.7}
.meta-copy>text+text:before{content:'·';margin-right:10px;color:#9aa9b9}
.finished{color:#39816f}
.handout-pill{display:flex;align-items:center;justify-content:center;gap:5px;min-height:44px;flex:none;margin:0;padding:0 12px;background:transparent;color:#3c669f;font-size:12px;line-height:1.5;position:relative;isolation:isolate}
.handout-pill:before{content:'';position:absolute;inset:6px 0;border-radius:18px;background:#edf4ff;z-index:-1}
.lesson-content{margin-top:18px;padding-top:10px;border-top:1px solid var(--lesson-line)}
.content-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:44px;margin-bottom:6px}
.content-label{font-size:15px;line-height:1.5;font-weight:650;letter-spacing:.3px}
.finish-button{display:flex;align-items:center;justify-content:center;gap:4px;flex:none;min-height:44px;margin:0;padding:0 2px;background:transparent;color:var(--lesson-muted);font-size:12px;line-height:1.5}
.finish-button.finished[disabled]{color:#39816f;background:transparent}
.finish-button[disabled]:not(.finished){opacity:.5;background:transparent}
.intro-text,.intro-empty{display:block;white-space:pre-wrap;font-size:15px;line-height:1.95;color:#526279}
.course-intro :deep(.excerpt-toggle){font-size:12px}
.article-body{margin-top:18px;font-size:16px;line-height:1.95;overflow-wrap:anywhere}
.plain-body{display:block;white-space:pre-wrap;margin:12px 0}
.legacy-title{font-size:18px;font-weight:600}
.article-body :deep(.content-block:first-child){margin-top:0}
.resource-tools{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px;margin-top:24px}
.resource-tools button{display:flex;align-items:center;justify-content:flex-start;gap:7px;min-height:54px;width:100%;box-sizing:border-box;margin:0;padding:9px 10px;border-radius:15px;background:#f1f5fb;color:#425c7b;font-size:12px;line-height:1.5;text-align:left}
.resource-tools button+button{background:#eff6f4;color:#416865}
.resource-icon{display:flex;align-items:center;justify-content:center;flex:none}
.resource-count{margin-left:auto;font-size:12px;font-variant-numeric:tabular-nums;color:var(--lesson-muted)}
.lesson-toolbar{position:fixed;bottom:calc(10px + env(safe-area-inset-bottom,0px));left:50%;transform:translateX(-50%);width:calc(100% - 28px);max-width:402px;box-sizing:border-box;padding:6px;display:flex;align-items:center;gap:6px;background:#fffffff5;border:1px solid #e8edf4;border-radius:22px;box-shadow:0 4px 20px #2846740d;z-index:20}
.lesson-toolbar button{display:flex;align-items:center;justify-content:center;gap:5px;min-height:44px;margin:0;line-height:1.5;font-size:13px;background:transparent;color:#45678c;padding:0 8px;border-radius:17px}
.note-entry{position:relative;min-width:72px}
.note-entry>text{font-size:12px}
.note-dot{position:absolute;top:5px;right:8px;width:5px;height:5px;border-radius:50%;background:#81abdb}
.previous-course{flex:1}
.lesson-toolbar .next-course{flex:1.4;background:#416fba;color:white}
.lesson-toolbar button[disabled]{opacity:.45}
button::after{border:0}button{cursor:pointer;touch-action:manipulation}button:focus-visible{outline:2px solid var(--lesson-blue);outline-offset:2px}button:active{opacity:.75}
@media(max-width:350px){.lesson-paper{padding-left:16px;padding-right:16px}.course-title{font-size:21px}.resource-tools{gap:8px}.resource-tools button{gap:5px;padding:8px}.lesson-toolbar{gap:4px}.note-entry{min-width:64px}}
@media(prefers-reduced-motion:reduce){button{transition:none}}
.knowledge-list{padding-top:6px}.knowledge-row{display:flex;align-items:center;gap:12px;width:100%;margin:0;padding:17px 0;background:transparent;text-align:left;line-height:1.6;border-bottom:1px solid #eef2f6;border-radius:0}.point-index{align-self:flex-start;margin-top:2px;color:#8dabc8;font-size:13px;font-variant-numeric:tabular-nums}.point-copy{flex:1;min-width:0;font-size:14px;color:var(--lesson-ink)}.point-meta{display:flex;gap:12px;margin-top:7px;color:var(--lesson-muted);font-size:12px}.point-stars{color:#a68146}.practice-entry{display:flex;align-items:center;gap:8px;min-height:44px;margin:16px 0 0;padding:0 14px;border-radius:22px;background:#edf4fb;color:#547aa4;font-size:13px}.practice-entry>text{flex:1;text-align:left}
.directory-group{padding:18px 0 0}.directory-heading{display:block;font-size:12px;color:var(--lesson-muted);margin-bottom:10px}.directory-row{display:flex;align-items:center;gap:10px;width:100%;padding:12px 10px;margin:0 0 8px;border-radius:14px;background:#f7f9fc;text-align:left;line-height:1.6;color:var(--lesson-ink);font-size:14px}.directory-row>image{width:34px;height:34px;flex:none}.directory-row>view{flex:1;min-width:0}.directory-row>view>text{display:block;overflow-wrap:anywhere}.directory-meta{font-size:12px;color:var(--lesson-muted);margin-top:4px}.directory-row.current{background:#edf4ff}.current-label{font-size:11px;color:#4776b8;flex:none}
.note-context{font-size:13px;color:var(--lesson-muted);line-height:1.7;margin:0 0 14px}.note-editor{box-sizing:border-box;width:100%;height:200px;padding:15px;font-size:15px;line-height:1.8;border-radius:18px;background:#f5f8fc;color:var(--lesson-ink)}.note-count{text-align:right;margin:8px 0 16px;color:var(--lesson-muted);font-size:12px}.save-note{width:100%;min-height:48px;line-height:48px;margin:0;padding:0;border-radius:24px;background:#416fba;color:white;font-size:14px}.save-note[disabled]{opacity:.5}.inline-error{display:block;color:#a73b32;font-size:13px;line-height:1.6;margin:10px 0}.personal-retry{font-size:12px;line-height:1.7;color:#a06d2d;background:#fff7e9;border-radius:12px;padding:10px;margin:12px 0}
.loading-nav{display:flex;align-items:center;padding:env(safe-area-inset-top,0px) 10px 0;gap:8px;font-size:15px}.detail-state{display:flex;align-items:center;flex-direction:column;gap:20px;padding:50px 24px;color:var(--lesson-muted);font-size:14px;line-height:1.7;text-align:center}.detail-state>image{width:150px;height:125px}.state-actions{display:flex;flex-wrap:wrap;gap:12px;justify-content:center}.state-actions button{min-height:44px;padding:0 16px;margin:0;border-radius:22px;font-size:13px;color:#416fba;background:#e7effb}.section-empty{padding:28px 8px;color:var(--lesson-muted);font-size:13px;text-align:center}

</style>
