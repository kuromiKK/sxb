<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Search, Pencil, KeyRound, RefreshCw, ShieldCheck } from 'lucide-vue-next'
import { request, send } from './api'

const props = defineProps<{ currentId?: string }>()
const emit = defineEmits<{ sessionReset: [] }>()
type Administrator = { id: string; phone: string; nickname: string; role: string; enabled: boolean; created_at: string; last_login_at: string | null }
const rows = ref<Administrator[]>([])
const total = ref(0)
const page = ref(1)
const search = ref('')
const busy = ref(false)
const error = ref('')
const editing = ref(false)
const saving = ref(false)
const formError = ref('')
const form = reactive({ id: '', phone: '', nickname: '', role: 'superadmin', enabled: true, password: '', confirmation: '' })
const resetting = ref(false)
const resetForm = reactive({ id: '', nickname: '', password: '', confirmation: '', reason: '' })
const date = (value: string | null) => value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '尚未登录'
let revision = 0
async function load() {
  const version = ++revision
  busy.value = true; error.value = ''
  try {
    const result = await request(`/admin/administrators?search=${encodeURIComponent(search.value)}&page=${page.value}`)
    if (version === revision) { rows.value = result.items; total.value = result.total }
  } catch (e: any) { if (version === revision) error.value = e.message }
  finally { if (version === revision) busy.value = false }
}
function edit(row?: Administrator) {
  Object.assign(form, { id: '', phone: '', nickname: '', role: 'superadmin', enabled: true, password: '', confirmation: '' }, row || {})
  formError.value = ''; editing.value = true
}
function validPassword(password: string, confirmation: string) {
  if (password.length < 10 || password.length > 128 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) throw new Error('密码需为10至128位，包含字母和数字')
  if (password !== confirmation) throw new Error('两次输入的密码不一致')
}
async function save() {
  if (saving.value) return
  formError.value = ''; saving.value = true
  try {
    if (!form.nickname.trim()) throw new Error('请填写管理员姓名')
    if (form.id) await send(`/admin/administrators/${form.id}`, { nickname: form.nickname, role: form.role, enabled: form.enabled }, 'PATCH')
    else {
      if (!/^1\d{10}$/.test(form.phone)) throw new Error('请输入正确的手机号')
      validPassword(form.password, form.confirmation)
      await send('/admin/administrators', { phone: form.phone, nickname: form.nickname, role: form.role, password: form.password })
    }
    editing.value = false; form.password = ''; form.confirmation = ''
    await load(); ElMessage.success('管理员已保存，操作已记录')
  } catch (e: any) { formError.value = e.message }
  finally { saving.value = false }
}
function openReset(row: Administrator) {
  Object.assign(resetForm, { id: row.id, nickname: row.nickname, password: '', confirmation: '', reason: '' })
  formError.value = ''; resetting.value = true
}
async function resetPassword() {
  if (saving.value) return
  formError.value = ''
  try {
    validPassword(resetForm.password, resetForm.confirmation)
    if (resetForm.reason.trim().length < 2) throw new Error('请填写重设原因')
    await ElMessageBox.confirm('重设后，该管理员在所有设备上的后台登录都会失效。前台学习账号不受影响。', '确认重设密码', { confirmButtonText: '确认重设', cancelButtonText: '取消', type: 'warning' })
    saving.value = true
    await send(`/admin/administrators/${resetForm.id}/password`, { password: resetForm.password, reason: resetForm.reason })
    resetting.value = false; resetForm.password = ''; resetForm.confirmation = ''
    ElMessage.success('密码已重设，请使用新密码登录')
    if (resetForm.id === props.currentId) emit('sessionReset')
  } catch (e: any) { if (e !== 'cancel' && e !== 'close') formError.value = e.message }
  finally { saving.value = false }
}
onMounted(load)
</script>

