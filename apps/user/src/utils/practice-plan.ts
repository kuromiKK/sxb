import { practiceQuestions, type PracticeQuestion } from '@/mock/data'
import { getFavoriteIds } from '@/utils/favorites'
import { writeRecord } from '@/services/api'

export type PlanSource = 'chapter' | 'favorite' | 'wrong'
export type PracticePlan = {
  examId: string
  subjectIds: string[]
  years: string[]
  sources: PlanSource[]
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

export const getPlanQuestions = (plan: Pick<PracticePlan, 'subjectIds' | 'years' | 'sources'>): PracticeQuestion[] => {
  const subjectIds = new Set(plan.subjectIds)
  const years = new Set(plan.years)
  const sourceSet = new Set(plan.sources)
  const base = practiceQuestions.filter(q => (!subjectIds.size || subjectIds.has(q.subjectId)) && (!years.size || years.has(q.year)))
  const allSources = !sourceSet.size || sourceSet.has('chapter')
  const ids = new Set<string>()
  if (allSources) base.forEach(q => ids.add(q.id))
  if (sourceSet.has('favorite')) getFavoriteQuestionIds().forEach(id => ids.add(id))
  if (sourceSet.has('wrong')) getWrongIds().forEach(id => ids.add(id))
  return practiceQuestions.filter(q => ids.has(q.id) && (!subjectIds.size || subjectIds.has(q.subjectId)) && (!years.size || years.has(q.year)))
}

export const calculateMinimum = (total: number, done: number, daysLeft: number) => Math.max(total > done ? Math.ceil((total - done) / Math.max(daysLeft, 1)) : 0, 0)

export const defaultPlan = (examId: string, daysLeft: number): PracticePlan => {
  const subjectIds = Array.from(new Set(practiceQuestions.map(q => q.subjectId)))
  const years = Array.from(new Set(practiceQuestions.map(q => q.year))).sort((a, b) => Number(b) - Number(a))
  const sources: PlanSource[] = ['chapter', 'favorite', 'wrong']
  const total = getPlanQuestions({ subjectIds, years, sources }).length
  const minTarget = calculateMinimum(total, 0, daysLeft)
  return { examId, subjectIds, years, sources, target: minTarget, targetCustomized: false, minTarget, total, updatedAt: Date.now() }
}

export const loadPlan = (examId: string, daysLeft: number) => {
  const saved = storage(getPlanKey(examId), null) as Partial<PracticePlan> | null
  const base = defaultPlan(examId, daysLeft)
  if (!saved) return base
  const questions = getPlanQuestions(saved as PracticePlan)
  const minTarget = calculateMinimum(questions.length, 0, daysLeft)
  const targetCustomized = saved.targetCustomized === true
  const target = targetCustomized ? Math.max(Number(saved.target) || 0, 0) : minTarget
  return { ...base, ...saved, total: questions.length, minTarget, target, targetCustomized }
}

export const savePlan = async (plan: PracticePlan) => { await writeRecord('plan', 'current', plan); uni.setStorageSync(getPlanKey(plan.examId), { ...plan, updatedAt: Date.now() }) }
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
