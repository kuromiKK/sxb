<script setup lang="ts">
import CircleAction from '@/components/ui/CircleAction.vue'
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import uniIcons from '@dcloudio/uni-ui/lib/uni-icons/uni-icons.vue'
import { api, selectedExamId, showApiError } from '@/services/api'
import { getNotes, type NoteRecord, type NoteSourceType } from '@/utils/notes'
import { backOrFallback } from '@/utils/navigation'

type SelectableNote = NoteRecord & { title: string; demo?: boolean }
type GeneratedRecord = { id: string; title: string; noteCount: number; createdAt: number; result?: string }
type FilterKey = 'all' | NoteSourceType

const remaining = ref(0)
const selected = ref<string[]>([])
const generated = ref(false)
const generating = ref(false)
const resultNoteCount = ref(0)
const historyVisible = ref(false)
const exchangeVisible = ref(false)
const filter = ref<FilterKey>('all')
const labels: Record<FilterKey, string> = { all: '全部', question: '题目', knowledge: '知识点', course: '精讲课' }
const filters: FilterKey[] = ['all', 'question', 'knowledge', 'course']
const notes = ref<SelectableNote[]>([])
const generatedRecords = ref<GeneratedRecord[]>([])
async function refreshReview() {
  const data=await api(`/review/${selectedExamId()}`)
  remaining.value=data.remaining
  generatedRecords.value=data.records.map((r:any)=>({id:r.id,title:r.is_test?'【测试内容】复习资料':'我的复习资料',noteCount:r.context?.noteCount||0,createdAt:Date.parse(r.created_at),result:r.result}))
}
onLoad(() => {
  notes.value=getNotes().map((item,index)=>({...item,title:`我的笔记 ${index+1}`}))
  void refreshReview().catch(showApiError)
})
const filtered = computed(() => notes.value.filter(item => filter.value === 'all' || item.sourceType === filter.value))
const filterCount = (key: FilterKey) => key === 'all' ? notes.value.length : notes.value.filter(item => item.sourceType === key).length
const canGenerate = computed(() => selected.value.length >= 10 && selected.value.length <= 30 && remaining.value > 0)
const buttonLabel = computed(() => {
  if (remaining.value <= 0) return '生成次数已用完'
  if (selected.value.length < 10) return `还需选择 ${10 - selected.value.length} 条笔记`
  return 'AI生成复习资料'
})
const selectedNotes = computed(() => notes.value.filter(item => selected.value.includes(item.id)))

const toggle = (id: string) => {
  if (selected.value.includes(id)) {
    selected.value = selected.value.filter(item => item !== id)
    return
  }
  if (selected.value.length >= 30) {
    uni.showToast({ title: '最多选择30条笔记', icon: 'none' })
    return
  }
  selected.value = [...selected.value, id]
}

const back = () => backOrFallback('/pages/practice-tools/index?mode=note')
const headerBack = () => {
  if (generated.value) {
    generated.value = false
    return
  }
  back()
}
const generate = async () => {
  if(!canGenerate.value||generating.value)return
  generating.value=true
  try {
    const result=await api(`/review/${selectedExamId()}`,'POST',{noteIds:selected.value})
    if(result.status!=='success')throw new Error(result.error||'生成失败，请稍后重试')
    resultNoteCount.value=selectedNotes.value.length
    reviewSections.value=[{title:result.mode==='mock'?'本地测试响应':'专属复习资料',content:result.result,points:[]}]
    generated.value=true
    await refreshReview()
  }catch(error){showApiError(error)}finally{generating.value=false}
}
const regenerate = () => { generated.value = false }
const openGeneratedRecord = (record: GeneratedRecord) => {
  resultNoteCount.value = record.noteCount
  reviewSections.value=[{title:record.title,content:record.result||'',points:[]}]
  historyVisible.value = false
  generated.value = true
}

const reviewSections = ref<Array<{title:string;content:string;points:string[]}>>([])
const escapeHtml = (text:string) => text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))

const downloadFile = (url: string, name: string) => {
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  link.remove()
}

