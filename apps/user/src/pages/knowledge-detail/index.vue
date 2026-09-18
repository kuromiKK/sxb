<script setup lang="ts">
import { computed, ref, watch, nextTick, getCurrentInstance, onMounted, onBeforeUnmount } from 'vue'
import { onLoad, onShow, onHide, onUnload } from '@dcloudio/uni-app'
import uniIcons from '@dcloudio/uni-ui/lib/uni-icons/uni-icons.vue'
import StudyContent from '@/components/StudyContent.vue'
import KnowledgeHandouts from '@/components/KnowledgeHandouts.vue'
import KnowledgeCourse from '@/components/KnowledgeCourse.vue'
import ReadingSheet from '@/components/ui/ReadingSheet.vue'
import CircleAction from '@/components/ui/CircleAction.vue'
import ReadingExcerpt from '@/components/ui/ReadingExcerpt.vue'
import { backOrFallback, openPage, openLogin } from '@/utils/navigation'
import { knowledgeSubjects, courseCatalog, type KnowledgeSubject, type CourseLesson } from '@/mock/data'
import { api, token, selectedExamId, refreshPersonalData, showApiError } from '@/services/api'
import { refreshCatalog } from '@/services/catalog'
import { learningReady } from '@/utils/learning-bootstrap'
import { getFavoriteIds, setFavorite } from '@/utils/favorites'
import { getNoteBySource, saveNoteRecord, removeNotes } from '@/utils/notes'
import { createLearningVisit } from '@/utils/learning-visit'

