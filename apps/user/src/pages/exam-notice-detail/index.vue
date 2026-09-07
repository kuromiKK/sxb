<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import uniIcons from '@dcloudio/uni-ui/lib/uni-icons/uni-icons.vue'
import { getExamNotice } from '@/utils/examNotices'
import { backOrFallback } from '@/utils/navigation'

const noticeId = ref('exam-guide')
const visibleSectionCount = ref(2)
const notice = computed(() => getExamNotice(noticeId.value))
const visibleSections = computed(() => notice.value.sections.slice(0, visibleSectionCount.value))
const hasMore = computed(() => visibleSectionCount.value < notice.value.sections.length)

onLoad((options) => { noticeId.value = String(options?.id || 'exam-guide') })
const back = () => backOrFallback('/pages/exam-notices/index')
const loadMore = () => { visibleSectionCount.value = Math.min(visibleSectionCount.value + 2, notice.value.sections.length) }
</script>

<template>
  <view class="detail-page page safe-top">
    <view class="detail-top"><button @tap="back"><uni-icons type="back" size="21" color="#4d5c73" /></button><text>考试须知</text><view /></view>
    <article class="article-card">
      <header class="article-head"><text>{{ notice.title }}</text><view><text>更新时间 {{ notice.updatedAt }}</text><i></i><text>发布者 {{ notice.publisher }}</text></view></header>
      <view class="notice-visual">
        <view class="visual-copy"><text>EXAM NOTICE</text><text>{{ notice.visualLabel }}</text><text>从报名确认到顺利完成考试</text></view>
        <view class="visual-flow"><view><i>1</i><text>确认信息</text></view><span></span><view><i>2</i><text>证件入场</text></view><span></span><view><i>3</i><text>规范答题</text></view></view>
      </view>
      <view class="article-lead"><uni-icons type="info" size="19" color="#6949df" /><text>{{ notice.intro }}</text></view>
      <section v-for="section in visibleSections" :key="section.heading" class="article-section">
        <text class="section-title">{{ section.heading }}</text>
        <text v-for="paragraph in section.paragraphs" :key="paragraph" class="article-paragraph">{{ paragraph }}</text>
        <view v-if="section.points?.length" class="article-points"><view v-for="point in section.points" :key="point"><i></i><text>{{ point }}</text></view></view>
      </section>
      <view v-if="hasMore" class="article-fade"></view>
      <button v-if="hasMore" class="article-more" @tap="loadMore"><text>加载更多</text><uni-icons type="down" size="17" color="#5b50b9" /></button>
      <view v-else class="article-end"><span></span><text>已展示全部内容</text><span></span></view>
    </article>
  </view>
</template>

<style lang="scss" scoped>
.detail-page{max-width:430px;min-height:100vh;margin:0 auto;box-sizing:border-box;padding-top:calc(env(safe-area-inset-top) + 18rpx);padding-bottom:48rpx;background:#f5f7fb}.detail-top{height:58rpx;display:flex;align-items:center;justify-content:space-between}.detail-top>button{width:58rpx;height:58rpx;display:flex;align-items:center;justify-content:center;margin:0;padding:0;background:#fff;border:1rpx solid #e1e7f0;border-radius:14rpx}.detail-top>button::after{display:none}.detail-top>text{color:#20334b;font-size:var(--sxb-text-item);font-weight:700}.detail-top>view{width:58rpx}.article-card{position:relative;display:block;margin-top:20rpx;padding:23rpx 20rpx 18rpx;background:#fff;border:1rpx solid #dfe5ed;border-radius:12rpx;box-shadow:0 8rpx 22rpx rgba(43,58,91,.05)}.article-head>text{display:block;color:#1d3049;font-size:var(--sxb-text-heading);line-height:1.45;font-weight:700}.article-head>view{display:flex;align-items:center;flex-wrap:wrap;gap:8rpx;margin-top:11rpx;color:#8995a6;font-size:var(--sxb-text-meta)}.article-head i{width:5rpx;height:5rpx;background:#b5bdc8;border-radius:50%}.notice-visual{position:relative;overflow:hidden;margin-top:20rpx;padding:23rpx 20rpx;color:#fff;background:linear-gradient(130deg,#1d3048 0%,#2e3f69 55%,#3b2f70 100%);border-radius:9rpx}.notice-visual::after{position:absolute;right:-45rpx;top:-63rpx;width:160rpx;height:160rpx;content:'';border:20rpx solid rgba(255,255,255,.07);border-radius:50%;box-shadow:0 0 0 18rpx rgba(255,255,255,.035)}.visual-copy{position:relative;z-index:1;display:flex;flex-direction:column;gap:6rpx}.visual-copy text:first-child{color:#b7c8ff;font-size:var(--sxb-text-meta);font-weight:700}.visual-copy text:nth-child(2){font-size:var(--sxb-text-title);font-weight:700}.visual-copy text:last-child{color:#c7d1e6;font-size:var(--sxb-text-meta)}.visual-flow{position:relative;z-index:1;display:flex;align-items:center;margin-top:23rpx}.visual-flow>view{display:flex;align-items:center;flex-direction:column;gap:6rpx;min-width:73rpx;color:#dce3f1;font-size:var(--sxb-text-meta)}.visual-flow i{width:34rpx;height:34rpx;display:flex;align-items:center;justify-content:center;color:#27324b;background:#e2c476;border-radius:50%;font-size:var(--sxb-text-meta);font-style:normal;font-weight:700}.visual-flow span{height:1rpx;flex:1;background:rgba(226,196,118,.48)}.article-lead{display:flex;align-items:flex-start;gap:8rpx;margin-top:18rpx;padding:14rpx;color:#5b50a4;background:#f3f1ff;border-left:5rpx solid #7655df;border-radius:7rpx;font-size:var(--sxb-text-small);line-height:1.65}.article-section{display:block;padding-top:24rpx}.section-title{display:block;color:#223650;font-size:var(--sxb-text-body);font-weight:700}.article-paragraph{display:block;margin-top:12rpx;color:#465a73;font-size:var(--sxb-text-body);line-height:1.9;text-align:justify}.article-points{margin-top:15rpx;padding:12rpx 15rpx;background:#f7f8fb;border-radius:8rpx}.article-points>view{display:flex;align-items:flex-start;gap:8rpx;margin:7rpx 0;color:#566981;font-size:var(--sxb-text-small);line-height:1.55}.article-points i{width:7rpx;height:7rpx;flex:none;margin-top:11rpx;background:#d6a444;border-radius:50%}.article-fade{height:75rpx;margin-top:-45rpx;position:relative;z-index:1;pointer-events:none;background:linear-gradient(180deg,rgba(255,255,255,0),#fff 78%)}.article-more{position:relative;z-index:2;width:100%;height:50rpx;display:flex;align-items:center;justify-content:center;gap:5rpx;margin:8rpx 0 0;padding:0;color:#5b50b9;background:#f2f0ff;border:1rpx solid #ded9fb;border-radius:8rpx;font-size:var(--sxb-text-small);font-weight:700}.article-more::after{display:none}.article-end{display:flex;align-items:center;gap:11rpx;margin-top:24rpx;color:#9aa4b2;font-size:var(--sxb-text-meta)}.article-end span{height:1rpx;flex:1;background:#e4e8ee}

@import '@/styles/content-system.scss';
</style>
