<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { CourseLesson } from '@/mock/data'
const props = defineProps<{ course: CourseLesson; compact?: boolean }>()
const failed = ref(false)
watch(() => props.course.coverUrl, () => { failed.value = false })
const cover = computed(() => {
  const url = props.course.coverUrl || ''
  const base = import.meta.env.VITE_API_BASE || '/api'
  return url.startsWith('/api/') ? base.replace(/\/$/, '') + url.slice(4) : url
})
const names = { video: '视频课', audio: '音频课', article: '图文课' }
</script>
<template>
  <view class="course-cover" :class="[course.type, { compact }]">
    <view v-if="!cover || failed" class="cover-art" aria-hidden="true">
      <view class="art-orbit"></view><view class="art-orbit orbit-two"></view>
      <view class="art-copy"><text class="art-kicker">上行宝 · 精讲</text><text class="art-title">{{ course.type === 'audio' ? '听懂每个考点' : course.type === 'article' ? '把知识读透' : '让知识更清晰' }}</text></view>
      <image class="art-symbol" :src="'/static/icons/course-' + course.type + '.svg'" mode="aspectFit" />
    </view>
    <image v-else class="cover-image" :src="cover" mode="aspectFill" lazy-load :alt="course.title || course.sectionName" @error="failed = true" />
    <view v-if="!compact" class="cover-caption"><text>{{ names[course.type] }}</text><text v-if="course.type !== 'article' && course.totalMinutes > 0">{{ course.totalMinutes }} 分钟</text><text v-else-if="course.type === 'article'">阅读</text></view>
  </view>
</template>
<style scoped>
.course-cover{position:relative;width:100%;padding-top:56.25%;overflow:hidden;border-radius:14px;background:#dbe9fb;isolation:isolate}
.cover-image,.cover-art{position:absolute;inset:0;width:100%;height:100%}
.cover-art{overflow:hidden;background:linear-gradient(125deg,#dcecff,#b2cef2);color:#284f85}
.audio .cover-art{background:linear-gradient(125deg,#dcf0ed,#a7d7d0);color:#24625d}
.article .cover-art{background:linear-gradient(125deg,#f7eedd,#ead6b5);color:#745431}
.art-copy{position:absolute;left:11px;top:13px;z-index:1;display:flex;flex-direction:column;gap:8px}
.art-kicker{font-size:9px;letter-spacing:1px;opacity:.85}.art-title{font-size:14px;font-weight:750;letter-spacing:.5px}
.art-symbol{position:absolute;width:60px;height:60px;right:5px;bottom:17px;transform:rotate(-12deg);opacity:.65}
.art-orbit{position:absolute;width:130px;height:130px;border:1px solid #ffffff75;border-radius:50%;right:-43px;top:-49px}.orbit-two{width:170px;height:170px;right:-63px;top:-69px}
.cover-caption{position:absolute;bottom:0;left:0;right:0;display:flex;align-items:center;justify-content:space-between;padding:16px 9px 7px;color:white;background:linear-gradient(transparent,rgba(17,33,54,.7));font-size:12px;line-height:1.4;gap:4px}
.compact{width:46px;height:46px;padding:0;border-radius:12px;flex:none}.compact .art-copy{display:none}.compact .art-symbol{width:35px;height:35px;right:4px;bottom:5px}
</style>
