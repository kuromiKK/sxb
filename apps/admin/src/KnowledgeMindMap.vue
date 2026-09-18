<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { Graph, type NodeData, type EdgeData } from '@antv/g6'
import { Crosshair, Maximize2, Minimize2, Minus, Plus, GitBranch, FoldVertical } from 'lucide-vue-next'
import {useGraphSettings} from './utils/graph-settings'
import type {GraphSettings} from '../../shared/workspace-tools'

const props=defineProps<{root:any;settings?:GraphSettings}>()
const {config:graphConfig,style:graphStyle}=useGraphSettings(()=>props.settings)
const emit=defineEmits<{edit:[node:any]}>()
const host=ref<HTMLElement>(),canvas=ref<HTMLElement>(),expanded=ref(new Set<string>()),selected=ref(''),query=ref(''),fullscreen=ref(false),error=ref(''),busy=ref(false),pending=ref(false),count=ref(0)
const labels:Record<string,string>={exam:'考试项目',subject:'科目',chapter:'章',section:'节',knowledge:'知识点',course:'课程'}
const palette=computed(()=>Object.entries(graphConfig.value.colors).filter(([key])=>key!=='exam').map(([,value])=>value))
const children=(n:any):any[]=>n?.children||n?.chapters||n?.sections||[...(n?.courses||[]),...(n?.knowledge||[])]
const catalog=computed(()=>{
  const entries=new Map<string,{node:any;parent?:string;color:string;side:string}>()
  function walk(node:any,parent?:string,color=graphConfig.value.colors.exam,side='right'){
    entries.set(node.id,{node,parent,color,side})
    children(node).forEach((child,i)=>walk(child,node.id,node.type==='exam'?palette.value[i%palette.value.length]:color,node.type==='exam'?(i%2?'left':'right'):side))
  }
  walk(props.root);return entries
})
const options=computed(()=>[...catalog.value.values()].filter(({node})=>(node.title+' '+node.id).toLowerCase().includes(query.value.trim().toLowerCase())).slice(0,40))
let graph:Graph|undefined,observer:ResizeObserver|undefined,frame=0,revision=0,disposed=false,focusId='',first=true
const motion=()=>!graphConfig.value.animation||matchMedia('(prefers-reduced-motion: reduce)').matches?false:{duration:260}
function schedule(){pending.value=true;cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>void draw())}
function toggle(node:any){
  const next=new Set(expanded.value)
  if(next.has(node.id))next.delete(node.id);else next.add(node.id)
  focusId=node.id;expanded.value=next
}
function collapse(){expanded.value=new Set();selected.value='';focusId=props.root.id;first=true}
function locate(id:string){
  if(!id)return
  const next=new Set(expanded.value);let parent=catalog.value.get(id)?.parent
  while(parent){next.add(parent);parent=catalog.value.get(parent)?.parent}
  focusId=id;expanded.value=next;schedule()
}
async function edit(node:any){if(document.fullscreenElement===host.value)await document.exitFullscreen();emit('edit',node)}
function meta(node:any){
  if(node.type==='knowledge')return `${node.questions||0} 道题${node.courses?.length?' · 配套课 '+node.courses.length:''}${node.hasHandout?' · 含讲义':''}`
  if(node.type==='course')return ({video:'视频课程',audio:'音频课程',article:'图文课程'} as Record<string,string>)[node.mediaType]||'课程内容'
  const counts=new Map<string,number>();children(node).forEach(n=>counts.set(n.type,(counts.get(n.type)||0)+1))
  return [...counts].map(([type,n])=>`${n} ${labels[type]||'内容'}`).join(' · ')||'暂无下级内容'
}
function element(node:any,color:string){
  const root=node.type==='exam',leaf=['course','knowledge'].includes(node.type),open=expanded.value.has(node.id)||root
  const el=document.createElement('div');el.className='mm-node'+(root?' mm-root':'')+(selected.value===node.id?' mm-selected':'')+(catalog.value.get(node.id)?.side==='left'?' mm-left':'')
  el.dataset.nodeId=node.id;el.dataset.nodeType=node.type;el.style.setProperty('--branch-color',color)
  const main=document.createElement(leaf?'button':'div');main.className='mm-node-main'
  main.setAttribute('aria-label',`${labels[node.type]}：${node.title}`)
  if(leaf){main.setAttribute('type','button');main.onclick=()=>void edit(node)}else main.tabIndex=0
  for(const [cls,text] of [['mm-kind',labels[node.type]],['mm-title',node.title],['mm-meta',meta(node)]]){const span=document.createElement('span');span.className=cls;span.textContent=text;main.append(span)}
  const tooltip=document.createElement('span');tooltip.className='mm-tooltip';tooltip.textContent=node.title;tooltip.setAttribute('aria-hidden','true');main.append(tooltip);el.append(main)
  if(!root&&children(node).length){
    const button=document.createElement('button');button.type='button';button.className='mm-toggle';button.textContent=open?'−':'+'
    button.setAttribute('aria-label',`${open?'收起':'展开'}${labels[node.type]}：${node.title}`);button.setAttribute('aria-expanded',String(open));button.onclick=()=>toggle(node);el.append(button)
  }
  return el
}
async function draw(){
  pending.value=false;if(disposed||!canvas.value)return
  if(busy.value){revision++;return}
  busy.value=true;error.value='';const start=revision,target=focusId;focusId=''
  try{
    const width=canvas.value.clientWidth,height=canvas.value.clientHeight;if(!width||!height)return
    if(!graph)graph=new Graph({container:canvas.value,width,height,padding:60,animation:motion(),zoomRange:[0.12,1.8],behaviors:['drag-canvas','zoom-canvas'],node:{type:'html'},edge:{type:'cubic-horizontal',style:{lineWidth:2,strokeOpacity:0.65}},layout:{type:'mindmap',direction:'H',getSide:(_node:any,index:number)=>index%2?'left':'right',getWidth:()=>244,getHeight:()=>104,getVGap:()=>15,getHGap:()=>54}})
    else graph.setSize(width,height)
    const nodes:NodeData[]=[],edges:EdgeData[]=[]
    function walk(node:any,parent?:string){
      const color=catalog.value.get(node.id)?.color||'#315bea'
      nodes.push({id:node.id,style:{size:[244,104],dx:-122,dy:-52,innerHTML:element(node,color)}})
      if(parent)edges.push({id:`mind-${node.id}`,source:parent,target:node.id,style:{stroke:color}})
      if(node.type==='exam'||expanded.value.has(node.id))children(node).forEach(child=>walk(child,node.id))
    }
    walk(props.root);count.value=nodes.length
    const focused=document.activeElement as HTMLElement|null
    const focusedId=canvas.value.contains(focused)?focused?.closest<HTMLElement>('.mm-node')?.dataset.nodeId:undefined
    const focusedSelector=focused?.classList.contains('mm-toggle')?'.mm-toggle':'.mm-node-main'
    graph.setOptions({animation:motion(),edge:{type:graphConfig.value.mindEdgeType,style:{lineWidth:graphConfig.value.edgeWidth,strokeOpacity:0.65,lineDash:graphConfig.value.edgeDashed?[6,4]:[]}}})
    graph.setData({nodes,edges});await graph.render();if(disposed)return
    if(target&&!first){await graph.zoomTo(Math.max(0.85,graph.getZoom()),motion());await graph.focusElement(target,motion())}
    else if(first){await fit(false);first=false}
    // Keep keyboard focus on the expand control when G6 replaces its HTML node.
    if(focusedId&&(document.activeElement===document.body||document.activeElement===focused)){
      const node=Array.from(canvas.value.querySelectorAll<HTMLElement>('.mm-node')).find(n=>n.dataset.nodeId===focusedId)
      node?.querySelector<HTMLElement>(focusedSelector)?.focus({preventScroll:true})
    }
  }catch(e:any){if(!disposed)error.value=e.message||'思维导图加载失败'}
  finally{busy.value=false;if(!disposed&&revision!==start)schedule()}
}
async function fit(animate=true){await graph?.fitView({when:'always'},animate?motion():false);if((graph?.getZoom()||1)>1){await graph?.zoomTo(1,false);await graph?.fitCenter(false)}}
async function zoom(ratio:number){await graph?.zoomBy(ratio,motion())}
async function toggleFullscreen(){try{if(document.fullscreenElement===host.value)await document.exitFullscreen();else await host.value?.requestFullscreen()}catch{error.value='浏览器暂不支持全屏，请使用缩放按钮'}}
function resize(){if(expanded.value.size){focusId=selected.value||props.root.id;first=false}else first=true;schedule()}
function syncFullscreen(){fullscreen.value=document.fullscreenElement===host.value;resize()}
watch(expanded,schedule)
watch(graphConfig,schedule,{deep:true})
watch(()=>props.root,()=>{collapse();query.value='';schedule()})
onMounted(async()=>{await nextTick();observer=new ResizeObserver(resize);if(canvas.value)observer.observe(canvas.value);document.addEventListener('fullscreenchange',syncFullscreen);schedule()})
onUnmounted(()=>{disposed=true;cancelAnimationFrame(frame);observer?.disconnect();document.removeEventListener('fullscreenchange',syncFullscreen);graph?.destroy();graph=undefined})
</script>

