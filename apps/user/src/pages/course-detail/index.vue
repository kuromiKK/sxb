<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad, onShow, onHide, onUnload } from '@dcloudio/uni-app'
import uniIcons from '@dcloudio/uni-ui/lib/uni-icons/uni-icons.vue'
import DebugMenu from '@/components/DebugMenu.vue'
import { backOrFallback } from '@/utils/navigation'
import { courseCatalog, knowledgeSubjects, type CourseLesson } from '@/mock/data'
import { useAppStore } from '@/store/app'
import { getFavoriteIds, setFavorite } from '@/utils/favorites'
import { getNoteBySource, saveNoteRecord } from '@/utils/notes'
import { applyCourseDebugAccount, canAccessCourse, courseDebugOptions, getCourseAccessLevel } from '@/utils/course-access'
import { api, writeRecord, showApiError, refreshRights } from '@/services/api'
import { refreshCatalog } from '@/services/catalog'
import VerificationGate from '@/components/VerificationGate.vue'
import {verifiedDownload,openDownload} from '@/utils/verified-download'
const verification=ref<InstanceType<typeof VerificationGate>>()

import { createLearningVisit } from '@/utils/learning-visit'
const visit=createLearningVisit()
onHide(()=>visit.leave())
onShow(()=>{if(pageReady.value)void visit.begin(courseId.value)})
onUnload(()=>visit.close())
const { state, login, logout, requireLogin } = useAppStore()
const courseId = ref(courseCatalog[0]?.id || '')
const note = ref('')
const noteSaved = ref(false)
const isPlaying = ref(false)
const completed = ref(false)
const downloaded = ref(false)
const favorite = ref(false)
const pageReady = ref(false)
const articleExpanded = ref(false)

const detailData=ref<Partial<CourseLesson>>({})
const course = computed<CourseLesson>(() => ({...(courseCatalog.find(item => item.id === courseId.value) || {id:courseId.value,progress:0,currentMinute:0} as CourseLesson),...detailData.value}))
const record = computed(() => {
  for (const subject of knowledgeSubjects) {
    const chapter = subject.chapters.find(item => item.id === course.value.chapterId)
    if (chapter) {
      const section = chapter.sections.find(item => item.id === course.value.sectionId)
      if (section) return { subject, chapter, section }
    }
  }
  return undefined
})
const knowledgePoints = computed(() => (record.value?.section.points || []).filter(point => !course.value.knowledgePointId || point.id === course.value.knowledgePointId))
const articleSections = computed<Array<{title:string;paragraphs:string[]}>>(() => (course.value as any).articleSections || [{title:course.value.sectionName,paragraphs:[course.value.intro || '课程内容待发布']}])
const mediaUrl = computed(() => String((course.value as any).mediaUrl || ''))
const courseBlocks = computed<any[]>(() => (course.value as any).blocks || [])
const coursePoster = computed(() => String((course.value as any).posterUrl || ''))
const mediaProgress = async (event:any) => {
  const seconds=Number(event.detail.currentTime)||0
  const duration=Number(event.detail.duration)||0
  visit.progress(seconds,duration)
  currentMinute.value=Math.floor(seconds/60)
  if(duration>0)courseProgress.value=Math.min(100,Math.round(seconds/duration*100))
}
const accessLevel = ref(getCourseAccessLevel())
const canAccess = computed(() => accessLevel.value === 'full' || (accessLevel.value === 'trial' && course.value.canTrial))
const currentIndex = computed(() => courseCatalog.findIndex(item => item.id === course.value.id))
const previousCourse = computed(() => currentIndex.value > 0 ? courseCatalog[currentIndex.value - 1] : undefined)
const nextCourse = computed(() => currentIndex.value >= 0 && currentIndex.value < courseCatalog.length - 1 ? courseCatalog[currentIndex.value + 1] : undefined)
const courseProgress = ref(course.value.progress)
const currentMinute = ref(course.value.currentMinute)
const completedStorageKey = 'sxb-completed-courses'
const loadCompletedCourseIds = () => {
  const stored = uni.getStorageSync(completedStorageKey)
  return Array.isArray(stored) ? stored as string[] : []
}
const markCurrentCourseCompleted = () => {
  const ids = loadCompletedCourseIds()
  if (!ids.includes(course.value.id)) uni.setStorageSync(completedStorageKey, [...ids, course.value.id])
  completed.value = true
  courseProgress.value = 100
}

