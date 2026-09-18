<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { onShow, onHide, onUnload, onPageScroll } from '@dcloudio/uni-app'
import uniIcons from '@dcloudio/uni-ui/lib/uni-icons/uni-icons.vue'
import AppTabBar from '@/components/AppTabBar.vue'
import ScrollTabs from '@/components/ui/ScrollTabs.vue'
import SlidePanel from '@/components/ui/SlidePanel.vue'
import { knowledgeSubjects, courseCatalog, practiceQuestions, type KnowledgeSubject, type KnowledgePoint } from '@/mock/data'
import { useAppStore } from '@/store/app'
import { selectedExamId, refreshPersonalData, token } from '@/services/api'
import { refreshCatalog } from '@/services/catalog'
import { learningReady } from '@/utils/learning-bootstrap'

const { state, exam } = useAppStore()
type DirectoryState = { subjectId: string; chapters: Record<string, string>; collapsed: Record<string, boolean>; scrollTop: number }
const blankState = (): DirectoryState => ({ subjectId: '', chapters: {}, collapsed: {}, scrollTop: 0 })
const selection = ref<DirectoryState>(blankState())
const subjects = ref<KnowledgeSubject[]>([])
const coursePoints = ref<string[]>([])
const mastery = ref<Record<string, number>>({})
const loadedExam = ref('')
const busy = ref(true)
const error = ref('')
let requestVersion = 0
let pageScroll = 0
let restoring = false
const subject = computed(() => subjects.value.find(s => s.id === selection.value.subjectId))
const chapters = computed(() => subject.value?.chapters || [])
const chapter = computed(() => chapters.value.find(c => c.id === selection.value.chapters[selection.value.subjectId]))
const direction = ref<'next' | 'previous'>('next')
const subjectOptions = computed(() => subjects.value.map(s => ({ id: s.id, label: s.shortTitle?.trim() || s.name, caption: masteryText(s.id) })))
const chapterOptions = computed(() => chapters.value.map((c, i) => ({ id: c.id, label: '第' + chapterNumber(i) + '章' })))
const pointCount = computed(() => chapter.value?.sections.reduce((sum, section) => sum + section.points.length, 0) || 0)
const cacheKey = (id: string) => 'sxb-knowledge-directory-' + id
const masteryText = (id: string) => '掌握 ' + (mastery.value[id] || 0) + '%'
const chapterNumber = (index: number) => {
  const digits = ['零','一','二','三','四','五','六','七','八','九']
  const n = index + 1
  if (n < 10) return digits[n]
  if (n < 100) return (n >= 20 ? digits[Math.floor(n / 10)] : '') + '十' + (n % 10 ? digits[n % 10] : '')
  return String(n)
}
const chapterTitle = computed(() => {
  if (!chapter.value) return ''
  const prefix = '第' + chapterNumber(chapters.value.findIndex(c => c.id === chapter.value?.id)) + '章'
  return prefix + ' ' + chapter.value.name.replace(/^第[零〇一二三四五六七八九十百千\d]+章\s*[、：:.．-]?\s*/, '')
})
const stars = (point: KnowledgePoint) => Math.max(0, Math.min(5, Math.round(Number(point.stars) || 0)))
function saveSelection() {
  if (!loadedExam.value || busy.value) return
  uni.setStorageSync(cacheKey(loadedExam.value), { ...selection.value, scrollTop: pageScroll })
}
function readSelection(id: string): DirectoryState {
  const saved = uni.getStorageSync(cacheKey(id))
  if (!saved || typeof saved !== 'object') return blankState()
  return {
    subjectId: typeof saved.subjectId === 'string' ? saved.subjectId : '',
    chapters: saved.chapters && typeof saved.chapters === 'object' ? saved.chapters : {},
    collapsed: saved.collapsed && typeof saved.collapsed === 'object' ? saved.collapsed : {},
    scrollTop: Math.max(0, Number(saved.scrollTop) || 0),
  }
}
function normalizeSelection() {
  if (!subjects.value.some(s => s.id === selection.value.subjectId)) selection.value.subjectId = subjects.value[0]?.id || ''
  for (const s of subjects.value) {
    if (!s.chapters.some(c => c.id === selection.value.chapters[s.id])) selection.value.chapters[s.id] = s.chapters[0]?.id || ''
  }
}
async function loadDirectory() {
  const version = ++requestVersion
  busy.value = true
  error.value = ''
  try {
    await learningReady
    if (version !== requestVersion) return
    const id = selectedExamId()
    await refreshCatalog()
    await refreshPersonalData()
    if (version !== requestVersion || id !== selectedExamId()) return
    subjects.value = JSON.parse(JSON.stringify(knowledgeSubjects))
    coursePoints.value = [...new Set(courseCatalog.map(c => c.knowledgePointId).filter((p): p is string => Boolean(p)))]
    // Keep the existing mastery definition: latest correct answers / distinct objective questions.
    // Do not average point percentages: one question can belong to several knowledge points.
    const answered = token() ? uni.getStorageSync('sxb-answered-' + id) || {} : {}
    const nextMastery: Record<string, number> = {}
    for (const s of subjects.value) {
      for (const group of [{ id: s.id, chapters: s.chapters }, ...s.chapters.map(c => ({ id: c.id, chapters: [c] }))]) {
        const ids = new Set(group.chapters.flatMap(c => c.sections.flatMap(t => t.points.map(p => p.id))))
        const questions = practiceQuestions.filter(q => (q.knowledgePointIds || [q.knowledgePointId]).some(p => ids.has(p)))
        nextMastery[group.id] = questions.length ? Math.round(questions.filter(q => answered[q.id] === 'correct').length / questions.length * 100) : 0
      }
    }
    mastery.value = nextMastery
    selection.value = readSelection(id)
    loadedExam.value = id
    normalizeSelection()
    pageScroll = selection.value.scrollTop
    busy.value = false
    restoring = true
    await nextTick()
    uni.pageScrollTo({ scrollTop: pageScroll, duration: 0, complete: () => { restoring = false } })
  } catch (e) {
    if (version !== requestVersion) return
    error.value = e instanceof Error ? e.message : '目录加载失败，请重试'
    busy.value = false
  }
}
function selectSubject(id: string) {
  if (id === selection.value.subjectId) return
  direction.value = subjects.value.findIndex(s => s.id === id) > subjects.value.findIndex(s => s.id === selection.value.subjectId) ? 'next' : 'previous'
  selection.value.subjectId = id
  normalizeSelection()
  saveSelection()
}
function selectChapter(id: string) {
  if (id === chapter.value?.id) return
  direction.value = chapters.value.findIndex(c => c.id === id) > chapters.value.findIndex(c => c.id === chapter.value?.id) ? 'next' : 'previous'
  selection.value.chapters[selection.value.subjectId] = id
  saveSelection()
}
function stepChapter(step: number) {
  const next = chapters.value[chapters.value.findIndex(c => c.id === chapter.value?.id) + step]
  if (next) selectChapter(next.id)
}
function toggleSection(id: string) {
  selection.value.collapsed[id] = !selection.value.collapsed[id]
  saveSelection()
}
function openDetail(point: KnowledgePoint) {
  saveSelection()
  uni.navigateTo({ url: '/pages/knowledge-detail/index?id=' + encodeURIComponent(point.id) })
}
onShow(() => { state.selectedTab = 1; void loadDirectory() })
onPageScroll(event => { if (!restoring) pageScroll = event.scrollTop })
onHide(() => { saveSelection(); requestVersion += 1 })
onUnload(() => { saveSelection(); requestVersion += 1 })
</script>

