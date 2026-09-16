<script setup lang="ts">
import { type QuestionField, optionsFor } from '../../shared/question-types'
import { Plus, Trash2 } from 'lucide-vue-next'
defineProps<{fields:QuestionField[];values:Record<string,any>}>()
function updateOptions(values:any,id:string,index:number){values[id].options.splice(index,1);values[id].answer=values[id].answer.filter((n:number)=>n!==index).map((n:number)=>n>index?n-1:n)}
</script>
<template>
  <section v-for="f in fields" :key="f.id" class="qf-field">
    <template v-if="f.kind==='group'"><h3 class="qf-group">{{ f.label }}</h3><p v-if="f.help" class="qf-help">{{ f.help }}</p><QuestionFields :fields="f.children" :values="values"/></template>
    <template v-else-if="f.kind==='material'"><el-form-item :label="f.label" :required="f.required"><el-input v-model="values[f.id]" type="textarea" :rows="4" :placeholder="f.help||'填写公共材料'"/></el-form-item></template>
    <template v-else-if="f.kind==='options'"><el-form-item :label="f.label" :required="f.required"><el-input :model-value="(values[f.id]||[]).join('\n')" @update:model-value="values[f.id]=$event.split('\n')" type="textarea" :rows="4" placeholder="每行一个共用选项"/></el-form-item></template>
    <template v-else-if="values[f.id]">
      <el-form-item :label="f.label+' · 题干'" :required="f.required"><el-input v-model="values[f.id].prompt" type="textarea" :rows="3" :placeholder="f.help||'填写题目内容'"/></el-form-item>
      <template v-if="f.kind!=='text'">
        <div class="qf-label">选项与正确答案 <span>点击左侧选择正确答案</span></div>
        <div v-for="(option,i) in optionsFor(f,values)" :key="i" class="qf-option">
          <el-checkbox v-if="f.kind==='multiple'" :model-value="values[f.id].answer.includes(i)" :aria-label="f.label+'正确答案'+String.fromCharCode(65+i)" @change="values[f.id].answer=$event?[...values[f.id].answer,i]:values[f.id].answer.filter((n:number)=>n!==i)"/>
          <el-radio v-else :model-value="values[f.id].answer[0]" :value="i" :aria-label="f.label+'正确答案'+String.fromCharCode(65+i)" @change="values[f.id].answer=[i]"/>
          <b>{{String.fromCharCode(65+i)}}</b><span v-if="f.optionsSource||f.kind==='boolean'">{{ option||'共用选项未填写' }}</span><el-input v-else v-model="values[f.id].options[i]" :aria-label="f.label+'选项'+String.fromCharCode(65+i)" placeholder="选项内容"/>
          <el-button v-if="!f.optionsSource&&f.kind!=='boolean'" link type="danger" :disabled="values[f.id].options.length<=f.minOptions" aria-label="删除选项" @click="updateOptions(values,f.id,i)"><Trash2 :size="15"/></el-button>
        </div>
        <el-button v-if="!f.optionsSource&&f.kind!=='boolean'" class="qf-add" :disabled="values[f.id].options.length>=f.maxOptions" @click="values[f.id].options.push('')"><Plus :size="15"/>添加选项</el-button>
      </template>
      <template v-else><p class="qf-help">{{f.aiGrading?'AI 判分 · 参考答案与评分要点为必填':'自评练习 · 提交后展示参考答案供学生核对'}}</p><el-form-item label="参考答案" :required="f.aiGrading===true"><el-input v-model="values[f.id].reference" type="textarea" :rows="3"/></el-form-item><el-form-item label="评分要点" :required="f.aiGrading===true"><el-input v-model="values[f.id].rubric" type="textarea" :rows="3" placeholder="列明给分点、部分得分及扣分规则"/></el-form-item></template>
      <el-form-item label="答案解析"><el-input v-model="values[f.id].explanation" type="textarea" :rows="2"/></el-form-item>
    </template>
  </section>
</template>
<style scoped>
.qf-field{min-width:0;margin-bottom:24px}.qf-field+.qf-field{padding-top:20px;border-top:1px solid var(--line)}.qf-group{font-size:16px;margin:0 0 16px;padding-left:12px;border-left:3px solid var(--primary)}.qf-help{color:var(--muted);margin-bottom:12px}.qf-label{font-weight:500;margin-bottom:10px}.qf-label span{font-size:12px;color:var(--muted);margin-left:8px}.qf-option{display:flex;align-items:center;gap:10px;margin:8px 0}.qf-option :deep(.el-radio){margin:0}.qf-option :deep(.el-radio__label){padding:0}.qf-option b{font-weight:500;color:var(--muted)}.qf-add{margin:4px 0 20px}
</style>
