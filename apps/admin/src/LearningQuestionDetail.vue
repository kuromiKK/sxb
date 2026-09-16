<script setup lang="ts">
import {computed} from 'vue'
import {flattenFields,optionsFor} from '../../shared/question-types'
const props=defineProps<{question:any;selection?:any;result?:any;showAnswer?:boolean}>()
const fields=computed(()=>flattenFields(props.question?.definition?.fields||[]))
const letters=(a:any)=>Array.isArray(a)?a.map((i:number)=>String.fromCharCode(65+i)).join('、')||'未作答':'未作答'
const names:Record<string,string>={single:'单选',multiple:'多选',boolean:'判断',text:'主观题',material:'公共材料',options:'共用选项',group:'小题组'}
</script>
<template>
 <div class="learning-question" v-if="question">
  <p class="question-stem">{{question.stem||question.title}}</p>
  <template v-if="question.type==='configured'">
   <section v-for="f in fields" :key="f.id" class="question-field">
    <div class="field-caption">{{f.label}}<span>{{names[f.kind]}}</span></div>
    <p v-if="f.kind==='material'">{{question.values?.[f.id]}}</p>
    <template v-else-if="f.kind==='options'"><p v-for="(v,i) in question.values?.[f.id]" :key="i">{{String.fromCharCode(65+Number(i))}}. {{v}}</p></template>
    <template v-else-if="f.kind!=='group'">
     <p>{{question.values?.[f.id]?.prompt||f.defaultValue}}</p>
     <div v-for="(option,i) in optionsFor(f,question.values||{})" :key="i" class="answer-option" :class="{chosen:showAnswer&&Array.isArray(selection?.[f.id])&&selection[f.id].includes(i)}"><b>{{String.fromCharCode(65+i)}}</b><span>{{option}}</span><small v-if="showAnswer&&Array.isArray(selection?.[f.id])&&selection[f.id].includes(i)">用户选择</small></div>
     <div v-if="showAnswer" class="student-answer"><strong>用户作答</strong><p>{{f.kind==='text'?(selection?.[f.id]||'未作答'):letters(selection?.[f.id])}}</p></div>
     <div class="reference-answer"><strong>{{f.kind==='text'?'参考答案':'正确答案'}}</strong><p>{{f.kind==='text'?(question.values?.[f.id]?.reference||'未提供'):letters(question.values?.[f.id]?.answer)}}</p></div>
     <p v-if="question.values?.[f.id]?.rubric"><strong>评分要点：</strong>{{question.values[f.id].rubric}}</p>
     <p v-if="question.values?.[f.id]?.explanation"><strong>解析：</strong>{{question.values[f.id].explanation}}</p>
     <div v-if="showAnswer&&result?.fields?.[f.id]" class="field-score"><strong>{{result.fields[f.id].method==='self'?'用户自评':result.fields[f.id].method==='ai'?'AI 判分':'客观判分'}}：{{result.fields[f.id].score??'待判分'}} / {{result.fields[f.id].maxScore??f.maxScore}}分</strong><p v-if="result.fields[f.id].feedback">{{result.fields[f.id].feedback}}</p><p v-if="result.fields[f.id].error">{{result.fields[f.id].error}}</p></div>
    </template>
   </section>
  </template>
  <template v-else>
   <div v-for="(option,i) in question.options||[]" :key="i" class="answer-option" :class="{chosen:showAnswer&&Array.isArray(selection)&&selection.includes(i)}"><b>{{String.fromCharCode(65+Number(i))}}</b><span>{{option}}</span><small v-if="showAnswer&&Array.isArray(selection)&&selection.includes(i)">用户选择</small></div>
   <div v-if="showAnswer" class="student-answer"><strong>用户作答</strong><p>{{letters(selection)}}</p></div>
   <div class="reference-answer"><strong>参考答案</strong><p>{{question.type==='subjective'?question.referenceAnswer||'未提供':letters(result?.answer??question.answer)}}</p></div>
   <p v-if="result?.explanation||question.explanation"><strong>解析：</strong>{{result?.explanation||question.explanation}}</p>
  </template>
 </div>
</template>
<style scoped>
.learning-question{font-size:14px;line-height:1.9;overflow-wrap:anywhere}.learning-question p{white-space:pre-wrap;margin:10px 0}.question-stem{font-weight:600}.question-field{padding:20px 0;border-bottom:1px solid var(--el-border-color-light)}.field-caption{font-weight:600;display:flex;align-items:center;gap:10px}.field-caption span{font-size:12px;font-weight:400;color:var(--el-text-color-regular);background:var(--el-fill-color-light);padding:2px 8px;border-radius:5px}.answer-option{display:flex;gap:12px;padding:10px 14px;border:1px solid var(--el-border-color-light);border-radius:8px;margin-top:8px}.answer-option b{flex:none}.answer-option span{flex:1}.answer-option small{font-size:12px;flex:none;color:var(--el-color-primary)}.answer-option.chosen{background:var(--el-color-primary-light-9);border-color:var(--el-color-primary-light-5)}.student-answer,.reference-answer,.field-score{padding:14px 16px;margin-top:16px;border-radius:8px;background:var(--el-fill-color-light)}.student-answer{border-left:3px solid var(--el-color-primary)}.reference-answer{border-left:3px solid var(--el-color-success)}.student-answer strong,.reference-answer strong{font-size:12px;color:var(--el-text-color-regular)}
</style>
