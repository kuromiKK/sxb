<script setup lang="ts">
import { computed, ref } from 'vue'
import uniIcons from '@dcloudio/uni-ui/lib/uni-icons/uni-icons.vue'
import { searchResults } from '@/mock/data'
import { useAppStore } from '@/store/app'
import { backOrFallback } from '@/utils/navigation'

const { requireLogin } = useAppStore()
const keyword = ref('')
const activeTab = ref('全部')
const tabs = ['全部', '精讲课', '知识点', '文章']
const results = computed(() => searchResults.filter(item => (!keyword.value || `${item.title}${item.description}${item.keyword}`.includes(keyword.value)) && (activeTab.value === '全部' || item.typeName === activeTab.value)))
const search = () => { if (!keyword.value.trim()) uni.showToast({ title: '请输入搜索内容', icon: 'none' }) }
const goBack = () => backOrFallback('/pages/index/index')
const open = (item: typeof searchResults[number]) => {
  if (item.type === 'article') {
    uni.navigateTo({ url: `/pages/exam-notice-detail/index?id=${encodeURIComponent(item.targetId)}` })
    return
  }
  const url = item.type === 'course'
    ? `/pages/course-detail/index?id=${encodeURIComponent(item.targetId)}`
    : `/pages/knowledge-detail/index?id=${encodeURIComponent(item.targetId)}`
  if (requireLogin(url)) uni.navigateTo({ url })
}
</script>

<template>
  <view class="search-page safe-top"><view class="search-head"><view class="back" @tap="goBack"><uni-icons type="back" size="21" color="#44536a" /></view><view class="search-input"><uni-icons type="search" size="20" color="#6f7f96" /><input v-model="keyword" confirm-type="search" focus placeholder="搜索课程、知识点、文章" @confirm="search" /><text v-if="keyword" @tap="keyword = ''">×</text></view></view><view class="tabs"><text v-for="tab in tabs" :key="tab" :class="{ active: activeTab === tab }" @tap="activeTab = tab">{{ tab }}</text></view><view class="results"><view v-for="item in results" :key="item.id" class="result" @tap="open(item)"><view class="result-icon" :class="item.type">{{ item.type === 'course' ? '课' : item.type === 'knowledge' ? '点' : '文' }}</view><view class="result-copy"><view class="result-title"><text>{{ item.title }}</text><text class="result-tag" :class="`${item.type}-tag`">{{ item.typeName }}</text></view><text class="result-desc">{{ item.description }}</text></view><text class="arrow">›</text></view><view v-if="!results.length" class="empty">没有找到相关内容，换个关键词试试</view></view></view>
</template>

<style scoped lang="scss">
.search-page{min-height:100vh;background:#f5f7fb;padding:36rpx 32rpx;}.search-head{display:flex;align-items:center;gap:14rpx;}.back{width:54rpx;height:54rpx;display:flex;align-items:center;justify-content:center;flex:none;background:#e9efff;border-radius:14rpx;}.search-input{height:76rpx;flex:1;display:flex;align-items:center;gap:12rpx;padding:0 18rpx;background:#fff;border:1rpx solid #e1e7f1;border-radius:13rpx;box-shadow:0 6rpx 18rpx rgba(40,58,91,.04);}.search-input input{height:76rpx;flex:1;color:#25344b;font-size: var(--sxb-text-body);}.search-input>text{font-size: var(--sxb-text-heading);color:#96a1aa;}.tabs{display:flex;gap:32rpx;border-bottom:1rpx solid #e4e9f1;margin-top:27rpx;}.tabs text{padding:0 0 17rpx;color:#8c98a5;font-size: var(--sxb-text-body);position:relative;}.tabs text.active{color:#3569e8;font-weight:700;}.tabs text.active:after{content:"";position:absolute;height:5rpx;background:linear-gradient(90deg,#3569e8,#7655df);bottom:-1rpx;left:4rpx;right:4rpx;border-radius:5rpx;}.results{display:flex;flex-direction:column;margin-top:8rpx;background:#fff;border:1rpx solid #e3e8f1;border-radius:12rpx;padding:0 18rpx;}.result{display:flex;align-items:center;gap:16rpx;padding:24rpx 0;border-bottom:1rpx solid #edf0f2;}.result:last-child{border-bottom:0;}.result-icon{width:58rpx;height:58rpx;border-radius:14rpx;display:flex;align-items:center;justify-content:center;font-size: var(--sxb-text-body);font-weight:700;flex:none;}.course{background:#e9efff;color:#3569e8;}.knowledge{background:#f0ecff;color:#7655df;}.article{background:#fff0e5;color:#d9782f;}.result-copy{flex:1;min-width:0;display:flex;flex-direction:column;gap:8rpx;}.result-title{display:flex;align-items:center;gap:10rpx;}.result-title>text:first-child{font-size: var(--sxb-text-title);font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}.result-tag{font-size: var(--sxb-text-small);padding:4rpx 8rpx;border-radius:5rpx;flex:none;}.course-tag{color:#3569e8;background:#e9efff;}.knowledge-tag{color:#7655df;background:#f0ecff;}.article-tag{color:#d9782f;background:#fff0e5;}.result-desc{font-size: var(--sxb-text-body);color:#8995a1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}.arrow{font-size: var(--sxb-text-page);color:#a1abb4;}.empty{text-align:center;color:#9ca6ae;font-size: var(--sxb-text-item);padding:110rpx 0;background:transparent;border:0;}

@import '@/styles/content-system.scss';
</style>
