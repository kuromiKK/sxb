<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { onShow, onHide, onUnload, onPageScroll } from '@dcloudio/uni-app'
import uniIcons from '@dcloudio/uni-ui/lib/uni-icons/uni-icons.vue'
import AppTabBar from '@/components/AppTabBar.vue'
import ActionButton from '@/components/ui/ActionButton.vue'
import ScrollTabs from '@/components/ui/ScrollTabs.vue'
import SlidePanel from '@/components/ui/SlidePanel.vue'
import { knowledgeSubjects, practiceQuestions, type KnowledgeSubject } from '@/mock/data'
import { useAppStore } from '@/store/app'
import { api, token, selectedExamId, refreshPersonalData, learningPlan } from '@/services/api'
import { refreshCatalog } from '@/services/catalog'
import { learningReady } from '@/utils/learning-bootstrap'
import { openPage } from '@/utils/navigation'
import { getWeakKnowledgePoints } from '@/utils/weak-points'
import { supportsAutomaticGrading } from '../../../../shared/question-types'
import { chapterPracticeQueues, chapterSessionKey, readChapterRound, practiceSummary, type PracticeChapter } from '@/utils/practice-session'

type Selection = {subjectId:string;expanded:Record<string,boolean>;scrollTop:number}
type ChapterRow = PracticeChapter & {title:string;total:number;done:number;started:boolean;complete:boolean;mastery:number|null;lastActivity:number;sections:Array<{id:string;name:string;total:number}>}
const { state, exam, requireLogin, refreshPlanState } = useAppStore()
const subjects=ref<KnowledgeSubject[]>([]),rows=ref<ChapterRow[]>([])
const selection=ref<Selection>({subjectId:'',expanded:{},scrollTop:0})
const busy=ref(true),error=ref(''),personalError=ref(''),personalReady=ref(false),loggedIn=ref(false)
const wrongCount=ref(0),weakCount=ref(0),subjectStats=ref<Record<string,{total:number;done:number;mastery:number|null}>>({})
const direction=ref<'next'|'previous'>('next')
let version=0,ownerExam='',ownerToken='',userId='',selectionKey='',pageScroll=0,restoring=false
const valid=(v:number)=>v===version&&ownerExam===selectedExamId()&&ownerToken===token()
const selectedSubject=computed(()=>subjects.value.find(s=>s.id===selection.value.subjectId))
const subjectRows=computed(()=>rows.value.filter(c=>c.subjectId===selection.value.subjectId))
const overview=computed(()=>subjectStats.value[selection.value.subjectId])
const lastChapter=computed(()=>subjectRows.value.filter(c=>c.started).sort((a,b)=>b.lastActivity-a.lastActivity)[0])
const subjectOptions=computed(()=>subjects.value.map(s=>({id:s.id,label:s.shortTitle?.trim()||s.name})))
const livePlan=computed(()=>loggedIn.value&&personalReady.value&&learningPlan.data?.exam.id===ownerExam?learningPlan.data:null)
const planCaption=computed(()=>!loggedIn.value?'登录后同步每日学习进度':!personalReady.value?'学习计划暂未同步':!livePlan.value?'设置目标，按自己的节奏练习':livePlan.value.progress.isRest?'今天是休息日，可自由选择章节':livePlan.value.progress.todayRemaining===0?'今日目标已完成':`今日完成 ${livePlan.value.progress.todayDone} / ${livePlan.value.progress.todayTarget} 题`)
const planAction=computed(()=>!loggedIn.value?'登录学习':!personalReady.value?'重新同步':!livePlan.value?.questionIds?.length?'设置计划':livePlan.value.progress.isRest||livePlan.value.progress.todayRemaining===0?'查看计划':'练今日计划')
const planProgress=computed(()=>{const p=livePlan.value?.progress;return p?.todayTarget?Math.min(100,Math.round(p.todayDone/p.todayTarget*100)):0})
const tools=[{id:'wrong',label:'错题本'},{id:'favorite',label:'收藏'},{id:'note',label:'笔记'},{id:'recite',label:'背题'}]
const cleanTitle=(name:string)=>name.replace(/^第[零〇一二三四五六七八九十百千\d]+章\s*[、：:.．-]?\s*/,'')
function saveSelection(){
 if(!selectionKey||busy.value||ownerExam!==selectedExamId()||ownerToken!==token())return
 uni.setStorageSync(selectionKey,{...selection.value,scrollTop:pageScroll})
}
async function load(){
 const v=++version;busy.value=true;error.value='';personalError.value='';personalReady.value=false
 try{
  await learningReady
  if(v!==version)return
  ownerExam=selectedExamId();ownerToken=token();loggedIn.value=!!ownerToken;userId=''
  await refreshCatalog()
  if(!valid(v))return
  if(loggedIn.value){
   const personal=await Promise.allSettled([api<{id:string}>('/me'),refreshPersonalData()])
   if(!valid(v))return
   if(personal[0].status==='fulfilled')userId=personal[0].value.id
   personalReady.value=personal.every(result=>result.status==='fulfilled')
   if(!personalReady.value)personalError.value='学习记录暂未同步，点击重试'
  }
  refreshPlanState()
  subjects.value=JSON.parse(JSON.stringify(knowledgeSubjects))
  const questions=[...practiceQuestions],byId=new Map(questions.map(q=>[q.id,q]))
  const answered=personalReady.value?uni.getStorageSync('sxb-answered-'+ownerExam)||{}:{}
  const mastery=(ids:string[])=>{
   if(!personalReady.value)return null
   const objective=ids.map(id=>byId.get(id)).filter(q=>q&&supportsAutomaticGrading(q))
   return objective.length?Math.round(objective.filter(q=>answered[q!.id]==='correct').length/objective.length*100):null
  }
  const submittedIds=new Set<string>()
  rows.value=chapterPracticeQueues(subjects.value,questions).map(c=>{
   const saved=personalReady.value?readChapterRound(c,userId,ownerExam,key=>uni.getStorageSync(key)):undefined
   const summary=practiceSummary(c.questionIds,saved?.attempts||{})
   c.questionIds.forEach(id=>{if(saved?.attempts?.[id]?.result&&!saved.attempts[id].history)submittedIds.add(id)})
   const sections=subjects.value.find(s=>s.id===c.subjectId)?.chapters.find(ch=>ch.id===c.id)?.sections||[]
   return {...c,title:cleanTitle(c.name),total:c.questionIds.length,done:summary.done,complete:c.questionIds.length>0&&summary.done===c.questionIds.length,
    started:!!saved?.currentId||summary.done>0,lastActivity:Number(saved?.updatedAt)||0,mastery:mastery(c.questionIds),
    sections:sections.map(s=>({id:s.id,name:s.name,total:new Set(questions.filter(q=>(q.linkedSectionIds||[q.sectionId]).includes(s.id)).map(q=>q.id)).size}))}
  })
  subjectStats.value=Object.fromEntries(subjects.value.map(s=>{
   const ids=[...new Set(rows.value.filter(c=>c.subjectId===s.id).flatMap(c=>c.questionIds))]
   return [s.id,{total:ids.length,done:ids.filter(id=>submittedIds.has(id)).length,mastery:mastery(ids)}]
  }))
  wrongCount.value=personalReady.value?new Set<string>((uni.getStorageSync('sxb-wrong-questions')||[]).filter((id:string)=>byId.has(id))).size:0
  weakCount.value=personalReady.value?getWeakKnowledgePoints(ownerExam,'normal',questions.filter(supportsAutomaticGrading)).length:0
  selectionKey='sxb-practice-directory-'+(userId||'guest')+'-'+ownerExam
  const saved=uni.getStorageSync(selectionKey)
  selection.value={subjectId:typeof saved?.subjectId==='string'?saved.subjectId:'',expanded:saved?.expanded&&typeof saved.expanded==='object'?saved.expanded:{},scrollTop:Math.max(0,Number(saved?.scrollTop)||0)}
  if(!subjects.value.some(s=>s.id===selection.value.subjectId))selection.value.subjectId=subjects.value[0]?.id||''
  pageScroll=selection.value.scrollTop;busy.value=false;restoring=true
  await nextTick()
  if(valid(v))uni.pageScrollTo({scrollTop:pageScroll,duration:0,complete:()=>{restoring=false}})
 }catch(e){if(v===version){error.value=e instanceof Error?e.message:'题库加载失败，请重试';busy.value=false}}
}
function selectSubject(id:string){
 if(id===selection.value.subjectId)return
 direction.value=subjects.value.findIndex(s=>s.id===id)>subjects.value.findIndex(s=>s.id===selection.value.subjectId)?'next':'previous'
 selection.value.subjectId=id;saveSelection()
}
function stepSubject(step:number){const s=subjects.value[subjects.value.findIndex(s=>s.id===selection.value.subjectId)+step];if(s)selectSubject(s.id)}
function toggleChapter(id:string){selection.value.expanded[id]=!selection.value.expanded[id];saveSelection()}
function goSession(query:string){
 saveSelection()
 const url='/pages/practice-session/index?'+query+'&returnUrl='+encodeURIComponent('/pages/practice/index')
 if(requireLogin(url))openPage(url)
}
function openChapter(chapter:ChapterRow){
 if(!chapter.total)return
 const query='subjectId='+encodeURIComponent(chapter.subjectId)+'&chapterId='+encodeURIComponent(chapter.id)
 if(!chapter.complete){goSession(query);return}
 uni.showModal({title:'重练本章？',content:'将开启新一轮练习，历史作答、错题和笔记仍会保留。',confirmText:'重练本章',cancelText:'取消',success:r=>{
  if(!r.confirm||ownerToken!==token()||ownerExam!==selectedExamId())return
  const saved=readChapterRound(chapter,userId,ownerExam,key=>uni.getStorageSync(key))
  uni.setStorageSync(chapterSessionKey(userId,ownerExam,chapter.id),{version:1,ids:chapter.questionIds,attempts:{},notes:saved?.notes||{},versions:{},elapsedMs:0})
  goSession(query)
 }})
}
function openProtected(url:string){saveSelection();if(requireLogin(url))openPage(url)}
function planTap(){
 if(loggedIn.value&&!personalReady.value){void load();return}
 if(planAction.value==='练今日计划')goSession('plan=1')
 else openProtected('/pages/learning-plan/index?returnUrl='+encodeURIComponent('/pages/practice/index'))
}
function goTool(id:string){openProtected(id==='recite'?'/pages/recite/index':'/pages/practice-tools/index?mode='+id)}
onShow(()=>{state.selectedTab=3;void load()})
onPageScroll(e=>{if(!restoring)pageScroll=e.scrollTop})
onHide(()=>{saveSelection();version++})
onUnload(()=>{saveSelection();version++})
</script>

