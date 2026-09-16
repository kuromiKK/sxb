<script setup lang="ts">
import { computed, onUnmounted, ref, nextTick } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import uniIcons from '@dcloudio/uni-ui/lib/uni-icons/uni-icons.vue'
import DebugMenu from '@/components/DebugMenu.vue'
import { useAppStore } from '@/store/app'
import { backOrFallback } from '@/utils/navigation'
import { createRightsOrder, getActivePendingOrder, loadOrders, normalizeOrders, persistOrders, sortOrders, type PaymentMethod, type RightsOrder } from '@/utils/orders'
import { monthlyReports, refreshMonthlyReports, type MonthlyReport } from '@/utils/monthlyReports'
import { api, account, refreshRights, showApiError, token } from '@/services/api'
import { refreshOrders } from '@/utils/orders'
import { payConfiguredOrder } from '@/utils/product-payment'
import CustomerService from '@/components/CustomerService.vue'
import ProtocolArticle from '@/components/ProtocolArticle.vue'
import VerificationGate from '@/components/VerificationGate.vue'
import {verifiedDownload,openDownload} from '@/utils/verified-download'
const verification=ref<InstanceType<typeof VerificationGate>>()
import {siteSettings,refreshSiteSettings} from '@/services/site-settings'

type CenterMode = 'report' | 'record' | 'handouts' | 'rights' | 'orders' | 'announcements' | 'faq' | 'security' | 'about' | 'agreement' | 'privacy'
const { exam, logout } = useAppStore()
const mode = ref<CenterMode>('record')
const expanded = ref('')
const visibleCount = ref(12)
const serviceVisible = ref(false)
const markAllReadStep = ref<0 | 1>(0)
const bindVisible = ref(false)
const bindStep = ref(1)
const bindPhone = ref('')
const bindCode = ref('')
const logoutVisible = ref(false)
const codeSeconds = ref(0)
const orderNow = ref(Date.now())
const orders = ref<RightsOrder[]>(loadOrders())
const expandedOrderNo = ref('')
const purchaseNoticeVisible = ref(false)
const activePurchaseOrder = ref<RightsOrder>()
type OrderDialogMode = 'pay' | 'cancel' | 'create'
const orderDialogMode = ref<OrderDialogMode>()
const orderDialogVisible = ref(false)
const orderDialogOrder = ref<RightsOrder>()
type PaymentPhase = 'select' | 'processing' | 'failed'
const paymentPhase = ref<PaymentPhase>('select')
const selectedPaymentMethod = ref<PaymentMethod>('wechat')
const simulateNextPaymentFailure = ref(Boolean(uni.getStorageSync('sxb-debug-next-payment-failure')))
const sortedOrders = computed(() => sortOrders(orders.value))
type HandoutSystemState = 'active' | 'removed'
type HandoutRecord = {
  id: string
  title: string
  size: string
  downloadedAt: string
  downloadedVersion: string
  systemVersion: string
  systemState: HandoutSystemState
  downloadPath: string
  fileType: string
}
const handoutConfirmVisible = ref(false)
const activeHandout = ref<HandoutRecord>()
const titles: Record<CenterMode, string> = {
  report: '学习报告', record: '学习记录', handouts: '我的讲义', rights: '我的权益', orders: '我的订单', announcements: '消息中心', faq: '常见问题', security: '设置', about: '关于上行宝', agreement: '用户服务协议', privacy: '隐私政策',
}
const title = computed(() => mode.value==='about'?'关于'+siteSettings.basic.name:titles[mode.value])

const records = ref<Array<{icon:string;color:string;title:string;meta:string}>>([])
const recordStats = ref({ days: 0, answers: 0, minutes: 0 })
const me = ref<any>({})
const inviterVisible = ref(false)
const inviterCode = ref('')
const inviterBusy = ref(false)
const maskedPhone = computed(() => String(me.value.phone || '').replace(/(\d{3})\d{4}(\d{4})/, '$1****$2'))
async function bindInviter() {
  if (inviterBusy.value) return
  inviterBusy.value = true
  try {
    await api('/me/inviter', 'POST', { code: inviterCode.value.trim() })
    me.value = await api('/me')
    inviterVisible.value = false
    toast('推荐码绑定成功')
  } catch (error) { showApiError(error) } finally { inviterBusy.value = false }
}
const handouts = ref<HandoutRecord[]>([])
const announcements = ref<Array<{id:string;title:string;date:string;content:string;contentHtml?:string;schedule?:{contentId?:string};deliveryId?:string;read?:boolean}>>([])
const unreadAnnouncementIds = ref<string[]>([])
const faqs = ref<Array<{id:string;title:string;content:string;contentHtml?:string}>>([])
const faqLoading=ref(false),faqError=ref('')
const targetFaq=ref('')
const directProtocol=ref(false)
let faqRevision=0
async function loadFaqs(){
 const rev=++faqRevision,examId=exam.value.id;faqLoading.value=true;faqError.value='';faqs.value=[]
 try{const data=await api<any[]>('/faqs/'+encodeURIComponent(examId));if(rev===faqRevision&&exam.value.id===examId){faqs.value=data;const index=data.findIndex(x=>x.id===targetFaq.value);visibleCount.value=Math.max(12,index+1);expanded.value=index>=0?targetFaq.value:'';if(targetFaq.value&&index<0)faqError.value='该常见问题已下架或不适用于当前考试'}}
 catch(e:any){if(rev===faqRevision)faqError.value=e.message||'加载失败，请重试'}finally{if(rev===faqRevision){faqLoading.value=false;if(targetFaq.value&&!faqError.value){await nextTick();uni.pageScrollTo({selector:'.faq-list .fold-content',duration:0})}}}
}
onShow(()=>{if(mode.value==='faq')void loadFaqs();if(['about','agreement','privacy'].includes(mode.value))void refreshSiteSettings().catch(()=>{})})
async function loadCenterData() {
  if(['faq','about','agreement','privacy'].includes(mode.value))return
  const data = await api(`/catalog/${exam.value.id}`)
  const serverMessages = token() && mode.value==='announcements' ? await api<any[]>(`/messages?examId=${encodeURIComponent(exam.value.id)}`) : []
  announcements.value = serverMessages.length
    ? serverMessages.map((item:any)=>({...item,date:new Date(item.sent_at||item.created_at).toLocaleDateString(),content:item.content||'',deliveryId:item.delivery_id,read:Boolean(item.read_at)}))
    : data.announcements.map((item:any)=>({...item,date:new Date(item.updatedAt).toLocaleDateString(),deliveryId:null,read:false}))
  faqs.value = data.faqs
  if (!token()) return
  me.value = await api('/me')
  await refreshRights()
  const saved = await api<any[]>(`/records/${exam.value.id}`)
  const readIds = new Set(saved.filter(item=>item.kind==='announcementRead').map(item=>item.source_id))
  unreadAnnouncementIds.value = announcements.value.filter(item=>!item.read&&!readIds.has(item.id)).map(item=>item.id)
  if(mode.value==='handouts')handouts.value = (await api<any[]>(`/handout-library/${exam.value.id}`)).map(item=>({...item,size:item.sizeBytes?(item.sizeBytes>=1048576?`${(item.sizeBytes/1048576).toFixed(1)} MB`:`${Math.ceil(item.sizeBytes/1024)} KB`):'文件大小未知',downloadedAt:new Date(item.downloadedAt).toLocaleDateString()}))
  if(mode.value==='record') {
    const stats = await api(`/stats/${exam.value.id}`)
    recordStats.value = { days: stats.studyDays.length, answers: stats.daily.reduce((sum:number,row:any)=>sum+row.attempts,0), minutes: stats.minutes }
    const history=await api<any[]>(`/history/${exam.value.id}`)
    const labels:Record<string,string>={answer:'完成答题',knowledge:'查看知识点',courseProgress:'学习课程',note:'记录笔记',favorite:'收藏内容',recite:'背诵知识点',handoutDownload:'下载讲义'}
    records.value=history.map(item=>({icon:'list',color:'#3569e8',title:labels[item.kind]||'学习记录',meta:`${item.title||''} · ${new Date(item.created_at).toLocaleString()}`}))
  }
}
const visibleAnnouncements = computed(() => announcements.value.slice(0, visibleCount.value))
const visibleFaqs = computed(() => faqs.value.slice(0, visibleCount.value))

onLoad((options) => {
  if(options?.articleId)targetFaq.value=String(options.articleId)
  const next = options?.mode as CenterMode
  directProtocol.value=next==='agreement'||next==='privacy'
  if (next && titles[next]) mode.value = next
  void loadCenterData().catch(showApiError)
  if(mode.value==='report')void refreshMonthlyReports().catch(showApiError)
  if (token()&&['orders','rights'].includes(mode.value)) void refreshOrders().then(items => { orders.value = items }).catch(showApiError)
})

const orderTimer = setInterval(() => {
  orderNow.value = Date.now()
  orders.value = normalizeOrders(orders.value, orderNow.value)
}, 1000)
onUnmounted(() => clearInterval(orderTimer))