const pointId=ref(''),subjects=ref<KnowledgeSubject[]>([]),courses=ref<CourseLesson[]>([])
const busy=ref(true),error=ref(''),content=ref<any>(),visible=ref(true)
const favorite=ref(false),favoriteBusy=ref(false),note=ref(''),draft=ref(''),saving=ref(false),noteError=ref(''),personalError=ref('')
const sheet=ref<'notes'|'directory'|'premium'|''>('')
type CourseInfo={id:string;ready:boolean;title?:string;downloadPath?:string;handouts?:Array<{assetId:string;title:string}>}
const courseInfo=ref<Record<string,CourseInfo>>({}),bodyRevision=ref(0)
const excerpt=ref<InstanceType<typeof ReadingExcerpt>>()
function courseLoaded(info:CourseInfo){courseInfo.value[info.id]=info;bodyRevision.value++}
const allPoints=computed(()=>subjects.value.flatMap(subject=>subject.chapters.flatMap(chapter=>chapter.sections.flatMap(section=>section.points.map(point=>({point,subject,chapter,section}))))))
const record=computed(()=>allPoints.value.find(r=>r.point.id===pointId.value))
const currentIndex=computed(()=>allPoints.value.findIndex(r=>r.point.id===pointId.value))
const previous=computed(()=>allPoints.value[currentIndex.value-1])
const next=computed(()=>allPoints.value[currentIndex.value+1])
const supporting=computed<Array<{id:string;title:string;type:string}>>(()=>content.value?.supportingCourses||courses.value.filter(c=>c.knowledgePointId===pointId.value))
const mediaCourses=computed(()=>supporting.value.filter(c=>c.type!=='article'))
const courseTypeLabels=computed(()=>[...new Set(supporting.value.map(c=>({article:'图文课',video:'视频课',audio:'音频课'}[c.type])).filter(Boolean))])
const bodyCourses=computed(()=>supporting.value.filter(c=>(content.value?.bodyCourseIds||supporting.value.filter(c=>c.type==='article').map(c=>c.id)).includes(c.id)))
const bodyReady=computed(()=>bodyCourses.value.every(c=>courseInfo.value[c.id]?.ready))
const handouts=computed(()=>{
 const items=[...(content.value?.handouts||[]),...supporting.value.flatMap(c=>{
  const info=courseInfo.value[c.id]
  if(info?.handouts?.length)return info.handouts.map(h=>({assetId:h.assetId,title:h.title||c.title,locked:false,fileType:'课程讲义',sizeBytes:0,downloadPath:'/study-handouts/'+encodeURIComponent(h.assetId)+'/download'}))
  return info?.downloadPath?[{assetId:c.id,title:(info.title||c.title)+' · 讲义',locked:false,fileType:'课程讲义',sizeBytes:0,downloadPath:info.downloadPath}]:[]
 })]
 return items.filter((item,index)=>items.findIndex(h=>h.assetId===item.assetId)===index)
})
const premium=computed(()=>courses.value.filter(c=>!c.knowledgePointId&&c.sectionId===record.value?.section.id))
const stars=computed(()=>Math.max(0,Math.min(5,Number(record.value?.point.stars)||0)))
const readerRoot=ref<any>(),availableBodyHeight=ref<number>(),viewportHeight=ref(uni.getSystemInfoSync().windowHeight),footerHeight=ref<number>()
const pageInstance=getCurrentInstance()
let layoutObserver:ResizeObserver|undefined,layoutTimer:ReturnType<typeof setTimeout>|undefined,layoutAlive=true
function fitReadingScreen(){
 if(!layoutAlive||busy.value||!visible.value||sheet.value||layoutTimer!==undefined)return
 layoutTimer=setTimeout(async()=>{
  layoutTimer=undefined;await nextTick()
  if(!layoutAlive||busy.value||!visible.value||sheet.value)return
  let height=uni.getSystemInfoSync().windowHeight
  // #ifdef H5
  height=window.visualViewport&&window.visualViewport.scale===1?window.visualViewport.height:window.innerHeight
  // #endif
  uni.createSelectorQuery().in(pageInstance?.proxy).select('.knowledge-reader').boundingClientRect().select('.reader-body').boundingClientRect().select('.reader-paper').boundingClientRect().select('.reader-tools').boundingClientRect().exec((rects:any[])=>{
   if(!layoutAlive||busy.value||!visible.value||sheet.value||rects.some(r=>!r))return
   const [root,body,paper,footer]=rects
   viewportHeight.value=height;footerHeight.value=footer.height
   // Relative coordinates stay stable when an expanded article is scrolled.
   const bodyTop=body.top-root.top,afterBody=paper.bottom-body.bottom
   availableBodyHeight.value=Math.max(44,Math.floor(height-footer.height-bodyTop-afterBody))
  })
 },0)
}
async function observeReadingLayout(){
 await nextTick()
 if(!layoutAlive)return
 // #ifdef H5
 const root=readerRoot.value?.$el||readerRoot.value
 if(root&&typeof ResizeObserver!=='undefined'){
  layoutObserver??=new ResizeObserver(fitReadingScreen)
  layoutObserver.disconnect()
  for(const element of root.querySelectorAll('.reader-nav,.reader-hero,.reader-media-top,.reader-paper,.reader-tools'))layoutObserver.observe(element)
 }
 // #endif
 fitReadingScreen()
}
watch(()=>[busy.value,visible.value,bodyRevision.value,personalError.value,handouts.value.length,sheet.value],observeReadingLayout,{flush:'post'})
onMounted(()=>{
 uni.onWindowResize(fitReadingScreen);void observeReadingLayout()
 // #ifdef H5
 window.visualViewport?.addEventListener('resize',fitReadingScreen)
 // #endif
})
onBeforeUnmount(()=>{
 layoutAlive=false;if(layoutTimer!==undefined)clearTimeout(layoutTimer);layoutObserver?.disconnect();uni.offWindowResize(fitReadingScreen)
 // #ifdef H5
 window.visualViewport?.removeEventListener('resize',fitReadingScreen)
 // #endif
})
const currentUrl=()=>'/pages/knowledge-detail/index?id='+encodeURIComponent(pointId.value)
const back=()=>backOrFallback('/pages/knowledge/index')
const courseMeta=(c:CourseLesson)=>[c.type==='video'?'视频':c.type==='audio'?'音频':'图文',c.type!=='article'&&c.totalMinutes>0?c.totalMinutes+' 分钟':'',c.hasHandout?'含讲义':''].filter(Boolean).join(' · ')
const visit=createLearningVisit()
let revision=0,loadedExam=''
function syncPersonal(){favorite.value=Boolean(token())&&getFavoriteIds().includes(pointId.value);note.value=token()?getNoteBySource(pointId.value,'knowledge')?.content||'':''}
async function load(){
 const v=++revision;busy.value=true;error.value='';personalError.value='';courseInfo.value={}
 try{
  await learningReady
  if(v!==revision)return
  const exam=selectedExamId()
  await refreshCatalog()
  if(v!==revision||exam!==selectedExamId())return
  loadedExam=exam;subjects.value=JSON.parse(JSON.stringify(knowledgeSubjects));courses.value=[...courseCatalog]
  if(!record.value){content.value=null;return}
  const session=token(),path='/knowledge-content/'+encodeURIComponent(pointId.value)
  let data
  try{data=await api(path+(session?'/member':''))}catch(e){if(session&&!token())data=await api(path);else throw e}
  if(v!==revision||exam!==selectedExamId())return
  content.value=data
  try{await refreshPersonalData()}catch{personalError.value='收藏与笔记暂未同步，请刷新重试'}
  if(v!==revision||exam!==selectedExamId())return
  subjects.value=JSON.parse(JSON.stringify(knowledgeSubjects));syncPersonal();void visit.begin(pointId.value)
 }catch(e:any){if(v===revision)error.value=e.message}
 finally{if(v===revision)busy.value=false}
}
onLoad(options=>{pointId.value=String(options?.id||'')})
onShow(()=>{visible.value=true;void load()})
onHide(()=>{visible.value=false;sheet.value='';revision++;visit.leave()})
onUnload(()=>{revision++;visit.close()})
function signedIn(){if(loadedExam!==selectedExamId())return false;if(!token()){openLogin(currentUrl());return false}return true}
async function toggleFavorite(){
 if(favoriteBusy.value||!signedIn())return
 favoriteBusy.value=true
 try{await setFavorite(pointId.value,'knowledge',!favorite.value);favorite.value=!favorite.value;uni.showToast({title:favorite.value?'已收藏':'已取消收藏',icon:'none'})}catch(e){showApiError(e)}finally{favoriteBusy.value=false}
}
function editNote(){if(!signedIn())return;draft.value=note.value;noteError.value='';sheet.value='notes'}
function closeSheet(){
 if(saving.value)return
 if(sheet.value==='notes'&&draft.value!==note.value){uni.showModal({title:'放弃本次修改？',content:'尚未保存的笔记内容将被丢弃。',confirmText:'放弃修改',success:r=>{if(r.confirm)sheet.value=''}});return}
 sheet.value=''
}
async function saveNote(){
 if(saving.value||!signedIn())return
 if(!draft.value.trim()){noteError.value='请填写笔记内容';return}
 saving.value=true;noteError.value=''
 try{await saveNoteRecord(pointId.value,'knowledge',draft.value);note.value=draft.value.trim();sheet.value='';uni.showToast({title:'笔记已保存',icon:'none'})}catch(e:any){noteError.value=e.message}finally{saving.value=false}
}
function deleteNote(){uni.showModal({title:'删除这条笔记？',content:'删除后无法恢复。',confirmText:'删除',success:async r=>{if(!r.confirm||saving.value||!signedIn())return;const saved=getNoteBySource(pointId.value,'knowledge');if(!saved)return;saving.value=true;try{await removeNotes([saved.id]);note.value='';draft.value='';sheet.value=''}catch(e:any){noteError.value=e.message}finally{saving.value=false}}})}
function showPoint(id:string){if(id===pointId.value){sheet.value='';return}uni.redirectTo({url:'/pages/knowledge-detail/index?id='+encodeURIComponent(id)})}
function practice(){if(!record.value?.point.questionTotal)return;openPage('/pages/practice-session/index?knowledgePointId='+encodeURIComponent(pointId.value)+'&returnUrl='+encodeURIComponent(currentUrl()))}
</script>

