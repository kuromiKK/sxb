<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad, onShow, onHide, onUnload } from '@dcloudio/uni-app'
import KnowledgeReading from '@/components/KnowledgeReading.vue'
import uniIcons from '@dcloudio/uni-ui/lib/uni-icons/uni-icons.vue'
import { backOrFallback } from '@/utils/navigation'
import { courseCatalog, knowledgeSubjects, type CourseLesson, type KnowledgePoint } from '@/mock/data'
import { useAppStore } from '@/store/app'
import { hasFullCourseAccess } from '@/utils/course-access'
import { getFavoriteIds, setFavorite } from '@/utils/favorites'
import { getNoteBySource, saveNoteRecord } from '@/utils/notes'
import { api, token, selectedExamId, showApiError } from '@/services/api'

import { createLearningVisit } from '@/utils/learning-visit'
const visit=createLearningVisit()
onUnload(()=>visit.close())
onHide(()=>visit.leave())
const pointId = ref('kp-1-1-1')
const favorite = ref(false)
const note = ref('')
const saved = ref(false)
const { requireLogin } = useAppStore()

const allPoints = computed(() => knowledgeSubjects.flatMap(subject => subject.chapters.flatMap(chapter => chapter.sections.flatMap(section => section.points.map(point => ({ point, subject, chapter, section }))))))
const record = computed(() => allPoints.value.find(item => item.point.id === pointId.value))
const point = computed<KnowledgePoint>(() => record.value?.point as KnowledgePoint)
const currentIndex = computed(() => allPoints.value.findIndex(item => item.point.id === pointId.value))
const hasPrevious = computed(() => currentIndex.value > 0)
const hasNext = computed(() => currentIndex.value >= 0 && currentIndex.value < allPoints.value.length - 1)
const relatedCourses = computed(() => courseCatalog.filter(course => course.knowledgePointId === pointId.value || (course.sectionId === record.value?.section.id && !course.knowledgePointId)))
const practiceProgress = computed(() => point.value.questionTotal
  ? Math.min(Math.round(point.value.questionDone / point.value.questionTotal * 100), 100)
  : 0)
const richContent=ref<any>(),contentBusy=ref(false),contentError=ref('')
async function loadContent(){
  const current=pointId.value,wasLoggedIn=Boolean(token())
  richContent.value=null;contentError.value='';contentBusy.value=true
  try{
    const path=`/knowledge-content/${encodeURIComponent(current)}`
    let result:any
    try{result=await api(`${path}${wasLoggedIn?'/member':''}`)}catch(error){if(wasLoggedIn&&!token())result=await api(path);else throw error}
    if(pointId.value===current){richContent.value=result;void visit.begin(current)}
  }catch(e:any){if(pointId.value===current)contentError.value=e.message}finally{if(pointId.value===current)contentBusy.value=false}
}
onShow(()=>{void loadContent()})

onLoad((options) => {
  if (options?.id) pointId.value = decodeURIComponent(options.id)
  loadPointState()
})
const back = () => backOrFallback('/pages/knowledge/index')
function loadPointState() {
  favorite.value = getFavoriteIds().includes(pointId.value)
  note.value = getNoteBySource(pointId.value, 'knowledge')?.content || uni.getStorageSync(`sxb-knowledge-note-${pointId.value}`) || ''
  saved.value = false
}
const showPoint = (index: number) => {
  const target = allPoints.value[index]
  if (!target) return
  pointId.value = target.point.id
  void loadContent()
  loadPointState()
  uni.pageScrollTo({ scrollTop: 0, duration: 180 })
}
const previousPoint = () => { if (hasPrevious.value) showPoint(currentIndex.value - 1) }
const nextPoint = () => {
  if (hasNext.value) showPoint(currentIndex.value + 1)
  else back()
}
const openRecite = () => uni.navigateTo({ url: `/pages/recite-detail/index?id=${encodeURIComponent(pointId.value)}` })
const openPractice = () => {
  if (!point.value.questionTotal) return
  const returnUrl = `/pages/knowledge-detail/index?id=${encodeURIComponent(pointId.value)}`
  uni.navigateTo({ url: `/pages/practice-session/index?knowledgePointId=${encodeURIComponent(pointId.value)}&returnUrl=${encodeURIComponent(returnUrl)}` })
}
const openCourse = (course: CourseLesson) => {
  const url = `/pages/course-detail/index?id=${encodeURIComponent(course.id)}`
  if (!requireLogin(url)) return
  if (!hasFullCourseAccess()) {
    return uni.showModal({ title: '当前权限不足', content: '学习此课程需要当前考试的对应权益，可前往查看在售套餐。', confirmText: '查看套餐', success: result => { if (result.confirm) uni.navigateTo({ url: '/pages/products/index' }) } })
  }
  uni.navigateTo({ url })
}
const toggleFavorite = async () => {
  await setFavorite(pointId.value, 'knowledge', !favorite.value)
  favorite.value = !favorite.value
  uni.showToast({ title: favorite.value ? '已收藏知识点' : '已取消收藏', icon: 'none' })
}
const saveNote = async () => { if (!note.value.trim()) return uni.showToast({ title: '请先填写笔记内容', icon: 'none' }); await saveNoteRecord(pointId.value, 'knowledge', note.value); saved.value = true; uni.showToast({ title: '笔记已保存', icon: 'success' }); setTimeout(() => { saved.value = false }, 1600) }
</script>