const back = () => { if (mode.value === 'agreement' || mode.value === 'privacy') { if(directProtocol.value)backOrFallback('/pages/login/index');else switchMode('about');return } backOrFallback('/pages/profile/index') }
const toggle = async (id: string) => {
  expanded.value = expanded.value === id ? '' : id
  if(mode.value==='announcements' && token()){
    const item=announcements.value.find(row=>row.id===id)
    if(item?.deliveryId) await api(`/messages/${item.deliveryId}/read`,'POST',{})
    else await api(`/records/${exam.value.id}`,'PUT',{kind:'announcementRead',sourceId:id,payload:{read:true}})
    unreadAnnouncementIds.value=unreadAnnouncementIds.value.filter(item=>item!==id)
  }
}
const toast = (title: string) => uni.showToast({ title, icon: 'none' })
const openCheatsheet=(id:string)=>uni.navigateTo({url:'/pages/cheatsheet-detail/index?id='+encodeURIComponent(id)})
const switchMode = (next: CenterMode) => { mode.value = next; expanded.value = '';if(next==='faq')void loadFaqs() }
const loadMore = () => { visibleCount.value += 12 }
const openMonthlyReport = (item: MonthlyReport) => {
  if(item.locked)return toast('学习报告仅限当前考试SVIP用户')
  if (item.status === 'generating') return toast(`${item.year}年${item.month}月报告将在次月1日生成`)
  uni.navigateTo({ url: `/pages/monthly-report/index?id=${item.id}` })
}
const markAllRead = () => {
  if (!unreadAnnouncementIds.value.length) return toast('当前没有未读公告')
  markAllReadStep.value = 1
}
const confirmMarkAllRead = async () => {
  if(!token())return toast('请先登录')
  for(const sourceId of unreadAnnouncementIds.value)await api(`/records/${exam.value.id}`,'PUT',{kind:'announcementRead',sourceId,payload:{read:true}})
  unreadAnnouncementIds.value = []
  uni.setStorageSync('sxb-unread-announcement-ids', [])
  uni.setStorageSync('sxb-unread-announcements', false)
  markAllReadStep.value = 0
  toast('已全部标记为已读')
}
const startBind = () => toast('手机号换绑将在短信验证服务接入后开放')
const sendCode = () => { if (codeSeconds.value) return; codeSeconds.value = 60; toast(`验证码已发送至${bindStep.value === 1 ? '现手机号' : '新手机号'}`); const timer = setInterval(() => { if (codeSeconds.value <= 1) { codeSeconds.value = 0; clearInterval(timer); return } codeSeconds.value -= 1 }, 1000) }
const nextBind = () => { if (bindStep.value === 1 && bindCode.value.length < 4) return toast('请输入现手机号验证码'); if (bindStep.value === 2 && !/^1\d{10}$/.test(bindPhone.value)) return toast('请输入正确的新手机号'); if (bindStep.value === 3 && bindCode.value.length < 4) return toast('请输入新手机号验证码'); if (bindStep.value < 3) { bindStep.value += 1; bindCode.value = ''; codeSeconds.value = 0; return } bindVisible.value = false; logout(); uni.showToast({ title: '换绑成功，请重新登录', icon: 'none' }); setTimeout(() => uni.reLaunch({ url: '/pages/login/index?redirect=%2Fpages%2Fprofile%2Findex' }), 500) }
const confirmSignOut = () => {
  logoutVisible.value = false
  logout()
  uni.reLaunch({ url: '/pages/login/index?redirect=%2Fpages%2Fprofile%2Findex' })
}
const handoutState = (item: HandoutRecord) => item.systemState === 'removed' ? 'removed' : item.downloadedVersion !== item.systemVersion ? 'updated' : 'available'
const handoutActionLabel = (item: HandoutRecord) => handoutState(item) === 'removed' ? '已下架' : handoutState(item) === 'updated' ? '下载新版' : '重复下载'
const openHandoutDownload = (item: HandoutRecord) => {
  if (handoutState(item) === 'removed') return toast('该讲义已从系统下架，下载记录仍为你保留')
  activeHandout.value = item
  handoutConfirmVisible.value = true
}
const saveHandoutDownloadRecord = (item: HandoutRecord) => {
  const stored: Record<string, Pick<HandoutRecord, 'downloadedAt' | 'downloadedVersion'>> = uni.getStorageSync('sxb-handout-download-records') || {}
  stored[item.id] = { downloadedAt: item.downloadedAt, downloadedVersion: item.downloadedVersion }
  uni.setStorageSync('sxb-handout-download-records', stored)
}
const openHandoutVerification = async () => {
  handoutConfirmVisible.value=false
  if(!activeHandout.value)return
  try {
    const result=await verifiedDownload(verification.value!,activeHandout.value.downloadPath)
    openDownload(result.url)
    await loadCenterData()
  }catch(error){showApiError(error)}
}
const orderStatusLabel = (status: RightsOrder['status'], backend?: string) => backend === 'refunding' ? '退款处理中' : backend === 'refunded' ? '已退款' : status === 'pending' ? '待支付' : status === 'completed' ? '已支付' : '已关闭'
const formatOrderTime = (timestamp?: number) => timestamp ? new Date(timestamp).toLocaleString('zh-CN', { hour12: false }).replaceAll('/', '-') : '—'
const orderCountdown = (item: RightsOrder) => {
  if (item.status !== 'pending' || !item.expiresAt) return ''
  const remaining = Math.max(item.expiresAt - orderNow.value, 0)
  const minutes = Math.floor(remaining / 60000)
  const seconds = Math.floor(remaining % 60000 / 1000)
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}
const toggleOrder = (orderNo: string) => { expandedOrderNo.value = expandedOrderNo.value === orderNo ? '' : orderNo }
const updateOrder = (orderNo: string, update: Partial<RightsOrder>) => {
  orders.value = orders.value.map(item => item.no === orderNo ? { ...item, ...update } : item)
  persistOrders(orders.value)
}
const continuePayment = async (item: RightsOrder) => {
  try{const options=await api('/payments/options');if(!options.test){uni.navigateTo({url:'/pages/payment/index?orderId='+encodeURIComponent(item.no)});return}}catch(e){showApiError(e);return}
  orderDialogOrder.value = item
  orderDialogMode.value = 'pay'
  selectedPaymentMethod.value = item.lastPaymentMethod || 'wechat'
  paymentPhase.value = item.lastPaymentError ? 'failed' : 'select'
  orderDialogVisible.value = true
}
const cancelOrder = (item: RightsOrder) => {
  orderDialogOrder.value = item
  orderDialogMode.value = 'cancel'
  orderDialogVisible.value = true
}
const viewRights = () => switchMode('rights')
const repurchase = () => startRightsPurchase()
const startRightsPurchase = () => {
  orders.value = normalizeOrders(orders.value)
  const pending = getActivePendingOrder(orders.value)
  if (pending) {
    activePurchaseOrder.value = pending
    purchaseNoticeVisible.value = true
    return
  }
  uni.navigateTo({url:'/pages/products/index'})
}
const openPendingOrder = () => {
  if (!activePurchaseOrder.value) return
  purchaseNoticeVisible.value = false
  expandedOrderNo.value = activePurchaseOrder.value.no
  switchMode('orders')
}
const closeOrderDialog = () => {
  orderDialogVisible.value = false
  orderDialogMode.value = undefined
  orderDialogOrder.value = undefined
  paymentPhase.value = 'select'
}
const paymentMethodLabel = (method?: PaymentMethod) => method === 'alipay' ? '支付宝支付' : '微信支付'
const selectPaymentMethod = (method: PaymentMethod) => {
  if (paymentPhase.value === 'processing') return
  selectedPaymentMethod.value = method
  if (paymentPhase.value === 'failed') paymentPhase.value = 'select'
}
const finishPaymentAttempt = async (item: RightsOrder) => {
  try {
    if (selectedPaymentMethod.value !== 'wechat') throw new Error('首版仅支持微信测试支付')
    const result = await payConfiguredOrder(item.no, simulateNextPaymentFailure.value ? 'failure' : 'success')
    if(!result){paymentPhase.value='select';return}
    simulateNextPaymentFailure.value = false
    orders.value = await refreshOrders()
    await refreshRights()
    if (result.paymentFailed) { paymentPhase.value = 'failed'; return }
    expandedOrderNo.value = item.no
    closeOrderDialog()
    toast('测试支付成功，未扣款')
  } catch (error) { paymentPhase.value = 'failed'; showApiError(error) }
  return
  /* The database is authoritative for order and membership state.
  if (simulateNextPaymentFailure.value) {
    simulateNextPaymentFailure.value = false
    uni.removeStorageSync('sxb-debug-next-payment-failure')
    paymentPhase.value = 'failed'
    updateOrder(item.no, {
      lastPaymentMethod: selectedPaymentMethod.value,
      lastPaymentAt: Date.now(),
      lastPaymentError: '支付未完成，请检查支付账户后重试',
    })
    orderDialogOrder.value = orders.value.find(order => order.no === item.no)
    return
  }
  updateOrder(item.no, {
    status: 'completed',
    backendStatus: 'paid',
    paidAt: Date.now(),
    paymentMethod: paymentMethodLabel(selectedPaymentMethod.value),
    lastPaymentMethod: selectedPaymentMethod.value,
    lastPaymentAt: Date.now(),
    lastPaymentError: undefined,
    validity: `${new Date().toISOString().slice(0, 10)} 起 12 个月`,
  })
  expandedOrderNo.value = item.no
  closeOrderDialog()
  toast('支付成功，权益已生效')
  */
}
const submitPayment = (item: RightsOrder) => {
  if (paymentPhase.value === 'processing') return
  paymentPhase.value = 'processing'
  setTimeout(() => finishPaymentAttempt(item), 900)
}
const confirmOrderDialog = async () => {
  try {
  if (orderDialogMode.value === 'create') {
    closeOrderDialog()
    uni.navigateTo({url:'/pages/products/index'})
    return
  }
  const item = orderDialogOrder.value
  if (!item) return closeOrderDialog()
  if (orderDialogMode.value === 'pay') {
    submitPayment(item)
    return
  }
  await api(`/orders/${item.no}/cancel`, 'POST')
  orders.value = await refreshOrders()
  expandedOrderNo.value = ''
  closeOrderDialog()
  toast('订单已取消')
  } catch (error) { showApiError(error) }
}
const applyOrderDebug = (key: string) => {
  if (key === 'next-payment-failure') {
    simulateNextPaymentFailure.value = true
    uni.setStorageSync('sxb-debug-next-payment-failure', true)
    toast('下一次支付将模拟失败')
    return
  }
  if (key !== 'first-pending') return
  return toast('请创建新的测试订单，不能修改历史订单状态')
  /* Historical order state is controlled by the server.
  const now = Date.now()
  const firstOrder = sortOrders(orders.value)[0]
  if (!firstOrder) return
  orders.value = orders.value.map((item) => {
    if (item.no === firstOrder.no) {
      return {
        ...item,
        amount: '799.00',
        status: 'pending',
        backendStatus: 'pending_payment',
        createdAt: now,
        expiresAt: now + 30 * 60 * 1000,
        paidAt: undefined,
        paymentMethod: undefined,
        lastPaymentMethod: undefined,
        lastPaymentAt: undefined,
        lastPaymentError: undefined,
        closeReason: undefined,
        validity: '支付成功后 12 个月',
      }
    }
    if (item.status !== 'pending') return item
    return { ...item, status: 'closed', backendStatus: 'closed', closeReason: '调试切换时自动关闭原待支付订单' }
  })
  persistOrders(orders.value)
  orderNow.value = now
  expandedOrderNo.value = firstOrder.no
  toast('第一条订单已设为待支付')
  */
}
const applyAnnouncementDebug = (key: string) => {
  if (key !== 'restore-unread') return
  unreadAnnouncementIds.value = [announcements.value[0], announcements.value[1], announcements.value[2], announcements.value[5]]
    .filter(Boolean)
    .map(item => item.id)
  uni.setStorageSync('sxb-unread-announcement-ids', unreadAnnouncementIds.value)
  uni.setStorageSync('sxb-unread-announcements', true)
  toast('前三条和第6条已设为未读')
}
</script>

