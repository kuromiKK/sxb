<script setup lang="ts">
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import uniIcons from '@dcloudio/uni-ui/lib/uni-icons/uni-icons.vue'
import { knowledgeSubjects, type KnowledgePoint } from '@/mock/data'
import { backOrFallback } from '@/utils/navigation'

const recitableSubjects = computed(() => knowledgeSubjects.map(subject => ({
  ...subject,
  chapters: subject.chapters.map(chapter => ({
    ...chapter,
    sections: chapter.sections.map(section => ({
      ...section,
      points: section.points.filter(point => Boolean(point.content?.trim())),
    })).filter(section => section.points.length),
  })).filter(chapter => chapter.sections.length),
})).filter(subject => subject.chapters.length))

const selectedSubjectId = ref(recitableSubjects.value[0]?.id || '')
const expandedChapterId = ref(recitableSubjects.value[0]?.chapters[0]?.id || '')
const expandedSectionId = ref(recitableSubjects.value[0]?.chapters[0]?.sections[0]?.id || '')
const recentPointId = ref('')
const reciteListStateKey = 'recite-list-state'
const recentPointKey = 'recite-recent-point'
const selectedSubject = computed(() => recitableSubjects.value.find(subject => subject.id === selectedSubjectId.value) || recitableSubjects.value[0])
const recitablePointCount = computed(() => recitableSubjects.value.reduce((subjectTotal, subject) => subjectTotal + subject.chapters.reduce((chapterTotal, chapter) => chapterTotal + chapter.sections.reduce((sectionTotal, section) => sectionTotal + section.points.length, 0), 0), 0))
const subjectShortName = (id: string, name: string) => id === 'ability' ? '初级综合' : id === 'practice' ? '初级实务' : name.split('（')[0]
const back = () => backOrFallback('/pages/practice/index')
const selectSubject = (id: string) => {
  selectedSubjectId.value = id
  const subject = recitableSubjects.value.find(item => item.id === id)
  expandedChapterId.value = subject?.chapters[0]?.id || ''
  expandedSectionId.value = subject?.chapters[0]?.sections[0]?.id || ''
  saveListState()
}
const toggleChapter = (id: string) => {
  expandedChapterId.value = expandedChapterId.value === id ? '' : id
  if (expandedChapterId.value) {
    const chapter = selectedSubject.value?.chapters.find(item => item.id === id)
    expandedSectionId.value = chapter?.sections[0]?.id || ''
  }
  saveListState()
}
const toggleSection = (id: string) => {
  expandedSectionId.value = expandedSectionId.value === id ? '' : id
  saveListState()
}
function saveListState() {
  uni.setStorageSync(reciteListStateKey, {
    subjectId: selectedSubjectId.value,
    chapterId: expandedChapterId.value,
    sectionId: expandedSectionId.value,
  })
}
const restoreListState = () => {
  const stored = uni.getStorageSync(reciteListStateKey)
  const saved = (stored && typeof stored === 'object' ? stored : {}) as { subjectId?: string; chapterId?: string; sectionId?: string }
  const subject = recitableSubjects.value.find(item => item.id === saved.subjectId)
  const chapter = subject?.chapters.find(item => item.id === saved.chapterId)
  const section = chapter?.sections.find(item => item.id === saved.sectionId)
  if (subject) selectedSubjectId.value = subject.id
  if (chapter) expandedChapterId.value = chapter.id
  if (section) expandedSectionId.value = section.id
  recentPointId.value = uni.getStorageSync(recentPointKey) || ''
}
const openPoint = (point: KnowledgePoint) => {
  recentPointId.value = point.id
  uni.setStorageSync(recentPointKey, point.id)
  saveListState()
  uni.navigateTo({ url: `/pages/recite-detail/index?id=${encodeURIComponent(point.id)}` })
}
onShow(restoreListState)
</script>