const saveAsImage = () => {
  // #ifdef H5
  const canvas = document.createElement('canvas')
  canvas.width = 1080
  canvas.height = 2200
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.fillStyle = '#f7f4ec'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#17181c'
  ctx.fillRect(0, 0, canvas.width, 285)
  const gold = '#e6ba62'
  const ink = '#26231d'
  const muted = '#6f685b'
  ctx.fillStyle = gold
  ctx.fillRect(64, 56, 10, 150)
  ctx.font = '700 28px sans-serif'
  ctx.fillText('AI REVIEW', 102, 88)
  ctx.fillStyle = '#f7e9c2'
  ctx.font = '700 50px sans-serif'
  ctx.fillText('社会工作核心知识复习资料', 102, 158)
  ctx.fillStyle = '#cdbd98'
  ctx.font = '28px sans-serif'
  ctx.fillText(`引用 ${resultNoteCount.value} 条笔记 · 根据实际笔记生成`, 102, 213)

  const wrapText = (text: string, x: number, y: number, maxWidth: number, lineHeight: number) => {
    let line = ''
    for (const char of text) {
      const test = line + char
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, x, y)
        line = char
        y += lineHeight
      } else line = test
    }
    if (line) ctx.fillText(line, x, y)
    return y + lineHeight
  }

  let y = 365
  reviewSections.value.forEach(section => {
    ctx.fillStyle = gold
    ctx.fillRect(64, y - 35, 8, 44)
    ctx.fillStyle = ink
    ctx.font = '700 36px sans-serif'
    ctx.fillText(section.title, 94, y)
    y += 58
    if (section.content) {
      ctx.fillStyle = muted
      ctx.font = '29px sans-serif'
      y = wrapText(section.content, 94, y, 900, 50) + 12
    }
    section.points.forEach(point => {
      ctx.fillStyle = gold
      ctx.beginPath()
      ctx.arc(103, y - 9, 5, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = muted
      ctx.font = '28px sans-serif'
      y = wrapText(point, 126, y, 860, 46)
    })
    y += 42
  })
  ctx.fillStyle = '#9b917c'
  ctx.font = '24px sans-serif'
  ctx.fillText(`上行宝 · 生成于 ${new Date().toLocaleDateString()}`, 64, canvas.height - 65)
  const dataUrl = canvas.toDataURL('image/png')
  const binary = atob(dataUrl.split(',')[1])
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  const url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }))
  downloadFile(url, `上行宝-AI复习资料-${Date.now()}.png`)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  uni.showToast({ title: '复习资料图片已保存', icon: 'none' })
  // #endif
  // #ifndef H5
  uni.showToast({ title: '当前端暂不支持保存图片', icon: 'none' })
  // #endif
}

const saveAsPdf = () => {
  // #ifdef H5
  const content = reviewSections.value.map(section => `<section><h2>${escapeHtml(section.title)}</h2>${section.content ? `<p>${escapeHtml(section.content)}</p>` : ''}${section.points.length ? `<ul>${section.points.map(point => `<li>${escapeHtml(point)}</li>`).join('')}</ul>` : ''}</section>`).join('')
  const printWindow = window.open('', '_blank')
  if (!printWindow) {
    uni.showToast({ title: '请允许浏览器打开打印窗口', icon: 'none' })
    return
  }
  printWindow.document.write(`<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><title>社会工作核心知识复习资料</title><style>@page{size:A4;margin:18mm}*{box-sizing:border-box}body{margin:0;color:#28241d;font-family:-apple-system,BlinkMacSystemFont,"Microsoft YaHei",sans-serif}.hero{padding:26px 30px;color:#f7e9c2;background:linear-gradient(135deg,#17181c,#3b2b15 55%,#17181c);border:1px solid #7f5d24}.hero small{color:#e6ba62;font-weight:700}.hero h1{margin:12px 0 8px;font-size:27px}.hero p{margin:0;color:#d8c69d}.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:18px 0}.stats div{padding:12px;text-align:center;background:#f5eedc}.stats b{display:block;color:#9c7420;font-size:22px}.stats span{color:#756d5e;font-size:13px}section{padding:17px 0;border-top:1px solid #e7dfcf;break-inside:avoid}h2{margin:0 0 10px;font-size:20px}p,li{color:#5e574c;font-size:15px;line-height:1.8}ul{margin:8px 0;padding-left:24px}footer{margin-top:24px;color:#938a78;font-size:12px;text-align:center}</style></head><body><div class="hero"><small>AI REVIEW</small><h1>社会工作核心知识复习资料</h1><p>AI根据所选笔记整理</p></div><div class="stats"><div><b>${resultNoteCount.value}</b><span>引用笔记</span></div><div><b>4</b><span>复习专题</span></div><div><b>8</b><span>重点内容</span></div></div>${content}<footer>上行宝 · 生成于 ${new Date().toLocaleDateString()}</footer><script>window.onload=()=>setTimeout(()=>window.print(),200)<\/script></body></html>`)
  printWindow.document.close()
  // #endif
  // #ifndef H5
  uni.showToast({ title: '当前端暂不支持保存PDF', icon: 'none' })
  // #endif
}
</script>

