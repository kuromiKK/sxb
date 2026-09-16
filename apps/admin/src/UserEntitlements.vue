<script setup lang="ts">
import RecordIdentifier from './RecordIdentifier.vue'
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { RefreshCw, ShieldCheck, Undo2 } from 'lucide-vue-next'
import { request, send } from './api'

const props = defineProps<{ user: { id: string; nickname: string; phone: string } | null; exams: Array<{ id: string; name: string }> }>()
const emit = defineEmits<{ close: [] }>()
const examId = ref('')
const data = ref<any>(null)
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const level = ref('free')
const cycleId = ref('')
const reason = ref('')
const names: Record<string, string> = { free: '普通会员', vip: 'VIP', svip: 'SVIP' }
const date = (value: string | null) => value ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '无'
const availableCycles = computed(() => data.value?.cycles.filter((c: any) => c.available).slice(0,1) || [])
const selectedCycle = computed(() => availableCycles.value.find((c: any) => c.id === cycleId.value))
let revision = 0
watch(() => props.user?.id, () => { examId.value = props.exams[0]?.id || ''; reason.value = '' })
async function load() {
  const version = ++revision
  data.value = null; error.value = ''; cycleId.value = ''; reason.value = ''
  if (!props.user || !examId.value) { loading.value = false; return }
  loading.value = true
  try {
    const result = await request(`/admin/users/${props.user.id}/entitlements?examId=${encodeURIComponent(examId.value)}`)
    if (version !== revision) return
    data.value = result
    level.value = result.current.level
    cycleId.value = availableCycles.value.find((c: any) => c.id === result.manual?.cycle_id)?.id || availableCycles.value[0]?.id || ''
  } catch (e: any) { if (version === revision) error.value = e.message }
  finally { if (version === revision) loading.value = false }
}
watch([() => props.user?.id, examId], load)
function close(done?: () => void) { if (!saving.value) { emit('close'); done?.() } }
async function save(action: 'set' | 'restore') {
  if (saving.value || loading.value || !data.value || !props.user) return
  error.value = ''
  if (reason.value.trim().length < 2) { error.value = '请填写至少2个字的调整原因'; return }
  if (action === 'set' && !selectedCycle.value) { error.value = '该考试暂无正在进行的考期'; return }
  const target = { user: props.user, examId: examId.value, examName: data.value.exam.name, version: data.value.version, level: level.value, cycleId: cycleId.value, reason: reason.value.trim() }
  const next = action === 'restore' ? `${names[data.value.order.level]}（按订单计算）` : names[target.level]
  const term = action === 'set' ? `，所选考期结束时间为 ${date(selectedCycle.value.ends_at)}（北京时间）` : ''
  saving.value = true
  try {
    await ElMessageBox.confirm(`将 ${target.user.nickname}（${target.user.phone}）的「${target.examName}」权益调整为 ${next}${term}。其他考试和原付款记录不受影响。`, action === 'restore' ? '恢复订单权益' : '确认调整权益', { confirmButtonText: '确认生效', cancelButtonText: '取消', type: 'warning', closeOnClickModal: false })
    await send(`/admin/users/${target.user.id}/entitlements/${target.examId}`, { action, version: target.version, reason: target.reason, ...(action === 'set' ? { level: target.level, cycleId: target.cycleId } : {}) }, 'PUT')
    await load()
    ElMessage.success('权益已更新，前台刷新页面后生效')
  } catch (e: any) { if (e !== 'cancel' && e !== 'close') error.value = e.message }
  finally { saving.value = false }
}
</script>

