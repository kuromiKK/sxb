<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { onHide, onLoad, onShow } from '@dcloudio/uni-app'
import uniIcons from '@dcloudio/uni-ui/lib/uni-icons/uni-icons.vue'
import { knowledgeSubjects, practiceQuestions, type PracticeQuestion } from '@/mock/data'
import { useAppStore } from '@/store/app'
import { getAnswered, getPlanQuestions, loadPlan, recordToday, saveAnswered } from '@/utils/practice-plan'
import { getWeakQuestions, type WeakPointDebugState } from '@/utils/weak-points'
import DebugMenu from '@/components/DebugMenu.vue'
import { getFavoriteIds, setFavorite } from '@/utils/favorites'
import { getNoteBySource, saveNoteRecord } from '@/utils/notes'
import { api, showApiError, writeRecord } from '@/services/api'

type SessionMode = 'normal' | 'weak' | 'wrong' | 'favorite' | 'recite'
type AnswerState = 'correct' | 'wrong'
const { state, exam, requireLogin } = useAppStore()
const mode = ref<SessionMode>('normal')
const questions = ref<PracticeQuestion[]>(practiceQuestions)
const currentIndex = ref(0)
const selected = ref<number[]>([])
const answered = ref(false)
const submitting = ref(false)
const answerStates = ref<Record<string, AnswerState>>({})
const sessionSelections = ref<Record<string, number[]>>({})
const reciteRevealed = ref(false)
const noteVisible = ref(false)
const noteText = ref('')
const sessionStartedAt = ref(Date.now())
const elapsedSeconds = ref(0)
let elapsedTimer: ReturnType<typeof setInterval> | undefined
const completionVisible = ref(false)
const debugState = ref((uni.getStorageSync('sxb-debug-state-题目内容页') || 'normal') as string)
const sessionSource = ref('章节练习')
const returnUrl = ref('/pages/practice/index')
const knowledgePointSession = ref(false)
const favoriteIds = ref<string[]>(getFavoriteIds())

const current = computed(() => questions.value[currentIndex.value] || practiceQuestions[0])
const progress = computed(() => questions.value.length ? Math.round((currentIndex.value + 1) / questions.value.length * 100) : 0)
const isFavorite = computed(() => favoriteIds.value.includes(current.value.id))
const isCorrect = computed(() => answered.value && selected.value.length === current.value.answer.length && selected.value.every(item => current.value.answer.includes(item)))
const correctAnswer = computed(() => current.value.answer.map(index => String.fromCharCode(65 + index)).join('、'))
const selectedAnswer = computed(() => selected.value.length ? selected.value.map(index => String.fromCharCode(65 + index)).join('、') : '未作答')
const pageTitle = computed(() => sessionSource.value || (mode.value === 'recite' ? '挖空背题' : mode.value === 'weak' ? '薄弱项强化' : mode.value === 'wrong' ? '错题重练' : mode.value === 'favorite' ? '我的收藏' : '章节练习'))
const elapsed = computed(() => {
  const hours = Math.floor(elapsedSeconds.value / 3600)
  const minutes = Math.floor(elapsedSeconds.value % 3600 / 60)
  return `${hours}小时${minutes}分钟`
})
const knowledgeLine = computed(() => `${current.value.subjectName.includes('实务') ? '初级实务' : '初级综合'} · 第${current.value.chapterId.split('-').pop()}章 · 第${current.value.sectionId.split('-').pop()}节`)
const isLast = computed(() => questions.value.length > 0 && currentIndex.value === questions.value.length - 1)
const isPlanSession = computed(() => sessionSource.value === '智能刷题')
const currentSectionRecord = computed(() => {
  for (const subject of knowledgeSubjects) {
    for (const chapter of subject.chapters) {
      const section = chapter.sections.find(item => item.id === current.value.sectionId)
      if (section) return { subject, chapter, section }
    }
  }
  return undefined
})
const nextSectionRecord = computed(() => {
  const record = currentSectionRecord.value
  if (!record) return undefined
  const sections = record.subject.chapters.flatMap(chapter => chapter.sections.map(section => ({ chapter, section })))
  const index = sections.findIndex(item => item.section.id === record.section.id)
  return index >= 0 ? sections[index + 1] : undefined
})
const completionKind = computed(() => {
  if (isPlanSession.value) return 'plan'
  const record = currentSectionRecord.value
  if (!record) return 'section'
  if (!nextSectionRecord.value) return 'subject'
  return nextSectionRecord.value.chapter.id === record.chapter.id ? 'section' : 'chapter'
})
const completionTitle = computed(() => knowledgePointSession.value ? '本知识点练习已完成' : ({ plan: '本次计划已完成', section: '本节练习已完成', chapter: '本章练习已完成', subject: '本科目练习已完成' }[completionKind.value]))
const completionDesc = computed(() => knowledgePointSession.value ? '已完成本知识点当前收录的全部题目，可以返回知识点继续学习。' : ({ plan: '按照当前学习计划的范围，已完成本轮全部题目。', section: '太棒了，继续保持节奏，下一节还有新的题目等你完成。', chapter: '本章的所有节都已完成，可以进入下一章继续练习。', subject: '当前科目的练习已经全部完成，可以开始第二轮巩固。' }[completionKind.value]))
const nextLabel = computed(() => isLast.value ? (knowledgePointSession.value ? '完成练习' : '完成本节') : '下一题')
const returnLabel = computed(() => knowledgePointSession.value ? '返回知识点' : sessionSource.value === '错题本' ? '返回错题本' : sessionSource.value === '我的收藏' ? '返回收藏' : sessionSource.value === '智能刷题' ? '返回学习计划' : '返回刷题首页')