<template>
 <view ref="readerRoot" class="knowledge-reader" :style="{'--reader-viewport-height':viewportHeight+'px',...(footerHeight!==undefined?{'--reader-footer-height':footerHeight+'px'}:{})}" :class="{'has-media':record&&!busy&&mediaCourses.length,'text-reader':record&&!busy&&!mediaCourses.length,'knowledge-only':!supporting.length}">
  <view class="reader-nav" :class="{'media-overlay':record&&!busy&&mediaCourses.length}">
   <CircleAction class="back-button" :tone="record&&!busy?'light':'ink'" @tap="back"/>
   <text v-if="record&&!busy&&!mediaCourses.length" class="reader-nav-label">{{supporting.length?'图文课程':'知识点'}}</text>
   <view class="reader-nav-actions"><CircleAction v-if="record&&!busy" class="favorite-button" :icon="favorite?'heart-filled':'heart'" :label="favorite?'取消收藏':'收藏知识点'" :disabled="favoriteBusy" :active="favorite" tone="light" @tap="toggleFavorite"/><CircleAction class="share-placeholder" icon="redo" label="分享（暂未开放）" :tone="record&&!busy?'light':'ink'" disabled/></view>
  </view>
  <view v-if="busy" class="reader-state" role="status"><view class="skeleton-title"/><text>正在准备学习内容…</text></view>
  <view v-else-if="error" class="reader-state" role="alert"><text>{{error}}</text><button @tap="load">重新加载</button></view>
  <template v-else-if="record">
   <view v-if="visible&&mediaCourses.length" class="reader-media-top">
    <view v-for="course in mediaCourses" :key="course.id" class="reader-media">
     <KnowledgeCourse :course-id="course.id" :title="course.title" :media-type="course.type" hide-handout @loaded="courseLoaded"/>
    </view>
   </view>
   <view class="reader-hero">
    <view class="reader-info-row"><view class="reader-path"><text>{{record.subject.shortTitle||record.subject.name}}</text><text>第{{record.chapter.no}}章 · 第{{record.section.no}}节</text></view><KnowledgeHandouts v-if="handouts.length&&mediaCourses.length" compact :items="handouts"/></view>
    <text class="reader-title" role="heading" aria-level="1">{{record.point.title}}</text>
    <view class="reader-meta"><view class="reader-stars" role="img" :aria-label="stars+'星知识点'"><uni-icons v-for="n in 5" :key="n" type="star-filled" size="14" :color="n<=stars?(mediaCourses.length?'#b48a49':'#e7c68d'):(mediaCourses.length?'#cdd8e6':'#6a7789')"/></view><text v-for="label in courseTypeLabels" :key="label" class="course-tag">{{label}}</text><text>共 {{record.point.questionTotal}} 题</text></view>
    <view v-if="handouts.length&&!mediaCourses.length" class="text-handout"><KnowledgeHandouts compact :items="handouts"/></view>
   </view>
   <view class="reader-paper">
    <view v-if="visible" class="reader-body"><ReadingExcerpt ref="excerpt" :key="pointId" :enabled="bodyReady&&Boolean(bodyCourses.length||content?.blocks?.length)" :revision="bodyRevision" :available-height="availableBodyHeight">
     <view v-if="bodyCourses.length" class="reading-section replacement-body">
      <view v-for="course in bodyCourses" :key="course.id" class="article-body"><text v-if="bodyCourses.length>1" class="article-part">{{course.title}}</text><KnowledgeCourse :course-id="course.id" :title="course.title" media-type="article" hide-handout @loaded="courseLoaded" @layout="excerpt?.measure()"/></view>
     </view>
     <view v-else class="reading-section"><StudyContent v-if="content?.blocks?.length" :blocks="content.blocks" @layout="excerpt?.measure()"/><text v-else class="empty-copy">正文暂未发布。</text></view>
    </ReadingExcerpt></view>
    <view v-if="premium.length||record.point.questionTotal" class="reading-extras"><button v-if="premium.length" class="premium-entry" @tap="premium.length===1?openPage('/pages/course-detail/index?id='+encodeURIComponent(premium[0].id)):sheet='premium'"><uni-icons type="videocam" size="17" color="#6c7e96"/><text>本节精品课{{premium.length>1?' · '+premium.length:''}}</text><uni-icons type="right" size="13" color="#9aa8b9"/></button><button v-if="record.point.questionTotal" class="practice-button" @tap="practice"><uni-icons type="compose" size="17" color="#6c7e96"/><text>练习 · {{record.point.questionTotal}} 题</text><uni-icons type="right" size="13" color="#9aa8b9"/></button></view>
    <view v-if="personalError" class="personal-error"><text>{{personalError}}</text><button @tap="load">重试</button></view>
   </view>
   <view class="reader-tools">
    <button class="previous-point footer-tool" aria-label="上一知识点" :disabled="!previous" @tap="previous&&showPoint(previous.point.id)"><uni-icons type="left" size="19" color="#536781"/><text>上一点</text></button>
    <button class="directory-button footer-tool" aria-label="本节目录" @tap="sheet='directory'"><image class="reader-tool-art" src="/static/navigation/reader-directory.svg" mode="aspectFit" aria-hidden="true"/></button>
    <button class="note-button footer-tool" aria-label="我的笔记" @tap="editNote"><image class="reader-tool-art" src="/static/navigation/reader-note.svg" mode="aspectFit" aria-hidden="true"/><view v-if="note" class="note-dot"/></button>
    <button class="next-point footer-tool" aria-label="下一知识点" :disabled="!next" @tap="next&&showPoint(next.point.id)"><text>下一点</text><uni-icons type="right" size="19" color="#536781"/></button>
   </view>
  </template>
  <view v-else class="reader-state"><text>当前考试下暂无此知识点，内容可能已下架。</text><button @tap="back">返回</button></view>
  <ReadingSheet v-if="sheet==='notes'" title="我的笔记" @close="closeSheet"><text class="sheet-context">{{record?.point.title}}</text><textarea v-model="draft" class="note-editor" maxlength="1000" :disabled="saving" aria-label="知识点笔记" placeholder="写下你的理解、易错点或记忆方法…" :adjust-position="true"/><view class="note-count"><text>{{draft.length}} / 1000</text><button v-if="note" class="delete-note" :disabled="saving" @tap="deleteNote">删除笔记</button></view><text v-if="noteError" class="note-error" role="alert">{{noteError}}</text><button class="save-note" :disabled="saving" @tap="saveNote">{{saving?'正在保存…':'保存笔记'}}</button></ReadingSheet>
  <ReadingSheet v-if="sheet==='directory'&&record" title="本节目录" @close="closeSheet"><text class="sheet-context">{{record.section.name}}</text><button v-for="(p,i) in record.section.points" :key="p.id" class="directory-point" :class="{current:p.id===pointId}" :aria-current="p.id===pointId?'page':undefined" @tap="showPoint(p.id)"><text class="directory-number">{{String(i+1).padStart(2,'0')}}</text><text>{{p.title}}</text><uni-icons v-if="p.id===pointId" type="checkmarkempty" size="18" color="#3569e8"/></button></ReadingSheet>
  <ReadingSheet v-if="sheet==='premium'" title="本节精品课" @close="closeSheet"><button v-for="course in premium" :key="course.id" class="premium-choice" @tap="openPage('/pages/course-detail/index?id='+encodeURIComponent(course.id))"><text>{{course.title}}</text><text>{{courseMeta(course)}}</text><uni-icons type="right" size="17" color="#6c7e96"/></button></ReadingSheet>
 </view>
