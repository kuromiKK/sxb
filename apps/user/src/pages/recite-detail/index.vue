<script setup lang="ts">
import CircleAction from '@/components/ui/CircleAction.vue'
import { computed, ref } from 'vue'
import { onLoad, onShow, onHide, onUnload } from '@dcloudio/uni-app'
import uniIcons from '@dcloudio/uni-ui/lib/uni-icons/uni-icons.vue'
import { knowledgeSubjects } from '@/mock/data'
import { backOrFallback } from '@/utils/navigation'
import { api, token, selectedExamId, showApiError } from '@/services/api'

import { createLearningVisit } from '@/utils/learning-visit'
const visit=createLearningVisit()
onUnload(()=>visit.close())
onHide(()=>visit.leave())
onShow(()=>{if(record.value)recordRecite()})
type ContentPart = { id: string; text: string; blank: boolean }
const pointId = ref('')
const revealed = ref<Set<string>>(new Set())
const recentPointKey = 'recite-recent-point'
const allPoints = knowledgeSubjects.flatMap(subject => subject.chapters.flatMap(chapter => chapter.sections.flatMap(section => section.points
  .filter(point => Boolean(point.content?.trim()))
  .map(point => ({ point, subject, chapter, section })))))
const record = computed(() => allPoints.find(item => item.point.id === pointId.value) || allPoints.find(item => Boolean(item.point.content?.trim())) || allPoints[0])
const point = computed(() => record.value.point)
const currentIndex = computed(() => allPoints.findIndex(item => item.point.id === point.value.id))
const hasPrevious = computed(() => currentIndex.value > 0)
const hasNext = computed(() => currentIndex.value >= 0 && currentIndex.value < allPoints.length - 1)

const selectBlankTerms = (content: string) => {
  const preferred = ['社会问题', '社会公平', '社会治理', '社会建设', '服务对象', '社会功能', '资源链接', '能力提升', '社会秩序', '社会和谐', '党的全面领导', '以人民为中心', '体制机制', '效果评估', '人民至上', '服务计划', '专业关系', '优先顺序']
  const found = preferred.filter(term => content.includes(term)).slice(0, 5)
  if (found.length >= 2) return found
  const clauses = content.split(/[，。；、]/).map(item => item.trim()).filter(item => item.length >= 6)
  clauses.forEach(clause => {
    const length = Math.min(8, Math.max(4, Math.floor(clause.length / 2)))
    const term = clause.slice(-length)
    if (!found.includes(term)) found.push(term)
  })
  return found.slice(0, 5)
}

