<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import uniIcons from '@dcloudio/uni-ui/lib/uni-icons/uni-icons.vue'
import AppTabBar from '@/components/AppTabBar.vue'
import DebugMenu from '@/components/DebugMenu.vue'
import SectionMindMap from '@/components/knowledge/SectionMindMap.vue'
import PriorityLearningRoute from '@/components/knowledge/PriorityLearningRoute.vue'
import { knowledgeSubjects, type KnowledgePoint } from '@/mock/data'
import { useAppStore } from '@/store/app'

const { state, exam } = useAppStore()
const mode = ref<'all' | 'map'>('all')
const expandedSubjects = ref<Record<string, boolean>>({ ability: true, practice: false })
const expandedChapters = ref<Record<string, boolean>>({ 'ability-chapter-1': true })
const expandedSections = ref<Record<string, boolean>>({ 'ability-section-1-1': true })
const priorityView = ref<'mindmap' | 'route'>((uni.getStorageSync('sxb-debug-state-重点导图方案') || 'mindmap') as 'mindmap' | 'route')

onMounted(() => { state.selectedTab = 1 })
onLoad((options) => { if (options?.mode === 'map' || options?.mode === 'all') mode.value = options.mode })
onShow(() => { state.selectedTab = 1 })

const allChapterIds = computed(() => knowledgeSubjects.flatMap(subject => subject.chapters.map(chapter => chapter.id)))
const allSectionIds = computed(() => knowledgeSubjects.flatMap(subject => subject.chapters.flatMap(chapter => chapter.sections.map(section => section.id))))

const toggleSubject = (id: string) => {
  const shouldOpen = !expandedSubjects.value[id]
  expandedSubjects.value = Object.fromEntries(knowledgeSubjects.map(subject => [subject.id, shouldOpen && subject.id === id]))
  if (shouldOpen) toggleChapter(knowledgeSubjects.find(subject => subject.id === id)?.chapters[0]?.id || '', true)
}
function toggleChapter(id: string, forceOpen?: boolean) {
  if (!id) return
  const shouldOpen = forceOpen ?? !expandedChapters.value[id]
  expandedChapters.value = Object.fromEntries(allChapterIds.value.map(chapterId => [chapterId, shouldOpen && chapterId === id]))
  if (shouldOpen) {
    const chapter = knowledgeSubjects.flatMap(subject => subject.chapters).find(item => item.id === id)
    toggleSection(chapter?.sections[0]?.id || '', true)
  }
}
function toggleSection(id: string, forceOpen?: boolean) {
  if (!id) return
  const shouldOpen = forceOpen ?? !expandedSections.value[id]
  expandedSections.value = Object.fromEntries(allSectionIds.value.map(sectionId => [sectionId, shouldOpen && sectionId === id]))
}
const openDetail = (point: KnowledgePoint) => uni.navigateTo({ url: `/pages/knowledge-detail/index?id=${encodeURIComponent(point.id)}` })
const openSectionPractice = (sectionId: string) => uni.navigateTo({ url: `/pages/practice-session/index?sectionId=${encodeURIComponent(sectionId)}&returnUrl=${encodeURIComponent('/pages/knowledge/index?mode=map')}` })
const applyPriorityDebug = (key: string) => {
  priorityView.value = key === 'route' ? 'route' : 'mindmap'
}
</script>

