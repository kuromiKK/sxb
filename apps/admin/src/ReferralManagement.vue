<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import QRCode from "qrcode";
import { ElMessage, ElMessageBox } from "element-plus";
import { Copy, QrCode, Power } from "lucide-vue-next";
import { request, send } from "./api";
const document = window.document;
const rows = ref<any[]>([]),
  exams = ref<any[]>([]),
  categories = ref<any[]>([]),
  loading = ref(false),
  drawer = ref(false),
  detail = ref(false),
  qr = ref(false),
  selected = ref<any>(null),
  detailData = ref<any>(null),
  qrSrc = ref(""),
  page = ref(1),
  search = ref("");
const filters = reactive({
  channel: "",
  status: "",
  examId: "",
  sort: "created",
});
const channels = [
  ["douyin", "抖音"],
  ["video_account", "视频号"],
  ["kuaishou", "快手"],
  ["xiaohongshu", "小红书"],
  ["bilibili", "B站"],
  ["community", "社群"],
];
const form = reactive<any>({
  categoryId: "",
  channel: "",
  examId: null,
  permissionLevel: null,
  permissionHours: null,
  expiresAt: null,
});
const examsForCategory = computed(() => {
  if (!form.categoryId) return [];
  const root = categories.value.find((c: any) => c.id === form.categoryId);
  const ids = new Set<string>([form.categoryId]);
  const collect = (node: any) => (node?.children || []).forEach((child: any) => { ids.add(child.id); collect(child); });
  collect(root);
  return exams.value.filter((exam: any) => ids.has(exam.category_id));
});
const channelName = (v: string) => channels.find((x) => x[0] === v)?.[1] || v;
const visibleRows = computed(() =>
  rows.value
    .filter(
      (r) =>
        (!search.value ||
          r.code.includes(search.value) ||
          r.creator?.includes(search.value)) &&
        (!filters.channel || r.channel === filters.channel) &&
        (!filters.status || r.status === filters.status) &&
        (!filters.examId || r.exam_id === filters.examId),
    )
    .sort((a, b) =>
        filters.sort === "uses"
        ? (b.use_count || 0) - (a.use_count || 0)
        : filters.sort === "usesAsc"
          ? (a.use_count || 0) - (b.use_count || 0)
        : new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    ),
);
async function load() {
  loading.value = true;
  try {
    rows.value = await request("/admin/referrals");
    exams.value = await request("/exams");
    const tree = await request("/exam-tree");
    categories.value = [{ id: "", name: "无" }, ...tree];
  } finally {
    loading.value = false;
  }
}
onMounted(load);
function openNew() {
  Object.assign(form, {
    channel: "",
    categoryId: "",
    examId: null,
    permissionLevel: null,
    permissionHours: null,
    expiresAt: null,
  });
  drawer.value = true;
}
async function create() {
  if (!form.channel) return ElMessage.warning("请选择渠道");
  if (form.permissionLevel && !form.examId)
    return ElMessage.warning("附带权限时必须选择考试项目");
  await send("/admin/referrals", form, "POST");
  drawer.value = false;
  ElMessage.success("推荐码已创建");
  load();
}
async function copyCode(code: string) {
  await navigator.clipboard.writeText(code);
  ElMessage.success("推荐码已复制");
}
async function showDetail(r: any) {
  selected.value = r;
  detailData.value = await request("/admin/referrals/" + r.id);
  const domain = (await request("/admin/settings/site-domain")).value;
  qrSrc.value = await QRCode.toDataURL(
    `${domain}/#/pages/login/index?referral=${r.code}`,
    { width: 640, margin: 2 },
  );
  detail.value = true;
}
async function showQr(r: any) {
  const domain = (await request("/admin/settings/site-domain")).value;
  qrSrc.value = await QRCode.toDataURL(
    `${domain}/#/pages/login/index?referral=${r.code}`,
    { width: 640, margin: 2 },
  );
  selected.value = r;
  qr.value = true;
}
async function toggle(r: any) {
  if (r.status === "expired") {
    const at = await ElMessageBox.prompt(
      "请输入新的截止日期，留空为永久有效",
      "重新启用推荐码",
      {
        inputType: "datetime-local",
        confirmButtonText: "启用",
        cancelButtonText: "取消",
      },
    )
      .then((x) => x.value || null)
      .catch(() => null);
    if (at === undefined) return;
    await send(
      "/admin/referrals/" + r.id + "/status",
      { status: "active", expiresAt: at ? new Date(at).toISOString() : null },
      "PATCH",
    );
  } else
    await send(
      "/admin/referrals/" + r.id + "/status",
      { status: r.status === "active" ? "disabled" : "active" },
      "PATCH",
    );
  load();
}
function fmt(v: any) {
  return v ? new Date(v).toLocaleString("zh-CN", { hour12: false }) : "永久";
}
function downloadQr() {
  const a = window.document.createElement("a");
  a.href = qrSrc.value;
  a.download = "推荐码二维码.png";
  a.click();
}
defineExpose({ openNew });
</script>
<template>
  <section class="ref-page">
    <div class="filter-card">
      <el-input
        v-model="search"
        placeholder="搜索推荐码或创建人"
        clearable
      /><el-select v-model="filters.channel" placeholder="渠道" clearable
        ><el-option
          v-for="c in channels"
          :key="c[0]"
          :label="c[1]"
          :value="c[0]" /></el-select
      ><el-select v-model="filters.examId" placeholder="考试项目" clearable
        ><el-option
          v-for="e in exams"
          :key="e.id"
          :label="e.name"
          :value="e.id" /></el-select
      ><el-select v-model="filters.status" placeholder="状态" clearable
        ><el-option label="启动" value="active" /><el-option
          label="停用"
          value="disabled" /><el-option
          label="已过期"
          value="expired" /></el-select
      ><el-select v-model="filters.sort" placeholder="排序"
        ><el-option label="创建时间倒序" value="created" /><el-option
          label="推荐人数正序"
          value="usesAsc" /><el-option label="推荐人数倒序" value="uses"
      /></el-select>
    </div>
    <div class="list-card">
      <table>
        <thead>
          <tr>
            <th>推荐码</th>
            <th>渠道</th>
            <th>考试项目</th>
            <th>权限</th>
            <th>推荐人数</th>
            <th>创建人</th>
            <th>创建时间</th>
            <th>有效期</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in visibleRows" :key="r.id">
            <td>
              <button class="code" @click="copyCode(r.code)">
                {{ r.code.slice(0, 3) }}****{{ r.code.slice(-3) }}
                <Copy :size="13" />
              </button>
            </td>
            <td>{{ channelName(r.channel) }}</td>
            <td>{{ r.exam_name || "无" }}</td>
            <td>
              {{
                r.permission_level
                  ? r.permission_level.toUpperCase() +
                    " " +
                    r.permission_hours +
                    "小时"
                  : "无"
              }}
            </td>
            <td>
              <strong>{{ r.use_count || 0 }}</strong>
            </td>
            <td>{{ r.creator }}</td>
            <td>{{ fmt(r.created_at) }}</td>
            <td>{{ fmt(r.expires_at) }}</td>
            <td>
              <span class="status" :class="r.status">{{
                r.status === "active"
                  ? "启动"
                  : r.status === "expired"
                    ? "已过期"
                    : "停用"
              }}</span>
            </td>
            <td class="actions">
              <button @click="showDetail(r)">详情</button
              ><button @click="toggle(r)">
                <Power :size="14" />{{
                  r.status === "active" ? "停用" : "启用"
                }}</button
              ><button @click="showQr(r)"><QrCode :size="14" /></button>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="!visibleRows.length" class="empty">暂无推荐码</div>
    </div>
  </section>
  <el-drawer v-model="drawer" title="创建推荐码" direction="rtl" size="520px"
    ><el-form label-position="top"
      ><el-form-item label="渠道" required
        ><el-select v-model="form.channel" placeholder="请选择渠道"
          ><el-option
            v-for="c in channels"
            :key="c[0]"
            :label="c[1]"
            :value="c[0]" /></el-select></el-form-item
      ><el-form-item label="考试项目分类"
        ><el-select
          v-model="form.categoryId"
          clearable
          placeholder="无"
          @change="
            form.examId = null;
            form.permissionLevel = null;
            form.permissionHours = null;
          "
          ><el-option
            v-for="c in categories"
            :key="c.id"
            :label="c.name"
            :value="c.id" /></el-select></el-form-item
      ><el-form-item label="考试项目"
        ><el-select
          v-model="form.examId"
          :disabled="!form.categoryId"
          clearable
          placeholder="无"
          ><el-option
            v-for="e in examsForCategory"
            :key="e.id"
            :label="e.name"
            :value="e.id" /></el-select></el-form-item
      ><el-form-item label="附带权限"
        ><el-select
          v-model="form.permissionLevel"
          :disabled="!form.examId"
          clearable
          placeholder="无"
          ><el-option label="VIP" value="vip" /><el-option
            label="SVIP"
            value="svip" /></el-select></el-form-item
      ><el-form-item v-if="form.permissionLevel" label="赠送时长（小时）"
        ><el-input-number
          v-model="form.permissionHours"
          :min="1"
          :max="72"
          :step="1" /></el-form-item
      ><el-form-item label="有效期截止时间"
        ><el-date-picker
          v-model="form.expiresAt"
          type="datetime"
          clearable
          placeholder="不填写则永久有效"
          value-format="YYYY-MM-DDTHH:mm:ssZ" /></el-form-item></el-form
    ><template #footer
      ><el-button @click="drawer = false">返回</el-button
      ><el-button type="primary" @click="create">创建</el-button></template
    ></el-drawer
  ><el-drawer
    v-model="detail"
    title="推荐码详情"
    direction="rtl"
    size="620px"
    v-if="detailData"
    ><el-descriptions :column="1" border
      ><el-descriptions-item label="推荐码"
        ><span class="plain-code">{{ detailData.row.code }}</span
        ><el-button link @click="copyCode(detailData.row.code)"
          >复制</el-button
        ></el-descriptions-item
      ><el-descriptions-item label="二维码"
        ><div class="qr-stack"><img
          class="qr"
          :src="qrSrc"
          @click="showQr(detailData.row)"
        /><el-button size="small" @click="downloadQr"
          >保存二维码</el-button
        ></div></el-descriptions-item
      ><el-descriptions-item label="渠道">{{
        channelName(detailData.row.channel)
      }}</el-descriptions-item
      ><el-descriptions-item label="考试项目">{{
        detailData.row.exam_name || "无"
      }}</el-descriptions-item
      ><el-descriptions-item label="权限">{{
        detailData.row.permission_level
          ? detailData.row.permission_level.toUpperCase() +
            " " +
            detailData.row.permission_hours +
            "小时"
          : "无"
      }}</el-descriptions-item
      ><el-descriptions-item label="创建人">{{
        detailData.row.creator
      }}</el-descriptions-item
      ><el-descriptions-item label="有效期">{{
        fmt(detailData.row.expires_at)
      }}</el-descriptions-item></el-descriptions
    >
    <h3>推荐用户（{{ detailData.uses.length }}）</h3>
    <el-table :data="detailData.uses"
      ><el-table-column prop="nickname" label="昵称" /><el-table-column
        label="手机号"
        ><template #default="{ row }"
          >{{ row.phone.slice(0, 3) }}****{{ row.phone.slice(-4) }}</template
        ></el-table-column
      ><el-table-column prop="permission_level" label="权限" /><el-table-column
        label="推荐时间"
        ><template #default="{ row }">{{
          fmt(row.used_at)
        }}</template></el-table-column
      ></el-table
    ><template #footer
      ><el-button @click="detail = false">返回</el-button></template
    ></el-drawer
  ><el-dialog v-model="qr" title="推荐码二维码" width="440px"
    ><div class="qr-dialog">
      <img :src="qrSrc" /><el-button
        type="primary"
        @click="
          () => {
            const a = document.createElement('a');
            a.href = qrSrc;
            a.download = '推荐码二维码.png';
            a.click();
          }
        "
        >保存二维码</el-button
      >
    </div></el-dialog
  >