<template>
  <view class="knowledge-page page">
    <view class="knowledge-header">
      <view class="header-copy">
        <text class="page-heading">知识图谱</text>
        <text class="exam-name">{{ exam.name }}</text>
        <view v-if="exam.daysLeft > 0" class="exam-countdown"><uni-icons type="calendar" size="13" color="#54739b" aria-hidden="true" /><text>距考试</text><text class="days">{{ exam.daysLeft }}</text><text>天</text></view>
      </view>
      <image class="header-illustration" src="/static/illustrations/knowledge-books.svg" mode="aspectFit" aria-hidden="true" :draggable="false" />
    </view>
    <view class="directory-sheet">
    <view v-if="busy" class="directory-state" role="status"><view class="loading-line"></view><text>正在加载目录…</text></view>
    <view v-else-if="error" class="directory-state" role="alert"><text>{{ error }}</text><button role="button" tabindex="0" @tap="loadDirectory" @keydown.enter.prevent="loadDirectory">重新加载</button></view>
    <template v-else-if="subjects.length">
      <view class="directory-navigation">
        <ScrollTabs :items="subjectOptions" :model-value="selection.subjectId" label="选择科目" item-class="subject-tab" @update:model-value="selectSubject" />
        <SlidePanel :panel-key="selection.subjectId" :direction="direction">
          <view v-if="chapters.length" class="chapter-navigation"><ScrollTabs :key="selection.subjectId" :items="chapterOptions" :model-value="chapter?.id || ''" label="选择章节" variant="compact" item-class="chapter-tab" @update:model-value="selectChapter" /></view>
        </SlidePanel>
      </view>
      <SlidePanel :panel-key="selection.subjectId + ':' + chapter?.id" :direction="direction" @next="stepChapter(1)" @previous="stepChapter(-1)">
      <view v-if="chapter" class="chapter-content">
        <view class="chapter-heading">
          <text class="chapter-title">{{ chapterTitle }}</text>
          <view class="chapter-summary"><text>{{ chapter.sections.length }} 节<text class="summary-dot">·</text>{{ pointCount }} 个知识点</text><text class="chapter-mastery">{{ masteryText(chapter.id) }}</text></view>
          <view class="mastery-track" role="progressbar" aria-label="本章掌握程度" :aria-valuenow="mastery[chapter.id] || 0" :aria-valuemin="0" :aria-valuemax="100"><view :style="{ width: (mastery[chapter.id] || 0) + '%' }"></view></view>
        </view>
        <view class="section-list">
          <view v-for="(section, index) in chapter.sections" :key="section.id" class="section-card">
            <button class="section-heading" role="button" tabindex="0" :aria-expanded="!selection.collapsed[section.id]"
              @tap="toggleSection(section.id)" @keydown.enter.prevent="toggleSection(section.id)" @keydown.space.prevent="toggleSection(section.id)">
              <view class="section-label"><text class="section-number">{{ String(index + 1).padStart(2, '0') }}</text><text class="section-name">{{ section.name }}</text></view>
              <view class="section-count"><text>{{ section.points.length }} 个知识点</text><uni-icons :type="selection.collapsed[section.id] ? 'down' : 'up'" size="15" color="#7a8493" aria-hidden="true" /></view>
            </button>
            <view v-if="!selection.collapsed[section.id]" class="point-list">
              <button v-for="point in section.points" :key="point.id" class="point-row" role="button" tabindex="0"
                @tap="openDetail(point)" @keydown.enter.prevent="openDetail(point)" @keydown.space.prevent="openDetail(point)">
                <view class="point-copy"><text class="point-title">{{ point.title }}</text>
                  <view class="point-meta">
                    <view class="point-stars" role="img" :aria-label="stars(point) + '星知识点'"><uni-icons v-for="n in 5" :key="n" type="star-filled" size="13" :color="n <= stars(point) ? '#b98b43' : '#dce0e6'" aria-hidden="true" /></view>
                    <text class="question-count">共 {{ point.questionTotal || 0 }} 题</text>
                    <view v-if="coursePoints.includes(point.id)" class="course-marker"><uni-icons type="videocam" size="14" color="#617796" aria-hidden="true" /><text>含课程</text></view>
                  </view>
                </view>
                <uni-icons class="point-chevron" type="right" size="15" color="#9aa3af" aria-hidden="true" />
              </button>
              <text v-if="!section.points.length" class="empty-section">本节暂无知识点</text>
            </view>
          </view>
        </view>
        <text v-if="!chapter.sections.length" class="empty-section">本章暂无内容</text>
      </view>
      <view v-else class="directory-state"><text>本科目暂无章节</text></view>
      </SlidePanel>
    </template>
    <view v-else class="directory-state"><text>当前考试暂无知识目录</text></view>
    </view>
    <AppTabBar active="knowledge" />
  </view>
