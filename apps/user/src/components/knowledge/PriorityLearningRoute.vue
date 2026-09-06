<script setup lang="ts">
import { computed, ref } from 'vue'
import uniIcons from '@dcloudio/uni-ui/lib/uni-icons/uni-icons.vue'
import { knowledgeSubjects, type KnowledgePoint } from '@/mock/data'

type RouteFilter = 'all' | 'five' | 'weak'
const emit = defineEmits<{
  open: [point: KnowledgePoint]
  practice: [sectionId: string]
}>()
const selectedSubjectId = ref(knowledgeSubjects[0]?.id || '')
const selectedChapterId = ref(knowledgeSubjects[0]?.chapters[0]?.id || '')
const filter = ref<RouteFilter>('all')
const expandedSectionId = ref('')

const subject = computed(() => knowledgeSubjects.find(item => item.id === selectedSubjectId.value) || knowledgeSubjects[0])
const chapter = computed(() => subject.value.chapters.find(item => item.id === selectedChapterId.value) || subject.value.chapters[0])
const priorityPoints = computed(() => chapter.value.sections.flatMap(section => section.points.filter(point => point.stars >= 3)))
const completedPoints = computed(() => priorityPoints.value.filter(point => point.mastery >= 60).length)
const completion = computed(() => priorityPoints.value.length ? Math.round(completedPoints.value / priorityPoints.value.length * 100) : 0)
const routeSections = computed(() => chapter.value.sections.map(section => {
  const points = section.points.filter(point => point.stars >= 3).filter(point => filter.value === 'five' ? point.stars === 5 : filter.value === 'weak' ? point.mastery < 60 : true)
  return { ...section, points }
}).filter(section => section.points.length))

const selectSubject = (id: string) => {
  selectedSubjectId.value = id
  selectedChapterId.value = knowledgeSubjects.find(item => item.id === id)?.chapters[0]?.id || ''
  expandedSectionId.value = ''
}
const selectChapter = (id: string) => { selectedChapterId.value = id; expandedSectionId.value = '' }
const filterOptions: Array<{ key: RouteFilter; label: string }> = [
  { key: 'all', label: '全部重点' },
  { key: 'five', label: '五星必会' },
  { key: 'weak', label: '待强化' },
]
</script>

<template>
  <view class="route-view">
    <view class="route-hero">
      <view class="route-hero-copy"><text class="view-kicker">PRIORITY ROUTE</text><text class="view-title">重点知识路线</text><text class="route-subtitle">{{ chapter.name }}</text></view>
      <view class="route-ring" :style="{ '--progress': `${completion * 3.6}deg` }"><view><text>{{ completion }}%</text><text>本章掌握</text></view></view>
    </view>

    <view class="subject-switch">
      <button v-for="item in knowledgeSubjects" :key="item.id" :class="{ active: selectedSubjectId === item.id }" @tap="selectSubject(item.id)">{{ item.name.split('（')[0] }}</button>
    </view>
    <scroll-view scroll-x class="chapter-scroll" :show-scrollbar="false">
      <view class="chapter-track">
        <button v-for="item in subject.chapters" :key="item.id" :class="{ active: selectedChapterId === item.id }" @tap="selectChapter(item.id)"><text>第{{ item.no }}章</text><text>{{ item.name }}</text></button>
      </view>
    </scroll-view>

    <view class="route-summary">
      <view><text>{{ priorityPoints.length }}</text><text>重点知识</text></view><view><text>{{ priorityPoints.filter(point => point.stars === 5).length }}</text><text>五星必会</text></view><view><text>{{ priorityPoints.filter(point => point.mastery < 60).length }}</text><text>待强化</text></view>
    </view>
    <view class="filter-bar"><button v-for="item in filterOptions" :key="item.key" :class="{ active: filter === item.key }" @tap="filter = item.key">{{ item.label }}</button></view>

    <view v-if="routeSections.length" class="learning-route">
      <view v-for="(section, sectionIndex) in routeSections" :key="section.id" class="route-section">
        <view class="route-axis"><view class="axis-node" :class="{ done: section.points.every(point => point.mastery >= 60) }">{{ sectionIndex + 1 }}</view><view class="axis-line" /></view>
        <view class="route-content">
          <view class="section-heading">
            <view><text>第{{ section.no }}节</text><text>{{ section.name }}</text></view>
            <button @tap="emit('practice', section.id)"><uniIcons type="compose" size="15" color="#40577a" />练习</button>
          </view>
          <view class="route-points">
            <button v-for="point in section.points" :key="point.id" class="route-point" :class="{ expanded: expandedSectionId === point.id, mastered: point.mastery >= 60 }" @tap="expandedSectionId = expandedSectionId === point.id ? '' : point.id">
              <view class="point-state"><uniIcons :type="point.mastery >= 60 ? 'checkmarkempty' : 'circle'" size="17" :color="point.mastery >= 60 ? '#fff' : '#7f91ad'" /></view>
              <view class="point-content"><view class="point-head"><text>{{ point.stars }}星</text><text>掌握 {{ point.mastery }}%</text></view><text class="point-title">{{ point.title }}</text><view v-if="expandedSectionId === point.id" class="point-expanded"><text>{{ point.content }}</text><view><text>{{ point.questionDone }}/{{ point.questionTotal }} 题</text><button @tap.stop="emit('open', point)">查看详情<uniIcons type="forward" size="14" color="#3569e8" /></button></view></view></view>
            </button>
          </view>
        </view>
      </view>
    </view>
    <view v-else class="route-empty"><uniIcons type="list" size="27" color="#9aa6b6" /><text>当前筛选下暂无知识点</text><button @tap="filter = 'all'">查看全部重点</button></view>
  </view>
