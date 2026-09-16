<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import uniIcons from '@dcloudio/uni-ui/lib/uni-icons/uni-icons.vue'
import { useAppStore } from '@/store/app'
import { learningPlan, refreshLearningPlan, showApiError } from '@/services/api'
import { chinaDate, addDays, schedule } from '@/utils/plan-schedule'
import { backOrFallback } from '@/utils/navigation'
import { getPlanCompletedCount, getPlanQuestions, getActiveDates, loadPlan, savePlan, type PlanRound, type PracticePlan } from '@/utils/practice-plan'
import { knowledgeSubjects, practiceQuestions } from '@/mock/data'

const uni = (globalThis as any).uni
const { state, exam, requireLogin } = useAppStore()
const returnUrl = ref('/pages/index/index')
const loading = ref(true)
const loadError = ref(false)
const saving = ref(false)
const remoteConfig = ref({ prepDays: 90, sprintDays: 14, defaultRestDays: 1, defaultRound: 'coverage' as PlanRound })
const initialPlan = loadPlan(exam.value.id, exam.value.daysLeft)
const selectedSubjectIds = ref<string[]>([...initialPlan.subjectIds])
const selectedChapterIds = ref<string[]>([...initialPlan.chapterIds])
const expandedSubjectIds = ref<string[]>([])
const restWeekdays = ref<number[]>([...initialPlan.restWeekdays])
const skipDates = ref<string[]>([...initialPlan.skipDates])
const round = ref<PlanRound>(initialPlan.round)
const includeCourses = ref(initialPlan.includeCourses)
const includeWrong = ref(initialPlan.includeWrong)
const includeNotes = ref(initialPlan.includeNotes)
const includeCheatSheets = ref(initialPlan.includeCheatSheets)
const target = ref(initialPlan.target)
const targetCustomized = ref(initialPlan.targetCustomized === true)
const daysLeft = computed(() => learningPlan.data?.exam.id === exam.value.id ? learningPlan.data.progress.daysLeft : exam.value.daysLeft)
const planSubjects = computed(() => knowledgeSubjects.filter(subject => selectedSubjectIds.value.includes(subject.id)))
const selectedQuestions = computed(() => getPlanQuestions({ subjectIds: selectedSubjectIds.value, chapterIds: selectedChapterIds.value, includeWrong: includeWrong.value, round: round.value }))
const questionIds = computed(() => selectedQuestions.value.map(question => question.id))
const total = computed(() => selectedQuestions.value.length)
const matchingScope = computed(() => {
  const current = learningPlan.data
  return current?.exam.id === exam.value.id && current.plan.questionIds.length === questionIds.value.length && questionIds.value.every(id => current.plan.questionIds.includes(id))
})
const todayDone = computed(() => matchingScope.value ? learningPlan.data.progress.todayDone : 0)
const completed = computed(() => {
  const current = learningPlan.data
  if (matchingScope.value) return current.progress.completed
  return getPlanCompletedCount({ examId: exam.value.id, questionIds: questionIds.value })
})
const remaining = computed(() => Math.max(total.value - completed.value, 0))
const today = computed(() => chinaDate())
const todaySkipped = computed(() => skipDates.value.includes(today.value))
const activeDates = computed(() => getActiveDates(today.value, daysLeft.value, restWeekdays.value, skipDates.value))
const autoDaily = computed(() => activeDates.value.length ? Math.ceil((remaining.value + (activeDates.value.includes(today.value) ? todayDone.value : 0)) / activeDates.value.length) : 0)
const sliderMax = computed(() => Math.max(autoDaily.value * 3, 100))
const progress = computed(() => total.value ? Math.min(Math.round(completed.value / total.value * 100), 100) : 0)
const allocations = computed(() => schedule(remaining.value, todayDone.value, activeDates.value, today.value, targetCustomized.value ? target.value : null))
const preview = computed(() => {
  const rows = allocations.value
  const counts = new Map(rows.map(item => [item.date,item.count]))
  return Array.from({length:Math.min(7,daysLeft.value)},(_,index) => {const date=addDays(today.value,index);return {date,count:counts.get(date)||0,rest:!activeDates.value.includes(date)}})
})
const unscheduled = computed(() => Math.max(0, remaining.value - allocations.value.reduce((sum, row) => sum + row.count, 0)))
const stage = computed(() => {
  if (daysLeft.value <= remoteConfig.value.sprintDays) return { label: '冲刺阶段', hint: `考前 ${remoteConfig.value.sprintDays} 天，优先完成题量和错题复盘` }
  if (daysLeft.value <= remoteConfig.value.prepDays) return { label: '备考阶段', hint: `考前 ${remoteConfig.value.prepDays} 天内，按计划建立完整题目覆盖` }
  return { label: '规划阶段', hint: '距离考试较早，先按自己的节奏建立学习习惯' }
})
const weekdays = ['日', '一', '二', '三', '四', '五', '六']
const subjectLabel = (subject: typeof knowledgeSubjects[number]) => subject.name.replace('（初级）', '').replace('（中级）', '')
const selectedChapterCount = computed(() => selectedChapterIds.value.length)
const subjectQuestionCount = (subjectId: string) => practiceQuestions.filter(q => (q.linkedSubjectIds||[q.subjectId]).includes(subjectId) && (q.type as string) !== 'subjective').length
const chapterQuestionCount = (chapterId: string) => practiceQuestions.filter(q => (q.linkedChapterIds || [q.chapterId]).includes(chapterId) && (q.type as string) !== 'subjective').length
const useAutoTarget = () => { targetCustomized.value = false; target.value = autoDaily.value }

