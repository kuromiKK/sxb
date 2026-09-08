import { z } from 'zod'
import { db } from './db.ts'
import { catalog } from './content.ts'
import { id, fail } from './security.ts'
import { chinaDate, activeDates, addDays, schedule } from '../../user/src/utils/plan-schedule.ts'

export const planSchema = z.object({
  subjectIds: z.array(z.string()).max(100), chapterIds: z.array(z.string()).min(1).max(500),
  dailyTarget: z.number().int().min(0).max(10000), targetCustomized: z.boolean(),
  restWeekdays: z.array(z.number().int().min(0).max(6)).max(3),
  skipDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => !isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v)).max(365),
  round: z.enum(['coverage', 'consolidation']), includeCourses: z.boolean(), includeWrong: z.boolean(), includeNotes: z.boolean(), includeCheatSheets: z.boolean(),
  total: z.number().int().min(0).optional(), questionIds: z.array(z.string()).max(20000).optional(),
}).strict()

export async function planContext(examId: string) {
  const exam = (await db.query('SELECT id,name FROM exams WHERE id=$1 AND enabled',[examId])).rows[0]
  if (!exam) fail(404,'考试不存在')
  const cycle = (await db.query('SELECT * FROM exam_cycles WHERE exam_id=$1 AND ends_at>now() ORDER BY ends_at LIMIT 1',[examId])).rows[0]
  const config = (await db.query('SELECT prep_days AS "prepDays",sprint_days AS "sprintDays",default_rest_days AS "defaultRestDays",default_round AS "defaultRound" FROM exam_plan_configs WHERE exam_id=$1',[examId])).rows[0] || {prepDays:90,sprintDays:14,defaultRestDays:1,defaultRound:'coverage'}
  return {exam, cycle, config, content: await catalog(examId)}
}

export async function saveLearningPlan(userId: string, examId: string, input: unknown) {
  const b = planSchema.parse(input)
  const ctx = await planContext(examId)
  const subjects = ctx.content.knowledgeSubjects
  const chapters = subjects.flatMap(s => s.chapters.map((c:any) => ({id:c.id, subjectId:s.id})))
  if (b.subjectIds.some(s => !subjects.some(row => row.id === s)) || b.chapterIds.some(c => !chapters.some(row => row.id === c))) fail(400,'请选择当前考试已发布的科目和章')
  const subjectIds = [...new Set(chapters.filter((c:any) => b.chapterIds.includes(c.id)).map((c:any) => c.subjectId))]
  if (subjectIds.some(s => !b.subjectIds.includes(s))) fail(400,'所选章与科目不一致')
  const questionIds = ctx.content.practiceQuestions.filter(q => b.chapterIds.includes(q.chapterId) && q.type !== 'subjective').map(q => q.id)
  if (b.questionIds && (b.questionIds.length !== questionIds.length || new Set(b.questionIds).size !== questionIds.length || b.questionIds.some(q => !questionIds.includes(q)))) fail(400,'题库已变化，请刷新计划范围后重试')
  const payload = {...b, subjectIds, chapterIds:[...new Set(b.chapterIds)], restWeekdays:[...new Set(b.restWeekdays)], total:questionIds.length,questionIds,examId,target:b.dailyTarget,updatedAt:Date.now()}
  await db.query(`INSERT INTO user_records(id,user_id,exam_id,kind,source_id,payload) VALUES($1,$2,$3,'plan','current',$4) ON CONFLICT(user_id,exam_id,kind,source_id) DO UPDATE SET payload=$4,updated_at=now()`,[id(),userId,examId,JSON.stringify(payload)])
  return getLearningPlan(userId,examId)
}

