<script setup lang="ts">
import { type QuestionField, optionsFor } from '../../shared/question-types'
defineProps<{fields:QuestionField[];values:Record<string,any>;answers:Record<string,any>}>()
function select(f:QuestionField,i:number,answers:any){answers[f.id]=f.kind==='multiple'?(answers[f.id]||[]).includes(i)?answers[f.id].filter((n:number)=>n!==i):[...(answers[f.id]||[]),i]:[i]}
</script>
<template><div class="qp-fields"><section v-for="f in fields" :key="f.id" class="qp-field">
  <template v-if="f.kind==='group'"><h3>{{f.label}}</h3><QuestionPreview :fields="f.children" :values="values" :answers="answers"/></template>
  <template v-else-if="f.kind==='material'"><span class="qp-tag">{{f.label}}</span><p>{{values[f.id]||'这里将显示公共材料内容'}}</p></template>
  <template v-else-if="f.kind==='options'"><span class="qp-tag">{{f.label}}</span><p v-for="(v,i) in values[f.id]" :key="i">{{String.fromCharCode(65+Number(i))}}. {{v||'共用选项'}}</p></template>
  <template v-else><span class="qp-tag">{{({single:'单选',multiple:'多选',text:'主观',boolean:'判断'} as any)[f.kind]}} · {{f.maxScore}}分</span><p>{{values[f.id]?.prompt||f.defaultValue||f.label}}</p><small v-if="f.help">{{f.help}}</small><el-input v-if="f.kind==='text'" v-model="answers[f.id]" type="textarea" :rows="5" placeholder="请在此填写你的答案"/><button v-for="(v,i) in f.kind==='text'?[]:optionsFor(f,values)" :key="i" type="button" class="qp-option" :class="{selected:(answers[f.id]||[]).includes(i)}" :aria-pressed="(answers[f.id]||[]).includes(i)" @click="select(f,i,answers)"><b>{{String.fromCharCode(65+i)}}</b>{{v||'选项内容'}}</button></template>
</section></div></template>
<style scoped>
.qp-field{padding:20px 0;border-bottom:1px solid var(--line)}.qp-field h3{font-size:16px;margin:0}.qp-field p{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.8;margin:12px 0}.qp-field small{color:var(--muted);display:block;margin-bottom:10px}.qp-tag{font-size:12px;color:var(--primary);background:var(--el-color-primary-light-9);padding:4px 8px;border-radius:4px}.qp-option{display:flex;align-items:center;gap:12px;width:100%;text-align:left;padding:12px;margin-top:10px;background:var(--surface);color:var(--ink);border:1px solid var(--line);border-radius:8px;overflow-wrap:anywhere}.qp-option b{flex:none;display:grid;place-items:center;width:24px;height:24px;border:1px solid var(--line);border-radius:50%;font-weight:500}.qp-option.selected{border-color:var(--primary);background:var(--el-color-primary-light-9)}.qp-option.selected b{background:var(--primary);color:white;border-color:var(--primary)}
</style>
