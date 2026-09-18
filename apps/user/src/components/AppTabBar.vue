<script setup lang="ts">
import { ref } from 'vue'
import { openTab, openLogin } from '@/utils/navigation'
import { token } from '@/services/api'

const props = defineProps<{ active: string }>()
const navigating = ref(false)
const items = [
  { key: 'home', label: '首页', url: '/pages/index/index' },
  { key: 'knowledge', label: '知识图谱', url: '/pages/knowledge/index' },
  { key: 'courses', label: '精讲课', url: '/pages/courses/index' },
  { key: 'practice', label: '刷题', url: '/pages/practice/index' },
  { key: 'profile', label: '我的', url: '/pages/profile/index' },
]
const go = (item: typeof items[number]) => {
  if (navigating.value || props.active === item.key) return
  navigating.value = true
  if (item.key === 'profile' && !token()) { openLogin(item.url); navigating.value = false; return }
  openTab(item.url, () => { navigating.value = false })
}
</script>

<template>
  <view class="tab-safe-space" aria-hidden="true"></view>
  <view class="app-tabbar" role="navigation" aria-label="主导航">
    <button v-for="item in items" :key="item.key" class="tab-item"
      :class="{ active: active === item.key }" :aria-label="item.label"
      :aria-current="active === item.key ? 'page' : undefined" :title="item.label"
      role="button" tabindex="0" hover-class="tab-pressed"
      @tap="go(item)" @keydown.enter.prevent="go(item)" @keydown.space.prevent="go(item)">
      <view class="tab-icon">
        <image class="tab-svg" :src="'/static/navigation/' + item.key + (active === item.key ? '-active' : '') + '.svg'" mode="aspectFit" aria-hidden="true" />
      </view>
      <view class="tab-indicator" aria-hidden="true"></view>
    </button>
  </view>
</template>

<style scoped lang="scss">
.tab-safe-space { height:calc(8px + env(safe-area-inset-bottom, 0px)); pointer-events:none; }
.app-tabbar {
  position:fixed; z-index:20; left:50%; bottom:calc(12px + env(safe-area-inset-bottom, 0px));
  transform:translateX(-50%); width:calc(100% - 32px); max-width:398px; height:70px;
  display:flex; align-items:center; padding:5px 8px; box-sizing:border-box;
  border:1px solid rgba(218,227,241,.85); border-radius:24px; background:rgba(255,255,255,.97);
  box-shadow:0 8px 32px rgba(25,48,88,.12),0 2px 8px rgba(25,48,88,.04);
}
.tab-item {
  position:relative; display:flex; flex:1; align-items:center; justify-content:center;
  min-width:0; min-height:56px; margin:0; padding:0 0 5px; background:transparent;
  border:0; border-radius:18px; line-height:1; cursor:pointer; touch-action:manipulation;
  transition:opacity 140ms ease;
}
.tab-item::after { border:0; }
.tab-icon {
  display:flex; align-items:center; justify-content:center; width:48px; height:42px;
  border-radius:15px; background:transparent; transition:background-color 180ms ease,transform 180ms ease;
}
.tab-svg { display:block; width:28px; height:28px; }
.tab-item.active .tab-icon { background:#eaf0ff; animation:tab-select 360ms cubic-bezier(.2,.8,.2,1) both; }
.tab-indicator {
  position:absolute; bottom:3px; left:50%; width:5px; height:3px; border-radius:3px;
  background:transparent; transform:translateX(-50%); transition:width 180ms ease,background-color 180ms ease;
}
.tab-item.active .tab-indicator { width:14px; background:var(--sxb-blue,#3569e8); }
.tab-pressed .tab-icon,.tab-item:active .tab-icon { transform:scale(.9); }
.tab-item:focus-visible { outline:2px solid var(--sxb-blue,#3569e8); outline-offset:0; }
@media (hover:hover) { .tab-item:not(.active):hover .tab-icon { background:#f1f5fb; } }
@keyframes tab-select {
  0% { transform:translateY(3px) scale(.9); }
  55% { transform:translateY(-3px) scale(1.08); }
  100% { transform:translateY(0) scale(1); }
}
@media (prefers-reduced-motion:reduce) {
  .tab-item,.tab-icon,.tab-indicator { transition:none; }
  .tab-item.active .tab-icon { animation:none; }
  .tab-pressed .tab-icon,.tab-item:active .tab-icon { transform:none; }
}
</style>