<template>
  <div ref="host" class="knowledge-relation knowledge-mindmap" :class="{'is-fullscreen':fullscreen}" :style="graphStyle" :data-node-style="graphConfig.nodeStyle">
    <div class="kr-toolbar">
      <div class="mm-heading"><GitBranch :size="20"/><div><strong>知识结构脑图</strong><span>点击 ＋ 展开分支，保留完整层级路径</span></div></div>
      <div class="mm-actions"><el-select v-model="selected" filterable clearable :teleported="!fullscreen" :filter-method="(value:string)=>query=value" placeholder="搜索科目、章节、知识点或课程" aria-label="搜索脑图节点" @change="locate"><el-option v-for="{node} in options" :key="node.id" :value="node.id" :label="node.title"><span class="mm-option-type">{{labels[node.type]}}</span>{{node.title}}</el-option></el-select><el-button @click="collapse"><FoldVertical :size="16"/>收起分支</el-button></div>
    </div>
    <el-alert v-if="error" :title="error" type="error" :closable="false"/>
    <div class="kr-stage">
      <div class="kr-context"><strong>{{root.title}}</strong><span>当前显示 {{count}} 个节点</span></div>
      <div ref="canvas" class="kr-canvas mm-canvas" aria-label="可展开知识思维导图" :aria-busy="busy||pending"></div>
      <div class="kr-tools" aria-label="脑图画布工具"><el-tooltip content="放大"><el-button aria-label="放大思维导图" @click="zoom(1.2)"><Plus :size="18"/></el-button></el-tooltip><el-tooltip content="缩小"><el-button aria-label="缩小思维导图" @click="zoom(1/1.2)"><Minus :size="18"/></el-button></el-tooltip><el-tooltip content="查看全图"><el-button aria-label="适配完整思维导图" @click="fit()"><Crosshair :size="18"/></el-button></el-tooltip><el-tooltip :content="fullscreen?'退出全屏':'全屏画布'"><el-button :aria-label="fullscreen?'退出全屏脑图':'全屏脑图'" @click="toggleFullscreen"><component :is="fullscreen?Minimize2:Maximize2" :size="18"/></el-button></el-tooltip></div>
    </div>
    <div class="kr-footer"><div class="mm-path">考试项目 <span>›</span> 科目 <span>›</span> 章 <span>›</span> 节 <span>›</span> 课程 / 知识点</div><span class="kr-help">拖动平移 · 滚轮缩放 · 点击课程或知识点查看内容</span></div>
  </div>
