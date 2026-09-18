<script setup lang="ts">
import { computed, ref } from 'vue'
import { onShow, onHide, onUnload } from '@dcloudio/uni-app'
import AppTabBar from '@/components/AppTabBar.vue'
import ScrollTabs from '@/components/ui/ScrollTabs.vue'
import SlidePanel from '@/components/ui/SlidePanel.vue'
import CourseCover from '@/components/ui/CourseCover.vue'
import { courseCatalog, knowledgeSubjects, type CourseLesson, type KnowledgeSubject } from '@/mock/data'
import { useAppStore } from '@/store/app'
import { api, selectedExamId, token, refreshRights } from '@/services/api'
import { refreshCatalog } from '@/services/catalog'
import { learningReady } from '@/utils/learning-bootstrap'
import { canAccessCourse } from '@/utils/course-access'

const { state, exam, requireLogin } = useAppStore()
const subjects = ref<KnowledgeSubject[]>([]), courses = ref<CourseLesson[]>([])
const subjectId = ref(''), chapterIds = ref<Record<string,string>>({})
const busy = ref(true), error = ref(''), historyError = ref(''), recentId = ref('')
const direction = ref<'next'|'previous'>('next')
let version = 0, loadedExam = ''
const subject = computed(() => subjects.value.find(s => s.id === subjectId.value))
const chapters = computed(() => subject.value?.chapters || [])
const chapter = computed(() => chapters.value.find(c => c.id === chapterIds.value[subjectId.value]))
const subjectTabs = computed(() => subjects.value.map(s => ({ id:s.id, label:s.shortTitle?.trim() || s.name })))
const chapterTabs = computed(() => chapters.value.map((c,i) => ({ id:c.id, label:'第'+(i+1)+'章' })))
const visibleCourses = computed(() => {
  const list = courses.value.filter(c => c.subjectId === subjectId.value && c.chapterId === chapter.value?.id)
  const order = chapter.value?.sections.map(s => s.id) || []
  return list.sort((a,b) => order.indexOf(a.sectionId) - order.indexOf(b.sectionId))
})
const recent = computed(() => courses.value.find(c => c.id === recentId.value))
const chapterName = computed(() => chapter.value?.name.replace(/^第[零〇一二三四五六七八九十百千\d]+章\s*[、：:.．-]?\s*/, '') || '')
const progressText = (c:CourseLesson) => c.completed ? '已学完' : c.progress > 0 ? '已学 '+c.progress+'%' : ''
const resumeText = (c:CourseLesson) => c.type === 'video' ? '继续观看' : c.type === 'audio' ? '继续收听' : '继续阅读'
function saveSelection() {
  if (loadedExam) uni.setStorageSync('sxb-course-directory-'+loadedExam, { subjectId:subjectId.value, chapters:chapterIds.value })
}
function selectSubject(id:string) {
  direction.value = subjects.value.findIndex(s=>s.id===id) > subjects.value.findIndex(s=>s.id===subjectId.value) ? 'next' : 'previous'
  subjectId.value=id;saveSelection()
}
function selectChapter(id:string) {
  direction.value = chapters.value.findIndex(c=>c.id===id) > chapters.value.findIndex(c=>c.id===chapter.value?.id) ? 'next' : 'previous'
  chapterIds.value[subjectId.value]=id;saveSelection()
}
function stepChapter(step:number) {
  const next = chapters.value[chapters.value.findIndex(c=>c.id===chapter.value?.id)+step]
  if(next)selectChapter(next.id)
}
async function load() {
  const current=++version;busy.value=true;error.value='';historyError.value='';recentId.value=''
  try {
    await learningReady
    if(current!==version)return
    const examId=selectedExamId(), auth=token()
    await refreshCatalog()
    if(current!==version || examId!==selectedExamId() || auth!==token())return
    subjects.value=JSON.parse(JSON.stringify(knowledgeSubjects))
    courses.value=courseCatalog.filter(c=>!c.knowledgePointId).map(c=>({...c,progress:0,completed:false,currentMinute:0}))
    const saved=uni.getStorageSync('sxb-course-directory-'+examId)
    subjectId.value=subjects.value.some(s=>s.id===saved?.subjectId)?saved.subjectId:subjects.value[0]?.id||''
    chapterIds.value={}
    for(const s of subjects.value)chapterIds.value[s.id]=s.chapters.some(c=>c.id===saved?.chapters?.[s.id])?saved.chapters[s.id]:s.chapters[0]?.id||''
    loadedExam=examId;busy.value=false
    if(auth){
      const results=await Promise.allSettled([api<any[]>('/records/'+examId+'?kind=courseProgress'),api<any>('/learning-visits/recent-course?examId='+encodeURIComponent(examId)),refreshRights()])
      if(current!==version || examId!==selectedExamId() || auth!==token())return
      const [records,latest,rights]=results
      if(records.status==='fulfilled')for(const c of courses.value){const p=records.value.find(r=>r.source_id===c.id)?.payload;c.completed=Boolean(p?.completed);c.progress=c.completed?100:Math.min(100,Math.max(0,Number(p?.progress)||0));c.currentMinute=Number(p?.currentMinute)||0}
      if(latest.status==='fulfilled')recentId.value=latest.value?.courseId||''
      if(records.status==='rejected'||latest.status==='rejected'||rights.status==='rejected')historyError.value='学习记录暂未同步'
    }
  } catch(e) {if(current===version){error.value=e instanceof Error?e.message:'课程加载失败';busy.value=false}}
}
async function openCourse(course:CourseLesson) {
  const url='/pages/course-detail/index?id='+encodeURIComponent(course.id)
  if(!token()){requireLogin(url);return}
  try{await refreshRights()}catch{uni.showToast({title:'暂时无法确认课程权限，请重试',icon:'none'});return}
  if(!canAccessCourse(course.canTrial)){
    uni.showModal({title:'解锁精讲课',content:'学习这门课程需要当前考试的课程权益。',confirmText:'查看套餐',success:r=>{if(r.confirm)uni.navigateTo({url:'/pages/products/index'})}});return
  }
  saveSelection();uni.navigateTo({url})
}
onShow(()=>{state.selectedTab=2;void load()})
onHide(()=>{saveSelection();version++})
onUnload(()=>{version++})
</script>

