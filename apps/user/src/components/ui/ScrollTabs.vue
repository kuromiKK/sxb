<script setup lang="ts">
import { computed, getCurrentInstance, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  items: { id: string; label: string; caption?: string }[]
  modelValue: string
  label: string
  variant?: 'underline' | 'compact'
  itemClass?: string
}>(), { variant: 'underline', itemClass: '' })
const emit = defineEmits<{ 'update:modelValue': [id: string] }>()
const instance = getCurrentInstance()
const scrollLeft = ref(0)
let actualLeft = 0
let measureVersion = 0
let disposed = false
const indicator = ref({ left: 0, width: 0 })
const reducedMotion = ref(false)
const dragging = ref(false)
let removeDesktopInput: (() => void) | undefined
let media: MediaQueryList | undefined
const syncMotion = () => { reducedMotion.value = Boolean(media?.matches) }
const resize = () => { void measure(true) }
const indicatorStyle = computed(() => ({ width: indicator.value.width + 'px', transform: 'translateX(' + indicator.value.left + 'px)' }))

async function measure(reveal = false) {
  const version = ++measureVersion
  await nextTick()
  if (disposed || version !== measureVersion) return
  const query = uni.createSelectorQuery().in(instance?.proxy)
  query.select('.scroll-tabs').boundingClientRect()
  query.select('.tabs-track').boundingClientRect()
  query.selectAll('.nav-option').boundingClientRect()
  query.select('.scroll-tabs').scrollOffset(() => {})
  query.exec((result: any[]) => {
    if (disposed || version !== measureVersion) return
    const [viewport, track, options, offset] = result
    if (typeof offset?.scrollLeft === 'number') actualLeft = offset.scrollLeft
    // #ifdef H5
    actualLeft = (instance?.proxy?.$el as HTMLElement | undefined)?.scrollLeft || 0
    // #endif
    const selected = options?.[props.items.findIndex(item => item.id === props.modelValue)]
    if (!viewport || !track || !selected) return
    indicator.value = { left: selected.left - track.left + 12, width: Math.max(16, selected.width - 24) }
    // A visible tab never moves the strip. Reveal only the clipped edge of an offscreen selection.
    if (reveal) {
      const delta = selected.left < viewport.left + 12 ? selected.left - viewport.left - 12
        : selected.right > viewport.right - 12 ? selected.right - viewport.right + 12 : 0
      if (delta) {
        const target = Math.max(0, actualLeft + delta)
        // H5 uses native scrolling: no uni scroll-view callbacks survive a removed tab strip.
        // #ifdef H5
        const element = instance?.proxy?.$el as HTMLElement | undefined
        if (element?.isConnected) element.scrollTo({ left: target, behavior: reducedMotion.value || dragging.value ? 'auto' : 'smooth' })
        // #endif
        // #ifndef H5
        // Native scrolling does not update the controlled value. Resync it before
        // requesting a previously used target (End → drag left → End).
        scrollLeft.value = actualLeft
        void nextTick(() => { if (!disposed && version === measureVersion) scrollLeft.value = target })
        // #endif
      }
    }
  })
}
function choose(id: string) {
  if (id !== props.modelValue) emit('update:modelValue', id)
}
function keyboard(event: KeyboardEvent, index: number) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? props.items.length - 1
    : Math.max(0, Math.min(props.items.length - 1, index + (event.key === 'ArrowRight' ? 1 : -1)))
  choose(props.items[next].id)
}
// #ifdef H5
function enableDesktopInput() {
  const root = instance?.proxy?.$el as HTMLElement | undefined
  const scroller = root
  if (!root || !scroller) return
  let gesture: { id: number; x: number; y: number; left: number } | undefined
  let suppressClick = false
  function down(event: PointerEvent) {
    if (event.pointerType !== 'mouse' || event.button !== 0) return
    suppressClick = false
    if (scroller!.scrollWidth <= scroller!.clientWidth) return
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, left: scroller!.scrollLeft }
  }
  function move(event: PointerEvent) {
    if (!gesture || event.pointerId !== gesture.id) return
    if (!(event.buttons & 1)) { finish(); return }
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y
    if (!dragging.value) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 6) return
      if (Math.abs(dy) > Math.abs(dx)) { gesture = undefined; return }
      dragging.value = true
      suppressClick = true
      root!.setPointerCapture(event.pointerId)
    }
    event.preventDefault()
    scroller!.scrollLeft = gesture.left - dx
  }
  function finish() {
    const id = gesture?.id
    gesture = undefined
    dragging.value = false
    if (id !== undefined && root!.hasPointerCapture(id)) root!.releasePointerCapture(id)
  }
  function click(event: MouseEvent) {
    // Capture before uni-app translates click into tap. A fresh press resets this.
    if (!suppressClick || event.detail === 0) return
    event.preventDefault()
    event.stopImmediatePropagation()
    suppressClick = false
  }
  function wheel(event: WheelEvent) {
    if (event.ctrlKey) return
    const delta = (Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY)
      * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? scroller!.clientWidth : 1)
    const target = Math.max(0, Math.min(scroller!.scrollWidth - scroller!.clientWidth, scroller!.scrollLeft + delta))
    // At either end, let the page continue scrolling vertically.
    if (target === scroller!.scrollLeft) return
    event.preventDefault()
    scroller!.scrollLeft = target
  }
  root.addEventListener('pointerdown', down)
  root.addEventListener('click', click, true)
  root.addEventListener('wheel', wheel, { passive: false })
  window.addEventListener('pointermove', move, { passive: false })
  window.addEventListener('pointerup', finish)
  window.addEventListener('pointercancel', finish)
  window.addEventListener('blur', finish)
  removeDesktopInput = () => {
    finish()
    root.removeEventListener('pointerdown', down)
    root.removeEventListener('click', click, true)
    root.removeEventListener('wheel', wheel)
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', finish)
    window.removeEventListener('pointercancel', finish)
    window.removeEventListener('blur', finish)
  }
}
// #endif
watch(() => props.modelValue, () => { void measure(true) })
watch(() => props.items.map(i => i.id + ':' + i.label + ':' + i.caption).join('|'), () => { void measure(true) })
onMounted(() => {
  // #ifdef H5
  media = window.matchMedia('(prefers-reduced-motion: reduce)')
  syncMotion(); media.addEventListener('change', syncMotion)
  window.addEventListener('resize', resize)
  enableDesktopInput()
  // #endif
  void measure(true)
})
onBeforeUnmount(() => {
  disposed = true
  measureVersion += 1
  media?.removeEventListener('change', syncMotion)
  // #ifdef H5
  window.removeEventListener('resize', resize)
  removeDesktopInput?.()
  // #endif
})
</script>

