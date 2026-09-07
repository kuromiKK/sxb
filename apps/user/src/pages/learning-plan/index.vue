<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import uniIcons from '@dcloudio/uni-ui/lib/uni-icons/uni-icons.vue'
import { useAppStore } from '@/store/app'
import { backOrFallback } from '@/utils/navigation'
import { getPlanQuestions, loadPlan, savePlan, type PlanSource, type PracticePlan } from '@/utils/practice-plan'
import DebugMenu from '@/components/DebugMenu.vue'
import { knowledgeSubjects, practiceQuestions } from '@/mock/data'

const uni = (globalThis as any).uni

const { state, exam, requireLogin } = useAppStore()
const plan = ref<PracticePlan>(loadPlan(exam.value.id, exam.value.daysLeft))
const debugState = ref((uni.getStorageSync('sxb-debug-state-学习计划') || 'normal') as string)
const returnUrl = ref('/pages/practice/index')
const selectedSubjects = ref<string[]>([...plan.value.subjectIds])
const selectedYears = ref<string[]>([...plan.value.years])
const selectedSources = ref<PlanSource[]>([...plan.value.sources])
const target = ref(plan.value.target)
const targetCustomized = ref(plan.value.targetCustomized === true)
const years = Array.from(new Set(practiceQuestions.map(item => item.year))).sort((a, b) => Number(b) - Number(a))
const sourceOptions: Array<{ key: PlanSource; label: string }> = [{ key: 'chapter', label: '章节题库' }, { key: 'favorite', label: '我的收藏' }, { key: 'wrong', label: '错题本' }]
const selectedQuestions = computed(() => debugState.value === 'empty' ? [] : getPlanQuestions({ subjectIds: selectedSubjects.value, years: selectedYears.value, sources: selectedSources.value }))
const allSelected = computed(() => selectedSubjects.value.length === knowledgeSubjects.length && selectedYears.value.length === years.length && selectedSources.value.length === sourceOptions.length)
const daysLeft = computed(() => debugState.value === 'days30' ? 30 : exam.value.daysLeft)
const total = computed(() => debugState.value === 'empty' ? 0 : selectedQuestions.value.length)
const minimum = computed(() => Math.max(total.value ? Math.ceil(Math.max(total.value - state.todayDone, 0) / Math.max(daysLeft.value, 1)) : 0, 0))
const sliderMax = computed(() => Math.max(minimum.value + 100, 100))
const sourceSummary = computed(() => sourceOptions.filter(item => selectedSources.value.includes(item.key)).map(item => item.label).join('、') || '暂未选择')
const changeTarget = (amount: number) => {
  targetCustomized.value = true
  target.value = Math.min(Math.max(target.value + amount, 0), sliderMax.value)
}
const changeSlider = (event: any) => {
  targetCustomized.value = true
  target.value = Math.max(Number(event.detail.value), 0)
}
const setQuickTarget = (value: number) => {
  targetCustomized.value = true
  target.value = value
}
watch(minimum, next => {
  if (!targetCustomized.value) target.value = next
}, { immediate: true })
const back = () => backOrFallback(returnUrl.value)
const toggle = (list: string[], value: string) => { const index = list.indexOf(value); index >= 0 ? list.splice(index, 1) : list.push(value) }
const save = async () => {
  const next: PracticePlan = { ...plan.value, subjectIds: [...selectedSubjects.value], years: [...selectedYears.value], sources: [...selectedSources.value], total: total.value, minTarget: minimum.value, target: Math.max(target.value, 0), targetCustomized: targetCustomized.value, updatedAt: Date.now() }
  await savePlan(next); state.todayTarget = next.target; plan.value = next
  uni.showToast({ title: '学习计划已更新', icon: 'success' })
  setTimeout(() => uni.reLaunch({ url: returnUrl.value }), 700)
}
const applyDebug = (key: string) => { debugState.value = key }
onLoad((options?: Record<string, string>) => {
  if (options?.returnUrl) returnUrl.value = decodeURIComponent(options.returnUrl)
})
if (!requireLogin('/pages/learning-plan/index')) {
  // The guard performs the redirect; keeping the page mounted avoids a flash of an empty route.
}
</script>