<template>
  <view v-if="record" class="detail-page safe-top">
    <view class="detail-top"><button class="back-button" @tap="back"><uni-icons type="back" size="21" color="#4d5c73" /></button><text class="detail-top-title">知识点详情</text><button class="favorite-button" :class="{ active: favorite }" @tap="toggleFavorite"><uni-icons :type="favorite ? 'star-filled' : 'star'" size="21" :color="favorite ? '#e98a3a' : '#8a96a7'" /></button></view>
    <KnowledgeReading :title="point.title" :path="[record.subject.name,`第${record.chapter.no}章`,`第${record.section.no}节`]" :stars="point.stars" :mastery="point.mastery" :question-total="point.questionTotal" :question-done="point.questionDone" :blocks="richContent?.blocks" :busy="contentBusy" :error="contentError" :heading="richContent?.isKnowledgeCourse?'知识点课程':'知识点内容'" @retry="loadContent"/>
    <view class="extension-card">
      <view class="extension-title"><text>学习延伸</text><text>继续巩固本知识点</text></view>
      <view class="extension-row practice-row" :class="{ disabled: !point.questionTotal }" @tap="openPractice"><view class="extension-icon practice"><uni-icons type="compose" size="20" :color="point.questionTotal ? '#3569e8' : '#9aa5b4'" /></view><view class="extension-copy practice-copy"><view class="practice-copy-head"><text>本知识点刷题</text><text v-if="point.questionTotal">{{ practiceProgress }}%</text></view><text class="practice-meta">{{ point.questionTotal ? `已完成 ${point.questionDone} / 共 ${point.questionTotal} 题` : '本知识点无题' }}</text><view v-if="point.questionTotal" class="practice-progress"><view :style="{ width: `${practiceProgress}%` }"></view></view></view><uni-icons v-if="point.questionTotal" type="forward" size="18" color="#8a96a7" /></view>
      <view v-if="point.content?.trim()" class="extension-row recite-row" @tap="openRecite"><view class="extension-icon recite"><uni-icons type="flag" size="20" color="#9a6a1d" /></view><view class="extension-copy"><text>背诵本篇</text><text>智能挖空关键内容，强化主动记忆</text></view><uni-icons type="forward" size="18" color="#8a96a7" /></view>
      <view v-for="course in relatedCourses" :key="course.id" class="extension-row course-row" @tap="openCourse(course)"><view class="extension-icon course"><uni-icons :type="course.type === 'video' ? 'videocam' : course.type === 'audio' ? 'sound' : 'compose'" size="20" color="#6b55c5" /></view><view class="extension-copy"><text>{{ course.knowledgePointId ? '知识点配套课' : '本节精品课' }} · {{ course.title }}</text><text>{{ course.typeName }}{{ course.type === 'article' ? '' : ' · ' + course.totalMinutes + '分钟' }}{{course.hasHandout?' · 含讲义':''}}</text></view><uni-icons type="forward" size="18" color="#8a96a7" /></view>
    </view>
    <view class="note-card"><view class="card-title-row"><view class="card-title"><view class="title-bar orange"></view><text>我的笔记</text></view><text class="content-hint">写下你的理解和易错提醒</text></view><textarea v-model="note" maxlength="1000" placeholder="在这里记录这个知识点的记忆方法、易错点或补充内容" placeholder-class="note-placeholder" /><view class="note-footer"><text>{{ note.length }} / 1000</text><button class="save-note" :class="{ saved }" @tap="saveNote"><uni-icons :type="saved ? 'checkmarkempty' : 'compose'" size="15" color="#fff" />{{ saved ? '已保存' : '保存笔记' }}</button></view></view>
    <view class="point-navigation">
      <button class="previous-button" :disabled="!hasPrevious" @tap="previousPoint"><uni-icons type="back" size="18" :color="hasPrevious ? '#52617b' : '#b8c0cd'" /><text>上一知识点</text></button>
      <button class="next-button" @tap="nextPoint"><text>{{ hasNext ? '下一知识点' : '返回知识图谱' }}</text><uni-icons :type="hasNext ? 'forward' : 'map'" size="18" color="#fff" /></button>
    </view>
  </view>
  <view v-else class="missing-point"><text>知识点不存在，或当前考试内容尚未加载。</text><button @tap="back">返回知识图谱</button></view>