</template>

<style lang="scss" scoped>
.route-view{margin-top:20rpx}.route-hero{display:flex;align-items:center;justify-content:space-between;gap:16rpx;padding:18rpx;color:#fff;background:#273a63;border:1rpx solid #41547d;border-radius:11rpx;box-shadow:0 10rpx 24rpx rgba(34,50,87,.16)}.route-hero-copy{display:flex;min-width:0;flex-direction:column;gap:5rpx}.view-kicker{color:#e4bf67;font-size:16rpx;font-weight:850}.view-title{font-size:27rpx;font-weight:900}.route-subtitle{max-width:245rpx;overflow:hidden;color:#c7d1e5;font-size:18rpx;text-overflow:ellipsis;white-space:nowrap}.route-ring{--progress:0deg;width:77rpx;height:77rpx;display:flex;align-items:center;justify-content:center;flex:none;background:conic-gradient(#e4bf67 var(--progress),rgba(255,255,255,.13) 0);border-radius:50%}.route-ring>view{width:62rpx;height:62rpx;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:2rpx;background:#273a63;border-radius:50%}.route-ring text:first-child{font-size:20rpx;font-weight:900}.route-ring text:last-child{color:#c7d1e5;font-size:13rpx}.subject-switch{display:grid;grid-template-columns:repeat(2,1fr);gap:8rpx;margin-top:13rpx}.subject-switch button{height:45rpx;line-height:43rpx;margin:0;padding:0;color:#64748a;background:#fff;border:1rpx solid #dce3ed;border-radius:7rpx;font-size:19rpx;font-weight:750}.subject-switch button.active{color:#315fae;background:#edf3ff;border-color:#aac1ef}.subject-switch button::after,.chapter-track button::after,.filter-bar button::after,.section-heading button::after,.route-point::after,.point-expanded button::after,.route-empty button::after{display:none}.chapter-scroll{width:100%;margin-top:10rpx;white-space:nowrap}.chapter-track{display:inline-flex;gap:8rpx}.chapter-track button{width:205rpx;height:55rpx;display:flex;align-items:flex-start;justify-content:center;flex-direction:column;gap:3rpx;margin:0;padding:0 11rpx;color:#617087;background:#fff;border:1rpx solid #dfe5ed;border-radius:7rpx;text-align:left}.chapter-track text:first-child{color:#486188;font-size:15rpx;font-weight:850}.chapter-track text:last-child{width:100%;overflow:hidden;font-size:18rpx;text-overflow:ellipsis;white-space:nowrap}.chapter-track button.active{color:#fff;background:#40557d;border-color:#40557d}.chapter-track button.active text:first-child{color:#e2e8f4}.route-summary{display:grid;grid-template-columns:repeat(3,1fr);margin-top:13rpx;padding:13rpx 3rpx;background:#fff;border:1rpx solid #dfe5ed;border-radius:9rpx}.route-summary view{display:flex;align-items:center;flex-direction:column;gap:3rpx;border-right:1rpx solid #e5e9ef}.route-summary view:last-child{border-right:0}.route-summary text:first-child{color:#293e5d;font-size:24rpx;font-weight:900}.route-summary text:last-child{color:#8592a3;font-size:15rpx}.filter-bar{display:flex;gap:7rpx;margin-top:11rpx}.filter-bar button{width:auto;height:38rpx;line-height:36rpx;margin:0;padding:0 12rpx;color:#6e7d91;background:#edf1f6;border-radius:7rpx;font-size:17rpx}.filter-bar button.active{color:#fff;background:#6949df;font-weight:800}.learning-route{margin-top:15rpx}.route-section{display:grid;grid-template-columns:37rpx 1fr;gap:9rpx}.route-axis{display:flex;align-items:center;flex-direction:column}.axis-node{position:relative;z-index:1;width:29rpx;height:29rpx;display:flex;align-items:center;justify-content:center;color:#546985;background:#eef2f8;border:2rpx solid #a9b7ca;border-radius:50%;font-size:15rpx;font-weight:900}.axis-node.done{color:#fff;background:#1a9a7b;border-color:#1a9a7b}.axis-line{width:2rpx;min-height:60rpx;flex:1;background:#d8e0eb}.route-section:last-child .axis-line{background:linear-gradient(#d8e0eb,transparent)}.route-content{min-width:0;padding-bottom:16rpx}.section-heading{min-height:29rpx;display:flex;align-items:center;justify-content:space-between;gap:10rpx}.section-heading>view{display:flex;min-width:0;flex-direction:column;gap:3rpx}.section-heading>view text:first-child{color:#6949df;font-size:15rpx;font-weight:850}.section-heading>view text:last-child{overflow:hidden;color:#243750;font-size:21rpx;font-weight:850;text-overflow:ellipsis;white-space:nowrap}.section-heading>button{width:auto;height:34rpx;display:flex;align-items:center;gap:3rpx;flex:none;margin:0;padding:0 9rpx;color:#40577a;background:#edf2f8;border-radius:6rpx;font-size:16rpx;font-weight:800}.route-points{display:flex;flex-direction:column;gap:8rpx;margin-top:9rpx}.route-point{width:100%;min-height:75rpx;display:flex;align-items:flex-start;gap:10rpx;margin:0;padding:12rpx;color:#34465f;background:#fff;border:1rpx solid #dfe5ed;border-radius:8rpx;text-align:left;box-shadow:0 5rpx 12rpx rgba(45,66,104,.04)}.route-point.expanded{border-color:#a9bde3;box-shadow:0 0 0 2rpx rgba(87,111,166,.08)}.point-state{width:24rpx;height:24rpx;display:flex;align-items:center;justify-content:center;flex:none;margin-top:2rpx;background:#edf1f6;border-radius:50%}.route-point.mastered .point-state{background:#1a9a7b}.point-content{display:flex;flex:1;min-width:0;flex-direction:column;gap:5rpx}.point-head{display:flex;align-items:center;justify-content:space-between;gap:8rpx}.point-head text:first-child{padding:2rpx 6rpx;color:#a76816;background:#fff2df;border-radius:4rpx;font-size:14rpx;font-weight:850}.point-head text:last-child{color:#8290a2;font-size:15rpx}.point-title{color:#2c405b;font-size:19rpx;line-height:1.5;font-weight:780}.point-expanded{padding-top:9rpx;border-top:1rpx solid #e8ecf2}.point-expanded>text{display:block;color:#68788d;font-size:18rpx;line-height:1.6}.point-expanded>view{display:flex;align-items:center;justify-content:space-between;margin-top:9rpx;color:#8b97a7;font-size:15rpx}.point-expanded button{width:auto;height:32rpx;display:flex;align-items:center;gap:2rpx;margin:0;padding:0 3rpx;color:#3569e8;background:transparent;font-size:16rpx;font-weight:800}.route-empty{min-height:230rpx;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:9rpx;margin-top:14rpx;color:#8a97a8;background:#fff;border:1rpx solid #dfe5ed;border-radius:10rpx;font-size:18rpx}.route-empty button{width:auto;height:38rpx;line-height:36rpx;margin:4rpx 0 0;padding:0 12rpx;color:#6949df;background:#f1effc;border-radius:6rpx;font-size:17rpx;font-weight:800}
</style>

<style lang="scss" scoped>
.chapter-scroll{height:82rpx}.chapter-track button{width:230rpx;height:82rpx;padding:0 12rpx;gap:5rpx;line-height:1.3}.chapter-track text:first-child{font-size:16rpx;line-height:1.3}.chapter-track text:last-child{font-size:19rpx;line-height:1.35}
</style>