<template>
  <view class="ai-page page safe-top">
    <view class="top-bar">
      <CircleAction class="back-button" @tap="headerBack" tone="light"/>
      <text>AI生成复习资料</text>
      <view />
    </view>

    <template v-if="!generated">
      <view class="premium-hero">
        <view class="hero-pattern" />
        <view class="hero-head">
          <view class="service-mark"><uni-icons type="paperplane" size="17" color="#1b1811" /><text>AI STUDY</text></view>
          <button @tap="historyVisible = true"><uni-icons type="bars" size="17" color="#efd586" /><text>已生成资料</text></button>
        </view>
        <view class="hero-title">
          <text>让笔记成为你的复习资料</text>
          <text>选择10～30条笔记，AI为你提炼重点、易错辨析和复习清单</text>
        </view>
        <view class="hero-data">
          <view><text>{{ remaining }}</text><text>剩余次数</text></view>
          <view><text>{{ generatedRecords.length }}</text><text>已生成资料</text></view>
        </view>
        <view class="hero-foot">
          <text>每次生成消耗 1 次</text>
          <button @tap="exchangeVisible = true"><uni-icons type="gift" size="17" color="#1c1810" /><text>获取次数</text></button>
        </view>
      </view>

      <view class="selection-panel">
        <view class="selection-head">
          <view><text>选择笔记</text><text>按内容类型筛选</text></view>
          <text>10～30条</text>
        </view>
        <view class="filter-segments">
          <view v-for="key in filters" :key="key" :class="{ active: filter === key }" @tap="filter = key">
            <text>{{ labels[key] }}</text>
            <text>{{ filterCount(key) }}</text>
          </view>
        </view>
      </view>

      <view class="note-list">
        <view v-for="item in filtered" :key="item.id" class="note-row" :class="{ selected: selected.includes(item.id) }" @tap="toggle(item.id)">
          <view class="check"><uni-icons v-if="selected.includes(item.id)" type="checkmarkempty" size="16" color="#1b1811" /></view>
          <view class="note-content">
            <text class="note-type">{{ labels[item.sourceType] }}</text>
            <text class="note-title">{{ item.title }}</text>
            <text class="note-excerpt">{{ item.content }}</text>
          </view>
        </view>
      </view>

      <view class="bottom-bar">
        <button class="generate-button" :disabled="!canGenerate || generating" @tap="generate">
          <view class="button-count"><text>{{ selected.length }}</text><text>条已选择</text></view>
          <view class="button-action">
            <uni-icons v-if="generating" type="spinner-cycle" size="19" color="#17140e" />
            <text>{{ generating ? 'AI整理中...' : buttonLabel }}</text>
            <uni-icons v-if="canGenerate && !generating" type="forward" size="19" color="#17140e" />
          </view>
        </button>
      </view>
    </template>

    <template v-else>
      <view class="result-hero">
        <view class="result-icon"><uni-icons type="checkmarkempty" size="28" color="#1b1811" /></view>
        <view><text>复习资料已生成</text><text>本次使用 {{ resultNoteCount }} 条笔记 · 剩余 {{ remaining }} 次</text></view>
      </view>
      <view class="report">
        <view class="report-title"><text>社会工作核心知识复习资料</text><text>AI根据所选笔记整理</text></view>
        <view class="report-section" v-for="(section,index) in reviewSections" :key="index">
          <text>{{ section.title }}</text>
          <text style="white-space:pre-wrap">{{ section.content }}</text>
          <view v-if="section.points.length"><text v-for="point in section.points" :key="point">{{ point }}</text></view>
        </view>
      </view>
      <view class="export-actions">
        <button @tap="saveAsImage"><uni-icons type="image" size="19" color="#9b6c18" />保存图片</button>
        <button @tap="saveAsPdf"><uni-icons type="download" size="19" color="#9b6c18" />保存PDF</button>
      </view>
      <view class="result-actions"><button @tap="regenerate">重新选择笔记</button><button @tap="back">返回</button></view>
    </template>

    <view v-if="historyVisible" class="overlay" @tap.self="historyVisible = false">
      <view class="history-sheet">
        <view class="sheet-head">
          <view><text>已生成资料</text><text>{{ generatedRecords.length }} 份复习资料</text></view>
          <button @tap="historyVisible = false"><uni-icons type="closeempty" size="20" color="#c7a953" /></button>
        </view>
        <view v-if="generatedRecords.length" class="history-list">
          <view v-for="item in generatedRecords" :key="item.id" @tap="openGeneratedRecord(item)">
            <view class="history-icon"><uni-icons type="compose" size="20" color="#d7b85c" /></view>
            <view><text>{{ item.title }}</text><text>{{ item.noteCount }}条笔记 · {{ new Date(item.createdAt).toLocaleString() }}</text></view>
            <uni-icons type="forward" size="18" color="#aa904b" />
          </view>
        </view>
        <view v-else class="history-empty">还没有生成复习资料</view>
      </view>
    </view>

    <view v-if="exchangeVisible" class="overlay centered" @tap.self="exchangeVisible = false">
      <view class="exchange-dialog sxb-dialog">
        <view class="exchange-icon"><uni-icons type="gift" size="28" color="#1b1811" /></view>
        <text>获取生成次数</text>
        <text>后续可通过积分或会员权益兑换AI复习资料生成次数，具体兑换规则将在增值服务方案确定后开放。</text>
        <button class="sxb-dialog-action" @tap="exchangeVisible = false">我知道了</button>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.ai-page { max-width:430px; min-height:100vh; margin:0 auto; box-sizing:border-box; padding-top:calc(env(safe-area-inset-top) + 18rpx); padding-bottom:142px; color:#27241e; background:#f4f2ed; }
button::after { display:none; }
.top-bar { min-height:62rpx; display:grid; grid-template-columns:62rpx 1fr 62rpx; align-items:center; gap:8rpx; }
.top-bar>text { color:#1d1b17; font-size:var(--sxb-text-title); font-weight:700; text-align:center; }
.back-button { width:58rpx; height:58rpx; display:flex; align-items:center; justify-content:center; margin:0; padding:0; background:#1b1a17; border-radius:10rpx; }
.premium-hero { position:relative; overflow:hidden; margin-top:19rpx; padding:20rpx; color:#f6d78c; background:linear-gradient(135deg,#17181c 0%,#3b2b15 55%,#17181c 100%); border:1rpx solid #7f5d24; border-radius:12rpx; box-shadow:0 12rpx 28rpx rgba(18,18,20,.18); }
.hero-pattern { position:absolute; inset:0; opacity:.72; background-image:radial-gradient(circle at 88% 12%,rgba(220,176,88,.3) 0 2rpx,transparent 3rpx),linear-gradient(118deg,transparent 0 61%,rgba(220,176,88,.09) 61% 62%,transparent 62% 68%,rgba(255,255,255,.035) 68% 69%,transparent 69%); }
.premium-hero>view:not(.hero-pattern) { position:relative; z-index:1; }
.hero-head,.hero-foot { display:flex; align-items:center; justify-content:space-between; }
.service-mark { height:38rpx; display:flex; align-items:center; gap:6rpx; box-sizing:border-box; padding:0 10rpx; color:#1b1811; background:linear-gradient(120deg,#e4c36c,#f4dfa0); border-radius:5rpx; font-size:var(--sxb-text-meta); font-weight:700; }
.hero-head>button { width:auto; height:43rpx; display:flex; align-items:center; justify-content:center; gap:5rpx; margin:0; padding:0 12rpx; color:#efd586; background:rgba(231,201,114,.08); border:1rpx solid rgba(231,201,114,.42); border-radius:7rpx; font-size:var(--sxb-text-meta); font-weight:700; }
.hero-title { margin-top:22rpx; }
.hero-title>text { display:block; }
.hero-title>text:first-child { color:#f7e9c2; font-size:var(--sxb-text-title); line-height:1.35; font-weight:700; }
.hero-title>text:last-child { max-width:94%; margin-top:8rpx; color:#f3dca4; font-size:var(--sxb-text-meta); line-height:1.55; }
.hero-data { display:grid; grid-template-columns:repeat(2,1fr); margin-top:22rpx; padding:16rpx 0; background:rgba(255,255,255,.035); border-top:1rpx solid rgba(236,206,121,.24); border-bottom:1rpx solid rgba(236,206,121,.24); }
.hero-data>view { display:flex; align-items:center; flex-direction:column; gap:6rpx; }
.hero-data>view:first-child { border-right:1rpx solid rgba(236,206,121,.25); }
.hero-data text:first-child { color:#e6ba62; font-size:var(--sxb-text-heading); line-height:1; font-weight:700; }
.hero-data text:last-child { color:#f3dca4; font-size:var(--sxb-text-meta); }
.hero-foot { margin-top:15rpx; }
.hero-foot>text { color:#e2d8bf; font-size:var(--sxb-text-meta); font-weight:700; }
.hero-foot button { width:auto; height:43rpx; display:flex; align-items:center; justify-content:center; gap:5rpx; margin:0; padding:0 13rpx; color:#1c1810; background:linear-gradient(120deg,#dfbd60,#f2db96); border-radius:7rpx; font-size:var(--sxb-text-meta); font-weight:700; }
.selection-panel { margin-top:18rpx; padding:18rpx; background:#fff; border:1rpx solid #ddd7c9; border-radius:10rpx; box-shadow:0 8rpx 20rpx rgba(44,39,27,.05); }
.selection-head { display:flex; align-items:center; justify-content:space-between; }
.selection-head>view { display:flex; align-items:baseline; gap:9rpx; }
.selection-head>view text:first-child { color:#211f1a; font-size:var(--sxb-text-body); font-weight:700; }
.selection-head>view text:last-child { color:#8b8374; font-size:var(--sxb-text-meta); }
.selection-head>text { color:#9c7625; font-size:var(--sxb-text-meta); font-weight:700; }
.filter-segments { display:grid; grid-template-columns:repeat(4,1fr); gap:7rpx; margin-top:15rpx; }
.filter-segments>view { height:58rpx; display:flex; align-items:center; justify-content:center; gap:5rpx; color:#6d675c; background:#f1eee7; border:1rpx solid transparent; border-radius:7rpx; font-size:var(--sxb-text-meta); }
.filter-segments>view>text:last-child { min-width:25rpx; color:#989080; font-size:var(--sxb-text-meta); text-align:center; }
.filter-segments>view.active { color:#f2d783; background:#1b1a17; border-color:#5e512e; font-weight:700; }
.filter-segments>view.active>text:last-child { color:#dac274; }
.note-list { overflow:hidden; margin-top:13rpx; background:#fff; border:1rpx solid #ddd7c9; border-radius:10rpx; }
.note-row { display:flex; align-items:center; gap:12rpx; padding:17rpx 16rpx; border-bottom:1rpx solid #eeeae1; }
.note-row:last-child { border-bottom:0; }
.note-row.selected { background:#fbf7e9; }
.check { width:36rpx; height:36rpx; display:flex; align-items:center; justify-content:center; flex:none; box-sizing:border-box; border:2rpx solid #beb6a6; border-radius:50%; }
.selected .check { background:#e2c46e; border-color:#caa84d; }
.note-content { flex:1; min-width:0; }
.note-type { display:inline-block; padding:2rpx 7rpx; color:#8a681f; background:#f7eed2; border-radius:4rpx; font-size:var(--sxb-text-meta); font-weight:700; }
.note-title,.note-excerpt { display:block; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
.note-title { margin-top:5rpx; color:#292720; font-size:var(--sxb-text-body); line-height:1.5; font-weight:700; }
.note-excerpt { margin-top:4rpx; color:#858075; font-size:var(--sxb-text-meta); }
.bottom-bar { position:fixed; z-index:20; left:50%; bottom:0; width:100%; max-width:430px; box-sizing:border-box; padding:13rpx 20px calc(13rpx + env(safe-area-inset-bottom)); transform:translateX(-50%); background:rgba(244,242,237,.96); border-top:1rpx solid #d8d1c1; box-shadow:0 -10rpx 28rpx rgba(38,33,21,.13); backdrop-filter:blur(10px); }
.generate-button { width:100%; height:91rpx; display:grid; grid-template-columns:124rpx 1fr; align-items:center; margin:0; padding:0 18rpx; color:#19160f; background:linear-gradient(120deg,#d7b34f,#f3dc96 55%,#d5ad43); border:1rpx solid #c59e37; border-radius:10rpx; line-height:normal; box-shadow:0 9rpx 20rpx rgba(137,102,21,.22); }
.generate-button[disabled] { color:#7f7a70; background:#d9d5cc; border-color:#cbc5b9; box-shadow:none; }
.button-count { display:flex; align-items:baseline; justify-content:flex-start; gap:5rpx; border-right:1rpx solid rgba(40,33,16,.2); }
.button-count text:first-child { font-size:var(--sxb-text-heading); line-height:1; font-weight:700; }
.button-count text:last-child { font-size:var(--sxb-text-meta); font-weight:700; }
.button-action { display:flex; align-items:center; justify-content:center; gap:6rpx; min-width:0; }
.button-action text { font-size:var(--sxb-text-body); font-weight:700; }
.result-hero { display:flex; align-items:center; gap:13rpx; margin-top:19rpx; padding:20rpx; color:#f6d78c; background:linear-gradient(135deg,#17181c,#3b2b15 55%,#17181c); border:1rpx solid #7f5d24; border-radius:11rpx; box-shadow:0 12rpx 28rpx rgba(18,18,20,.18); }
.result-icon { width:58rpx; height:58rpx; display:flex; align-items:center; justify-content:center; flex:none; background:linear-gradient(135deg,#e2c36b,#f2dc98); border-radius:10rpx; }
.result-hero>view:last-child { display:flex; flex-direction:column; gap:6rpx; }
.result-hero>view:last-child text:first-child { color:#fff8e8; font-size:var(--sxb-text-item); font-weight:700; }
.result-hero>view:last-child text:last-child { color:#cfc5ae; font-size:var(--sxb-text-meta); }
.report { margin-top:14rpx; padding:20rpx; background:#fff; border:1rpx solid #ded7c8; border-radius:10rpx; }
.report-title { display:flex; flex-direction:column; gap:5rpx; }
.report-title text:first-child { color:#242119; font-size:var(--sxb-text-item); font-weight:700; }
.report-title text:last-child { color:#918877; font-size:var(--sxb-text-meta); }
.report-stats { display:grid; grid-template-columns:repeat(3,1fr); gap:8rpx; margin-top:17rpx; }
.report-stats view { display:flex; align-items:center; flex-direction:column; gap:4rpx; padding:12rpx 5rpx; background:#f6f1e4; border-radius:7rpx; }
.report-stats text:first-child { color:#9c7420; font-size:var(--sxb-text-item); font-weight:700; }
.report-stats text:last-child { color:#756d5e; font-size:var(--sxb-text-meta); }
.report-section { margin-top:21rpx; padding-top:19rpx; border-top:1rpx solid #e9e3d7; }
.report-section>text:first-child { display:block; color:#28241b; font-size:var(--sxb-text-body); font-weight:700; }
.report-section>text:nth-child(2) { display:block; margin-top:9rpx; color:#5f594f; font-size:var(--sxb-text-small); line-height:1.72; }
.report-section>view { display:flex; flex-direction:column; gap:8rpx; margin-top:12rpx; }
.report-section>view>text { position:relative; padding-left:18rpx; color:#686154; font-size:var(--sxb-text-meta); line-height:1.55; }
.report-section>view>text::before { position:absolute; left:2rpx; top:11rpx; width:6rpx; height:6rpx; content:''; background:#b98a28; border-radius:50%; }
.report-section .warning { display:flex; align-items:flex-start; flex-direction:row; gap:7rpx; padding:11rpx; color:#80601e; background:#fbf3da; border-radius:7rpx; }
.report-section .warning>text { padding-left:0; }
.report-section .warning>text::before { display:none; }
.export-actions { display:grid; grid-template-columns:1fr 1fr; gap:10rpx; margin-top:14rpx; }
.export-actions button { height:59rpx; display:flex; align-items:center; justify-content:center; gap:6rpx; margin:0; color:#8b631a; background:#f7efd8; border:1rpx solid #ead9a9; border-radius:8rpx; font-size:var(--sxb-text-small); font-weight:700; }
.result-actions { position:fixed; z-index:20; left:50%; bottom:0; width:100%; max-width:430px; box-sizing:border-box; display:grid; grid-template-columns:1fr 1.35fr; gap:10rpx; padding:12rpx 20px calc(12rpx + env(safe-area-inset-bottom)); transform:translateX(-50%); background:rgba(244,242,237,.97); border-top:1rpx solid #d8d1c1; box-shadow:0 -10rpx 28rpx rgba(38,33,21,.13); backdrop-filter:blur(10px); }
.result-actions button { height:62rpx; margin:0; color:#7d5b15; background:#f5ecd1; border-radius:8rpx; font-size:var(--sxb-text-small); font-weight:700; }
.result-actions button:last-child { color:#f6d78c; background:linear-gradient(135deg,#17181c,#3b2b15 55%,#17181c); border:1rpx solid #7f5d24; }
.overlay { position:fixed; z-index:80; inset:0; display:flex; align-items:flex-end; justify-content:center; background:rgba(6,6,5,.72); }
.overlay.centered { align-items:center; }
.history-sheet { width:100%; max-width:430px; max-height:74vh; overflow-y:auto; box-sizing:border-box; padding:20rpx 20px calc(22rpx + env(safe-area-inset-bottom)); color:#f6d78c; background:linear-gradient(135deg,#17181c,#3b2b15 130%); border-top:1rpx solid #7f5d24; border-radius:14rpx 14rpx 0 0; }
.sheet-head { display:flex; align-items:center; justify-content:space-between; }
.sheet-head>view { display:flex; flex-direction:column; gap:4rpx; }
.sheet-head>view text:first-child { color:#fff7e5; font-size:var(--sxb-text-item); font-weight:700; }
.sheet-head>view text:last-child { color:#a99f89; font-size:var(--sxb-text-meta); }
.sheet-head button { width:42rpx; height:42rpx; display:flex; align-items:center; justify-content:center; margin:0; padding:0; background:#28251d; border-radius:50%; }
.history-list { margin-top:16rpx; border-top:1rpx solid #373226; }
.history-list>view { display:flex; align-items:center; gap:11rpx; padding:16rpx 0; border-bottom:1rpx solid #373226; }
.history-icon { width:45rpx; height:45rpx; display:flex; align-items:center; justify-content:center; flex:none; background:#29251b; border:1rpx solid #66562e; border-radius:8rpx; }
.history-list>view>view:nth-child(2) { display:flex; flex:1; min-width:0; flex-direction:column; gap:5rpx; }
.history-list>view>view:nth-child(2) text:first-child { overflow:hidden; color:#f3ecd9; font-size:var(--sxb-text-small); font-weight:700; white-space:nowrap; text-overflow:ellipsis; }
.history-list>view>view:nth-child(2) text:last-child { color:#a79d88; font-size:var(--sxb-text-meta); }
.history-empty { padding:58rpx 0; color:#a79d88; font-size:var(--sxb-text-meta); text-align:center; }
.exchange-dialog { width:calc(100% - 54px); max-width:350px; box-sizing:border-box; display:flex; align-items:center; flex-direction:column; padding:27rpx; color:#f6d78c; background:linear-gradient(135deg,#17181c,#3b2b15 120%); border:1rpx solid #7f5d24; border-radius:12rpx; box-shadow:0 25rpx 60rpx rgba(0,0,0,.35); }
.exchange-icon { width:66rpx; height:66rpx; display:flex; align-items:center; justify-content:center; background:linear-gradient(145deg,#d4ae47,#f0d98e); border-radius:12rpx; }
.exchange-dialog>text:nth-child(2) { margin-top:15rpx; color:#fff6df; font-size:var(--sxb-text-item); font-weight:700; }
.exchange-dialog>text:nth-child(3) { margin-top:10rpx; color:#bbb19c; font-size:var(--sxb-text-meta); line-height:1.65; text-align:center; }
.exchange-dialog button { width:100%; height:58rpx; margin:20rpx 0 0; color:#1a1710; background:linear-gradient(120deg,#d8b655,#efd68c); border-radius:8rpx; font-size:var(--sxb-text-small); font-weight:700; }

@import '@/styles/content-system.scss';
</style>