<template>
  <el-drawer :model-value="Boolean(user)" title="人工权益管理" size="min(860px, 96vw)" class="entitlement-drawer" :close-on-click-modal="false" :before-close="close" destroy-on-close>
    <RecordIdentifier :id="user?.id" table="users"/>
    <section class="entitlement-content">
      <div class="entitlement-user"><div><strong>{{ user?.nickname }}</strong><span>{{ user?.phone }}</span></div><el-tooltip content="刷新当前权益"><el-button aria-label="刷新当前权益" :loading="loading" :disabled="saving" @click="load"><RefreshCw :size="16" /></el-button></el-tooltip></div>
      <el-form label-position="top" @submit.prevent="save('set')">
        <el-form-item label="考试项目"><el-select v-model="examId" aria-label="人工权益考试项目" placeholder="请选择考试" :disabled="saving"><el-option v-for="exam in exams" :key="exam.id" :label="exam.name" :value="exam.id" /></el-select></el-form-item>
        <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon class="entitlement-error" />
        <el-skeleton v-if="loading" :rows="4" animated />
        <template v-else-if="data">
          <div class="entitlement-summary" aria-live="polite">
            <div><span>当前生效权益</span><strong class="current-level">{{ names[data.current.level] }}{{ data.current.trial?' · 体验':'' }}<el-tag :type="data.current.source==='manual'?'warning':'info'" effect="plain">{{ data.current.source==='manual'?'人工设置':data.current.level==='free'?'默认权益':'订单权益' }}</el-tag></strong><small>有效至：{{ date(data.current.expiresAt) }}</small></div>
            <div><span>按有效订单计算</span><strong>{{ names[data.order.level] }}{{ data.order.trial?' · 体验':'' }}</strong><small>有效至：{{ date(data.order.expiresAt) }}</small></div>
          </div>
          <el-alert :title="data.manual?.active?'人工设置生效中，优先于订单权益。退款或删除测试订单不会撤销这项人工设置；取消覆盖请使用“恢复订单权益”。':'人工调整仅影响当前考试，不生成订单或支付记录。保存后将优先采用人工设置，直至恢复订单权益或考期结束。'" :type="data.manual?.active?'warning':'info'" :closable="false" show-icon />
          <div class="entitlement-form-fields">
            <el-form-item label="调整为" required><el-radio-group v-model="level" :disabled="saving || !data.exam.enabled"><el-radio-button value="free">普通会员</el-radio-button><el-radio-button value="vip">VIP</el-radio-button><el-radio-button value="svip">SVIP</el-radio-button></el-radio-group></el-form-item>
            <el-form-item label="当前考期"><span>{{ selectedCycle ? `${selectedCycle.year}年度 · ${date(selectedCycle.starts_at)} 至 ${date(selectedCycle.ends_at)}` : '暂无正在进行的考期' }}</span></el-form-item>
          </div>
          <p v-if="selectedCycle" class="entitlement-term">立即生效，所选考期于 {{ date(selectedCycle.ends_at) }} 结束（北京时间）。本次人工设置持续至考期结束，不延续至下一考期；若无其他有效权益，则恢复普通会员。</p>
          <el-alert v-else title="该考试暂无正在进行的考期，请在「考试项目」中检查考期的开始和结束时间。" type="info" :closable="false" />
          <el-form-item label="调整原因" required class="entitlement-reason"><el-input v-model="reason" type="textarea" :rows="3" maxlength="200" show-word-limit :disabled="saving" placeholder="请说明赠送、补偿或修正权益的原因" /></el-form-item>
        </template>
      </el-form>
      <section v-if="data" class="entitlement-history">
        <h2>调整记录 <small>最近50条 · 当前考试</small></h2>
        <el-table :data="data.history" max-height="230" empty-text="该考试暂无人工调整记录">
          <el-table-column label="变更" min-width="185"><template #default="{row}"><span>{{ names[row.details.before.level] }} → {{ names[row.details.after.level] }}</span><small class="cell-sub">{{ row.details.action==='restore'?'恢复订单权益':'人工设置' }}{{ row.details.action==='set'?` · ${row.details.manual.year}年度`:'' }}</small></template></el-table-column>
          <el-table-column label="原因" prop="details.reason" min-width="180" />
          <el-table-column label="操作人 / 时间" min-width="210"><template #default="{row}">{{ row.actor_name }}<small class="cell-sub">{{ row.actor_phone }} · {{ date(row.created_at) }}</small></template></el-table-column>
        </el-table>
      </section>
    </section>
    <template #footer><div class="entitlement-footer"><el-button :disabled="loading || saving || !data?.manual || data.manual.revoked" @click="save('restore')"><Undo2 :size="15" />恢复订单权益</el-button><div><el-button :disabled="saving" @click="close()">关闭</el-button><el-button type="primary" :loading="saving" :disabled="loading || !data || !selectedCycle || !data.exam.enabled" @click="save('set')"><ShieldCheck :size="16" />保存权益</el-button></div></div></template>
  </el-drawer>
</template>

<style scoped>
.entitlement-user { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 20px; }
.entitlement-user > div { display: flex; align-items: baseline; flex-wrap: wrap; gap: 12px; min-width: 0; }
.entitlement-user strong { font-size: 16px; overflow-wrap: anywhere; }
.entitlement-user span, .entitlement-term, .entitlement-summary > div > span, .entitlement-summary small { color: var(--muted); }
.entitlement-error { margin-bottom: 16px; }
.entitlement-summary { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; padding: 16px 0 20px; margin-bottom: 16px; border-block: 1px solid var(--line); }
.entitlement-summary > div { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.entitlement-summary strong { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 18px; font-weight: 600; }
.entitlement-form-fields { display: grid; grid-template-columns: 1fr 1.2fr; gap: 20px; margin-top: 20px; }
.entitlement-term { font-size: 13px; line-height: 1.7; margin: 0 0 16px; }
.entitlement-reason { margin-top: 16px; }
.entitlement-history { margin-top: 24px; }
.entitlement-history h2 { display: flex; flex-wrap: wrap; align-items: baseline; gap: 10px; margin-bottom: 12px; font-size: 15px; }
.entitlement-history h2 small { color: var(--muted); font-weight: 400; }
.entitlement-footer { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; }
.entitlement-footer > div { display: flex; gap: 8px; }
.entitlement-footer .el-button + .el-button { margin-left: 0; }
@media(max-width:600px) {
  .entitlement-summary, .entitlement-form-fields { grid-template-columns: 1fr; gap: 16px; }
  .entitlement-form-fields { gap: 0; }
  .entitlement-footer > div { margin-left: auto; }
}
</style>

<style>
.entitlement-drawer .el-drawer__body { min-height: 0; overflow-y: auto; }
.entitlement-drawer .el-drawer__footer { border-top: 1px solid var(--line); padding-top: 16px; }
</style>
