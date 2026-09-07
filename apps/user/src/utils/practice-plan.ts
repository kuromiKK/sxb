import { knowledgeSubjects, practiceQuestions, type PracticeQuestion } from '@/mock/data'
import { getFavoriteIds } from '@/utils/favorites'
import { api, learningPlan } from '@/services/api'

export type PlanSource = 'chapter' | 'favorite' | 'wrong'
export type PlanRound = 'coverage' | 'consolidation'
export type PracticePlan = {
  examId: string
  subjectIds: string[]
  chapterIds: string[]
  years: string[]
  sources: PlanSource[]
  restWeekdays: number[]
  skipDates: string[]
  round: PlanRound
  includeCourses: boolean
  includeWrong: boolean
  includeNotes: boolean
  includeCheatSheets: boolean
  questionIds: string[]
  dailyTarget?: number
  target: number
  targetCustomized?: boolean
  minTarget: number
  total: number
  updatedAt: number
}

const todayKey = () => {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

const storage = (key: string, fallback: any) => {
  const value = uni.getStorageSync(key)
  return value === '' || value === null || value === undefined ? fallback : value
}

export const getPlanKey = (examId: string) => `sxb-practice-plan-${examId}`
export const getAnsweredKey = (examId: string) => `sxb-answered-${examId}`

export const getAnswered = (examId: string): Record<string, 'correct' | 'wrong'> => storage(getAnsweredKey(examId), {})
export const getWrongIds = () => storage('sxb-wrong-questions', []) as string[]
export const getFavoriteQuestionIds = () => getFavoriteIds().filter(id => practiceQuestions.some(q => q.id === id))

const chapterQuestionIds = (chapterIds: string[]) => {
  const selected = new Set(chapterIds)
  return practiceQuestions.filter(q => selected.has(q.chapterId)).map(q => q.id)
}

export const getPlanQuestions = (plan: Pick<PracticePlan, 'subjectIds' | 'chapterIds' | 'includeWrong' | 'round'> & Partial<Pick<PracticePlan, 'years' | 'sources'>>): PracticeQuestion[] => {
  if (Array.isArray(plan.chapterIds)) return practiceQuestions.filter(q => plan.chapterIds.includes(q.chapterId) && (q.type as string) !== 'subjective')
  const subjectIds = new Set(plan.subjectIds)
  const chapterIds = new Set<string>([])
  const years = new Set(plan.years || [])
  const sourceSet = new Set(plan.sources || [])
  const selectedByChapter = chapterIds.size ? new Set(chapterQuestionIds([...chapterIds])) : null
  const base = practiceQuestions.filter(q => (!subjectIds.size || subjectIds.has(q.subjectId)) && (!years.size || years.has(q.year)) && (!selectedByChapter || selectedByChapter.has(q.id)))
  const ids = new Set<string>()
  // New plans use chapterIds as the source of truth. Legacy plans still load safely.
  if (chapterIds.size || !plan.sources) base.forEach(q => ids.add(q.id))
  if (sourceSet.has('chapter')) base.forEach(q => ids.add(q.id))
  if (sourceSet.has('favorite')) getFavoriteQuestionIds().forEach(id => ids.add(id))
  if (sourceSet.has('wrong') || plan.includeWrong || plan.round === 'consolidation') getWrongIds().forEach(id => ids.add(id))
  return practiceQuestions.filter(q => ids.has(q.id) && (!subjectIds.size || subjectIds.has(q.subjectId)) && (!years.size || years.has(q.year)) && (!selectedByChapter || selectedByChapter.has(q.id)))
}

export const getPlanCompletedCount = (plan: Pick<PracticePlan, 'examId'> & { questionIds?: string[] }) => {
  const ids = new Set(plan.questionIds || [])
  if (!ids.size) return 0
  const answered = getAnswered(plan.examId)
  return [...ids].filter(questionId => answered[questionId] === 'correct' || answered[questionId] === 'wrong').length
}

export const calculateMinimum = (total: number, done: number, daysLeft: number) => Math.max(total > done ? Math.ceil((total - done) / Math.max(daysLeft, 1)) : 0, 0)

export const dateKey = (date: Date) => {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export const getActiveDates = (startDate: Date | string, days: number, restWeekdays: number[] = [], skipDates: string[] = []) => {
  const start = typeof startDate === 'string' ? new Date(`${startDate}T00:00:00`) : new Date(startDate)
  const rest = new Set(restWeekdays)
  const skipped = new Set(skipDates)
  const result: string[] = []
  for (let offset = 0; offset < Math.max(days, 0); offset += 1) {
    const date = new Date(start)
    date.setDate(start.getDate() + offset)
    const key = dateKey(date)
    if (!rest.has(date.getDay()) && !skipped.has(key)) result.push(key)
  }
  return result
}

export const allocateQuestionCounts = (totalRemaining: number, activeDates: string[]) => {
  const count = activeDates.length
  if (!count || totalRemaining <= 0) return activeDates.map(date => ({ date, count: 0 }))
  const base = Math.floor(totalRemaining / count)
  const remainder = totalRemaining % count
  return activeDates.map((date, index) => ({ date, count: base + (index < remainder ? 1 : 0) }))
}

export const getQuestionIdsForChapters = (chapterIds: string[]) => chapterQuestionIds(chapterIds)

const allChapterIds = () => knowledgeSubjects.flatMap(subject => subject.chapters.map(chapter => chapter.id))

export const defaultPlan = (examId: string, daysLeft: number): PracticePlan => {
  const subjectIds = Array.from(new Set(practiceQuestions.map(q => q.subjectId)))
  const chapterIds = allChapterIds()
  const questionIds = getQuestionIdsForChapters(chapterIds)
  const total = questionIds.length
  const minTarget = calculateMinimum(total, 0, daysLeft)
  const years = Array.from(new Set(practiceQuestions.map(q => q.year))).sort((a, b) => Number(b) - Number(a))
  const sources: PlanSource[] = ['chapter', 'favorite', 'wrong']
  return { examId, subjectIds, chapterIds, years, sources, restWeekdays: [], skipDates: [], round: 'coverage', includeCourses: true, includeWrong: false, includeNotes: true, includeCheatSheets: false, questionIds, target: minTarget, targetCustomized: false, minTarget, total, updatedAt: Date.now() }
}

export const loadPlan = (examId: string, daysLeft: number) => {
  if (learningPlan.data?.exam.id === examId) return learningPlan.data.plan as PracticePlan
  const saved = storage(getPlanKey(examId), null) as Partial<PracticePlan> | null
  const base = defaultPlan(examId, daysLeft)
  if (!saved) return base
  const normalized = { ...base, ...saved, restWeekdays: Array.isArray(saved.restWeekdays) ? saved.restWeekdays : [], skipDates: Array.isArray(saved.skipDates) ? saved.skipDates : [], round: saved.round === 'consolidation' ? 'consolidation' : 'coverage', includeCourses: saved.includeCourses !== false, includeWrong: saved.includeWrong === true, includeNotes: saved.includeNotes !== false, includeCheatSheets: saved.includeCheatSheets === true } as PracticePlan
  const questions = normalized.questionIds?.length ? practiceQuestions.filter(q => normalized.questionIds.includes(q.id)) : getPlanQuestions(normalized)
  const questionIds = questions.map(q => q.id)
  const minTarget = calculateMinimum(questions.length, getPlanCompletedCount({ examId, questionIds }), daysLeft)
  const targetCustomized = normalized.targetCustomized === true
  const target = targetCustomized ? Math.max(Number(normalized.target ?? (saved as any).dailyTarget) || 0, 0) : minTarget
  return { ...normalized, questionIds, total: questions.length, minTarget, target, targetCustomized }
}

export const savePlan = async (plan: PracticePlan) => {
  const payload = {
    subjectIds: plan.subjectIds,
    chapterIds: plan.chapterIds,
    dailyTarget: plan.target,
    targetCustomized: plan.targetCustomized === true,
    restWeekdays: plan.restWeekdays,
    skipDates: plan.skipDates,
    round: plan.round,
    includeCourses: plan.includeCourses,
    includeWrong: plan.includeWrong,
    includeNotes: plan.includeNotes,
    includeCheatSheets: plan.includeCheatSheets,
    total: plan.questionIds.length,
    questionIds: [...new Set(plan.questionIds)],
  }
  const result = await api(`/learning-plan/${plan.examId}`, 'PUT', payload)
  learningPlan.data = result
  uni.setStorageSync(getPlanKey(plan.examId), result.plan)
}
export const getTodayAnsweredIds = (examId: string) => storage(`sxb-today-questions-${examId}-${todayKey()}`, []) as string[]
export const recordToday = (examId: string, questionId: string) => {
  const key = `sxb-today-questions-${examId}-${todayKey()}`
  const ids = storage(key, []) as string[]
  if (!ids.includes(questionId)) uni.setStorageSync(key, [...ids, questionId])
  return ids.includes(questionId) ? ids : [...ids, questionId]
}

export const saveAnswered = (examId: string, id: string, result: 'correct' | 'wrong') => {
  const answers = getAnswered(examId)
  answers[id] = result
  uni.setStorageSync(getAnsweredKey(examId), answers)
}