<template>
  <section class="administrator-management">
    <div class="table-toolbar">
      <el-input v-model="search" clearable placeholder="搜索姓名或手机号" class="search-input" @keyup.enter="page=1;load()" @clear="page=1;load()"><template #prefix><Search :size="16" /></template></el-input>
      <div class="row-actions"><el-tooltip content="搜索管理员"><el-button aria-label="搜索管理员" @click="page=1;load()"><Search :size="16" /></el-button></el-tooltip><el-tooltip content="刷新管理员"><el-button :loading="busy" aria-label="刷新管理员" @click="load"><RefreshCw :size="16" /></el-button></el-tooltip><el-button type="primary" @click="edit()"><Plus :size="16" />新增管理员</el-button></div>
    </div>
    <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon />
    <el-table v-loading="busy" :data="rows" row-key="id" empty-text="暂无匹配的管理员">
      <el-table-column prop="nickname" label="管理员" min-width="150"><template #default="{row}">{{ row.nickname }}<el-tag v-if="row.id===currentId" size="small" effect="plain" class="current-admin">当前账号</el-tag></template></el-table-column>
      <el-table-column prop="phone" label="手机号" width="150" />
      <el-table-column label="角色" width="150"><template #default><span class="admin-role"><ShieldCheck :size="15" />最高管理员</span></template></el-table-column>
      <el-table-column label="状态" width="90"><template #default="{row}"><el-tag :type="row.enabled?'success':'info'">{{ row.enabled?'启用':'停用' }}</el-tag></template></el-table-column>
      <el-table-column label="最近登录" width="190"><template #default="{row}">{{ date(row.last_login_at) }}</template></el-table-column>
      <el-table-column label="创建时间" width="190"><template #default="{row}">{{ date(row.created_at) }}</template></el-table-column>
      <el-table-column label="操作" width="110" fixed="right"><template #default="{row}"><div class="row-actions"><el-tooltip content="编辑管理员"><el-button link type="primary" aria-label="编辑管理员" @click="edit(row)"><Pencil :size="17" /></el-button></el-tooltip><el-tooltip content="重设密码"><el-button link type="primary" aria-label="重设密码" @click="openReset(row)"><KeyRound :size="17" /></el-button></el-tooltip></div></template></el-table-column>
    </el-table>
    <div class="pagination"><span>共 {{ total }} 位管理员</span><el-pagination v-model:current-page="page" :total="total" :page-size="20" layout="prev,pager,next" @current-change="load" /></div>
    <el-dialog v-model="editing" :title="form.id?'编辑管理员':'新增管理员'" width="500px" :close-on-click-modal="false" @closed="form.password='';form.confirmation=''">
      <el-form label-position="top" @submit.prevent="save">
        <el-form-item label="姓名" required><el-input v-model="form.nickname" maxlength="50" placeholder="管理员姓名" /></el-form-item>
        <el-form-item label="手机号" required><el-input v-model="form.phone" :disabled="Boolean(form.id)" maxlength="11" inputmode="tel" placeholder="管理员手机号" /></el-form-item>
        <el-form-item label="角色"><el-select v-model="form.role"><el-option label="最高管理员" value="superadmin" /></el-select></el-form-item>
        <el-form-item v-if="form.id" label="账号状态"><el-switch v-model="form.enabled" :disabled="form.id===currentId" active-text="启用" inactive-text="停用" /></el-form-item>
        <template v-else><el-form-item label="密码" required><el-input v-model="form.password" type="password" show-password autocomplete="new-password" placeholder="10至128位，包含字母和数字" /></el-form-item><el-form-item label="确认密码" required><el-input v-model="form.confirmation" type="password" show-password autocomplete="new-password" placeholder="再次输入密码" /></el-form-item></template>
        <el-alert v-if="formError" :title="formError" type="error" :closable="false" show-icon />
      </el-form><template #footer><el-button :disabled="saving" @click="editing=false">取消</el-button><el-button type="primary" :loading="saving" @click="save">保存管理员</el-button></template>
    </el-dialog>
    <el-dialog v-model="resetting" title="重设管理员密码" width="500px" :close-on-click-modal="false" @closed="resetForm.password='';resetForm.confirmation=''">
      <p class="dialog-context">{{ resetForm.nickname }}</p><el-form label-position="top"><el-form-item label="新密码" required><el-input v-model="resetForm.password" type="password" show-password autocomplete="new-password" placeholder="10至128位，包含字母和数字" /></el-form-item><el-form-item label="确认新密码" required><el-input v-model="resetForm.confirmation" type="password" show-password autocomplete="new-password" /></el-form-item><el-form-item label="重设原因" required><el-input v-model="resetForm.reason" type="textarea" :rows="2" maxlength="200" /></el-form-item><el-alert v-if="formError" :title="formError" type="error" :closable="false" show-icon /></el-form><template #footer><el-button :disabled="saving" @click="resetting=false">取消</el-button><el-button type="primary" :loading="saving" @click="resetPassword">重设密码</el-button></template>
    </el-dialog>
  </section>
</template>

<style scoped>
.admin-role { display: inline-flex; gap: 6px; align-items: center; }
.current-admin { margin-left: 8px; }
</style>
