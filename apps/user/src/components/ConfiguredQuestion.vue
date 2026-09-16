<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { flattenFields, optionsFor, type QuestionField } from '../../../shared/question-types'
import { api, showApiError } from '@/services/api'
const props=defineProps<{question:any;examId:string}>(),emit=defineEmits(['submitted','busy'])
const answers=ref<Record<string,any>>({}),result=ref<any>(null),busy=ref(false),requests=new Map<string,string>()
const savedQuestion=ref<any>(null),selfScores=ref<Record<string,string>>({}),localError=ref(''),restoring=ref(false)
const displayQuestion=computed(()=>savedQuestion.value||props.question)
const fields=computed(()=>flattenFields(displayQuestion.value.definition.fields))
const hasAI=computed(()=>fields.value.some(f=>f.kind==='text'&&f.aiGrading))
const canRetry=computed(()=>['ai_failed','ai_pending','ai_processing'].includes(result.value?.status))
const resultTitle=computed(()=>({ai_processing:'作答已保存，AI 正在判分',ai_pending:'作答已保存，等待 AI 判分',ai_failed:'作答已保存，AI 判分失败',self_review:'请对照参考答案完成自评',self_graded:'参考总分（含自评）',ai_graded:'AI 评分结果',graded:'本题得分'} as Record<string,string>)[result.value?.status]||'作答已保存')
let poll:ReturnType<typeof setTimeout>|undefined,generation=0
function applyResult(r:any){result.value=r;for(const [key,value] of Object.entries(r.fields) as any[])if(value.method==='self'&&value.score!=null)selfScores.value[key]=String(value.score)}
async function restore(){const current=++generation;restoring.value=true;try{const saved=await api('/answers/configured/'+encodeURIComponent(props.question.id));if(current!==generation)return;if(saved){savedQuestion.value=saved.question;answers.value=saved.answers;applyResult(saved.result);schedulePoll()}}catch(e){if(current===generation)localError.value='历史作答加载失败，可重新进入查看；新作答不会覆盖历史记录。'}finally{if(current===generation)restoring.value=false}}
function schedulePoll(){clearTimeout(poll);if(result.value?.status==='ai_processing')poll=setTimeout(async()=>{await restore()},3000)}
watch(()=>props.question.id,()=>{clearTimeout(poll);answers.value={};result.value=null;savedQuestion.value=null;selfScores.value={};localError.value='';void restore()},{immediate:true})
onBeforeUnmount(()=>{generation++;clearTimeout(poll)})
function again(){requests.clear();generation++;clearTimeout(poll);result.value=null;savedQuestion.value=null;answers.value={};selfScores.value={};localError.value=''}
function select(f:QuestionField,i:number){if(busy.value||result.value)return;const old=answers.value[f.id]||[];answers.value[f.id]=f.kind==='multiple'?old.includes(i)?old.filter((n:number)=>n!==i):[...old,i]:[i]}
async function submit(){if(busy.value||result.value)return;busy.value=true;emit('busy',true);const qid=props.question.id,examId=props.examId
  try{const data=JSON.parse(JSON.stringify(answers.value)),key=qid+JSON.stringify(data);if(!requests.has(key))requests.set(key,Date.now()+'-'+Math.random().toString(36).slice(2));const r=await api('/answers/configured','POST',{examId,questionId:qid,answers:data,requestId:requests.get(key)});if(props.question.id!==qid)return;applyResult(r);schedulePoll();emit('submitted',r)}catch(e){showApiError(e)}finally{busy.value=false;emit('busy',false)}
}
async function retry(){if(busy.value)return;busy.value=true;emit('busy',true);try{applyResult(await api('/answers/submissions/'+result.value.submissionId+'/retry','POST',{}));schedulePoll()}catch(e){showApiError(e)}finally{busy.value=false;emit('busy',false)}}
async function selfScore(f:QuestionField){const value=selfScores.value[f.id];if(value==null||!value.trim())return showApiError(new Error('请填写自评分，0分也需要明确填写'));const score=Number(value);if(!Number.isFinite(score)||score<0||score>f.maxScore)return showApiError(new Error(`请填写0至${f.maxScore}之间的自评分`));busy.value=true;emit('busy',true);try{applyResult(await api('/answers/submissions/'+result.value.submissionId+'/self-score','POST',{fieldId:f.id,score}))}catch(e){showApiError(e)}finally{busy.value=false;emit('busy',false)}}
</script>
<template>
<view class="cq">
  <view v-if="restoring" class="cq-notice">正在读取已保存的作答…</view>
  <view v-if="localError" class="cq-notice">{{localError}}</view>
  <view v-if="!result&&hasAI" class="cq-notice">本题含 AI 判分，提交后将依据参考答案和评分要点评分。</view>
  <view v-for="f in fields" :key="f.id" class="cq-field" :class="{'cq-group':f.kind==='group'}">
    <view class="cq-label"><text>{{f.label}}</text><text v-if="['single','multiple','boolean','text'].includes(f.kind)" class="cq-points">{{f.maxScore}}分</text></view>
    <text v-if="f.kind==='text'" class="cq-method">{{f.aiGrading?'AI 判分':'自评练习'}}</text>
    <text v-if="f.help" class="cq-help">{{f.help}}</text>
    <template v-if="f.kind==='material'"><text class="cq-text">{{displayQuestion.values[f.id]}}</text></template>
    <template v-else-if="f.kind==='options'"><text v-for="(v,i) in displayQuestion.values[f.id]" :key="i" class="cq-text">{{String.fromCharCode(65+Number(i))}}. {{v}}</text></template>
    <template v-else-if="f.kind!=='group'">
      <text class="cq-text">{{displayQuestion.values[f.id]?.prompt}}</text>
      <textarea v-if="f.kind==='text'" v-model="answers[f.id]" class="cq-answer" :disabled="busy||restoring||!!result" maxlength="100000" placeholder="请填写你的答案"/>
      <button v-for="(option,i) in f.kind==='text'?[]:optionsFor(f,displayQuestion.values)" :key="i" class="cq-option" :class="{selected:(answers[f.id]||[]).includes(i),correct:result?.fields[f.id]?.answer?.includes(i)}" :disabled="busy||restoring||!!result" @tap="select(f,i)"><text class="cq-letter">{{String.fromCharCode(65+i)}}</text><text>{{option}}</text></button>
      <view v-if="result?.fields[f.id]" class="cq-analysis">
        <template v-if="f.kind==='text'">
          <text v-if="result.fields[f.id].status==='ai_graded'" class="cq-score">AI 评分 {{result.fields[f.id].score}} / {{f.maxScore}}</text>
          <text v-else-if="result.fields[f.id].status==='self_graded'" class="cq-score">自评分 {{result.fields[f.id].score}} / {{f.maxScore}}</text>
          <text v-else-if="result.fields[f.id].status==='ai_failed'" class="cq-failed">判分失败，作答已保存</text>
          <text v-else-if="['ai_pending','ai_processing'].includes(result.fields[f.id].status)">AI 正在判分，作答已保存</text>
          <text v-else>对照答案，自行核对</text>
          <text v-if="result.fields[f.id].feedback">{{result.fields[f.id].feedback}}</text>
          <text v-if="result.fields[f.id].error" class="cq-failed">{{result.fields[f.id].error}}</text>
        </template>
        <text v-else>得分 {{result.fields[f.id].score}} / {{result.fields[f.id].maxScore}} · 正确答案 {{result.fields[f.id].answer.map((n:number)=>String.fromCharCode(65+n)).join('、')}}</text>
        <text v-if="result.fields[f.id].reference">参考答案：{{result.fields[f.id].reference}}</text>
        <text v-else-if="f.kind==='text'">暂无参考答案，请联系老师补充。</text>
        <text v-if="result.fields[f.id].rubric">评分要点：{{result.fields[f.id].rubric}}</text>
        <text v-if="result.fields[f.id].explanation">解析：{{result.fields[f.id].explanation}}</text>
        <view v-if="result.fields[f.id].method==='self'" class="cq-self">
          <text>我的自评分（0～{{f.maxScore}}分）</text>
          <view class="cq-self-controls"><input v-model="selfScores[f.id]" type="digit" :disabled="busy" :aria-label="f.label+'自评分'" placeholder="填写分数"/><button :disabled="busy" @tap="selfScore(f)">保存自评</button></view>
          <text class="cq-small">自评分仅供复习参考，不计入客观正确率。</text>
        </view>
      </view>
    </template>
  </view>
  <button v-if="!result" class="cq-submit" :loading="busy" :disabled="busy||restoring" @tap="submit">{{busy&&hasAI?'正在提交与判分…':'提交作答'}}</button>
  <view v-else class="cq-result"><text>{{resultTitle}}{{result.score!=null?'：'+result.score+' / '+result.maxScore:''}}</text><text v-if="result.score==null">未完成评分的部分不计为零分。</text><button v-if="canRetry" :loading="busy" :disabled="busy" @tap="retry">{{result.status==='ai_processing'?'查询 / 重试判分':'重试 AI 判分'}}</button><button class="cq-again" :disabled="busy" @tap="again">重新练习</button></view>