const createSectionQuestion = (sectionId: string): PracticeQuestion | undefined => {
  for (const subject of knowledgeSubjects) {
    for (const chapter of subject.chapters) {
      const section = chapter.sections.find(item => item.id === sectionId)
      if (!section) continue
      const point = section.points[0]
      return {
        id: `demo-${section.id}`,
        subjectId: subject.id,
        subjectName: subject.name,
        chapterId: chapter.id,
        chapterName: chapter.name,
        sectionId: section.id,
        sectionName: section.name,
        type: 'single',
        typeName: '单选题',
        year: '2024',
        source: '全国真题',
        difficulty: point.stars >= 4 ? '重点' : point.stars >= 3 ? '中等' : '基础',
        stem: `关于“${point.title}”的理解，下列说法最符合考试要求的是？`,
        options: [`准确把握${point.title}的核心概念与适用边界`, '只记忆结论，不需要理解情境', '将专业要求简单套用到所有对象', '忽略服务流程和政策依据'],
        answer: [0],
        explanation: `${point.content}答题时应结合题干情境理解概念、原则和操作边界，不能只凭关键词作出判断。`,
        knowledgePointId: point.id,
        knowledgePointTitle: point.title,
      }
    }
  }
  return undefined
}

onLoad((options?: Record<string, string>) => {
  if (!requireLogin(`/pages/practice-session/index${options ? `?${new URLSearchParams(options as Record<string, string>).toString()}` : ''}`)) return
  options = options || {}
  if (options.returnUrl) returnUrl.value = decodeURIComponent(options.returnUrl)
  const nextMode = (options.mode || 'normal') as SessionMode
  mode.value = nextMode
  knowledgePointSession.value = Boolean(options.knowledgePointId)
  sessionSource.value = options.knowledgePointId ? '知识点练习' : options.plan ? '智能刷题' : nextMode === 'favorite' ? '我的收藏' : nextMode === 'wrong' ? '错题本' : nextMode === 'weak' ? '薄弱项强化' : nextMode === 'recite' ? '挖空背题' : '章节练习'
  sessionStartedAt.value = Date.now()
  const wrongIds: string[] = uni.getStorageSync('sxb-wrong-questions') || []
  const favoriteQuestionIds = favoriteIds.value.filter(id => practiceQuestions.some(q => q.id === id))
  let list = practiceQuestions
  if (options.plan) list = getPlanQuestions(loadPlan(exam.value.id, exam.value.daysLeft))
  else if (options.knowledgePointId) list = practiceQuestions.filter(item => item.knowledgePointId === options.knowledgePointId)
  else if (options.sectionId) {
    list = practiceQuestions.filter(item => item.sectionId === options.sectionId)
  }
  if (!options.knowledgePointId && nextMode === 'weak') {
    const homeDebugState = uni.getStorageSync('sxb-debug-state-刷题首页')
    const weakDebugState = homeDebugState === 'weak-demo' || homeDebugState === 'weak-empty'
      ? homeDebugState as WeakPointDebugState
      : 'normal'
    list = getWeakQuestions(exam.value.id, weakDebugState)
  }
  if (!options.knowledgePointId && nextMode === 'wrong') list = practiceQuestions.filter(item => wrongIds.includes(item.id))
  if (!options.knowledgePointId && nextMode === 'favorite') list = practiceQuestions.filter(item => favoriteQuestionIds.includes(item.id))
  if (!options.knowledgePointId && nextMode === 'recite') list = practiceQuestions.filter(item => item.difficulty !== '基础')
  if (debugState.value === 'empty') list = []
  if (debugState.value === 'completed' && list.length) currentIndex.value = list.length - 1
  questions.value = list
  const storedAnswers = getAnswered(exam.value.id)
  Object.keys(storedAnswers).forEach(id => { answerStates.value[id] = storedAnswers[id] })
  if (options.questionId) currentIndex.value = Math.max(questions.value.findIndex(item => item.id === options.questionId), 0)
  loadCurrentState()
})

