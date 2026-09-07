<script setup lang="ts">
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import uniIcons from '@dcloudio/uni-ui/lib/uni-icons/uni-icons.vue'
import AppTabBar from '@/components/AppTabBar.vue'
import DebugMenu from '@/components/DebugMenu.vue'
import { courseCatalog, knowledgeSubjects, type CourseLesson } from '@/mock/data'
import { useAppStore } from '@/store/app'
import { applyCourseDebugAccount, canAccessCourse, courseDebugOptions, getCourseAccessLevel } from '@/utils/course-access'

const { state, exam, login, logout, requireLogin } = useAppStore()
const selectedSubjectId = ref(knowledgeSubjects[0]?.id || '')
const expandedChapterId = ref(knowledgeSubjects[0]?.chapters[0]?.id || '')
const promoExpanded = ref(true)
const accessLevel = ref(getCourseAccessLevel())
const hasFullAccess = computed(() => accessLevel.value === 'full')

const selectedSubject = computed(() => knowledgeSubjects.find(subject => subject.id === selectedSubjectId.value) || knowledgeSubjects[0])
const selectedCourseMap = computed(() => new Map(courseCatalog.filter(course => course.subjectId === selectedSubjectId.value).map(course => [course.sectionId, course])))
const continueCourse = computed(() => courseCatalog.find(course => course.progress > 0 && !course.completed) || courseCatalog[0])
const showAccessPromo = computed(() => !state.isLoggedIn || !hasFullAccess.value)

onShow(() => {
  state.selectedTab = 2
  accessLevel.value = getCourseAccessLevel()
})

const typeIcon = (type: CourseLesson['type']) => type === 'video' ? 'videocam' : type === 'audio' ? 'sound' : 'compose'
const typeClass = (type: CourseLesson['type']) => `type-${type}`
const formatProgress = (course: CourseLesson) => course.completed ? '已完成' : course.progress ? `已学 ${course.progress}%` : '未开始'
const showToast = (title: string) => uni.showToast({ title, icon: 'none' })

const selectSubject = (id: string) => {
  selectedSubjectId.value = id
  expandedChapterId.value = knowledgeSubjects.find(subject => subject.id === id)?.chapters[0]?.id || ''
}
const toggleChapter = (id: string) => { expandedChapterId.value = expandedChapterId.value === id ? '' : id }
const openPurchasePage = () => uni.navigateTo({ url: '/pages/profile-center/index?mode=rights' })
const openTrialPurchase = () => {
  if (!state.isLoggedIn) {
    requireLogin('/pages/courses/index')
    return
  }
  uni.showModal({ title: '1元体验', content: '登录后可用 1 元解锁 24 小时 VIP 体验。', confirmText: '去体验', success: result => { if (result.confirm) showToast('体验购买页即将开放') } })
}
const openFullPurchase = () => {
  if (!state.isLoggedIn) {
    requireLogin('/pages/courses/index')
    return
  }
  openPurchasePage()
}
const showLocked = (course: CourseLesson) => {
  const trialAccount = accessLevel.value === 'trial'
  uni.showModal({ title: '当前权限不足', content: trialAccount ? `“${course.sectionName}”不在1元试听范围内，完整权限账号可学习该课程。` : '当前账号暂无精讲课权限，请先开通试听或完整权限。', confirmText: '知道了', showCancel: false })
}
const openCourse = (course?: CourseLesson) => {
  if (!course) return
  const url = `/pages/course-detail/index?id=${encodeURIComponent(course.id)}`
  if (!state.isLoggedIn) {
    requireLogin(url)
    return
  }
  if (!canAccessCourse(course.canTrial)) {
    showLocked(course)
    return
  }
  uni.navigateTo({ url })
}
const openContinue = () => openCourse(continueCourse.value)
const applyDebug = (key: string) => {
  accessLevel.value = applyCourseDebugAccount(key, login, logout)
  showToast(key === 'logged-out' ? '已切换为未登录账号' : '精讲课账号状态已切换')
}
</script>