</view>
</template>
<style scoped>
.cq-notice{padding:14px 16px;background:#edf3ff;color:var(--cq-muted);font-size:13px;line-height:1.8;margin-bottom:16px;border-radius:8px}.cq-method{display:inline-block;color:var(--cq-primary);background:#eef4ff;padding:3px 8px;margin-top:10px;font-size:12px;border-radius:4px}.cq-self{border-top:1px solid var(--cq-border);padding-top:14px;margin-top:14px}.cq-self-controls{display:flex;gap:10px;margin-top:10px;align-items:center}.cq-self-controls input{min-width:0;flex:1;height:44px;border:1px solid var(--cq-border);border-radius:6px;background:white;padding:0 12px;font-size:15px}.cq-self-controls button,.cq-result button{font-size:14px;line-height:44px;padding:0 14px;background:var(--cq-primary);color:white;border-radius:6px;white-space:nowrap}.cq-result button{margin-top:12px}.cq-result .cq-again{background:white;color:var(--cq-primary);border:1px solid var(--cq-border)}.cq-analysis .cq-small{font-size:12px;color:var(--cq-muted)}.cq-analysis .cq-score{color:var(--cq-primary);font-size:16px;font-weight:600}.cq-analysis .cq-failed{color:#b34832}.cq-option[disabled]{color:var(--cq-text);opacity:1}

.cq{--cq-primary:#3569e8;--cq-text:#263953;--cq-muted:#64748b;--cq-border:#dde5ef;margin-top:20px}.cq-field{padding:20px 16px;margin-bottom:14px;border:1px solid var(--cq-border);border-radius:12px;background:#fff}.cq-group{padding:14px 16px;background:#edf3ff;border-color:#d7e4ff}.cq-label{display:flex;justify-content:space-between;gap:12px;font-size:14px;font-weight:600;color:var(--cq-text)}.cq-points{color:var(--cq-primary);font-size:12px;flex:none}.cq-help{display:block;font-size:12px;color:var(--cq-muted);margin-top:8px}.cq-text{display:block;font-size:16px;line-height:1.8;white-space:pre-wrap;word-break:break-word;color:var(--cq-text);margin:12px 0}.cq-option{display:flex;align-items:center;gap:12px;padding:12px;margin:10px 0 0;background:#fff;border:1px solid var(--cq-border);border-radius:8px;text-align:left;font-size:15px;line-height:1.6;color:var(--cq-text)}.cq-option::after,.cq-submit::after{display:none}.cq-option.selected{border-color:var(--cq-primary);background:#eef4ff}.cq-option.correct{border-color:#167d71;background:#eaf8f2}.cq-letter{flex:none;width:25px;height:25px;border:1px solid var(--cq-border);border-radius:50%;text-align:center;line-height:25px}.cq-answer{width:100%;box-sizing:border-box;min-height:150px;padding:14px;background:#f8fafc;border:1px solid var(--cq-border);border-radius:8px;font-size:15px;line-height:1.7;margin-top:14px}.cq-analysis{margin-top:16px;padding:14px;background:#f5f8fc;border-radius:8px}.cq-analysis text{display:block;color:var(--cq-text);font-size:14px;line-height:1.8;white-space:pre-wrap;margin-top:6px}.cq-submit{background:var(--cq-primary);color:#fff;font-size:16px;border-radius:9px;padding:4px}.cq-result{background:#edf3ff;color:var(--cq-primary);padding:16px;border-radius:10px}.cq-result text{display:block;line-height:1.7;font-size:14px}.cq-result text+text{font-size:12px;color:var(--cq-muted);margin-top:6px}
</style>
