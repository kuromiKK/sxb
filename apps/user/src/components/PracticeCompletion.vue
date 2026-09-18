<script setup lang="ts">
import {computed,ref,nextTick,getCurrentInstance} from 'vue'
import ReadingSheet from '@/components/ui/ReadingSheet.vue'
import ActionButton from '@/components/ui/ActionButton.vue'
import {practiceSummary,subjectiveSummary,attemptStatus,statusLabels,type Attempt} from '@/utils/practice-session'
const props=defineProps<{ids:string[];attempts:Record<string,Attempt>;elapsed:string;chapterName:string;chapterMode:boolean;subjectComplete:boolean;hasNext:boolean;hasUnfinished:boolean;active:boolean;showData?:boolean}>()
const emit=defineEmits<{close:[];resume:[];next:[];finish:[];restart:[];leave:[];question:[index:number]}>()
const dataView=ref(!!props.showData),instance=getCurrentInstance()
const summary=computed(()=>practiceSummary(props.ids,props.attempts))
const scores=computed(()=>subjectiveSummary(props.ids,props.attempts))
const complete=computed(()=>summary.value.unanswered===0)
const title=computed(()=>!complete.value?(summary.value.done===0?'从第一题，开始吧！':summary.value.done/summary.value.total>=.7?'就差一点，继续加油！':'别着急，继续向前！'):props.chapterMode?(props.subjectComplete?'本科目，全部拿下！':'这一章，拿下了！'):'这轮练习，完成了！')
const copy=computed(()=>!complete.value?`已经完成 ${summary.value.done} 题，还差 ${summary.value.unanswered} 题`:props.subjectComplete&&props.chapterMode?'每一份坚持，都在让你离目标更近。':'又前进了一步，认真努力的你真棒！')
const primary=computed(()=>!complete.value?'继续完成':!props.chapterMode?'返回学习':props.hasNext?'继续下一章':props.hasUnfinished?'继续未完成章节':'完成本科目')
function proceed(){if(!complete.value)emit('resume');else if(!props.chapterMode)emit('leave');else if(props.hasNext||props.hasUnfinished)emit('next');else if(props.subjectComplete)emit('finish')}
async function switchView(value:boolean){
 dataView.value=value
 // Keep keyboard focus inside the same modal when its content changes.
 // #ifdef H5
 await nextTick();const heading=(instance?.proxy?.$el as HTMLElement)?.querySelector<HTMLElement>('.completion-focus');heading?.focus({preventScroll:true})
 // #endif
}
</script>

