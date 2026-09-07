import { knowledgeSubjects, courseCatalog, practiceQuestions, examCategories, exam } from '@/mock/data'
import { examNotices } from '@/utils/examNotices'
import { api, selectedExamId } from './api'

export async function refreshCatalog() {
  const examId = selectedExamId()
  const exams = await api<any[]>('/exams')
  const data = await api(`/catalog/${examId}`)
  if (examId !== selectedExamId()) return
  knowledgeSubjects.splice(0, knowledgeSubjects.length, ...data.knowledgeSubjects)
  courseCatalog.splice(0, courseCatalog.length, ...data.courseCatalog)
  practiceQuestions.splice(0, practiceQuestions.length, ...data.practiceQuestions.filter((q: any) => q.type !== 'subjective'))
  examNotices.splice(0, examNotices.length, ...data.articles)
  const selected = exams.find(e => e.id === examId)
  if (selected) {
    const cycle = selected.cycles.find((c: any) => Date.parse(c.endsAt) > Date.now())
    const next = { ...exam, id: examId, name: selected.name, totalQuestions: data.practiceQuestions.length, totalCourses: data.courseCatalog.length,
      totalKnowledge: knowledgeSubjects.flatMap(s => s.chapters.flatMap(c => c.sections.flatMap(t => t.points))).length,
      daysLeft: cycle ? Math.max(0, Math.ceil((Date.parse(cycle.endsAt) - Date.now()) / 86400000)) : 0,
      examDate: cycle ? new Date(cycle.endsAt).toLocaleDateString('zh-CN') : '待配置', mastery: 0 }
    Object.assign(exam, next)
    uni.setStorageSync('sxb-current-exam', next)
  }
  examCategories.splice(1)
  examCategories[0].groups[0].exams=exams.map(e=>({id:e.id,name:e.name,subtitle:e.name,daysLeft:(()=>{const cycle=e.cycles.find((c:any)=>Date.parse(c.endsAt)>Date.now());return cycle?Math.max(0,Math.ceil((Date.parse(cycle.endsAt)-Date.now())/86400000)):0})()}))
  uni.setStorageSync('sxb-public-announcements', data.announcements)
  uni.setStorageSync('sxb-public-faqs', data.faqs)
}
