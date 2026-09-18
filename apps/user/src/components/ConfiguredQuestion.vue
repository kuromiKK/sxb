<script setup lang="ts">
import ActionButton from '@/components/ui/ActionButton.vue'
import {computed, ref, onBeforeUnmount, watch, nextTick} from 'vue'
import {api,token,selectedExamId} from '@/services/api'
import {optionsFor,isAnswer,type QuestionField} from '../../../shared/question-types'
import {questionForPractice,questionEntries,missingAnswers,attemptStatus,statusLabels,hasObjectiveMistake,type Attempt} from '@/utils/practice-session'
const props=withDefaults(defineProps<{question:any;examId:string;initial?:Attempt;active?:boolean}>(),{active:true})
const emit=defineEmits<{change:[id:string,attempt:Attempt];submitted:[id:string,result:any];busy:[boolean];verdict:[id:string,wrong:boolean]}>()
const clone=<T,>(v:T):T=>JSON.parse(JSON.stringify(v))
const answers=ref<Record<string,any>>(clone(props.initial?.answers||{})),result=ref<any>(props.initial?.result),snapshot=ref<any>(props.initial?.question)
const history=ref(false),busy=ref(false),error=ref(''),missing=ref<QuestionField[]>([]),focusField=ref(''),selfScores=ref<Record<string,string>>({})
const stampImpact=ref(false)
let stampTimer:ReturnType<typeof setTimeout>|undefined
let requestId=props.initial?.requestId||'',requestData=props.initial?.requestData||'',previousDraft:Attempt|undefined,alive=true,polling=false
const auth=token(),examId=props.examId,id=props.question.id
const valid=()=>alive&&auth===token()&&examId===selectedExamId()
const question=computed(()=>questionForPractice(snapshot.value||props.question))
const entries=computed(()=>questionEntries(question.value.definition.fields))
const status=computed(()=>statusLabels[attemptStatus({answers:answers.value,result:result.value})])
const mistake=computed(()=>hasObjectiveMistake(result.value))
const stampField=computed(()=>entries.value.find(({field})=>fieldResult(field)?.status==='graded'&&fieldResult(field)?.correct===false)?.field.id)
watch(mistake,value=>{emit('verdict',id,value);if(!value)clearStamp()},{immediate:true})
function clearStamp(){stampImpact.value=false;if(stampTimer)clearTimeout(stampTimer);stampTimer=undefined}
const state=():Attempt=>clone({answers:answers.value,result:result.value,question:snapshot.value,requestId,requestData})
const publish=()=>{if(valid()&&!history.value)emit('change',id,state())}
const setBusy=(v:boolean)=>{busy.value=v;emit('busy',v)}
const fieldResult=(f:QuestionField)=>result.value?.fields?.[f.id]
const fieldValue=(f:QuestionField)=>question.value.values[f.id]
const choices=(f:QuestionField)=>optionsFor(f,question.value.values)
const letters=(v:any)=>Array.isArray(v)&&v.length?v.map((n:number)=>String.fromCharCode(65+n)).join('、'):'未作答'
function choose(f:QuestionField,n:number){
 if(result.value||busy.value)return
 const a:number[]=answers.value[f.id]||[]
 answers.value[f.id]=f.kind==='multiple'?(a.includes(n)?a.filter(x=>x!==n):[...a,n].sort((a,b)=>a-b)):[n]
 missing.value=missing.value.filter(x=>x.id!==f.id);error.value='';publish()
}
function edit(f:QuestionField,e:any){answers.value[f.id]=e.detail.value;missing.value=missing.value.filter(x=>x.id!==f.id);error.value='';publish()}
function optionState(f:QuestionField,n:number){
 const r=fieldResult(f),selected=(answers.value[f.id]||[]).includes(n)
 if(!r||!Array.isArray(r.answer))return selected?'selected':''
 return r.answer.includes(n)?selected?'correct':'missed':selected?'wrong':''
}
const optionLabel=(f:QuestionField,n:number)=>(({correct:'正确',missed:'漏选',wrong:'错选'} as Record<string,string>)[optionState(f,n)]||'')
async function locate(f:QuestionField){
 focusField.value='';await nextTick();focusField.value=f.id
 // #ifdef H5
 const el=document.getElementById('answer-field-'+f.id);el?.scrollIntoView({behavior:'smooth',block:'center'});el?.focus({preventScroll:true})
 // #endif
 // #ifndef H5
 uni.pageScrollTo({selector:'#answer-field-'+f.id,duration:200})
 // #endif
}
function applyResult(r:any){
 const impact=!hasObjectiveMistake(result.value)&&hasObjectiveMistake(r)&&!history.value&&props.active
 result.value=r;publish();emit('submitted',id,r)
 if(impact)void showMistakeStamp(result.value)
}
async function showMistakeStamp(gradedResult:any){
 clearStamp();await nextTick()
 if(!valid()||!props.active||history.value||result.value!==gradedResult||!stampField.value)return
 const reveal=()=>{if(!valid()||!props.active||history.value||result.value!==gradedResult)return;stampImpact.value=true;stampTimer=setTimeout(clearStamp,3200)}
 // Bring an off-screen explanation into view so a long question doesn't hide the feedback.
 // #ifdef H5
 const feedback=document.getElementById('feedback-field-'+stampField.value),bounds=feedback?.getBoundingClientRect()
 if(bounds&&(bounds.top<80||bounds.top>window.innerHeight-180)){
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches
  uni.pageScrollTo({scrollTop:Math.max(0,window.scrollY+bounds.top-140),duration:reduced?0:180,complete:reveal});return
 }
 reveal()
 // #endif
 // #ifndef H5
 uni.pageScrollTo({selector:'#feedback-field-'+stampField.value,duration:180,complete:reveal})
 // #endif
}
async function submit(){
 if(busy.value||result.value)return
 missing.value=missingAnswers(question.value,answers.value)
 if(missing.value.length){error.value='还有必答小题未完成，请补充后提交';await locate(missing.value[0]);return}
 const data=clone(answers.value),serialized=JSON.stringify(data)
 if(!requestId||requestData!==serialized){requestId=Date.now()+'-'+Math.random().toString(36).slice(2);requestData=serialized}
 publish();error.value='';setBusy(true)
 try{
  const configured=props.question.type==='configured'
  const r=await api(configured?'/answers/configured':'/answers','POST',configured?{examId,questionId:id,answers:data,requestId}:{examId,questionId:id,selection:data.answer,requestId})
  if(!valid())return
  snapshot.value=clone(props.question)
  applyResult(configured?r:{status:'graded',correct:r.correct,legacy:true,fields:{answer:{...r,status:'graded'}}})
 }catch(e:any){if(valid())error.value=e.message}finally{if(alive)setBusy(false)}
}
async function updateScore(f?:QuestionField){
 if(busy.value||history.value||!result.value?.submissionId)return
 let score:number|undefined
 if(f){const raw=String(selfScores.value[f.id]??'').trim();score=Number(raw);if(!raw||!Number.isFinite(score)||score<0||score>fieldResult(f).maxScore||Math.abs(score*100-Math.round(score*100))>1e-6){error.value='请输入 0 至满分之间的分数，最多两位小数';return}}
 error.value='';setBusy(true)
 try{const r=await api('/answers/submissions/'+result.value.submissionId+(f?'/self-score':'/retry'),'POST',f?{fieldId:f.id,score}:{});if(valid())applyResult(r)}catch(e:any){if(valid())error.value=e.message}finally{if(alive)setBusy(false)}
}
async function loadHistory(){
 if(busy.value)return
 error.value='';setBusy(true)
 try{const last=await api('/answers/configured/'+encodeURIComponent(id));if(!valid())return;if(!last){error.value='还没有历史作答';return}previousDraft=state();history.value=true;answers.value=last.answers;result.value=last.result;snapshot.value=last.question}
 catch(e:any){if(valid())error.value=e.message}finally{if(alive)setBusy(false)}
}
function restore(){const a=previousDraft||{answers:{}};history.value=false;answers.value=a.answers;result.value=a.result;snapshot.value=a.question;requestId=a.requestId||'';requestData=a.requestData||'';error.value=''}
function restart(){history.value=false;answers.value={};result.value=undefined;snapshot.value=undefined;requestId='';requestData='';selfScores.value={};error.value='';publish()}
const poll=setInterval(async()=>{
 if(!valid()||!props.active||busy.value||polling||history.value||!['ai_pending','ai_processing'].includes(result.value?.status))return
 polling=true;const submissionId=result.value.submissionId
 try{const last=await api('/answers/configured/'+encodeURIComponent(id));if(valid()&&!history.value&&last?.result?.submissionId===submissionId&&result.value?.submissionId===submissionId)applyResult(last.result)}catch{ /* Keep the submitted answer; next visible poll retries. */ }finally{polling=false}
},4000)
watch(()=>props.active,()=>{if(!props.active){focusField.value='';clearStamp()}})
onBeforeUnmount(()=>{alive=false;clearInterval(poll);clearStamp();emit('busy',false)})
</script>