</template>

<style scoped lang="scss">
.knowledge-page {
  --directory-text:var(--sxb-ink); --directory-muted:var(--sxb-ui-muted); --directory-line:var(--sxb-ui-line); --directory-card:var(--sxb-ui-soft);
  min-height:100vh; max-width:430px; margin:0 auto; box-sizing:border-box;
  padding:0 0 calc(116px + env(safe-area-inset-bottom,0px));
  background:#fff; color:var(--directory-text);
}
.knowledge-header {
  position:relative; isolation:isolate; overflow:hidden; box-sizing:border-box;
  min-height:calc(180px + env(safe-area-inset-top,0px)); padding:calc(25px + env(safe-area-inset-top,0px)) 22px 42px;
  background:linear-gradient(115deg,#eaf2ff 0%,#dcecff 46%,#d9f1e9 100%);
}
.knowledge-header::before { content:''; position:absolute; width:230px; height:230px; border:1px solid rgba(255,255,255,.5); border-radius:50%; right:-54px; top:-110px; pointer-events:none; }
.header-copy { position:relative; z-index:1; width:58%; }
.page-heading { display:block; font-size:26px; font-weight:700; letter-spacing:1px; line-height:1.4; color:#243d62; }
.exam-name { display:block; margin-top:5px; color:#546c8d; font-size:12px; line-height:1.6; overflow-wrap:anywhere; }
.exam-countdown { display:inline-flex; align-items:center; gap:5px; margin-top:15px; padding:4px 10px; border:1px solid rgba(255,255,255,.8); border-radius:20px; background:rgba(255,255,255,.65); color:#546c8d; font-size:12px; line-height:1.5; white-space:nowrap; }
.days { font-size:15px; font-weight:600; color:#315eaa; font-variant-numeric:tabular-nums; }
.header-illustration { position:absolute; width:45%; height:160px; right:2px; bottom:18px; pointer-events:none; animation:book-arrive 480ms var(--sxb-motion,ease) both; }
.directory-sheet { position:relative; margin-top:-22px; min-height:calc(100vh - 158px); background:#fff; border-radius:24px 24px 0 0; }
.directory-navigation { position:sticky; top:env(safe-area-inset-top,0px); z-index:5; background:#fff; padding-top:14px; border-radius:24px 24px 0 0; }
@keyframes book-arrive { from { opacity:0; transform:translateY(8px) rotate(-3deg); } to { opacity:1; transform:translateY(0) rotate(0); } }
.chapter-navigation { padding:9px 8px 6px; }
.chapter-content { padding:14px 20px 0; }
.chapter-heading { padding:0 0 21px; }
.chapter-title { display:block; font-size:20px; font-weight:600; line-height:1.6; overflow-wrap:anywhere; }
.chapter-summary { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px; margin-top:12px; color:var(--directory-muted); font-size:12px; line-height:1.5; }
.summary-dot { padding:0 7px; }
.chapter-mastery { color:#516d9e; }
.mastery-track { height:3px; margin-top:12px; background:#edf0f5; border-radius:3px; overflow:hidden; }
.mastery-track>view { height:100%; background:#7d9eea; border-radius:3px; }
.section-list { display:flex; flex-direction:column; gap:14px; }
.section-card { background:var(--directory-card); border-radius:14px; overflow:hidden; }
.section-heading { display:flex; flex-direction:column; gap:7px; align-items:stretch; width:100%; padding:18px 18px 14px; margin:0; text-align:left; background:transparent; color:var(--directory-text); line-height:1.5; border-radius:0; }
.section-label { display:flex; align-items:baseline; gap:9px; min-width:0; }
.section-number { flex:none; font-size:12px; font-weight:600; color:var(--sxb-blue); font-variant-numeric:tabular-nums; }
.section-name { font-size:16px; font-weight:600; overflow-wrap:anywhere; }
.section-count { display:flex; align-items:center; justify-content:space-between; padding-left:25px; color:var(--directory-muted); font-size:12px; }
.point-list { padding:0 16px; margin:0 5px 5px; border-radius:10px; background:#fff; }
.point-row { display:flex; align-items:center; gap:10px; width:100%; min-height:86px; margin:0; padding:17px 0; border-top:1px solid #e7eaef; border-radius:0; background:transparent; text-align:left; color:var(--directory-text); line-height:1.6; }
.point-copy { flex:1; min-width:0; }
.point-title { display:block; font-size:15px; overflow-wrap:anywhere; }
.point-row:first-child { border-top:0; }
.point-meta { display:flex; flex-wrap:wrap; align-items:center; gap:6px 13px; margin-top:9px; color:var(--directory-muted); font-size:12px; }
.point-stars { display:flex; align-items:center; gap:1px; }
.course-marker { display:flex; align-items:center; gap:4px; color:#617796; }
.point-chevron { flex:none; }
.empty-section { display:block; padding:20px 4px; text-align:center; color:var(--directory-muted); font-size:13px; }
.directory-state { display:flex; flex-direction:column; align-items:center; gap:20px; padding:70px 28px; color:var(--directory-muted); font-size:14px; line-height:1.8; text-align:center; }
.directory-state button { min-height:44px; padding:10px 24px; margin:0; border-radius:22px; background:#edf2ff; color:var(--sxb-blue,#3569e8); font-size:14px; line-height:1.6; }
.loading-line { width:80px; height:3px; border-radius:3px; background:#dce6ff; }
button { cursor:pointer; touch-action:manipulation; }
button::after { border:0; }
button:focus-visible { outline:2px solid var(--sxb-blue,#3569e8); outline-offset:-2px; }
button:active { opacity:.72; }
@media (max-width:350px) {
  .knowledge-header { padding-left:18px; padding-right:18px; }
  .chapter-content { padding-left:14px; padding-right:14px; }
  .section-heading { padding-left:14px; padding-right:14px; }
  .point-list { padding:0 14px; }
}
@media (prefers-reduced-motion:reduce) { button { transition:none; } .header-illustration { animation:none; } }
</style>