const contentParts = computed<ContentPart[]>(() => {
  const content = point.value.content
  const terms = selectBlankTerms(content).sort((a, b) => b.length - a.length)
  if (!terms.length) return [{ id: 'text-0', text: content, blank: false }]
  const escaped = terms.map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const matcher = new RegExp(`(${escaped.join('|')})`, 'g')
  return content.split(matcher).filter(Boolean).map((text, index) => ({ id: `part-${index}`, text, blank: terms.includes(text) }))
})
const blankParts = computed(() => contentParts.value.filter(part => part.blank))
const allRevealed = computed(() => blankParts.value.length > 0 && blankParts.value.every(part => revealed.value.has(part.id)))
const back = () => backOrFallback('/pages/recite/index')
const toggleBlank = (id: string) => {
  const next = new Set(revealed.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  revealed.value = next
}
const toggleAll = () => { revealed.value = allRevealed.value ? new Set() : new Set(blankParts.value.map(part => part.id)) }
const showPoint = (index: number) => {
  const target = allPoints[index]
  if (!target) return
  pointId.value = target.point.id
  revealed.value = new Set()
  uni.setStorageSync(recentPointKey, target.point.id)
  recordRecite()
  uni.pageScrollTo({ scrollTop: 0, duration: 180 })
}
const previousPoint = () => { if (hasPrevious.value) showPoint(currentIndex.value - 1) }
const nextPoint = () => {
  if (hasNext.value) showPoint(currentIndex.value + 1)
  else back()
}
onLoad((options) => {
  if (options?.id) pointId.value = decodeURIComponent(options.id)
  if(!record.value)return
  uni.setStorageSync(recentPointKey, point.value.id)
  recordRecite()
})
function recordRecite(){if(token()&&record.value)void visit.begin(point.value.id)}
</script>

<template>
  <view v-if="record" class="recite-detail page safe-top">
    <view class="top-bar"><CircleAction @tap="back"/><text>智能背题</text><view /></view>
    <view class="crumb"><text>{{ record.subject.name }}</text><uni-icons type="forward" size="13" color="#9ba6b5" /><text>第{{ record.chapter.no }}章</text><uni-icons type="forward" size="13" color="#9ba6b5" /><text>第{{ record.section.no }}节</text></view>
    <view class="point-hero">
      <view class="hero-icon"><uni-icons type="flag" size="25" color="#f2c76e" /></view>
      <view><text class="point-title">{{ point.title }}</text><text class="star-tag" :class="`star-${point.stars}`">{{ point.stars }}星</text></view>
    </view>
    <view class="content-card">
      <view class="card-head"><view><view class="title-bar" /><text>知识点内容</text></view><button @tap="toggleAll">{{ allRevealed ? '重新背诵' : '显示全部' }}</button></view>
      <view class="recite-content">
        <template v-for="part in contentParts" :key="part.id">
          <text v-if="!part.blank" class="plain-text">{{ part.text }}</text>
          <text v-else class="blank-text" :class="{ revealed: revealed.has(part.id) }" @tap="toggleBlank(part.id)">{{ revealed.has(part.id) ? part.text : '点击查看' }}</text>
        </template>
      </view>
    </view>
    <view class="point-navigation">
      <button class="previous-button" :disabled="!hasPrevious" @tap="previousPoint"><uni-icons type="back" size="18" :color="hasPrevious ? '#52617b' : '#b8c0cd'" /><text>上一知识点</text></button>
      <button class="next-button" @tap="nextPoint"><text>{{ hasNext ? '下一知识点' : '返回背题列表' }}</text><uni-icons :type="hasNext ? 'forward' : 'list'" size="18" color="#f5d58c" /></button>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.recite-detail { max-width:430px; min-height:100vh; margin:0 auto; box-sizing:border-box; padding-top:calc(env(safe-area-inset-top) + 18rpx); padding-bottom:calc(env(safe-area-inset-bottom) + 150rpx); background:#f5f7fb; }
.top-bar { min-height:58rpx; display:grid; grid-template-columns:58rpx 1fr 58rpx; align-items:center; }
.top-bar button { width:58rpx; height:58rpx; display:flex; align-items:center; justify-content:center; margin:0; padding:0; background:#edf1fb; border-radius:15rpx; }.top-bar button::after { display:none; }
.top-bar>text { color:#1e3048; font-size:var(--sxb-text-title); font-weight:700; text-align:center; }
.crumb { display:flex; align-items:center; gap:4rpx; margin-top:18rpx; overflow:hidden; color:#8b96a5; font-size:var(--sxb-text-meta); white-space:nowrap; }
.crumb text { overflow:hidden; text-overflow:ellipsis; }
.point-hero { position:relative; overflow:hidden; display:flex; align-items:flex-start; gap:13rpx; margin-top:17rpx; padding:22rpx; color:#fff; background:linear-gradient(132deg,#172137 0%,#27345c 52%,#171c2e 100%); border:1rpx solid #47557b; border-radius:15rpx; box-shadow:0 14rpx 29rpx rgba(24,31,54,.2); }
.point-hero::after { position:absolute; right:-55rpx; top:-70rpx; width:180rpx; height:180rpx; content:''; border:23rpx solid rgba(242,199,110,.09); border-radius:50%; }
.hero-icon { position:relative; z-index:1; width:50rpx; height:50rpx; display:flex; align-items:center; justify-content:center; flex:none; background:rgba(242,199,110,.12); border:1rpx solid rgba(242,199,110,.27); border-radius:13rpx; }
.point-hero>view:last-child { position:relative; z-index:1; flex:1; min-width:0; }
.point-title { display:block; color:#fff7e5; font-size:var(--sxb-text-item); line-height:1.5; font-weight:700; }
.star-tag { display:inline-block; margin-top:10rpx; padding:4rpx 9rpx; color:#10644f; background:#fff; border-radius:5rpx; font-size:var(--sxb-text-meta); line-height:1.25; font-weight:700; }
.star-4,.star-5 { color:#9b611c; background:#fff3da; }
.content-card { margin-top:17rpx; padding:21rpx; background:#fff; border:1rpx solid #dfe6f0; border-radius:13rpx; box-shadow:0 7rpx 19rpx rgba(51,74,115,.04); }
.card-head { display:flex; align-items:center; justify-content:space-between; gap:10rpx; padding-bottom:17rpx; border-bottom:1rpx solid #e9edf3; }
.card-head>view { display:flex; align-items:center; gap:8rpx; color:#22354e; font-size:var(--sxb-text-body); font-weight:700; }
.title-bar { width:5rpx; height:26rpx; background:#3f568e; border-radius:5rpx; }
.card-head button { width:auto; height:44rpx; display:flex; align-items:center; margin:0; padding:0 12rpx; color:#465b8e; background:#edf0f8; border-radius:7rpx; font-size:var(--sxb-text-meta); font-weight:700; }.card-head button::after { display:none; }
.recite-content { margin-top:20rpx; color:#26384f; font-size:var(--sxb-text-page); line-height:1.9; font-weight:650; }
.plain-text,.blank-text { font-size:var(--sxb-text-page); line-height:1.9; }
.blank-text { display:inline; margin:0 5rpx; padding:3rpx 10rpx 5rpx; color:#435b92; background:#edf1fa; border-bottom:4rpx solid #526aa2; border-radius:6rpx 6rpx 2rpx 2rpx; font-size:var(--sxb-text-title); font-weight:700; white-space:nowrap; }
.blank-text.revealed { color:#8c5d1d; background:#fff3da; border-bottom-color:#e0a546; font-size:var(--sxb-text-page); }
.point-navigation { position:fixed; z-index:20; left:50%; bottom:0; width:min(430px,100%); box-sizing:border-box; display:grid; grid-template-columns:1fr 1.18fr; gap:10rpx; padding:14rpx 20px calc(env(safe-area-inset-bottom) + 14rpx); background:rgba(245,247,251,.96); border-top:1rpx solid #dfe5ef; box-shadow:0 -10rpx 26rpx rgba(33,48,74,.08); transform:translateX(-50%); backdrop-filter:blur(10px); }
.point-navigation button { height:62rpx; display:flex; align-items:center; justify-content:center; gap:6rpx; margin:0; padding:0 12rpx; border-radius:9rpx; font-size:var(--sxb-text-small); font-weight:700; }
.point-navigation button::after { display:none; }
.previous-button { color:#52617b; background:#fff; border:1rpx solid #dce3ed; }
.previous-button[disabled] { color:#b8c0cd; background:#eef1f5; opacity:1; }
.next-button { color:#fff7e5; background:linear-gradient(115deg,#1d2945,#34426c); border:1rpx solid #4e5e88; box-shadow:0 7rpx 16rpx rgba(30,40,72,.18); }

@import '@/styles/content-system.scss';
</style>