<template>
 <view class="question-reader">
  <view v-if="history" class="history-banner"><text>上次作答 · 不计入本轮进度</text><ActionButton @tap="restore">返回本次作答</ActionButton></view>
  <view v-if="error" class="error-summary" role="alert"><text>{{error}}</text><ActionButton v-for="f in missing" :key="f.id" @tap="locate(f)">{{f.label}} · 去作答</ActionButton></view>
  <view v-for="entry in entries" :id="'answer-field-'+entry.field.id" :key="entry.field.id" class="answer-field" :class="[entry.field.kind,{'has-error':missing.some(f=>f.id===entry.field.id)}]" tabindex="-1">
   <view v-if="props.question.type==='configured'" class="field-heading"><text>{{entry.field.label}}</text><text v-if="isAnswer(entry.field)">{{entry.field.maxScore}} 分</text></view>
   <text v-if="entry.field.help" class="field-help">{{entry.field.help}}</text>
   <template v-if="entry.field.kind==='material'"><text class="material-text" selectable>{{fieldValue(entry.field)}}</text></template>
   <template v-else-if="entry.field.kind==='options'"><text v-for="(option,n) in fieldValue(entry.field)" :key="n" class="shared-option">{{String.fromCharCode(65+Number(n))}}. {{option}}</text></template>
   <template v-else-if="isAnswer(entry.field)">
    <text class="question-prompt" selectable>{{fieldValue(entry.field)?.prompt}}</text>
    <text class="answer-rule">{{entry.field.kind==='multiple'?'可选择多个答案':entry.field.kind==='text'?'请写下你的分析与思路':'请选择一个答案'}}{{!entry.field.answerRequired?' · 选答':''}}<template v-if="entry.field.kind==='multiple'&&entry.field.scoring==='partial'"> · 漏选每项 {{entry.field.partialScore}} 分，错选不得分</template></text>
    <textarea v-if="entry.field.kind==='text'" class="text-answer" :value="answers[entry.field.id]||''" :disabled="!!result||busy" :focus="focusField===entry.field.id" :aria-label="entry.field.label" :maxlength="20000" auto-height placeholder="在这里输入你的答案…" @input="edit(entry.field,$event)"/>
    <view v-else class="answer-options"><ActionButton v-for="(option,n) in choices(entry.field)" :key="n" class="answer-option" :class="[optionState(entry.field,n),{multiple:entry.field.kind==='multiple'}]" :disabled="!!result||busy" :aria-pressed="(answers[entry.field.id]||[]).includes(n)" @tap="choose(entry.field,n)"><text class="option-letter">{{String.fromCharCode(65+n)}}</text><text class="option-copy">{{option}}</text><text v-if="optionLabel(entry.field,n)" class="option-state">{{optionLabel(entry.field,n)}}</text></ActionButton></view>
    <text v-if="missing.some(f=>f.id===entry.field.id)" class="field-error">请完成这一题</text>
    <view v-if="fieldResult(entry.field)" :id="'feedback-field-'+entry.field.id" class="field-feedback">
     <view v-if="stampImpact&&entry.field.id===stampField" class="mistake-impact" aria-hidden="true"><view class="error-stamp impact-stamp"><text>答错</text></view></view>
     <view class="feedback-heading"><text>{{fieldResult(entry.field).method==='self'?'对照要点自评':fieldResult(entry.field).method==='ai'?'AI 评分':'答案解析'}}</text><text v-if="typeof fieldResult(entry.field).score==='number'">{{fieldResult(entry.field).score}} / {{fieldResult(entry.field).maxScore}} 分</text></view>
     <text v-if="entry.field.kind!=='text'" class="feedback-copy">你的答案 {{letters(answers[entry.field.id])}}　正确答案 {{letters(fieldResult(entry.field).answer)}}</text>
     <template v-if="fieldResult(entry.field).reference"><text class="feedback-label">参考答案</text><text class="feedback-copy" selectable>{{fieldResult(entry.field).reference}}</text></template>
     <template v-if="fieldResult(entry.field).rubric"><text class="feedback-label">评分要点</text><text class="feedback-copy" selectable>{{fieldResult(entry.field).rubric}}</text></template>
     <text v-if="fieldResult(entry.field).explanation" class="feedback-copy" selectable>{{fieldResult(entry.field).explanation}}</text>
     <text v-if="fieldResult(entry.field).feedback" class="feedback-copy">{{fieldResult(entry.field).feedback}}</text>
     <text v-if="fieldResult(entry.field).error" class="field-error">{{fieldResult(entry.field).error}}</text>
     <text v-if="['ai_pending','ai_processing'].includes(fieldResult(entry.field).status)" class="feedback-copy">答案已保存，正在评分…</text>
     <view v-if="fieldResult(entry.field).method==='self'&&!history" class="self-score"><input v-model="selfScores[entry.field.id]" type="digit" :aria-label="entry.field.label+'自评分'" :placeholder="'0–'+fieldResult(entry.field).maxScore+' 分'"/><ActionButton :disabled="busy" @tap="updateScore(entry.field)">保存自评分</ActionButton></view>
    </view>
   </template>
  </view>
  <ActionButton v-if="!result" class="submit-answer" :loading="busy" :disabled="busy" @tap="submit">{{busy?'正在提交':'确认答案'}}</ActionButton>
  <view v-else class="result-summary" :class="{'result-mistake':mistake,'result-correct':status==='正确'}" aria-live="polite"><view><text>{{status==='错误'?'回答错误':status}}</text><text v-if="typeof result.score==='number'">本题 {{result.score}} / {{result.maxScore}} 分</text></view><ActionButton v-if="!history&&result.status==='ai_failed'" :disabled="busy" @tap="updateScore()">重试评分</ActionButton><ActionButton v-else-if="!history" :disabled="busy" @tap="restart">重新练习</ActionButton></view>
  <ActionButton v-if="props.question.type==='configured'&&!result&&!history" class="history-link" :disabled="busy" @tap="loadHistory">查看上次作答</ActionButton>
 </view>
