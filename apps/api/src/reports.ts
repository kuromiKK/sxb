import { db } from './db.ts'
import { rights } from './membership.ts'
import { fail, id } from './security.ts'

export const shanghaiDay = (date = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
export async function initLearningTables() {
  await db.query(`CREATE TABLE IF NOT EXISTS learning_events (id text PRIMARY KEY,user_id text NOT NULL REFERENCES users(id),exam_id text NOT NULL REFERENCES exams(id),kind text NOT NULL,source_id text NOT NULL,minutes integer NOT NULL DEFAULT 0 CHECK(minutes BETWEEN 0 AND 240),created_at timestamptz NOT NULL DEFAULT now())`)
  await db.query(`CREATE INDEX IF NOT EXISTS events_user_date ON learning_events(user_id,exam_id,created_at)`)
  await db.query(`CREATE TABLE IF NOT EXISTS monthly_reports (user_id text NOT NULL REFERENCES users(id),exam_id text NOT NULL REFERENCES exams(id),month text NOT NULL,payload jsonb NOT NULL,generated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,exam_id,month))`)
}
export async function recordLearning(userId: string, examId: string, kind: string, sourceId: string, minutes = 0) {
  await db.query('INSERT INTO learning_events(id,user_id,exam_id,kind,source_id,minutes) VALUES($1,$2,$3,$4,$5,$6)', [id(),userId,examId,kind,sourceId,minutes])
}
export async function reportMonths(userId: string, examId: string) {
  const today = shanghaiDay(); const year = Number(today.slice(0,4)); const month = Number(today.slice(5,7))
  const member = await rights(userId,examId)
  if (!member.permissions.reports) return [month,month-1].filter(n=>n>0).map(n=>({id:`${year}-${String(n).padStart(2,'0')}`,year,month:n,status:n===month?'generating':'ready',locked:true}))
  const first = (await db.query('SELECT min(starts_at) AS joined FROM memberships WHERE user_id=$1 AND exam_id=$2',[userId,examId])).rows[0].joined
  const joined = first ? shanghaiDay(new Date(first)) : today
  const start = joined.slice(0,4) === String(year) ? Number(joined.slice(5,7)) : 1
  const reports = []
  for(let n=month;n>=start;n--) reports.push(await monthlyReport(userId,examId,`${year}-${String(n).padStart(2,'0')}`))
  return reports
}
export async function monthlyReport(userId: string, examId: string, monthId: string) {
  if (!(await rights(userId,examId)).permissions.reports) fail(403,'学习报告仅限当前考试SVIP用户')
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthId) || monthId > shanghaiDay().slice(0,7)) fail(400,'报告月份无效')
  const [year,month] = monthId.split('-').map(Number)
  const start = `${monthId}-01T00:00:00+08:00`
  const end = new Date(Date.UTC(year,month,1)-8*3600000).toISOString()
  const generating = monthId === shanghaiDay().slice(0,7)
  const saved = (await db.query('SELECT payload FROM monthly_reports WHERE user_id=$1 AND exam_id=$2 AND month=$3',[userId,examId,monthId])).rows[0]
  if(saved && !generating) return saved.payload
  const args=[userId,examId,start,end]
  const answers=(await db.query(`SELECT a.*,q.parent_id,q.payload FROM answers a JOIN content q ON q.id=a.question_id WHERE a.user_id=$1 AND a.exam_id=$2 AND a.created_at >= $3 AND a.created_at < $4 ORDER BY a.created_at`,args)).rows
  const events=(await db.query('SELECT * FROM learning_events WHERE user_id=$1 AND exam_id=$2 AND created_at >= $3 AND created_at < $4 ORDER BY created_at',args)).rows
  const days = new Date(year,month,0).getDate()
  const dailyQuestions = Array.from({length:days},()=>0)
  const studied = new Set<number>()
  for(const row of answers){const day=Number(shanghaiDay(new Date(row.created_at)).slice(8));dailyQuestions[day-1]++;studied.add(day)}
  for(const row of events) studied.add(Number(shanghaiDay(new Date(row.created_at)).slice(8)))
  let longestStreak=0,streak=0
  for(let n=1;n<=days;n++){streak=studied.has(n)?streak+1:0;longestStreak=Math.max(longestStreak,streak)}
  const distinct=(kind:string)=>new Set(events.filter(e=>e.kind===kind).map(e=>e.source_id)).size
  const accuracy=answers.length?Math.round(answers.filter(a=>a.correct).length/answers.length*100):0
  const subjects = [...new Set(answers.map(a=>a.payload.subjectName||'未分类科目'))].map(name=>{const list=answers.filter(a=>(a.payload.subjectName||'未分类科目')===name);return {name,total:list.length,correct:list.filter(a=>a.correct).length}})
  const chapters = [...new Set(answers.map(a=>a.payload.chapterName||'未分类章节'))].map(name=>{
    const list=answers.filter(a=>(a.payload.chapterName||'未分类章节')===name);const latest=new Map(list.map(a=>[a.question_id,a]));const values=[...latest.values()];const mastery=Math.round(values.filter(a=>a.correct).length/Math.max(values.length,1)*100)
    return {name,mastery,change:0,weak:mastery<60}
  })
  const metrics={studyDays:studied.size,minutes:events.reduce((sum,e)=>sum+e.minutes,0),questions:answers.length,accuracy,lessons:distinct('courseProgress'),knowledge:distinct('knowledge'),masteryGain:0,longestStreak}
  const tools=[{label:'精讲课程',value:metrics.lessons,unit:'节',note:'本月有学习记录的课程'},{label:'知识点学习',value:metrics.knowledge,unit:'个',note:'本月查看过的知识点'},{label:'学习笔记',value:distinct('note'),unit:'篇',note:'本月记录或更新'},{label:'讲义阅读',value:distinct('handoutDownload'),unit:'份',note:'下载计为阅读'},{label:'新增收藏',value:distinct('favorite'),unit:'项',note:'本月收藏过的内容'},{label:'错题记录',value:new Set(answers.filter(a=>!a.correct).map(a=>a.question_id)).size,unit:'道',note:'本月答错过的题目'}]
  const payload={id:monthId,year,month,status:generating?'generating':'ready',generatedAt:generating?undefined:new Date().toISOString(),summary:`本月学习${metrics.studyDays}天，完成${metrics.questions}次答题。`,headline:metrics.studyDays?'每一次学习，都留下了记录':'新的学习记录，从下一次开始',metrics,dailyQuestions,studiedDays:[...studied],subjects,chapters,tools,
    highlights:[`本月学习${metrics.studyDays}天，最长连续${longestStreak}天`,`完成${answers.length}次答题，正确率${accuracy}%`],
    concerns:chapters.filter(c=>c.weak).map(c=>`${c.name}正确率低于60%，可安排复习`).concat(answers.length?[]:['尚无答题记录，暂不能判断章节掌握情况']),
    nextSteps:['按自己的节奏安排学习时间','回顾做错的题目并补充笔记','查看距离考试的提醒，按需调整学习计划'],isTestData:process.env.APP_MODE!=='production'}
  if(!generating) await db.query('INSERT INTO monthly_reports(user_id,exam_id,month,payload) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[userId,examId,monthId,JSON.stringify(payload)])
  return payload
}
