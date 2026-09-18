<script setup lang="ts">
import { getCurrentInstance, nextTick, onMounted, onBeforeUnmount } from 'vue'
import uniIcons from '@dcloudio/uni-ui/lib/uni-icons/uni-icons.vue'
defineProps<{title:string;appearance?:'default'|'celebration';contentKey?:string}>()
const emit=defineEmits<{close:[]}>()
const instance=getCurrentInstance()
// #ifdef H5
let previous:HTMLElement|null=null,overflow=''
function keydown(e:KeyboardEvent){
  if(Array.from(document.querySelectorAll<HTMLElement>('uni-modal')).some(el=>getComputedStyle(el).display!=='none'&&el.getClientRects().length))return
  if(e.key==='Escape'){e.preventDefault();emit('close');return}
  if(e.key!=='Tab')return
  const root=instance?.proxy?.$el as HTMLElement
  const items=Array.from(root.querySelectorAll<HTMLElement>('button:not([disabled]),uni-button:not([disabled]),textarea,input,[tabindex="0"]')).filter(el=>el.getClientRects().length)
  const first=items[0],last=items[items.length-1]
  if(!items.includes(document.activeElement as HTMLElement)){e.preventDefault();(e.shiftKey?last:first)?.focus()}
  else if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}
  else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}
}
onMounted(async()=>{previous=document.activeElement as HTMLElement;overflow=document.body.style.overflow;document.body.style.overflow='hidden';document.addEventListener('keydown',keydown);await nextTick();const panel=(instance?.proxy?.$el as HTMLElement)?.querySelector<HTMLElement>('.sheet-panel');panel?.setAttribute('tabindex','-1');panel?.focus({preventScroll:true})})
onBeforeUnmount(()=>{document.body.style.overflow=overflow;document.removeEventListener('keydown',keydown);previous?.focus()})
// #endif
</script>
<template><view class="reading-sheet" :class="{celebration:appearance==='celebration'}" role="dialog" aria-modal="true" :aria-label="title"><view class="sheet-mask" @tap="emit('close')" @touchmove.stop.prevent/><view class="sheet-panel"><view class="sheet-heading"><text>{{title}}</text><button class="sheet-close" aria-label="关闭面板" tabindex="0" @tap="emit('close')"><uni-icons type="closeempty" size="19" color="#52647b"/></button></view><scroll-view :key="contentKey" scroll-y class="sheet-scroll"><slot/></scroll-view></view></view></template>
<style scoped>
.sheet-panel:focus{outline:none}
.reading-sheet{position:fixed;inset:0;z-index:100;color:#263b53}.sheet-mask{position:absolute;inset:0;background:rgba(22,37,57,.38)}.sheet-panel{position:absolute;bottom:0;left:50%;transform:translateX(-50%);width:100%;max-width:430px;box-sizing:border-box;background:#fff;border-radius:24px 24px 0 0;padding:8px 20px calc(16px + env(safe-area-inset-bottom));box-shadow:0 -8px 40px #173b5314}.sheet-heading{display:flex;align-items:center;justify-content:space-between;min-height:60px;font-size:18px;font-weight:600}.sheet-close{display:grid;place-items:center;margin:0;padding:0;width:44px;height:44px;background:#f3f5f8;border-radius:50%}.sheet-close:after{border:0}.sheet-scroll{max-height:60vh;max-height:60dvh}.sheet-close:focus-visible{outline:2px solid #3569e8}
.celebration .sheet-panel{padding:0;overflow:hidden;background:#fffbef;border-radius:28px 28px 0 0}.celebration .sheet-heading{position:absolute;z-index:3;right:12px;top:10px;min-height:44px}.celebration .sheet-heading>text{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}.celebration .sheet-scroll{max-height:90vh;max-height:90dvh}.celebration .sheet-close{background:#ffffff24}
</style>
<style scoped>
.sheet-heading{gap:12px;min-height:52px}.sheet-heading>text{flex:1;min-width:0}.sheet-close{display:flex;align-items:center;justify-content:center;flex:none;width:44px;height:44px;min-height:44px;box-sizing:border-box;background:transparent;border:0;border-radius:50%;line-height:1;font-size:19px}.sheet-close :deep(.uni-icons){display:block;line-height:1}.sheet-close:active{opacity:.6}
</style>
