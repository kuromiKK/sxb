<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import uniIcons from '@dcloudio/uni-ui/lib/uni-icons/uni-icons.vue'
import { courseCatalog, knowledgeSubjects, practiceQuestions } from '@/mock/data'
import { backOrFallback } from '@/utils/navigation'
import { getNoteById, removeNotes, saveNoteRecord, type NoteRecord } from '@/utils/notes'

const noteId = ref('')
const note = ref<NoteRecord>()
const content = ref('')
const saved = ref(false)
const deleteVisible = ref(false)

const source = computed(() => {
  if (!note.value) return { type: '笔记', title: '笔记不存在', meta: '', url: '' }
  const question = practiceQuestions.find(item => item.id === note.value?.sourceId)
  if (question) return { type: '题目', title: question.stem, meta: `${question.typeName} · ${question.subjectName.includes('实务') ? '初级实务' : '初级综合'} · ${question.knowledgePointTitle}`, url: `/pages/practice-session/index?questionId=${encodeURIComponent(question.id)}&returnUrl=${encodeURIComponent(`/pages/note-detail/index?id=${note.value.id}`)}` }
  const course = courseCatalog.find(item => item.id === note.value?.sourceId)
  if (course) return { type: '精讲课', title: `第${course.sectionNo}节 ${course.sectionName}`, meta: `${course.typeName} · ${course.subjectName.includes('实务') ? '初级实务' : '初级综合'} · 第${course.chapterNo}章`, url: `/pages/course-detail/index?id=${encodeURIComponent(course.id)}` }
  for (const subject of knowledgeSubjects) for (const chapter of subject.chapters) for (const section of chapter.sections) {
    const point = section.points.find(item => item.id === note.value?.sourceId)
    if (point) return { type: '知识点', title: point.title, meta: `${subject.name.includes('实务') ? '初级实务' : '初级综合'} · 第${chapter.no}章 · 第${section.no}节`, url: `/pages/knowledge-detail/index?id=${encodeURIComponent(point.id)}` }
  }
  return { type: '笔记', title: '原内容已下架', meta: '', url: '' }
})

onLoad(options => {
  noteId.value = decodeURIComponent(options?.id || '')
  note.value = getNoteById(noteId.value)
  content.value = note.value?.content || ''
})
const back = () => backOrFallback('/pages/practice-tools/index?mode=note')
const save = () => {
  if (!note.value || !content.value.trim()) return uni.showToast({ title: '请填写笔记内容', icon: 'none' })
  note.value = saveNoteRecord(note.value.sourceId, note.value.sourceType, content.value)
  saved.value = true
  uni.showToast({ title: '笔记已更新', icon: 'success' })
  setTimeout(() => { saved.value = false }, 1400)
}
const openSource = () => source.value.url ? uni.navigateTo({ url: source.value.url }) : uni.showToast({ title: '原内容暂不可用', icon: 'none' })
const confirmDelete = () => { if (note.value) removeNotes([note.value.id]); deleteVisible.value = false; uni.showToast({ title: '笔记已删除', icon: 'none' }); setTimeout(back, 350) }
</script>

<template>
  <view class="detail-page page safe-top"><view class="detail-top"><button @tap="back"><uni-icons type="back" size="21" color="#4d5c73" /></button><text>笔记详情</text><button class="delete-button" @tap="deleteVisible = true"><uni-icons type="trash" size="20" color="#c85056" /></button></view><view v-if="note" class="source-card" @tap="openSource"><view class="source-icon"><uni-icons type="compose" size="23" color="#fff" /></view><view><text>{{ source.type }}</text><text>{{ source.title }}</text><text>{{ source.meta }}</text></view><uni-icons type="forward" size="19" color="#6f8d83" /></view><view v-if="note" class="edit-card"><view class="edit-head"><view><text>笔记内容</text><text>持续编辑会保留当前笔记ID</text></view><text>{{ content.length }} / 1200</text></view><textarea v-model="content" maxlength="1200" placeholder="记录你的理解、易错点或复习提醒" /><view class="time-row"><text>创建于 {{ new Date(note.createdAt).toLocaleString() }}</text><text>更新于 {{ new Date(note.updatedAt).toLocaleString() }}</text></view><button class="save-button" :class="{ saved }" @tap="save"><uni-icons :type="saved ? 'checkmarkempty' : 'compose'" size="18" color="#fff" />{{ saved ? '已保存' : '保存修改' }}</button></view><view v-else class="empty">笔记不存在或已经删除</view><view v-if="deleteVisible" class="mask" @tap.self="deleteVisible = false"><view class="dialog" @tap.stop><view class="dialog-icon"><uni-icons type="trash" size="28" color="#fff" /></view><text>删除笔记</text><text>删除后无法恢复，再次记录会创建新的笔记。</text><view><button @tap="deleteVisible = false">暂不删除</button><button @tap="confirmDelete">确认删除</button></view></view></view></view>