const isSubjectSelected = (subject: typeof knowledgeSubjects[number]) => subject.chapters.length > 0 && subject.chapters.every(chapter => selectedChapterIds.value.includes(chapter.id))
const isChapterSelected = (chapterId: string) => selectedChapterIds.value.includes(chapterId)
const toggleSubject = (subject: typeof knowledgeSubjects[number]) => {
  const allSelected = isSubjectSelected(subject)
  const ids = new Set(selectedChapterIds.value)
  subject.chapters.forEach(chapter => allSelected ? ids.delete(chapter.id) : ids.add(chapter.id))
  selectedChapterIds.value = [...ids]
  selectedSubjectIds.value = knowledgeSubjects.filter(item => item.chapters.some(chapter => ids.has(chapter.id))).map(item => item.id)
}
const toggleChapter = (subjectId: string, chapterId: string) => {
  const ids = new Set(selectedChapterIds.value)
  ids.has(chapterId) ? ids.delete(chapterId) : ids.add(chapterId)
  selectedChapterIds.value = [...ids]
  selectedSubjectIds.value = knowledgeSubjects.filter(item => item.chapters.some(chapter => ids.has(chapter.id))).map(item => item.id)
}
const toggleSubjectExpanded = (subjectId: string) => {
  const ids = new Set(expandedSubjectIds.value)
  ids.has(subjectId) ? ids.delete(subjectId) : ids.add(subjectId)
  expandedSubjectIds.value = [...ids]
}
const toggleRestDay = (day: number) => {
  const days = new Set(restWeekdays.value)
  if (days.has(day)) days.delete(day)
  else if (days.size >= 3) return uni.showToast({ title: '每周最多休息 3 天', icon: 'none' })
  else days.add(day)
  restWeekdays.value = [...days].sort((a, b) => a - b)
}
const toggleSkipToday = () => {
  const dates = new Set(skipDates.value)
  dates.has(today.value) ? dates.delete(today.value) : dates.add(today.value)
  skipDates.value = [...dates]
}
const changeTarget = (amount: number) => { targetCustomized.value = true; target.value = Math.min(Math.max(target.value + amount, 0), sliderMax.value) }
const setTarget = (value: number) => { targetCustomized.value = true; target.value = Math.min(Math.max(value, 0), sliderMax.value) }
const changeSlider = (event: any) => { targetCustomized.value = true; target.value = Math.max(Number(event.detail.value), 0) }
const toggleRound = (value: PlanRound) => { round.value = value }
watch(autoDaily, value => { if (!targetCustomized.value) target.value = value }, { immediate: true })
watch([selectedChapterIds, includeWrong, round], () => { if (!targetCustomized.value) target.value = autoDaily.value })