<template>
 <ReadingSheet :title="dataView?(chapterMode?'本章作答数据':'本轮作答数据'):title" appearance="celebration" :content-key="dataView?'data':'celebration'" @close="emit('close')">
  <view v-if="!dataView" class="completion-celebration" :class="{incomplete:!complete,paused:!active}">
   <view class="medal-stage" aria-hidden="true">
    <image v-if="complete" class="medal-rays" src="/static/illustrations/completion-rays.svg" mode="aspectFit"/>
    <view class="medal-halo"/>
    <image class="medal-image" :src="complete?'/static/illustrations/completion-medal.svg':'/static/illustrations/completion-unlit.svg'" mode="aspectFit"/>
    <template v-if="complete"><image v-for="n in 3" :key="n" class="medal-spark" :class="'spark-'+n" src="/static/illustrations/completion-spark.svg" mode="aspectFit"/></template>
   </view>
   <view class="celebration-message"><text class="celebration-title completion-focus" tabindex="-1">{{title}}</text><text class="celebration-copy">{{copy}}<text v-if="!complete" class="encouragement">{{chapterMode?'这一章':'这一轮'}}，等你拿下！</text></text></view>
   <view class="celebration-actions">
    <ActionButton class="completion-primary" :class="{'continue-chapter':complete&&chapterMode&&(hasNext||hasUnfinished),'finish-subject':complete&&chapterMode&&subjectComplete&&!hasNext&&!hasUnfinished}" @tap="proceed">{{primary}}<text class="button-arrow" aria-hidden="true">→</text></ActionButton>
    <view class="completion-secondary"><ActionButton class="completion-data" @tap="switchView(true)">作答数据</ActionButton><ActionButton class="completion-retry" @tap="emit('restart')">{{chapterMode?'重练本章':'重练本轮'}}</ActionButton></view>
   </view>
  </view>
  <view v-else class="completion-data-panel">
   <ActionButton class="data-back" @tap="switchView(false)"><text aria-hidden="true">←</text> 返回{{complete?'完成页':'进度页'}}</ActionButton>
   <text class="data-title completion-focus" tabindex="-1">{{chapterMode?'本章作答数据':'本轮作答数据'}}</text>
   <text class="data-chapter">{{chapterName}}</text>
   <view class="completion-stats"><view><text>{{summary.total}}</text><text>全部题目</text></view><view><text>{{summary.done}}</text><text>已完成</text></view><view><text>{{summary.accuracy===null?'—':summary.accuracy+'%'}}</text><text>客观题正确率</text></view><view><text>{{elapsed}}</text><text>专注用时</text></view></view>
   <view v-if="scores.total" class="subjective-stat"><view><text>主观题得分</text><text class="subjective-score">{{scores.score===null?'待评分':scores.score+' / '+scores.maxScore}}</text></view><text>{{scores.graded?'已评分 '+scores.graded+' 小题':'暂无已评分结果'}}{{scores.pending?' · '+scores.pending+' 小题待评分或自评':''}}</text></view>
   <view class="data-grid-heading"><text>逐题回看</text><text>点击题号查看作答</text></view>
   <view class="completion-grid"><ActionButton v-for="(id,index) in ids" :key="id" class="completion-question" :class="attemptStatus(attempts[id])" :aria-label="'第'+(index+1)+'题，'+statusLabels[attemptStatus(attempts[id])]" @tap="emit('question',index)"><text>{{index+1}}</text><text>{{statusLabels[attemptStatus(attempts[id])]}}</text></ActionButton></view>
   <text class="data-footnote">正确率仅统计已判分的客观题；待评分、自评题不计入。</text>
  </view>
 </ReadingSheet>
</template>

