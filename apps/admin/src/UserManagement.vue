<script setup lang="ts">
import {onMounted,ref,reactive} from 'vue'
import {ElMessage,ElMessageBox} from 'element-plus'
import {Search,RotateCcw,Eye,ShieldCheck,Code2} from 'lucide-vue-next'
import {request,send} from './api'
import UserProfile from './UserProfile.vue'
const emit=defineEmits<{rights:[user:any]}>()
const rows=ref<any[]>([]),page=ref(1),total=ref(0),busy=ref(false),error=ref(''),profile=ref<InstanceType<typeof UserProfile>|null>(null)
const filters=reactive({search:'',developer:''}),applied=reactive({...filters})
const date=(v:string)=>v?new Date(v).toLocaleString('zh-CN',{hour12:false}):'未记录'
let revision=0
async function load(){const rev=++revision;busy.value=true;error.value='';try{const r=await request('/admin/user-profiles?'+new URLSearchParams({...applied,page:String(page.value)}));if(rev===revision){rows.value=r.items;total.value=r.total}}catch(e:any){if(rev===revision){error.value=e.message;rows.value=[];total.value=0}}finally{if(rev===revision)busy.value=false}}
function search(){Object.assign(applied,filters);page.value=1;void load()}
function reset(){Object.assign(filters,{search:'',developer:''});search()}
async function developer(row:any){try{await ElMessageBox.confirm(`确认${row.is_developer?'取消':'设置'}「${row.nickname}」的开发者标记？`,'开发者设置',{confirmButtonText:'确认',cancelButtonText:'取消',type:'warning'});await send('/admin/users/'+row.id+'/developer',{enabled:!row.is_developer},'PATCH');await load();ElMessage.success('已更新')}catch(e:any){if(e!=='cancel'&&e!=='close')ElMessage.error(e.message)}}
onMounted(load);defineExpose({load})
</script>
<template>
 <section class="user-management">
  <form class="admin-filters" @submit.prevent="search">
   <label class="admin-filter-field"><span>用户</span><el-input v-model="filters.search" placeholder="搜索昵称或手机号" aria-label="搜索用户" clearable/></label>
   <label class="admin-filter-field"><span>用户类型</span><el-select v-model="filters.developer" :empty-values="[null,undefined]" aria-label="用户类型"><el-option label="全部用户" value=""/><el-option label="开发者" value="true"/><el-option label="普通用户" value="false"/></el-select></label>
   <div class="admin-filter-actions"><el-button type="primary" native-type="submit"><Search :size="16"/>查询</el-button><el-button @click="reset"><RotateCcw :size="16"/>重置</el-button></div>
  </form>
  <el-alert v-if="error" :title="error" type="error" show-icon :closable="false"/>
  <div class="table-toolbar"><span>全部用户 <b>{{total}}</b></span></div>
  <el-table v-loading="busy" :data="rows" row-key="id">
   <template #empty><el-empty description="当前条件下暂无用户" :image-size="80"/></template>
   <el-table-column label="用户" min-width="180"><template #default="{row}"><button class="table-title" @click="profile?.open(row.id)">{{row.nickname}}</button><el-tag v-if="row.is_developer" size="small" type="warning" class="developer-tag">开发者</el-tag></template></el-table-column>
   <el-table-column prop="phone" label="手机号" width="145"/>
   <el-table-column label="状态" width="90"><template #default="{row}"><el-tag :type="row.enabled?'success':'info'">{{row.enabled?'正常':'停用'}}</el-tag></template></el-table-column>
   <el-table-column label="推荐人" min-width="120" show-overflow-tooltip><template #default="{row}">{{row.inviter||'未绑定'}}</template></el-table-column>
   <el-table-column label="注册时间" width="185"><template #default="{row}">{{date(row.created_at)}}</template></el-table-column>
   <el-table-column label="最近登录" width="185"><template #default="{row}">{{date(row.last_login_at)}}</template></el-table-column>
   <el-table-column label="操作" width="110" fixed="right"><template #default="{row}"><div class="row-actions"><el-tooltip content="用户详情"><el-button link type="primary" aria-label="用户详情" @click="profile?.open(row.id)"><Eye :size="17"/></el-button></el-tooltip><el-tooltip content="人工权益管理"><el-button link type="primary" aria-label="人工权益管理" @click="emit('rights',row)"><ShieldCheck :size="17"/></el-button></el-tooltip>
    <!-- 暂停开发者设置入口，待明确业务用途后恢复；保留现有标记和处理逻辑。
    <el-tooltip :content="row.is_developer?'取消开发者':'设为开发者'"><el-button link :type="row.is_developer?'warning':'info'" :aria-label="row.is_developer?'取消开发者':'设为开发者'" @click="developer(row)"><Code2 :size="17"/></el-button></el-tooltip>
    -->
   </div></template></el-table-column>
  </el-table>
  <div class="pagination"><span>共 {{total}} 位用户</span><el-pagination v-model:current-page="page" :total="total" :page-size="20" layout="prev,pager,next" @current-change="load"/></div>
 </section>
 <UserProfile ref="profile"/>
</template>
<style scoped>.user-management{min-width:0}.table-toolbar b{margin-left:6px}.row-actions{flex-wrap:nowrap}.developer-tag{margin-left:8px}.table-title{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}</style>
