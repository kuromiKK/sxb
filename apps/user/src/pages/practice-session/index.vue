<script setup lang="ts">
import PracticeCompletion from '@/components/PracticeCompletion.vue'
import ActionButton from '@/components/ui/ActionButton.vue'
import {computed,ref,onBeforeUnmount,watch} from 'vue'
import {onLoad,onShow,onHide} from '@dcloudio/uni-app'
import uniIcons from '@dcloudio/uni-ui/lib/uni-icons/uni-icons.vue'
import CircleAction from '@/components/ui/CircleAction.vue'
import ReadingSheet from '@/components/ui/ReadingSheet.vue'
import ConfiguredQuestion from '@/components/ConfiguredQuestion.vue'
import {knowledgeSubjects,practiceQuestions} from '@/mock/data'
import {useAppStore} from '@/store/app'
import {api,token,selectedExamId,refreshLearningPlan,refreshPersonalData} from '@/services/api'
import {learningReady} from '@/utils/learning-bootstrap'
import {refreshCatalog} from '@/services/catalog'
import {getWeakQuestions} from '@/utils/weak-points'
import {getFavoriteIds,setFavorite} from '@/utils/favorites'
import {getNoteBySource,saveNoteRecord} from '@/utils/notes'
import {recordToday,saveAnswered} from '@/utils/practice-plan'
import {backOrFallback,openPage,safePageUrl,currentPageUrl} from '@/utils/navigation'
import {attemptStatus,statusLabels,practiceSummary,chapterPracticeQueues,resolvePracticeChapter,chapterContinuation,chapterSessionKey,readChapterRound,type Attempt,type PracticeChapter} from '@/utils/practice-session'

