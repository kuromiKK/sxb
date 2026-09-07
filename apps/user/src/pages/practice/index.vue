<script setup lang="ts">
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import uniIcons from '@dcloudio/uni-ui/lib/uni-icons/uni-icons.vue'
import AppTabBar from '@/components/AppTabBar.vue'
import { knowledgeSubjects } from '@/mock/data'
import { useAppStore } from '@/store/app'
import { getPlanQuestions, loadPlan } from '@/utils/practice-plan'
import { getWeakKnowledgePoints, type WeakPointDebugState } from '@/utils/weak-points'
import DebugMenu from '@/components/DebugMenu.vue'

const { state, exam, requireLogin } = useAppStore()
const debugState = ref((uni.getStorageSync('sxb-debug-state-刷题首页') || 'normal') as string)
const plan = computed(() => loadPlan(exam.value.id, exam.value.daysLeft))
const planQuestions = computed(() => debugState.value === 'empty' ? [] : getPlanQuestions(plan.value))
const planDone = computed(() => planQuestions.value.filter(item => Boolean((uni.getStorageSync('sxb-question-status') || {})[item.id])).length)
const selectedSubjectId = ref(knowledgeSubjects[0]?.id || '')
const expandedChapterId = ref(knowledgeSubjects[0]?.chapters[0]?.id || '')
const wrongCount = ref(0)
const favoriteCount = ref(0)
const answerVersion = ref(0)
const wrongBadge = computed(() => wrongCount.value > 99 ? '99+' : String(wrongCount.value))

const selectedSubject = computed(() => knowledgeSubjects.find(item => item.id === selectedSubjectId.value) || knowledgeSubjects[0])
const subjectLabel = (subject: typeof knowledgeSubjects[number]) => subject.id === 'ability' ? '初级综合' : subject.id === 'practice' ? '初级实务' : subject.name
const remaining = computed(() => Math.max(state.todayTarget - state.todayDone, 0))
const planProgress = computed(() => state.todayTarget ? Math.min(Math.round(state.todayDone / state.todayTarget * 100), 100) : 0)
const planCompleted = computed(() => debugState.value === 'completed' || (planQuestions.value.length > 0 && planDone.value >= planQuestions.value.length))
const weakPoints = computed(() => {
  answerVersion.value
  const weakDebugState = debugState.value === 'weak-demo' || debugState.value === 'weak-empty'
    ? debugState.value as WeakPointDebugState
    : 'normal'
  return getWeakKnowledgePoints(exam.value.id, weakDebugState)
})

onShow(() => {
  state.selectedTab = 3
  answerVersion.value++
  wrongCount.value = (uni.getStorageSync('sxb-wrong-questions') || ['q-002', 'q-004', 'q-006']).length
  favoriteCount.value = (uni.getStorageSync('sxb-favorite-items') || ['kp-1-1-1', 'course-ability-section-1-1', 'q-001']).length
})

const goSession = (query = '', returnUrl = '/pages/practice/index') => {
  const fullQuery = `${query}${query ? '&' : '?'}returnUrl=${encodeURIComponent(returnUrl)}`
  if (requireLogin(`/pages/practice-session/index${fullQuery}`)) uni.navigateTo({ url: `/pages/practice-session/index${fullQuery}` })
}
const continuePlan = () => goSession('?plan=1', '/pages/learning-plan/index')
const goTools = (mode: string) => { const url = `/pages/practice-tools/index?mode=${mode}`; if (requireLogin(url)) uni.navigateTo({ url }) }
const goRecite = () => { const url = '/pages/recite/index'; if (requireLogin(url)) uni.navigateTo({ url }) }
const goPlan = () => {
  const url = '/pages/learning-plan/index?returnUrl=%2Fpages%2Fpractice%2Findex'
  if (requireLogin(url)) uni.navigateTo({ url })
}
const selectSubject = (id: string) => {
  selectedSubjectId.value = id
  expandedChapterId.value = knowledgeSubjects.find(item => item.id === id)?.chapters[0]?.id || ''
}
const toggleChapter = (id: string) => { expandedChapterId.value = expandedChapterId.value === id ? '' : id }
const openSection = (sectionId: string) => goSession(`?sectionId=${encodeURIComponent(sectionId)}`, '/pages/practice/index')
const applyDebug = (key: string) => { debugState.value = key }
</script>

