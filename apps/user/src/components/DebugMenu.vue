<script setup lang="ts">
import { ref } from 'vue'
import uniIcons from '@dcloudio/uni-ui/lib/uni-icons/uni-icons.vue'

const props = defineProps<{ page: string; options?: Array<{ key: string; label: string }> }>()
const emit = defineEmits<{ select: [key: string] }>()
const open = ref(false)
const storageKey = `sxb-debug-state-${props.page}`
const selected = ref(uni.getStorageSync(storageKey) || 'normal')
const items = props.options || [
  { key: 'normal', label: '正常状态' },
  { key: 'empty', label: '空数据状态' },
  { key: 'completed', label: '全部完成状态' },
]
const choose = (key: string) => {
  selected.value = key
  uni.setStorageSync(storageKey, key)
  emit('select', key)
  open.value = false
}
</script>

<template>
  <view class="debug-menu">
    <button class="debug-trigger" @tap="open = true"><text>调</text></button>
    <view v-if="open" class="debug-mask" @tap="open = false">
      <view class="debug-sheet" @tap.stop>
        <view class="sheet-head"><view><text>调试菜单</text><text>{{ props.page }} · 仅用于演示</text></view><button @tap="open = false"><uniIcons type="closeempty" size="20" color="#748196" /></button></view>
        <view class="debug-options"><button v-for="item in items" :key="item.key" :class="{ active: selected === item.key }" @tap="choose(item.key)"><text>{{ item.label }}</text><uniIcons v-if="selected === item.key" type="checkmarkempty" size="18" color="#3569e8" /></button></view>
      </view>
    </view>
  </view>
</template>

<style lang="scss">
.debug-trigger { position: fixed; z-index: 80; right: 10px; top: 46%; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; margin: 0; padding: 0; color: #fff; background: #5469c9; border: 2px solid rgba(255,255,255,.75); border-radius: 50%; box-shadow: 0 5px 15px rgba(52,73,144,.25); font-size: 15px; font-weight: 900; }
.debug-trigger::after { display: none; }
.debug-mask { position: fixed; z-index: 79; inset: 0; display: flex; align-items: flex-end; justify-content: center; background: rgba(17,29,51,.42); }
.debug-sheet { width: 100%; max-width: 430px; box-sizing: border-box; padding: 16px 20px calc(20px + env(safe-area-inset-bottom)); background: #fff; border-radius: 18px 18px 0 0; box-shadow: 0 -12px 34px rgba(24,39,67,.18); }
.sheet-head { display: flex; align-items: center; justify-content: space-between; }.sheet-head>view { display: flex; flex-direction: column; gap: 4px; }.sheet-head text:first-child { color: #1e3048; font-size: 20px; font-weight: 900; }.sheet-head text:last-child { color: #8b96a5; font-size: 13px; }.sheet-head button { width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; margin: 0; padding: 0; background: #f1f4f8; border-radius: 50%; }.sheet-head button::after { display: none; }
.debug-options { display: flex; flex-direction: column; gap: 8px; margin-top: 15px; }.debug-options button { height: 48px; display: flex; align-items: center; justify-content: space-between; margin: 0; padding: 0 14px; color: #4e6078; background: #f6f8fb; border: 1px solid #e4e9f1; border-radius: 9px; text-align: left; font-size: 16px; }.debug-options button.active { color: #3569e8; background: #edf3ff; border-color: #a9c0fa; font-weight: 800; }.debug-options button::after { display: none; }
</style>