const syncFromPlan = (saved: Partial<PracticePlan> | null) => {
  if (!saved) return
  if (Array.isArray(saved.subjectIds)) selectedSubjectIds.value = [...saved.subjectIds]
  if (Array.isArray(saved.chapterIds)) selectedChapterIds.value = [...saved.chapterIds]
  if (Array.isArray(saved.restWeekdays)) restWeekdays.value = [...saved.restWeekdays]
  if (Array.isArray(saved.skipDates)) skipDates.value = [...saved.skipDates]
  if (saved.round === 'coverage' || saved.round === 'consolidation') round.value = saved.round
  includeCourses.value = saved.includeCourses !== false
  includeWrong.value = saved.includeWrong === true
  includeNotes.value = saved.includeNotes !== false
  includeCheatSheets.value = saved.includeCheatSheets === true
  if (saved.targetCustomized === true) { targetCustomized.value = true; target.value = Number(saved.target ?? (saved as any).dailyTarget) || 0 }
}
const loadRemote = async () => {
  loading.value = true
  loadError.value = false
  try {
    const result = await refreshLearningPlan()
    if (!result) throw new Error('请重新登录')
    remoteConfig.value = { ...remoteConfig.value, ...(result.config || {}) }
    if (result.plan) syncFromPlan(result.plan)
    else {
      restWeekdays.value = Array.from({ length: remoteConfig.value.defaultRestDays }, (_, index) => index + 1)
      round.value = remoteConfig.value.defaultRound
    }
  } catch (error) { loadError.value = true; showApiError(error) } finally { loading.value = false }
}
const save = async () => {
  if (saving.value || loading.value || loadError.value) return
  if (!selectedChapterIds.value.length) return uni.showToast({ title: '至少选择一个章节', icon: 'none' })
  saving.value = true
  const next: PracticePlan = {
    ...initialPlan, examId: exam.value.id, subjectIds: [...selectedSubjectIds.value], chapterIds: [...selectedChapterIds.value], restWeekdays: [...restWeekdays.value], skipDates: [...skipDates.value], round: round.value,
    includeCourses: includeCourses.value, includeWrong: includeWrong.value, includeNotes: includeNotes.value, includeCheatSheets: includeCheatSheets.value, questionIds: [...questionIds.value], total: total.value, minTarget: autoDaily.value, target: Math.max(target.value, 0), targetCustomized: targetCustomized.value, updatedAt: Date.now(),
  }
  try {
    await savePlan(next)
    state.todayTarget = next.target
    uni.showToast({ title: '学习计划已更新', icon: 'success' })
    setTimeout(() => uni.reLaunch({ url: returnUrl.value }), 650)
  } catch (error) { showApiError(error) } finally { saving.value = false }
}
const back = () => backOrFallback(returnUrl.value)
onLoad((options?: Record<string, string>) => { if (options?.returnUrl) returnUrl.value = decodeURIComponent(options.returnUrl); if (requireLogin('/pages/learning-plan/index')) void loadRemote() })
</script>