<template>
 <view class="practice-page page">
  <view class="practice-header">
   <view class="header-copy"><text class="page-heading">刷题</text><text class="exam-name">{{exam.name}}</text><view v-if="exam.daysLeft>0" class="exam-countdown"><uni-icons type="calendar" size="13" color="#54739b" aria-hidden="true"/><text>距考试</text><text class="days">{{exam.daysLeft}}</text><text>天</text></view></view>
   <image class="header-illustration" src="/static/illustrations/practice-notebook.svg" mode="aspectFit" aria-hidden="true" :draggable="false"/>
  </view>
  <view class="practice-sheet">
   <view v-if="busy" class="directory-state" role="status"><view class="loading-line"/><text>正在准备题库…</text></view>
   <view v-else-if="error" class="directory-state" role="alert"><text>{{error}}</text><ActionButton @tap="load">重新加载</ActionButton></view>
   <template v-else>
    <view class="practice-dashboard">
     <view class="plan-card"><view class="plan-copy"><ActionButton class="plan-link" aria-label="查看学习计划" @tap="openProtected('/pages/learning-plan/index?returnUrl=%2Fpages%2Fpractice%2Findex')"><text>今日计划</text><uni-icons type="right" size="12" color="#7184a0" aria-hidden="true"/></ActionButton><text class="plan-caption">{{planCaption}}</text><view v-if="livePlan?.progress.todayTarget&&!livePlan.progress.isRest" class="plan-track" role="progressbar" aria-label="今日计划进度" :aria-valuenow="planProgress" :aria-valuemin="0" :aria-valuemax="100"><view :style="{width:planProgress+'%'}"/></view></view><ActionButton class="plan-action" @tap="planTap">{{planAction}}<uni-icons type="right" size="13" color="#fff" aria-hidden="true"/></ActionButton></view>
     <view class="tool-grid"><ActionButton v-for="tool in tools" :key="tool.id" class="tool-item" @tap="goTool(tool.id)"><view class="tool-icon" :class="tool.id"><image :src="'/static/icons/practice-'+tool.id+'.svg'" mode="aspectFit" aria-hidden="true"/><text v-if="tool.id==='wrong'&&wrongCount" class="count-badge">{{wrongCount>99?'99+':wrongCount}}</text></view><text>{{tool.label}}</text></ActionButton></view>
     <ActionButton v-if="weakCount" class="weak-entry" @tap="goSession('mode=weak')"><uni-icons type="fire" size="17" color="#ad7947" aria-hidden="true"/><text>{{weakCount}} 个薄弱知识点，集中巩固一下</text><uni-icons type="right" size="14" color="#ad7947" aria-hidden="true"/></ActionButton>
     <ActionButton v-if="personalError" class="personal-error" @tap="load">{{personalError}}</ActionButton>
    </view>
    <view v-if="subjects.length" class="directory-navigation"><view class="section-heading"><text>章节练习</text><text>一章一章，稳步向前</text></view><ScrollTabs :items="subjectOptions" :model-value="selection.subjectId" label="选择科目" item-class="subject-tab" @update:model-value="selectSubject"/></view>
    <SlidePanel :panel-key="selection.subjectId" :direction="direction" @next="stepSubject(1)" @previous="stepSubject(-1)">
     <view v-if="selectedSubject" class="chapter-content">
      <view class="subject-summary"><text>{{subjectRows.length}} 章 · {{overview?.total||0}} 题<template v-if="personalReady"> · 本轮已答 {{overview?.done||0}}</template></text><text class="subject-mastery">{{overview?.mastery==null?'掌握程度 —':'掌握 '+overview.mastery+'%'}}</text></view>
      <view class="chapter-list">
       <view v-for="chapter in subjectRows" :key="chapter.id" class="chapter-card" :class="{recent:chapter.id===lastChapter?.id,complete:chapter.complete}" :data-chapter-id="chapter.id">
        <view class="chapter-top"><text class="chapter-number">第 {{chapter.no}} 章</text><text v-if="chapter.complete" class="chapter-status">本轮已完成</text><text v-else-if="chapter.id===lastChapter?.id" class="chapter-status">上次练到</text></view>
        <text class="chapter-title">{{chapter.title}}</text>
        <view class="chapter-meta"><text>共 {{chapter.total}} 题<template v-if="personalReady&&chapter.total"> · 本轮已答 {{chapter.done}}</template></text><text v-if="chapter.total" class="chapter-mastery">{{chapter.mastery==null?'掌握程度 —':'掌握 '+chapter.mastery+'%'}}</text></view>
        <view v-if="chapter.total" class="mastery-track" role="progressbar" :aria-label="'第'+chapter.no+'章掌握程度'" :aria-valuenow="chapter.mastery??undefined" :aria-valuemin="0" :aria-valuemax="100"><view :style="{width:(chapter.mastery||0)+'%'}"/></view>
        <view class="chapter-actions"><ActionButton class="range-toggle" :aria-expanded="!!selection.expanded[chapter.id]" @tap="toggleChapter(chapter.id)"><text>{{chapter.sections.length}} 节 · {{selection.expanded[chapter.id]?'收起范围':'查看范围'}}</text><uni-icons :type="selection.expanded[chapter.id]?'up':'down'" size="12" color="#718098" aria-hidden="true"/></ActionButton><ActionButton class="start-chapter" :disabled="!chapter.total||!!personalError" @tap="openChapter(chapter)">{{!chapter.total?'暂无题目':chapter.complete?'重练本章':chapter.started?'继续练习':'开始练习'}}<uni-icons v-if="chapter.total" type="right" size="13" color="#416da8" aria-hidden="true"/></ActionButton></view>
        <view v-if="selection.expanded[chapter.id]" class="section-list"><view v-for="(section,i) in chapter.sections" :key="section.id" class="section-row"><text class="section-no">{{String(i+1).padStart(2,'0')}}</text><text class="section-name">{{section.name}}</text><text class="section-count">{{section.total}} 题</text></view><text v-if="!chapter.sections.length" class="empty-caption">本章暂无节目录</text></view>
       </view>
      </view>
      <view v-if="!subjectRows.length" class="directory-state"><text>本科目暂无章节</text></view>
      <text v-if="subjectRows.length" class="directory-footnote">{{!loggedIn?'登录后保存练习进度。':personalReady?'本轮进度保存在当前设备；掌握程度按客观题最近作答计算。':'同步后可查看练习进度。'}}</text>
     </view>
     <view v-else class="directory-state"><text>当前考试暂无题库内容</text></view>
    </SlidePanel>
   </template>
  </view>
  <AppTabBar active="practice"/>
 </view>