<template>
  <view class="knowledge-page page safe-top editorial-page">
    <view class="knowledge-header">
      <view class="header-copy"><text class="eyebrow">KNOWLEDGE MAP</text><text class="page-title">知识图谱</text><text class="header-sub">按科目、章、节梳理每一个知识点</text></view>
      <view class="exam-countdown"><text>距离考试</text><view><text class="countdown-days">{{ exam.daysLeft }}</text><text>天</text></view></view>
    </view>

    <view class="mode-switch">
      <view class="mode-item" :class="{ active: mode === 'all' }" @tap="mode = 'all'"><uni-icons type="list" size="17" :color="mode === 'all' ? '#3569e8' : '#8d99aa'" /><text>全部章节</text></view>
      <view class="mode-item" :class="{ active: mode === 'map' }" @tap="mode = 'map'"><uni-icons type="map" size="17" :color="mode === 'map' ? '#6949df' : '#8d99aa'" /><text>重点导图</text></view>
    </view>

    <template v-if="mode === 'all'">
      <view class="guide-line"><view class="guide-icon"><uni-icons type="info" size="16" color="#3569e8" /></view><text>知识点按考试目录归类，点开任意知识点即可查看内容、课程和学习笔记。</text></view>
      <view class="subject-list">
        <view v-for="subject in knowledgeSubjects" :key="subject.id" class="subject-panel" :class="{ expanded: expandedSubjects[subject.id] }">
          <view class="subject-header" @tap="toggleSubject(subject.id)">
            <view class="subject-mark" :style="{ background: `${subject.id === 'ability' ? '#3569e8' : '#e98a3a'}18`, color: subject.id === 'ability' ? '#3569e8' : '#e98a3a' }"><uni-icons :type="subject.id === 'ability' ? 'map' : 'list'" size="21" :color="subject.id === 'ability' ? '#3569e8' : '#e98a3a'" /></view>
            <view class="subject-copy"><text class="subject-name">{{ subject.name }}</text><view class="subject-meta"><text>{{ subject.questionDone }} / {{ subject.questionTotal }} 题</text><text>掌握 {{ subject.mastery }}%</text></view><view class="subject-progress"><view :style="{ width: `${subject.mastery}%`, background: subject.id === 'ability' ? '#3569e8' : '#e98a3a' }"></view></view></view>
            <view class="subject-toggle"><uni-icons :type="expandedSubjects[subject.id] ? 'arrowup' : 'arrowdown'" size="18" color="#8692a3" /></view>
          </view>
          <view v-if="expandedSubjects[subject.id]" class="subject-body">
            <view v-for="chapter in subject.chapters" :key="chapter.id" class="chapter-group">
              <view class="chapter-header" @tap="toggleChapter(chapter.id)"><view class="chapter-label"><text>第{{ chapter.no }}章</text><text>{{ chapter.name }}</text></view><uni-icons :type="expandedChapters[chapter.id] ? 'arrowup' : 'arrowdown'" size="16" color="#8793a4" /></view>
              <view v-if="expandedChapters[chapter.id]" class="chapter-body">
                <view v-for="section in chapter.sections" :key="section.id" class="section-group">
                  <view class="section-header" @tap="toggleSection(section.id)"><view><text>第{{ section.no }}节</text><text>{{ section.name }}</text></view><uni-icons :type="expandedSections[section.id] ? 'arrowup' : 'arrowdown'" size="15" color="#9aa5b4" /></view>
                  <view v-if="expandedSections[section.id]" class="point-list">
                    <view v-for="point in section.points" :key="point.id" class="point-row" @tap="openDetail(point)">
                      <view class="point-main"><text class="point-title">{{ point.title }}</text><view class="point-meta"><text class="star-tag" :class="`star-${point.stars}`">{{ point.stars }}星</text><text>{{ point.questionDone }} / {{ point.questionTotal }}题</text><text>掌握 {{ point.mastery }}%</text></view></view><uni-icons type="forward" size="17" color="#a4afbd" />
                    </view>
                  </view>
                </view>
              </view>
            </view>
          </view>
        </view>
      </view>
    </template>

    <template v-else>
      <SectionMindMap v-if="priorityView === 'mindmap'" @open="openDetail" @practice="openSectionPractice" />
      <PriorityLearningRoute v-else @open="openDetail" @practice="openSectionPractice" />
      <DebugMenu page="重点导图方案" :options="[{ key: 'mindmap', label: '方案一 · 节级思维导图' }, { key: 'route', label: '方案二 · 重点知识路线' }]" @select="applyPriorityDebug" />
    </template>
    <AppTabBar active="knowledge" />
  </view>
</template>