<template>
  <view class="practice-page page safe-top editorial-page">
    <view class="practice-header"><view><text class="eyebrow">PRACTICE LAB</text><text class="page-title">刷题</text><text class="header-sub">把每一道题，做成真正掌握的知识</text></view><view class="exam-badge"><text>距离考试</text><view><text>{{ exam.daysLeft }}</text><text>天</text></view></view></view>

    <view class="plan-card"><view class="plan-top"><view><text class="plan-kicker">今日刷题计划</text><view class="plan-number"><text>{{ remaining }}</text><text>题</text></view><text class="plan-label">今日还需完成</text></view><view class="plan-side"><uni-icons type="calendar" size="22" color="#3569e8" /><text>目标 {{ state.todayTarget }} 题</text><text class="plan-percent">{{ planProgress }}%</text></view></view><view class="plan-track"><view :style="{ width: `${planProgress}%` }"></view></view><view class="plan-foot"><text>今日已完成 {{ state.todayDone }} / {{ state.todayTarget }} 题</text><text class="plan-status">{{ planCompleted ? '计划题目已完成' : '计划进行中' }}</text></view><view class="plan-scope"><text>推荐范围</text><text>{{ planQuestions.length }} 题 · {{ plan.sources.map(source => source === 'chapter' ? '章节' : source === 'favorite' ? '收藏' : '错题').join(' + ') }}</text></view><view class="plan-actions"><button class="primary-action" @tap="continuePlan"><uni-icons type="play-filled" size="16" color="#fff" />{{ planCompleted ? '重新练习计划题目' : '继续刷题' }}</button><button class="text-action" @tap="goPlan">修改计划</button></view></view>

    <view v-if="weakPoints.length" class="weak-card" @tap="goSession('?mode=weak')"><view class="weak-icon"><uni-icons type="fire" size="24" color="#e98a3a" /></view><view class="weak-copy"><text class="weak-title">薄弱项强化</text><text class="weak-desc">集中练习已完成但正确率低于 50% 的知识点</text><text class="weak-meta">当前有 {{ weakPoints.length }} 个薄弱知识点</text></view><uni-icons type="forward" size="20" color="#e98a3a" /></view>

    <view class="tool-grid"><view class="tool-item" @tap="goTools('wrong')"><view class="tool-icon wrong"><uni-icons type="refresh" size="22" color="#e98a3a" /><text v-if="wrongCount" class="count-badge">{{ wrongBadge }}</text></view><text class="tool-title">错题本</text></view><view class="tool-item" @tap="goTools('favorite')"><view class="tool-icon favorite"><uni-icons type="star" size="22" color="#7655df" /></view><text class="tool-title">收藏</text></view><view class="tool-item" @tap="goTools('note')"><view class="tool-icon note"><uni-icons type="compose" size="22" color="#1a9a7b" /></view><text class="tool-title">笔记</text></view><view class="tool-item" @tap="goRecite"><view class="tool-icon recite"><uni-icons type="flag" size="22" color="#27345c" /></view><text class="tool-title">背题</text></view></view>

    <view class="section-head subject-head"><view><text class="section-title">章节练习</text><text class="section-subtitle">按科目、章、节选择要练习的题目</text></view><text class="section-count">{{ selectedSubject?.chapters.length || 0 }} 章</text></view>
    <scroll-view class="subject-tabs" scroll-x :show-scrollbar="false"><view class="subject-tabs-inner"><view v-for="subject in knowledgeSubjects" :key="subject.id" class="subject-tab" :class="{ active: selectedSubjectId === subject.id }" @tap="selectSubject(subject.id)"><uni-icons :type="subject.id === 'ability' ? 'map' : 'list'" size="16" :color="selectedSubjectId === subject.id ? '#fff' : subject.id === 'ability' ? '#3569e8' : '#e98a3a'" /><text>{{ subjectLabel(subject) }}</text></view></view></scroll-view>
    <view class="subject-overview"><view><text class="overview-name">{{ selectedSubject.name }}</text><text class="overview-meta">题库掌握程度 · {{ selectedSubject.mastery }}%</text></view><view class="overview-ring"><text>{{ selectedSubject.mastery }}%</text></view></view>
    <view class="chapter-list"><view v-for="chapter in selectedSubject?.chapters || []" :key="chapter.id" class="chapter-card"><view class="chapter-head" @tap="toggleChapter(chapter.id)"><view class="chapter-name"><text>第{{ chapter.no }}章</text><text>{{ chapter.name }}</text></view><view class="chapter-count"><text>{{ chapter.sections.length }} 节</text><uni-icons :type="expandedChapterId === chapter.id ? 'arrowup' : 'arrowdown'" size="17" color="#8d99a9" /></view></view><view v-if="expandedChapterId === chapter.id" class="section-list"><view v-for="section in chapter.sections" :key="section.id" class="section-row" @tap="openSection(section.id)"><view class="section-copy"><view class="section-name"><text>第{{ section.no }}节</text><text>{{ section.name }}</text></view><view class="section-meta"><text>{{ section.points.reduce((sum, point) => sum + point.questionTotal, 0) }} 题</text><text>掌握 {{ Math.round(section.points.reduce((sum, point) => sum + point.mastery, 0) / Math.max(section.points.length, 1)) }}%</text></view></view><view class="section-progress"><view :style="{ height: `${Math.round(section.points.reduce((sum, point) => sum + point.mastery, 0) / Math.max(section.points.length, 1))}%` }"></view></view><uni-icons type="forward" size="18" color="#a3adba" /></view></view></view></view>
    <AppTabBar active="practice" /><DebugMenu page="刷题首页" :options="[{ key: 'normal', label: '正常计划' }, { key: 'completed', label: '计划题目已完成' }, { key: 'empty', label: '计划范围暂无题目' }, { key: 'weak-demo', label: '存在薄弱项' }, { key: 'weak-empty', label: '无薄弱项' }]" @select="applyDebug" />
  </view>