</template>

<style scoped lang="scss">
.knowledge-reader{--reader-ink:#293d56;--reader-muted:#66788e;--reader-blue:var(--sxb-blue,#3569e8);max-width:430px;min-height:100vh;margin:auto;background:#fff;color:var(--reader-ink);padding-bottom:calc(86px + env(safe-area-inset-bottom));box-sizing:border-box;font-size:15px}
button{cursor:pointer;touch-action:manipulation;line-height:1.5}button:after{border:0}button:focus-visible{outline:2px solid var(--reader-blue);outline-offset:-2px}button:active{opacity:.75}button[disabled]{opacity:.4}
.reader-nav{position:sticky;top:0;z-index:15;display:flex;align-items:center;justify-content:space-between;min-height:66px;padding:calc(env(safe-area-inset-top) + 8px) 20px 8px;background:#eaf3fcf2;backdrop-filter:blur(12px)}.reader-nav-actions{display:flex;align-items:center;gap:12px}.share-placeholder{opacity:.6}
.reader-hero{padding:12px 24px 40px;background:radial-gradient(ellipse at 95% 0%,#d7e9fa 0,transparent 65%),linear-gradient(150deg,#edf5fd,#e9effb 70%,#f3f5fc)}.reader-path{display:flex;flex-wrap:wrap;gap:6px 12px;color:#526d8f;font-size:12px;line-height:1.8}.reader-path text:first-child{font-weight:600}.reader-title{display:block;margin:14px 0;font-size:24px;line-height:1.55;font-weight:650;letter-spacing:.3px;overflow-wrap:anywhere}.reader-meta{display:flex;flex-wrap:wrap;align-items:center;gap:15px;font-size:12px;color:#60738d}.reader-stars{display:flex;gap:1px}
.reader-paper{position:relative;margin-top:-20px;border-radius:24px 24px 0 0;padding:24px 22px 20px;background:#fff;min-height:240px}.reader-media{margin-bottom:24px}.reader-media:last-child{margin-bottom:0}.reading-section{padding:0 0 12px}.article-body+.article-body{border-top:1px solid #edf0f5;margin-top:24px;padding-top:20px}.article-part{display:block;font-size:18px;line-height:1.6;font-weight:600;margin-bottom:12px}.empty-copy{display:block;font-size:14px;line-height:1.9;color:var(--reader-muted)}.reading-extras{display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px;margin-top:28px;padding-top:12px;border-top:1px solid #edf0f5}.reading-extras button{display:flex;align-items:center;gap:7px;min-height:44px;max-width:100%;padding:0 2px;margin:0;background:transparent;border-radius:0;color:#60738a;font-size:12px;line-height:1.6}.personal-error{font-size:12px;color:#a34b36;margin-top:10px}.personal-error button{min-height:44px;font-size:13px}
.reader-tools{position:fixed;bottom:0;left:50%;transform:translateX(-50%);z-index:20;display:grid;grid-template-columns:1.15fr 1fr 1fr 1.15fr;align-items:center;width:100%;max-width:430px;box-sizing:border-box;padding:9px 16px calc(9px + env(safe-area-inset-bottom));background:#fffffffa;border-top:1px solid #e9edf3;box-shadow:0 -4px 20px #20385304}.footer-tool{position:relative;display:flex;align-items:center;justify-content:center;gap:5px;min-height:46px;width:100%;margin:0;padding:0 4px;background:none;color:#536781;font-size:12px}.directory-button,.note-button{flex-direction:column;gap:2px}.note-dot{position:absolute;top:4px;right:calc(50% - 13px);width:5px;height:5px;border-radius:50%;background:#3569e8}
.reader-state{display:flex;flex-direction:column;align-items:center;gap:18px;padding:70px 24px;color:var(--reader-muted);font-size:14px;line-height:1.8;text-align:center}.reader-state button{min-height:44px;font-size:14px;color:#3569e8;background:#edf3ff}.skeleton-title{height:20px;width:75%;background:#eaf0f8;border-radius:8px}.sheet-context{display:block;color:var(--reader-muted);font-size:13px;line-height:1.7;margin:0 0 16px;overflow-wrap:anywhere}.note-editor{box-sizing:border-box;width:100%;height:190px;padding:16px;background:#f5f7fb;border:1px solid #e5ebf4;border-radius:12px;font-size:16px;line-height:1.8;color:#293d56}.note-count{display:flex;align-items:center;justify-content:space-between;min-height:48px;font-size:12px;color:#66788e}.delete-note{margin:0;padding:0 4px;min-height:44px;background:none;font-size:13px;color:#a24637}.note-error{display:block;color:#a24637;font-size:13px;margin:8px 0}.save-note{min-height:48px;margin:6px 0 0;background:#3569e8;color:#fff;border-radius:12px;font-size:15px;line-height:48px}.directory-point{display:flex;align-items:center;gap:12px;width:100%;min-height:60px;margin:0;padding:14px 10px;text-align:left;background:#fff;color:#465970;font-size:14px;border-top:1px solid #edf0f4;border-radius:0}.directory-point>text:nth-child(2){flex:1}.directory-number{font-size:12px;color:#8290a2}.directory-point.current{background:#edf3ff;color:#3569e8;border-radius:10px}.premium-choice{position:relative;display:flex;flex-direction:column;gap:6px;width:100%;margin:0;padding:16px 28px 16px 4px;background:#fff;border-bottom:1px solid #edf0f4;border-radius:0;text-align:left;font-size:15px;color:#334a64}.premium-choice text+text{font-size:12px;color:#66788e}.premium-choice :deep(.uni-icons){position:absolute;right:0;top:24px}.reader-paper :deep(.knowledge-handouts){border:0;border-radius:10px;background:#f7f9fc;margin-top:24px;padding:12px}.reader-paper :deep(.handout-heading>text){font-size:15px}
@media(max-width:350px){.reader-paper{padding-left:18px;padding-right:18px}.reader-hero{padding-left:20px;padding-right:20px}.reader-title{font-size:22px}.reader-tools{padding-left:8px;padding-right:8px}.footer-tool{font-size:11px}}
</style>
<style scoped>
/* Reference layout: edge-to-edge media with controls on its own top scrim. */
.knowledge-reader{position:relative;min-height:var(--reader-viewport-height,100dvh);padding-bottom:var(--reader-footer-height,calc(64px + env(safe-area-inset-bottom)))}
.reader-nav{position:relative;min-height:44px;padding:calc(env(safe-area-inset-top) + 6px) 12px 6px;background:#fff;backdrop-filter:none;box-sizing:content-box}
.reader-nav.media-overlay{position:absolute;top:0;left:0;right:0;z-index:15;background:linear-gradient(180deg,rgba(10,17,29,.42),transparent);pointer-events:none}
.reader-nav-actions{gap:4px}
.reader-media-top{padding:0;background:#1c293f;border-radius:18px 18px 0 0;overflow:hidden}
.reader-media-top .reader-media{margin:0}.reader-media-top .reader-media+.reader-media{border-top:1px solid #fff2}
.reader-media-top :deep(.course-video){display:block;width:100%;height:auto;aspect-ratio:16/9;border-radius:0;object-fit:contain}
.reader-media-top :deep(.video-caption){display:none}
.reader-media-top :deep(.course-state){box-sizing:border-box;min-height:0;aspect-ratio:16/9;padding:58px 24px 20px;border:0;border-radius:0;background:linear-gradient(125deg,#283952,#475d7b);color:#f3f6fb;font-size:13px;line-height:1.7}
.reader-media-top :deep(.state-actions button){background:#ffffff1f;color:#fff;border-radius:22px;padding:0 16px}
.reader-media-top :deep(.reading-audio){box-sizing:border-box;min-height:220px;aspect-ratio:16/9;display:flex;flex-direction:column;justify-content:flex-end;padding:64px 24px 16px;border:0;border-radius:0;background:radial-gradient(ellipse at 85% 20%,#55718b,transparent 65%),linear-gradient(125deg,#263d59,#395671)}
.reader-media-top :deep(.audio-title){color:#fff;font-size:16px;line-height:1.6}
.reader-media-top :deep(.audio-eyebrow){color:#d8e6f5;font-size:12px}
.reader-media-top :deep(.audio-times){color:#e3ebf6;font-size:12px}
.reader-media-top :deep(.audio-toggle){background:#ffffff25;border:1px solid #ffffff40;box-shadow:none}
.reader-media-top :deep(.audio-wave>view){background:#c4d8ec}
.reader-media-top :deep(.audio-seek){margin-top:16px}
.reader-hero{padding:16px 22px 12px;background:#fff}
.reader-info-row{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:44px}
.reader-path{flex:1;min-width:0;flex-direction:column;gap:2px;color:#808996;font-size:12px;line-height:1.5}
.reader-path text:first-child{color:#50657f;font-size:13px;font-weight:500}
.reader-title{font-size:22px;line-height:1.5;font-weight:600;margin:14px 0 12px;color:#253345;letter-spacing:0}
.reader-meta{gap:12px;font-size:12px;color:#788494}
.course-tag{padding:3px 8px;background:#f0f4f9;color:#61758e;border-radius:5px}
.reader-paper{margin:0;padding:8px 22px 20px;border-radius:0;min-height:0}
.reading-section :deep(.content-block:first-child){margin-top:0}
.reader-paper :deep(.study-content),.reader-paper :deep(.study-prose){color:#677381;font-size:15px;line-height:1.85}
.reader-paper :deep(.excerpt-toggle){color:#61758e;font-size:12px}
.reader-paper :deep(.folded .excerpt-clip:after){height:min(60px,70%)}
.reader-tool-art{display:block;width:44px;height:44px}
.directory-button,.note-button{gap:0}
.text-reader{--header-surface:#1d2531;--header-texture:url('/static/illustrations/reader-letter-texture.svg');background:#fff}
.text-reader .reader-nav{background-color:var(--header-surface);background-image:var(--header-texture);background-size:430px 320px;background-position:center top}
.reader-nav-label{position:absolute;left:50%;transform:translateX(-50%);font-size:13px;letter-spacing:2px;color:#c3cddb;pointer-events:none}
.text-reader .reader-hero{position:relative;display:flex;flex-wrap:wrap;align-items:center;gap:0 12px;background-color:var(--header-surface);background-image:var(--header-texture);background-size:430px 320px;background-position:center calc(-56px - env(safe-area-inset-top));padding:12px 22px 42px;border:0;border-radius:0}
.text-reader .reader-info-row{width:100%;min-height:24px;gap:12px}
.text-reader .reader-path{flex-direction:row;gap:6px 12px;align-items:center;color:#b4c0d0;font-size:12px}
.text-reader .reader-path text:first-child{font-size:12px;font-weight:500;color:#c7d2e2;line-height:1.5}
.text-reader .reader-title{width:100%;margin:16px 0 18px;font-size:23px;font-weight:600;line-height:1.55;letter-spacing:.2px;color:#f7f9fc}
.text-reader .reader-meta{flex:1;gap:10px;color:#c1cad7;font-size:12px;min-height:34px}
.text-reader .course-tag{background:#ffffff12;border:1px solid #ffffff1f;color:#d1dceb}
.text-reader .text-handout{margin-left:auto}
.text-reader .reader-paper{margin-top:-22px;border-radius:24px 24px 0 0;padding-top:24px}
.reading-extras{justify-content:flex-start;gap:12px;margin-top:20px;padding-top:16px;border-top:0}
.reading-extras button{flex:none;width:auto;min-height:44px;padding:0 13px;border:1px solid #e3ebf6;border-radius:12px;background:#f0f5fd;color:#45658b;font-size:13px;font-weight:500}
.reading-extras .practice-button{background:#f0f7f5;border-color:#e2eeea;color:#477269}
.reading-extras button:active{opacity:1;background:#e3ecfa}.reading-extras .practice-button:active{background:#e2f0eb}
@media(max-width:350px){.reader-hero{padding:14px 18px 10px}.reader-paper{padding-left:18px;padding-right:18px}.reader-title{font-size:20px}.reader-media-top :deep(.reading-audio){padding-left:18px;padding-right:18px}}
@media(max-width:350px){.text-reader .reader-hero{padding:10px 18px 38px}.text-reader .reader-title{font-size:21px}.text-reader .reader-meta{gap:8px}}
</style>