onLoad(async (options) => {
  if (options?.id) courseId.value = decodeURIComponent(options.id)
  const currentUrl = `/pages/course-detail/index?id=${encodeURIComponent(course.value.id)}`
  if (!state.isLoggedIn) {
    requireLogin(currentUrl)
    return
  }
  try {
    await refreshCatalog()
    await refreshRights()
    const detail = await api(`/courses/${courseId.value}`)
    detailData.value=detail
  } catch (error) { showApiError(error); return }
  accessLevel.value = getCourseAccessLevel()
  if (!canAccess.value) {
    uni.reLaunch({
      url: '/pages/courses/index',
      success: () => uni.showToast({ title: '当前账号暂无该课程权限', icon: 'none' }),
    })
    return
  }
  const savedNote = getNoteBySource(courseId.value, 'course')?.content || uni.getStorageSync(`sxb-course-note-${courseId.value}`)
  note.value = typeof savedNote === 'string' ? savedNote : ''
  courseProgress.value = course.value.progress
  completed.value = course.value.completed || loadCompletedCourseIds().includes(course.value.id)
  if (completed.value) courseProgress.value = 100
  currentMinute.value = course.value.currentMinute
  const favorites = getFavoriteIds()
  favorite.value = favorites.includes(courseId.value)
  pageReady.value = true
  void visit.begin(courseId.value)
})

const typeIcon = (type: CourseLesson['type']) => type === 'video' ? 'videocam' : type === 'audio' ? 'sound' : 'compose'
const showToast = (title: string) => uni.showToast({ title, icon: 'none' })
const back = () => backOrFallback('/pages/courses/index')
const togglePlay = () => {
  showToast('课程媒体尚未上传，请联系内容管理员')
}
const seek = (event: any) => {
  const nextProgress = Number(event?.detail?.value || 0)
  courseProgress.value = nextProgress
  currentMinute.value = Math.round(course.value.totalMinutes * nextProgress / 100)
}
const saveNote = async () => {
  if (!state.isLoggedIn) {
    requireLogin(`/pages/course-detail/index?id=${encodeURIComponent(course.value.id)}`)
    return
  }
  if (!note.value.trim()) return showToast('请先填写笔记内容')
  await saveNoteRecord(course.value.id, 'course', note.value)
  noteSaved.value = true
  uni.showToast({ title: '课程笔记已保存', icon: 'success' })
  setTimeout(() => { noteSaved.value = false }, 1600)
}
const toggleFavorite = async () => {
  await setFavorite(courseId.value, 'course', !favorite.value)
  favorite.value = !favorite.value
  showToast(favorite.value ? '已收藏精讲课' : '已取消收藏')
}
const finishCourse = async () => {
  await writeRecord('courseProgress', course.value.id, { completed: true, progress: 100, minutes: currentMinute.value })
  markCurrentCourseCompleted()
  uni.showToast({ title: '已完成本节课程', icon: 'success' })
}
const openKnowledge = (pointId: string) => uni.navigateTo({ url: `/pages/knowledge-detail/index?id=${encodeURIComponent(pointId)}` })
const openCodeModal = async () => {
  if (!course.value.hasHandout) return
  try {
    const result=await verifiedDownload(verification.value!,(course.value as any).handoutDownloadPath||`/handouts/handout-${course.value.id}/download`)
    openDownload(result.url)
    downloaded.value=true
  } catch(error){showApiError(error)}
}
const goCourse = async (target?: CourseLesson, completeCurrent = false) => {
  if (!target) return
  if (!canAccessCourse(target.canTrial)) {
    showToast('当前账号暂无该课程权限')
    return
  }
  if (completeCurrent) await finishCourse()
  uni.redirectTo({ url: `/pages/course-detail/index?id=${encodeURIComponent(target.id)}` })
}
const applyDebug = (key: string) => {
  accessLevel.value = applyCourseDebugAccount(key, login, logout)
  const currentUrl = `/pages/course-detail/index?id=${encodeURIComponent(course.value.id)}`
  if (key === 'logged-out') {
    requireLogin(currentUrl)
    return
  }
  if (!canAccess.value) {
    uni.reLaunch({
      url: '/pages/courses/index',
      success: () => showToast('当前账号暂无该课程权限'),
    })
    return
  }
  showToast('精讲课账号状态已切换')
}
</script>