</template>

<style lang="scss" scoped>
.plan-scope { display: flex; align-items: center; gap: 8rpx; margin-top: 11rpx; color: #7c899a; font-size: 16rpx; }
.plan-scope text:first-child { padding: 4rpx 7rpx; color: #5369ad; background: #edf2ff; border-radius: 5rpx; font-weight: 800; }
.practice-page { max-width: 430px; margin: 0 auto; padding-top: calc(env(safe-area-inset-top) + 24rpx); padding-bottom: 118px; background: #f5f7fb; }.practice-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 14rpx; }.practice-header>view:first-child { display: flex; flex-direction: column; gap: 5rpx; }.eyebrow { color: #6949df; font-size: 17rpx; font-weight: 900; letter-spacing: 1rpx; }.page-title { color: #152238; font-size: 38rpx; line-height: 1.2; font-weight: 900; }.header-sub { color: #7b8797; font-size: 19rpx; }.exam-badge { display: flex; align-items: flex-end; flex-direction: column; gap: 3rpx; margin-top: 7rpx; padding: 9rpx 12rpx; color: #718096; background: #fff6eb; border: 1rpx solid #f7dfbd; border-radius: 9rpx; }.exam-badge>text { font-size: 17rpx; }.exam-badge>view { display: flex; align-items: baseline; gap: 3rpx; color: #d47a25; }.exam-badge>view text:first-child { font-size: 29rpx; font-weight: 900; }.exam-badge>view text:last-child { font-size: 17rpx; }.plan-card { margin-top: 20rpx; padding: 19rpx; background: #fff; border: 1rpx solid #dfe6f0; border-left: 6rpx solid #3569e8; border-radius: 13rpx; box-shadow: 0 9rpx 23rpx rgba(51,74,115,.05); }.plan-top { display: flex; align-items: flex-start; justify-content: space-between; }.plan-kicker { color: #526783; font-size: 19rpx; font-weight: 800; }.plan-number { display: flex; align-items: flex-end; gap: 4rpx; margin-top: 3rpx; }.plan-number text:first-child { color: #315bd4; font-size: 52rpx; line-height: 1; font-weight: 900; }.plan-number text:last-child { margin-bottom: 5rpx; color: #64758b; font-size: 19rpx; }.plan-label { display: block; margin-top: 5rpx; color: #8793a2; font-size: 17rpx; }.plan-side { display: flex; align-items: flex-end; flex-direction: column; gap: 4rpx; color: #7a8798; font-size: 17rpx; }.plan-percent { color: #3569e8; font-size: 22rpx; font-weight: 850; }.plan-track { height: 9rpx; margin: 17rpx 0 10rpx; overflow: hidden; background: #e8edf5; border-radius: 9rpx; }.plan-track view { height: 100%; background: linear-gradient(90deg,#3569e8,#7655df); border-radius: 9rpx; }.plan-foot { display: flex; align-items: center; justify-content: space-between; color: #64758b; font-size: 17rpx; }.plan-status { color: #1a9a7b; font-weight: 800; }.plan-actions { display: flex; align-items: center; gap: 10rpx; margin-top: 15rpx; }.primary-action { flex: 1; height: 49rpx; display: flex; align-items: center; justify-content: center; gap: 5rpx; margin: 0; padding: 0; color: #fff; background: #3569e8; border-radius: 8rpx; font-size: 19rpx; font-weight: 800; }.primary-action::after { display: none; }.text-action { width: 100rpx; height: 49rpx; line-height: 49rpx; margin: 0; padding: 0; color: #3569e8; background: #eef3ff; border-radius: 8rpx; font-size: 17rpx; }.text-action::after { display: none; }.weak-card { display: flex; align-items: center; gap: 11rpx; margin-top: 16rpx; padding: 15rpx; background: #fff8ef; border: 1rpx solid #f6dfbd; border-radius: 12rpx; }.weak-icon { width: 47rpx; height: 47rpx; display: flex; align-items: center; justify-content: center; flex: none; background: #ffebd2; border-radius: 13rpx; }.weak-copy { display: flex; flex: 1; min-width: 0; flex-direction: column; gap: 3rpx; }.weak-title { color: #a75c20; font-size: 21rpx; font-weight: 850; }.weak-desc { color: #6f6870; font-size: 17rpx; line-height: 1.35; }.weak-meta { color: #cf7b2d; font-size: 15rpx; }.section-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 10rpx; margin: 24rpx 0 12rpx; }.section-head>view { display: flex; flex-direction: column; gap: 4rpx; }.section-title { color: #152238; font-size: 25rpx; font-weight: 850; }.section-subtitle { color: #7b8797; font-size: 17rpx; }.section-count { color: #6c5bc5; font-size: 17rpx; font-weight: 800; }.tool-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8rpx; }.tool-item { display: flex; align-items: center; flex-direction: column; gap: 5rpx; min-height: 114rpx; padding: 13rpx 5rpx 10rpx; background: #fff; border: 1rpx solid #e1e7f0; border-radius: 11rpx; }.tool-icon { width: 43rpx; height: 43rpx; display: flex; align-items: center; justify-content: center; border-radius: 12rpx; }.tool-icon.wrong { background: #fff0e5; }.tool-icon.favorite { background: #f0ecff; }.tool-icon.note { background: #e9efff; }.tool-icon.recite { background: #e7f7f1; }.tool-title { color: #263953; font-size: 19rpx; font-weight: 800; }.tool-meta { overflow: hidden; width: 100%; color: #8a96a5; font-size: 15rpx; text-align: center; text-overflow: ellipsis; white-space: nowrap; }.subject-head { margin-top: 25rpx; }.subject-tabs { display: flex; flex-wrap: wrap; gap: 8rpx; }.subject-tab { display: flex; align-items: center; gap: 4rpx; min-height: 43rpx; padding: 0 11rpx; color: #536987; background: #fff; border: 1rpx solid #dce4ef; border-radius: 8rpx; font-size: 17rpx; }.subject-tab.active { color: #fff; background: linear-gradient(100deg,#3569e8,#6949df); border-color: transparent; }.subject-overview { display: flex; align-items: center; justify-content: space-between; margin-top: 13rpx; padding: 14rpx 15rpx; background: #eef3ff; border: 1rpx solid #dbe6ff; border-radius: 11rpx; }.overview-name { display: block; color: #253855; font-size: 19rpx; font-weight: 850; }.overview-meta { display: block; margin-top: 4rpx; color: #718197; font-size: 15rpx; }.overview-ring { width: 50rpx; height: 50rpx; display: flex; align-items: center; justify-content: center; color: #3569e8; border: 5rpx solid #8faeff; border-radius: 50%; font-size: 15rpx; font-weight: 900; }.chapter-list { display: flex; flex-direction: column; gap: 10rpx; margin-top: 12rpx; }.chapter-card { overflow: hidden; background: #fff; border: 1rpx solid #dfe6f0; border-radius: 11rpx; }.chapter-head { display: flex; align-items: center; justify-content: space-between; gap: 8rpx; padding: 16rpx 14rpx; }.chapter-name { display: flex; align-items: baseline; gap: 8rpx; min-width: 0; }.chapter-name text:first-child { flex: none; color: #3569e8; font-size: 17rpx; font-weight: 850; }.chapter-name text:last-child { overflow: hidden; color: #263953; font-size: 21rpx; font-weight: 850; text-overflow: ellipsis; white-space: nowrap; }.chapter-count { display: flex; align-items: center; gap: 5rpx; flex: none; color: #8995a5; font-size: 15rpx; }.section-list { padding: 0 13rpx 10rpx; border-top: 1rpx solid #eef1f5; }.section-row { display: flex; align-items: center; gap: 9rpx; padding: 13rpx 2rpx; border-bottom: 1rpx solid #eef1f5; }.section-row:last-child { border-bottom: 0; }.section-copy { flex: 1; min-width: 0; }.section-name { display: flex; align-items: baseline; gap: 7rpx; }.section-name text:first-child { flex: none; color: #6949df; font-size: 17rpx; font-weight: 850; }.section-name text:last-child { overflow: hidden; color: #30425c; font-size: 19rpx; line-height: 1.45; text-overflow: ellipsis; white-space: nowrap; }.section-meta { display: flex; gap: 10rpx; margin-top: 5rpx; color: #7f8da1; font-size: 15rpx; }.section-progress { width: 5rpx; height: 42rpx; overflow: hidden; flex: none; background: #e8edf4; border-radius: 5rpx; transform: rotate(180deg); }.section-progress view { width: 100%; background: #3569e8; border-radius: 5rpx; }.section-row>uni-icons { flex: none; }
.header-sub { font-size: 22rpx; }
.exam-badge > text,
.exam-badge > view text:last-child { font-size: 19rpx; }
.plan-card { border-left: 1rpx solid #dfe6f0; }
.plan-kicker { font-size: 21rpx; }
.plan-number text:last-child { font-size: 21rpx; }
.plan-label { font-size: 21rpx; }
.plan-side { font-size: 21rpx; }
.plan-percent { font-size: 27rpx; }
.plan-foot { font-size: 21rpx; }
.primary-action { height: 54rpx; font-size: 21rpx; }
.text-action { width: 112rpx; height: 54rpx; line-height: 54rpx; font-size: 21rpx; }
.weak-card { padding: 18rpx 16rpx; }
.weak-title { font-size: 22rpx; }
.weak-desc { font-size: 21rpx; line-height: 1.5; }
.weak-meta { font-size: 19rpx; }
.tool-grid { margin-top: 18rpx; gap: 10rpx; }
.tool-item { min-height: 108rpx; justify-content: center; padding: 13rpx 5rpx; }
.tool-icon { width: 47rpx; height: 47rpx; }
.tool-title { font-size: 22rpx; }
.tool-item:nth-child(1) .tool-title { color: #e98a3a; }
.tool-item:nth-child(2) .tool-title { color: #7655df; }
.tool-item:nth-child(3) .tool-title { color: #1a9a7b; }
.tool-item:nth-child(4) .tool-title { color: #27345c; }
.tool-icon.note { background: #e7f7f1; }
.tool-icon.recite { background: #edf0f8; }
.tool-icon { position: relative; }
.count-badge { position:absolute; top:-11rpx; right:-13rpx; min-width:27rpx; height:27rpx; box-sizing:border-box; padding:0 6rpx; display:flex; align-items:center; justify-content:center; color:#fff; background:#e45e64; border:2rpx solid #fff; border-radius:20rpx; font-size:14rpx !important; font-weight:850; line-height:1; }
.tool-meta { font-size: 17rpx; }
.subject-head { margin-top: 30rpx; }
.section-title { font-size: 29rpx; }
.section-subtitle { font-size: 21rpx; line-height: 1.45; }
.section-count { font-size: 21rpx; }
.subject-tab { min-height: 49rpx; font-size: 19rpx; }
.subject-overview { padding: 17rpx; }
.overview-name { font-size: 22rpx; }
.overview-meta { font-size: 19rpx; }
.overview-ring { width: 56rpx; height: 56rpx; font-size: 17rpx; }
.chapter-head { padding: 19rpx 15rpx; }
.chapter-name text:first-child { font-size: 19rpx; }
.chapter-name text:last-child { font-size: 22rpx; }
.chapter-count { font-size: 19rpx; }
.section-row { padding: 17rpx 2rpx; }
.section-name text:first-child { font-size: 19rpx; }
.section-name text:last-child { font-size: 21rpx; }
.section-meta { margin-top: 7rpx; font-size: 19rpx; }
.subject-tabs { width: 100%; overflow: hidden; white-space: nowrap; }
.subject-tabs-inner { display: inline-flex; gap: 8rpx; }
.subject-tab { flex: none; }
</style>
