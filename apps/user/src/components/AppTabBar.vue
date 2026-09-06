<script setup lang="ts">
import uniIcons from '@dcloudio/uni-ui/lib/uni-icons/uni-icons.vue'

defineProps<{ active: string }>()
const items = [
  { key: 'home', label: '首页', icon: 'home', color: '#3569e8', url: '/pages/index/index' },
  { key: 'knowledge', label: '知识图谱', icon: 'map', color: '#e35f8f', url: '/pages/knowledge/index' },
  { key: 'courses', label: '精讲课', icon: 'sound', color: '#e98a3a', url: '/pages/courses/index' },
  { key: 'practice', label: '刷题', icon: 'list', color: '#7655df', url: '/pages/practice/index' },
  { key: 'profile', label: '我的', icon: 'person', color: '#1a9a7b', url: '/pages/profile/index' },
]
const go = (url: string) => uni.reLaunch({ url })
</script>

<template>
  <view class="app-tabbar">
    <view v-for="item in items" :key="item.key" class="tab-item" :class="{ active: active === item.key }" @tap="go(item.url)">
      <view class="tab-icon" :style="active === item.key ? { background: `${item.color}16` } : undefined">
        <uni-icons :type="item.icon" size="23" :color="active === item.key ? item.color : '#8a95a5'" />
      </view>
      <text :style="active === item.key ? { color: item.color } : undefined">{{ item.label }}</text>
    </view>
  </view>
</template>

<style lang="scss">
.app-tabbar { position: fixed; z-index: 20; left: 50%; bottom: 0; width: 100%; max-width: 430px; transform: translateX(-50%); height: 76px; padding-bottom: env(safe-area-inset-bottom); display: flex; align-items: center; justify-content: space-around; background: rgba(255,255,255,.98); border-top: 1px solid #e4e9f1; box-shadow: 0 -8px 24px rgba(28, 44, 72, .08); }
.tab-item { width: 20%; height: 68px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; color: #8a95a5; font-size: 12px; line-height: 1; font-weight: 600; }
.tab-item.active { font-weight: 700; }
.tab-icon { width: 38px; height: 30px; display: flex; align-items: center; justify-content: center; border-radius: 10px; }
</style>
