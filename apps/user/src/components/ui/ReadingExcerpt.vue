<script setup lang="ts">
import { ref, watch, nextTick, getCurrentInstance, onMounted, onBeforeUnmount } from 'vue'
import uniIcons from '@dcloudio/uni-ui/lib/uni-icons/uni-icons.vue'
const props=withDefaults(defineProps<{enabled?:boolean;revision?:number;visibleRatio?:number;availableHeight?:number}>(),{enabled:true,revision:0})
const ratioHeight=ref<number>()
const expanded=ref(false),overflow=ref(false),root=ref<any>()
const instance=getCurrentInstance()
let observer:ResizeObserver|undefined,alive=true
async function measure(){
 await nextTick()
 if(!alive)return
 uni.createSelectorQuery().in(instance?.proxy).select('.excerpt-inner').boundingClientRect().select('.excerpt-limit').boundingClientRect().select('.excerpt-toggle').boundingClientRect().exec((rects:any[])=>{
  if(alive&&rects?.[0]&&rects?.[1]){
   const height=rects[0].height
   if(props.availableHeight!==undefined){
    // Reserve the expand control only when the full article does not fit.
    overflow.value=height>props.availableHeight+1
    ratioHeight.value=Math.max(0,Math.floor(props.availableHeight-(overflow.value?(rects[2]?.height||44):0)))
   }else{
    ratioHeight.value=props.visibleRatio===undefined?undefined:Math.max(96,Math.ceil(height*Math.max(.05,Math.min(1,props.visibleRatio))))
    overflow.value=height>(ratioHeight.value??rects[1].height)+2
   }
  }
 })
}
watch(()=>[props.enabled,props.revision,props.visibleRatio,props.availableHeight],measure)
onMounted(()=>{
 void measure();uni.onWindowResize(measure)
 // #ifdef H5
 const el=root.value?.$el||root.value
 if(el&&typeof ResizeObserver!=='undefined'){
  observer=new ResizeObserver(()=>void measure())
  for(const child of el.querySelectorAll('.excerpt-inner,.excerpt-limit'))observer.observe(child)
 }
 // #endif
})
onBeforeUnmount(()=>{alive=false;observer?.disconnect();uni.offWindowResize(measure)})
defineExpose({measure})
</script>
<template><view ref="root" class="reading-excerpt" :class="{folded:enabled&&overflow&&!expanded}" :style="ratioHeight!==undefined?{'--excerpt-height':ratioHeight+'px'}:{}">
 <view class="excerpt-limit" aria-hidden="true"/>
 <view class="excerpt-clip"><view class="excerpt-inner" @focusin="expanded=true"><slot/></view></view>
 <button v-if="enabled&&overflow" class="excerpt-toggle" role="button" tabindex="0" :aria-expanded="expanded" @tap="expanded=!expanded" @keydown.enter.prevent="expanded=!expanded" @keydown.space.prevent="expanded=!expanded"><text>{{expanded?'收起正文':'展开全文'}}</text><uni-icons :type="expanded?'up':'down'" size="13" color="#486b9c"/></button>
</view></template>
<style scoped>
.reading-excerpt{--excerpt-height:clamp(64px,12vh,108px);position:relative}.excerpt-limit{position:absolute;top:0;left:0;width:1px;height:var(--excerpt-height);visibility:hidden;pointer-events:none}.excerpt-inner{display:flow-root}.folded .excerpt-clip{position:relative;max-height:var(--excerpt-height);overflow:hidden}.folded .excerpt-clip:after{content:'';position:absolute;inset:auto 0 0;height:44px;background:linear-gradient(0deg,#fff,rgba(255,255,255,0));pointer-events:none}.excerpt-toggle{display:flex;align-items:center;justify-content:center;gap:6px;min-height:44px;width:100%;margin:0;padding:0;background:transparent;color:#486b9c;font-size:13px;line-height:44px}.excerpt-toggle:after{border:0}.excerpt-toggle:focus-visible{outline:2px solid #3569e8;outline-offset:-2px}.excerpt-toggle:active{opacity:.7}
@supports(height:1dvh){.reading-excerpt{--excerpt-height:clamp(64px,12dvh,108px)}}
</style>