</template>

<style>
.mm-heading{display:flex;align-items:center;gap:12px;color:#4562d5;flex-shrink:0}.mm-heading>div{display:flex;flex-direction:column;gap:4px}.mm-heading strong{font-size:15px;color:var(--admin-text)}.mm-heading span{font-size:12px;color:var(--muted)}.mm-actions{display:flex;gap:12px;align-items:center;min-width:0}.mm-actions .el-select{width:300px}.mm-actions .el-button{gap:6px}.mm-option-type{display:inline-block;margin-right:8px;font-size:12px;color:var(--muted)}.mm-path{display:flex;gap:10px;font-size:12px;color:#526683}.mm-path>span{color:#a1adc0}
.mm-node{--branch-color:#315bea;box-sizing:border-box;position:relative;width:244px;height:104px;border-radius:12px;border:1px solid color-mix(in srgb,var(--branch-color) 32%,white);background:linear-gradient(115deg,color-mix(in srgb,var(--branch-color) 7%,white),#fff);box-shadow:0 4px 14px #26395c09;font-family:inherit;color:#20304e}.mm-node:before{content:'';position:absolute;left:0;top:17px;bottom:17px;width:3px;background:var(--branch-color);border-radius:4px}.mm-node-main{box-sizing:border-box;display:flex;flex-direction:column;justify-content:center;gap:5px;width:100%;height:100%;padding:10px 19px;border:0;border-radius:inherit;background:transparent;color:inherit;text-align:left;font-family:inherit;position:relative;line-height:1.4}.mm-node-main:is(button){cursor:pointer}.mm-kind{font-size:11px;font-weight:650;color:var(--branch-color)}.mm-title{font-size:14px;font-weight:600;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere;line-height:1.5}.mm-meta{font-size:11px;color:#60718b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mm-toggle{position:absolute;right:-15px;top:37px;border:1px solid color-mix(in srgb,var(--branch-color) 35%,white);width:30px;height:30px;display:grid;place-items:center;background:white;color:var(--branch-color);border-radius:50%;font-size:20px;line-height:1;cursor:pointer;box-shadow:0 2px 8px #2036550a}.mm-toggle:hover{background:var(--branch-color);color:white}.mm-toggle:focus-visible,.mm-node-main:focus-visible{outline:2px solid var(--branch-color);outline-offset:4px}.mm-selected{box-shadow:0 0 0 3px color-mix(in srgb,var(--branch-color) 28%,transparent)}
.mm-root{background:linear-gradient(120deg,#426ceb,#7143d8);border:0;box-shadow:0 6px 20px #4e57d72a}.mm-root:before{display:none}.mm-root .mm-node-main{text-align:center;align-items:center}.mm-root .mm-title{font-size:17px;color:#fff}.mm-root .mm-kind,.mm-root .mm-meta{color:#f0f2ff}.mm-root .mm-node-main:focus-visible{outline-color:#315bea}.mm-tooltip{display:none;position:absolute;left:0;top:calc(100% + 10px);z-index:5;max-width:340px;width:max-content;padding:10px 12px;border-radius:8px;border:1px solid #dfe6f3;background:white;color:#20304e;box-shadow:0 6px 24px #2036551c;font-size:13px;line-height:1.6;overflow-wrap:anywhere;text-align:left;pointer-events:none}.mm-node-main:hover .mm-tooltip,.mm-node-main:focus-visible .mm-tooltip{display:block}
@media(max-width:1000px){.knowledge-mindmap .kr-toolbar{flex-wrap:wrap}.mm-actions{flex:1}.mm-actions .el-select{flex:1;min-width:180px}}
.mm-node-main:focus .mm-tooltip{display:block}
.mm-left .mm-toggle{right:auto;left:-15px}
@media(max-width:600px){.mm-actions{flex-wrap:wrap}.mm-actions .el-select{flex-basis:100%;width:100%}.mm-path{flex-wrap:wrap;gap:6px}}
</style>
