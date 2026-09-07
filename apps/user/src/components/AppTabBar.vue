<script setup lang="ts">
import uniIcons from '@dcloudio/uni-ui/lib/uni-icons/uni-icons.vue'

const props = defineProps<{ active: string }>()
const items = [
  { key: 'home', label: '首页', icon: 'home', color: '#3569e8', url: '/pages/index/index' },
  { key: 'knowledge', label: '知识图谱', icon: 'map', color: '#e35f8f', url: '/pages/knowledge/index' },
  { key: 'courses', label: '精讲课', icon: 'sound', color: '#e98a3a', url: '/pages/courses/index' },
  { key: 'practice', label: '刷题', icon: 'list', color: '#7655df', url: '/pages/practice/index' },
  { key: 'profile', label: '我的', icon: 'person', color: '#1a9a7b', url: '/pages/profile/index' },
]
const go = (item: typeof items[number]) => { if (props.active !== item.key) uni.reLaunch({ url: item.url }) }
</script>

<template>
  <view class="app-tabbar" role="navigation" aria-label="主导航">
    <button v-for="item in items" :key="item.key" class="tab-item" :class="{ active: active === item.key }" :aria-current="active === item.key ? 'page' : undefined" @tap="go(item)">
      <view class="tab-icon" aria-hidden="true">
        <uni-icons :type="item.icon" size="23" :color="active === item.key ? '#285c85' : '#5d6a78'" />
      </view>
      <text>{{ item.label }}</text>
    </button>
  </view>
</template>

<style lang="scss">
.app-tabbar { position:fixed; z-index:20; left:50%; bottom:0; width:100%; max-width:430px; transform:translateX(-50%); min-height:76px; padding:4px 8px calc(4px + env(safe-area-inset-bottom)); display:flex; background:#fff; border-top:1px solid #d9dfe2; }
.app-tabbar .tab-item { flex:1; min-width:0; min-height:64px; margin:0; padding:4px 0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px; color:#5d6a78; background:transparent; font-size:12px; line-height:1.4; font-weight:400; border-radius:8px; transition:background-color 160ms,opacity 100ms; touch-action:manipulation; }
.app-tabbar .tab-item::after { border:0; }.app-tabbar .tab-item:active { opacity:.65; }.app-tabbar .tab-item:focus-visible { outline:2px solid #285c85; outline-offset:-2px; }
.app-tabbar .tab-item.active { color:#285c85; font-weight:600; }
.app-tabbar .tab-icon { width:42px; height:30px; display:flex; align-items:center; justify-content:center; border-radius:8px; transition:background-color 160ms; }
.app-tabbar .active .tab-icon { background:#eaf0f5; }
</style>