<template>
  <view class="center-page page safe-top">
    <view class="top-bar"><button @tap="back"><uni-icons type="back" size="21" color="#4d5c73" /></button><text>{{ title }}</text><view></view><text v-if="mode === 'announcements'" class="top-bar-action" @tap="markAllRead">全部已读</text></view>

    <view v-if="mode === 'report'" class="report-archive"><view class="report-archive-hero"><view class="archive-hero-icon"><uni-icons type="map-filled" size="29" color="#e2c476" /></view><view><text>月度学习报告</text><text>每个自然月生成一次，记录学习成果与下月计划</text></view><text>{{ monthlyReports.filter(item => item.status === 'ready').length }}份</text></view><view class="report-year"><text>{{ new Date().getFullYear() }}年</text></view><view class="report-list"><view v-for="item in monthlyReports" :key="item.id" class="report-row" :class="{ generating: item.status === 'generating' }" @tap="openMonthlyReport(item)"><view class="report-month"><text>{{ String(item.month).padStart(2, '0') }}</text><text>月</text></view><view class="report-row-copy"><view><text>{{ item.year }}年{{ item.month }}月学习报告</text><text :class="item.status">{{ item.status === 'ready' ? '已生成' : '生成中' }}</text></view><view v-if="item.status === 'ready'" class="report-meta"><text>学习{{ item.metrics.studyDays }}天</text><text>{{ item.metrics.questions }}题</text><text>掌握 +{{ item.metrics.masteryGain }}%</text></view><view v-else class="generating-progress"><view><view></view></view><text>将在{{ item.month === 12 ? 1 : item.month + 1 }}月1日生成</text></view></view><uni-icons :type="item.status === 'ready' ? 'forward' : 'clock'" size="19" :color="item.status === 'ready' ? '#b99b50' : '#8792a4'" /></view></view></view>

    <view v-else-if="mode === 'record'" class="content-block"><view class="summary-band"><view><text>{{ recordStats.days }}</text><text>累计学习天数</text></view><view><text>{{ recordStats.answers }}</text><text>累计刷题</text></view><view><text>{{ recordStats.minutes }}</text><text>学习分钟</text></view></view><view class="list-card"><view v-for="item in records" :key="item.title" class="record-row"><view class="row-icon" :style="{ background: `${item.color}16` }"><uni-icons :type="item.icon" size="20" :color="item.color" /></view><view><text>{{ item.title }}</text><text>{{ item.meta }}</text></view></view></view></view>

    <view v-else-if="mode === 'handouts'" class="content-block handout-block"><view class="page-note"><uni-icons type="info" size="18" color="#3569e8" /><text>下面是已经下载过的讲义记录，点击可重复下载。</text></view><view class="list-card handout-list"><view v-for="item in handouts" :key="item.id" class="handout-row" :class="`is-${handoutState(item)}`" @tap="openHandoutDownload(item)"><view class="pdf-icon">{{ item.fileType }}</view><view class="handout-record-copy"><text>{{ item.title }}</text><text>{{ item.size }} · 下载于 {{ item.downloadedAt }} · v{{ item.downloadedVersion }}</text></view><view class="handout-row-action"><button :disabled="handoutState(item) === 'removed'" @tap.stop="openHandoutDownload(item)">{{ handoutActionLabel(item) }}</button></view></view></view></view>

    <view v-else-if="mode === 'rights'" class="content-block"><view class="rights-hero"><text>{{ account.level === 'free' ? '普通会员' : account.level.toUpperCase() }}</text><view><text>{{ account.level === 'svip' ? 'SVIP' : account.level === 'vip' ? 'VIP' : '普通会员' }}</text><text>{{ account.expiresAt ? `有效至 ${new Date(account.expiresAt).toLocaleDateString()}` : '当前考试普通会员权益' }}</text></view></view><view class="section-label">当前已解锁</view><view class="benefit-list"><view v-for="item in account.permissionLabels" :key="item"><uni-icons type="checkmarkempty" size="18" color="#1a9a7b" /><text>{{ item }}</text></view></view><text class="page-note">按当前考试实际权益展示；资料开放时间、发布状态及 AI 服务启用状态另行生效。</text><button class="primary-button" @tap="startRightsPurchase">查看会员商品</button></view>

    <view v-else-if="mode === 'orders'" class="content-block order-block"><view class="order-tip"><uni-icons type="info" size="18" color="#5f748b" /><text>待支付订单30分钟内有效，点击订单可展开查看详情。</text></view><view class="order-list"><view v-for="item in sortedOrders" :key="item.no" class="order-item" :class="[`status-${item.status}`, { expanded: expandedOrderNo === item.no }]" @tap="toggleOrder(item.no)"><view class="order-summary"><view class="order-main"><view class="order-title-line"><text>{{ item.productName }}</text><text class="order-status">{{ orderStatusLabel(item.status, item.backendStatus) }}</text></view><text class="order-time">{{ formatOrderTime(item.createdAt) }}</text></view><view class="order-price"><text>¥{{ item.amount }}</text><uni-icons :type="expandedOrderNo === item.no ? 'up' : 'down'" size="17" color="#8995a5" /></view></view><view v-if="item.status === 'pending'" class="pending-countdown"><view class="pulse-dot"></view><text>支付剩余 {{ orderCountdown(item) }}</text></view><view v-if="expandedOrderNo === item.no" class="order-detail" @tap.stop><view class="detail-line"><text>订单编号</text><text>{{ item.no }}</text></view><view class="detail-line"><text>购买权益</text><text>{{ item.rightsName }}</text></view><view class="detail-line"><text>权益期限</text><text>{{ item.validity || '—' }}</text></view><view class="detail-line"><text>支付方式</text><text>{{ item.paymentMethod || '待选择' }}</text></view><view v-if="item.paidAt" class="detail-line"><text>支付时间</text><text>{{ formatOrderTime(item.paidAt) }}</text></view><view v-if="item.lastPaymentError" class="detail-line payment-failed-line"><text>最近支付</text><text>{{ paymentMethodLabel(item.lastPaymentMethod) }}失败 · {{ item.lastPaymentError }}</text></view><view v-if="item.closeReason" class="detail-line close-reason"><text>关闭原因</text><text>{{ item.closeReason }}</text></view><view class="detail-line total-line"><text>实付金额</text><text>¥{{ item.amount }}</text></view><view v-if="item.status === 'pending'" class="order-actions"><button class="secondary" @tap="cancelOrder(item)">取消订单</button><button @tap="continuePayment(item)">继续支付</button></view><view v-else-if="item.status === 'completed'" class="order-actions"><button class="secondary" @tap="serviceVisible = true">联系客服</button><button @tap="viewRights">查看当前权益</button></view><view v-else class="order-actions single"><button @tap="repurchase">重新购买</button></view></view></view></view></view>

