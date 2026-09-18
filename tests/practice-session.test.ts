import {test} from 'node:test'
import assert from 'node:assert/strict'
import {registerHooks} from 'node:module'
import {newField} from '../apps/shared/question-types.ts'
const hooks=registerHooks({resolve(specifier,context,nextResolve){return nextResolve(specifier==='../../../shared/question-types'?'../../../shared/question-types.ts':specifier,context)}})
const {attemptStatus,practiceSummary,subjectiveSummary,missingAnswers,questionForPractice,chapterPracticeQueues,resolvePracticeChapter,chapterContinuation,hasObjectiveMistake,chapterSessionKey,readChapterRound}=await import('../apps/user/src/utils/practice-session.ts')
hooks.deregister()

test('directory and session share scoped chapter progress and legacy section migration; reset overrides legacy',()=>{
 const chapter={id:'chapter',name:'章',no:1,subjectId:'s',subjectName:'科目',sectionIds:['s1','s2'],questionIds:['q1','q2']}
 const cache=new Map<string,any>()
 for(const [id,q] of [['s1','q1'],['s2','q2']])cache.set('sxb-practice-session-user-exam-'+JSON.stringify(['normal','','',id,'']),{version:1,attempts:{[q]:{answers:{},result:{status:'graded',correct:true}}},notes:{[q]:'笔记草稿'},elapsedMs:1000,currentId:q})
 const merged=readChapterRound(chapter,'user','exam',key=>cache.get(key))
 assert.equal(practiceSummary(chapter.questionIds,merged.attempts).done,2)
 assert.equal(merged.elapsedMs,2000);assert.equal(merged.notes.q2,'笔记草稿')
 assert.equal(readChapterRound(chapter,'other-user','exam',key=>cache.get(key)),undefined)
 assert.equal(readChapterRound(chapter,'user','other-exam',key=>cache.get(key)),undefined)
 cache.set(chapterSessionKey('user','exam','chapter'),{version:1,attempts:{},notes:merged.notes})
 const reset=readChapterRound(chapter,'user','exam',key=>cache.get(key))
 assert.equal(practiceSummary(chapter.questionIds,reset.attempts).done,0);assert.equal(reset.notes.q2,'笔记草稿')
})
test('wrong-answer feedback needs a confirmed objective mistake, including mixed questions',()=>{
 assert.equal(hasObjectiveMistake(undefined),false)
 assert.equal(hasObjectiveMistake({status:'graded',correct:true}),false)
 assert.equal(hasObjectiveMistake({status:'graded',correct:false,score:1}),true)
 assert.equal(hasObjectiveMistake({status:'ai_failed',score:0}),false)
 assert.equal(hasObjectiveMistake({status:'self_graded',score:0,fields:{essay:{status:'self_graded',score:0}}}),false)
 assert.equal(hasObjectiveMistake({status:'ai_pending',correct:null,fields:{choice:{status:'graded',correct:false},essay:{status:'ai_pending'}}}),true)
})
test('subjective totals include confirmed fields only, preserving genuine zero and pending states',()=>{
 const attempts={mixed:{answers:{},result:{fields:{objective:{status:'graded',score:4,maxScore:4},essay:{method:'self',status:'self_graded',score:0,maxScore:10},ai:{method:'ai',status:'ai_graded',score:7.5,maxScore:10},waiting:{method:'ai',status:'ai_pending',score:null,maxScore:10},failed:{method:'ai',status:'ai_failed',score:null,maxScore:10}}}},history:{history:true,answers:{},result:{fields:{essay:{method:'self',status:'self_graded',score:10,maxScore:10}}}},pending:{answers:{},result:{fields:{essay:{method:'self',status:'self_review',score:null,maxScore:10}}}}}
 assert.deepEqual(subjectiveSummary(['mixed','history'],attempts),{total:4,graded:2,pending:2,score:7.5,maxScore:20})
 assert.deepEqual(subjectiveSummary(['pending'],attempts),{total:1,graded:0,pending:1,score:null,maxScore:0})
 assert.deepEqual(subjectiveSummary(['missing','history'],attempts),{total:0,graded:0,pending:0,score:null,maxScore:0})
})
test('current round excludes historical answers, partial credit is not full correctness',()=>{
 const attempts={a:{answers:{answer:[0]},result:{status:'graded',correct:false,score:1}},b:{answers:{},result:{status:'ai_failed',score:null}},c:{answers:{},result:{status:'self_graded',score:8}},d:{answers:{answer:[1]}},e:{history:true,answers:{},result:{status:'graded',correct:true}}}
 assert.equal(attemptStatus(attempts.a),'partial');assert.equal(attemptStatus(attempts.b),'failed');assert.equal(attemptStatus(attempts.c),'reviewed');assert.equal(attemptStatus(attempts.d),'draft')
 assert.deepEqual(practiceSummary(['a','b','c','d','e'],attempts),{done:3,total:5,unanswered:2,correct:0,objective:1,accuracy:0,pending:1})
})
test('required nested fields are checked, shared material and optional fields are not answers',()=>{
 const single=newField('single','one'),text=newField('text','two'),optional={...newField('multiple','optional'),answerRequired:false}
 const question={definition:{fields:[newField('material','material'),{...newField('group','group'),children:[single,text,optional]}]}}
 assert.deepEqual(missingAnswers(question,{one:[0],two:'  '}).map((f:any)=>f.id),['two'])
 assert.deepEqual(missingAnswers(question,{one:[0],two:'分析文本'}),[])
})
test('legacy questions use the same explicit answer field without revealing answer keys',()=>{
 const q=questionForPractice({id:'old',type:'multiple',stem:'请选择',options:['甲','乙'],answer:[0]})
 assert.equal(q.definition.fields[0].kind,'multiple');assert.equal(q.values.answer.prompt,'请选择');assert.equal(q.values.answer.answer,undefined)
 assert.deepEqual(missingAnswers(q,{}).map((f:any)=>f.id),['answer'])
})
test('chapter practice combines sections, skips empty chapters and never continues into another subject',()=>{
 const subjects=[{id:'s1',name:'本科目',chapters:[{id:'c1',name:'第一章',sections:[{id:'t1'},{id:'t2'}]},{id:'empty',name:'空章',sections:[]},{id:'c3',name:'第三章',sections:[{id:'t3'}]},{id:'tail',name:'末尾空章',sections:[]}]},{id:'s2',name:'另一个科目',chapters:[{id:'other',name:'另一章',sections:[{id:'other-t'}]}]}]
 const questions=[{id:'q2',chapterId:'c1',sectionId:'t2'},{id:'q1',chapterId:'c1',sectionId:'t1'},{id:'linked',chapterId:'other',linkedChapterIds:['c1','c3'],linkedSectionIds:['t2','t3']},{id:'q3',chapterId:'c3',sectionId:'t3'},{id:'other-q',chapterId:'other',sectionId:'other-t'}]
 const chapters=chapterPracticeQueues(subjects,questions)
 assert.deepEqual(chapters[0].questionIds,['q1','q2','linked'])
 assert.equal(resolvePracticeChapter(chapters,{sectionId:'t2'})?.id,'c1')
 assert.equal(resolvePracticeChapter(chapters,{chapterId:'other',subjectId:'s1'}),undefined)
 assert.equal(chapterContinuation(chapters,'c1',['c1']).next?.id,'c3')
 assert.equal(chapterContinuation(chapters,'c3',['c3']).unfinished?.id,'c1')
 assert.equal(chapterContinuation(chapters,'c3',['c3']).complete,false)
 const complete=chapterContinuation(chapters,'c3',['c1','c3'])
 assert.equal(complete.next,undefined);assert.equal(complete.complete,true)
})