<template>
  <view class="courses-page" :class="{ 'with-resume': recent && !busy && !error }">
    <view class="course-masthead">
      <view class="masthead-text"><text class="page-title">精讲课</text><text class="page-subtitle">{{ exam.name }}</text><view class="learning-caption"><text class="caption-dot"></text><text>看 · 听 · 读，学透每一节</text></view></view>
      <view class="studio-illustration" aria-hidden="true"><image class="studio-scene" src="/static/illustrations/course-studio.svg" mode="aspectFit" :draggable="false"/><image class="studio-audio" src="/static/illustrations/course-audio-note.svg" mode="aspectFit" :draggable="false"/></view>
    </view>
    <view v-if="busy" class="course-state" role="status"><view class="skeleton-tabs"></view><view class="skeleton-grid"><view v-for="n in 4" :key="n"></view></view><text>正在整理课程…</text></view>
    <view v-else-if="error" class="course-state" role="alert"><text>{{ error }}</text><button @tap="load">重新加载</button></view>
    <template v-else>
      <view class="catalog-navigation"><ScrollTabs :items="subjectTabs" :model-value="subjectId" label="课程科目" item-class="course-subject" @update:model-value="selectSubject" /><view class="chapter-navigation"><ScrollTabs :key="subjectId" :items="chapterTabs" :model-value="chapter?.id || ''" variant="compact" label="课程章节" @update:model-value="selectChapter" /></view></view>
      <SlidePanel :panel-key="subjectId + ':' + chapter?.id" :direction="direction" @next="stepChapter(1)" @previous="stepChapter(-1)">
        <view class="chapter-heading"><view><text class="chapter-eyebrow">{{ chapter ? '第'+(chapters.findIndex(c=>c.id===chapter?.id)+1)+'章' : '课程目录' }}</text><text class="chapter-title">{{ chapterName || '即将与你见面' }}</text></view><text class="course-count">{{ visibleCourses.length }} 门课</text></view>
        <view v-if="visibleCourses.length" class="course-grid">
          <button v-for="course in visibleCourses" :key="course.id" class="course-card" :aria-label="(course.title || course.sectionName) + '，' + course.typeName + '课'" @tap="openCourse(course)">
            <CourseCover :course="course" />
            <text class="course-title">{{ course.title || course.sectionName }}</text>
            <view v-if="progressText(course)" class="course-meta"><text class="study-progress">{{ progressText(course) }}</text></view>
          </button>
        </view>
        <view v-else class="course-state empty"><image src="/static/icons/course-article.svg" mode="aspectFit" aria-hidden="true"/><text>本章课程正在准备中</text><text class="empty-hint">可以左右切换章节，看看其他课程</text></view>
      </SlidePanel>
      <button v-if="historyError" class="history-retry" @tap="load">{{ historyError }} · 重试</button>
    </template>
    <button v-if="recent && !busy && !error" class="resume-dock" :aria-label="resumeText(recent) + '：' + (recent.title || recent.sectionName)" @tap="openCourse(recent)">
      <CourseCover :course="recent" compact />
      <view class="resume-copy"><view class="resume-label"><text>{{ resumeText(recent) }}</text><text>{{ progressText(recent) || (recent.type === 'article' ? '最近阅读' : '最近学习') }}</text></view><text class="resume-title">{{ recent.title || recent.sectionName }}</text></view>
      <view class="resume-action" aria-hidden="true"><image :src="'/static/icons/course-' + recent.type + '.svg'" mode="aspectFit" /></view>
      <view v-if="recent.progress" class="resume-progress" :style="{width:recent.progress+'%'}"></view>
    </button>
    <AppTabBar active="courses" />
  </view>