<template>
  <view class="recite-page page safe-top">
    <view class="top-bar"><button @tap="back"><uni-icons type="back" size="21" color="#4d5c73" /></button><text>背题</text><view /></view>
    <view class="recite-header">
      <view class="header-main"><view class="header-icon"><uni-icons type="flag" size="27" color="#f2c76e" /></view><view class="header-copy"><text>智能背题</text><text>按科目章节选择知识点进行背题强化复习</text></view></view>
      <view class="header-count"><text>{{ recitablePointCount }}</text><text>可背知识点</text></view>
    </view>

    <scroll-view class="subject-tabs" scroll-x :show-scrollbar="false">
      <view class="subject-tabs-inner">
        <view v-for="subject in recitableSubjects" :key="subject.id" class="subject-tab" :class="{ active: selectedSubjectId === subject.id }" @tap="selectSubject(subject.id)">
          <text>{{ subjectShortName(subject.id, subject.name) }}</text>
        </view>
      </view>
    </scroll-view>

    <view v-if="selectedSubject" class="chapter-list">
      <view v-for="chapter in selectedSubject.chapters" :key="chapter.id" class="chapter-card">
        <view class="chapter-head" @tap="toggleChapter(chapter.id)">
          <view><text>第{{ chapter.no }}章</text><text>{{ chapter.name }}</text></view>
          <uni-icons :type="expandedChapterId === chapter.id ? 'arrowup' : 'arrowdown'" size="17" color="#8793a4" />
        </view>
        <view v-if="expandedChapterId === chapter.id" class="chapter-body">
          <view v-for="section in chapter.sections" :key="section.id" class="section-block">
            <view class="section-head" @tap="toggleSection(section.id)">
              <view><text>第{{ section.no }}节</text><text>{{ section.name }}</text></view>
              <uni-icons :type="expandedSectionId === section.id ? 'arrowup' : 'arrowdown'" size="16" color="#9aa5b4" />
            </view>
            <view v-if="expandedSectionId === section.id" class="point-list">
              <view v-for="point in section.points" :key="point.id" class="point-row" @tap="openPoint(point)">
                <view class="point-copy"><text class="point-title">{{ point.title }}</text><view class="point-meta"><text class="star-tag" :class="`star-${point.stars}`">{{ point.stars }}星</text><text v-if="recentPointId === point.id" class="recent-tag">最近查看</text></view></view>
                <uni-icons type="forward" size="18" color="#a4afbd" />
              </view>
            </view>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.recite-page { max-width:430px; min-height:100vh; margin:0 auto; box-sizing:border-box; padding-top:calc(env(safe-area-inset-top) + 18rpx); padding-bottom:42rpx; background:#f5f7fb; }
.top-bar { min-height:58rpx; display:grid; grid-template-columns:58rpx 1fr 58rpx; align-items:center; }
.top-bar button { width:58rpx; height:58rpx; display:flex; align-items:center; justify-content:center; margin:0; padding:0; background:#edf1fb; border-radius:15rpx; }
.top-bar button::after { display:none; }
.top-bar>text { color:#1e3048; font-size:var(--sxb-text-title); font-weight:700; text-align:center; }
.recite-header { position:relative; overflow:hidden; display:flex; align-items:center; justify-content:space-between; gap:15rpx; margin-top:20rpx; padding:22rpx 20rpx; color:#fff; background:linear-gradient(132deg,#172137 0%,#27345c 52%,#171c2e 100%); border:1rpx solid #47557b; border-radius:13rpx; box-shadow:0 14rpx 29rpx rgba(24,31,54,.22); }
.recite-header::after { position:absolute; right:-54rpx; top:-73rpx; width:190rpx; height:190rpx; content:''; border:24rpx solid rgba(242,199,110,.1); border-radius:50%; box-shadow:0 0 0 23rpx rgba(242,199,110,.035); }
.header-main { position:relative; z-index:1; display:flex; align-items:center; gap:13rpx; flex:1; min-width:0; }
.header-icon { width:56rpx; height:56rpx; display:flex; align-items:center; justify-content:center; flex:none; background:rgba(242,199,110,.12); border:1rpx solid rgba(242,199,110,.28); border-radius:13rpx; }
.header-copy { display:flex; flex:1; min-width:0; flex-direction:column; gap:6rpx; }
.header-copy text:first-child { color:#fff7e5; font-size:var(--sxb-text-title); font-weight:700; }
.header-copy text:last-child { color:#cbd3e7; font-size:var(--sxb-text-meta); line-height:1.45; }
.header-count { position:relative; z-index:1; width:88rpx; display:flex; align-items:center; flex:none; flex-direction:column; gap:4rpx; padding-left:14rpx; border-left:1rpx solid rgba(242,199,110,.25); }
.header-count text:first-child { color:#f2c76e; font-size:var(--sxb-text-page); line-height:1; font-weight:700; }
.header-count text:last-child { color:#cbd3e7; font-size:var(--sxb-text-meta); white-space:nowrap; }
.subject-tabs { width:100%; margin-top:18rpx; white-space:nowrap; }
.subject-tabs-inner { display:inline-flex; gap:9rpx; min-width:100%; }
.subject-tab { min-height:48rpx; display:flex; align-items:center; justify-content:center; box-sizing:border-box; padding:0 16rpx; color:#536987; background:#fff; border:1rpx solid #dce4ef; border-radius:8rpx; font-size:var(--sxb-text-small); font-weight:700; }
.subject-tab.active { color:#f5d58c; background:linear-gradient(110deg,#1d2945,#34426c); border-color:#4e5e88; box-shadow:0 6rpx 14rpx rgba(30,40,72,.14); }
.chapter-list { display:flex; flex-direction:column; gap:12rpx; margin-top:15rpx; }
.chapter-card { overflow:hidden; background:#fff; border:1rpx solid #dfe6f0; border-radius:12rpx; box-shadow:0 7rpx 18rpx rgba(51,74,115,.04); }
.chapter-head { display:flex; align-items:center; justify-content:space-between; gap:10rpx; padding:19rpx 17rpx; }
.chapter-head>view { display:flex; align-items:baseline; gap:9rpx; min-width:0; }
.chapter-head text:first-child { flex:none; color:#3e568e; font-size:var(--sxb-text-small); font-weight:700; }
.chapter-head text:last-child { overflow:hidden; color:#24364f; font-size:var(--sxb-text-body); font-weight:700; text-overflow:ellipsis; white-space:nowrap; }
.chapter-body { padding:0 14rpx 9rpx; border-top:1rpx solid #eef1f5; }
.section-block { overflow:hidden; margin-top:8rpx; background:#f7f8fc; border:1rpx solid #e1e5ef; border-radius:10rpx; }
.section-head { display:flex; align-items:center; justify-content:space-between; gap:9rpx; padding:11rpx 16rpx; }
.section-head>view { display:flex; align-items:baseline; gap:8rpx; min-width:0; }
.section-head text:first-child { flex:none; color:#5a6599; font-size:var(--sxb-text-meta); font-weight:700; }
.section-head text:last-child { overflow:hidden; color:#30425c; font-size:var(--sxb-text-body); font-weight:700; text-overflow:ellipsis; white-space:nowrap; }
.point-list { background:#fff; border-top:1rpx solid #e2e6ef; }
.point-row { display:flex; align-items:center; gap:10rpx; padding:18rpx 16rpx; border-bottom:1rpx solid #edf0f5; }
.point-row:last-child { border-bottom:0; }
.point-copy { flex:1; min-width:0; }
.point-title { display:block; color:#24364f; font-size:var(--sxb-text-body); line-height:1.55; }
.point-meta { display:flex; align-items:center; gap:8rpx; margin-top:9rpx; }
.star-tag { display:inline-block; margin-top:9rpx; padding:3rpx 8rpx; border-radius:5rpx; font-size:var(--sxb-text-meta); line-height:1.3; font-weight:700; }
.point-meta .star-tag { margin-top:0; }
.recent-tag { padding:3rpx 8rpx; color:#596887; background:#edf0f7; border-radius:5rpx; font-size:var(--sxb-text-meta); line-height:1.3; }
.star-1 { color:#6f7e91; background:#eef1f5; }.star-2 { color:#3d78b9; background:#eaf3ff; }.star-3 { color:#3569e8; background:#eaf0ff; }.star-4 { color:#6949df; background:#f0edff; }.star-5 { color:#d47a25; background:#fff2df; }

@import '@/styles/content-system.scss';
</style>
