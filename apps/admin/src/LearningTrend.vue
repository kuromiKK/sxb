<script setup lang="ts">
import { computed,ref } from 'vue'
const props=defineProps<{title:string;subtitle:string;series:any[];countKey:string;peopleKey:string;tone?:string}>()
const metric=ref('count'),table=ref(false)
const values=computed(()=>props.series.map(s=>Number(s[metric.value==='count'?props.countKey:props.peopleKey])||0))
const max=computed(()=>Math.max(2,Math.ceil(Math.max(0,...values.value)/2)*2))
const points=computed(()=>values.value.map((v,i)=>({x:44+(values.value.length>1?i/(values.value.length-1)*610:305),y:190-v/max.value*144,value:v,day:props.series[i].day})))
const line=computed(()=>points.value.map(p=>`${p.x},${p.y}`).join(' '))
const labels=computed(()=>points.value.filter((_,i)=>i===0||i===points.value.length-1||i%Math.max(1,Math.ceil(points.value.length/5))===0))
</script>
<template>
 <section class="learning-trend" :style="{'--trend-color':tone||'var(--el-color-primary)'}">
  <header><div><h3>{{title}}</h3><p>{{subtitle}}</p></div><el-radio-group v-model="metric" size="small" :aria-label="title+'统计方式'"><el-radio-button value="count">次数</el-radio-button><el-radio-button value="people">人数</el-radio-button></el-radio-group></header>
  <svg viewBox="0 0 680 228" role="img" :aria-label="title+'按日趋势，单位'+(metric==='count'?'次':'人')+'；可展开每日数据查看准确数值。'">
   <g v-for="fraction in [0,0.5,1]" :key="fraction"><line x1="44" x2="654" :y1="190-144*fraction" :y2="190-144*fraction" class="grid-line"/><text x="33" :y="194-144*fraction" text-anchor="end">{{Number((max*fraction).toFixed(1))}}</text></g>
   <polygon v-if="points.length" :points="`${points[0].x},190 ${line} ${points[points.length-1].x},190`" fill="var(--trend-color)" opacity=".07"/>
   <polyline :points="line" fill="none" stroke="var(--trend-color)" stroke-width="2.5" stroke-linejoin="round"/>
   <circle v-for="p in points" :key="p.day" :cx="p.x" :cy="p.y" :r="points.length>40?2:3.5" fill="var(--trend-color)"><title>{{p.day}}：{{p.value}}{{metric==='count'?'次':'人'}}</title></circle>
   <text v-for="p in labels" :key="p.day" :x="p.x" y="215" text-anchor="middle">{{p.day.slice(5)}}</text>
  </svg>
  <footer><span>{{metric==='count'?'每次有效访问或提交计一次':'同一用户每天只计一次；跨天人数不能直接相加'}}</span><el-button link type="primary" @click="table=!table" :aria-expanded="table">{{table?'收起每日数据':'查看每日数据'}}</el-button></footer>
  <el-table v-if="table" :data="series" max-height="280" size="small"><el-table-column prop="day" label="日期"/><el-table-column :prop="countKey" label="次数"/><el-table-column :prop="peopleKey" label="人数"/></el-table>
 </section>
</template>
<style scoped>
.learning-trend{min-width:0;padding:24px;background:var(--el-bg-color);border:1px solid var(--el-border-color-light);border-radius:14px}.learning-trend header{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.learning-trend h3{margin:0;font-size:16px;font-weight:600}.learning-trend p{margin:8px 0 0;font-size:12px;color:var(--el-text-color-regular);line-height:1.6}.learning-trend svg{width:100%;display:block;margin-top:10px}.grid-line{stroke:var(--el-border-color-lighter);stroke-dasharray:4 5}.learning-trend svg text{font-size:12px;fill:var(--el-text-color-regular)}.learning-trend footer{display:flex;align-items:center;justify-content:space-between;gap:10px;border-top:1px solid var(--el-border-color-lighter);padding-top:12px;font-size:12px;color:var(--el-text-color-regular);line-height:1.6}.learning-trend :deep(.el-radio-group){flex-shrink:0}@media(max-width:600px){.learning-trend{padding:16px}.learning-trend header,.learning-trend footer{flex-wrap:wrap}}
</style>