<style scoped>
.completion-celebration,.completion-data-panel{--award-ink:#071c38;--award-muted:#646f7b;--award-cream:#fffbef;color:var(--award-ink);box-sizing:border-box}
.completion-celebration{position:relative;overflow:hidden;min-height:590px;padding:0 24px calc(24px + env(safe-area-inset-bottom));background:linear-gradient(180deg,#fff55f 0%,#fff8a6 25%,#fffbef 61%,#fffbef 100%)}
.medal-stage{position:relative;height:316px;display:flex;align-items:center;justify-content:center;isolation:isolate;pointer-events:none}.medal-rays{position:absolute;width:640px;height:640px;left:50%;top:50%;margin:-320px 0 0 -320px;animation:award-rays 32s linear infinite}.medal-halo{position:absolute;inset:25px -20px 0;background:radial-gradient(ellipse,#fffbd3b3,transparent 68%)}.medal-image{position:relative;width:206px;height:206px;margin-top:32px;transform:rotate(-10deg);filter:drop-shadow(0 12px 12px #cf99051a)}.medal-spark{position:absolute;width:17px;height:24px;animation:award-spark 3.2s ease-in-out infinite}.spark-1{top:68px;left:73%}.spark-2{top:224px;left:29%;width:15px;height:21px;animation-delay:-1s}.spark-3{top:273px;left:19%;width:8px;height:12px;animation-delay:-2s}
.celebration-message{position:relative;text-align:center;padding:0 0 44px}.celebration-title{display:block;font-size:27px;line-height:1.4;font-weight:750;letter-spacing:.3px}.celebration-copy{display:block;font-size:14px;line-height:1.85;color:var(--award-muted);margin-top:10px;max-width:310px;margin-left:auto;margin-right:auto}.celebration-actions{position:relative}.completion-primary{display:flex;align-items:center;justify-content:center;position:relative;width:100%;min-height:56px;margin:0;padding:14px 32px;border-radius:99px;background:var(--award-ink);color:#fff;font-size:17px;font-weight:650;line-height:1.5}.button-arrow{position:absolute;right:24px;font-size:23px;font-weight:400}.completion-secondary{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px}.completion-secondary button{display:flex;align-items:center;justify-content:center;margin:0;min-height:48px;padding:10px 8px;border:1px solid #9a9a89;border-radius:99px;background:transparent;color:var(--award-ink);font-size:14px;line-height:1.5}.completion-celebration button:after,.completion-data-panel button:after{border:0}.completion-celebration button:active,.completion-data-panel button:active{opacity:.76}.completion-celebration button:focus-visible,.completion-data-panel button:focus-visible{outline:3px solid #3569e8;outline-offset:3px}.completion-focus:focus{outline:none}.incomplete{background:linear-gradient(180deg,#ece5d5 0%,#f7f1e4 35%,#fffbef 65%)}.incomplete .medal-image{transform:rotate(-7deg)}.incomplete .celebration-copy{max-width:270px}.paused .medal-rays,.paused .medal-spark{animation-play-state:paused}
.completion-data-panel{min-height:590px;background:var(--award-cream);padding:16px 24px calc(28px + env(safe-area-inset-bottom))}.data-back{display:flex;align-items:center;gap:8px;min-height:44px;max-width:200px;margin:0 0 20px;padding:0;background:none;color:var(--award-muted);font-size:13px;line-height:1.5}.data-back>text{font-size:22px}.data-title{display:block;font-size:24px;font-weight:700;line-height:1.4}.data-chapter{display:block;font-size:13px;color:var(--award-muted);line-height:1.8;margin-top:8px}.completion-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px 12px;margin:24px 0;padding:22px 16px;background:#fff;border:1px solid #eee9da;border-radius:20px}.completion-stats>view{display:flex;flex-direction:column;gap:6px;text-align:center}.completion-stats text:first-child{font-size:27px;font-weight:650;font-variant-numeric:tabular-nums;line-height:1.2}.completion-stats text+text{color:var(--award-muted);font-size:12px}.subjective-stat{padding:0 2px 20px;font-size:14px}.subjective-stat>view{display:flex;align-items:center;justify-content:space-between;gap:12px}.subjective-score{font-weight:650;font-size:20px}.subjective-stat>text{display:block;color:var(--award-muted);font-size:12px;margin-top:8px;line-height:1.7}.data-grid-heading{display:flex;justify-content:space-between;align-items:center;gap:8px;margin:0 0 14px;font-size:15px;font-weight:600}.data-grid-heading>text+text{font-size:12px;color:var(--award-muted);font-weight:400}.completion-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}.completion-question{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;min-height:60px;margin:0;padding:7px 1px;border-radius:12px;background:#ecece7;color:#586473;line-height:1.4;font-size:17px;font-weight:600}.completion-question>text+text{font-size:10px;font-weight:400}.completion-question.correct{background:#e0f2e9;color:#23674f}.completion-question.wrong{background:#ffe7e2;color:#a83c36}.completion-question.partial,.completion-question.pending,.completion-question.failed,.completion-question.self_review{background:#f8e8c7;color:#855914}.completion-question.reviewed{background:#e0edf3;color:#356477}.completion-question.draft{background:#e6eafa;color:#3a5caa}.data-footnote{display:block;margin-top:18px;color:var(--award-muted);font-size:12px;line-height:1.75}
.encouragement{display:block}.completion-celebration:focus-within .medal-rays,.completion-celebration:focus-within .medal-spark{animation-play-state:paused}
@keyframes award-rays{to{transform:rotate(360deg)}}@keyframes award-spark{0%,100%{opacity:.35;transform:scale(.7)}50%{opacity:1;transform:scale(1.12)}}
@media(max-height:740px){.completion-celebration{min-height:0}.medal-stage{height:250px}.medal-image{width:178px;height:178px;margin-top:24px}.celebration-message{padding-bottom:28px}.celebration-title{font-size:25px}.spark-1{top:40px}.spark-2{top:175px}.spark-3{top:223px}}
@media(max-width:350px){.completion-celebration,.completion-data-panel{padding-left:20px;padding-right:20px}.celebration-title{font-size:23px}.celebration-copy{font-size:13px}.completion-grid{gap:6px}.completion-question>text+text{font-size:9px}}
@media(prefers-reduced-motion:reduce){.medal-rays,.medal-spark{animation:none}}
</style>
