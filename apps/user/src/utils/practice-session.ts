import { newField, flattenFields, isAnswer, type QuestionField } from '../../../shared/question-types'

export type Attempt = { answers:Record<string,any>; result?:any; question?:any; requestId?:string; requestData?:string; history?:boolean }
export type PracticeStatus = 'unanswered'|'draft'|'correct'|'partial'|'wrong'|'pending'|'failed'|'self_review'|'reviewed'
export const statusLabels:Record<PracticeStatus,string>={unanswered:'未答',draft:'草稿',correct:'正确',partial:'部分得分',wrong:'错误',pending:'待评分',failed:'评分失败',self_review:'待自评',reviewed:'已评分'}
// Use confirmed objective judgments only; low subjective scores and grading errors are not wrong answers.
export function hasObjectiveMistake(result:any):boolean{
 if(!result)return false
 return (result.status==='graded'&&result.correct===false)||Object.values(result.fields||{}).some((field:any)=>field.status==='graded'&&field.correct===false)
}
export function attemptStatus(a?:Attempt):PracticeStatus{
 if(!a||a.history)return 'unanswered'
 const r=a.result
 if(!r)return Object.values(a.answers||{}).some(v=>Array.isArray(v)?v.length:typeof v==='string'&&v.trim())?'draft':'unanswered'
 if(['ai_pending','ai_processing'].includes(r.status))return 'pending'
 if(r.status==='ai_failed')return 'failed'
 if(r.status==='self_review')return 'self_review'
 if(r.status==='graded')return r.correct?'correct':Number(r.score)>0?'partial':'wrong'
 return 'reviewed'
}
export function questionForPractice(q:any){
 if(q.type==='configured')return q
 const field=newField(q.type==='multiple'?'multiple':q.type==='boolean'?'boolean':'single','answer')
 field.label=q.typeName||({single:'单选题',multiple:'多选题',boolean:'判断题'} as Record<string,string>)[q.type]||'选择题'
 return {...q,definition:{fields:[field],examRules:{}},values:{answer:{prompt:q.stem||q.title,options:q.options||[]}}}
}
export function questionEntries(fields:QuestionField[],ancestors:string[]=[]):Array<{field:QuestionField;ancestors:string[]}>{
 return fields.flatMap(field=>[{field,ancestors},...questionEntries(field.children||[],[...ancestors,field.label])])
}
export function missingAnswers(question:any,answers:Record<string,any>){
 return flattenFields(question.definition.fields).filter(f=>isAnswer(f)&&f.answerRequired&&(f.kind==='text'?!String(answers[f.id]||'').trim():!Array.isArray(answers[f.id])||!answers[f.id].length))
}
export function practiceSummary(ids:string[],attempts:Record<string,Attempt>){
 const current=ids.map(id=>attempts[id]).filter(a=>a?.result&&!a.history)
 const objective=current.filter(a=>a.result.status==='graded'&&typeof a.result.correct==='boolean')
 return {done:current.length,total:ids.length,unanswered:ids.length-current.length,correct:objective.filter(a=>a.result.correct).length,objective:objective.length,
  accuracy:objective.length?Math.round(objective.filter(a=>a.result.correct).length/objective.length*100):null,
  pending:current.filter(a=>['pending','failed','self_review'].includes(attemptStatus(a))).length}
}

export type PracticeChapter = {id:string;name:string;no:number;subjectId:string;subjectName:string;sectionIds:string[];questionIds:string[]}
export const chapterSessionKey=(userId:string,examId:string,chapterId:string)=>`sxb-practice-session-${userId}-${examId}-chapter-${chapterId}`
// The directory and answer page must agree on which answers belong to this round.
export function readChapterRound(chapter:PracticeChapter,userId:string,examId:string,read:(key:string)=>any){
 const current=read(chapterSessionKey(userId,examId,chapter.id))
 if(current?.version===1)return current
 const old=chapter.sectionIds.map(id=>read(`sxb-practice-session-${userId}-${examId}-${JSON.stringify(['normal','','',id,''])}`)).filter(s=>s?.version===1)
 return old.length?{version:1,attempts:Object.assign({},...old.map(s=>s.attempts)),versions:Object.assign({},...old.map(s=>s.versions)),notes:Object.assign({},...old.map(s=>s.notes)),elapsedMs:old.reduce((n,s)=>n+(Number(s.elapsedMs)||0),0),currentId:old.find(s=>s.currentId)?.currentId}:undefined
}
// Only server-confirmed subjective scores belong in the earned total. Pending is not zero.
export function subjectiveSummary(ids:string[],attempts:Record<string,Attempt>){
 const fields=ids.flatMap(id=>{
  const a=attempts[id]
  return a?.result&&!a.history?Object.values(a.result.fields||{}).filter((f:any)=>f.method==='self'||f.method==='ai'):[]
 }) as Array<{status:string;score:number|null;maxScore:number}>
 const graded=fields.filter(f=>['self_graded','ai_graded'].includes(f.status)&&typeof f.score==='number'&&Number.isFinite(f.score))
 const sum=(items:typeof fields,key:'score'|'maxScore')=>Math.round(items.reduce((n,f)=>n+(Number(f[key])||0),0)*100)/100
 return {total:fields.length,graded:graded.length,pending:fields.length-graded.length,score:graded.length?sum(graded,'score'):null,maxScore:sum(graded,'maxScore')}
}
export function chapterPracticeQueues(subjects:any[],questions:any[]):PracticeChapter[]{
 return subjects.flatMap(subject=>subject.chapters.map((chapter:any,index:number)=>{
  const sectionIds:string[]=chapter.sections.map((section:any)=>section.id)
  const rank=(q:any)=>Math.min(...(q.linkedSectionIds||[q.sectionId]).map((id:string)=>sectionIds.indexOf(id)).filter((n:number)=>n>=0),Infinity)
  const items=questions.filter(q=>(q.linkedChapterIds||[q.chapterId]).includes(chapter.id)).sort((a,b)=>rank(a)-rank(b))
  return {id:chapter.id,name:chapter.name,no:index+1,subjectId:subject.id,subjectName:subject.shortTitle||subject.name,sectionIds,questionIds:[...new Set(items.map(q=>q.id))]}
 }))
}
export function resolvePracticeChapter(chapters:PracticeChapter[],route:Record<string,string>){
 const scope=route.subjectId?chapters.filter(c=>c.subjectId===route.subjectId):chapters
 if(route.chapterId)return scope.find(c=>c.id===route.chapterId)
 if(route.sectionId)return scope.find(c=>c.sectionIds.includes(route.sectionId))
 if(route.questionId)return scope.find(c=>c.questionIds.includes(route.questionId))
 return scope.find(c=>c.questionIds.length)
}
export function chapterContinuation(chapters:PracticeChapter[],currentId:string,completedIds:string[]){
 const current=chapters.find(c=>c.id===currentId)
 if(!current)return {next:undefined,unfinished:undefined,complete:false}
 const scope=chapters.filter(c=>c.subjectId===current.subjectId&&c.questionIds.length)
 const index=chapters.findIndex(c=>c.id===currentId)
 return {next:chapters.slice(index+1).find(c=>c.subjectId===current.subjectId&&c.questionIds.length),
  unfinished:scope.find(c=>!completedIds.includes(c.id)),complete:scope.length>0&&scope.every(c=>completedIds.includes(c.id))}
}