<view v-else-if="mode === 'announcements'" class="content-block"><view class="list-card fold-list announcement-list"><view v-for="item in visibleAnnouncements" :key="item.id" class="fold-item" @tap="toggle(item.id)"><view class="fold-head"><view><view class="notice-title"><view v-if="unreadAnnouncementIds.includes(item.id)" class="item-unread"></view><text>{{ item.title }}</text></view><text>{{ item.date }}</text></view><uni-icons :type="expanded === item.id ? 'up' : 'down'" size="17" color="#8b96a5" /></view><view v-if="expanded === item.id" class="fold-content"><rich-text v-if="item.contentHtml" :nodes="item.contentHtml"/><text v-else>{{ item.content }}</text><button v-if="item.schedule?.contentId" @tap.stop="openCheatsheet(item.schedule.contentId)">查看资料</button><view v-if="item.id.includes('notice-1')" class="notice-media"><uni-icons type="image" size="28" color="#fff" /><text>内部版 0.1 功能更新概览</text></view></view></view><view v-if="visibleAnnouncements.length < announcements.length" class="announcement-load-more" @tap="loadMore"><text>加载更多</text><uni-icons type="arrowdown" size="17" color="#5b50b9" /></view><text v-else class="list-end">已加载全部公告</text></view></view>

    <view v-else-if="mode === 'faq'" class="content-block"><view v-if="faqLoading" class="list-end">正在加载常见问题…</view><view v-else-if="faqError" class="list-end" @tap="loadFaqs">{{faqError}} · 点击重试</view><view v-else-if="!faqs.length" class="list-end">暂无常见问题</view><view v-else class="list-card fold-list faq-list"><view v-for="item in visibleFaqs" :key="item.id" class="fold-item" @tap="toggle(item.id)"><view class="fold-head"><view><text>{{ item.title }}</text></view><uni-icons :type="expanded === item.id ? 'up' : 'down'" size="17" color="#8b96a5" /></view><view v-if="expanded === item.id" class="fold-content"><rich-text v-if="item.contentHtml" :nodes="item.contentHtml"/><text v-else>{{ item.content }}</text></view></view><view v-if="visibleFaqs.length < faqs.length" class="announcement-load-more" @tap="loadMore"><text>加载更多</text><uni-icons type="arrowdown" size="17" color="#5b50b9" /></view><text v-else class="list-end">已加载全部问题</text></view></view>

    <view v-else-if="mode === 'security'" class="content-block"><view class="list-card settings-list security-list"><view><text>登录手机号</text><text>{{ maskedPhone || '未登录' }}</text></view><view><text>微信账号</text><text>尚未接入</text></view><view><text>我的推荐码</text><text>{{ me.invite_code || '-' }}</text></view><view @tap="!me.inviter_id && (inviterVisible = true)"><text>绑定推荐码</text><text>{{ me.inviter_id ? '已绑定' : '未绑定' }}</text></view><view @tap="startBind"><text>更换绑定手机号</text><uni-icons type="right" size="18" color="#a2adbb" /></view><view class="logout-row" @tap="logoutVisible = true"><text>退出登录</text><uni-icons type="right" size="18" color="#c85056" /></view></view></view>

    <view v-else-if="mode === 'about'" class="about-block"><image v-if="siteSettings.basic.logo" class="about-logo" :src="siteSettings.basic.logo" mode="aspectFit" alt="平台 Logo"/><view v-else class="brand-mark">{{siteSettings.basic.name.slice(0,1)}}</view><text class="brand-name">{{siteSettings.basic.name}}</text><view class="about-intro"><rich-text :nodes="siteSettings.about.html"/></view><view class="list-card settings-list about-menu"><view @tap="switchMode('agreement')"><text>用户服务协议</text><text>V{{siteSettings.protocols.find(p=>p.kind==='agreement')?.version||'—'}} ›</text></view><view @tap="switchMode('privacy')"><text>隐私政策</text><text>V{{siteSettings.protocols.find(p=>p.kind==='privacy')?.version||'—'}} ›</text></view></view><text v-if="siteSettings.about.operator" class="copyright">{{siteSettings.about.operator}}</text><text v-if="siteSettings.about.copyright" class="copyright">{{siteSettings.about.copyright}}</text><text v-if="siteSettings.about.filing" class="copyright">{{siteSettings.about.filing}}</text></view>

    <ProtocolArticle v-else :kind="mode"/>
    <view v-if="markAllReadStep" class="modal-mask announcement-modal-mask" @tap="markAllReadStep = 0"><view class="announcement-modal" @tap.stop><view class="announcement-modal-accent"></view><view class="announcement-modal-icon"><uni-icons type="email-filled" size="30" color="#fff" /></view><text class="announcement-modal-title">全部标记为已读？</text><text class="announcement-modal-desc">将清除 {{ unreadAnnouncementIds.length }} 条公告的未读标记，公告内容仍会保留。</text><view class="announcement-modal-count"><text>{{ unreadAnnouncementIds.length }}</text><text>条未读公告</text></view><view class="announcement-modal-actions"><button @tap="markAllReadStep = 0">暂不处理</button><button @tap="confirmMarkAllRead">确定</button></view></view></view>
    <CustomerService v-model="serviceVisible"/>
    <view v-if="logoutVisible || bindVisible" class="modal-mask" @tap="logoutVisible = false; bindVisible = false">
      <view v-if="logoutVisible" class="center-modal logout-modal" @tap.stop><view class="modal-mark danger-mark"><uni-icons type="undo" size="27" color="#fff" /></view><text class="modal-title">确认退出登录？</text><text class="modal-desc modal-copy">退出后仍可浏览公开内容，错题、收藏和学习进度不会丢失；深度学习功能需要重新登录。</text><button class="logout-confirm" @tap="confirmSignOut">确认退出</button><button class="modal-cancel" @tap="logoutVisible = false">暂不退出</button></view>
      <view v-else class="center-modal bind-modal" @tap.stop><text class="modal-title">更换绑定手机号</text><text class="modal-desc">{{ bindStep === 1 ? '先验证当前手机号 138****6452' : bindStep === 2 ? '输入新的手机号' : `验证新手机号 ${bindPhone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')}` }}</text><input v-if="bindStep === 2" v-model="bindPhone" class="modal-input" type="number" placeholder="请输入新手机号" maxlength="11" /><view v-if="bindStep !== 2" class="code-input-row"><input v-model="bindCode" class="modal-input" type="number" placeholder="请输入6位验证码" maxlength="6" /><button @tap="sendCode">{{ codeSeconds ? `${codeSeconds}s` : '获取验证码' }}</button></view><button class="modal-primary" @tap="nextBind">{{ bindStep === 3 ? '确认换绑并重新登录' : '下一步' }}</button><button class="modal-cancel" @tap="bindVisible = false">取消</button></view>
    </view>
    <view v-if="handoutConfirmVisible" class="modal-mask" @tap="handoutConfirmVisible = false"><view v-if="activeHandout" class="center-modal handout-modal" @tap.stop><view class="modal-mark handout-mark"><uni-icons type="download" size="27" color="#fff" /></view><text class="modal-title">{{ handoutState(activeHandout) === 'updated' ? '下载新版讲义' : '重复下载讲义' }}</text><text class="modal-desc modal-copy">即将下载《{{ activeHandout.title }}》，继续前需要完成验证码校验。</text><view class="handout-version-card"><view><text>上次下载</text><text>v{{ activeHandout.downloadedVersion }}</text></view><view><text>系统版本</text><text :class="{ updated: handoutState(activeHandout) === 'updated' }">v{{ activeHandout.systemVersion }}</text></view><view><text>文件大小</text><text>{{ activeHandout.size }}</text></view></view><button class="modal-primary" @tap="openHandoutVerification">继续验证</button><button class="modal-cancel" @tap="handoutConfirmVisible = false">取消</button></view></view>
    <VerificationGate ref="verification"/>
    <view v-if="purchaseNoticeVisible" class="modal-mask" @tap="purchaseNoticeVisible = false"><view v-if="activePurchaseOrder" class="center-modal purchase-notice" @tap.stop><view class="modal-mark pending-mark"><uni-icons type="wallet" size="27" color="#fff" /></view><text class="modal-title">存在待支付订单</text><text class="modal-desc modal-copy">你已有一笔{{ activePurchaseOrder.rightsName }}订单，请先支付、取消或等待订单自动失效后再创建新订单。</text><view class="pending-order-summary"><text>{{ activePurchaseOrder.productName }}</text><view><text>¥{{ activePurchaseOrder.amount }}</text><text>剩余 {{ orderCountdown(activePurchaseOrder) }}</text></view></view><button class="modal-primary" @tap="openPendingOrder">查看待支付订单</button><button class="modal-cancel" @tap="purchaseNoticeVisible = false">取消</button></view></view>
    <view v-if="orderDialogVisible && orderDialogMode" class="modal-mask order-dialog-mask" @tap="paymentPhase !== 'processing' && closeOrderDialog()">
      <view class="order-dialog" :class="`dialog-${orderDialogMode}`" @tap.stop>
        <view class="order-dialog-top"><view class="order-dialog-icon"><uni-icons :type="orderDialogMode === 'cancel' ? 'closeempty' : orderDialogMode === 'pay' ? 'wallet' : 'medal'" size="28" color="#fff" /></view><view class="order-dialog-heading"><text>{{ orderDialogMode === 'pay' ? '订单支付' : orderDialogMode === 'cancel' ? '取消订单' : '创建权益订单' }}</text><text>{{ orderDialogMode === 'pay' ? '选择支付方式并完成付款' : orderDialogMode === 'cancel' ? '订单关闭后可重新选择权益' : '订单创建后30分钟内有效' }}</text></view><button :disabled="paymentPhase === 'processing'" @tap="closeOrderDialog"><uni-icons type="closeempty" size="20" color="#7d8a9c" /></button></view>
        <view class="order-dialog-product"><view><text>{{ orderDialogOrder?.productName || '会员商品' }}</text><text>{{ orderDialogOrder?.rightsName || '会员权益' }} · 以订单对应考期为准</text></view><text>¥{{ orderDialogOrder?.amount || '—' }}</text></view>
        <view v-if="orderDialogMode === 'pay'" class="payment-methods">
          <text>选择支付方式</text>
          <view class="payment-method-list">
            <view :class="{ active: selectedPaymentMethod === 'wechat' }" @tap="selectPaymentMethod('wechat')"><view class="pay-brand wechat">微</view><view><text>微信支付</text><text>使用微信安全支付</text></view><uni-icons :type="selectedPaymentMethod === 'wechat' ? 'checkbox-filled' : 'circle'" size="21" :color="selectedPaymentMethod === 'wechat' ? '#19a974' : '#b2bbc7'" /></view>
            <!-- #ifdef H5 -->
            <!-- #endif -->
          </view>
        </view>
        <view v-if="orderDialogMode === 'pay' && paymentPhase === 'failed'" class="payment-result failed"><uni-icons type="closeempty" size="19" color="#c85056" /><view><text>支付未完成</text><text>{{ orderDialogOrder?.lastPaymentError || '请更换支付方式或稍后重试' }}</text></view></view><view v-else-if="orderDialogMode === 'pay' && paymentPhase === 'processing'" class="payment-result processing"><view class="payment-spinner"></view><view><text>正在发起{{ paymentMethodLabel(selectedPaymentMethod) }}</text><text>演示环境不会跳转第三方支付页面</text></view></view><view v-else-if="orderDialogMode === 'pay' && orderDialogOrder" class="order-dialog-notice"><uni-icons type="clock" size="18" color="#3569e8" /><text>请在 {{ orderCountdown(orderDialogOrder) }} 内完成支付</text></view><view v-else-if="orderDialogMode === 'cancel'" class="order-dialog-notice danger"><uni-icons type="info" size="18" color="#c85056" /><text>取消后本订单立即关闭，无法恢复</text></view><view v-else class="order-dialog-notice"><uni-icons type="info" size="18" color="#3569e8" /><text>有效期内不能重复创建新的权益订单</text></view>
        <view class="order-dialog-actions"><button :disabled="paymentPhase === 'processing'" @tap="closeOrderDialog">{{ orderDialogMode === 'cancel' ? '保留订单' : '暂不操作' }}</button><button :disabled="paymentPhase === 'processing'" :class="{ danger: orderDialogMode === 'cancel' }" @tap="confirmOrderDialog">{{ orderDialogMode === 'pay' ? paymentPhase === 'processing' ? '支付处理中' : paymentPhase === 'failed' ? '重新支付' : `${paymentMethodLabel(selectedPaymentMethod)} ¥${orderDialogOrder?.amount}` : orderDialogMode === 'cancel' ? '确认取消' : '确认创建' }}</button></view>
      </view>
    </view>
    <view v-if="inviterVisible" class="modal-mask" @tap="inviterVisible = false"><view class="center-modal" @tap.stop><text class="modal-title">绑定推荐码</text><text class="modal-desc">绑定后不可更换</text><input v-model="inviterCode" class="modal-input" type="number" maxlength="12" placeholder="请输入数字推荐码" /><button class="modal-primary" :loading="inviterBusy" :disabled="inviterBusy" @tap="bindInviter">确认绑定</button><button class="modal-cancel" @tap="inviterVisible = false">取消</button></view></view>
    <DebugMenu v-if="mode === 'orders'" page="我的订单" :options="[{ key: 'first-pending', label: '第一条订单设为待支付' }, { key: 'next-payment-failure', label: '下次支付模拟失败' }]" @select="applyOrderDebug" />
    <DebugMenu v-if="mode === 'announcements'" page="公告" :options="[{ key: 'restore-unread', label: '前三条和第6条设为未读' }]" @select="applyAnnouncementDebug" />
  </view>
