<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import uniIcons from '@dcloudio/uni-ui/lib/uni-icons/uni-icons.vue'
import { knowledgeSubjects, type KnowledgePoint } from '@/mock/data'

const emit = defineEmits<{
  open: [point: KnowledgePoint]
  practice: [sectionId: string]
}>()

const selectedSubjectId = ref(knowledgeSubjects[0]?.id || '')
const selectedChapterId = ref(knowledgeSubjects[0]?.chapters[0]?.id || '')
const selectedSectionId = ref(knowledgeSubjects[0]?.chapters[0]?.sections[0]?.id || '')
const selectedPointId = ref('')

const subject = computed(() => knowledgeSubjects.find(item => item.id === selectedSubjectId.value) || knowledgeSubjects[0])
const chapter = computed(() => subject.value.chapters.find(item => item.id === selectedChapterId.value) || subject.value.chapters[0])
const section = computed(() => chapter.value.sections.find(item => item.id === selectedSectionId.value) || chapter.value.sections[0])
const priorityPoints = computed(() => section.value?.points.filter(point => point.stars >= 3) || [])
const selectedPoint = computed(() => priorityPoints.value.find(point => point.id === selectedPointId.value) || priorityPoints.value[0])
const masteredCount = computed(() => priorityPoints.value.filter(point => point.mastery >= 60).length)

watch(priorityPoints, points => { selectedPointId.value = points[0]?.id || '' }, { immediate: true })

const selectSubject = (id: string) => {
  selectedSubjectId.value = id
  const nextSubject = knowledgeSubjects.find(item => item.id === id)
  selectedChapterId.value = nextSubject?.chapters[0]?.id || ''
  selectedSectionId.value = nextSubject?.chapters[0]?.sections[0]?.id || ''
}
const selectChapter = (id: string) => {
  selectedChapterId.value = id
  selectedSectionId.value = subject.value.chapters.find(item => item.id === id)?.sections[0]?.id || ''
}
const selectSection = (id: string) => { selectedSectionId.value = id }
const pointGroup = (point: KnowledgePoint, index: number) => {
  if (/原则|要求|边界/.test(point.title)) return '核心原则'
  if (/步骤|流程|方法|策略/.test(point.title)) return '方法路径'
  if (/情境|处理|案例|判断/.test(point.title)) return '实务判断'
  return ['重点概念', '高频考法', '关键辨析'][index % 3]
}
</script>