<template>
  <view class="courses-page page safe-top">
    <view class="courses-header"><view class="header-copy"><text class="eyebrow">COURSE LIBRARY</text><text class="page-title">精讲课</text><text class="header-sub">按节学习重点课程，把知识真正讲明白</text></view><view class="exam-countdown"><text>距离考试</text><view><text class="countdown-days">{{ exam.daysLeft }}</text><text>天</text></view></view></view>

    <view v-if="showAccessPromo" class="access-promo" :class="{ collapsed: !promoExpanded }">
      <view class="promo-head"><view class="promo-brand"><view class="promo-icon"><uni-icons type="videocam" size="21" color="#fff" /></view><view><text class="promo-kicker">上行宝 · 精讲课体验</text><text class="promo-title">跟着课程，把每一节学透</text></view></view><button class="promo-toggle" @tap="promoExpanded = !promoExpanded">{{ promoExpanded ? '收起' : '展开' }}</button></view>
      <view v-if="promoExpanded" class="promo-body"><text class="promo-desc">精选视频、音频和图文课程，围绕考试目录拆解重点内容。购买完整权限后即可学习全部精讲课程与配套讲义。</text><view class="promo-points"><view><uni-icons type="checkmarkempty" size="14" color="#f6bf63" /><text>可试听课程先学</text></view><view><uni-icons type="checkmarkempty" size="14" color="#f6bf63" /><text>配套讲义随课程下载</text></view><view><uni-icons type="checkmarkempty" size="14" color="#f6bf63" /><text>记录每一次学习进度</text></view></view><view class="promo-buttons"><button class="full-button" @tap="openFullPurchase">购买完整权限<uniIcons type="arrowright" size="16" color="#fff" /></button></view></view>
      <view v-else class="promo-mini" @tap="promoExpanded = true"><text>解锁全部精讲课程</text><text>展开查看 ›</text></view>
    </view>

    <view v-if="continueCourse" class="continue-card" @tap="openContinue"><view class="continue-mark"><uni-icons :type="typeIcon(continueCourse.type)" size="23" color="#fff" /></view><view class="continue-copy"><view class="continue-label"><text>继续学习</text><text>{{ continueCourse.typeName }}</text></view><text class="continue-title">第{{ continueCourse.sectionNo }}节 {{ continueCourse.sectionName }}</text><text class="continue-meta">{{ continueCourse.subjectName }} · {{ continueCourse.progress }}% · 上次学到 {{ continueCourse.currentMinute }} 分钟</text><view class="continue-progress"><view :style="{ width: `${continueCourse.progress}%` }"></view></view></view><uniIcons type="forward" size="20" color="#fff" /></view>

    <view class="section-heading"><view><text class="section-title">选择科目</text><text class="section-subtitle">课程按考试科目和章节整理</text></view><text class="course-count">{{ courseCatalog.filter(course => course.subjectId === selectedSubjectId).length }} 节精讲课</text></view>
    <view class="subject-chips"><view v-for="subject in knowledgeSubjects" :key="subject.id" class="subject-chip" :class="{ active: selectedSubjectId === subject.id }" @tap="selectSubject(subject.id)"><uni-icons :type="subject.id === 'ability' ? 'map' : 'list'" size="16" :color="selectedSubjectId === subject.id ? '#fff' : subject.id === 'ability' ? '#3569e8' : '#e98a3a'" /><text>{{ subject.name }}</text></view></view>

    <view class="section-heading catalog-heading"><view><text class="section-title">课程目录</text><text class="section-subtitle">没有精讲课的节会保留目录，并明确标注状态</text></view></view>
    <view class="chapter-list">
      <view v-for="chapter in selectedSubject?.chapters || []" :key="chapter.id" class="chapter-card">
        <view class="chapter-header" @tap="toggleChapter(chapter.id)"><view class="chapter-title"><text>第{{ chapter.no }}章</text><text>{{ chapter.name }}</text></view><view class="chapter-right"><text>{{ chapter.sections.length }} 节</text><uniIcons :type="expandedChapterId === chapter.id ? 'arrowup' : 'arrowdown'" size="17" color="#8793a4" /></view></view>
        <view v-if="expandedChapterId === chapter.id" class="section-list">
          <view v-for="section in chapter.sections" :key="section.id" class="lesson-section" :class="{ 'has-course': selectedCourseMap.get(section.id) }" @tap="selectedCourseMap.get(section.id) && openCourse(selectedCourseMap.get(section.id))">
            <view class="lesson-heading"><view class="lesson-name"><text class="lesson-no">第{{ section.no }}节</text><text>{{ section.name }}</text></view><text v-if="!selectedCourseMap.get(section.id)" class="no-course">暂未配置精讲课</text></view>
            <view v-if="selectedCourseMap.get(section.id)" class="lesson-info">
              <view class="lesson-type"><uniIcons :type="typeIcon(selectedCourseMap.get(section.id)!.type)" size="20" :color="selectedCourseMap.get(section.id)!.type === 'video' ? '#3569e8' : selectedCourseMap.get(section.id)!.type === 'audio' ? '#e98a3a' : '#6949df'" /><text>{{ selectedCourseMap.get(section.id)!.typeName }}</text></view>
              <view class="lesson-copy"><view class="lesson-meta"><text>共 {{ selectedCourseMap.get(section.id)!.totalMinutes }} 分钟</text><text>{{ selectedCourseMap.get(section.id)!.hasHandout ? '有讲义' : '暂无讲义' }}</text><text :class="{ trial: selectedCourseMap.get(section.id)!.canTrial }">{{ selectedCourseMap.get(section.id)!.canTrial ? '可试听' : hasFullAccess ? '完整权限' : '需要权限' }}</text></view><view class="lesson-progress"><view :style="{ width: `${selectedCourseMap.get(section.id)!.progress}%` }"></view></view></view>
              <view class="lesson-action"><text>{{ formatProgress(selectedCourseMap.get(section.id)!) }}</text><uniIcons type="forward" size="19" color="#8b96a5" /></view>
            </view>
          </view>
        </view>
      </view>
    </view>
    <AppTabBar active="courses" />
    <DebugMenu page="精讲课账号状态" :options="courseDebugOptions" @select="applyDebug" />
  </view>
