<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { Graph, type NodeData } from '@antv/g6'
import { ArrowLeft, ChevronRight, Crosshair, Maximize2, Minimize2, Minus, Plus, Search } from 'lucide-vue-next'
import {useGraphSettings} from './utils/graph-settings'
import type {GraphSettings} from '../../shared/workspace-tools'

const props=defineProps<{root:any;settings?:GraphSettings}>()
const {config:graphConfig,style:graphStyle}=useGraphSettings(()=>props.settings)
const emit=defineEmits<{edit:[node:any]}>()
const host=ref<HTMLElement>(),canvas=ref<HTMLElement>(),trail=ref<any[]>([]),query=ref(''),page=ref(1),fullscreen=ref(false),error=ref(''),rendering=ref(false)
const pending=ref(false)
const labels:Record<string,string>={exam:'考试项目',subject:'科目',chapter:'章',section:'节',knowledge:'知识点',course:'课程'}
const tones=computed<Record<string,string>>(()=>graphConfig.value.colors)
const children=(n:any):any[]=>n?.children||n?.chapters||n?.sections||[...(n?.courses||[]),...(n?.knowledge||[])]
const active=computed(()=>trail.value.at(-1)||props.root)
const breadcrumbs=computed(()=>[props.root,...trail.value])
const matches=computed(()=>children(active.value).filter(n=>(n.title+' '+n.id).toLowerCase().includes(query.value.trim().toLowerCase())))
const visible=computed(()=>matches.value.slice((page.value-1)*8,page.value*8))
let graph:Graph|undefined,observer:ResizeObserver|undefined,frame=0,revision=0,disposed=false
const motion=()=>!graphConfig.value.animation||window.matchMedia('(prefers-reduced-motion: reduce)').matches?false:{duration:280}
async function enter(node:any){
  if(['course','knowledge'].includes(node.type)){
    // Drawers are teleported to body and would be hidden behind a fullscreen host.
    if(document.fullscreenElement===host.value)await document.exitFullscreen()
    emit('edit',node);return
  }
  trail.value=[...trail.value,node];query.value='';page.value=1
}
function goTo(index:number){trail.value=trail.value.slice(0,index);query.value='';page.value=1}
function metadata(node:any){
  if(node.type==='knowledge')return `${node.questions||0} 道题${node.courses?.length?' · 配套课 '+node.courses.length:''}${node.hasHandout?' · 含讲义':''}`
  if(node.type==='course')return ({video:'视频课程',audio:'音频课程',article:'图文课程'} as Record<string,string>)[node.mediaType]||'课程内容'
  const list=children(node),counts=new Map<string,number>()
  for(const child of list)counts.set(child.type,(counts.get(child.type)||0)+1)
  return list.length?[...counts].map(([type,count])=>`${count} ${labels[type]||'内容'}`).join(' · '):'暂无下级内容'
}
// Native elements inside G6 HTML nodes keep labels selectable by assistive tools;
// textContent also ensures imported titles are never interpreted as HTML.
function nodeElement(node:any,root:boolean){
  const el=document.createElement(root?'div':'button')
  el.className=`kr-node ${root?'kr-node-root':'kr-node-card'}`
  el.dataset.nodeId=node.id;el.dataset.nodeType=node.type
  el.style.setProperty('--node-tone',tones.value[node.type]||tones.value.chapter)
  if(!root){el.setAttribute('type','button');el.setAttribute('aria-label',`${labels[node.type]}：${node.title}`);el.onclick=()=>void enter(node)}
  else{el.tabIndex=0;el.setAttribute('aria-label',`当前${labels[node.type]}：${node.title}`)}
  for(const [className,text] of [['kr-node-kind',labels[node.type]||'内容'],['kr-node-title',node.title],['kr-node-meta',metadata(node)]]){
    const span=document.createElement('span');span.className=className;span.textContent=text;el.append(span)
  }
  if(!root){const arrow=document.createElement('span');arrow.className='kr-node-arrow';arrow.textContent=['knowledge','course'].includes(node.type)?'查看内容 ↗':'展开目录 →';el.append(arrow)}
  const tooltip=document.createElement('span');tooltip.className='kr-node-tooltip';tooltip.textContent=node.title;tooltip.setAttribute('aria-hidden','true');el.append(tooltip)
  return el
}
async function draw(){
  pending.value=false
  if(disposed||!canvas.value)return
  if(rendering.value){revision++;return}
  rendering.value=true;error.value=''
  const start=revision
  try{
    const width=canvas.value.clientWidth,height=canvas.value.clientHeight
    if(!width||!height)return
    if(!graph)graph=new Graph({container:canvas.value,width,height,padding:44,animation:motion(),zoomRange:[0.15,1.8],behaviors:['drag-canvas','zoom-canvas'],node:{type:'html'},edge:{type:'line',style:{lineWidth:2,strokeOpacity:0.48}}})
    else graph.setSize(width,height)
    const virtualWidth=Math.max(width,1060),cx=virtualWidth/2,cy=height/2
    const rx=Math.min(440,virtualWidth/2-155),ry=Math.min(285,height/2-100)
    const nodes:NodeData[]=[{id:active.value.id,style:{x:cx,y:cy,size:[184,184],dx:-92,dy:-92,innerHTML:nodeElement(active.value,true)}}]
    visible.value.forEach((node,index)=>{
      // Two nodes sit symmetrically either side; larger sets form a balanced ring.
      const angle=visible.value.length===1?0:visible.value.length===2?index*Math.PI:-Math.PI/2+index*2*Math.PI/visible.value.length
      nodes.push({id:node.id,style:{x:cx+rx*Math.cos(angle),y:cy+ry*Math.sin(angle),size:[236,124],dx:-118,dy:-62,innerHTML:nodeElement(node,false)}})
    })
    const focused=document.activeElement as HTMLElement|null
    const focusedId=canvas.value.contains(focused)?focused?.dataset.nodeId:undefined
    graph.setOptions({animation:motion(),edge:{type:graphConfig.value.edgeType,style:{lineWidth:graphConfig.value.edgeWidth,strokeOpacity:0.65,lineDash:graphConfig.value.edgeDashed?[6,4]:[]}}})
    graph.setData({nodes,edges:visible.value.map(n=>({id:'relation-'+n.id,source:active.value.id,target:n.id,style:{stroke:tones.value[n.type]||tones.value.chapter}}))})
    await graph.render()
    if(disposed)return
    const scale=Math.min(1,(width-64)/(rx*2+236),(height-100)/(ry*2+124))
    await graph.zoomTo(scale,false)
    await graph.focusElement(active.value.id,false)
    if(focusedId&&(document.activeElement===document.body||document.activeElement===focused)){
      Array.from(canvas.value.querySelectorAll<HTMLElement>('.kr-node-card')).find(el=>el.dataset.nodeId===focusedId)?.focus({preventScroll:true})
    }
  }catch(e:any){if(!disposed)error.value=e.message||'关系图加载失败，请重试'}
  finally{rendering.value=false;if(!disposed&&revision!==start)schedule()}
}
function schedule(){pending.value=true;cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>void draw())}
async function fit(){await graph?.fitView({when:'always'},motion());if((graph?.getZoom()||1)>1){await graph?.zoomTo(1,motion());await graph?.fitCenter(motion())}}
async function zoom(ratio:number){await graph?.zoomBy(ratio,motion())}
async function toggleFullscreen(){try{if(document.fullscreenElement===host.value)await document.exitFullscreen();else await host.value?.requestFullscreen()}catch{error.value='浏览器暂不支持全屏，请使用缩放按钮调整画布'}}
function syncFullscreen(){fullscreen.value=document.fullscreenElement===host.value;schedule()}
watch(query,()=>page.value=1)
watch([active,query,page],schedule)
watch(graphConfig,schedule,{deep:true})
watch(()=>props.root,()=>{trail.value=[];query.value='';page.value=1;schedule()})
onMounted(async()=>{await nextTick();observer=new ResizeObserver(schedule);if(canvas.value)observer.observe(canvas.value);document.addEventListener('fullscreenchange',syncFullscreen);schedule()})
onUnmounted(()=>{disposed=true;cancelAnimationFrame(frame);observer?.disconnect();document.removeEventListener('fullscreenchange',syncFullscreen);graph?.destroy();graph=undefined})
</script>