<template>
  <view class="plan-page page safe-top">
    <view class="top-bar">
      <button @tap="back"><uni-icons type="back" size="21" color="#4d5c73" /></button>
      <text>学习计划</text>
      <view></view>
    </view>

    <view class="range-card">
      <view class="range-heading">
        <view>
          <text class="range-title">计划范围</text>
          <text class="range-subtitle">根据筛选条件去重后的题目总量</text>
        </view>
        <text class="exam-countdown">距离考试 {{ daysLeft }} 天</text>
      </view>
      <view class="range-total"><text>{{ total }}</text><text>道题</text></view>
      <view class="range-caption"><uni-icons type="checkmarkempty" size="16" color="#3569e8" /><text>筛选后将按此范围计算每日刷题目标</text></view>
      <view class="range-filters">
        <text class="filter-label">科目</text>
        <view class="chips"><text v-for="subject in knowledgeSubjects" :key="subject.id" class="chip" :class="{ active: selectedSubjects.includes(subject.id) }" @tap="toggle(selectedSubjects, subject.id)">{{ subject.name.includes('实务') ? '初级实务' : '初级综合' }}</text></view>
        <text class="filter-label">年份</text>
        <view class="chips"><text v-for="year in years" :key="year" class="chip" :class="{ active: selectedYears.includes(year) }" @tap="toggle(selectedYears, year)">{{ year }}年</text></view>
        <text class="filter-label">题目来源</text>
        <view class="chips"><text v-for="source in sourceOptions" :key="source.key" class="chip" :class="{ active: selectedSources.includes(source.key) }" @tap="toggle(selectedSources, source.key)">{{ source.label }}</text></view>
      </view>
    </view>

    <view class="target-card">
      <view class="target-heading">
        <view>
          <text class="target-title">每日刷题量</text>
          <text class="target-subtitle">自动计算每日目标，可手动调整</text>
        </view>
      </view>
      <view class="target-control">
        <button @tap="changeTarget(-1)"><uni-icons type="minus" size="20" color="#526783" /></button>
        <view><text>{{ target }}</text><text>题 / 天</text></view>
        <button @tap="changeTarget(1)"><uniIcons type="plus" size="20" color="#fff" /></button>
      </view>
      <text class="target-minimum">建议每日 {{ minimum }} 题，可按自己的节奏调整</text>
      <view class="target-slider">
        <text>0</text>
        <slider :value="target" :min="0" :max="sliderMax" :step="1" activeColor="#3569e8" backgroundColor="#dfe6f1" block-color="#ffffff" :block-size="24" @change="changeSlider" />
        <text>{{ sliderMax }}</text>
      </view>
      <view class="quick-targets">
        <text v-for="value in [0, 30, 50, 100]" :key="value" :class="{ active: target === value }" @tap="setQuickTarget(value)">{{ value }}题</text>
      </view>
    </view>

    <button class="save-button" @tap="save">保存学习计划</button>
    <view class="plan-note"><uniIcons type="info" size="18" color="#6949df" /><text>计划用于计算每日目标和推荐刷题范围，不会限制章节练习，你仍可自由选择任意章节刷题。</text></view>
    <DebugMenu page="学习计划" :options="[{ key: 'normal', label: '正常计划' }, { key: 'days30', label: '距离考试 30 天' }, { key: 'completed', label: '计划题目已完成' }, { key: 'empty', label: '范围暂无题目' }]" @select="applyDebug" />
  </view>
</template>

