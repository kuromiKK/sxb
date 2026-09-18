import { computed, reactive } from 'vue'
import { exam, examCategories, question } from '@/mock/data'
import { getTodayAnsweredIds, loadPlan, savePlan, type PracticePlan } from '@/utils/practice-plan'
import { api, token, learningPlan, clearSession, refreshRights, refreshPersonalData, clearPersonalCache, showApiError } from '@/services/api'
import { refreshCatalog } from '@/services/catalog'
import { currentPageUrl, openLogin, safePageUrl } from '@/utils/navigation'

const savedExam = uni.getStorageSync('sxb-current-exam')
const savedLogin = Boolean(token())
const initialExam = savedExam || exam
const initialPlan = loadPlan(initialExam.id, initialExam.daysLeft)

const state = reactive({
  selectedTab: 0,
  answered: false,
  selectedOption: -1,
  isFavorite: false,
  isWrong: false,
  todayDone: getTodayAnsweredIds(initialExam.id).length,
  todayTarget: initialPlan.target,
  isLoggedIn: savedLogin,
  currentExam: savedExam || exam,
})

export const useAppStore = () => {
  const todayRemaining = computed(() => learningPlan.data?.exam.id === state.currentExam.id ? learningPlan.data.progress.todayRemaining : Math.max(state.todayTarget - state.todayDone, 0))
  const submitAnswer = (index: number) => {
    state.selectedOption = index
    state.answered = true
    state.isWrong = index !== question.answer
  }
  const toggleFavorite = () => { state.isFavorite = !state.isFavorite }
  const resetQuestion = () => { state.answered = false; state.selectedOption = -1; state.isWrong = false }
  const login = (phone: string) => {
    if (!token()) return
    state.isLoggedIn = true
    uni.setStorageSync('sxb-login', { ...uni.getStorageSync('sxb-login'), phone, loggedAt: Date.now() })
  }
  const logout = () => {
    if (token()) void api('/auth/logout', 'POST').catch(() => {})
    clearSession()
    state.isLoggedIn = false
    uni.removeStorageSync('sxb-login')
  }
  const selectExam = async (examId: string) => {
    const selected = examCategories.flatMap(category => category.groups.flatMap(group => group.exams)).find(item => item.id === examId)
    if (!selected) throw new Error('考试不存在或已停用，请刷新后重试')
    state.currentExam = { ...exam, ...selected }
    uni.setStorageSync('sxb-current-exam', state.currentExam)
    clearPersonalCache()
    await refreshCatalog()
    state.currentExam = { ...exam }
    await refreshRights()
    await refreshPersonalData()
  }
  const requireLogin = (redirect?: string) => {
    state.isLoggedIn = Boolean(token())
    if (state.isLoggedIn) return true
    const current = currentPageUrl(), target = safePageUrl(redirect || current)
    const guardedPage = current.split('?')[0] === target.split('?')[0]
    openLogin(guardedPage ? current : target, guardedPage)
    return false
  }
  const currentExam = computed(() => state.currentExam)
  const plan = computed<PracticePlan>(() => loadPlan(state.currentExam.id, state.currentExam.daysLeft))
  const refreshPlanState = () => {
    state.currentExam = uni.getStorageSync('sxb-current-exam') || exam
    const live = learningPlan.data?.exam.id === state.currentExam.id ? learningPlan.data : null
    const next = live?.plan || plan.value
    state.todayTarget = live?.progress.todayTarget ?? next.target
    state.todayDone = live?.progress.todayDone ?? getTodayAnsweredIds(state.currentExam.id).length
  }
  const saveCurrentPlan = async (next: PracticePlan) => {
    await savePlan(next)
    state.todayTarget = next.target
    state.todayDone = getTodayAnsweredIds(state.currentExam.id).length
  }
  refreshPlanState()
  return { state, exam: currentExam, plan, todayRemaining, submitAnswer, toggleFavorite, resetQuestion, login, logout, selectExam, requireLogin, refreshPlanState, saveCurrentPlan }
}