const {state,exam,requireLogin}=useAppStore()
const questions=ref<any[]>([]),currentIndex=ref(0),attempts=ref<Record<string,Attempt>>({}),noteDrafts=ref<Record<string,string>>({})
const loading=ref(true),error=ref(''),storageError=ref(''),submitting=ref(false),active=ref(true),sheet=ref(''),completionData=ref(false),source=ref('章节练习'),returnUrl=ref('/pages/practice/index')
const elapsedSeconds=ref(0),favoriteIds=ref<string[]>(getFavoriteIds()),favoriteBusy=ref(false),noteText=ref(''),noteError=ref(''),noteSaving=ref(false),cardFilter=ref('all'),renderRound=ref(0)
const chapterMode=ref(false),chapterId=ref(''),chapters=ref<PracticeChapter[]>([]),completedChapters=ref<string[]>([])
const chapter=computed(()=>chapters.value.find(c=>c.id===chapterId.value))
const chapterFlow=computed(()=>chapterContinuation(chapters.value,chapterId.value,[...completedChapters.value.filter(id=>id!==chapterId.value),...(questions.value.length&&!summary.value.unanswered?[chapterId.value]:[])]))
const chapterTarget=computed(()=>chapterFlow.value.next||chapterFlow.value.unfinished)
let storageKey='',ownerToken='',ownerExam='',alive=true,routeOptions:Record<string,string>={},timer:ReturnType<typeof setInterval>|undefined,activeSince=0,totalMs=0,questionVersions:Record<string,string>={}
const valid=()=>alive&&ownerToken===token()&&ownerExam===selectedExamId()
const current=computed(()=>questions.value[currentIndex.value])
const wrongQuestion=ref(false)
function displayVerdict(id:string,wrong:boolean){if(id===current.value?.id)wrongQuestion.value=wrong}
const summary=computed(()=>practiceSummary(questions.value.map(q=>q.id),attempts.value))
const progress=computed(()=>summary.value.total?Math.round(summary.value.done/summary.value.total*100):0)
const elapsed=computed(()=>`${Math.floor(elapsedSeconds.value/60).toString().padStart(2,'0')}:${(elapsedSeconds.value%60).toString().padStart(2,'0')}`)
const isFavorite=computed(()=>favoriteIds.value.includes(current.value?.id))
const contextLine=computed(()=>{
 if(chapterMode.value&&chapter.value){
  const c=chapter.value,section=knowledgeSubjects.find(s=>s.id===c.subjectId)?.chapters.find(ch=>ch.id===c.id)?.sections.find(t=>(current.value?.linkedSectionIds||[current.value?.sectionId]).includes(t.id))
  return [c.subjectName,c.name,section?.name].filter(Boolean).join(' / ')
 }
 return [current.value?.subjectShortTitle||current.value?.subjectName,current.value?.chapterName,current.value?.sectionName].filter(Boolean).join(' / ')
})
const knowledgeLinks=computed(()=>{
 const ids:string[]=current.value?.knowledgePointIds||[current.value?.knowledgePointId]
 return [...new Set(ids)].filter(Boolean).map(id=>{for(const s of knowledgeSubjects)for(const c of s.chapters)for(const t of c.sections){const p=t.points.find(p=>p.id===id);if(p)return {id,title:p.title,path:[s.shortTitle||s.name,c.name,t.name].join(' / ')}}return {id,title:current.value.knowledgePointId===id?current.value.knowledgePointTitle||'查看知识点':'查看知识点',path:''}})
})
const cardItems=computed(()=>questions.value.map((q,index)=>({id:q.id,index,status:attemptStatus(attempts.value[q.id])})).filter(q=>cardFilter.value==='all'||(cardFilter.value==='unanswered'?['unanswered','draft'].includes(q.status):cardFilter.value==='wrong'?['wrong','partial'].includes(q.status):['pending','failed','self_review'].includes(q.status))))
function persist(){
 if(!storageKey||!valid())return
 try{uni.setStorageSync(storageKey,{version:1,updatedAt:Date.now(),ids:questions.value.map(q=>q.id),currentId:current.value?.id,attempts:attempts.value,notes:noteDrafts.value,elapsedMs:totalMs+(activeSince?Date.now()-activeSince:0),versions:questionVersions});storageError.value=''}catch{storageError.value='本机存储空间不足，未提交的草稿暂不能保存。请勿刷新页面。'}
}
function pause(){if(activeSince){totalMs+=Date.now()-activeSince;activeSince=0}if(timer)clearInterval(timer);timer=undefined;persist()}
function resume(){if(timer||loading.value||!active.value||sheet.value==='complete'||!valid())return;activeSince=Date.now();timer=setInterval(()=>{elapsedSeconds.value=Math.floor((totalMs+Date.now()-activeSince)/1000)},1000)}
function visibility(){
 // #ifdef H5
 active.value=!document.hidden;if(active.value)resume();else pause()
 // #endif
}
onShow(()=>{active.value=true;resume();favoriteIds.value=getFavoriteIds()})
onHide(()=>{active.value=false;pause()})
onBeforeUnmount(()=>{pause();alive=false;
 // #ifdef H5
 document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',pause)
 // #endif
})
watch(sheet,value=>{if(value==='complete')pause();else resume()})
watch(noteText,value=>{if(sheet.value==='note'&&current.value){noteDrafts.value[current.value.id]=value;persist()}})
onLoad(async(options?:Record<string,string>)=>{
 routeOptions=options||{}
 await load()
 if(!alive)return
 // #ifdef H5
 document.addEventListener('visibilitychange',visibility);window.addEventListener('pagehide',pause)
 // #endif
})
async function load(fresh=false){
 loading.value=true;error.value=''
 await learningReady
 if(!alive)return
 if(!requireLogin(currentPageUrl()))return
 ownerToken=token();ownerExam=exam.value.id
 const options=routeOptions,mode=options.mode||'normal'
 returnUrl.value=safePageUrl(options.returnUrl,'/pages/practice/index')
 if(mode==='recite'){uni.redirectTo({url:'/pages/recite/index'});return}
 source.value=options.knowledgePointId?'知识点练习':options.plan?'智能刷题':({weak:'薄弱项强化',wrong:'错题重练',favorite:'收藏练习'} as Record<string,string>)[mode]||'章节练习'
 try{
  const user=await api('/me');if(!valid())return
  await refreshCatalog();if(!valid())return
  chapterMode.value=mode==='normal'&&!options.plan&&!options.knowledgePointId
  chapters.value=chapterPracticeQueues(knowledgeSubjects,practiceQuestions)
  const chosen=chapterMode.value?resolvePracticeChapter(chapters.value,options):undefined
  chapterId.value=chosen?.id||''
  let list=[...practiceQuestions] as any[],planScope=''
  if(options.plan){const plan=await refreshLearningPlan();if(!valid())return;list=(plan?.questionIds||[]).map((id:string)=>practiceQuestions.find(q=>q.id===id)).filter(Boolean);const p=plan?.plan||{};planScope=JSON.stringify([p.subjectIds,p.chapterIds,p.years,p.sources])}
  else if(options.knowledgePointId)list=list.filter(q=>(q.knowledgePointIds||[q.knowledgePointId]).includes(options.knowledgePointId))
  else if(chapterMode.value)list=chosen?chosen.questionIds.map(id=>practiceQuestions.find(q=>q.id===id)).filter(Boolean):[]
  if(!options.knowledgePointId){if(mode==='weak')list=getWeakQuestions(ownerExam);if(mode==='wrong'){const ids=uni.getStorageSync('sxb-wrong-questions')||[];list=list.filter(q=>ids.includes(q.id))}if(mode==='favorite')list=list.filter(q=>favoriteIds.value.includes(q.id))}
  const scope=JSON.stringify([mode,options.plan||'',options.knowledgePointId||'',options.sectionId||'',planScope])
  const chapterKey=(id:string)=>chapterSessionKey(user.id,ownerExam,id)
  storageKey=chapterMode.value?chapterKey(chapterId.value):`sxb-practice-session-${user.id}-${ownerExam}-${scope}`
  const readRound=(c:PracticeChapter)=>readChapterRound(c,user.id,ownerExam,key=>uni.getStorageSync(key))
  const saved=fresh?undefined:chosen?readRound(chosen):uni.getStorageSync(storageKey)
  completedChapters.value=chosen?chapters.value.filter(c=>c.subjectId===chosen.subjectId&&c.questionIds.length).filter(c=>{const s=readRound(c);return s?.version===1&&c.questionIds.every(id=>s.attempts?.[id]?.result&&!s.attempts[id].history)}).map(c=>c.id):[]
  // Wrong/favorite/plan queues evolve after submissions. Freeze this round, except unpublished items.
  if(!chapterMode.value&&saved?.version===1&&saved?.ids?.length)list=saved.ids.map((id:string)=>practiceQuestions.find(q=>q.id===id)).filter(Boolean)
  questions.value=list;attempts.value={};currentIndex.value=0;totalMs=0;questionVersions=Object.fromEntries(list.map(q=>[q.id,String(q.updatedAt||JSON.stringify(q))]))
  if(saved?.version===1){for(const q of list){const a=saved.attempts?.[q.id];if(a&&!a.history&&(a.result||saved.versions?.[q.id]===questionVersions[q.id]))attempts.value[q.id]=a}noteDrafts.value=saved.notes||{};totalMs=Number(saved.elapsedMs)||0;currentIndex.value=Math.max(0,list.findIndex(q=>q.id===(options.questionId||saved.currentId)))}
  else if(options.questionId)currentIndex.value=Math.max(0,list.findIndex(q=>q.id===options.questionId))
  elapsedSeconds.value=Math.floor(totalMs/1000)
  persist()
 }catch(e:any){if(valid())error.value=e.message}finally{if(alive){loading.value=false;resume()}}
}
function change(id:string,attempt:Attempt){if(!valid())return;attempts.value[id]=attempt;persist()}
function submitted(id:string,result:any){
 if(!valid())return
 state.todayDone=Math.max(state.todayDone,recordToday(ownerExam,id).length)
 if(result.status==='graded'&&typeof result.correct==='boolean')saveAnswered(ownerExam,id,result.correct?'correct':'wrong')
 // Separate refresh errors from a successfully committed answer.
 void refreshPersonalData().catch(()=>{});void refreshLearningPlan().catch(()=>{})
}
function goTo(index:number){if(submitting.value||index<0||index>=questions.value.length)return;currentIndex.value=index;sheet.value='';error.value='';persist();uni.pageScrollTo({scrollTop:0,duration:180})}
function next(){if(submitting.value)return;if(currentIndex.value===questions.value.length-1){completionData.value=false;sheet.value='complete'}else goTo(currentIndex.value+1)}
function back(){if(submitting.value)return;pause();sheet.value='';backOrFallback(returnUrl.value)}
async function favorite(){if(!current.value||favoriteBusy.value)return;favoriteBusy.value=true;const id=current.value.id,on=!isFavorite.value;try{await setFavorite(id,'question',on);if(valid())favoriteIds.value=getFavoriteIds()}catch(e:any){error.value=e.message}finally{favoriteBusy.value=false}}
function openNote(){noteText.value=noteDrafts.value[current.value.id]??getNoteBySource(current.value.id,'question')?.content??'';noteError.value='';sheet.value='note'}
function closeSheet(){if(noteSaving.value)return;sheet.value='';persist()}
async function saveNote(){
 if(noteSaving.value)return;if(!noteText.value.trim()){noteError.value='请先填写笔记内容';return}noteSaving.value=true;noteError.value='';const id=current.value.id,value=noteText.value
 try{await saveNoteRecord(id,'question',value);if(valid()){delete noteDrafts.value[id];sheet.value='';persist();uni.showToast({title:'笔记已保存',icon:'success'})}}catch(e:any){noteError.value=e.message}finally{noteSaving.value=false}
}
function openKnowledge(id:string){persist();const url=currentPageUrl();sheet.value='';openPage(`/pages/knowledge-detail/index?id=${encodeURIComponent(id)}&returnUrl=${encodeURIComponent(url)}`)}
function continueUnanswered(){const index=questions.value.findIndex(q=>!attempts.value[q.id]?.result);if(index>=0)goTo(index)}
function continueChapter(){
 const target=chapterTarget.value
 if(submitting.value||summary.value.unanswered||!target||target.subjectId!==chapter.value?.subjectId)return
 pause();uni.redirectTo({url:`/pages/practice-session/index?subjectId=${encodeURIComponent(target.subjectId)}&chapterId=${encodeURIComponent(target.id)}&returnUrl=${encodeURIComponent(returnUrl.value)}`})
}
function finishSubject(){if(!chapterFlow.value.complete)return;pause();uni.redirectTo({url:'/pages/practice/index'})}
function restart(){uni.showModal({title:'开始新一轮练习？',content:'将按当前范围重新读取题目，已提交的历史记录和笔记仍保留。',success:r=>{if(!r.confirm)return;pause();storageKey='';attempts.value={};currentIndex.value=0;totalMs=0;elapsedSeconds.value=0;renderRound.value++;sheet.value='';void load(true)}})}
</script>