const startTimer = () => {
  if (elapsedTimer) clearInterval(elapsedTimer)
  elapsedTimer = setInterval(() => { elapsedSeconds.value = Math.max(Math.floor((Date.now() - sessionStartedAt.value) / 1000), 0) }, 1000)
}
onShow(startTimer)
onHide(() => { if (elapsedTimer) clearInterval(elapsedTimer) })
onBeforeUnmount(() => { if (elapsedTimer) clearInterval(elapsedTimer) })

const loadCurrentState = () => {
  if (!questions.value.length || !current.value) return
  const storedSelection = uni.getStorageSync(`sxb-question-selection-${exam.value.id}-${current.value.id}`) || []
  const sessionSelection = sessionSelections.value[current.value.id]
  const isRetryMode = mode.value === 'weak' || mode.value === 'wrong'
  selected.value = sessionSelection ? [...sessionSelection] : isRetryMode ? [] : [...storedSelection]
  answered.value = Boolean(sessionSelection)
  if (answered.value) selected.value = sessionSelections.value[current.value.id] || []
  reciteRevealed.value = false
  noteText.value = getNoteBySource(current.value.id, 'question')?.content || uni.getStorageSync(`sxb-question-note-${current.value.id}`) || ''
}
const chooseOption = (index: number) => {
  if (answered.value || submitting.value || mode.value === 'recite') return
  if (current.value.type === 'single') {
    selected.value = [index]
    submitAnswer()
    return
  }
  selected.value = selected.value.includes(index) ? selected.value.filter(item => item !== index) : [...selected.value, index].sort()
}
const recordDailyQuestion = () => {
  const before = recordToday(exam.value.id, current.value.id)
  if (before.length > state.todayDone) state.todayDone = before.length
}
const answerRequestIds = new Map<string, string>()
const submitAnswer = async () => {
  if (!selected.value.length || answered.value || submitting.value) return
  submitting.value = true
  const question = current.value
  const examId = exam.value.id
  const selection = [...selected.value]
  const requestKey = `${examId}:${question.id}:${selection.join(',')}`
  if (!answerRequestIds.has(requestKey)) answerRequestIds.set(requestKey, `${Date.now()}-${Math.random().toString(36).slice(2)}`)
  try {
  const resultFromServer = await api('/answers', 'POST', { examId, questionId: question.id, selection, requestId: answerRequestIds.get(requestKey) })
  if (current.value.id !== question.id || exam.value.id !== examId) return
  current.value.answer = resultFromServer.answer
  current.value.explanation = resultFromServer.explanation
  answered.value = true
  sessionSelections.value[current.value.id] = [...selected.value]
  uni.setStorageSync(`sxb-question-selection-${exam.value.id}-${current.value.id}`, selected.value)
  const result: AnswerState = selected.value.length === current.value.answer.length && selected.value.every(item => current.value.answer.includes(item)) ? 'correct' : 'wrong'
  answerStates.value[current.value.id] = result
  const status: Record<string, string> = uni.getStorageSync('sxb-question-status') || {}
  status[current.value.id] = result
  uni.setStorageSync('sxb-question-status', status)
  saveAnswered(exam.value.id, current.value.id, result)
  const wrongIds: string[] = uni.getStorageSync('sxb-wrong-questions') || []
  const nextWrongIds = result === 'correct' ? wrongIds.filter(id => id !== current.value.id) : Array.from(new Set([...wrongIds, current.value.id]))
  uni.setStorageSync('sxb-wrong-questions', nextWrongIds)
  recordDailyQuestion()
  } catch (error) { showApiError(error) } finally { submitting.value = false }
}
const markRecite = async (remembered: boolean) => {
  try { await writeRecord('recite', current.value.id, { remembered }) } catch (error) { showApiError(error); return }
  answerStates.value[current.value.id] = remembered ? 'correct' : 'wrong'
  const reviewIds: string[] = uni.getStorageSync('sxb-recite-review') || []
  uni.setStorageSync('sxb-recite-review', remembered ? reviewIds.filter(id => id !== current.value.id) : Array.from(new Set([...reviewIds, current.value.id])))
  recordDailyQuestion()
  if (currentIndex.value < questions.value.length - 1) setTimeout(() => goTo(currentIndex.value + 1), 280)
}
const optionClass = (index: number) => ({ selected: selected.value.includes(index), correct: answered.value && current.value.answer.includes(index), wrong: answered.value && selected.value.includes(index) && !current.value.answer.includes(index) })
const goTo = (index: number) => { if (submitting.value || index < 0 || index >= questions.value.length) return; currentIndex.value = index; loadCurrentState() }
const previous = () => goTo(currentIndex.value - 1)
const next = () => { if (submitting.value) return; if (isLast.value) { completionVisible.value = true; return } goTo(currentIndex.value + 1) }
const continueAfterCompletion = () => {
  if (completionKind.value === 'plan') {
    completionVisible.value = false
    uni.redirectTo({ url: `/pages/practice-session/index?plan=1&returnUrl=${encodeURIComponent(returnUrl.value)}` })
    return
  }
  const nextRecord = nextSectionRecord.value
  if (!nextRecord) {
    uni.showToast({ title: '本科目已全部完成', icon: 'success' })
    return
  }
  completionVisible.value = false
  uni.redirectTo({ url: `/pages/practice-session/index?sectionId=${encodeURIComponent(nextRecord.section.id)}&returnUrl=${encodeURIComponent(returnUrl.value)}` })
}
const toggleFavorite = async () => {
  await setFavorite(current.value.id, 'question', !isFavorite.value)
  favoriteIds.value = isFavorite.value ? favoriteIds.value.filter(id => id !== current.value.id) : [...favoriteIds.value, current.value.id]
  uni.showToast({ title: isFavorite.value ? '已收藏题目' : '已取消收藏', icon: 'none' })
}
const openKnowledge = () => uni.navigateTo({ url: `/pages/knowledge-detail/index?id=${encodeURIComponent(current.value.knowledgePointId)}` })
const openNote = () => { noteText.value = getNoteBySource(current.value.id, 'question')?.content || uni.getStorageSync(`sxb-question-note-${current.value.id}`) || ''; noteVisible.value = true }
const saveNote = async () => { if (!noteText.value.trim()) return uni.showToast({ title: '请先填写笔记内容', icon: 'none' }); await saveNoteRecord(current.value.id, 'question', noteText.value); noteVisible.value = false; uni.showToast({ title: '题目笔记已保存', icon: 'success' }) }
const back = () => {
  completionVisible.value = false
  noteVisible.value = false
  uni.reLaunch({ url: returnUrl.value })
}
const applyDebug = (key: string) => { debugState.value = key; if (key === 'empty') { questions.value = []; completionVisible.value = false } else if (key === 'completed' && questions.value.length) { currentIndex.value = questions.value.length - 1; loadCurrentState(); completionVisible.value = true } else completionVisible.value = false }
</script>