</template>

<style scoped lang="scss">
.practice-page{--practice-ink:var(--sxb-ink,#24364f);--practice-muted:var(--sxb-ui-muted,#65748a);--practice-line:var(--sxb-ui-line,#e9edf2);max-width:430px;min-height:100vh;margin:0 auto;padding:0 0 calc(112px + env(safe-area-inset-bottom,0px));box-sizing:border-box;background:#fff;color:var(--practice-ink)}
.practice-header{position:relative;isolation:isolate;overflow:hidden;box-sizing:border-box;min-height:calc(172px + env(safe-area-inset-top,0px));padding:calc(23px + env(safe-area-inset-top,0px)) 22px 36px;background:linear-gradient(115deg,#eaf2ff 0%,#dcecff 46%,#d9f1e9 100%)}
.practice-header:before{content:'';position:absolute;width:230px;height:230px;border:1px solid #ffffff80;border-radius:50%;right:-54px;top:-110px;pointer-events:none}
.header-copy{position:relative;z-index:1;width:58%}.page-heading{display:block;font-size:26px;font-weight:700;letter-spacing:1px;line-height:1.4;color:#243d62}.exam-name{display:block;margin-top:5px;color:#546c8d;font-size:12px;line-height:1.6;overflow-wrap:anywhere}.exam-countdown{display:inline-flex;align-items:center;gap:5px;margin-top:13px;padding:4px 10px;border:1px solid #ffffffcc;border-radius:20px;background:#ffffffa6;color:#546c8d;font-size:12px;line-height:1.5}.days{font-size:15px;font-weight:600;color:#315eaa;font-variant-numeric:tabular-nums}
.header-illustration{position:absolute;width:44%;height:150px;right:3px;bottom:14px;pointer-events:none;animation:practice-arrive 480ms var(--sxb-motion,ease) both}
.practice-sheet{position:relative;margin-top:-22px;padding-top:18px;border-radius:24px 24px 0 0;background:#fff;min-height:calc(100vh - 150px)}
.practice-dashboard{padding:0 20px}.plan-card{display:flex;align-items:center;gap:14px;padding:4px 14px 13px;border-radius:17px;background:#f1f5fc}.plan-copy{flex:1;min-width:0}.plan-link{display:flex;align-items:center;gap:5px;min-height:40px;margin:0;padding:0;background:transparent;text-align:left;font-size:14px;font-weight:600;color:#344e72}.plan-caption{display:block;font-size:12px;line-height:1.7;color:var(--practice-muted)}.plan-track{height:3px;margin-top:10px;overflow:hidden;border-radius:3px;background:#e1e9f4}.plan-track>view{height:100%;background:#87a7dd;border-radius:3px}.plan-action{display:flex;align-items:center;justify-content:center;gap:4px;min-height:44px;flex:none;margin:7px 0 0;padding:0 12px;border-radius:22px;background:#416fba;color:#fff;font-size:12px;line-height:1.5}
.tool-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:10px}.tool-item{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;min-height:74px;margin:0;padding:8px 0;background:transparent;font-size:12px;color:#53647b;line-height:1.5}.tool-icon{position:relative;display:grid;place-items:center;width:34px;height:34px;border-radius:12px;background:#f2f5fa}.tool-icon image{width:22px;height:22px}.tool-icon.wrong{background:#fff4e9}.tool-icon.favorite{background:#f3effa}.tool-icon.note{background:#eef6f2}.tool-icon.recite{background:#edf3fb}.count-badge{position:absolute;top:-6px;right:-10px;padding:1px 4px;min-width:16px;box-sizing:border-box;background:#b46d51;border:2px solid #fff;color:#fff;border-radius:12px;font-size:10px;text-align:center;line-height:1.3}
.weak-entry{display:flex;align-items:center;gap:8px;width:100%;margin:8px 0 0;padding:10px 12px;min-height:44px;background:#fff7ec;border-radius:12px;text-align:left;color:#966a3e;font-size:12px;line-height:1.6}.weak-entry>text{flex:1}.personal-error{min-height:44px;padding:8px;margin:8px 0;background:#fff7ec;color:#956636;font-size:12px;line-height:1.6}
.directory-navigation{position:sticky;top:env(safe-area-inset-top,0px);z-index:5;padding-top:12px;background:#fff}.section-heading{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:0 22px 7px}.section-heading>text:first-child{font-size:18px;font-weight:600}.section-heading>text:last-child{font-size:11px;color:var(--practice-muted)}
.chapter-content{padding:0 20px}.subject-summary{display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px 12px;padding:13px 0 17px;font-size:12px;line-height:1.7;color:var(--practice-muted)}.subject-mastery{color:#516d9e}
.chapter-list{display:flex;flex-direction:column;gap:13px}.chapter-card{padding:16px 16px 0;border:1px solid var(--practice-line);border-radius:18px;background:#fff}.chapter-card.recent{border-color:#c8d9f3;background:linear-gradient(135deg,#f3f7ff,#fff 80%)}.chapter-top{display:flex;align-items:center;justify-content:space-between;gap:12px}.chapter-number{font-size:12px;font-weight:600;letter-spacing:.5px;color:#5679a8}.chapter-status{font-size:11px;color:#5274a0}.complete .chapter-status{color:#4d8476}.chapter-title{display:block;margin-top:9px;font-size:16px;line-height:1.65;font-weight:600;overflow-wrap:anywhere}.chapter-meta{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px;margin-top:10px;font-size:12px;line-height:1.5;color:var(--practice-muted)}.chapter-mastery{color:#516d9e}.mastery-track{height:3px;margin-top:12px;overflow:hidden;border-radius:3px;background:#edf0f5}.mastery-track>view{height:100%;border-radius:3px;background:#8babe1}
.chapter-actions{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:6px 0}.range-toggle{display:flex;align-items:center;gap:5px;min-height:44px;margin:0;padding:0;background:transparent;color:var(--practice-muted);font-size:12px;line-height:1.5;text-align:left}.start-chapter{display:flex;align-items:center;justify-content:center;gap:7px;min-height:44px;margin:0;padding:0 11px;border-radius:16px;background:#edf3fc;color:#416da8;font-size:12px;line-height:1.5}.start-chapter[disabled]{background:#f5f6f8;color:#778496}
.section-list{border-top:1px solid var(--practice-line);padding:3px 0 8px}.section-row{display:flex;align-items:baseline;gap:9px;padding:12px 0;font-size:13px;line-height:1.7}.section-row+.section-row{border-top:1px solid #f0f2f6}.section-no{flex:none;font-size:11px;color:#6c87a7}.section-name{flex:1;min-width:0;overflow-wrap:anywhere;color:#53647b}.section-count{flex:none;font-size:12px;color:var(--practice-muted)}.directory-footnote{display:block;padding:24px 8px 8px;font-size:11px;line-height:1.8;color:var(--practice-muted);text-align:center}.empty-caption{display:block;padding:18px;font-size:13px;color:var(--practice-muted);text-align:center}
.directory-state{display:flex;flex-direction:column;align-items:center;gap:20px;padding:60px 24px;font-size:14px;line-height:1.8;text-align:center;color:var(--practice-muted)}.directory-state button{min-height:44px;padding:8px 22px;border-radius:22px;background:#edf2ff;color:#416fba;font-size:14px;line-height:1.8}.loading-line{width:80px;height:3px;border-radius:3px;background:#dce6ff}
button{cursor:pointer;touch-action:manipulation}button::after{border:0}button:focus-visible{outline:2px solid var(--sxb-blue,#3569e8);outline-offset:2px}
@keyframes practice-arrive{from{opacity:0;transform:translateY(8px) rotate(-3deg)}to{opacity:1;transform:translateY(0) rotate(0)}}
@media(max-width:350px){.practice-dashboard,.chapter-content{padding-left:16px;padding-right:16px}.section-heading{padding-left:18px;padding-right:18px}.chapter-card{padding-left:13px;padding-right:13px}.plan-card{gap:8px;padding-left:12px;padding-right:12px}.plan-action{padding:0 9px}.chapter-meta{font-size:11px}}
@media(prefers-reduced-motion:reduce){.header-illustration{animation:none}button{transition:none}}
</style>