</template>

<style lang="scss" scoped>
.missing-point { max-width:430px; margin:auto; padding:64px 24px; font-size:16px; line-height:1.8; text-align:center; color:#52647c; }.missing-point button { margin-top:24px; font-size:16px; color:#3569e8; }
.detail-page { max-width: 430px; min-height: 100vh; margin: 0 auto; box-sizing: border-box; padding: calc(env(safe-area-inset-top) + 18rpx) 20px 42rpx; background: #f5f7fb; }.detail-top { display: flex; align-items: center; justify-content: space-between; height: 58rpx; }.back-button,.favorite-button { width: 58rpx; height: 58rpx; display: flex; align-items: center; justify-content: center; margin: 0; padding: 0; background: #edf1fb; border: 0; border-radius: 15rpx; }.back-button::after,.favorite-button::after { display: none; }.favorite-button { background: #fff; border: 1rpx solid #e0e6f0; }.favorite-button.active { background: #fff4e6; border-color: #f8d5a7; }.detail-top-title { color: #1e3048; font-size: var(--sxb-text-item); font-weight: 700; }.crumb { display: flex; align-items: center; gap: 4rpx; margin-top: 18rpx; overflow: hidden; color: #8b96a5; font-size: var(--sxb-text-meta); white-space: nowrap; }.crumb text { overflow: hidden; text-overflow: ellipsis; }.point-hero { margin-top: 17rpx; padding: 22rpx; color: #fff; background: linear-gradient(135deg,#1d3558 0%,#3a4b93 100%); border-radius: 15rpx; box-shadow: 0 12rpx 26rpx rgba(43,58,113,.18); }.hero-top { display: flex; align-items: flex-start; gap: 12rpx; }.hero-icon { width: 48rpx; height: 48rpx; display: flex; align-items: center; justify-content: center; flex: none; background: rgba(255,255,255,.14); border-radius: 13rpx; }.hero-title-wrap { flex: 1; min-width: 0; }.hero-title { display: block; color: #fff; font-size: var(--sxb-text-item); line-height: 1.5; font-weight: 700; }.hero-tags { display: flex; align-items: center; gap: 7rpx; margin-top: 9rpx; }.star-tag,.mastery-tag { display: inline-block; padding: 4rpx 8rpx; border-radius: 5rpx; font-size: var(--sxb-text-meta); line-height: 1.25; font-weight: 700; }.star-tag { color: #d47a25; background: #fff2df; }.mastery-tag { color: #d8e4ff; background: rgba(255,255,255,.12); }.hero-stats { display: grid; grid-template-columns: repeat(3,1fr); margin-top: 20rpx; padding-top: 17rpx; border-top: 1rpx solid rgba(255,255,255,.15); }.hero-stats view { display: flex; flex-direction: column; align-items: center; gap: 4rpx; border-right: 1rpx solid rgba(255,255,255,.14); }.hero-stats view:last-child { border-right: 0; }.hero-stats text:first-child { font-size: var(--sxb-text-title); font-weight: 700; }.hero-stats text:last-child { color: #becbe2; font-size: var(--sxb-text-meta); }.content-card,.note-card { margin-top: 16rpx; padding: 19rpx; background: #fff; border: 1rpx solid #e0e6f0; border-radius: 13rpx; box-shadow: 0 7rpx 19rpx rgba(51,74,115,.04); }.card-title-row { display: flex; align-items: center; justify-content: space-between; gap: 8rpx; }.card-title { display: flex; align-items: center; gap: 8rpx; color: #22354e; font-size: var(--sxb-text-body); font-weight: 700; }.title-bar { width: 5rpx; height: 24rpx; background: #3569e8; border-radius: 5rpx; }.title-bar.orange { background: #e98a3a; }.content-hint { color: #a0aaba; font-size: var(--sxb-text-meta); }.content-text { display: block; margin-top: 15rpx; color: #4b5c72; font-size: var(--sxb-text-body); line-height: 1.75; }.key-line { display: flex; align-items: flex-start; gap: 6rpx; margin-top: 14rpx; padding: 10rpx 11rpx; color: #8a622b; background: #fff8ed; border-radius: 7rpx; font-size: var(--sxb-text-small); line-height: 1.45; }.course-card { display: flex; align-items: center; gap: 11rpx; margin-top: 16rpx; padding: 16rpx; background: #f0edff; border: 1rpx solid #ded7ff; border-radius: 12rpx; }.course-icon { width: 43rpx; height: 43rpx; display: flex; align-items: center; justify-content: center; flex: none; background: #fff; border-radius: 11rpx; }.course-copy { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3rpx; }.course-label { color: #7969c5; font-size: var(--sxb-text-meta); }.course-title { overflow: hidden; color: #3e347f; font-size: var(--sxb-text-body); font-weight: 700; white-space: nowrap; text-overflow: ellipsis; }.course-meta { color: #8378b4; font-size: var(--sxb-text-meta); }.note-card textarea { width: 100%; min-height: 170rpx; box-sizing: border-box; margin-top: 15rpx; padding: 13rpx; color: #34475f; background: #fafbfe; border: 1rpx solid #e3e8f1; border-radius: 9rpx; font-size: var(--sxb-text-body); line-height: 1.6; }.note-placeholder { color: #a1acba; }.note-footer { display: flex; align-items: center; justify-content: space-between; margin-top: 11rpx; color: #a1aaba; font-size: var(--sxb-text-meta); }.save-note { width: 124rpx; height: 42rpx; display: flex; align-items: center; justify-content: center; gap: 4rpx; margin: 0; padding: 0; color: #fff; background: #3569e8; border-radius: 7rpx; font-size: var(--sxb-text-meta); font-weight: 700; }.save-note::after { display: none; }.save-note.saved { background: #1a9a7b; }.detail-tip { display: flex; align-items: flex-start; gap: 6rpx; margin-top: 17rpx; padding: 11rpx 12rpx; color: #64758b; background: #edf3ff; border-radius: 8rpx; font-size: var(--sxb-text-meta); line-height: 1.45; }
.content-text + .content-text { margin-top: 13rpx; }
.extension-card { margin-top:16rpx; padding:0 17rpx; background:#fff; border:1rpx solid #e0e6f0; border-radius:12rpx; box-shadow:0 7rpx 19rpx rgba(51,74,115,.04); }
.extension-title { display:flex; align-items:baseline; justify-content:space-between; gap:10rpx; padding:16rpx 1rpx 12rpx; border-bottom:1rpx solid #edf0f5; }
.extension-title text:first-child { color:#22354e; font-size:var(--sxb-text-body); font-weight:700; }
.extension-title text:last-child { color:#99a4b3; font-size:var(--sxb-text-meta); }
.extension-row { min-height:78rpx; display:flex; align-items:center; gap:11rpx; padding:13rpx 1rpx; border-bottom:1rpx solid #edf0f5; }
.extension-row:last-child { border-bottom:0; }
.extension-icon { width:45rpx; height:45rpx; display:flex; align-items:center; justify-content:center; flex:none; border-radius:11rpx; }
.extension-icon.practice { background:#eaf0ff; border:1rpx solid #d3dfff; }
.extension-icon.recite { background:#fff4dc; border:1rpx solid #f4dfb3; }
.extension-icon.course { background:#f0edff; border:1rpx solid #ded7ff; }
.extension-copy { display:flex; flex:1; min-width:0; flex-direction:column; gap:5rpx; }
.extension-copy text:first-child { color:#2a3c54; font-size:var(--sxb-text-body); font-weight:700; }
.practice-row .extension-copy text:first-child { color:#315fb8; }
.practice-copy-head { display:flex; align-items:center; justify-content:space-between; gap:10rpx; }
.practice-copy-head text:last-child { color:#3569e8; font-size:var(--sxb-text-meta); font-weight:700; }
.practice-copy .practice-meta { overflow:hidden; color:#7f8c9d; font-size:var(--sxb-text-meta); font-weight:400; text-overflow:ellipsis; white-space:nowrap; }
.practice-progress { width:100%; height:5rpx; overflow:hidden; margin-top:2rpx; background:#e4e9f2; border-radius:5rpx; }
.practice-progress view { height:100%; background:linear-gradient(90deg,#3569e8,#7655df); border-radius:5rpx; }
.recite-row .extension-copy text:first-child { color:#7f581b; }
.course-row .extension-copy text:first-child { color:#5745a8; }
.extension-copy text:last-child { overflow:hidden; color:#7f8c9d; font-size:var(--sxb-text-meta); text-overflow:ellipsis; white-space:nowrap; }
.extension-row.disabled .extension-copy text:first-child,.extension-row.disabled .extension-copy text:last-child { color:#9aa5b4; }
.extension-row.disabled .extension-icon.practice { background:#f0f2f6; border-color:#e0e4ea; }
.detail-page { padding-bottom:calc(env(safe-area-inset-bottom) + 150rpx); }
.point-navigation { position:fixed; z-index:20; left:50%; bottom:0; width:min(430px,100%); box-sizing:border-box; display:grid; grid-template-columns:1fr 1.18fr; gap:10rpx; padding:14rpx 20px calc(env(safe-area-inset-bottom) + 14rpx); background:rgba(245,247,251,.96); border-top:1rpx solid #dfe5ef; box-shadow:0 -10rpx 26rpx rgba(33,48,74,.08); transform:translateX(-50%); backdrop-filter:blur(10px); }
.point-navigation button { height:62rpx; display:flex; align-items:center; justify-content:center; gap:6rpx; margin:0; padding:0 12rpx; border-radius:9rpx; font-size:var(--sxb-text-small); font-weight:700; }
.point-navigation button::after { display:none; }
.previous-button { color:#52617b; background:#fff; border:1rpx solid #dce3ed; }
.previous-button[disabled] { color:#b8c0cd; background:#eef1f5; opacity:1; }
.next-button { color:#fff; background:linear-gradient(110deg,#3569e8,#4f55b7); border:1rpx solid #4561c9; box-shadow:0 7rpx 16rpx rgba(53,75,176,.18); }
.course-card { padding: 19rpx 17rpx; color: #fff; background: linear-gradient(135deg,#5d4bd1 0%,#3f4eaa 100%); border-color: #5849c8; box-shadow: 0 10rpx 22rpx rgba(77,70,184,.22); }.course-icon { background: rgba(255,255,255,.16); }.course-label { color: #d8d7ff; }.course-title { color: #fff; }.course-meta { color: #d1d8f7; }.course-cta { display: flex; align-items: center; gap: 3rpx; flex: none; color: #fff; font-size: var(--sxb-text-meta); font-weight: 700; }
.course-card.disabled { color: #738198; background: #f0f2f6; border-color: #dfe4eb; box-shadow: none; }.course-card.disabled .course-icon { background: #e0e5ec; }.course-card.disabled .course-label,.course-card.disabled .course-title,.course-card.disabled .course-meta,.course-card.disabled .course-cta { color: #8995a5; }

@import '@/styles/content-system.scss';
</style>