<template>
  <div ref="host" class="knowledge-relation" :class="{'is-fullscreen':fullscreen}" :style="graphStyle" :data-node-style="graphConfig.nodeStyle">
    <div class="kr-toolbar">
      <div class="kr-navigation">
        <el-tooltip content="返回上一级"><el-button :disabled="!trail.length" aria-label="返回上一级" @click="goTo(trail.length-1)"><ArrowLeft :size="17"/></el-button></el-tooltip>
        <nav class="kr-breadcrumbs" aria-label="当前图谱路径"><template v-for="(node,index) in breadcrumbs" :key="node.id"><ChevronRight v-if="index" :size="14"/><button :title="node.title" :aria-current="index===breadcrumbs.length-1?'location':undefined" @click="goTo(index)">{{node.title}}</button></template></nav>
      </div>
      <el-input v-model="query" class="kr-search" placeholder="搜索当前层名称" aria-label="搜索当前层名称" clearable><template #prefix><Search :size="16"/></template></el-input>
    </div>
    <el-alert v-if="error" :title="error" type="error" :closable="false"/>
    <div class="kr-stage">
      <div class="kr-context"><strong>{{labels[active.type]}}关系</strong><span>{{children(active).length}} 个直接下级<span v-if="query"> · 匹配 {{matches.length}} 个</span></span></div>
      <div ref="canvas" class="kr-canvas" aria-label="可缩放知识关系图" :aria-busy="rendering||pending"></div>
      <div v-if="!matches.length" class="kr-empty" role="status">{{query?'没有匹配的内容，请更换关键词':'此目录暂无下级内容'}}</div>
      <div class="kr-tools" aria-label="画布工具">
        <el-tooltip content="放大"><el-button aria-label="放大关系图" @click="zoom(1.2)"><Plus :size="18"/></el-button></el-tooltip>
        <el-tooltip content="缩小"><el-button aria-label="缩小关系图" @click="zoom(1/1.2)"><Minus :size="18"/></el-button></el-tooltip>
        <el-tooltip content="居中适配"><el-button aria-label="居中适配关系图" @click="fit"><Crosshair :size="18"/></el-button></el-tooltip>
        <el-tooltip :content="fullscreen?'退出全屏':'全屏画布'"><el-button :aria-label="fullscreen?'退出全屏画布':'全屏画布'" @click="toggleFullscreen"><component :is="fullscreen?Minimize2:Maximize2" :size="18"/></el-button></el-tooltip>
      </div>
    </div>
    <div class="kr-footer"><div class="kr-legend"><span v-for="type in ['subject','chapter','section','knowledge','course']" :key="type"><i :style="{background:tones[type]}"/>{{labels[type]}}</span></div><span class="kr-help">拖动画布 · 滚轮缩放 · 点击节点查看</span><el-pagination v-if="matches.length>8" v-model:current-page="page" :total="matches.length" :page-size="8" layout="prev,pager,next" small/></div>
  </div>