<style lang="scss">
.plan-page { max-width: 430px; min-height: 100vh; margin: 0 auto; box-sizing: border-box; padding-top: calc(env(safe-area-inset-top) + 18rpx); padding-bottom: 40rpx; background: #f5f7fb; }
.top-bar { display: flex; align-items: center; justify-content: space-between; height: 58rpx; }
.top-bar button { width: 58rpx; height: 58rpx; display: flex; align-items: center; justify-content: center; margin: 0; padding: 0; background: #edf1fb; border-radius: 15rpx; }
.top-bar button::after,.save-button::after,.target-control button::after { display: none; }
.top-bar>text { color: #1e3048; font-size: 27rpx; font-weight: 900; }
.top-bar>view { width: 58rpx; }
.range-card,.target-card { margin-top: 17rpx; padding: 20rpx; background: #fff; border: 1rpx solid #dfe6f0; border-radius: 13rpx; }
.range-card { background: linear-gradient(135deg,#fafdff,#eef4ff); border-color: #cfddf7; }
.range-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 12rpx; }
.range-heading>view { display: flex; flex-direction: column; gap: 5rpx; min-width: 0; }
.range-title { color: #263953; font-size: 24rpx; font-weight: 850; }
.range-subtitle { color: #7c899a; font-size: 18rpx; line-height: 1.4; }
.range-total { display: flex; align-items: baseline; gap: 8rpx; margin-top: 13rpx; color: #2457dc; }
.range-total text:first-child { font-size: 66rpx; line-height: 1; font-weight: 900; }
.range-total text:last-child { color: #526783; font-size: 21rpx; font-weight: 700; }
.range-caption { display: flex; align-items: center; gap: 6rpx; margin-top: 10rpx; color: #64758b; font-size: 17rpx; }
.range-filters { margin-top: 17rpx; padding-top: 2rpx; border-top: 1rpx solid #dce6f7; }
.target-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 12rpx; }
.target-heading>view { display: flex; flex-direction: column; gap: 5rpx; min-width: 0; }
.target-title { color: #263953; font-size: 24rpx; font-weight: 850; }
.target-subtitle { color: #7c899a; font-size: 18rpx; line-height: 1.4; }
.exam-countdown { flex: none; padding: 8rpx 10rpx; color: #b45c2b; background: #fff3e8; border: 1rpx solid #f4d2b9; border-radius: 8rpx; font-size: 17rpx; font-weight: 800; white-space: nowrap; }
.target-control { display: flex; align-items: center; justify-content: center; gap: 32rpx; margin-top: 19rpx; }
.target-control button { width: 52rpx; height: 52rpx; display: flex; align-items: center; justify-content: center; margin: 0; padding: 0; background: #edf1f7; border-radius: 50%; }
.target-control button:last-child { background: #3569e8; }
.target-control>view { min-width: 140rpx; display: flex; align-items: baseline; justify-content: center; gap: 7rpx; }
.target-control>view text:first-child { color: #2457dc; font-size: 58rpx; line-height: 1; font-weight: 900; }
.target-control>view text:last-child { color: #68788e; font-size: 19rpx; font-weight: 700; }
.target-minimum { display: block; margin-top: 7rpx; color: #7c899a; font-size: 17rpx; line-height: 1.4; text-align: center; }
.target-slider { display: grid; grid-template-columns: 38rpx 1fr 45rpx; align-items: center; gap: 8rpx; margin-top: 18rpx; color: #7d8b9d; font-size: 17rpx; text-align: center; }
.target-slider slider { margin: 0; }
.quick-targets { display: grid; grid-template-columns: repeat(4,1fr); gap: 8rpx; margin-top: 14rpx; }
.quick-targets text { padding: 10rpx 0; color: #65768b; background: #f1f4f8; border-radius: 7rpx; font-size: 18rpx; text-align: center; }
.quick-targets text.active { color: #3569e8; background: #eaf0ff; font-weight: 800; }
.quick-targets text.disabled { color: #b2bcc8; background: #f7f8fa; }
.filter-label { display: block; margin-top: 18rpx; color: #53657c; font-size: 19rpx; font-weight: 800; }
.chips { display: flex; flex-wrap: wrap; gap: 9rpx; margin-top: 9rpx; }
.chip { padding: 9rpx 13rpx; color: #627389; background: #f2f5f9; border: 1rpx solid #e0e6ee; border-radius: 7rpx; font-size: 18rpx; }
.chip.active { color: #3569e8; background: #eaf0ff; border-color: #a9c0fa; font-weight: 800; }
.plan-note { display: flex; align-items: flex-start; gap: 7rpx; margin-top: 15rpx; padding: 13rpx; color: #625a7b; background: #f1efff; border-radius: 9rpx; font-size: 18rpx; line-height: 1.5; }
.save-button { width: 100%; height: 60rpx; line-height: 60rpx; margin: 20rpx 0 0; padding: 0; color: #fff; background: linear-gradient(100deg,#3569e8,#6949df); border-radius: 9rpx; font-size: 22rpx; font-weight: 850; }
</style>
