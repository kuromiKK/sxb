import { reactive } from 'vue'
import { knowledgeSubjects, practiceQuestions, courseCatalog, exam } from '@/mock/data'

const TOKEN_KEY = 'sxb-api-token'
export const account = reactive({ level: 'free', trial: false, expiresAt: '', examId: '', loading: false })
export const token = () => String(uni.getStorageSync(TOKEN_KEY) || '')
export const selectedExamId = () => String(uni.getStorageSync('sxb-current-exam')?.id || 'junior-social-worker')
export function api<T = any>(path: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET', data?: any): Promise<T> {
  const requestToken = token()
  return new Promise((resolve, reject) => {
    uni.request({
      url: `${import.meta.env.VITE_API_BASE || '/api'}${path}`, method, data,
      header: { 'Content-Type': 'application/json', ...(requestToken ? { Authorization: `Bearer ${requestToken}` } : {}) },
      success: result => {
        if (result.statusCode >= 200 && result.statusCode < 300) return resolve(result.data as T)
        if (result.statusCode === 401 && requestToken === token()) clearSession()
        reject(new Error((result.data as any)?.message || '请求失败，请重试'))
      },
      fail: () => reject(new Error('无法连接服务，请检查网络后重试')),
    })
  })
}
export function clearSession() {
  uni.removeStorageSync(TOKEN_KEY)
  uni.removeStorageSync('sxb-login')
  uni.removeStorageSync('sxb-demo-rights')
  Object.assign(account, { level: 'free', trial: false, expiresAt: '', examId: '' })
  clearPersonalCache()
}
export function clearPersonalCache() {
  const keys = uni.getStorageInfoSync().keys
  keys.filter(key => /^sxb-(favorite|note|wrong|answered|today-questions|practice-plan|rights-orders|pending-order|handout|course-progress|completed-courses|question-selection|question-status|recite|unread|knowledge-note|course-note|question-note)/.test(key)).forEach(key => uni.removeStorageSync(key))
}
export function acceptSession(result: { token: string; user: any }) {
  clearPersonalCache()
  uni.setStorageSync(TOKEN_KEY, result.token)
  uni.setStorageSync('sxb-login', { ...result.user, loggedAt: Date.now() })
}
export async function refreshRights() {
  if (!token()) return Object.assign(account, { level: 'free', trial: false, expiresAt: '', examId: selectedExamId() })
  const examId = selectedExamId()
  const requestToken = token()
  const next = await api(`/rights/${examId}`)
  if (examId !== selectedExamId() || requestToken !== token()) return account
  Object.assign(account, next)
  uni.setStorageSync('sxb-demo-rights', next.level === 'svip' ? 'flagship' : next.level === 'vip' ? 'pro' : 'none')
  return account
}
export const showApiError = (error: unknown) => uni.showToast({ title: error instanceof Error ? error.message : '操作失败，请重试', icon: 'none', duration: 3500 })
export const writeRecord = (kind: string, sourceId: string, payload: any) => api(`/records/${selectedExamId()}`, 'PUT', { kind, sourceId, payload })
export const deleteRecord = (kind: string, sourceId: string) => api(`/records/${selectedExamId()}/${kind}/${encodeURIComponent(sourceId)}`, 'DELETE')

export async function refreshPersonalData() {
  if (!token()) return
  const examId = selectedExamId()
  const requestToken = token()
  const records = await api<any[]>(`/records/${examId}`)
  if (examId !== selectedExamId() || requestToken !== token()) return
  uni.setStorageSync('sxb-note-records', records.filter(r => r.kind === 'note').map(r => r.payload))
  const favorites = records.filter(r => r.kind === 'favorite').map(r => r.payload)
  uni.setStorageSync('sxb-favorite-records', favorites)
  uni.setStorageSync('sxb-favorite-items', favorites.map(r => r.id))
  const plan = records.find(r => r.kind === 'plan')
  if (plan) uni.setStorageSync(`sxb-practice-plan-${examId}`, plan.payload)
  uni.setStorageSync('sxb-completed-courses', records.filter(r => r.kind === 'courseProgress' && r.payload.completed).map(r => r.source_id))
  for(const course of courseCatalog) {
    const progress=records.find(r=>r.kind==='courseProgress'&&r.source_id===course.id)?.payload
    course.progress=progress?.completed?100:Math.max(0,Math.min(100,Number(progress?.progress)||0))
    course.currentMinute=Number(progress?.currentMinute)||0
  }
  const stats = await api(`/stats/${examId}`)
  if (examId !== selectedExamId() || requestToken !== token()) return
  uni.setStorageSync(`sxb-answered-${examId}`, Object.fromEntries(stats.latest.map((r: any) => [r.question_id, r.correct ? 'correct' : 'wrong'])))
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  uni.setStorageSync(`sxb-today-questions-${examId}-${today}`, stats.todayIds || [])
  uni.setStorageSync('sxb-wrong-questions', stats.latest.filter((r: any) => !r.correct&&!r.wrong_hidden).map((r: any) => r.question_id))
  const answered=new Map<string,boolean>(stats.latest.map((r:any)=>[r.question_id,Boolean(r.correct)]))
  for(const subject of knowledgeSubjects)for(const chapter of subject.chapters)for(const section of chapter.sections)for(const point of section.points){
    const questions=practiceQuestions.filter(q=>q.knowledgePointId===point.id)
    point.questionDone=questions.filter(q=>answered.has(q.id)).length
    point.mastery=questions.length?Math.round(questions.filter(q=>answered.get(q.id)).length/questions.length*100):0
  }
  exam.mastery=practiceQuestions.length?Math.round([...answered.values()].filter(Boolean).length/practiceQuestions.length*100):0
}