<template>
  <view class="session-page page safe-top"><view class="session-top"><button class="back-button" @tap="back"><uni-icons type="back" size="21" color="#4d5c73" /></button><view class="top-title"><text>{{ pageTitle }}</text><text>本次刷题 {{ elapsed }}</text></view><button class="favorite-button" :class="{ active: isFavorite }" @tap="toggleFavorite"><uni-icons :type="isFavorite ? 'star-filled' : 'star'" size="21" :color="isFavorite ? '#e98a3a' : '#8a96a7'" /></button></view><view v-if="!questions.length" class="empty-session"><uni-icons type="checkmarkempty" size="30" color="#1a9a7b" /><text>{{ knowledgePointSession ? '本知识点无题' : isPlanSession ? '当前计划范围暂无可练题目' : '本节暂无可练题目' }}</text><text>{{ knowledgePointSession ? '当前知识点暂未收录练习题，请返回继续学习其他内容' : isPlanSession ? '请回到学习计划调整科目、年份或题目来源' : '当前章节题库正在补充，请返回选择其他章节' }}</text><button @tap="back">返回上一页</button></view><template v-else><view class="progress-head"><text>第 {{ currentIndex + 1 }} / {{ questions.length }} 题</text><text>{{ progress }}%</text></view><view class="progress-track"><view :style="{ width: `${progress}%` }"></view></view><view class="question-params"><text>{{ current.typeName }}</text><text>{{ current.year }}年真题</text><text>{{ current.source }}</text><text>{{ current.difficulty }}</text></view>

    <template v-if="mode === 'recite'"><view class="recite-card"><view class="recite-label"><uni-icons type="flag" size="18" color="#6949df" /><text>挖空回忆</text></view><text class="question-stem">{{ current.stem }}</text><view class="blank-area"><text v-for="(_, index) in current.answer" :key="index">第 {{ index + 1 }} 处答案</text></view><button v-if="!reciteRevealed" class="reveal-button" @tap="reciteRevealed = true">查看答案</button><view v-else class="recite-answer"><text>参考答案</text><text>{{ current.answer.map(index => current.options[index]).join('；') }}</text><text>{{ current.explanation }}</text><view class="recite-actions"><button @tap="markRecite(false)">还没记住</button><button @tap="markRecite(true)">记住了</button></view></view></view></template>

    <template v-else><text class="question-stem">{{ current.stem }}</text><view class="options"><view v-for="(option, index) in current.options" :key="option" class="option" :class="optionClass(index)" @tap="chooseOption(index)"><text class="option-letter">{{ String.fromCharCode(65 + index) }}</text><text class="option-text">{{ option }}</text><uniIcons v-if="answered && current.answer.includes(index)" type="checkmarkempty" size="21" color="#1a9a7b" /><uniIcons v-else-if="answered && selected.includes(index)" type="closeempty" size="21" color="#d45d63" /></view></view><button v-if="current.type === 'multiple' && !answered && selected.length" class="submit-button" @tap="submitAnswer">确认答案</button><view v-if="answered" class="analysis-card" :class="isCorrect ? 'correct' : 'wrong'"><view class="result-line"><view class="result-icon"><uni-icons :type="isCorrect ? 'checkmarkempty' : 'closeempty'" size="20" :color="isCorrect ? '#1a9a7b' : '#d45d63'" /></view><view><text>{{ isCorrect ? '回答正确' : '回答错误' }}</text><text>你的答案：{{ selectedAnswer }}　正确答案：{{ correctAnswer }}</text></view></view><view class="analysis-content"><text class="analysis-title">答案解析</text><text class="analysis-text">{{ current.explanation }}</text></view></view></template>
    <view class="knowledge-float" @tap="openKnowledge"><view class="knowledge-link"><view><text>{{ knowledgeLine }}</text><text class="knowledge-title">{{ current.knowledgePointId.replace('kp-', '').replaceAll('-', '.') }} {{ current.knowledgePointTitle }}</text></view><uni-icons type="forward" size="20" color="#7e8ca0" /></view></view><view class="session-bottom"><button :disabled="currentIndex === 0" @tap="previous"><uni-icons type="back" size="18" color="#526783" />上一题</button><button class="note-bottom" @tap="openNote"><uni-icons type="compose" size="18" color="#7655df" />记笔记</button><button @tap="next">{{ nextLabel }}<uni-icons type="forward" size="18" color="#526783" /></button></view></template>

    <view v-if="completionVisible && questions.length" class="completion-mask"><view class="completion-panel"><view class="completion-icon"><uni-icons type="checkmarkempty" size="28" color="#fff" /></view><text class="completion-title">{{ completionTitle }}</text><text class="completion-desc">{{ completionDesc }}</text><view class="completion-stats"><view><text>{{ questions.length }}</text><text>本组题目</text></view><view><text>{{ progress }}%</text><text>完成进度</text></view></view><button v-if="!knowledgePointSession && completionKind === 'plan'" class="completion-primary" @tap="continueAfterCompletion">重新练习计划题目</button><button v-else-if="!knowledgePointSession && nextSectionRecord" class="completion-primary" @tap="continueAfterCompletion">{{ completionKind === 'chapter' ? '进入下一章' : '继续下一节' }}</button><button class="completion-secondary" @tap.stop="back">{{ returnLabel }}</button></view></view>
    <DebugMenu page="题目内容页" :options="[{ key: 'normal', label: '正常答题' }, { key: 'empty', label: '暂无题目' }, { key: 'completed', label: '最后一题完成' }]" @select="applyDebug" />
    <view v-if="noteVisible" class="drawer-mask" @tap="noteVisible = false"><view class="note-drawer" @tap.stop><view class="drawer-handle"></view><view class="note-head"><text>题目笔记</text><button @tap="noteVisible = false"><uni-icons type="closeempty" size="20" color="#64758b" /></button></view><text class="note-question">{{ current.stem }}</text><textarea v-model="noteText" maxlength="1000" placeholder="记录解题思路、易错原因或复习提醒" placeholder-class="note-placeholder" /><view class="note-foot"><text>{{ noteText.length }} / 1000</text><button @tap="saveNote">保存笔记</button></view></view></view>
  </view>