<template>
 <view class="session-page">
  <view class="session-header"><view class="session-top"><CircleAction class="back-button" :disabled="submitting" @tap="back"/><view class="top-title"><text>{{source}}</text><text>专注 {{elapsed}}</text></view><CircleAction class="favorite-button" :icon="isFavorite?'heart-filled':'heart'" :label="isFavorite?'取消收藏':'收藏题目'" :active="isFavorite" :disabled="favoriteBusy||!current" @tap="favorite"/></view>
   <template v-if="current&&!loading"><view class="progress-head"><text>第 <text class="current-number">{{currentIndex+1}}</text> / {{questions.length}} 题</text><text>已答 {{summary.done}} 题 · {{progress}}%</text></view><view class="progress-track" role="progressbar" :aria-valuenow="summary.done" :aria-valuemax="questions.length" aria-valuemin="0" aria-label="本轮已答题数"><view :style="{width:progress+'%'}"/></view><text class="context-line">{{contextLine}}</text></template>
  </view>
  <view v-if="storageError" class="page-error" role="alert">{{storageError}}</view>
  <view v-if="error" class="page-error" role="alert">{{error}}<ActionButton v-if="!current" @tap="load()">重新加载</ActionButton></view>
  <view v-if="loading" class="empty-session" role="status">正在准备题目…</view>
  <view v-else-if="!current" class="empty-session"><uni-icons type="list" size="36" color="#7c93b5"/><text>当前范围暂无可练题目</text><text>返回选择其他章节，或稍后再来看看。</text><ActionButton @tap="back">返回上一页</ActionButton></view>
  <template v-else>
   <view class="question-paper" :class="{'has-mistake':wrongQuestion}"><view class="question-params"><text class="type-badge">{{current.typeName||'练习题'}}</text><text v-if="current.year||current.source" class="source-meta">{{[current.year?current.year+'年':'',current.source].filter(Boolean).join(' · ')}}</text></view>
    <ConfiguredQuestion :key="current.id+'-'+renderRound" :question="current" :exam-id="exam.id" :initial="attempts[current.id]" :active="active" @change="change" @submitted="submitted" @busy="submitting=$event" @verdict="displayVerdict"/>
    <view class="question-tools"><ActionButton @tap="openNote"><uni-icons type="compose" size="18" color="#627895" aria-hidden="true"/>记笔记<text v-if="noteDrafts[current.id]" class="draft-dot"/></ActionButton><ActionButton v-if="knowledgeLinks.length" @tap="sheet='knowledge'"><uni-icons type="map" size="18" color="#627895" aria-hidden="true"/>关联知识点<text class="tool-count">{{knowledgeLinks.length}}</text></ActionButton></view>
   </view>
   <text class="save-hint">作答草稿自动保留，可随时切换题目</text>
   <view class="session-bottom"><ActionButton :disabled="currentIndex===0||submitting" @tap="goTo(currentIndex-1)"><uni-icons type="left" size="18" color="#62748a" aria-hidden="true"/>上一题</ActionButton><ActionButton class="card-button" :disabled="submitting" @tap="sheet='card'"><uni-icons type="list" size="19" color="#3569e8" aria-hidden="true"/>答题卡</ActionButton><ActionButton :disabled="submitting" @tap="next">{{currentIndex===questions.length-1?(chapterMode?'本章结束':'结束练习'):'下一题'}}<uni-icons type="right" size="18" color="#62748a" aria-hidden="true"/></ActionButton></view>
  </template>
  <ReadingSheet v-if="sheet==='card'" title="本轮答题卡" @close="closeSheet"><view class="sheet-summary"><text>已答 {{summary.done}} / {{summary.total}}</text><text>{{summary.accuracy===null?'暂无客观题结果':'客观题正确率 '+summary.accuracy+'%'}}</text></view><view class="card-filters"><ActionButton v-for="item in [{id:'all',text:'全部'},{id:'unanswered',text:'未答'},{id:'wrong',text:'错题 / 部分'},{id:'pending',text:'待评分'}]" :key="item.id" :class="{active:cardFilter===item.id}" @tap="cardFilter=item.id">{{item.text}}</ActionButton></view><view class="number-grid"><ActionButton v-for="item in cardItems" :key="item.id" class="number-item" :class="[item.status,{current:item.index===currentIndex}]" :aria-label="'第'+(item.index+1)+'题，'+statusLabels[item.status]" @tap="goTo(item.index)"><text>{{item.index+1}}</text><text>{{statusLabels[item.status]}}</text></ActionButton></view><text v-if="!cardItems.length" class="sheet-muted">没有符合此状态的题目</text><ActionButton class="secondary-button" @tap="completionData=true;sheet='complete'">查看本轮统计</ActionButton></ReadingSheet>
  <ReadingSheet v-if="sheet==='knowledge'" title="关联知识点" @close="closeSheet"><ActionButton v-for="point in knowledgeLinks" :key="point.id" class="knowledge-entry" @tap="openKnowledge(point.id)"><view><text>{{point.title}}</text><text>{{point.path}}</text></view><uni-icons type="right" size="17" color="#647a96"/></ActionButton></ReadingSheet>
  <ReadingSheet v-if="sheet==='note'" title="题目笔记" @close="closeSheet"><text class="note-caption">{{current?.stem||current?.title}}</text><textarea v-model="noteText" class="note-input" :maxlength="1000" placeholder="记录解题思路、易错原因或复习提醒" aria-label="题目笔记内容"/><view class="note-meta"><text>关闭后保留本机草稿</text><text>{{noteText.length}} / 1000</text></view><text v-if="noteError" class="page-error" role="alert">{{noteError}}</text><ActionButton class="primary-button" :loading="noteSaving" :disabled="noteSaving" @tap="saveNote">保存笔记</ActionButton></ReadingSheet>
  <PracticeCompletion v-if="sheet==='complete'" :show-data="completionData" :ids="questions.map(q=>q.id)" :attempts="attempts" :elapsed="elapsed" :chapter-name="chapterMode&&chapter?chapter.subjectName+' · 第'+chapter.no+'章 '+chapter.name:source" :chapter-mode="chapterMode" :subject-complete="chapterFlow.complete" :has-next="!!chapterFlow.next" :has-unfinished="!!chapterFlow.unfinished" :active="active" @close="closeSheet" @resume="continueUnanswered" @next="continueChapter" @finish="finishSubject" @restart="restart" @leave="back" @question="goTo"/>

 </view>
