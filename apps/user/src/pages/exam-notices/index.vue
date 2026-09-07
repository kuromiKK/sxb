<script setup lang="ts">
import { computed, ref } from 'vue'
import { onMounted } from 'vue'
import uniIcons from '@dcloudio/uni-ui/lib/uni-icons/uni-icons.vue'
import { examNotices } from '@/utils/examNotices'
import { backOrFallback } from '@/utils/navigation'

const batchSize = ref(5)
const visibleCount = ref(5)
const visibleNotices = computed(() => examNotices.slice(0, visibleCount.value))
const hasMore = computed(() => visibleCount.value < examNotices.length)
const back = () => backOrFallback('/pages/profile/index')
const openNotice = (id: string) => uni.navigateTo({ url: `/pages/exam-notice-detail/index?id=${encodeURIComponent(id)}` })
const loadMore = () => { visibleCount.value = Math.min(visibleCount.value + batchSize.value, examNotices.length) }

onMounted(() => {
  const viewportHeight = uni.getSystemInfoSync().windowHeight || 800
  const availableHeight = Math.max(viewportHeight - 205, 260)
  batchSize.value = Math.max(2, Math.min(8, Math.floor(availableHeight / 145)))
  visibleCount.value = batchSize.value
})
</script>

<template>
  <view class="notice-page page safe-top">
    <view class="notice-top"><button @tap="back"><uni-icons type="back" size="21" color="#4d5c73" /></button><text>考试须知</text><view /></view>
    <view class="notice-heading"><text>考试须知</text><text>报名、赴考与证书办理的重要信息</text></view>
    <view class="notice-count"><uni-icons type="notification" size="18" color="#6949df" /><text>共 {{ examNotices.length }} 篇，内容按更新时间排列</text></view>
    <view class="notice-list">
      <article v-for="item in visibleNotices" :key="item.id" class="notice-item">
        <text class="notice-title" @tap="openNotice(item.id)">{{ item.title }}</text>
        <text class="notice-intro">{{ item.intro }}</text>
        <view class="notice-meta"><text>更新时间 {{ item.updatedAt }}</text><button @tap="openNotice(item.id)">阅读全文<uni-icons type="right" size="15" color="#6949df" /></button></view>
      </article>
      <button v-if="hasMore" class="notice-more" @tap="loadMore"><text>加载更多</text><text>剩余 {{ examNotices.length - visibleCount }} 篇</text><uni-icons type="down" size="17" color="#5b50b9" /></button>
      <view v-else class="notice-end"><span></span><text>已展示全部考试须知</text><span></span></view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.notice-page{max-width:430px;min-height:100vh;margin:0 auto;box-sizing:border-box;padding-top:calc(env(safe-area-inset-top) + 18rpx);padding-bottom:48rpx;background:#f5f7fb}.notice-top{height:58rpx;display:flex;align-items:center;justify-content:space-between}.notice-top>button{width:58rpx;height:58rpx;display:flex;align-items:center;justify-content:center;margin:0;padding:0;background:#fff;border:1rpx solid #e1e7f0;border-radius:14rpx}.notice-top>button::after{display:none}.notice-top>text{color:#20334b;font-size:var(--sxb-text-item);font-weight:700}.notice-top>view{width:58rpx}.notice-heading{display:flex;flex-direction:column;gap:6rpx;margin-top:29rpx}.notice-heading>text:first-child{color:#17263c;font-size:var(--sxb-text-heading);font-weight:700}.notice-heading>text:last-child{color:#7d899a;font-size:var(--sxb-text-small)}.notice-count{display:flex;align-items:center;gap:7rpx;margin-top:20rpx;padding:13rpx 14rpx;color:#6556a7;background:#f1effc;border:1rpx solid #e0dcf6;border-radius:9rpx;font-size:var(--sxb-text-meta)}.notice-list{overflow:hidden;margin-top:14rpx;background:#fff;border:1rpx solid #dfe5ed;border-radius:12rpx}.notice-item{display:block;padding:20rpx 18rpx;border-bottom:1rpx solid #e9edf3}.notice-title{display:block;color:#24364f;font-size:var(--sxb-text-body);line-height:1.45;font-weight:700}.notice-intro{display:-webkit-box;overflow:hidden;margin-top:9rpx;color:#65758a;font-size:var(--sxb-text-small);line-height:1.65;-webkit-box-orient:vertical;-webkit-line-clamp:3}.notice-meta{display:flex;align-items:center;justify-content:space-between;gap:12rpx;margin-top:13rpx}.notice-meta>text{color:#939dac;font-size:var(--sxb-text-meta)}.notice-meta>button{width:auto;height:37rpx;display:flex;align-items:center;gap:2rpx;line-height:37rpx;margin:0;padding:0 4rpx;color:#6949df;background:transparent;font-size:var(--sxb-text-meta);font-weight:700}.notice-meta>button::after{display:none}.notice-more{width:100%;height:58rpx;display:flex;align-items:center;justify-content:center;gap:6rpx;margin:0;padding:0;color:#5b50b9;background:#f2f0ff;border:0;border-top:1rpx solid #ded9fb;border-radius:0;font-size:var(--sxb-text-small);font-weight:700}.notice-more text:nth-child(2){color:#8c81c6;font-size:var(--sxb-text-meta);font-weight:600}.notice-more::after{display:none}.notice-end{display:flex;align-items:center;gap:11rpx;padding:20rpx 18rpx;color:#9aa4b2;font-size:var(--sxb-text-meta)}.notice-end span{height:1rpx;flex:1;background:#e4e8ee}

@import '@/styles/content-system.scss';
</style>