</template>

<style>
.knowledge-relation{--kr-line:#e1e7f2;--kr-muted:#65748d;border:1px solid var(--kr-line);border-radius:16px;background:#fff;overflow:hidden;min-width:0;box-shadow:0 5px 24px #273d6b06}
.kr-toolbar{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:16px 20px;border-bottom:1px solid var(--kr-line)}
.kr-navigation{display:flex;align-items:center;gap:14px;min-width:0}.kr-navigation>.el-button{width:38px;padding:0;flex-shrink:0}.kr-breadcrumbs{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}.kr-breadcrumbs svg{flex-shrink:0;color:#9aa8bb}.kr-breadcrumbs button{border:0;background:transparent;color:var(--kr-muted);font-size:13px;max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;padding:6px 0}.kr-breadcrumbs button:hover{color:#315bea}.kr-breadcrumbs button[aria-current]{color:#233756;font-weight:600}.kr-search.el-input{width:240px;flex-shrink:0}
.kr-stage{position:relative;background:radial-gradient(ellipse at 50% 50%,#ecf0ff88,transparent 65%),radial-gradient(#ccd6ec85 .8px,transparent .8px),#fafbff;background-size:auto,22px 22px,auto}.kr-canvas{height:clamp(700px,calc(100vh - 280px),1000px);position:relative;overflow:hidden;cursor:grab;touch-action:none}.kr-canvas:active{cursor:grabbing}
.kr-context{position:absolute;top:24px;left:24px;z-index:2;display:flex;flex-direction:column;gap:7px;pointer-events:none}.kr-context strong{font-size:16px;color:#233756}.kr-context span{font-size:12px;color:var(--kr-muted)}
.kr-tools{position:absolute;right:20px;bottom:22px;display:flex;gap:2px;padding:5px;background:#fff;border:1px solid var(--kr-line);border-radius:12px;box-shadow:0 4px 16px #24365c0d}.kr-tools .el-button{margin:0;border:0;width:40px;height:40px;padding:0;background:transparent;color:#425775}.kr-tools .el-button:hover{background:#eef2ff;color:#315bea}
.kr-footer{min-height:60px;display:flex;align-items:center;gap:20px;flex-wrap:wrap;padding:12px 20px;border-top:1px solid var(--kr-line)}.kr-legend{display:flex;gap:18px;flex-wrap:wrap}.kr-legend>span{display:flex;align-items:center;gap:7px;font-size:12px;color:#4c607c}.kr-legend i{height:7px;width:7px;border-radius:50%}.kr-help{margin-left:auto;font-size:12px;color:var(--kr-muted)}.kr-empty{position:absolute;top:calc(50% + 125px);width:100%;text-align:center;color:var(--kr-muted);font-size:14px;pointer-events:none}
.kr-node{box-sizing:border-box;position:relative;display:flex;flex-direction:column;align-items:flex-start;justify-content:center;font-family:inherit;white-space:normal;line-height:1.5;overflow:visible}.kr-node-card{width:236px;height:124px;padding:13px 17px;border:1px solid color-mix(in srgb,var(--node-tone) 28%,white);border-top:3px solid var(--node-tone);border-radius:13px;background:linear-gradient(115deg,color-mix(in srgb,var(--node-tone) 6%,white),#fff 75%);box-shadow:0 6px 18px #23365f0a;text-align:left;cursor:pointer;transition:box-shadow .2s,border-color .2s}.kr-node-card:hover,.kr-node-card:focus-visible{border-color:var(--node-tone);box-shadow:0 8px 26px color-mix(in srgb,var(--node-tone) 18%,transparent);outline:2px solid color-mix(in srgb,var(--node-tone) 24%,transparent);outline-offset:3px}
.kr-node-kind{color:var(--node-tone);font-size:11px;font-weight:650;letter-spacing:.5px}.kr-node-title{font-size:14px;font-weight:600;line-height:1.55;color:#20304e;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere;width:100%;margin:4px 0}.kr-node-meta{font-size:11px;color:#61728d;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis}.kr-node-arrow{position:absolute;top:13px;right:15px;color:var(--node-tone);font-size:10px}
.kr-node-root{width:184px;height:184px;align-items:center;text-align:center;padding:25px;border-radius:50%;background:linear-gradient(145deg,#6386ff 0%,#395fed 50%,#6944df 100%);border:5px solid #fff;box-shadow:0 0 0 1px #afbefb,0 0 0 12px #647bf012,0 14px 35px #455ce02b}.kr-node-root .kr-node-kind{color:#e8edff;font-size:12px}.kr-node-root .kr-node-title{font-size:17px;color:#fff;-webkit-line-clamp:3;margin:8px 0}.kr-node-root .kr-node-meta{font-size:11px;color:#f1f4ff}
.kr-node-tooltip{display:none;position:absolute;top:calc(100% + 10px);left:50%;transform:translateX(-50%);z-index:10;width:max-content;max-width:300px;padding:10px 12px;border:1px solid #dfe6f3;border-radius:8px;background:#fff;color:#20304e;box-shadow:0 6px 24px #2036551c;font-size:13px;line-height:1.6;font-weight:400;pointer-events:none;text-align:left;overflow-wrap:anywhere}.kr-node:hover .kr-node-tooltip,.kr-node:focus-visible .kr-node-tooltip{display:block}
.knowledge-relation.is-fullscreen{border-radius:0;display:flex;flex-direction:column;height:100vh;width:100vw}.is-fullscreen .kr-stage{flex:1;min-height:0}.is-fullscreen .kr-canvas{height:100%}
@media(max-width:700px){.kr-toolbar{align-items:stretch;gap:12px;flex-direction:column;padding:14px}.kr-search.el-input{width:100%}.kr-breadcrumbs button{max-width:140px}.kr-canvas{height:700px}.kr-context{left:16px;top:16px}.kr-footer{padding:14px;gap:12px}.kr-help{margin-left:0}.kr-legend{gap:12px}}
@media(prefers-reduced-motion:reduce){.kr-node-card{transition:none}}
</style>