<template>
  <!-- #ifdef H5 -->
  <view class="scroll-tabs native-scroll-tabs" :class="['tabs-' + variant, { dragging }]">
  <!-- #endif -->
  <!-- #ifndef H5 -->
  <scroll-view class="scroll-tabs" :class="['tabs-' + variant, { dragging }]" scroll-x :show-scrollbar="false" :scroll-left="scrollLeft" :scroll-with-animation="!reducedMotion && !dragging" @scroll="actualLeft = $event.detail.scrollLeft">
  <!-- #endif -->
    <view class="tabs-track" role="group" :aria-label="label">
      <button v-for="(item, index) in items" :key="item.id" class="nav-option" :class="[itemClass, { selected: item.id === modelValue }]"
        role="button" tabindex="0" :aria-pressed="item.id === modelValue" @tap="choose(item.id)" @keydown="keyboard($event, index)" @keydown.enter.prevent="choose(item.id)" @keydown.space.prevent="choose(item.id)">
        <view class="tab-face"><text class="tab-label">{{ item.label }}</text><text v-if="item.caption" class="tab-caption">{{ item.caption }}</text></view>
      </button>
      <view v-if="variant === 'underline'" class="selection-line" :style="indicatorStyle" aria-hidden="true"></view>
    </view>
  <!-- #ifdef H5 -->
  </view>
  <!-- #endif -->
  <!-- #ifndef H5 -->
  </scroll-view>
  <!-- #endif -->
</template>

<style scoped lang="scss">
.scroll-tabs { width:100%; white-space:nowrap; }
/* #ifdef H5 */
.native-scroll-tabs { display:block; overflow-x:auto; overflow-y:hidden; scrollbar-width:none; }
.native-scroll-tabs::-webkit-scrollbar { display:none; }
.tabs-track { user-select:none; -webkit-user-select:none; cursor:grab; }
.dragging,.dragging .tabs-track,.dragging .nav-option { cursor:grabbing; }
/* #endif */
.tabs-track { display:flex; position:relative; width:max-content; min-width:100%; padding:0 8px; box-sizing:border-box; gap:4px; }
.nav-option { flex:none; display:flex; align-items:center; justify-content:center; min-height:44px; margin:0; padding:0 12px; border-radius:10px; background:transparent; color:var(--sxb-ui-muted,#65748a); line-height:1.5; cursor:pointer; touch-action:manipulation; }
.nav-option::after { border:0; }
.tab-face { text-align:left; }
.tab-label { display:block; font-size:16px; font-weight:600; }
.tab-caption { display:block; margin-top:3px; font-size:12px; color:var(--sxb-ui-muted,#65748a); font-weight:400; }
.tabs-underline .nav-option { padding-top:5px; padding-bottom:12px; }
.selected { color:var(--sxb-blue,#3569e8); }
.selection-line { position:absolute; bottom:0; left:0; height:3px; border-radius:3px; background:var(--sxb-blue,#3569e8); transition:transform var(--sxb-ui-motion,240ms) var(--sxb-motion,ease),width var(--sxb-ui-motion,240ms) ease; pointer-events:none; }
.tabs-compact .tabs-track { gap:3px; }
.tabs-compact .nav-option { padding:0 3px; min-width:54px; }
.tabs-compact .tab-face { padding:5px 11px; border-radius:9px; background:var(--sxb-ui-soft,#f3f5f8); transition:background-color 180ms,color 180ms; }
.tabs-compact .tab-label { font-size:12px; font-weight:500; }
.tabs-compact .selected .tab-face { color:var(--sxb-blue,#3569e8); background:var(--sxb-ui-accent-soft,#edf2ff); }
.nav-option:focus-visible { outline:2px solid var(--sxb-blue,#3569e8); outline-offset:-2px; }
@media(prefers-reduced-motion:reduce) { .selection-line,.tab-face { transition:none; } }
</style>