<template>
  <view v-if="pageReady" class="course-detail-page safe-top">
    <view class="detail-top"><button class="back-button" @tap="back"><uni-icons type="back" size="21" color="#4d5c73" /></button><text class="detail-top-title">精讲课</text><button class="favorite-button" :class="{ active: favorite }" @tap="toggleFavorite"><uni-icons :type="favorite ? 'star-filled' : 'star'" size="21" :color="favorite ? '#e98a3a' : '#8a96a7'" /></button></view>
    <view class="crumb"><text>{{ course.subjectName }}</text><uniIcons type="forward" size="13" color="#9ba6b5" /><text>第{{ course.chapterNo }}章</text><uniIcons type="forward" size="13" color="#9ba6b5" /><text>第{{ course.sectionNo }}节</text></view>

    <video v-if="mediaUrl&&course.type==='video'" :src="mediaUrl" :poster="coursePoster" controls style="width:100%;height:220px" @timeupdate="mediaProgress" @pause="visit.flush()" @ended="visit.flush();finishCourse()" />
    <audio v-else-if="mediaUrl&&course.type==='audio'" :src="mediaUrl" :name="course.sectionName" controls @timeupdate="mediaProgress" @pause="visit.flush()" @ended="visit.flush();finishCourse()" />
    <view v-else-if="course.type !== 'article'" class="media-panel" :class="`media-${course.type}`">
      <view class="media-visual"><view class="media-orbit"></view><view class="media-main-icon"><uni-icons :type="typeIcon(course.type)" size="35" color="#fff" /></view><text>{{ course.type === 'video' ? '视频精讲' : '音频精讲' }}</text></view><view class="media-controls"><text>00:{{ String(currentMinute).padStart(2, '0') }}</text><slider :value="courseProgress" min="0" max="100" activeColor="#f2b04f" backgroundColor="rgba(255,255,255,.24)" block-size="13" @change="seek" /><text>{{ course.totalMinutes }}:00</text><button class="media-play" @tap="togglePlay"><uniIcons :type="isPlaying ? 'pause' : 'play-filled'" size="16" color="#fff" /></button></view>
    </view>

    <view v-if="course.type !== 'article'" class="course-heading"><view class="course-title-row"><text class="course-title">第{{ course.sectionNo }}节 {{ course.sectionName }}</text><text class="course-status" :class="{ done: completed || courseProgress === 100 }">{{ completed || courseProgress === 100 ? '已完成' : courseProgress ? `已学 ${courseProgress}%` : '未开始' }}</text></view><text class="course-intro">{{ course.intro }}</text><view class="course-facts"><view><uniIcons type="clock" size="15" color="#7b8797" /><text>共 {{ course.totalMinutes }} 分钟</text></view><view><uniIcons :type="course.hasHandout ? 'paperclip' : 'closeempty'" size="15" :color="course.hasHandout ? '#3569e8' : '#9aa5b4'" /><text>{{ course.hasHandout ? '含配套讲义' : '暂无讲义' }}</text></view><view v-if="course.canTrial"><uniIcons type="flag" size="15" color="#e98a3a" /><text>可试听</text></view><view class="fact-type" :class="`type-${course.type}`"><uni-icons :type="typeIcon(course.type)" size="15" :color="course.type === 'video' ? '#3569e8' : '#d47a25'" /><text>{{ course.typeName }}</text></view></view></view>

    <view v-else class="article-card">
      <view class="article-course-head">
        <view class="article-label-line"><text>图文精讲</text></view>
        <view class="article-course-title-row"><text>第{{ course.sectionNo }}节 {{ course.sectionName }}</text><text class="course-status" :class="{ done: completed || courseProgress === 100 }">{{ completed || courseProgress === 100 ? '已完成' : courseProgress ? `已学 ${courseProgress}%` : '未开始' }}</text></view>
        <view class="article-facts"><view><uniIcons :type="course.hasHandout ? 'paperclip' : 'closeempty'" size="15" :color="course.hasHandout ? '#3569e8' : '#9aa5b4'" /><text>{{ course.hasHandout ? '含配套讲义' : '暂无讲义' }}</text></view><view v-if="course.canTrial"><uniIcons type="flag" size="15" color="#e98a3a" /><text>可试听</text></view></view>
      </view>
      <view class="article-visual"><view class="visual-axis"><view><text>原则</text><text>明确方向</text></view><uni-icons type="arrowright" size="18" color="#8d85cf" /><view><text>方法</text><text>落实行动</text></view><uni-icons type="arrowright" size="18" color="#8d85cf" /><view><text>成效</text><text>回应需要</text></view></view><text>从基本原则出发，连接政策要求与专业实践</text></view>
      <view class="article-body" :class="{ expanded: articleExpanded }">
        <template v-if="courseBlocks.length"><view v-for="(block,index) in courseBlocks" :key="index" class="article-section"><rich-text v-if="block.kind==='text'" :nodes="block.html"/><image v-else-if="block.kind==='image'&&block.url" :src="block.url" mode="widthFix" style="max-width:100%"/></view></template>
        <template v-else><view v-for="section in articleSections" :key="section.title" class="article-section"><text class="article-section-title">{{ section.title }}</text><text v-for="paragraph in section.paragraphs" :key="paragraph" class="article-paragraph">{{ paragraph }}</text></view></template>
        <view class="article-key"><uni-icons type="info" size="18" color="#d47a25" /><text>阅读时重点关注原则如何转化为具体服务行动，并留意题干中的政策方向、服务目标和实践边界。</text></view>
      </view>
      <view v-if="!articleExpanded" class="article-fade"></view>
      <button class="article-more" @tap="articleExpanded = !articleExpanded">{{ articleExpanded ? '收起全文' : '加载更多' }}<uni-icons :type="articleExpanded ? 'arrowup' : 'arrowdown'" size="17" color="#5b50b9" /></button>
    </view>

    <view class="detail-section"><view class="section-title-row"><view class="section-title"><view class="title-bar"></view><text>本节知识点</text></view><text class="section-hint">{{ knowledgePoints.length }} 个知识点</text></view><view class="knowledge-list"><view v-for="point in knowledgePoints" :key="point.id" class="knowledge-row" @tap="openKnowledge(point.id)"><view class="knowledge-copy"><text class="knowledge-name">{{ point.title }}</text><view class="knowledge-meta"><text class="star-tag" :class="`star-${point.stars}`">{{ point.stars }}星</text><text>包含 {{ point.questionTotal }} 题</text><text>掌握 {{ point.mastery }}%</text></view></view><uniIcons type="forward" size="17" color="#9aa5b4" /></view></view></view>

    <view class="note-section"><view class="section-title-row"><view class="section-title"><view class="title-bar orange"></view><text>课程笔记</text></view><text class="section-hint">记录本节课程的整体理解</text></view><textarea v-model="note" maxlength="1200" placeholder="写下老师强调的重点、自己的理解或复习提醒" placeholder-class="note-placeholder" /><view class="note-footer"><text>{{ note.length }} / 1200</text><button class="save-note" :class="{ saved: noteSaved }" @tap="saveNote"><uniIcons :type="noteSaved ? 'checkmarkempty' : 'compose'" size="15" color="#fff" />{{ noteSaved ? '已保存' : '保存笔记' }}</button></view></view>

    <view v-if="course.hasHandout" class="handout-card" @tap="openCodeModal"><view class="handout-icon"><uniIcons type="paperclip" size="22" color="#3569e8" /></view><view class="handout-copy"><text class="handout-title">配套讲义</text><text class="handout-name">{{ course.handoutName }}</text><text class="handout-meta">PDF · 验证后下载</text></view><view class="handout-action"><uniIcons :type="downloaded ? 'checkmarkempty' : 'download'" size="18" :color="downloaded ? '#1a9a7b' : '#3569e8'" /><text>{{ downloaded ? '已验证' : '下载' }}</text></view></view>
    <view v-else class="handout-empty"><uniIcons type="paperclip" size="17" color="#a2adbb" /><text>本节暂无配套讲义</text></view>

    <button class="finish-button" :class="{ done: completed || courseProgress === 100 }" @tap="finishCourse"><uniIcons :type="completed || courseProgress === 100 ? 'checkmarkempty' : 'flag'" size="17" color="#fff" />{{ completed || courseProgress === 100 ? '已完成本节课程' : '标记为已完成' }}</button>
    <view class="course-nav"><button class="previous-course" :disabled="!previousCourse" @tap="goCourse(previousCourse)"><uniIcons type="back" size="18" :color="previousCourse ? '#3569e8' : '#b8c0cd'" />上一节</button><button class="next-course" :disabled="!nextCourse" @tap="goCourse(nextCourse, true)">下一节<uniIcons type="forward" size="18" :color="nextCourse ? '#fff' : '#b8c0cd'" /></button></view>

    <VerificationGate ref="verification"/>
    <DebugMenu page="精讲课账号状态" :options="courseDebugOptions" @select="applyDebug" />
  </view>