</template>

<style scoped>

.session-page{--session-blue:#3569e8;--session-ink:#263953;--session-muted:#63748a;max-width:430px;min-height:100vh;box-sizing:border-box;margin:0 auto;padding:env(safe-area-inset-top) 0 calc(100px + env(safe-area-inset-bottom));background:#f3f6fb;color:var(--session-ink)}button{font:inherit;line-height:1.5;margin:0;box-sizing:border-box}button:after{border:0}button:focus-visible,textarea:focus-visible{outline:2px solid var(--session-blue);outline-offset:2px}.session-header{padding:12px 20px 0;background:linear-gradient(145deg,#eaf1ff 0%,#f3f6fb 80%)}.session-top{display:flex;align-items:center;justify-content:space-between;gap:12px}.top-title{display:flex;align-items:center;flex-direction:column;gap:4px}.top-title>text:first-child{font-size:17px;font-weight:600;letter-spacing:.5px}.top-title>text:last-child{font-size:11px;font-variant-numeric:tabular-nums;color:var(--session-muted)}.progress-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-top:24px;font-size:12px;color:var(--session-muted)}.progress-head>text:first-child{color:var(--session-ink)}.current-number{font-size:26px;line-height:1.1;font-weight:650;margin-right:3px;font-variant-numeric:tabular-nums}.progress-track{height:4px;border-radius:4px;margin-top:12px;background:#dfe7f4;overflow:hidden}.progress-track>view{height:100%;background:var(--session-blue);border-radius:inherit;transition:width .2s}.context-line{display:block;margin:14px 0;color:var(--session-muted);font-size:11px;line-height:1.8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.question-paper{background:#fff;margin:0 12px;border:1px solid #e9eef5;border-radius:20px;padding:20px 19px 0;box-shadow:0 4px 20px #253b5a03}.question-params{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:20px}.type-badge{background:#edf3ff;color:#315fc8;font-size:12px;padding:5px 9px;border-radius:6px;font-weight:600}.source-meta{font-size:11px;color:var(--session-muted)}.question-tools{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:20px;padding:10px 0;border-top:1px solid #edf0f5}.question-tools button{display:flex;align-items:center;justify-content:center;gap:6px;min-height:44px;padding:6px 2px;background:transparent;color:#526a88;font-size:12px}.tool-count{display:flex;align-items:center;justify-content:center;min-width:18px;height:18px;background:#edf2fa;border-radius:5px;font-size:10px}.draft-dot{height:5px;width:5px;border-radius:50%;background:var(--session-blue)}.save-hint{display:block;text-align:center;margin:18px 12px 0;font-size:11px;color:#738297}.session-bottom{position:fixed;z-index:30;left:50%;bottom:0;transform:translateX(-50%);display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;width:100%;max-width:430px;padding:10px 16px calc(10px + env(safe-area-inset-bottom));box-sizing:border-box;background:#fff;border-top:1px solid #e4eaf3}.session-bottom button{display:flex;align-items:center;justify-content:center;gap:4px;min-height:46px;padding:0;background:transparent;color:#4f647e;font-size:13px}.session-bottom .card-button{background:#edf3ff;color:var(--session-blue);border-radius:12px;font-weight:600}.session-bottom button[disabled]{opacity:.4}.empty-session{display:flex;align-items:center;flex-direction:column;gap:18px;padding:80px 24px;font-size:16px}.empty-session>text+text{font-size:13px;color:var(--session-muted);text-align:center}.empty-session button,.secondary-button{background:#edf2f9;color:#426085;padding:13px 18px;border-radius:12px;font-size:14px;min-height:46px}.sheet-summary{display:flex;justify-content:space-between;gap:12px;font-size:12px;color:var(--session-muted);line-height:1.8}.card-filters{display:flex;gap:6px;margin:16px 0}.card-filters button{flex:1;min-height:44px;padding:8px 2px;background:#f5f7fa;color:#66778f;font-size:12px;border-radius:8px}.card-filters button.active{background:#eaf1ff;color:#315fc8}.number-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin:4px 0 22px;padding:3px}.number-item{display:flex;align-items:center;flex-direction:column;justify-content:center;gap:4px;min-height:58px;padding:6px 1px;background:#f2f4f7;border:1px solid transparent;border-radius:10px;color:#65778d;font-size:16px;font-weight:600}.number-item>text+text{font-size:9px;font-weight:400}.number-item.current{outline:2px solid var(--session-blue);outline-offset:2px}.number-item.correct{background:#eaf6f0;color:#267759}.number-item.wrong{background:#fff0ee;color:#ac4137}.number-item.partial,.number-item.failed,.number-item.pending,.number-item.self_review{background:#fff5e4;color:#8d6420}.number-item.draft{background:#edf2ff;color:#3569c7}.number-item.reviewed{background:#e8f4f7;color:#356e80}.knowledge-entry{display:flex;align-items:center;gap:12px;width:100%;text-align:left;padding:16px 0;background:transparent;border-bottom:1px solid #edf0f5}.knowledge-entry>view{display:flex;flex:1;min-width:0;flex-direction:column;gap:7px}.knowledge-entry text:first-child{font-size:15px;color:var(--session-ink);line-height:1.7}.knowledge-entry text+text{font-size:11px;color:var(--session-muted)}.note-caption{display:block;max-height:50px;overflow:hidden;font-size:13px;line-height:1.8;color:var(--session-muted);margin-bottom:12px}.note-input{width:100%;height:180px;padding:12px;box-sizing:border-box;border:1px solid #dce4ef;border-radius:12px;background:#fafbfd;font-size:16px;line-height:1.8}.note-meta{display:flex;justify-content:space-between;gap:8px;font-size:11px;color:var(--session-muted);margin:10px 0 16px}.primary-button{background:var(--session-blue);color:#fff;min-height:46px;padding:12px;border-radius:12px;font-size:15px;font-weight:600}.primary-button[disabled]{opacity:.5;color:#fff}.secondary-button{width:100%;margin-top:10px}.text-button{background:transparent;color:var(--session-muted);min-height:44px;font-size:12px;margin:8px auto 0}.sheet-muted{display:block;font-size:13px;line-height:1.85;color:var(--session-muted);padding-bottom:8px}.page-error{display:block;background:#fff0ed;color:#a54439;margin:12px;padding:12px;border-radius:10px;font-size:13px;line-height:1.7}.page-error button{background:transparent;color:inherit;min-height:44px;font-size:13px}@media(max-width:350px){.question-paper{margin:0 8px;padding:16px 14px 0}.session-header{padding-left:16px;padding-right:16px}.number-grid{gap:8px}.question-tools button{font-size:11px}}@media(prefers-reduced-motion:reduce){.progress-track>view{transition:none}}
</style>
<style scoped>
.question-paper.has-mistake{border-color:#c63743;box-shadow:inset 0 0 0 1px #c63743,0 6px 22px #c6374310}
</style>