</template>

<style lang="scss">
.courses-page { max-width: 430px; margin: 0 auto; padding-top: calc(env(safe-area-inset-top) + 24rpx); padding-bottom: 118px; background: #f5f7fb; }.courses-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 15rpx; }.header-copy { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6rpx; }.eyebrow { color: #6949df; font-size: 19rpx; font-weight: 850; letter-spacing: 1rpx; }.page-title { color: #152238; font-size: 38rpx; font-weight: 900; }.header-sub { color: #7b8797; font-size: 21rpx; }.exam-countdown { display: flex; flex-direction: column; align-items: flex-end; gap: 3rpx; margin-top: 8rpx; padding: 9rpx 12rpx; color: #718096; background: #fff6eb; border: 1rpx solid #f7dfbd; border-radius: 9rpx; white-space: nowrap; }.exam-countdown > text:first-child { font-size: 17rpx; }.exam-countdown > view { display: flex; align-items: baseline; gap: 3rpx; color: #d47a25; }.countdown-days { font-size: 29rpx; line-height: 1; font-weight: 900; }
.access-promo { position: relative; overflow: hidden; margin-top: 21rpx; padding: 20rpx; color: #fff; background: linear-gradient(135deg,#192f52 0%,#3b478e 100%); border-radius: 15rpx; box-shadow: 0 12rpx 27rpx rgba(43,58,113,.18); }.access-promo::after { content: ''; position: absolute; right: -68rpx; top: -82rpx; width: 180rpx; height: 180rpx; border: 18rpx solid rgba(242,176,79,.16); border-radius: 50%; box-shadow: 0 0 0 17rpx rgba(242,176,79,.06); }.access-promo.collapsed { padding: 16rpx 20rpx; }.promo-head,.promo-brand,.promo-mini,.promo-buttons,.promo-points>view,.lesson-heading,.lesson-meta,.chapter-right,.continue-label { display: flex; align-items: center; }.promo-head { position: relative; z-index: 1; justify-content: space-between; gap: 12rpx; }.promo-brand { gap: 10rpx; }.promo-icon { width: 46rpx; height: 46rpx; display: flex; align-items: center; justify-content: center; flex: none; background: rgba(255,255,255,.14); border-radius: 13rpx; }.promo-brand>view:last-child { display: flex; flex-direction: column; gap: 4rpx; }.promo-kicker { color: #b8caff; font-size: 17rpx; }.promo-title { color: #fff; font-size: 25rpx; font-weight: 850; }.promo-toggle { height: 38rpx; line-height: 38rpx; margin: 0; padding: 0 11rpx; color: #e8ebff; background: rgba(255,255,255,.12); border-radius: 7rpx; font-size: 17rpx; }.promo-toggle::after { display: none; }.promo-body { position: relative; z-index: 1; }.promo-desc { display: block; margin-top: 15rpx; color: #d1d9ee; font-size: 19rpx; line-height: 1.55; }.promo-points { display: flex; flex-wrap: wrap; gap: 8rpx 14rpx; margin-top: 14rpx; }.promo-points>view { gap: 3rpx; color: #e2e7f7; font-size: 17rpx; }.promo-buttons { gap: 9rpx; margin-top: 17rpx; }.promo-buttons button { flex: 1; height: 58rpx; line-height: 58rpx; display: flex; align-items: center; justify-content: center; gap: 4rpx; margin: 0; padding: 0 8rpx; border-radius: 8rpx; font-size: 19rpx; font-weight: 800; }.promo-buttons button::after { display: none; }.trial-button { color: #fff; background: #7655df; }.full-button { color: #263653; background: #f2b04f; }.trial-price { color: #ffd478; font-size: 25rpx; }.promo-mini { position: relative; z-index: 1; justify-content: space-between; color: #eff2ff; font-size: 19rpx; font-weight: 750; }.promo-mini text:last-child { color: #c6c0ff; font-weight: 500; }.mini-price { color: #ffd478; font-size: 25rpx; }
.continue-card { display: flex; align-items: center; gap: 11rpx; margin-top: 17rpx; padding: 17rpx; color: #fff; background: linear-gradient(135deg,#3569e8,#4d56bd); border-radius: 13rpx; box-shadow: 0 10rpx 22rpx rgba(53,91,207,.18); }.continue-mark { width: 47rpx; height: 47rpx; display: flex; align-items: center; justify-content: center; flex: none; background: rgba(255,255,255,.16); border-radius: 13rpx; }.continue-copy { flex: 1; min-width: 0; }.continue-label { gap: 8rpx; }.continue-label text:first-child { color: #e1e8ff; font-size: 17rpx; font-weight: 800; }.continue-label text:last-child { padding: 3rpx 7rpx; color: #d9d7ff; background: rgba(118,85,223,.7); border-radius: 5rpx; font-size: 15rpx; }.continue-title { display: block; overflow: hidden; margin-top: 5rpx; color: #fff; font-size: 21rpx; font-weight: 850; text-overflow: ellipsis; white-space: nowrap; }.continue-meta { display: block; overflow: hidden; margin-top: 5rpx; color: #c7d2f0; font-size: 17rpx; white-space: nowrap; text-overflow: ellipsis; }.continue-progress { height: 5rpx; margin-top: 9rpx; overflow: hidden; background: rgba(255,255,255,.22); border-radius: 5rpx; }.continue-progress view { height: 100%; background: #f2b04f; border-radius: 5rpx; }
.section-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 10rpx; margin: 27rpx 0 13rpx; }.section-heading>view { display: flex; flex-direction: column; gap: 5rpx; }.section-title { color: #152238; font-size: 27rpx; font-weight: 850; }.section-subtitle { color: #7b8797; font-size: 19rpx; line-height: 1.4; }.course-count { color: #6c5bc5; font-size: 17rpx; font-weight: 750; }.subject-chips { display: flex; flex-wrap: wrap; gap: 9rpx; }.subject-chip { min-height: 44rpx; display: flex; align-items: center; gap: 5rpx; padding: 0 12rpx; color: #536987; background: #fff; border: 1rpx solid #dce4ef; border-radius: 8rpx; font-size: 19rpx; }.subject-chip.active { color: #fff; background: linear-gradient(100deg,#3569e8,#6949df); border-color: transparent; }.catalog-heading { margin-top: 27rpx; }
.chapter-list { display: flex; flex-direction: column; gap: 12rpx; }.chapter-card { overflow: hidden; background: #fff; border: 1rpx solid #dfe6f0; border-radius: 12rpx; box-shadow: 0 7rpx 18rpx rgba(51,74,115,.04); }.chapter-header { display: flex; align-items: center; justify-content: space-between; gap: 10rpx; padding: 18rpx 16rpx; }.chapter-title { display: flex; align-items: baseline; gap: 9rpx; min-width: 0; }.chapter-title text:first-child { color: #3569e8; font-size: 19rpx; font-weight: 850; flex: none; }.chapter-title text:last-child { overflow: hidden; color: #24364f; font-size: 22rpx; font-weight: 850; text-overflow: ellipsis; white-space: nowrap; }.chapter-right { gap: 7rpx; color: #9aa5b5; font-size: 17rpx; }.section-list { padding: 0 13rpx 12rpx; border-top: 1rpx solid #eef1f5; }.lesson-section { padding: 15rpx 3rpx 0; }.lesson-heading { align-items: flex-start; justify-content: space-between; gap: 9rpx; }.lesson-name { display: flex; align-items: baseline; gap: 7rpx; flex: 1; min-width: 0; }.lesson-name>text:last-child { color: #30425c; font-size: 21rpx; line-height: 1.5; }.lesson-no { color: #6949df; font-size: 17rpx; font-weight: 850; flex: none; }.no-course { flex: none; padding: 4rpx 7rpx; color: #9aa5b3; background: #f1f3f6; border-radius: 5rpx; font-size: 15rpx; }.lesson-card { display: flex; align-items: center; gap: 10rpx; margin-top: 10rpx; padding: 14rpx 12rpx; background: #f8faff; border: 1rpx solid #dbe6fb; border-left: 4rpx solid #3569e8; border-radius: 10rpx; }.lesson-card.type-audio { background: #fffaf3; border-color: #f5e1c8; border-left-color: #e98a3a; }.lesson-card.type-article { background: #f7f3ff; border-color: #e2dafa; border-left-color: #6949df; }.lesson-type { width: 53rpx; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 3rpx; flex: none; }.lesson-type text { color: #3569e8; font-size: 15rpx; font-weight: 800; }.type-audio .lesson-type text { color: #cf7626; }.type-article .lesson-type text { color: #6949df; }.lesson-copy { flex: 1; min-width: 0; }.lesson-title { display: block; overflow: hidden; color: #24364f; font-size: 19rpx; font-weight: 800; text-overflow: ellipsis; white-space: nowrap; }.lesson-meta { flex-wrap: wrap; gap: 7rpx; margin-top: 6rpx; color: #8592a2; font-size: 15rpx; }.lesson-meta text { padding-right: 7rpx; border-right: 1rpx solid #d6dce6; }.lesson-meta text:last-child { border-right: 0; }.lesson-meta .trial { color: #2e87a0; font-weight: 750; }.lesson-progress { height: 4rpx; margin-top: 8rpx; overflow: hidden; background: #e4eaf3; border-radius: 4rpx; }.lesson-progress view { height: 100%; background: #3569e8; border-radius: 4rpx; }.type-audio .lesson-progress view { background: #e98a3a; }.type-article .lesson-progress view { background: #6949df; }.lesson-action { display: flex; align-items: flex-end; flex-direction: column; gap: 5rpx; flex: none; color: #8b96a5; font-size: 15rpx; white-space: nowrap; }.lesson-action text { color: #75849a; }
.promo-buttons .full-button { width: 100%; flex: 1; font-size: 21rpx; }
.chapter-list { gap: 15rpx; }
.chapter-header { padding: 21rpx 17rpx; }
.chapter-title text:last-child { font-size: 22rpx; }
.section-list { padding: 0 15rpx 16rpx; }
.lesson-section { padding: 19rpx 3rpx 0; }
.lesson-name > text:last-child { font-size: 21rpx; line-height: 1.55; }
.lesson-card { gap: 12rpx; margin-top: 12rpx; padding: 16rpx 13rpx; }
.lesson-meta { gap: 9rpx; margin-top: 2rpx; font-size: 19rpx; }
.lesson-progress { height: 5rpx; margin-top: 10rpx; }
.lesson-action { gap: 6rpx; font-size: 17rpx; }
.lesson-section.has-course { padding-bottom: 17rpx; border-bottom: 1rpx solid #e7ecf3; }
.lesson-info { display: flex; align-items: center; gap: 12rpx; margin-top: 9rpx; padding: 2rpx 0 0 4rpx; }
.lesson-info::before { content: ''; width: 3rpx; align-self: stretch; flex: none; background: #dbe6fb; border-radius: 3rpx; }
.lesson-info .lesson-type { margin-left: 2rpx; }
.lesson-info .lesson-copy { flex: 1; min-width: 0; }
.lesson-info .lesson-action { margin-left: auto; }
.lesson-section.has-course:active { background: #f7f9fd; }
</style>
