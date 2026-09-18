<script setup lang="ts">
import { ref, watch } from 'vue'
const props = withDefaults(defineProps<{ panelKey: string; direction?: 'next' | 'previous' }>(), { direction: 'next' })
const emit = defineEmits<{ next: []; previous: [] }>()
const version = ref(0)
watch(() => props.panelKey, () => { version.value += 1 })
let start: { x: number; y: number } | undefined
function touchStart(event: any) { const t = event.touches?.[0]; start = t ? { x: t.clientX, y: t.clientY } : undefined }
function touchEnd(event: any) {
  const t = event.changedTouches?.[0]
  if (start && t) {
    const x = t.clientX - start.x, y = t.clientY - start.y
    if (Math.abs(x) > 65 && Math.abs(x) > Math.abs(y) * 1.8) { if (x < 0) emit('next'); else emit('previous') }
  }
  start = undefined
}
</script>
<template><view class="slide-viewport" @touchstart="touchStart" @touchend="touchEnd" @touchcancel="start=undefined"><view :key="version" class="slide-panel" :class="direction"><slot /></view></view></template>
<style scoped>
.slide-viewport { overflow:hidden; }
.slide-panel { animation:panel-next var(--sxb-ui-motion,240ms) var(--sxb-motion,ease) both; }
.slide-panel.previous { animation-name:panel-previous; }
@keyframes panel-next { from { transform:translateX(28px); opacity:.3; } to { transform:none; opacity:1; } }
@keyframes panel-previous { from { transform:translateX(-28px); opacity:.3; } to { transform:none; opacity:1; } }
@media(prefers-reduced-motion:reduce) { .slide-panel,.slide-panel.previous { animation:none; } }
</style>