</template>
<style scoped>.about-logo{display:block;width:80px;height:80px;margin:0 auto;object-fit:contain;border-radius:16px}.about-intro{margin:20px 0;font-size:15px;line-height:1.85;color:#34445b;text-align:left;overflow-wrap:anywhere}.about-menu{width:100%}</style>

<style scoped lang="scss">
.center-page { max-width:430px; margin:0 auto; padding-top:calc(env(safe-area-inset-top) + 18rpx); padding-bottom:42rpx; background:#f5f7fb; }.top-bar { display:flex; align-items:center; justify-content:space-between; height:58rpx; }.top-bar button { width:58rpx; height:58rpx; display:flex; align-items:center; justify-content:center; margin:0; padding:0; background:#edf1fb; border-radius:15rpx; }.top-bar button::after { display:none; }.top-bar>text { color:#1e3048; font-size:var(--sxb-text-title); font-weight:700; }.top-bar>view { width:58rpx; }.content-block,.about-block,.article-block,.empty-block { margin-top:20rpx; }.summary-band { display:grid; grid-template-columns:repeat(3,1fr); padding:19rpx 6rpx; background:linear-gradient(120deg,#edf3ff,#f3efff); border:1rpx solid #dce5fa; border-radius:12rpx; }.summary-band view { display:flex; align-items:center; flex-direction:column; gap:5rpx; border-right:1rpx solid #dfe5f2; }.summary-band view:last-child { border-right:0; }.summary-band text:first-child { color:#263953; font-size:var(--sxb-text-title); font-weight:700; }.summary-band text:last-child { color:#7f8da1; font-size:var(--sxb-text-meta); }.list-card { margin-top:14rpx; padding:0 17rpx; background:#fff; border:1rpx solid #e0e6f0; border-radius:12rpx; }.record-row { display:flex; align-items:center; gap:12rpx; min-height:78rpx; border-bottom:1rpx solid #edf0f5; }.record-row:last-child { border-bottom:0; }.row-icon { width:43rpx; height:43rpx; display:flex; align-items:center; justify-content:center; flex:none; border-radius:11rpx; }.record-row>view:last-child { display:flex; flex:1; min-width:0; flex-direction:column; gap:5rpx; }.record-row>view:last-child text:first-child { color:#2c3d55; font-size:var(--sxb-text-body); font-weight:700; }.record-row>view:last-child text:last-child { overflow:hidden; color:#8995a5; font-size:var(--sxb-text-meta); text-overflow:ellipsis; white-space:nowrap; }.page-note { display:flex; align-items:flex-start; gap:7rpx; padding:13rpx 14rpx; color:#5f6f87; background:#edf3ff; border-radius:9rpx; font-size:var(--sxb-text-meta); line-height:1.5; }.handout-row { display:flex; align-items:center; gap:11rpx; min-height:88rpx; border-bottom:1rpx solid #edf0f5; }.handout-row:last-child { border-bottom:0; }.pdf-icon { width:42rpx; height:47rpx; display:flex; align-items:center; justify-content:center; flex:none; color:#d45d63; background:#fff0ef; border-radius:8rpx; font-size:var(--sxb-text-meta); font-weight:700; }.handout-row>view:nth-child(2) { display:flex; flex:1; min-width:0; flex-direction:column; gap:5rpx; }.handout-row>view:nth-child(2) text:first-child { overflow:hidden; color:#2c3d55; font-size:var(--sxb-text-small); font-weight:700; text-overflow:ellipsis; white-space:nowrap; }.handout-row>view:nth-child(2) text:last-child { color:#8b96a5; font-size:var(--sxb-text-meta); }.handout-row button { width:auto; height:40rpx; line-height:40rpx; margin:0; padding:0 10rpx; color:#3569e8; background:#eaf0ff; border-radius:7rpx; font-size:var(--sxb-text-meta); }.handout-row button::after { display:none; }.rights-hero { display:flex; align-items:center; gap:14rpx; padding:22rpx; color:#fff; background:linear-gradient(105deg,#315fda,#6952ce); border-radius:13rpx; box-shadow:0 12rpx 26rpx rgba(68,79,187,.18); }.rights-hero>text { width:58rpx; height:58rpx; display:flex; align-items:center; justify-content:center; background:rgba(255,255,255,.16); border-radius:16rpx; font-size:var(--sxb-text-body); font-weight:700; }.rights-hero>view { display:flex; flex-direction:column; gap:5rpx; }.rights-hero>view text:first-child { font-size:var(--sxb-text-title); font-weight:700; }.rights-hero>view text:last-child { color:#dbe1ff; font-size:var(--sxb-text-meta); }.section-label { margin:24rpx 0 11rpx; color:#22354e; font-size:var(--sxb-text-body); font-weight:700; }.benefit-list { padding:6rpx 17rpx; background:#fff; border:1rpx solid #e0e6f0; border-radius:12rpx; }.benefit-list view { display:flex; align-items:center; gap:9rpx; min-height:58rpx; border-bottom:1rpx solid #edf0f5; color:#34475f; font-size:var(--sxb-text-small); }.benefit-list view:last-child { border-bottom:0; }.primary-button { width:100%; height:61rpx; line-height:61rpx; margin:18rpx 0 0; padding:0; color:#fff; background:linear-gradient(100deg,#3569e8,#6949df); border-radius:9rpx; font-size:var(--sxb-text-body); font-weight:700; }.primary-button::after { display:none; }.order-list { margin-top:0; }.order-item { padding:18rpx 0; border-bottom:1rpx solid #edf0f5; }.order-item:last-child { border-bottom:0; }.order-head,.order-foot { display:flex; align-items:center; justify-content:space-between; }.order-head text:first-child { color:#263953; font-size:var(--sxb-text-body); font-weight:700; }.order-head text:last-child { color:#1a9a7b; font-size:var(--sxb-text-meta); font-weight:700; }.order-no { display:block; margin-top:8rpx; color:#8a96a5; font-size:var(--sxb-text-meta); }.order-foot { margin-top:10rpx; color:#7b8797; font-size:var(--sxb-text-meta); }.order-foot text:last-child { color:#243650; font-size:var(--sxb-text-body); font-weight:700; }.fold-list { margin-top:0; }.fold-item { padding:17rpx 0; border-bottom:1rpx solid #edf0f5; }.fold-item:last-child { border-bottom:0; }.fold-head { display:flex; align-items:center; gap:10rpx; }.fold-head>view { display:flex; flex:1; min-width:0; flex-direction:column; gap:5rpx; }.fold-head>view text:first-child { color:#2b3d56; font-size:var(--sxb-text-body); line-height:1.45; font-weight:700; }.fold-head>view text:last-child { color:#929dab; font-size:var(--sxb-text-meta); }.fold-content { display:block; margin-top:13rpx; padding:13rpx; color:#5f7087; background:#f6f8fb; border-radius:8rpx; font-size:var(--sxb-text-small); line-height:1.65; }.settings-list { margin-top:0; }.settings-list>view { min-height:67rpx; display:flex; align-items:center; justify-content:space-between; gap:12rpx; border-bottom:1rpx solid #edf0f5; color:#2c3d55; font-size:var(--sxb-text-small); }.settings-list>view:last-child { border-bottom:0; }.settings-list>view>text:last-child { color:#8793a3; font-size:var(--sxb-text-meta); }.danger { color:#c85056; }.about-block { display:flex; align-items:center; flex-direction:column; }.brand-mark { width:72rpx; height:72rpx; display:flex; align-items:center; justify-content:center; color:#fff; background:linear-gradient(135deg,#3569e8,#7655df); border-radius:19rpx; font-size:var(--sxb-text-heading); font-weight:700; }.brand-name { margin-top:12rpx; color:#20334b; font-size:var(--sxb-text-title); font-weight:700; }.brand-version { margin-top:4rpx; color:#8b96a5; font-size:var(--sxb-text-meta); }.about-menu { width:100%; box-sizing:border-box; margin-top:24rpx; }.copyright { margin-top:23rpx; color:#a0a9b5; font-size:var(--sxb-text-meta); }.article-title { display:block; color:#20334b; font-size:var(--sxb-text-title); font-weight:700; }.article-date { display:block; margin-top:7rpx; color:#919ba8; font-size:var(--sxb-text-meta); }.article-text { display:block; margin-top:18rpx; color:#4c5e75; font-size:var(--sxb-text-body); line-height:1.9; }.empty-block { display:flex; align-items:center; flex-direction:column; padding:86rpx 28rpx; color:#7c899b; text-align:center; }.empty-icon { width:68rpx; height:68rpx; display:flex; align-items:center; justify-content:center; background:#e9efff; border-radius:18rpx; }.empty-block>text:nth-child(2) { margin-top:15rpx; color:#263953; font-size:var(--sxb-text-body); font-weight:700; }.empty-block>text:last-child { margin-top:8rpx; font-size:var(--sxb-text-small); line-height:1.55; }
.top-bar-action { width:58rpx; color:#3569e8 !important; font-size:var(--sxb-text-small) !important; font-weight:700 !important; text-align:right; white-space:nowrap; }.notice-title { display:flex; align-items:center; gap:8rpx; }.item-unread { width:10rpx; height:10rpx; flex:none; background:#e45e64; border-radius:50%; }.fold-head>view text:first-child { font-size:var(--sxb-text-body); line-height:1.5; }.fold-head>view text:last-child { font-size:var(--sxb-text-meta); }.notice-media { height:120rpx; display:flex; align-items:center; justify-content:center; flex-direction:column; gap:7rpx; margin-top:12rpx; color:#fff; background:linear-gradient(120deg,#3569e8,#7655df); border-radius:9rpx; font-size:var(--sxb-text-meta); font-weight:700; }.load-more { display:flex; align-items:center; justify-content:center; height:58rpx; color:#3569e8; border-top:1rpx solid #edf0f5; font-size:var(--sxb-text-small); font-weight:700; }.list-end { display:block; padding:20rpx 0; color:#9aa5b4; border-top:1rpx solid #edf0f5; font-size:var(--sxb-text-meta); text-align:center; }.modal-mask { position:fixed; z-index:100; inset:0; display:flex; align-items:center; justify-content:center; padding:28rpx; background:rgba(20,31,51,.52); }.center-modal { width:100%; max-width:350px; box-sizing:border-box; display:flex; align-items:center; flex-direction:column; padding:24rpx; background:#fff; border-radius:16rpx; box-shadow:0 22rpx 52rpx rgba(22,37,64,.24); }.modal-title { margin-top:14rpx; color:#22354d; font-size:var(--sxb-text-item); font-weight:700; }.modal-desc { margin-top:7rpx; color:#7f8da1; font-size:var(--sxb-text-meta); line-height:1.5; text-align:center; }.modal-time { margin-top:7rpx; color:#1a9a7b; font-size:var(--sxb-text-meta); }.modal-mark { width:60rpx; height:60rpx; display:flex; align-items:center; justify-content:center; background:#1a9a7b; border-radius:17rpx; }.danger-mark { background:#c85056; }.qr-code { width:180rpx; height:180rpx; box-sizing:border-box; display:grid; grid-template-columns:repeat(8,1fr); padding:12rpx; gap:2rpx; background:#fff; border:8rpx solid #fff; box-shadow:0 0 0 1rpx #e1e6ee; }.qr-code view { background:#f2f4f8; }.qr-code view.filled { background:#17202d; }.modal-copy { max-width:280px; }.modal-primary,.modal-cancel { width:100%; height:56rpx; line-height:56rpx; margin-top:16rpx; border-radius:9rpx; font-size:var(--sxb-text-small); }.modal-primary { color:#fff; background:#3569e8; font-weight:700; }.modal-cancel { margin-top:8rpx; color:#718096; background:#f1f3f6; }.modal-primary::after,.modal-cancel::after { display:none; }.modal-input { width:100%; height:58rpx; box-sizing:border-box; margin-top:18rpx; padding:0 16rpx; color:#243650; background:#f5f7fb; border:1rpx solid #dce5f0; border-radius:9rpx; font-size:var(--sxb-text-small); }.code-input-row { width:100%; display:flex; align-items:stretch; gap:9rpx; margin-top:18rpx; }.code-input-row .modal-input { flex:1; min-width:0; margin-top:0; }.code-input-row button { width:110rpx; height:58rpx; line-height:58rpx; flex:none; margin:0; padding:0; color:#3569e8; background:#eaf0ff; border-radius:9rpx; font-size:var(--sxb-text-meta); font-weight:700; }.code-input-row button::after { display:none; }
.top-bar { position:relative; }
.top-bar-action { position:absolute; right:0; width:auto; font-size:var(--sxb-text-body) !important; text-align:right; }
.fold-item { padding:20rpx 0; }
.fold-head>view text:first-child { font-size:var(--sxb-text-title); line-height:1.5; }
.fold-head>view text:last-child { font-size:var(--sxb-text-small); }
.fold-content { font-size:var(--sxb-text-body); line-height:1.75; }
.handout-block .page-note { align-items:center; }
.handout-list { padding:0 16rpx; }
.handout-row { min-height:108rpx; gap:12rpx; }
.handout-record-copy { justify-content:center; }
.handout-record-copy text:first-child { font-size:var(--sxb-text-small) !important; }
.handout-record-copy text:last-child { overflow:hidden; font-size:var(--sxb-text-meta) !important; text-overflow:ellipsis; white-space:nowrap; }
.handout-row-action { width:102rpx; display:flex; align-items:center; justify-content:center; flex:none; }
.handout-row-action button { width:100%; height:42rpx; line-height:42rpx; padding:0 5rpx; font-size:var(--sxb-text-meta); font-weight:700; }
.handout-row.is-updated .handout-row-action button { color:#c86d1e; background:#fff1df; }
.handout-row.is-removed { opacity:.72; }
.handout-row.is-removed .pdf-icon { color:#8995a5; background:#eef1f5; }
.handout-row.is-removed .handout-row-action button { color:#9ba5b2; background:#eef1f5; }
.handout-row-action button[disabled] { opacity:1; }
.handout-modal { padding:27rpx 24rpx 23rpx; }
.handout-mark { background:linear-gradient(135deg,#3569e8,#6949df); }
.handout-modal .modal-title.no-mark { margin-top:0; }
.handout-version-card { width:100%; box-sizing:border-box; display:grid; grid-template-columns:repeat(3,1fr); margin-top:18rpx; padding:14rpx 5rpx; background:#f5f7fb; border:1rpx solid #e2e7ef; border-radius:10rpx; }
.handout-version-card view { display:flex; align-items:center; flex-direction:column; gap:5rpx; border-right:1rpx solid #e1e6ee; }
.handout-version-card view:last-child { border-right:0; }
.handout-version-card text:first-child { color:#8793a3; font-size:var(--sxb-text-meta); }
.handout-version-card text:last-child { color:#263953; font-size:var(--sxb-text-small); font-weight:700; }
.handout-version-card text.updated { color:#d47a25; }
.handout-code-display { width:100%; box-sizing:border-box; display:flex; align-items:center; justify-content:space-between; margin-top:18rpx; padding:14rpx 16rpx; background:#f0f3ff; border:1rpx solid #dce6ff; border-radius:10rpx; }
.handout-code-display>text { color:#3569e8; font-size:var(--sxb-text-heading); letter-spacing:0; font-weight:700; }
.handout-code-display button { width:auto; height:38rpx; line-height:38rpx; margin:0; padding:0 9rpx; color:#3569e8; background:#fff; border-radius:7rpx; font-size:var(--sxb-text-meta); }
.handout-code-display button::after { display:none; }
.handout-code-input { width:100%; height:62rpx; box-sizing:border-box; margin-top:13rpx; padding:0 15rpx; color:#263953; background:#fafbfe; border:1rpx solid #dfe6f0; border-radius:9rpx; font-size:var(--sxb-text-body); text-align:center; }
.order-block { padding-bottom:20rpx; }
.order-tip { display:flex; align-items:center; gap:8rpx; padding:13rpx 14rpx; color:#66768c; background:#eef2f6; border-radius:9rpx; font-size:var(--sxb-text-meta); line-height:1.5; }
.order-list { display:flex; flex-direction:column; gap:13rpx; margin-top:14rpx; }
.order-item { overflow:hidden; padding:0; background:#fff; border:1rpx solid #e0e6f0; border-radius:11rpx; box-shadow:0 5rpx 14rpx rgba(39,59,91,.04); }
.order-item.status-pending { border-color:#7296ee; animation:pending-border 1.8s ease-in-out infinite; }
@keyframes pending-border { 0%,100% { box-shadow:0 0 0 0 rgba(53,105,232,.08),0 7rpx 17rpx rgba(53,105,232,.08); } 50% { box-shadow:0 0 0 4rpx rgba(53,105,232,.13),0 9rpx 21rpx rgba(53,105,232,.15); } }
.order-summary { min-height:91rpx; display:flex; align-items:center; gap:12rpx; padding:15rpx 16rpx; box-sizing:border-box; }
.order-main { display:flex; flex:1; min-width:0; flex-direction:column; gap:7rpx; }
.order-title-line { display:flex; align-items:center; gap:8rpx; min-width:0; }
.order-title-line>text:first-child { overflow:hidden; color:#263953; font-size:var(--sxb-text-body); font-weight:700; text-overflow:ellipsis; white-space:nowrap; }
.order-status { flex:none; padding:3rpx 8rpx; color:#1a9a7b; background:#e8f7f1; border-radius:5rpx; font-size:var(--sxb-text-meta); font-weight:700; }
.status-pending .order-status { color:#3569e8; background:#eaf0ff; }
.status-closed .order-status { color:#8490a0; background:#eef1f5; }
.order-time { color:#8995a5; font-size:var(--sxb-text-meta); }
.order-price { display:flex; align-items:center; gap:8rpx; flex:none; }
.order-price>text { color:#243650; font-size:var(--sxb-text-body); font-weight:700; }
.status-closed .order-summary { opacity:.72; }
.pending-countdown { display:flex; align-items:center; gap:7rpx; margin:0 16rpx 13rpx; padding:9rpx 11rpx; color:#3569e8; background:#f0f4ff; border-radius:7rpx; font-size:var(--sxb-text-meta); font-weight:700; }
.pulse-dot { width:9rpx; height:9rpx; flex:none; background:#3569e8; border-radius:50%; animation:pulse-dot 1.2s ease-in-out infinite; }
@keyframes pulse-dot { 0%,100% { opacity:.45; transform:scale(.85); } 50% { opacity:1; transform:scale(1.15); } }
.order-detail { padding:15rpx 16rpx 16rpx; background:#f8f9fc; border-top:1rpx solid #e7ebf2; }
.detail-line { display:flex; align-items:flex-start; justify-content:space-between; gap:18rpx; min-height:40rpx; color:#77859a; font-size:var(--sxb-text-meta); }
.detail-line>text:first-child { flex:none; }
.detail-line>text:last-child { color:#34475f; text-align:right; word-break:break-all; }
.detail-line.close-reason>text:last-child { color:#8c6b43; }
.detail-line.payment-failed-line>text:last-child { color:#b24f58; }
.detail-line.total-line { align-items:center; margin-top:7rpx; padding-top:12rpx; border-top:1rpx solid #e3e8f0; }
.detail-line.total-line>text:last-child { color:#243650; font-size:var(--sxb-text-body); font-weight:700; }
.order-actions { display:grid; grid-template-columns:1fr 1.35fr; gap:9rpx; margin-top:13rpx; }
.order-actions.single { grid-template-columns:1fr; }
.order-actions button { height:51rpx; line-height:51rpx; margin:0; padding:0; color:#fff; background:#3569e8; border-radius:8rpx; font-size:var(--sxb-text-meta); font-weight:700; }
.order-actions button::after { display:none; }
.order-actions button.secondary { color:#64758c; background:#e9edf3; }
.purchase-notice { padding:27rpx 24rpx 23rpx; }
.pending-mark { background:linear-gradient(135deg,#3569e8,#6949df); }
.pending-order-summary { width:100%; box-sizing:border-box; margin-top:18rpx; padding:14rpx 15rpx; background:#f2f5ff; border:1rpx solid #dce5ff; border-radius:9rpx; }
.pending-order-summary>text { display:block; color:#2c3d55; font-size:var(--sxb-text-small); font-weight:700; }
.pending-order-summary>view { display:flex; align-items:center; justify-content:space-between; margin-top:8rpx; }
.pending-order-summary>view text:first-child { color:#243650; font-size:var(--sxb-text-body); font-weight:700; }
.pending-order-summary>view text:last-child { color:#3569e8; font-size:var(--sxb-text-meta); font-weight:700; }
.order-dialog-mask { padding:34rpx; background:rgba(17,28,48,.6); backdrop-filter:blur(5px); }
.order-dialog { width:100%; max-width:360px; box-sizing:border-box; overflow:hidden; padding:24rpx; background:#fff; border:1rpx solid rgba(255,255,255,.7); border-radius:14rpx; box-shadow:0 30rpx 76rpx rgba(19,34,61,.3); }
.order-dialog-top { display:flex; align-items:center; gap:13rpx; }
.order-dialog-icon { width:59rpx; height:59rpx; display:flex; align-items:center; justify-content:center; flex:none; background:linear-gradient(135deg,#3569e8,#5b54d8); border-radius:13rpx; box-shadow:0 8rpx 18rpx rgba(53,105,232,.22); }
.dialog-cancel .order-dialog-icon { background:linear-gradient(135deg,#c85056,#a9434a); box-shadow:0 8rpx 18rpx rgba(176,61,69,.19); }
.order-dialog-heading { display:flex; flex:1; min-width:0; flex-direction:column; gap:5rpx; }
.order-dialog-heading text:first-child { color:#20324a; font-size:var(--sxb-text-item); font-weight:700; }
.order-dialog-heading text:last-child { color:#8290a2; font-size:var(--sxb-text-meta); }
.order-dialog-top>button { width:42rpx; height:42rpx; display:flex; align-items:center; justify-content:center; flex:none; margin:0; padding:0; background:#f1f3f7; border-radius:50%; }
.order-dialog-top>button::after { display:none; }
.order-dialog-product { display:flex; align-items:center; justify-content:space-between; gap:14rpx; margin-top:22rpx; padding:17rpx; background:linear-gradient(120deg,#f3f6ff,#f7f5ff); border:1rpx solid #dfe6fa; border-radius:10rpx; }
.dialog-cancel .order-dialog-product { background:#f8f7f7; border-color:#e7e3e4; }
.order-dialog-product>view { display:flex; flex:1; min-width:0; flex-direction:column; gap:6rpx; }
.order-dialog-product>view text:first-child { overflow:hidden; color:#263953; font-size:var(--sxb-text-body); font-weight:700; text-overflow:ellipsis; white-space:nowrap; }
.order-dialog-product>view text:last-child { color:#7f8da1; font-size:var(--sxb-text-meta); }
.order-dialog-product>text { flex:none; color:#203753; font-size:var(--sxb-text-title); font-weight:700; }
.order-dialog-notice { display:flex; align-items:center; gap:8rpx; margin-top:13rpx; padding:11rpx 13rpx; color:#536f9d; background:#edf3ff; border-radius:8rpx; font-size:var(--sxb-text-meta); }
.order-dialog-notice.danger { color:#985159; background:#fff0f1; }
.payment-methods { margin-top:18rpx; }
.payment-methods>text { color:#53647b; font-size:var(--sxb-text-meta); font-weight:700; }
.payment-method-list { display:flex; flex-direction:column; gap:9rpx; margin-top:10rpx; }
.payment-method-list>view { display:flex; align-items:center; gap:11rpx; padding:12rpx 13rpx; background:#f7f8fb; border:2rpx solid transparent; border-radius:9rpx; }
.payment-method-list>view.active { background:#f2f6ff; border-color:#b9caf3; }
.payment-method-list>view>view:nth-child(2) { display:flex; flex:1; min-width:0; flex-direction:column; gap:4rpx; }
.payment-method-list>view>view:nth-child(2) text:first-child { color:#293b54; font-size:var(--sxb-text-small); font-weight:700; }
.payment-method-list>view>view:nth-child(2) text:last-child { color:#8995a5; font-size:var(--sxb-text-meta); }
.pay-brand { width:45rpx; height:45rpx; display:flex; align-items:center; justify-content:center; flex:none; color:#fff; border-radius:10rpx; font-size:var(--sxb-text-small); font-weight:700; }
.pay-brand.wechat { background:#19a974; }
.pay-brand.alipay { background:#1677ff; }
.payment-result { min-height:56rpx; box-sizing:border-box; display:flex; align-items:center; gap:10rpx; margin-top:13rpx; padding:11rpx 13rpx; border-radius:8rpx; }
.payment-result.failed { color:#985159; background:#fff0f1; }
.payment-result.processing { color:#536f9d; background:#edf3ff; }
.payment-result>view:last-child { display:flex; flex-direction:column; gap:3rpx; }
.payment-result>view:last-child text:first-child { font-size:var(--sxb-text-meta); font-weight:700; }
.payment-result>view:last-child text:last-child { font-size:var(--sxb-text-meta); opacity:.85; }
.payment-spinner { width:22rpx; height:22rpx; flex:none; box-sizing:border-box; border:3rpx solid #b8c9ee; border-top-color:#3569e8; border-radius:50%; animation:payment-spin .8s linear infinite; }
@keyframes payment-spin { to { transform:rotate(360deg); } }
.order-dialog-actions { display:grid; grid-template-columns:1fr 1.35fr; gap:10rpx; margin-top:20rpx; }
.order-dialog-actions button { height:58rpx; line-height:58rpx; margin:0; padding:0; color:#66768c; background:#edf0f4; border-radius:9rpx; font-size:var(--sxb-text-small); font-weight:700; }
.order-dialog-actions button:last-child { color:#fff; background:linear-gradient(105deg,#3569e8,#5d51d8); box-shadow:0 7rpx 16rpx rgba(53,105,232,.18); }
.order-dialog-actions button:last-child.danger { background:linear-gradient(105deg,#c85056,#ad4148); box-shadow:0 7rpx 16rpx rgba(177,62,70,.16); }
.order-dialog-actions button[disabled] { opacity:.7; }
.order-dialog-actions button::after { display:none; }
.top-bar-action { color:#6949df !important; }
.announcement-list .fold-head .notice-title>text { color:#30425c; font-size:var(--sxb-text-body); line-height:1.45; font-weight:400; }
.announcement-list .fold-head>view>text { font-size:var(--sxb-text-meta); }
.faq-list .fold-head>view>text { color:#30425c; font-size:var(--sxb-text-body); line-height:1.45; font-weight:400; }
.announcement-list .item-unread { width:10rpx; height:10rpx; background:#e5484d; box-shadow:0 0 0 3rpx #fff0f0; }
.announcement-load-more { width:100%; height:50rpx; box-sizing:border-box; display:flex; align-items:center; justify-content:center; gap:5rpx; margin:9rpx 0 17rpx; color:#5b50b9; background:#f2f0ff; border:1rpx solid #ded9fb; border-radius:8rpx; font-size:var(--sxb-text-small); font-weight:700; }
.about-menu>view>text,.about-menu>view>text:last-child { color:#30425c; font-size:var(--sxb-text-body); }
.security-list>view>text,.security-list>view>text:last-child { color:#30425c; font-size:var(--sxb-text-body); }
.security-list .logout-row>text { color:#c85056; }
.logout-confirm { width:100%; height:56rpx; line-height:56rpx; margin:16rpx 0 0; padding:0; color:#fff; background:#c85056; border-radius:9rpx; font-size:var(--sxb-text-small); font-weight:700; }
.logout-confirm::after { display:none; }
.announcement-modal-mask { padding:36rpx; background:rgba(24,22,45,.58); backdrop-filter:blur(5px); }
.announcement-modal { position:relative; width:100%; max-width:350px; box-sizing:border-box; overflow:hidden; display:flex; align-items:center; flex-direction:column; padding:30rpx 25rpx 24rpx; background:#fff; border:1rpx solid rgba(255,255,255,.8); border-radius:15rpx; box-shadow:0 28rpx 72rpx rgba(41,31,91,.3); }
.announcement-modal-accent { position:absolute; top:0; right:0; left:0; height:7rpx; background:linear-gradient(90deg,#5944ba,#8065e8); }
.announcement-modal-icon { width:66rpx; height:66rpx; display:flex; align-items:center; justify-content:center; background:linear-gradient(135deg,#5944ba,#8065e8); border-radius:18rpx; box-shadow:0 10rpx 22rpx rgba(92,70,190,.27); }
.announcement-modal-title { margin-top:13rpx; color:#242f43; font-size:var(--sxb-text-title); font-weight:700; }
.announcement-modal-desc { max-width:290px; margin-top:9rpx; color:#718096; font-size:var(--sxb-text-small); line-height:1.6; text-align:center; }
.announcement-modal-count { width:100%; box-sizing:border-box; display:flex; align-items:baseline; justify-content:center; gap:6rpx; margin-top:18rpx; padding:14rpx; color:#6550c2; background:#f4f1ff; border:1rpx solid #e2dcfb; border-radius:10rpx; }
.announcement-modal-count text:first-child { font-size:var(--sxb-text-heading); font-weight:700; }
.announcement-modal-count text:last-child { font-size:var(--sxb-text-meta); font-weight:700; }
.announcement-modal-actions { width:100%; display:grid; grid-template-columns:1fr 1.35fr; gap:10rpx; margin-top:19rpx; }
.announcement-modal-actions button { height:57rpx; line-height:57rpx; margin:0; padding:0; color:#68768a; background:#f0f2f6; border-radius:9rpx; font-size:var(--sxb-text-small); font-weight:700; }
.announcement-modal-actions button:last-child { color:#fff; background:linear-gradient(105deg,#5944ba,#7659db); box-shadow:0 8rpx 18rpx rgba(94,70,194,.23); }
.announcement-modal-actions button::after { display:none; }
.report-archive { margin-top:20rpx; }
.report-archive-hero { display:flex; align-items:center; gap:13rpx; padding:20rpx; color:#fff; background:linear-gradient(125deg,#273544 0%,#151c31 55%,#22214b 100%); border:1rpx solid #3d4658; border-radius:13rpx; box-shadow:0 13rpx 29rpx rgba(23,29,49,.22); }
.archive-hero-icon { width:55rpx; height:55rpx; display:flex; align-items:center; justify-content:center; flex:none; background:rgba(214,181,98,.13); border:1rpx solid rgba(226,196,118,.28); border-radius:14rpx; }
.report-archive-hero>view:nth-child(2) { display:flex; flex:1; min-width:0; flex-direction:column; gap:5rpx; }
.report-archive-hero>view:nth-child(2) text:first-child { color:#f4f0e5; font-size:var(--sxb-text-item); font-weight:700; }
.report-archive-hero>view:nth-child(2) text:last-child { color:#adb7c8; font-size:var(--sxb-text-meta); line-height:1.4; }
.report-archive-hero>text { color:#d6b562; font-size:var(--sxb-text-small); font-weight:700; }
.report-year { display:flex; align-items:center; margin:23rpx 2rpx 10rpx; }
.report-year text:first-child { color:#25364d; font-size:var(--sxb-text-body); font-weight:700; }
.report-list { overflow:hidden; background:#fff; border:1rpx solid #dfe5ed; border-radius:12rpx; }
.report-row { display:flex; align-items:center; gap:13rpx; min-height:103rpx; padding:15rpx; border-bottom:1rpx solid #edf0f5; }
.report-row:last-child { border-bottom:0; }
.report-row.generating { background:#f7f8fb; }
.report-month { width:54rpx; height:59rpx; display:flex; align-items:center; justify-content:center; flex:none; flex-direction:column; color:#e2c476; background:linear-gradient(145deg,#263443,#181f35); border-radius:11rpx; }
.report-month text:first-child { font-size:var(--sxb-text-item); line-height:1; font-weight:700; }
.report-month text:last-child { margin-top:3rpx; font-size:var(--sxb-text-meta); }
.generating .report-month { color:#9ca7b7; background:#e8ebf0; }
.report-row-copy { flex:1; min-width:0; }
.report-row-copy>view:first-child { display:flex; align-items:center; gap:7rpx; }
.report-row-copy>view:first-child>text:first-child { overflow:hidden; color:#293a51; font-size:var(--sxb-text-body); font-weight:700; text-overflow:ellipsis; white-space:nowrap; }
.report-row-copy>view:first-child>text:last-child { flex:none; padding:3rpx 6rpx; border-radius:5rpx; font-size:var(--sxb-text-meta); font-weight:700; }
.report-row-copy .ready { color:#9b7621; background:#fbf3dc; }
.report-row-copy .generating { color:#737f91; background:#e9edf2; }
.report-meta { display:flex; gap:12rpx; margin-top:8rpx; color:#a17e2a; font-size:var(--sxb-text-small); }
.generating-progress { display:flex !important; align-items:center; gap:8rpx !important; }
.generating-progress>view { width:95rpx; height:6rpx; overflow:hidden; background:#e2e6ec; border-radius:6rpx; }
.generating-progress>view>view { width:43%; height:100%; background:#8b96a7; border-radius:6rpx; }
.generating-progress>text { color:#66768b; font-size:var(--sxb-text-small); }

@import '@/styles/content-system.scss';
</style>