<template>
  <view class="plan-page page safe-top">
    <view class="top-bar"><button class="icon-button" aria-label="返回" @tap="back"><uni-icons type="back" size="21" color="#4d5c73" /></button><view class="top-copy"><text>学习计划</text><text>{{ exam.name }}</text></view><view class="top-spacer"></view></view>
    <view v-if="loading" class="loading-state"><uni-icons type="spinner-cycle" size="23" color="#3569e8" /><text>正在同步你的计划</text></view>
    <view v-else-if="loadError" class="loading-state" role="alert"><text>计划加载失败，请重试</text><button @tap="loadRemote">重新加载</button></view>
    <template v-else>
      <view class="stage-card"><view class="stage-copy"><text class="eyebrow">{{ stage.label }}</text><text class="stage-title">安排我的学习节奏</text><text class="stage-hint">{{ stage.hint }}</text></view><view class="stage-days"><text>{{ daysLeft }}</text><text>天</text></view></view>
      <view class="summary-card"><view class="summary-head"><view><text class="section-title">计划范围</text><text class="section-subtitle">按已选章节统计题目，不把课程时长计入进度</text></view><text class="chapter-count">{{ selectedChapterCount }} 章</text></view><view class="summary-stats"><view><text>{{ total }}</text><text>计划题目</text></view><view><text>{{ completed }}</text><text>已完成</text></view><view><text>{{ progress }}%</text><text>完成度</text></view></view><view class="progress-track"><view :style="{ width: `${progress}%` }"></view></view><text class="summary-foot">剩余 {{ remaining }} 题 · {{ planSubjects.map(subjectLabel).join('、') || '尚未选择科目' }}</text></view>
      <view class="panel"><view class="panel-heading"><view><text class="panel-title">选择学习范围</text><text class="panel-subtitle">选中科目会默认包含该科目全部章节</text></view><text class="panel-count">{{ selectedChapterCount }} / {{ knowledgeSubjects.reduce((sum, item) => sum + item.chapters.length, 0) }}</text></view><view v-for="subject in knowledgeSubjects" :key="subject.id" class="subject-block"><view class="subject-row" role="button" tabindex="0" :aria-expanded="expandedSubjectIds.includes(subject.id)" @keydown.enter.prevent="toggleSubjectExpanded(subject.id)" @tap="toggleSubjectExpanded(subject.id)"><view class="check-box" role="checkbox" tabindex="0" :aria-label="subjectLabel(subject)" :aria-checked="isSubjectSelected(subject)" @keydown.enter.stop.prevent="toggleSubject(subject)" @keydown.space.stop.prevent="toggleSubject(subject)" :class="{ selected: isSubjectSelected(subject) }" @tap.stop="toggleSubject(subject)"><uni-icons v-if="isSubjectSelected(subject)" type="checkmarkempty" size="15" color="#fff" /></view><view class="subject-copy"><text>{{ subjectLabel(subject) }}</text><text>{{ subject.chapters.length }} 章 · {{ subjectQuestionCount(subject.id) }} 题</text></view><uni-icons :type="expandedSubjectIds.includes(subject.id) ? 'arrowup' : 'arrowdown'" size="17" color="#8b98aa" /></view><view v-if="expandedSubjectIds.includes(subject.id)" class="chapter-list"><view v-for="chapter in subject.chapters" :key="chapter.id" class="chapter-row" role="checkbox" tabindex="0" :aria-checked="isChapterSelected(chapter.id)" @keydown.enter.prevent="toggleChapter(subject.id, chapter.id)" @keydown.space.prevent="toggleChapter(subject.id, chapter.id)" :class="{ selected: isChapterSelected(chapter.id) }" @tap="toggleChapter(subject.id, chapter.id)"><view class="check-box small" :class="{ selected: isChapterSelected(chapter.id) }"><uni-icons v-if="isChapterSelected(chapter.id)" type="checkmarkempty" size="13" color="#fff" /></view><view class="chapter-copy"><text>第{{ chapter.no }}章 {{ chapter.name }}</text><text>{{ chapter.sections.length }} 节 · {{ chapterQuestionCount(chapter.id) }} 题</text></view></view></view></view></view>
      <view class="panel compact-panel"><view class="panel-heading"><view><text class="panel-title">学习轮次</text><text class="panel-subtitle">完整做完一轮后自动进入巩固，优先错题和到期复习题</text></view></view><view class="segmented"><button :class="{ active: round === 'coverage' }" @tap="toggleRound('coverage')"><text>覆盖学习</text><text>完整做完所选题目</text></button><button :class="{ active: round === 'consolidation' }" @tap="toggleRound('consolidation')"><text>巩固复习</text><text>优先错题与到期复习</text></button></view></view>
      <view class="panel compact-panel"><view class="panel-heading"><view><text class="panel-title">每周节奏</text><text class="panel-subtitle">最多设置 3 天休息，休息日题量自动顺延</text></view><text class="panel-count">{{ restWeekdays.length }} 天休息</text></view><view class="weekday-row"><button v-for="(day, index) in weekdays" :key="day" :aria-label="`星期${day}休息`" :aria-pressed="restWeekdays.includes(index)" :class="{ active: restWeekdays.includes(index) }" @tap="toggleRestDay(index)">{{ day }}</button></view><view class="skip-row" role="switch" tabindex="0" :aria-checked="todaySkipped" @keydown.enter.prevent="toggleSkipToday" @keydown.space.prevent="toggleSkipToday" :class="{ active: todaySkipped }" @tap="toggleSkipToday"><view class="skip-icon"><uni-icons :type="todaySkipped ? 'checkmarkempty' : 'calendar'" size="16" :color="todaySkipped ? '#fff' : '#3569e8'" /></view><view><text>今天临时休息</text><text>{{ todaySkipped ? '今天不安排题目，剩余题量会重新分配' : '只影响今天，不改变每周休息设置' }}</text></view><uni-icons type="right" size="16" color="#a4afbd" /></view></view>
      <view class="panel target-panel"><view class="panel-heading"><view><text class="panel-title">每日刷题量</text><text class="panel-subtitle">剩余题量 ÷ 有效学习日，余数从前往后平均分配</text></view><text class="recommend">建议 {{ autoDaily }} 题</text></view><view class="target-control"><button aria-label="减少每日题量" @tap="changeTarget(-1)"><uni-icons type="minus" size="18" color="#526783" /></button><view><text>{{ target }}</text><text>题 / 天</text></view><button aria-label="增加每日题量" @tap="changeTarget(1)"><uni-icons type="plus" size="18" color="#fff" /></button></view><view class="target-actions"><button :class="{ active: !targetCustomized }" :aria-pressed="!targetCustomized" @tap="useAutoTarget">自动安排</button><button v-for="value in [30, 50, 100]" :key="value" :class="{ active: targetCustomized && target === value }" @tap="setTarget(value)">{{ value }} 题</button></view><view class="target-slider"><text>0</text><slider :value="target" :min="0" :max="sliderMax" :step="1" activeColor="#3569e8" backgroundColor="#dfe6f1" block-color="#fff" :block-size="22" @change="changeSlider" /><text>{{ sliderMax }}</text></view><view class="allocation"><view class="allocation-head"><text>未来 7 天预览</text><text>{{ activeDates.length }} 个有效学习日</text></view><view class="allocation-days"><view v-for="item in preview" :key="item.date"><text>{{ item.date.slice(5).replace('-', '/') }}</text><text>{{ item.rest ? '休息' : `${item.count} 题` }}</text></view><text v-if="!preview.length" class="allocation-empty">暂无有效学习日，请调整休息设置</text></view></view></view>
      <view class="panel reminder-panel"><view class="panel-heading"><view><text class="panel-title">交叉学习提醒</text><text class="panel-subtitle">不计入题量，只在当天计划里提示相关内容</text></view></view><view class="setting-row" role="switch" tabindex="0" :aria-checked="includeCourses" @keydown.enter.prevent="includeCourses = !includeCourses" @keydown.space.prevent="includeCourses = !includeCourses" @tap="includeCourses = !includeCourses"><view class="setting-mark course"><uni-icons type="videocam" size="16" color="#3569e8" /></view><view><text>课程提醒</text><text>按章节提示精讲课</text></view><view class="switch" :class="{ on: includeCourses }"><view></view></view></view><view class="setting-row" role="switch" tabindex="0" :aria-checked="includeWrong" @keydown.enter.prevent="includeWrong = !includeWrong" @keydown.space.prevent="includeWrong = !includeWrong" @tap="includeWrong = !includeWrong"><view class="setting-mark wrong"><uni-icons type="refresh" size="16" color="#d77a27" /></view><view><text>错题复习</text><text>优先提醒最近的错题</text></view><view class="switch" :class="{ on: includeWrong }"><view></view></view></view><view class="setting-row" role="switch" tabindex="0" :aria-checked="includeNotes" @keydown.enter.prevent="includeNotes = !includeNotes" @keydown.space.prevent="includeNotes = !includeNotes" @tap="includeNotes = !includeNotes"><view class="setting-mark note"><uni-icons type="compose" size="16" color="#6949df" /></view><view><text>笔记复习</text><text>安排笔记和知识点回顾</text></view><view class="switch" :class="{ on: includeNotes }"><view></view></view></view><view class="setting-row" role="switch" tabindex="0" :aria-checked="includeCheatSheets" @keydown.enter.prevent="includeCheatSheets = !includeCheatSheets" @keydown.space.prevent="includeCheatSheets = !includeCheatSheets" @tap="includeCheatSheets = !includeCheatSheets"><view class="setting-mark sheet"><uni-icons type="paperclip" size="16" color="#1a9a7b" /></view><view><text>考前小抄</text><text>SVIP 可用，进入冲刺期后提醒</text></view><view class="switch" :class="{ on: includeCheatSheets }"><view></view></view></view></view>
      <view v-if="unscheduled" class="plan-note">按当前题量，考前预计还有 {{ unscheduled }} 题未覆盖。可以提高每日题量，也可以保持自己的节奏。</view>
      <button class="save-button" :loading="saving" :disabled="saving" @tap="save">保存学习计划</button><view class="plan-note"><uni-icons type="info" size="17" color="#3569e8" /><text>计划不会限制自由刷题；未完成题量会重新分配到后续学习日。</text></view>
    </template>
  </view>