<template>
  <view class="mind-map-view">
    <view class="map-overview">
      <view><text class="view-kicker">SECTION MIND MAP</text><text class="view-title">节级思维导图</text></view>
      <view class="overview-count"><text>{{ priorityPoints.length }}</text><text>重点节点</text></view>
    </view>

    <scroll-view scroll-x class="subject-tabs" :show-scrollbar="false">
      <view class="tab-row">
        <button v-for="item in knowledgeSubjects" :key="item.id" :class="{ active: selectedSubjectId === item.id }" @tap="selectSubject(item.id)">{{ item.name.split('（')[0] }}</button>
      </view>
    </scroll-view>

    <view class="selector-block">
      <scroll-view scroll-x class="selector-scroll" :show-scrollbar="false">
        <view class="selector-row chapter-row">
          <button v-for="item in subject.chapters" :key="item.id" :class="{ active: selectedChapterId === item.id }" @tap="selectChapter(item.id)"><text>第{{ item.no }}章</text><text>{{ item.name }}</text></button>
        </view>
      </scroll-view>
      <scroll-view scroll-x class="selector-scroll section-scroll" :show-scrollbar="false">
        <view class="selector-row section-row">
          <button v-for="item in chapter.sections" :key="item.id" :class="{ active: selectedSectionId === item.id }" @tap="selectSection(item.id)">第{{ item.no }}节 {{ item.name }}</button>
        </view>
      </scroll-view>
    </view>

    <view v-if="priorityPoints.length" class="mind-canvas">
      <view class="mind-root">
        <view class="root-icon"><uniIcons type="map" size="19" color="#fff" /></view>
        <text>第{{ section.no }}节</text>
        <text>{{ section.name }}</text>
        <view class="root-progress"><view :style="{ width: `${priorityPoints.length ? masteredCount / priorityPoints.length * 100 : 0}%` }" /></view>
      </view>
      <view class="branch-stack">
        <view v-for="(point, index) in priorityPoints" :key="point.id" class="mind-branch">
          <view class="branch-line"><span /></view>
          <button class="mind-node" :class="[`star-${point.stars}`, { selected: selectedPointId === point.id }]" @tap="selectedPointId = point.id">
            <view class="node-head"><text>{{ pointGroup(point, index) }}</text><text>{{ point.stars }}星</text></view>
            <text class="node-title">{{ point.title }}</text>
            <view class="node-foot"><text>掌握 {{ point.mastery }}%</text><text>{{ point.questionTotal }} 题</text></view>
          </button>
        </view>
      </view>
    </view>

    <view v-else class="map-empty"><uniIcons type="map" size="28" color="#9aa6b6" /><text>本节暂无三星以上知识点</text></view>

    <view v-if="selectedPoint" class="node-detail">
      <view class="detail-head"><view><text class="detail-label">当前节点</text><text class="detail-title">{{ selectedPoint.title }}</text></view><text class="detail-star">{{ selectedPoint.stars }}星</text></view>
      <text class="detail-summary">{{ selectedPoint.content }}</text>
      <view class="detail-stats"><view><text>{{ selectedPoint.mastery }}%</text><text>掌握度</text></view><view><text>{{ selectedPoint.questionDone }}/{{ selectedPoint.questionTotal }}</text><text>完成题目</text></view><view><text>{{ selectedPoint.courseMeta.replace('精讲课 · ', '') }}</text><text>配套课程</text></view></view>
      <view class="detail-actions"><button @tap="emit('practice', section.id)"><uniIcons type="compose" size="17" color="#40577a" />练习本节</button><button class="primary" @tap="emit('open', selectedPoint)">查看知识点<uniIcons type="forward" size="16" color="#fff" /></button></view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.mind-map-view{margin-top:20rpx}.map-overview{display:flex;align-items:center;justify-content:space-between;gap:16rpx}.map-overview>view:first-child{display:flex;flex-direction:column;gap:4rpx}.view-kicker{color:#6949df;font-size:17rpx;font-weight:850}.view-title{color:#182a43;font-size:27rpx;font-weight:900}.overview-count{min-width:76rpx;padding:9rpx 12rpx;display:flex;align-items:flex-end;justify-content:center;gap:4rpx;color:#7c899c;background:#fff;border:1rpx solid #dfe5ee;border-radius:8rpx}.overview-count text:first-child{color:#273d60;font-size:26rpx;line-height:1;font-weight:900}.overview-count text:last-child{font-size:15rpx}.subject-tabs{width:100%;margin-top:16rpx;white-space:nowrap}.tab-row{display:inline-flex;gap:8rpx}.tab-row button{width:auto;height:44rpx;line-height:42rpx;margin:0;padding:0 14rpx;color:#617087;background:#fff;border:1rpx solid #dce3ed;border-radius:7rpx;font-size:19rpx;font-weight:750}.tab-row button.active{color:#fff;background:#293d67;border-color:#293d67}.tab-row button::after,.selector-row button::after,.mind-node::after,.detail-actions button::after{display:none}.selector-block{margin-top:13rpx;padding:12rpx;background:#fff;border:1rpx solid #dfe5ee;border-radius:10rpx}.selector-scroll{width:100%;white-space:nowrap}.selector-row{display:inline-flex;gap:8rpx}.selector-row button{width:210rpx;height:55rpx;display:flex;align-items:flex-start;justify-content:center;flex-direction:column;gap:3rpx;margin:0;padding:0 11rpx;color:#5f7087;background:#f6f8fb;border:1rpx solid #e5e9f0;border-radius:7rpx;text-align:left}.selector-row button text:first-child{font-size:16rpx;font-weight:850}.selector-row button text:last-child{width:100%;overflow:hidden;font-size:18rpx;text-overflow:ellipsis;white-space:nowrap}.selector-row button.active{color:#315fae;background:#edf3ff;border-color:#a9c2f1}.section-scroll{margin-top:9rpx}.section-row button{width:auto;max-width:320rpx;height:39rpx;display:block;line-height:37rpx;padding:0 11rpx;overflow:hidden;font-size:17rpx;text-overflow:ellipsis;white-space:nowrap}.section-row button.active{color:#6949df;background:#f1effc;border-color:#c9c0ef}.mind-canvas{position:relative;min-height:300rpx;margin-top:14rpx;padding:18rpx 12rpx 18rpx 190rpx;overflow:hidden;background:#f7f9fd;border:1rpx solid #dce4ef;border-radius:12rpx}.mind-canvas::before{position:absolute;left:174rpx;top:0;bottom:0;width:1rpx;content:'';background:#d9e2f1}.mind-root{position:absolute;z-index:2;left:13rpx;top:50%;width:145rpx;min-height:112rpx;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:4rpx;padding:12rpx 10rpx;color:#fff;background:#273a63;border:4rpx solid #dce5f7;border-radius:12rpx;transform:translateY(-50%);box-shadow:0 10rpx 22rpx rgba(37,54,94,.2)}.root-icon{width:32rpx;height:32rpx;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.12);border-radius:8rpx}.mind-root>text:nth-child(2){color:#bfcbea;font-size:15rpx;font-weight:800}.mind-root>text:nth-child(3){display:-webkit-box;overflow:hidden;font-size:18rpx;line-height:1.35;text-align:center;font-weight:850;-webkit-box-orient:vertical;-webkit-line-clamp:2}.root-progress{width:100%;height:4rpx;margin-top:3rpx;overflow:hidden;background:rgba(255,255,255,.16);border-radius:4rpx}.root-progress view{height:100%;background:#e4bf67}.branch-stack{display:flex;flex-direction:column;gap:10rpx}.mind-branch{position:relative;display:flex;align-items:center}.branch-line{position:absolute;left:-17rpx;width:17rpx;height:2rpx;background:#bdcbe2}.branch-line span{position:absolute;right:-3rpx;top:-3rpx;width:8rpx;height:8rpx;background:#8ba5d1;border:2rpx solid #f7f9fd;border-radius:50%}.mind-node{width:100%;min-height:98rpx;display:flex;align-items:stretch;justify-content:center;flex-direction:column;gap:6rpx;margin:0;padding:11rpx 12rpx;color:#34465f;background:#fff;border:1rpx solid #d9e2ee;border-left:5rpx solid #3569e8;border-radius:9rpx;text-align:left;box-shadow:0 5rpx 12rpx rgba(45,66,104,.05)}.mind-node.selected{border-color:#879fd0;box-shadow:0 0 0 2rpx rgba(77,105,169,.12),0 8rpx 16rpx rgba(45,66,104,.09)}.mind-node.star-4{border-left-color:#6949df}.mind-node.star-5{border-left-color:#d89a35}.node-head,.node-foot{display:flex;align-items:center;justify-content:space-between;gap:8rpx}.node-head text:first-child{color:#6f7f95;font-size:15rpx;font-weight:800}.node-head text:last-child{padding:2rpx 6rpx;color:#6949df;background:#f1effc;border-radius:4rpx;font-size:14rpx;font-weight:850}.star-5 .node-head text:last-child{color:#b46c16;background:#fff2df}.node-title{display:-webkit-box;overflow:hidden;color:#263b57;font-size:19rpx;line-height:1.4;font-weight:800;-webkit-box-orient:vertical;-webkit-line-clamp:2}.node-foot{color:#8a96a6;font-size:15rpx}.map-empty{min-height:240rpx;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:10rpx;margin-top:14rpx;color:#8b98a9;background:#fff;border:1rpx solid #dfe5ee;border-radius:11rpx;font-size:19rpx}.node-detail{margin-top:14rpx;padding:17rpx;background:#fff;border:1rpx solid #dfe5ee;border-radius:11rpx;box-shadow:0 7rpx 18rpx rgba(45,66,104,.05)}.detail-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12rpx}.detail-head>view{display:flex;flex:1;min-width:0;flex-direction:column;gap:5rpx}.detail-label{color:#6949df;font-size:16rpx;font-weight:850}.detail-title{color:#24374f;font-size:22rpx;line-height:1.45;font-weight:850}.detail-star{flex:none;padding:4rpx 8rpx;color:#a76816;background:#fff2df;border-radius:5rpx;font-size:16rpx;font-weight:850}.detail-summary{display:-webkit-box;overflow:hidden;margin-top:10rpx;color:#66768b;font-size:19rpx;line-height:1.65;-webkit-box-orient:vertical;-webkit-line-clamp:3}.detail-stats{display:grid;grid-template-columns:repeat(3,1fr);margin-top:14rpx;padding:12rpx 0;background:#f6f8fb;border-radius:8rpx}.detail-stats view{display:flex;align-items:center;flex-direction:column;gap:4rpx;border-right:1rpx solid #e2e7ee}.detail-stats view:last-child{border-right:0}.detail-stats text:first-child{color:#2e4261;font-size:20rpx;font-weight:900}.detail-stats text:last-child{color:#8a96a6;font-size:15rpx}.detail-actions{display:flex;gap:9rpx;margin-top:14rpx}.detail-actions button{height:48rpx;display:flex;align-items:center;justify-content:center;gap:4rpx;flex:1;margin:0;padding:0;color:#40577a;background:#edf2f8;border-radius:7rpx;font-size:18rpx;font-weight:800}.detail-actions button.primary{color:#fff;background:#3569e8}
</style>

<style lang="scss" scoped>
.selector-scroll{height:82rpx}.section-scroll{height:45rpx}.selector-row button{width:230rpx;height:82rpx;padding:0 12rpx;gap:5rpx;line-height:1.3}.selector-row button text:first-child{font-size:17rpx;line-height:1.3}.selector-row button text:last-child{font-size:19rpx;line-height:1.35}.section-row button{width:auto;max-width:340rpx;height:45rpx;line-height:43rpx;padding:0 12rpx;font-size:18rpx}.node-title{font-size:20rpx;line-height:1.45}.node-foot{font-size:16rpx}
</style>