</template>

<style lang="scss" scoped>
.course-detail-page { max-width: 430px; min-height: 100vh; margin: 0 auto; box-sizing: border-box; padding: calc(env(safe-area-inset-top) + 18rpx) 20px 42rpx; background: #f5f7fb; }.detail-top { display: flex; align-items: center; justify-content: space-between; height: 58rpx; }.back-button { width: 58rpx; height: 58rpx; display: flex; align-items: center; justify-content: center; margin: 0; padding: 0; background: #edf1fb; border: 0; border-radius: 15rpx; }.back-button::after { display: none; }.detail-top-title { color: #1e3048; font-size: var(--sxb-text-item); font-weight: 700; }.top-type { display: flex; align-items: center; gap: 4rpx; padding: 7rpx 9rpx; background: #eaf0ff; border-radius: 7rpx; color: #3569e8; font-size: var(--sxb-text-meta); font-weight: 700; }.top-type.type-audio { color: #cf7626; background: #fff2df; }.top-type.type-article { color: #6949df; background: #f0edff; }.crumb { display: flex; align-items: center; gap: 4rpx; margin-top: 18rpx; overflow: hidden; color: #8b96a5; font-size: var(--sxb-text-meta); white-space: nowrap; }.crumb text { overflow: hidden; text-overflow: ellipsis; }.media-panel { position: relative; overflow: hidden; min-height: 255rpx; margin-top: 17rpx; color: #fff; background: #1c3560; border-radius: 15rpx; box-shadow: 0 13rpx 28rpx rgba(35,56,102,.2); }.media-panel.media-audio { background: #8a542e; }.media-panel.media-article { background: #5442a2; }.media-visual { position: relative; height: 210rpx; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 9rpx; }.media-visual>text,.article-cover>text:nth-child(2) { font-size: var(--sxb-text-small); font-weight: 700; }.media-orbit { position: absolute; width: 170rpx; height: 170rpx; border: 2rpx solid rgba(255,255,255,.19); border-radius: 50%; box-shadow: 0 0 0 22rpx rgba(255,255,255,.06), 0 0 0 45rpx rgba(255,255,255,.035); }.media-main-icon { position: relative; z-index: 1; width: 65rpx; height: 65rpx; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,.16); border-radius: 20rpx; }.media-controls { height: 62rpx; display: flex; align-items: center; gap: 8rpx; padding: 0 15rpx; background: rgba(0,0,0,.15); color: #dbe5fb; font-size: var(--sxb-text-meta); }.media-controls slider { flex: 1; margin: 0; }.media-play { width: 38rpx; height: 38rpx; display: flex; align-items: center; justify-content: center; gap: 4rpx; margin: 0; padding: 0; color: #fff; background: #3569e8; border-radius: 50%; font-size: var(--sxb-text-meta); }.media-play::after { display: none; }.article-cover { height: 205rpx; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 9rpx; }.article-cover>text:last-child { color: #ddd8ff; font-size: var(--sxb-text-meta); }.article-play { position: absolute; right: 17rpx; bottom: 15rpx; width: auto; height: 43rpx; padding: 0 12rpx; background: #e98a3a; border-radius: 8rpx; }.media-lock { position: absolute; inset: 0; z-index: 5; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 8rpx; background: rgba(20,32,59,.86); }.media-lock text { color: #e8eefc; font-size: var(--sxb-text-small); }.media-lock button { height: 43rpx; line-height: 43rpx; margin: 3rpx 0 0; padding: 0 14rpx; color: #243753; background: #f2b04f; border-radius: 7rpx; font-size: var(--sxb-text-meta); font-weight: 700; }.media-lock button::after { display: none; }.course-heading { padding: 19rpx 2rpx 3rpx; }.course-title-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 9rpx; }.course-title { color: #1e3048; font-size: var(--sxb-text-title); line-height: 1.45; font-weight: 700; }.course-status { flex: none; padding: 5rpx 8rpx; color: #536b92; background: #eaf0ff; border-radius: 5rpx; font-size: var(--sxb-text-meta); }.course-status.done { color: #1a9a7b; background: #e8f7f1; }.course-intro { display: block; margin-top: 8rpx; color: #65758b; font-size: var(--sxb-text-small); line-height: 1.55; }.course-facts { display: flex; flex-wrap: wrap; gap: 10rpx; margin-top: 12rpx; color: #7b8797; font-size: var(--sxb-text-meta); }.course-facts text { display: flex; align-items: center; gap: 3rpx; }.detail-section,.note-section { margin-top: 17rpx; padding: 18rpx; background: #fff; border: 1rpx solid #e0e6f0; border-radius: 13rpx; box-shadow: 0 7rpx 19rpx rgba(51,74,115,.04); }.section-title-row { display: flex; align-items: center; justify-content: space-between; gap: 8rpx; }.section-title { display: flex; align-items: center; gap: 8rpx; color: #22354e; font-size: var(--sxb-text-body); font-weight: 700; }.title-bar { width: 5rpx; height: 24rpx; background: #3569e8; border-radius: 5rpx; }.title-bar.orange { background: #e98a3a; }.section-hint { color: #9aa5b4; font-size: var(--sxb-text-meta); }.knowledge-list { margin-top: 13rpx; border-top: 1rpx solid #edf0f5; }.knowledge-row { display: flex; align-items: flex-start; gap: 8rpx; padding: 14rpx 0; border-bottom: 1rpx solid #edf0f5; }.knowledge-row:last-child { border-bottom: 0; }.knowledge-copy { flex: 1; min-width: 0; }.knowledge-name { display: block; color: #30425c; font-size: var(--sxb-text-body); line-height: 1.55; }.knowledge-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 8rpx; margin-top: 7rpx; color: #8b96a5; font-size: var(--sxb-text-meta); }.star-tag { padding: 2rpx 7rpx; border-radius: 5rpx; font-size: var(--sxb-text-meta); font-weight: 700; }.star-1 { color: #6f7e91; background: #eef1f5; }.star-2 { color: #3d78b9; background: #eaf3ff; }.star-3 { color: #3569e8; background: #eaf0ff; }.star-4 { color: #6949df; background: #f0edff; }.star-5 { color: #d47a25; background: #fff2df; }.note-section textarea { width: 100%; min-height: 180rpx; box-sizing: border-box; margin-top: 14rpx; padding: 13rpx; color: #34475f; background: #fafbfe; border: 1rpx solid #e3e8f1; border-radius: 9rpx; font-size: var(--sxb-text-body); line-height: 1.6; }.note-placeholder { color: #a1acba; }.note-footer { display: flex; align-items: center; justify-content: space-between; margin-top: 10rpx; color: #a1aaba; font-size: var(--sxb-text-meta); }.save-note { width: 124rpx; height: 42rpx; display: flex; align-items: center; justify-content: center; gap: 4rpx; margin: 0; padding: 0; color: #fff; background: #3569e8; border-radius: 7rpx; font-size: var(--sxb-text-meta); font-weight: 700; }.save-note::after { display: none; }.save-note.saved { background: #1a9a7b; }.handout-card { display: flex; align-items: center; gap: 11rpx; margin-top: 16rpx; padding: 16rpx; background: #edf3ff; border: 1rpx solid #d7e4ff; border-radius: 12rpx; }.handout-icon { width: 44rpx; height: 44rpx; display: flex; align-items: center; justify-content: center; flex: none; background: #fff; border-radius: 11rpx; }.handout-copy { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3rpx; }.handout-title { color: #3569e8; font-size: var(--sxb-text-meta); font-weight: 700; }.handout-name { overflow: hidden; color: #30425c; font-size: var(--sxb-text-small); font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }.handout-meta { color: #8593a7; font-size: var(--sxb-text-meta); }.handout-action { display: flex; align-items: center; flex-direction: column; gap: 3rpx; color: #3569e8; font-size: var(--sxb-text-meta); font-weight: 700; }.handout-empty { display: flex; align-items: center; gap: 6rpx; margin-top: 16rpx; padding: 14rpx 16rpx; color: #9ba6b5; background: #f1f3f6; border-radius: 9rpx; font-size: var(--sxb-text-meta); }.finish-button { width: 100%; height: 56rpx; display: flex; align-items: center; justify-content: center; gap: 5rpx; margin: 18rpx 0 0; padding: 0; color: #fff; background: #3569e8; border-radius: 9rpx; font-size: var(--sxb-text-small); font-weight: 700; }.finish-button::after { display: none; }.finish-button.done { background: #1a9a7b; }.course-nav { display: flex; justify-content: space-between; gap: 10rpx; margin-top: 13rpx; }.course-nav button { flex: 1; height: 46rpx; display: flex; align-items: center; justify-content: center; gap: 4rpx; margin: 0; padding: 0; color: #536783; background: #fff; border: 1rpx solid #dfe6f0; border-radius: 8rpx; font-size: var(--sxb-text-meta); }.course-nav button::after { display: none; }.course-nav button[disabled] { color: #b3bdc9; background: #f1f3f6; }.modal-mask { position: fixed; z-index: 50; inset: 0; display: flex; align-items: center; justify-content: center; padding: 24px; background: rgba(16,28,51,.48); }.code-modal { width: 100%; box-sizing: border-box; padding: 21rpx; background: #fff; border-radius: 15rpx; box-shadow: 0 20rpx 46rpx rgba(25,42,76,.2); }.modal-title-row { display: flex; align-items: center; justify-content: space-between; }.modal-title-row>text { color: #22354e; font-size: var(--sxb-text-item); font-weight: 700; }.modal-title-row button { width: 38rpx; height: 38rpx; display: flex; align-items: center; justify-content: center; margin: 0; padding: 0; background: #f2f4f8; border-radius: 50%; }.modal-title-row button::after { display: none; }.modal-desc { display: block; margin-top: 12rpx; color: #748196; font-size: var(--sxb-text-small); line-height: 1.5; }.code-display { display: flex; align-items: center; justify-content: space-between; margin-top: 16rpx; padding: 13rpx 15rpx; background: #f0f3ff; border: 1rpx solid #dce6ff; border-radius: 9rpx; }.code-display>text { color: #3569e8; font-size: var(--sxb-text-heading); letter-spacing: 0; font-weight: 700; }.code-display button { height: 34rpx; line-height: 34rpx; margin: 0; padding: 0 8rpx; color: #3569e8; background: #fff; border-radius: 6rpx; font-size: var(--sxb-text-meta); }.code-display button::after { display: none; }.code-modal input { width: 100%; height: 75rpx; box-sizing: border-box; margin-top: 13rpx; padding: 0 14rpx; color: #34475f; background: #fafbfe; border: 1rpx solid #dfe6f0; border-radius: 9rpx; font-size: var(--sxb-text-body); }.code-placeholder { color: #a1acba; }.verify-button { width: 100%; height: 58rpx; line-height: 58rpx; margin: 15rpx 0 0; padding: 0; color: #fff; background: linear-gradient(100deg,#3569e8,#6949df); border-radius: 9rpx; font-size: var(--sxb-text-body); font-weight: 700; }.verify-button::after { display: none; }
.course-facts > view { display: flex; align-items: center; gap: 3rpx; }
.course-detail-page { padding-bottom: calc(150rpx + env(safe-area-inset-bottom)); }
.detail-top-title { font-size: var(--sxb-text-title); }
.top-type { font-size: var(--sxb-text-small); }
.crumb { font-size: var(--sxb-text-small); }
.media-panel { min-height: 335rpx; }
.media-visual { height: 273rpx; }
.article-cover { height: 267rpx; }
.media-visual > text,
.article-cover > text:nth-child(2) { font-size: var(--sxb-text-body); }
.media-main-icon { width: 72rpx; height: 72rpx; }
.media-controls { font-size: var(--sxb-text-small); }
.course-title { font-size: var(--sxb-text-title); }
.course-status { font-size: var(--sxb-text-small); }
.course-intro { margin-top: 10rpx; font-size: var(--sxb-text-body); line-height: 1.7; }
.course-facts { font-size: var(--sxb-text-small); }
.section-title { font-size: var(--sxb-text-item); }
.section-hint { color: #7f8da1; font-size: var(--sxb-text-body); }
.knowledge-row { padding: 17rpx 0; }
.knowledge-name { font-size: var(--sxb-text-item); line-height: 1.6; }
.knowledge-meta { gap: 10rpx; margin-top: 9rpx; color: #718197; font-size: var(--sxb-text-body); }
.star-tag { padding: 3rpx 8rpx; font-size: var(--sxb-text-small); }
.note-section textarea { font-size: var(--sxb-text-body); }
.note-footer { font-size: var(--sxb-text-small); }
.save-note { font-size: var(--sxb-text-small); }
.handout-title { font-size: var(--sxb-text-small); }
.handout-name { font-size: var(--sxb-text-body); }
.handout-meta,
.handout-action { font-size: var(--sxb-text-small); }
.finish-button { font-size: var(--sxb-text-body); }
.course-nav { position: fixed; z-index: 40; left: 50%; bottom: 0; width: 100%; max-width: 430px; box-sizing: border-box; gap: 12rpx; margin: 0; padding: 13rpx 20px calc(13rpx + env(safe-area-inset-bottom)); transform: translateX(-50%); background: #fff; border-top: 1rpx solid #dfe5ee; box-shadow: 0 -8rpx 24rpx rgba(36,54,79,.1); }
.course-nav button { height: 62rpx; font-size: var(--sxb-text-body); }
.course-nav .previous-course { color:#3569e8; background:#eef3ff; border:1rpx solid #cddcff; font-weight:700; }
.course-nav .next-course { color:#fff; background:linear-gradient(110deg,#3569e8,#4f55b7); border:1rpx solid #4561c9; font-weight:700; box-shadow:0 7rpx 16rpx rgba(53,75,176,.18); }
.course-nav .previous-course[disabled],.course-nav .next-course[disabled] { color:#b8c0cd; background:#eef1f5; border-color:#dfe4eb; box-shadow:none; opacity:1; }
.favorite-button { width:58rpx; height:58rpx; display:flex; align-items:center; justify-content:center; margin:0; padding:0; background:#fff; border:1rpx solid #e0e6f0; border-radius:15rpx; }
.favorite-button::after { display:none; }
.favorite-button.active { background:#fff4e6; border-color:#f8d5a7; }
.fact-type { padding:3rpx 7rpx; color:#3569e8; background:#eaf0ff; border-radius:5rpx; font-weight:700; }
.fact-type.type-audio { color:#cf7626; background:#fff2df; }
.fact-type.type-article { color:#6949df; background:#f0edff; }
.article-card { position:relative; overflow:hidden; margin-top:16rpx; padding:20rpx 18rpx 15rpx; background:#fff; border:1rpx solid #dfe4ee; border-radius:12rpx; box-shadow:0 8rpx 22rpx rgba(43,58,91,.06); }
.article-course-head { padding-top:10rpx; }
.article-label-line { color:#6949df; font-size:var(--sxb-text-body); font-weight:700; }
.article-course-title-row { display:flex; align-items:flex-start; justify-content:space-between; gap:10rpx; margin-top:11rpx; }
.article-course-title-row>text:first-child { min-width:0; color:#1e3048; font-size:var(--sxb-text-title); line-height:1.5; font-weight:700; }
.article-facts { display:flex; align-items:center; flex-wrap:wrap; gap:10rpx; margin-top:10rpx; color:#7b8797; font-size:var(--sxb-text-small); }
.article-facts>view { display:flex; align-items:center; gap:3rpx; }
.article-visual { margin-top:18rpx; padding:18rpx 13rpx 14rpx; background:linear-gradient(135deg,#f0edff,#edf3ff); border:1rpx solid #ddd9f7; border-top-color:#e8e5f7; border-radius:9rpx; }
.article-course-head + .article-visual { padding-top:20rpx; border-top:1rpx solid #e4e7ee; }
.visual-axis { display:flex; align-items:center; justify-content:space-between; gap:5rpx; }
.visual-axis>view { min-width:0; display:flex; align-items:center; flex:1; flex-direction:column; gap:4rpx; padding:10rpx 4rpx; background:#fff; border:1rpx solid #dddff3; border-radius:7rpx; }
.visual-axis>view text:first-child { color:#51459d; font-size:var(--sxb-text-small); font-weight:700; }
.visual-axis>view text:last-child { color:#78849a; font-size:var(--sxb-text-meta); }
.article-visual>text { display:block; margin-top:12rpx; color:#66748b; font-size:var(--sxb-text-meta); text-align:center; }
.article-body { max-height:570rpx; overflow:hidden; transition:max-height .25s ease; }
.article-body.expanded { max-height:5000rpx; }
.article-section { padding-top:20rpx; }
.article-section-title { display:block; color:#223650; font-size:var(--sxb-text-body); font-weight:700; }
.article-paragraph { display:block; margin-top:11rpx; color:#465a73; font-size:var(--sxb-text-body); line-height:1.9; text-align:justify; }
.article-key { display:flex; align-items:flex-start; gap:8rpx; margin-top:21rpx; padding:14rpx; color:#74562f; background:#fff7e9; border-left:5rpx solid #e5a344; border-radius:7rpx; font-size:var(--sxb-text-small); line-height:1.7; }
.article-fade { position:absolute; z-index:1; right:0; bottom:59rpx; left:0; height:100rpx; pointer-events:none; background:linear-gradient(180deg,rgba(255,255,255,0),#fff 82%); }
.article-more { position:relative; z-index:2; width:100%; height:50rpx; display:flex; align-items:center; justify-content:center; gap:5rpx; margin:9rpx 0 0; padding:0; color:#5b50b9; background:#f2f0ff; border:1rpx solid #ded9fb; border-radius:8rpx; font-size:var(--sxb-text-small); font-weight:700; }
.article-more::after { display:none; }
.section-hint { font-size:var(--sxb-text-meta); }
.knowledge-row { padding:14rpx 0; }
.knowledge-name { font-size:var(--sxb-text-body); line-height:1.65; }
.knowledge-meta { gap:11rpx; margin-top:11rpx; color:#8b96a5; font-size:var(--sxb-text-meta); }
.star-tag { padding:2rpx 7rpx; font-size:var(--sxb-text-meta); line-height:1.3; }

@import '@/styles/content-system.scss';
</style>