</template>

<style scoped lang="scss">
.summary-stats > view > text:first-child { font-size: 28px !important; }
.target-control > view > text:first-child { font-size: 32px !important; }
[tabindex]:focus-visible, button:focus-visible { outline: 2px solid #3569e8; outline-offset: 3px; }
.subject-row > .check-box { position: relative; width: 22px; height: 22px; flex: none; }
.subject-row > .check-box::before { content: ''; position: absolute; inset: -11px; }

.plan-page { max-width: 430px; min-height: 100vh; margin: 0 auto; box-sizing: border-box; padding: calc(env(safe-area-inset-top) + 18rpx) 16rpx 42rpx; background: #f5f7fb; }.top-bar { display: flex; align-items: center; justify-content: space-between; min-height: 58rpx; }.icon-button { width: 58rpx; height: 58rpx; display: flex; align-items: center; justify-content: center; margin: 0; padding: 0; background: #edf1fb; border-radius: 15rpx; }.icon-button::after, .save-button::after, .target-control button::after, .target-actions button::after, .weekday-row button::after, .segmented button::after { display: none; }.top-copy { display: flex; align-items: center; flex-direction: column; gap: 3rpx; }.top-copy>text:first-child { color: #1e3048; font-size: var(--sxb-text-title); font-weight: 700; }.top-copy>text:last-child { max-width: 250rpx; overflow: hidden; color: #8b97a7; font-size: var(--sxb-text-meta); text-overflow: ellipsis; white-space: nowrap; }.top-spacer { width: 58rpx; }.loading-state { min-height: 380rpx; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 12rpx; color: #77869b; font-size: var(--sxb-text-small); }.stage-card { display: flex; align-items: center; justify-content: space-between; gap: 14rpx; margin-top: 18rpx; padding: 19rpx; color: #fff; background: #273d67; border: 1rpx solid #405782; border-radius: 12rpx; }.stage-copy { display: flex; min-width: 0; flex-direction: column; gap: 6rpx; }.eyebrow { color: #e4bf67; font-size: var(--sxb-text-meta); font-weight: 700; }.stage-title { font-size: var(--sxb-text-item); font-weight: 700; }.stage-hint { overflow: hidden; color: #c9d4e8; font-size: var(--sxb-text-meta); line-height: 1.45; text-overflow: ellipsis; white-space: nowrap; }.stage-days { flex: none; display: flex; align-items: baseline; gap: 3rpx; }.stage-days text:first-child { color: #e4bf67; font-size: 44rpx; line-height: 1; font-weight: 700; }.stage-days text:last-child { color: #d8e0ed; font-size: var(--sxb-text-meta); }.summary-card, .panel { margin-top: 14rpx; padding: 17rpx; background: #fff; border: 1rpx solid #dfe6f0; border-radius: 11rpx; }.summary-head, .panel-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 12rpx; }.summary-head>view, .panel-heading>view { display: flex; min-width: 0; flex-direction: column; gap: 4rpx; }.section-title, .panel-title { color: #263953; font-size: var(--sxb-text-body); font-weight: 700; }.section-subtitle, .panel-subtitle { color: #7c899a; font-size: var(--sxb-text-meta); line-height: 1.45; }.chapter-count, .panel-count { flex: none; padding: 5rpx 8rpx; color: #3569e8; background: #eaf0ff; border-radius: 5rpx; font-size: var(--sxb-text-meta); font-weight: 700; }.summary-stats { display: grid; grid-template-columns: repeat(3, 1fr); margin-top: 16rpx; }.summary-stats view { display: flex; align-items: center; flex-direction: column; gap: 4rpx; border-right: 1rpx solid #e7ebf1; }.summary-stats view:last-child { border-right: 0; }.summary-stats text:first-child { color: #263f68; font-size: 33rpx; line-height: 1; font-weight: 700; }.summary-stats text:last-child { color: #8995a5; font-size: var(--sxb-text-meta); }.progress-track { height: 8rpx; margin-top: 15rpx; overflow: hidden; background: #edf1f6; border-radius: 8rpx; }.progress-track view { height: 100%; background: #3569e8; border-radius: inherit; transition: width 220ms ease; }.summary-foot { display: block; margin-top: 9rpx; overflow: hidden; color: #77879b; font-size: var(--sxb-text-meta); text-overflow: ellipsis; white-space: nowrap; }.panel-heading { margin-bottom: 13rpx; }.panel-count { color: #7d8b9e; background: #f1f4f8; }.subject-block { border-top: 1rpx solid #edf0f5; }.subject-row, .chapter-row { display: flex; align-items: center; gap: 10rpx; min-height: 68rpx; }.subject-row { cursor: pointer; }.check-box { width: 34rpx; height: 34rpx; display: flex; align-items: center; justify-content: center; flex: none; background: #f2f5f8; border: 1rpx solid #d7dfe9; border-radius: 7rpx; }.check-box.small { width: 30rpx; height: 30rpx; border-radius: 6rpx; }.check-box.selected { background: #3569e8; border-color: #3569e8; }.subject-copy, .chapter-copy { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 3rpx; }.subject-copy text:first-child { color: #2d415d; font-size: var(--sxb-text-small); font-weight: 700; }.subject-copy text:last-child, .chapter-copy text:last-child { color: #8995a5; font-size: var(--sxb-text-meta); }.chapter-list { padding: 0 0 9rpx 44rpx; }.chapter-row { min-height: 57rpx; padding: 6rpx 9rpx; border-radius: 7rpx; }.chapter-row.selected { background: #f3f6ff; }.chapter-copy text:first-child { overflow: hidden; color: #4a5d75; font-size: var(--sxb-text-small); line-height: 1.35; text-overflow: ellipsis; white-space: nowrap; }.compact-panel { padding-bottom: 15rpx; }.segmented { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8rpx; }.segmented button { min-height: 64rpx; display: flex; align-items: flex-start; justify-content: center; flex-direction: column; gap: 3rpx; margin: 0; padding: 9rpx 11rpx; color: #617087; background: #f6f8fb; border: 1rpx solid #e1e7ef; border-radius: 8rpx; text-align: left; }.segmented button.active { color: #315fae; background: #edf3ff; border-color: #a9c1f0; }.segmented button text:first-child { font-size: var(--sxb-text-small); font-weight: 700; }.segmented button text:last-child { color: #8a96a7; font-size: var(--sxb-text-meta); }.weekday-row { display: grid; grid-template-columns: repeat(7, 1fr); gap: 7rpx; }.weekday-row button { width: 100%; height: 52rpx; margin: 0; padding: 0; color: #65758b; background: #f4f6f9; border: 1rpx solid #e0e6ee; border-radius: 7rpx; font-size: var(--sxb-text-small); }.weekday-row button.active { color: #fff; background: #3569e8; border-color: #3569e8; font-weight: 700; }.skip-row { display: flex; align-items: center; gap: 10rpx; margin-top: 12rpx; padding: 11rpx; background: #f7f9fc; border: 1rpx solid transparent; border-radius: 8rpx; }.skip-row.active { background: #edf3ff; border-color: #c9d8fb; }.skip-icon { width: 33rpx; height: 33rpx; display: flex; align-items: center; justify-content: center; flex: none; background: #e8efff; border-radius: 7rpx; }.skip-row.active .skip-icon { background: #3569e8; }.skip-row>view:nth-child(2) { display: flex; flex: 1; min-width: 0; flex-direction: column; gap: 3rpx; }.skip-row text:first-child { color: #40536c; font-size: var(--sxb-text-small); font-weight: 700; }.skip-row text:last-child { color: #8995a5; font-size: var(--sxb-text-meta); }.target-panel { padding-bottom: 16rpx; }.recommend { flex: none; color: #1a9a7b; font-size: var(--sxb-text-meta); font-weight: 700; }.target-control { display: flex; align-items: center; justify-content: center; gap: 27rpx; margin-top: 14rpx; }.target-control button { width: 52rpx; height: 52rpx; display: flex; align-items: center; justify-content: center; margin: 0; padding: 0; background: #edf1f7; border-radius: 50%; }.target-control button:last-child { background: #3569e8; }.target-control>view { min-width: 135rpx; display: flex; align-items: baseline; justify-content: center; gap: 5rpx; }.target-control>view text:first-child { color: #2457dc; font-size: 45rpx; line-height: 1; font-weight: 700; }.target-control>view text:last-child { color: #68788e; font-size: var(--sxb-text-meta); font-weight: 700; }.target-actions { display: grid; grid-template-columns: repeat(4, 1fr); gap: 7rpx; margin-top: 14rpx; }.target-actions button { height: 44rpx; margin: 0; padding: 0; color: #65768b; background: #f1f4f8; border-radius: 6rpx; font-size: var(--sxb-text-meta); }.target-actions button.active { color: #3569e8; background: #eaf0ff; font-weight: 700; }.target-slider { display: grid; grid-template-columns: 28rpx 1fr 40rpx; align-items: center; gap: 7rpx; margin-top: 12rpx; color: #7d8b9d; font-size: var(--sxb-text-meta); text-align: center; }.target-slider slider { margin: 0; }.allocation { margin-top: 14rpx; padding-top: 12rpx; border-top: 1rpx solid #edf0f5; }.allocation-head { display: flex; align-items: center; justify-content: space-between; color: #52657d; font-size: var(--sxb-text-meta); }.allocation-head text:last-child { color: #8995a5; }.allocation-days { display: grid; grid-template-columns: repeat(4, 1fr); gap: 7rpx; margin-top: 8rpx; }.allocation-days view { display: flex; align-items: center; flex-direction: column; gap: 3rpx; padding: 8rpx 3rpx; background: #f7f9fc; border-radius: 6rpx; }.allocation-days view text:first-child { color: #8995a5; font-size: 19rpx; }.allocation-days view text:last-child { color: #355aab; font-size: var(--sxb-text-meta); font-weight: 700; }.allocation-empty { grid-column: 1 / -1; padding: 13rpx; color: #9aa5b3; font-size: var(--sxb-text-meta); text-align: center; }.setting-row { display: flex; align-items: center; gap: 10rpx; min-height: 67rpx; border-top: 1rpx solid #edf0f5; }.setting-mark { width: 34rpx; height: 34rpx; display: flex; align-items: center; justify-content: center; flex: none; border-radius: 8rpx; }.setting-mark.course { background: #eaf0ff; }.setting-mark.wrong { background: #fff2e4; }.setting-mark.note { background: #f1efff; }.setting-mark.sheet { background: #e8f7f1; }.setting-row>view:nth-child(2) { display: flex; flex: 1; min-width: 0; flex-direction: column; gap: 3rpx; }.setting-row text:first-child { color: #40536c; font-size: var(--sxb-text-small); font-weight: 700; }.setting-row text:last-child { color: #8995a5; font-size: var(--sxb-text-meta); }.switch { width: 42rpx; height: 24rpx; display: flex; align-items: center; flex: none; padding: 3rpx; background: #d8e0ea; border-radius: 20rpx; transition: background 180ms ease; }.switch view { width: 18rpx; height: 18rpx; background: #fff; border-radius: 50%; transition: transform 180ms ease; }.switch.on { background: #3569e8; }.switch.on view { transform: translateX(18rpx); }.save-button { width: 100%; height: 58rpx; line-height: 58rpx; margin: 20rpx 0 0; padding: 0; color: #fff; background: #3569e8; border-radius: 8rpx; font-size: var(--sxb-text-body); font-weight: 700; }.plan-note { display: flex; align-items: flex-start; gap: 7rpx; margin-top: 12rpx; padding: 11rpx 12rpx; color: #63758d; background: #edf3ff; border-radius: 8rpx; font-size: var(--sxb-text-meta); line-height: 1.5; } @media (prefers-reduced-motion: reduce) { .progress-track view, .switch, .switch view { transition: none; } }
@import '@/styles/content-system.scss';
.plan-page { padding-inline:16px; }
.panel,.summary-card { border:0; border-radius:0; margin:16px -16px 0; padding:18px 16px; }
.stage-card { background:#edf3ff; color:#243953; border:0; border-radius:8px; padding:16px; }
.stage-title { font-size:18px; }.stage-hint { color:#52657d; white-space:normal; font-size:14px; }.eyebrow { color:#315fae; }.stage-days text:first-child { color:#315fae; font-size:32px; }.stage-days text:last-child { color:#52657d; }
.panel-title,.section-title { font-size:17px; }.panel-subtitle,.section-subtitle,.summary-foot,.subject-copy text:last-child,.chapter-copy text:last-child,.skip-row text:last-child,.setting-row text:last-child,.segmented button text:last-child,.allocation-head,.plan-note { font-size:14px; color:#64748b; }
.subject-copy text:first-child,.chapter-copy text:first-child,.setting-row text:first-child,.skip-row text:first-child { font-size:16px; white-space:normal; line-height:1.5; }
.subject-row,.chapter-row,.setting-row,.skip-row { min-height:56px; }.chapter-list { padding-left:12px; }.check-box { position:relative;width:22px;height:22px; }.check-box::before { content:'';position:absolute;inset:-11px; }.check-box.small { width:20px;height:20px; }.chapter-copy { padding:6px 0; }
.weekday-row { gap:4px; }.weekday-row button,.target-actions button,.target-control button,.save-button { min-height:44px; height:auto; line-height:44px; font-size:15px; }.target-control button { width:44px; }.segmented button { min-height:68px; }.segmented button text:first-child { font-size:15px;line-height:1.4; }.allocation-days { grid-template-columns:repeat(4,minmax(0,1fr)); }.allocation-days view text:first-child,.allocation-days view text:last-child { font-size:14px; }
.switch { width:38px;height:22px;padding:3px; }.switch view { width:16px;height:16px; }.switch.on view { transform:translateX(16px); }
.save-button { border-radius:8px; }.subject-row:active,.chapter-row:active,.setting-row:active { opacity:.75; }button:focus-visible,[role]:focus-visible { outline:2px solid #3569e8;outline-offset:3px; }
</style>