</template>

<style scoped>
.question-reader{--practice-blue:#3569e8;--practice-ink:#263953;--practice-muted:#63748a;color:var(--practice-ink)}button{margin:0;font:inherit;line-height:1.5}button:after{border:0}button:focus-visible,textarea:focus-visible,input:focus-visible{outline:2px solid var(--practice-blue);outline-offset:3px}.answer-field{margin:0 0 26px;scroll-margin-top:20px}.answer-field:focus{outline:none}.field-heading{display:flex;justify-content:space-between;gap:12px;color:var(--practice-muted);font-size:12px;font-weight:600;line-height:1.6}.question-prompt{display:block;font-size:18px;font-weight:600;line-height:1.85;white-space:pre-wrap;overflow-wrap:anywhere;margin:10px 0 12px}.field-help,.answer-rule{display:block;font-size:12px;line-height:1.7;color:var(--practice-muted);margin:6px 0 14px}.answer-options{display:flex;flex-direction:column;gap:12px}.answer-option{display:flex;align-items:center;gap:12px;text-align:left;min-height:58px;padding:14px;border:1px solid #e1e7ef;border-radius:13px;background:#fafbfd;color:var(--practice-ink);transition:background .16s,border-color .16s}.answer-option[disabled]{color:var(--practice-ink);opacity:1}.option-letter{display:flex;align-items:center;justify-content:center;flex:none;width:28px;height:28px;border:1px solid #d8e0eb;border-radius:50%;font-size:13px;font-weight:600;background:#fff;color:var(--practice-muted)}.multiple .option-letter{border-radius:8px}.option-copy{flex:1;min-width:0;font-size:16px;line-height:1.65;white-space:pre-wrap;overflow-wrap:anywhere}.option-state{font-size:11px;flex:none}.selected{background:#edf3ff;border-color:#7095ec}.selected .option-letter{background:var(--practice-blue);border-color:var(--practice-blue);color:#fff}.correct,.missed{background:#eef8f3;border-color:#70af94}.correct .option-letter{background:#288264;color:#fff;border-color:#288264}.wrong{background:#fff3f1;border-color:#d9908a}.wrong .option-letter{color:#b84842;border-color:#d9908a}.correct .option-state,.missed .option-state{color:#237355}.wrong .option-state{color:#ad413c}.text-answer{width:100%;min-height:180px;box-sizing:border-box;padding:14px;border:1px solid #dce4ef;border-radius:12px;background:#fafbfd;font-size:16px;line-height:1.8}.material,.options{background:#f3f6fa;padding:16px;border-radius:12px}.material-text,.shared-option{display:block;white-space:pre-wrap;overflow-wrap:anywhere;font-size:16px;line-height:1.85;margin-top:10px}.group{border-left:3px solid var(--practice-blue);padding-left:12px;margin-bottom:16px}.group .field-heading{font-size:16px;color:var(--practice-ink)}.field-feedback{margin-top:18px;padding:16px;background:#f3f6fb;border-radius:12px}.feedback-heading{display:flex;justify-content:space-between;gap:8px;font-size:14px;font-weight:600}.feedback-copy{display:block;margin-top:10px;font-size:15px;line-height:1.9;white-space:pre-wrap;overflow-wrap:anywhere}.feedback-label{display:block;margin-top:16px;font-size:12px;color:var(--practice-muted)}.submit-answer{background:var(--practice-blue);color:#fff;border-radius:13px;min-height:48px;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:600;box-shadow:0 6px 16px #3569e81a}.submit-answer[disabled]{opacity:.65;color:#fff}.result-summary{display:flex;align-items:center;justify-content:space-between;border-top:1px solid #e6ebf2;padding-top:16px;gap:12px;font-size:14px}.result-summary>view{display:flex;flex-direction:column;gap:4px}.result-summary>view>text+text{font-size:12px;color:var(--practice-muted)}.result-summary button,.self-score button,.history-banner button{min-height:44px;padding:10px 12px;border-radius:10px;background:#eaf1ff;color:#315ec7;font-size:13px}.history-link{background:transparent;color:var(--practice-muted);font-size:12px;min-height:44px;margin:6px auto 0}.history-banner,.error-summary{margin-bottom:20px;padding:12px;border-radius:12px;font-size:13px;line-height:1.7}.history-banner{background:#fff5df;color:#7a5a26}.history-banner button{margin-top:8px}.error-summary{background:#fff1ee;color:#a23830}.error-summary button{background:transparent;color:inherit;font-size:13px;text-align:left;min-height:44px}.field-error{display:block;color:#ac4137;font-size:13px;line-height:1.7;margin-top:8px}.has-error .text-answer{border-color:#c86a5f}.self-score{display:flex;gap:10px;margin-top:14px;align-items:center}.self-score input{flex:1;width:0;min-height:44px;box-sizing:border-box;padding:8px;background:#fff;border:1px solid #d9e1ec;border-radius:8px;font-size:16px}@media(prefers-reduced-motion:reduce){.answer-option{transition:none}}
</style>

<style scoped>
.question-reader{--practice-error:#c63743;--practice-error-soft:#fff0f0}
.answer-option.wrong,.answer-option.wrong[disabled]{background:var(--practice-error-soft);border-color:var(--practice-error);color:var(--practice-error);box-shadow:none}
.answer-option.wrong .option-copy,.answer-option.wrong .option-state{color:var(--practice-error)}
.answer-option.wrong .option-letter{background:#fff;color:var(--practice-error);border-color:var(--practice-error)}
.answer-option.correct[disabled],.answer-option.missed[disabled]{background:#eef8f3}
.answer-option.wrong .option-state{font-size:12px;font-weight:650}
.result-summary.result-mistake{padding:14px;border:1px solid #efbdc2;border-radius:12px;background:var(--practice-error-soft)}
.result-correct>view>text:first-child{color:#237355;font-weight:700}
.result-mistake>view>text:first-child{color:var(--practice-error);font-size:20px;font-weight:750}
.result-mistake button{background:var(--practice-error);color:#fff}
.field-feedback{position:relative}
.mistake-impact{position:absolute;z-index:4;right:12px;top:-18px;width:128px;height:110px;display:flex;align-items:center;justify-content:center;pointer-events:none}
.error-stamp{position:relative;display:flex;align-items:center;justify-content:center;flex:none;width:110px;height:110px;border:4px solid var(--practice-error);border-radius:50%;color:var(--practice-error);background:#fff4efed;box-sizing:border-box;transform:rotate(-13deg);box-shadow:0 5px 12px #99253624}
.error-stamp:after{content:'';position:absolute;inset:4px;border:1px solid var(--practice-error);border-radius:50%;pointer-events:none}
.error-stamp>text{font-size:32px;line-height:1;font-weight:900;letter-spacing:2px;text-shadow:1px 0 currentColor}
.impact-stamp{animation:mistake-stamp 3.2s both;transform-origin:50% 50%}
@keyframes mistake-stamp{0%{opacity:0;transform:translateY(-48px) rotate(-24deg) scale(1.7)}7%{opacity:1;transform:translateY(3px) rotate(-13deg) scale(.94)}11%{transform:translateY(-2px) rotate(-13deg) scale(1.04)}16%,86%{opacity:1;transform:translateY(0) rotate(-13deg) scale(1)}100%{opacity:0;transform:rotate(-13deg) scale(1)}}
@media(max-width:350px){.mistake-impact{right:4px;width:112px;height:96px}.error-stamp{width:96px;height:96px}.error-stamp>text{font-size:28px}}
@media(prefers-reduced-motion:reduce){.impact-stamp{animation:none;transform:rotate(-13deg)}}
</style>