</template>

<style scoped lang="scss">
.courses-page{--course-ink:#1d3048;--course-muted:#65748a;--course-blue:var(--sxb-blue,#3569e8);box-sizing:border-box;max-width:430px;min-height:100vh;margin:0 auto;padding:0 0 calc(112px + env(safe-area-inset-bottom,0px));background:#fff;color:var(--course-ink)}
.courses-page.with-resume{padding-bottom:calc(188px + env(safe-area-inset-bottom,0px))}
.course-masthead{position:relative;isolation:isolate;overflow:hidden;box-sizing:border-box;min-height:calc(184px + env(safe-area-inset-top,0px));padding:calc(26px + env(safe-area-inset-top,0px)) 22px 46px;background:linear-gradient(115deg,#eaf2ff 0%,#dcecff 48%,#d9f1e9 100%)}
.course-masthead::before{content:'';position:absolute;width:230px;height:230px;border:1px solid #ffffff80;border-radius:50%;right:-54px;top:-110px;pointer-events:none}
.course-masthead::after{content:'';position:absolute;width:140px;height:140px;left:-80px;bottom:-80px;border:18px solid #ffffff30;border-radius:50%;pointer-events:none}
.masthead-text{position:relative;z-index:1;width:55%;display:flex;flex-direction:column;align-items:flex-start;gap:6px}.page-title{font-size:27px;font-weight:750;letter-spacing:1px;line-height:1.4;color:#243d62}.page-subtitle{font-size:12px;line-height:1.6;color:#546c8d;overflow-wrap:anywhere}
.learning-caption{display:flex;align-items:center;gap:6px;margin-top:12px;padding:5px 9px;border:1px solid #ffffffb3;border-radius:20px;background:#ffffff80;color:#49668c;font-size:11px;line-height:1.5;white-space:nowrap}.caption-dot{width:5px;height:5px;border-radius:50%;background:#709fd6;flex:none}
.studio-illustration{position:absolute;width:46%;height:172px;right:0;bottom:12px;pointer-events:none}.studio-scene{position:absolute;width:100%;height:100%;inset:0;animation:studio-settle 4.8s ease-in-out both}.studio-audio{position:absolute;width:62px;height:56px;left:-4px;bottom:6px;animation:audio-settle 4.6s ease-in-out both}
@keyframes studio-settle{0%{opacity:0;transform:translateY(9px) rotate(-4deg)}18%,66%{opacity:1;transform:translateY(-3px) rotate(1deg)}42%,100%{opacity:1;transform:translateY(0) rotate(0)}}
@keyframes audio-settle{0%{opacity:0;transform:translateY(12px) rotate(-12deg)}22%,72%{opacity:1;transform:translateY(-4px) rotate(3deg)}46%,100%{opacity:1;transform:translateY(0) rotate(-5deg)}}
.catalog-navigation{position:relative;margin-top:-22px;padding:14px 8px 0;border-radius:24px 24px 0 0;background:#fff}.catalog-navigation :deep(.course-subject .tab-label){font-size:20px;font-weight:750}.catalog-navigation :deep(.course-subject.selected){color:var(--course-ink)}.catalog-navigation :deep(.selection-line){height:4px;border-radius:4px}.chapter-navigation{margin:12px 0 0}.chapter-navigation :deep(.tab-face){border-radius:20px;padding:6px 14px;background:#edf0f5}.chapter-navigation :deep(.selected .tab-face){background:#d9e9ff;color:#244f8d}
.chapter-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:23px 18px 17px}.chapter-heading>view{min-width:0;display:flex;flex-direction:column;gap:5px}.chapter-eyebrow{font-size:12px;letter-spacing:1px;color:var(--course-muted)}.chapter-title{font-size:17px;line-height:1.5;font-weight:700}.course-count{flex:none;color:var(--course-muted);font-size:12px}
.course-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:12px;row-gap:25px;padding:0 16px 16px}.course-card{display:block;min-width:0;width:100%;padding:0;margin:0;text-align:left;background:transparent;color:var(--course-ink);border:0;border-radius:14px;line-height:1.5;transition:opacity 150ms;cursor:pointer}.course-card::after,.resume-dock::after{border:0}.course-card:active{opacity:.72}.course-card:focus-visible,.resume-dock:focus-visible{outline:2px solid var(--course-blue);outline-offset:4px}.course-title{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;min-height:42px;margin:9px 1px 4px;font-size:14px;font-weight:650;line-height:1.5;overflow-wrap:anywhere}.course-meta{display:flex;flex-wrap:wrap;gap:4px 7px;font-size:12px;color:var(--course-muted);margin:0 1px}.study-progress{color:#316a91}
.course-state{padding:28px 20px;display:flex;flex-direction:column;align-items:center;gap:18px;font-size:14px;color:var(--course-muted);text-align:center}.course-state button{margin:0;padding:0 24px;border-radius:22px;background:#e4efff;color:#285ca3;font-size:14px;min-height:44px}.empty{padding-top:42px;padding-bottom:60px}.empty image{width:78px;height:78px;opacity:.7}.empty-hint{font-size:12px}.skeleton-tabs{width:100%;height:35px;background:#e8eef7;border-radius:12px}.skeleton-grid{display:grid;width:100%;grid-template-columns:1fr 1fr;gap:20px 12px}.skeleton-grid>view{height:136px;background:#e8eef7;border-radius:14px}.history-retry{margin:14px auto;background:transparent;color:var(--course-muted);font-size:12px;min-height:44px}.history-retry::after{border:0}
.resume-dock{box-sizing:border-box;position:fixed;z-index:21;left:50%;transform:translateX(-50%);bottom:calc(94px + env(safe-area-inset-bottom,0px));width:calc(100% - 32px);max-width:398px;min-height:67px;display:flex;align-items:center;gap:10px;margin:0;padding:9px 12px 10px 10px;border-radius:22px;border:1px solid #e0e9f7;background:#f4f8ff;box-shadow:0 8px 24px #2c52851c;text-align:left;line-height:1.4;overflow:hidden;cursor:pointer}.resume-copy{flex:1;min-width:0}.resume-label{display:flex;align-items:center;gap:8px;margin-bottom:4px;color:#3d669c;font-size:12px}.resume-label>text:last-child{color:var(--course-muted);font-size:12px}.resume-title{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--course-ink);font-size:13px;font-weight:650}.resume-action{width:34px;height:34px;flex:none;border-radius:50%;background:#e0ecfc;display:flex;align-items:center;justify-content:center}.resume-action image{width:26px;height:26px}.resume-progress{position:absolute;bottom:0;left:0;height:2px;background:#79a7e7;max-width:100%}
@media(prefers-reduced-motion:reduce){.course-card{transition:none}.studio-scene,.studio-audio{animation:none}}
@media(max-width:350px){.course-grid{gap:22px 10px;padding-left:12px;padding-right:12px}.course-title{font-size:13px}.resume-label{gap:4px}}
</style>