</template>
<style scoped>
.ref-page {
  padding: 4px 0 40px;
}
.filter-card {
  display: flex;
  gap: 10px;
  padding: 14px 16px;
  margin-bottom: 16px;
  background: #fff;
  border: 1px solid #e1e8f0;
  border-radius: 10px;
}
.filter-card .el-input {
  width: 230px;
}
.filter-card .el-select {
  width: 145px;
}
.list-card {
  overflow: auto;
  background: #fff;
  border: 1px solid #e1e8f0;
  border-radius: 11px;
}
.list-card table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.list-card th {
  padding: 12px 14px;
  text-align: left;
  background: #f8fafc;
  color: #70839a;
}
.list-card td {
  padding: 13px 14px;
  border-top: 1px solid #edf1f5;
  color: #53677e;
  white-space: nowrap;
}
.code {
  display: inline-flex;
  gap: 5px;
  align-items: center;
  color: #3569e8;
  background: none;
  border: 0;
  cursor: pointer;
  font-family: monospace;
}
.status {
  padding: 4px 8px;
  border-radius: 5px;
  font-size: 11px;
}
.status.active {
  color: #237b53;
  background: #eaf8f0;
}
.status.disabled {
  color: #8b6c35;
  background: #fff8df;
}
.status.expired {
  color: #a15c5c;
  background: #fff0f0;
}
.actions {
  display: flex;
  gap: 8px;
}
.actions button {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  color: #3569e8;
  background: none;
  border: 0;
  cursor: pointer;
}
.empty {
  text-align: center;
  padding: 50px;
  color: #97a4b3;
}
.plain-code {
  font-family: monospace;
  letter-spacing: 2px;
}
.qr {
  width: 100px;
  height: 100px;
  cursor: pointer;
}
.qr-stack {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
}
.qr-dialog {
  display: flex;
  align-items: center;
  flex-direction: column;
  gap: 18px;
}
.qr-dialog img {
  width: 360px;
  height: 360px;
}
.message-tabs :deep(.el-tabs__item) {
  height: 42px;
}
.message-tabs :deep(.el-tabs__active-bar) {
  height: 3px;
  border-radius: 3px;
}
@media (max-width: 900px) {
  .filter-card {
    flex-wrap: wrap;
  }
  .filter-card .el-input,
  .filter-card .el-select {
    width: 100%;
  }
}
</style>