</template>

<style scoped lang="scss">
.session-page { max-width: 430px; min-height: 100vh; margin: 0 auto; box-sizing: border-box; padding-top: calc(env(safe-area-inset-top) + 16rpx); padding-bottom: calc(110px + env(safe-area-inset-bottom)); background: #f5f7fb; }.session-top { display: flex; align-items: center; justify-content: space-between; min-height: 58rpx; }.back-button,.favorite-button { width: 58rpx; height: 58rpx; display: flex; align-items: center; justify-content: center; margin: 0; padding: 0; background: #edf1fb; border-radius: 15rpx; }.favorite-button { background: #fff; border: 1rpx solid #e0e6f0; }.favorite-button.active { background: #fff4e6; border-color: #f8d5a7; }.back-button::after,.favorite-button::after { display: none; }.top-title { display: flex; align-items: center; flex: 1; min-width: 0; flex-direction: column; gap: 3rpx; }.top-title text:first-child { color: #1e3048; font-size: var(--sxb-text-item); font-weight: 700; }.top-title text:last-child { overflow: hidden; max-width: 240rpx; color: #8a96a5; font-size: var(--sxb-text-meta); text-overflow: ellipsis; white-space: nowrap; }.progress-head { display: flex; align-items: center; justify-content: space-between; margin-top: 18rpx; color: #536783; font-size: var(--sxb-text-small); }.progress-head text:first-child { color: #30425c; font-weight: 700; }.progress-head text:last-child { color: #3569e8; font-weight: 700; }.progress-track { height: 7rpx; margin-top: 8rpx; overflow: hidden; background: #e3e9f2; border-radius: 7rpx; }.progress-track view { height: 100%; background: linear-gradient(90deg,#3569e8,#7655df); border-radius: 7rpx; }.question-params { display: flex; align-items: center; flex-wrap: wrap; gap: 7rpx; margin-top: 18rpx; }.question-params text { padding: 5rpx 9rpx; color: #3569e8; background: #eaf0ff; border-radius: 6rpx; font-size: var(--sxb-text-meta); font-weight: 700; }.question-params text:nth-child(2) { color: #d47a25; background: #fff2df; }.question-params text:nth-child(3) { color: #6949df; background: #f0edff; }.question-params text:nth-child(4) { color: #1a9a7b; background: #e8f7f1; }.question-stem { display: block; margin: 22rpx 0 24rpx; color: #1c2d44; font-size: var(--sxb-text-title); line-height: 1.65; font-weight: 700; }.options { display: flex; flex-direction: column; gap: 12rpx; }.option { display: flex; align-items: center; gap: 12rpx; min-height: 72rpx; padding: 14rpx 15rpx; background: #fff; border: 2rpx solid #e0e6ef; border-radius: 11rpx; }.option.selected { background: #eef3ff; border-color: #7c9cf0; }.option.correct { background: #ebf8f3; border-color: #59af98; }.option.wrong { background: #fff0ef; border-color: #dc7579; }.option-letter { width: 42rpx; height: 42rpx; display: flex; align-items: center; justify-content: center; flex: none; color: #62738a; background: #edf1f6; border-radius: 50%; font-size: var(--sxb-text-small); font-weight: 700; }.selected .option-letter { color: #fff; background: #3569e8; }.correct .option-letter { color: #fff; background: #1a9a7b; }.wrong .option-letter { color: #fff; background: #d45d63; }.option-text { flex: 1; color: #30425c; font-size: var(--sxb-text-body); line-height: 1.55; }.submit-button { width: 100%; height: 56rpx; line-height: 56rpx; margin: 18rpx 0 0; color: #fff; background: #3569e8; border-radius: 9rpx; font-size: var(--sxb-text-body); font-weight: 700; }.submit-button[disabled] { opacity: .45; }.submit-button::after { display: none; }.analysis-card { margin-top: 19rpx; padding: 17rpx; background: #fff; border: 1rpx solid #dfe6f0; border-top: 5rpx solid #1a9a7b; border-radius: 12rpx; }.analysis-card.wrong { border-top-color: #d45d63; }.result-line { display: flex; align-items: center; gap: 10rpx; }.result-icon { width: 39rpx; height: 39rpx; display: flex; align-items: center; justify-content: center; flex: none; background: #e8f7f1; border-radius: 50%; }.wrong .result-icon { background: #fff0ef; }.result-line>view:last-child { display: flex; flex-direction: column; gap: 3rpx; }.result-line>view:last-child text:first-child { color: #1a9a7b; font-size: var(--sxb-text-body); font-weight: 700; }.wrong .result-line>view:last-child text:first-child { color: #d45d63; }.result-line>view:last-child text:last-child { color: #6f7e91; font-size: var(--sxb-text-meta); }.analysis-content { margin-top: 15rpx; padding-top: 14rpx; border-top: 1rpx solid #e9edf3; }.analysis-title { display: block; color: #263953; font-size: var(--sxb-text-body); font-weight: 700; }.analysis-text { display: block; margin-top: 8rpx; color: #53657c; font-size: var(--sxb-text-body); line-height: 1.75; }.note-action { width: 100%; height: 62rpx; display: flex; align-items: center; justify-content: center; gap: 8rpx; margin: 16rpx 0 0; padding: 0; color: #6548ca; background: #f0edff; border: 1rpx solid #ddd5ff; border-radius: 9rpx; font-size: var(--sxb-text-body); font-weight: 700; }.note-action::after { display: none; }.knowledge-link { display: flex; align-items: center; justify-content: space-between; gap: 8rpx; margin-top: 12rpx; padding: 12rpx; background: #edf3ff; border-radius: 8rpx; }.knowledge-link>view { display: flex; flex: 1; min-width: 0; flex-direction: column; gap: 3rpx; }.knowledge-link text:first-child { color: #3569e8; font-size: var(--sxb-text-meta); font-weight: 700; }.knowledge-link text:last-child { overflow: hidden; color: #40536d; font-size: var(--sxb-text-small); text-overflow: ellipsis; white-space: nowrap; }.recite-card { margin-top: 17rpx; padding: 19rpx; background: #fff; border: 1rpx solid #dfd9fa; border-top: 5rpx solid #7655df; border-radius: 13rpx; }.recite-label { display: flex; align-items: center; gap: 6rpx; color: #6949df; font-size: var(--sxb-text-small); font-weight: 700; }.recite-card .question-stem { margin-bottom: 18rpx; }.blank-area { display: flex; flex-direction: column; gap: 10rpx; }.blank-area text { padding: 15rpx; color: #9b91ba; background: #f6f3ff; border: 2rpx dashed #cfc5f5; border-radius: 9rpx; font-size: var(--sxb-text-small); text-align: center; }.reveal-button { width: 100%; height: 54rpx; line-height: 54rpx; margin: 19rpx 0 0; color: #fff; background: #7655df; border-radius: 9rpx; font-size: var(--sxb-text-small); font-weight: 700; }.reveal-button::after { display: none; }.recite-answer { margin-top: 18rpx; padding-top: 16rpx; border-top: 1rpx solid #ece7fb; }.recite-answer>text { display: block; }.recite-answer>text:first-child { color: #6949df; font-size: var(--sxb-text-small); font-weight: 700; }.recite-answer>text:nth-child(2) { margin-top: 8rpx; color: #263953; font-size: var(--sxb-text-body); line-height: 1.6; font-weight: 700; }.recite-answer>text:nth-child(3) { margin-top: 9rpx; color: #66768b; font-size: var(--sxb-text-small); line-height: 1.65; }.recite-actions { display: flex; gap: 9rpx; margin-top: 17rpx; }.recite-actions button { flex: 1; height: 51rpx; line-height: 51rpx; margin: 0; color: #b56929; background: #fff2df; border-radius: 8rpx; font-size: var(--sxb-text-small); font-weight: 700; }.recite-actions button:last-child { color: #fff; background: #1a9a7b; }.recite-actions button::after { display: none; }.session-bottom { position: fixed; z-index: 30; left: 50%; bottom: 0; width: 100%; max-width: 430px; box-sizing: border-box; display: grid; grid-template-columns: 1fr 1.15fr 1fr; gap: 8rpx; padding: 12rpx 20px calc(12rpx + env(safe-area-inset-bottom)); transform: translateX(-50%); background: #fff; border-top: 1rpx solid #e0e6ef; box-shadow: 0 -8rpx 24rpx rgba(36,54,79,.1); }.session-bottom button { height: 58rpx; display: flex; align-items: center; justify-content: center; gap: 4rpx; margin: 0; padding: 0; color: #526783; background: #f2f5f9; border-radius: 8rpx; font-size: var(--sxb-text-small); }.session-bottom .card-button { color: #fff; background: #3569e8; font-weight: 700; }.session-bottom button::after { display: none; }.session-bottom button[disabled] { color: #b5beca; opacity: .55; }.drawer-mask { position: fixed; z-index: 60; inset: 0; display: flex; align-items: flex-end; justify-content: center; background: rgba(18,29,50,.46); }.answer-drawer,.note-drawer { width: 100%; max-width: 430px; max-height: 77vh; box-sizing: border-box; padding: 10rpx 20px calc(18rpx + env(safe-area-inset-bottom)); background: #fff; border-radius: 17rpx 17rpx 0 0; box-shadow: 0 -16rpx 38rpx rgba(23,36,62,.18); }.drawer-handle { width: 48rpx; height: 6rpx; margin: 0 auto 14rpx; background: #d6dce5; border-radius: 6rpx; }.drawer-head,.note-head { display: flex; align-items: center; justify-content: space-between; }.drawer-head>view { display: flex; flex-direction: column; gap: 3rpx; }.drawer-head>view text:first-child,.note-head>text { color: #1f3149; font-size: var(--sxb-text-item); font-weight: 700; }.drawer-head>view text:last-child { color: #8b96a5; font-size: var(--sxb-text-meta); }.drawer-head button,.note-head button { width: 39rpx; height: 39rpx; display: flex; align-items: center; justify-content: center; margin: 0; padding: 0; background: #f1f4f8; border-radius: 50%; }.drawer-head button::after,.note-head button::after { display: none; }.answer-stats { display: flex; align-items: center; gap: 15rpx; margin-top: 17rpx; color: #68788e; font-size: var(--sxb-text-meta); }.answer-stats>view:not(.accuracy) { display: flex; align-items: center; gap: 4rpx; }.accuracy { display: flex; flex-direction: column; margin-right: auto; }.accuracy text:first-child { color: #1f3149; font-size: var(--sxb-text-heading); line-height: 1; font-weight: 700; }.accuracy text:last-child { margin-top: 3rpx; color: #8a96a5; font-size: var(--sxb-text-meta); }.green-dot,.red-dot,.gray-dot { width: 9rpx; height: 9rpx; border-radius: 50%; }.green-dot { background: #35b58c; }.red-dot { background: #e26f74; }.gray-dot { background: #c8ced8; }.drawer-progress { height: 7rpx; margin-top: 13rpx; overflow: hidden; background: #e7ecf3; border-radius: 7rpx; }.drawer-progress view { height: 100%; background: linear-gradient(90deg,#3569e8,#1a9a7b); border-radius: 7rpx; }.card-filters { display: flex; gap: 7rpx; margin-top: 15rpx; }.card-filters text { flex: 1; padding: 8rpx 2rpx; color: #75849a; background: #f2f4f8; border-radius: 7rpx; font-size: var(--sxb-text-meta); text-align: center; }.card-filters text.active { color: #3569e8; background: #eaf0ff; font-weight: 700; }.number-scroll { max-height: 45vh; margin-top: 17rpx; }.number-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 14rpx; padding: 2rpx 1rpx 12rpx; }.number-item { position: relative; aspect-ratio: 1; display: flex; align-items: center; justify-content: center; color: #8793a3; background: #f0f2f5; border: 3rpx solid transparent; border-radius: 50%; font-size: var(--sxb-text-small); font-weight: 700; }.number-item.correct { color: #1a9a7b; background: #e5f7f0; }.number-item.wrong { color: #d45d63; background: #fff0ef; }.number-item.current { border-color: #3569e8; box-shadow: 0 0 0 4rpx #e8eeff; }.number-item uni-icons { position: absolute; right: -2rpx; top: -4rpx; }.filter-empty { padding: 38rpx 0; color: #9aa5b4; font-size: var(--sxb-text-meta); text-align: center; }.note-drawer { padding-bottom: calc(20rpx + env(safe-area-inset-bottom)); }.note-question { display: block; overflow: hidden; margin-top: 14rpx; color: #53657c; font-size: var(--sxb-text-meta); line-height: 1.5; white-space: nowrap; text-overflow: ellipsis; }.note-drawer textarea { width: 100%; min-height: 190rpx; box-sizing: border-box; margin-top: 13rpx; padding: 13rpx; color: #30425c; background: #f8fafd; border: 1rpx solid #dfe6f0; border-radius: 9rpx; font-size: var(--sxb-text-body); line-height: 1.6; }.note-placeholder { color: #9ea9b8; }.note-foot { display: flex; align-items: center; justify-content: space-between; margin-top: 11rpx; color: #9aa5b4; font-size: var(--sxb-text-meta); }.note-foot button { width: 116rpx; height: 43rpx; line-height: 43rpx; margin: 0; padding: 0; color: #fff; background: #3569e8; border-radius: 7rpx; font-size: var(--sxb-text-meta); font-weight: 700; }.note-foot button::after { display: none; }
.session-page { padding-bottom: calc(154px + env(safe-area-inset-bottom)); }
.knowledge-float { position: fixed; z-index: 31; left: 50%; bottom: calc(69px + env(safe-area-inset-bottom)); width: calc(100% - 40px); max-width: 390px; box-sizing: border-box; transform: translateX(-50%); }
.knowledge-float .knowledge-link { margin: 0; min-height: 50px; box-sizing: border-box; padding: 11px 14px; background: #edf3ff; border: 1px solid #d7e4ff; border-radius: 10px; box-shadow: 0 7px 18px rgba(36,54,79,.12); }
.knowledge-float .knowledge-link text:first-child { font-size: var(--sxb-text-meta); }
.knowledge-float .knowledge-title { font-size: var(--sxb-text-body) !important; line-height: 1.45; }
.completion-mask { position: fixed; z-index: 70; inset: 0; display: flex; align-items: center; justify-content: center; padding: 24px; background: rgba(18,29,50,.48); }
.completion-panel { width: 100%; max-width: 360px; box-sizing: border-box; display: flex; align-items: center; flex-direction: column; padding: 28rpx 24rpx 22rpx; background: #fff; border-radius: 17rpx; box-shadow: 0 20rpx 48rpx rgba(23,36,62,.22); }
.completion-icon { width: 64rpx; height: 64rpx; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg,#1a9a7b,#38b995); border-radius: 50%; }
.completion-title { margin-top: 14rpx; color: #1d3048; font-size: var(--sxb-text-title); font-weight: 700; }
.completion-desc { margin-top: 8rpx; color: #718096; font-size: var(--sxb-text-meta); line-height: 1.6; text-align: center; }
.completion-stats { width: 100%; display: grid; grid-template-columns: 1fr 1fr; gap: 10rpx; margin-top: 18rpx; }
.completion-stats view { display: flex; align-items: center; flex-direction: column; padding: 12rpx 6rpx; background: #f5f8fc; border-radius: 9rpx; }
.completion-stats text:first-child { color: #315bd4; font-size: var(--sxb-text-item); font-weight: 700; }
.completion-stats text:last-child { margin-top: 4rpx; color: #8a96a5; font-size: var(--sxb-text-meta); }
.completion-primary,.completion-secondary { width: 100%; height: 54rpx; line-height: 54rpx; margin: 16rpx 0 0; padding: 0; border-radius: 8rpx; font-size: var(--sxb-text-small); font-weight: 700; }
.completion-primary { color: #fff; background: #3569e8; }
.completion-secondary { margin-top: 9rpx; color: #60728a; background: #f0f3f7; }
.completion-primary::after,.completion-secondary::after { display: none; }

@import '@/styles/content-system.scss';
</style>