<style lang="scss">
.knowledge-page { max-width: 430px; margin: 0 auto; padding-top: calc(env(safe-area-inset-top) + 24rpx); padding-bottom: 118px; background: #f5f7fb; }
.knowledge-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16rpx; }.header-copy { display: flex; flex-direction: column; gap: 6rpx; }.eyebrow { color: #6949df; font-size: 19rpx; font-weight: 850; letter-spacing: 1rpx; }.page-title { color: #152238; font-size: 38rpx; font-weight: 900; }.header-sub { color: #7b8797; font-size: 21rpx; }.exam-countdown { display: flex; flex-direction: column; align-items: flex-end; gap: 3rpx; margin-top: 8rpx; padding: 9rpx 12rpx; color: #718096; background: #fff6eb; border: 1rpx solid #f7dfbd; border-radius: 9rpx; white-space: nowrap; }.exam-countdown > text:first-child { font-size: 17rpx; }.exam-countdown > view { display: flex; align-items: baseline; gap: 3rpx; color: #d47a25; }.countdown-days { font-size: 29rpx; line-height: 1; font-weight: 900; }
.mode-switch { display: flex; gap: 6rpx; margin-top: 24rpx; padding: 5rpx; background: #e9edf6; border-radius: 11rpx; }.mode-item { flex: 1; height: 58rpx; display: flex; align-items: center; justify-content: center; gap: 6rpx; color: #7e8a9c; border-radius: 8rpx; font-size: 21rpx; font-weight: 750; }.mode-item.active { color: #3569e8; background: #fff; box-shadow: 0 4rpx 12rpx rgba(54,76,125,.08); }
.guide-line { display: flex; align-items: flex-start; gap: 9rpx; margin-top: 16rpx; padding: 12rpx 14rpx; color: #5e6e87; background: #edf3ff; border: 1rpx solid #dce8ff; border-radius: 9rpx; font-size: 19rpx; line-height: 1.5; }.guide-icon { width: 28rpx; height: 28rpx; display: flex; align-items: center; justify-content: center; flex: none; }
.subject-list { display: flex; flex-direction: column; gap: 14rpx; margin-top: 18rpx; }.subject-panel { overflow: hidden; background: #fff; border: 1rpx solid #dfe6f0; border-radius: 13rpx; box-shadow: 0 8rpx 22rpx rgba(51,74,115,.04); }.subject-header { display: flex; align-items: center; gap: 12rpx; padding: 18rpx; }.subject-mark { width: 48rpx; height: 48rpx; display: flex; align-items: center; justify-content: center; flex: none; border-radius: 13rpx; }.subject-copy { flex: 1; min-width: 0; }.subject-name { display: block; color: #152238; font-size: 22rpx; font-weight: 850; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }.subject-meta { display: flex; gap: 13rpx; margin-top: 6rpx; color: #7d8999; font-size: 19rpx; }.subject-progress { height: 6rpx; margin-top: 9rpx; overflow: hidden; background: #edf0f6; border-radius: 6rpx; }.subject-progress view { height: 100%; border-radius: 6rpx; }.subject-toggle { width: 28rpx; height: 34rpx; display: flex; align-items: center; justify-content: center; flex: none; }.subject-body { border-top: 1rpx solid #eef1f5; padding: 0 16rpx 10rpx; }.chapter-group { border-bottom: 1rpx solid #eff2f6; }.chapter-group:last-child { border-bottom: 0; }.chapter-header { display: flex; align-items: center; justify-content: space-between; gap: 8rpx; padding: 18rpx 2rpx 13rpx; }.chapter-label { display: flex; align-items: baseline; gap: 8rpx; min-width: 0; }.chapter-label text:first-child { color: #3569e8; font-size: 19rpx; font-weight: 850; flex: none; }.chapter-label text:last-child { color: #24364f; font-size: 22rpx; font-weight: 850; }.chapter-body { padding-bottom: 6rpx; }.section-group { overflow: hidden; margin: 0 0 10rpx; background: #f8faff; border: 1rpx solid #e7edf7; border-radius: 10rpx; }.section-header { display: flex; align-items: center; justify-content: space-between; gap: 8rpx; padding: 13rpx 13rpx; }.section-header>view { display: flex; align-items: baseline; gap: 8rpx; min-width: 0; }.section-header text:first-child { color: #6949df; font-size: 17rpx; font-weight: 850; flex: none; }.section-header text:last-child { color: #30425c; font-size: 21rpx; font-weight: 780; }.point-list { border-top: 1rpx solid #e6ebf4; background: #fff; }.point-row { display: flex; align-items: flex-start; gap: 9rpx; padding: 14rpx 13rpx; border-bottom: 1rpx solid #edf0f5; }.point-row:last-child { border-bottom: 0; }.point-main { flex: 1; min-width: 0; }.point-title { display: block; color: #24364f; font-size: 21rpx; line-height: 1.5; }.point-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 9rpx; margin-top: 8rpx; color: #8b96a5; font-size: 17rpx; }.star-tag { padding: 2rpx 7rpx; border-radius: 5rpx; font-size: 17rpx; line-height: 1.3; font-weight: 850; }.star-1 { color: #6f7e91; background: #eef1f5; }.star-2 { color: #3d78b9; background: #eaf3ff; }.star-3 { color: #3569e8; background: #eaf0ff; }.star-4 { color: #6949df; background: #f0edff; }.star-5 { color: #d47a25; background: #fff2df; }

/* Give each hierarchy level a clear visual rhythm on the fixed mobile canvas. */
.knowledge-header { margin-bottom: 8rpx; }
.mode-switch { margin-top: 28rpx; }
.guide-line { margin-top: 20rpx; padding: 16rpx; line-height: 1.65; }
.subject-list { gap: 18rpx; margin-top: 22rpx; }
.subject-header { gap: 15rpx; padding: 22rpx 20rpx; }
.subject-body { padding: 0 20rpx 16rpx; }
.chapter-header { padding: 23rpx 2rpx 17rpx; }
.chapter-label { gap: 11rpx; }
.chapter-body { padding-bottom: 12rpx; }
.section-group { margin-bottom: 16rpx; border-radius: 12rpx; }
.section-header { padding: 17rpx 16rpx; }
.section-header > view { gap: 11rpx; }
.point-row { gap: 12rpx; padding: 19rpx 16rpx; }
.point-title { font-size: 21rpx; line-height: 1.65; }
.point-meta { gap: 11rpx; margin-top: 11rpx; }

</style>
