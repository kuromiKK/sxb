<script setup lang="ts">
import RecordIdentifier from './RecordIdentifier.vue'
import { computed, onMounted, reactive, ref, watch } from "vue";
import QRCode from "qrcode";
import { ElMessage, ElMessageBox } from "element-plus";
import { Copy, QrCode, Power, Eye, Search, RotateCcw } from "lucide-vue-next";
import { request, send } from "./api";
const document = window.document;
const loadError=ref('');
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
const applied=reactive({...filters,search:''});
function query(){Object.assign(applied,filters,{search:search.value.trim()});page.value=1}
function reset(){search.value='';Object.assign(filters,{channel:'',status:'',examId:'',sort:'created'});query()}
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
        (!applied.search ||
          r.code.includes(applied.search) ||
          r.creator?.includes(applied.search)) &&
        (!applied.channel || r.channel === applied.channel) &&
        (!applied.status || r.status === applied.status) &&
        (!applied.examId || r.exam_id === applied.examId),
    )
    .sort((a, b) =>
        applied.sort === "uses"
        ? (b.use_count || 0) - (a.use_count || 0)
        : applied.sort === "usesAsc"
          ? (a.use_count || 0) - (b.use_count || 0)
        : new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    ),
);
const pageRows=computed(()=>visibleRows.value.slice((page.value-1)*20,page.value*20));
watch(()=>visibleRows.value.length,total=>{page.value=Math.min(page.value,Math.max(1,Math.ceil(total/20)))});
async function load() {
  loading.value = true;
  loadError.value='';
  try {
    rows.value = await request("/admin/referrals");
    exams.value = await request("/exams");
    const tree = await request("/exam-tree");
    categories.value = [{ id: "", name: "无" }, ...tree];
  } catch(e:any) {
    loadError.value=e.message;
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
      .catch(() => undefined);
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
defineExpose({ openNew, load });
</script>
<template>
  <section class="ref-page">
    <form class="admin-filters" @submit.prevent="query">
      <label class="admin-filter-field"><span>推荐码 / 创建人</span><el-input v-model="search" placeholder="搜索推荐码或创建人" aria-label="推荐码或创建人" clearable/></label>
      <label class="admin-filter-field"><span>渠道</span><el-select v-model="filters.channel" :empty-values="[null,undefined]" aria-label="渠道"><el-option label="全部渠道" value=""/><el-option v-for="c in channels" :key="c[0]" :label="c[1]" :value="c[0]"/></el-select></label>
      <label class="admin-filter-field"><span>考试项目</span><el-select v-model="filters.examId" filterable :empty-values="[null,undefined]" aria-label="考试项目"><el-option label="全部考试" value=""/><el-option v-for="e in exams" :key="e.id" :label="e.name" :value="e.id"/></el-select></label>
      <label class="admin-filter-field"><span>状态</span><el-select v-model="filters.status" :empty-values="[null,undefined]" aria-label="状态"><el-option label="全部状态" value=""/><el-option label="启用" value="active"/><el-option label="停用" value="disabled"/><el-option label="已过期" value="expired"/></el-select></label>
      <label class="admin-filter-field"><span>排序</span><el-select v-model="filters.sort" aria-label="排序"><el-option label="创建时间倒序" value="created"/><el-option label="推荐人数正序" value="usesAsc"/><el-option label="推荐人数倒序" value="uses"/></el-select></label>
      <div class="admin-filter-actions"><el-button type="primary" native-type="submit"><Search :size="16"/>查询</el-button><el-button @click="reset"><RotateCcw :size="16"/>重置</el-button></div>
    </form>
    <el-alert v-if="loadError" :title="loadError" type="error" :closable="false" show-icon/>
    <div class="table-toolbar"><span>推荐码 <b>{{visibleRows.length}}</b></span></div>
    <el-table v-loading="loading" :data="pageRows" row-key="id">
      <template #empty><el-empty description="当前条件下暂无推荐码" :image-size="80"/></template>
      <el-table-column label="推荐码" min-width="155"><template #default="{row}"><el-tooltip content="复制推荐码"><el-button link type="primary" aria-label="复制推荐码" @click="copyCode(row.code)"><span class="plain-code">{{row.code.slice(0,3)}}****{{row.code.slice(-3)}}</span><Copy :size="14"/></el-button></el-tooltip></template></el-table-column>
      <el-table-column label="渠道" width="100"><template #default="{row}">{{channelName(row.channel)}}</template></el-table-column>
      <el-table-column prop="exam_name" label="考试项目" min-width="190" show-overflow-tooltip><template #default="{row}">{{row.exam_name||'无'}}</template></el-table-column>
      <el-table-column label="权限" min-width="140"><template #default="{row}">{{row.permission_level?(row.permission_level==='free'?'普通会员':row.permission_level.toUpperCase())+' '+row.permission_hours+'小时':'无'}}</template></el-table-column>
      <el-table-column label="推荐人数" width="100"><template #default="{row}">{{row.use_count||0}}</template></el-table-column>
      <el-table-column prop="creator" label="创建人" min-width="130" show-overflow-tooltip/>
      <el-table-column label="创建时间" width="180"><template #default="{row}">{{row.created_at?fmt(row.created_at):'—'}}</template></el-table-column>
      <el-table-column label="有效期" width="180"><template #default="{row}">{{fmt(row.expires_at)}}</template></el-table-column>
      <el-table-column label="状态" width="105"><template #default="{row}"><el-tag :type="row.status==='active'?'success':row.status==='expired'?'warning':'info'">{{row.status==='active'?'启用':row.status==='expired'?'已过期':'停用'}}</el-tag></template></el-table-column>
      <el-table-column label="操作" width="138" fixed="right"><template #default="{row}"><div class="row-actions"><el-tooltip content="查看详情"><el-button link type="primary" aria-label="查看推荐码详情" @click="showDetail(row)"><Eye :size="17"/></el-button></el-tooltip><el-tooltip :content="row.status==='active'?'停用':'启用'"><el-button link :type="row.status==='active'?'danger':'success'" :aria-label="row.status==='active'?'停用推荐码':'启用推荐码'" @click="toggle(row)"><Power :size="17"/></el-button></el-tooltip><el-tooltip content="查看二维码"><el-button link type="primary" aria-label="查看二维码" @click="showQr(row)"><QrCode :size="17"/></el-button></el-tooltip></div></template></el-table-column>
    </el-table>
    <div class="pagination"><span>共 {{visibleRows.length}} 条</span><el-pagination v-model:current-page="page" :page-size="20" :total="visibleRows.length" layout="prev,pager,next"/></div>
  </section>
  <el-drawer v-model="drawer" title="创建推荐码" direction="rtl" size="520px" :close-on-click-modal="false"
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
    :close-on-click-modal="false"
    title="推荐码详情"
    direction="rtl"
    size="620px"
    v-if="detailData"
    ><RecordIdentifier :id="detailData.row.id" table="referral_codes"/><el-descriptions :column="1" border
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
.ref-page{min-width:0}.row-actions{flex-wrap:nowrap}.table-toolbar b{margin-left:6px;color:var(--el-text-color-regular)}
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
</style>