</template>

<style lang="scss">
.detail-page { max-width:430px; min-height:100vh; margin:0 auto; box-sizing:border-box; padding-top:calc(env(safe-area-inset-top) + 18rpx); padding-bottom:42rpx; background:#f5f7fb; }.detail-top { height:58rpx; display:flex; align-items:center; justify-content:space-between; }.detail-top>text { color:#1e3048; font-size:27rpx; font-weight:900; }.detail-top button { width:58rpx; height:58rpx; display:flex; align-items:center; justify-content:center; margin:0; padding:0; background:#edf1fb; border-radius:15rpx; }.detail-top button::after { display:none; }.detail-top .delete-button { background:#fff0ef; }.source-card { display:flex; align-items:center; gap:11rpx; margin-top:19rpx; padding:17rpx; background:#e8f7f1; border:1rpx solid #cce9df; border-radius:12rpx; }.source-icon { width:47rpx; height:47rpx; display:flex; align-items:center; justify-content:center; flex:none; background:#1a9a7b; border-radius:12rpx; }.source-card>view:nth-child(2) { flex:1; min-width:0; display:flex; flex-direction:column; gap:4rpx; }.source-card>view:nth-child(2) text:first-child { color:#1a806a; font-size:17rpx; font-weight:900; }.source-card>view:nth-child(2) text:nth-child(2) { overflow:hidden; color:#27483f; font-size:21rpx; font-weight:850; white-space:nowrap; text-overflow:ellipsis; }.source-card>view:nth-child(2) text:last-child { overflow:hidden; color:#789087; font-size:16rpx; white-space:nowrap; text-overflow:ellipsis; }.edit-card { margin-top:15rpx; padding:19rpx; background:#fff; border:1rpx solid #dfe8e4; border-radius:13rpx; }.edit-head { display:flex; align-items:flex-start; justify-content:space-between; gap:10rpx; }.edit-head>view { display:flex; flex-direction:column; gap:4rpx; }.edit-head>view text:first-child { color:#223b34; font-size:23rpx; font-weight:900; }.edit-head>view text:last-child,.edit-head>text { color:#96a39f; font-size:16rpx; }.edit-card textarea { width:100%; min-height:390rpx; box-sizing:border-box; margin-top:15rpx; padding:15rpx; color:#344a44; background:#f7faf9; border:1rpx solid #dce9e4; border-radius:10rpx; font-size:21rpx; line-height:1.7; }.time-row { display:flex; flex-direction:column; gap:4rpx; margin-top:11rpx; color:#9aa6a2; font-size:15rpx; }.save-button { width:100%; height:57rpx; display:flex; align-items:center; justify-content:center; gap:6rpx; margin:16rpx 0 0; padding:0; color:#fff; background:#1a9a7b; border-radius:9rpx; font-size:20rpx; font-weight:900; }.save-button.saved { background:#14775f; }.save-button::after { display:none; }.empty { margin-top:20rpx; padding:70rpx 20rpx; color:#96a39f; background:#fff; border-radius:12rpx; text-align:center; }.mask { position:fixed; z-index:80; inset:0; display:flex; align-items:center; justify-content:center; padding:27px; background:rgba(19,31,52,.5); }.dialog { width:100%; max-width:350px; box-sizing:border-box; display:flex; align-items:center; flex-direction:column; padding:25rpx; background:#fff; border-radius:16rpx; }.dialog-icon { width:64rpx; height:64rpx; display:flex; align-items:center; justify-content:center; background:#d45d63; border-radius:18rpx; }.dialog>text:nth-child(2) { margin-top:14rpx; color:#21344d; font-size:27rpx; font-weight:900; }.dialog>text:nth-child(3) { margin-top:8rpx; color:#728096; font-size:19rpx; line-height:1.6; text-align:center; }.dialog>view:last-child { width:100%; display:grid; grid-template-columns:1fr 1fr; gap:10rpx; margin-top:20rpx; }.dialog button { height:56rpx; margin:0; color:#66768b; background:#f0f3f7; border-radius:9rpx; font-size:19rpx; }.dialog button:last-child { color:#fff; background:#d45d63; }.dialog button::after { display:none; }
</style>