export async function getLearningPlan(userId: string, examId: string) {
  const {exam,cycle,config,content} = await planContext(examId)
  const today = chinaDate()
  const end = cycle ? chinaDate(cycle.ends_at) : today
  const daysLeft = cycle ? Math.max(1,Math.round((Date.parse(end)-Date.parse(today))/86400000)+1) : 0
  const saved = (await db.query("SELECT payload FROM user_records WHERE user_id=$1 AND exam_id=$2 AND kind='plan' AND source_id='current'",[userId,examId])).rows[0]?.payload
  const allChapters = content.knowledgeSubjects.flatMap(s => s.chapters.map((c:any) => c.id))
  const chapterIds = (saved?.chapterIds || allChapters).filter((c:string) => allChapters.includes(c))
  const questions = content.practiceQuestions.filter(q => chapterIds.includes(q.chapterId) && q.type !== 'subjective')
  const questionIds = questions.map(q => q.id)
  const scope = new Set(questionIds)
  const restWeekdays = saved?.restWeekdays || [0,6,5].slice(0,config.defaultRestDays)
  const skipDates = saved?.skipDates || []
  const events = (await db.query('SELECT question_id,correct,created_at FROM answers WHERE user_id=$1 AND exam_id=$2 ORDER BY created_at,id',[userId,examId])).rows.filter(a => scope.has(a.question_id))
  // Reconstruct completed passes from immutable answer history, without erasing prior progress.
  let roundNumber = 1
  let done = new Set<string>()
  let todayIds = new Set<string>()
  const latest = new Map<string,any>()
  const streaks = new Map<string,number>()
  for (const event of events) {
    if (scope.size && done.size === scope.size) { roundNumber++; done = new Set(); todayIds = new Set() }
    done.add(event.question_id)
    if (chinaDate(event.created_at) === today) todayIds.add(event.question_id)
    latest.set(event.question_id,event)
    streaks.set(event.question_id,event.correct ? (streaks.get(event.question_id)||0)+1 : 0)
  }
  if (scope.size && done.size === scope.size) { roundNumber++; done = new Set(); todayIds = new Set() }
  const round = roundNumber > 1 || (saved?.round || config.defaultRound) === 'consolidation' ? 'consolidation' : 'coverage'
  const intervals = [1,3,7,14,30]
  const priority = (q:any) => {
    const last = latest.get(q.id)
    if (!last) return -3
    if (!last.correct) return -2
    const due = addDays(chinaDate(last.created_at),intervals[Math.max(0,Math.min((streaks.get(q.id)||0)-1,4))])
    return due <= today ? -1 : 0
  }
  const queue = questions.filter(q => !done.has(q.id)).sort((a,b) => round === 'consolidation' ? priority(a)-priority(b) || String(latest.get(a.id)?.created_at||'').localeCompare(String(latest.get(b.id)?.created_at||'')) : 0).map(q => q.id)
  const remaining = queue.length
  const dates = cycle ? activeDates(today,end,restWeekdays,skipDates) : []
  const autoDaily = dates.length ? Math.ceil((remaining+(dates.includes(today)?todayIds.size:0))/dates.length) : 0
  const targetCustomized = saved?.targetCustomized === true
  const dailyTarget = targetCustomized ? Number(saved.dailyTarget ?? saved.target ?? 0) : autoDaily
  const allocations = schedule(remaining,todayIds.size,dates,today,targetCustomized ? dailyTarget : null)
  const counts = new Map(allocations.map(a => [a.date,a.count]))
  const stage = daysLeft <= config.sprintDays ? '冲刺阶段' : daysLeft <= config.prepDays ? '备考阶段' : '规划阶段'
  const plan = {examId,subjectIds:content.knowledgeSubjects.filter(s=>s.chapters.some((c:any)=>chapterIds.includes(c.id))).map(s=>s.id),chapterIds,restWeekdays,skipDates,round,includeCourses:saved?.includeCourses!==false,includeWrong:saved?.includeWrong!==false,includeNotes:saved?.includeNotes!==false,includeCheatSheets:saved?.includeCheatSheets!==false,questionIds,total:questionIds.length,target:dailyTarget,dailyTarget,targetCustomized,minTarget:autoDaily,years:[],sources:['chapter'],updatedAt:saved?.updatedAt||0}
  const reminders: Array<{title:string;url:string;requiredPermission?:string}> = []
  const isRest = !dates.includes(today)
  if (!isRest) {
    const nextQuestion = questions.find(q => q.id === queue[0])
    const wrongQuestion=questions.find(q=>latest.get(q.id)&&!latest.get(q.id).correct)
    const course = content.courseCatalog.find(c => c.sectionId === (wrongQuestion||nextQuestion)?.sectionId && !c.knowledgePointId)
    const marked=wrongQuestion&&(await db.query("SELECT id FROM content WHERE id=$1 AND kind='knowledge' AND status='published' AND payload->>'isKnowledgeCourse'='true'",[wrongQuestion.knowledgePointId])).rows[0]
    if(plan.includeCourses&&marked)reminders.push({title:'复习错题关联知识点课程',url:`/pages/knowledge-detail/index?id=${marked.id}`})
    else if (plan.includeCourses && course) reminders.push({title:'复习本节精讲课',url:`/pages/course-detail/index?id=${course.id}`,requiredPermission:'courses'})
    if (plan.includeWrong && events.some(e=>latest.get(e.question_id)===e&&!e.correct)) reminders.push({title:'回顾所选章节的错题',url:'/pages/practice-tools/index?mode=wrong'})
    const notes = (await db.query("SELECT source_id FROM user_records WHERE user_id=$1 AND exam_id=$2 AND kind='note' LIMIT 1",[userId,examId])).rows
    if (plan.includeNotes && notes.length) reminders.push({title:'回顾我的学习笔记',url:'/pages/practice-tools/index?mode=note'})
    // A reminder is only emitted when actual published exam material exists.
    const sheet = (await db.query("SELECT id FROM content WHERE kind='cheatsheet' AND exam_id=$1 AND status='published' AND (payload->>'opensAt')::timestamptz<=now() AND (payload->>'closesAt')::timestamptz>now() LIMIT 1",[examId])).rows[0]
    if (plan.includeCheatSheets && sheet) reminders.push({title:'考前小抄复习',url:'/pages/cheatsheets/index'})
  }
  return {exam,config,plan,questionIds:queue,progress:{completed:done.size,remaining,roundNumber,round,todayDone:todayIds.size,todayRemaining:counts.get(today)||0,todayTarget:isRest?0:Math.min(remaining+todayIds.size,dailyTarget),daysLeft,activeDays:dates.length,autoDaily,stage,isRest,unscheduled:remaining-allocations.reduce((s,d)=>s+d.count,0)},preview:Array.from({length:Math.min(7,daysLeft)},(_,i)=>{const date=addDays(today,i);return {date,count:counts.get(date)||0,rest:!dates.includes(date)}}),reminders}
}
