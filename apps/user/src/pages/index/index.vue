<script setup lang="ts">
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import uniIcons from '@dcloudio/uni-ui/lib/uni-icons/uni-icons.vue'
import AppTabBar from '@/components/AppTabBar.vue'
import DebugMenu from '@/components/DebugMenu.vue'
import { useAppStore } from '@/store/app'
import { monthlyReports, refreshMonthlyReports, type MonthlyReport } from '@/utils/monthlyReports'
import { createRightsOrder, loadOrders, persistOrders, type PaymentMethod } from '@/utils/orders'
import { api, account, learningPlan, refreshLearningPlan, refreshRights, showApiError, token, selectedExamId } from '@/services/api'
import { refreshOrders } from '@/utils/orders'

const { state, exam, todayRemaining, refreshPlanState, requireLogin, login, logout } = useAppStore()
const promoExpanded = ref(true)
const rightsLevel = computed(() => account.level === 'svip' ? 'flagship' : account.level === 'vip' ? 'pro' : 'none')
const reportAccessVisible = ref(false)
type HomeReportCard = Pick<MonthlyReport, 'id' | 'year' | 'month' | 'status'> & {
  report?: MonthlyReport
  locked?: boolean
}
const selectedReport = ref<HomeReportCard | null>(null)
const homeReportSlide = ref(0)
type StudyPlan = { name: string; icon: string; price: number; color: string; includedCount: number; intro: string }
const uni = (globalThis as any).uni
const purchaseVisible = ref(false)
const purchaseProcessing = ref(false)
const selectedPlan = ref<StudyPlan>()
const selectedPurchaseMethod = ref<PaymentMethod>('wechat')
const planProgress = computed(() => state.todayTarget ? Math.min(Math.round(state.todayDone / state.todayTarget * 100), 100) : 0)
const masteryRingStyle = computed(() => ({ background: `conic-gradient(#6949df ${Math.max(exam.value.mastery, 4)}%, #e7e9f3 0)` }))
const isFlagship = computed(() => account.permissions.reports === true)
const contentNotices=ref<any[]>([])
async function loadContentNotices(){contentNotices.value=[];if(!token())return;const examId=selectedExamId(),currentToken=token();try{const rows=await api(`/content-notices/${examId}`);if(examId===selectedExamId()&&currentToken===token())contentNotices.value=rows}catch(e){showApiError(e)}}
async function dismissNotice(item:any){try{await api(`/content-notices/${item.id}/seen`,'POST',{});contentNotices.value=contentNotices.value.filter(n=>n.id!==item.id)}catch(e){showApiError(e)}}
function openReminder(item:any){if(item.requiredPermission&&!account.permissions[item.requiredPermission])uni.showModal({title:'会员专属内容',content:'此内容需要对应考试会员权益。',confirmText:'查看权益',success:(r:any)=>{if(r.confirm)uni.navigateTo({url:'/pages/profile-center/index?mode=rights'})}});else gated(item.url)}
const homeReports = computed(() => monthlyReports
  .filter(item => !item.locked)
  .sort((a, b) => b.id.localeCompare(a.id)))
const visibleHomeReports = computed<HomeReportCard[]>(() => {
  if (isFlagship.value) {
    return homeReports.value.map(item => ({
      id: item.id,
      year: item.year,
      month: item.month,
      status: item.status,
      report: item,
    }))
  }
  return [...monthlyReports]
    .sort((a, b) => b.id.localeCompare(a.id))
    .slice(0, 2)
    .map(item => ({
      id: item.id,
      year: item.year,
      month: item.month,
      status: item.status,
      locked: true,
    }))
})

const goRoute = (url: string) => uni.reLaunch({ url })
const gated = (url: string) => { if (requireLogin(url)) goRoute(url) }
const showMessage = (message: string) => uni.showToast({ title: message, icon: 'none' })
const openExamSwitch = () => uni.navigateTo({ url: '/pages/exam-switch/index', animationType: 'slide-in-bottom', animationDuration: 260 })
const openSearch = () => uni.navigateTo({ url: '/pages/search/index' })
const openTrial = () => openPlanPayment({ name: 'VIP 24小时体验', icon: 'clock', price: 1, color: 'trial', includedCount: 7, intro: '' })
const paymentMethodLabel = (method: PaymentMethod) => method === 'alipay' ? '支付宝支付' : '微信支付'
const openPlanPayment = (plan: StudyPlan) => {
  if (!requireLogin('/pages/index/index')) return
  if (plan.color === 'basic') return showMessage('免费版无需购买')
  selectedPlan.value = account.level === 'vip' && !account.trial && plan.color === 'flagship' ? { ...plan, name: 'VIP 升级 SVIP', price: 200 } : plan
  selectedPurchaseMethod.value = 'wechat'
  purchaseProcessing.value = false
  purchaseVisible.value = true
}
const closePlanPayment = () => {
  if (purchaseProcessing.value) return
  purchaseVisible.value = false
  selectedPlan.value = undefined
}
const confirmPlanPayment = async () => {
  const plan = selectedPlan.value
  if (!plan || purchaseProcessing.value) return
  purchaseProcessing.value = true
  try {
    if (selectedPurchaseMethod.value !== 'wechat') throw new Error('首版仅支持微信测试支付')
    const product = plan.color === 'trial' ? 'trial' : plan.price === 200 ? 'upgrade' : plan.color === 'flagship' ? 'svip' : 'vip'
    const result = await api('/orders', 'POST', { examId: exam.value.id, product })
    if (result.existing) {
      await refreshOrders()
      purchaseVisible.value = false
      uni.navigateTo({ url: '/pages/profile-center/index?mode=orders' })
      return showMessage('已有待支付订单，请核对后继续支付')
    }
    await api(`/orders/${result.order.id}/test-payment`, 'POST', { outcome: 'success' })
    await refreshRights()
    await refreshOrders()
    await refreshMonthlyReports()
    purchaseVisible.value = false
    selectedPlan.value = undefined
    showMessage('测试支付成功，未扣款，权益已生效')
  } catch (error) { showApiError(error) } finally { purchaseProcessing.value = false }
}
const reportMonthName = (month: number) => ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][month - 1]
const reportGenerationLabel = (item: Pick<MonthlyReport, 'month'>) => `${item.month === 12 ? 1 : item.month + 1}月1日生成`
const reportCalendar = (item: MonthlyReport) => {
  const daysInMonth = new Date(item.year, item.month, 0).getDate()
  const offset = (new Date(item.year, item.month - 1, 1).getDay() + 6) % 7
  const studied = new Set(item.studiedDays || item.dailyQuestions.map((value, index) => value > 0 ? index + 1 : 0).filter(Boolean))
  return [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => ({ day: index + 1, studied: studied.has(index + 1) })),
  ]
}
const openHomeReport = (item: HomeReportCard) => {
  selectedReport.value = item
  if (!isFlagship.value) {
    reportAccessVisible.value = true
    return
  }
  if (item.status === 'generating') {
    uni.showToast({ title: `${reportGenerationLabel(item)}，请耐心等待`, icon: 'none' })
    return
  }
  uni.navigateTo({ url: `/pages/monthly-report/index?id=${item.id}` })
}
const applyHomeDebug = (key: string) => {
  showMessage('会员权限由后台判定，请使用测试订单验证')
  return
  /* Legacy debug states are presentation-only.
  homeReportSlide.value = 0
  if (key === 'logged-out') {
    logout()
    uni.setStorageSync('sxb-demo-rights', 'none')
    rightsLevel.value = 'none'
    showMessage('已切换为未登录用户')
    return
  }
  login(`home-debug-${key}`)
  const rightsMap: Record<string, string> = {
    unpaid: 'none',
    trial: 'trial',
    basic: 'basic',
    pro: 'pro',
    flagship: 'flagship',
  }
  rightsLevel.value = rightsMap[key] || 'none'
  uni.setStorageSync('sxb-demo-rights', rightsLevel.value)
  showMessage(`已切换为${key === 'unpaid' ? '未付款' : key === 'trial' ? '1元试听' : key === 'basic' ? '免费版' : key === 'pro' ? 'VIP' : 'SVIP'}用户`)
  */
}
const openFlagshipRights = () => {
  reportAccessVisible.value = false
  uni.navigateTo({ url: '/pages/profile-center/index?mode=rights' })
}
onShow(() => {
  void loadContentNotices()
  state.selectedTab = 0
  void refreshRights().then(refreshMonthlyReports).catch(showApiError)
  void refreshLearningPlan().then(refreshPlanState).catch(showApiError)
  homeReportSlide.value = 0
})

const stages = [
  { round: '01', title: '先认识考试，再看清知识结构', summary: '知道考什么、怎么考，复习才不会走弯路。', tone: 'blue', actions: [
    { no: '1.1', name: '了解考试', icon: 'info', meta: '约5分钟', description: '查看科目、题型、报考要求和重要时间节点。', route: '/pages/exam-notice-detail/index?id=exam-guide', message: '' },
    { no: '1.2', name: '了解章节', icon: 'map', meta: '全科结构', description: '先看全科章节结构，明确需要学习的知识范围。', route: '/pages/knowledge/index?mode=all', message: '' },
  ] },
  { round: '02', title: '理解重点，边学边练', summary: '从知识图谱建立框架，用精讲课和题目完成理解。', tone: 'purple', actions: [
    { no: '2.1', name: '知识图谱', icon: 'map', meta: '重点脉络', description: '用重点思维导图串联章节与核心知识点。', route: '/pages/knowledge/index?mode=map', message: '' },
    { no: '2.2', name: '精讲课', icon: 'videocam', meta: '随章节学习', description: '跟随章节课程理解考点和常见命题方式。', route: '/pages/courses/index', message: '' },
    { no: '2.3', name: '学习笔记', icon: 'compose', meta: '随学随记', description: '把课程重点和个人理解沉淀为可复习笔记。', route: '/pages/practice-tools/index?mode=note', message: '' },
    { no: '2.4', name: '智能刷题', icon: 'list', meta: '完成第一轮', description: '覆盖全科题库，边做题边理解知识点。', route: '/pages/practice/index', message: '' },
  ] },
  { round: '03', title: '强化薄弱点，把错题刷透', summary: '回看笔记和错题，针对薄弱内容重新组题。', tone: 'orange', actions: [
    { no: '3.1', name: '强化笔记', icon: 'compose', meta: '重点复习', description: '围绕薄弱章节复习笔记，及时补齐知识漏洞。', route: '/pages/practice-tools/index?mode=note', message: '' },
    { no: '3.2', name: '错题重练', icon: 'refresh', meta: '自由组题', description: '将错题与其他题目重新组卷，强化易错内容。', route: '/pages/practice-tools/index?mode=wrong', message: '' },
  ] },
  { round: '04', title: '背诵冲刺，完成全科复盘', summary: '主动回忆重点内容，再用刷题检验复习效果。', tone: 'pink', actions: [
    { no: '4.1', name: 'AI智能背诵', icon: 'flag', meta: '挖空背诵', description: '知识点挖空主动回忆，把短期记忆变成长久掌握。', route: '/pages/recite/index', message: '' },
    { no: '4.2', name: '继续刷题', icon: 'checkbox', meta: '新一轮全科', description: '完成新一轮全科刷题，检验背诵和复习效果。', route: '/pages/practice/index', message: '' },
  ] },
]

const benefitCatalog = ['全科题库与历年真题', '知识图谱与全部章节', '精讲课程与章节讲义', '错题本与收藏夹', '学习笔记与重点标记', '智能刷题与组卷', 'AI挖空背诵', '阶段学习报告', '题库持续更新', '专属学习服务']
const plans: StudyPlan[] = [
  { name: '免费版', icon: 'compose', price: 0, color: 'basic', includedCount: 2, intro: '适合先用题库建立备考节奏' },
  { name: 'VIP', icon: 'star', price: 599, color: 'pro', includedCount: 7, intro: '所选考试专属 · 有效至本考期结束' },
  { name: 'SVIP', icon: 'medal', price: 799, color: 'flagship', includedCount: 10, intro: '所选考试专属 · 考期结束后转为VIP' },
]
</script>

<template>
  <view class="home page safe-top">
    <view class="top-actions">
      <button class="exam-entry" @tap="openExamSwitch"><view class="exam-entry-icon"><uni-icons type="calendar" size="17" color="#3569e8" /></view><view class="exam-entry-copy"><view><text>{{ exam.name }}</text><uni-icons type="arrowdown" size="14" color="#3569e8" /></view></view></button>
      <button class="search-button" aria-label="搜索" @tap="openSearch"><uni-icons type="search" size="23" color="#4c54b5" /></button>
    </view>

    <view class="overview"><view class="overview-copy"><text class="overview-title">距离考试还有 <text>{{ exam.daysLeft }}</text> 天</text><text class="overview-sub">按计划完成每一次练习，上岸会更有把握</text></view><view class="mastery"><view class="mastery-ring" :style="masteryRingStyle"><view class="mastery-center"><text>{{ exam.mastery }}%</text></view></view><text>掌握程度</text></view></view>

    <view class="promo" :class="{ collapsed: !promoExpanded }"><view class="promo-head"><view><text class="promo-kicker">上行宝 · 全链路备考</text><text class="promo-title">把知识学懂，把每一道题做会</text></view><button class="collapse-btn" @tap="promoExpanded = !promoExpanded">{{ promoExpanded ? '收起' : '展开' }}</button></view><view v-if="promoExpanded" class="promo-content"><text class="promo-desc">从知识图谱到精讲课程，从智能刷题到考前背诵，一套清晰路径陪你完成整场考试。</text><view class="promo-stats"><view><text>{{ exam.totalKnowledge }}</text><text>知识点</text></view><view><text>{{ exam.totalQuestions }}</text><text>精选题目</text></view><view><text>{{ exam.totalCourses }}</text><text>精讲课程</text></view></view><view class="promo-tags"><text>专业知识图谱</text><text>四阶段复习</text><text>错题专项巩固</text></view><button class="trial-btn" @tap="openTrial"><text class="trial-price">¥1</text><text>体验当前考试VIP，限24小时</text><uni-icons type="arrowright" size="18" color="#fff" /></button></view><view v-else class="promo-mini" @tap="promoExpanded = true"><text><text class="trial-price">¥1</text> 体验VIP内容 · 24小时</text><text>展开查看 ›</text></view></view>

    <view class="section-head"><view><text class="section-title">我的学习计划</text><text class="section-subtitle">今天多完成一点，考前就多一分从容</text></view><button class="plan-edit" @tap="gated('/pages/learning-plan/index')">修改计划 <uni-icons type="compose" size="14" color="#3569e8" /></button></view>
    <view class="plan-board"><view class="plan-main"><view class="remaining"><text>{{ todayRemaining }}</text><text>题</text><text>今日还需完成</text></view><view class="days-left"><text>{{ exam.daysLeft }}</text><text>距离考试天数</text></view></view><view class="progress-track"><view :style="{ width: `${planProgress}%` }"></view></view><view class="plan-foot"><text>今日已完成 {{ state.todayDone }} / {{ state.todayTarget }} 题</text><text>{{ learningPlan.data?.progress.isRest ? '今天休息' : todayRemaining === 0 ? '今日目标已完成' : '计划进行中' }}</text></view><text class="plan-note">按剩余题量和学习日安排，可随时修改科目、章、每日题量与休息日。</text></view>

    <view v-if="learningPlan.data" class="plan-reminders">
      <view class="plan-live-status">{{ learningPlan.data.progress.stage }} · 第 {{ learningPlan.data.progress.roundNumber }} 轮 · {{ learningPlan.data.progress.round === 'coverage' ? '覆盖学习' : '巩固复习' }}<text v-if="learningPlan.data.progress.isRest"> · 今天休息</text></view>
      <button class="plan-continue" @tap="gated('/pages/practice-session/index?plan=1')">{{ learningPlan.data.progress.isRest ? '自由练习' : '继续计划刷题' }}<uni-icons type="right" size="16" color="#3569e8" /></button>
      <button v-for="item in learningPlan.data.reminders" :key="item.title" class="plan-reminder" @tap="openReminder(item)">{{ item.title }}<uni-icons type="right" size="16" color="#64748b" /></button>
    </view>
    <view v-for="item in contentNotices" :key="item.id" class="content-notice"><view class="notice-heading"><uni-icons type="notification" size="20" color="#3569e8" /><text>考前小抄已开放</text></view><text class="notice-title">{{ item.title }}</text><view class="notice-actions"><button @tap="dismissNotice(item)">知道了</button><button @tap="uni.navigateTo({url:'/pages/cheatsheets/index'})">查看资料<uni-icons type="right" size="15" color="#3569e8" /></button></view></view>
    <view class="section-head flow-head"><view><text class="section-title">一套完整的学习流程</text><text class="section-subtitle">这是效率更高的建议路径，也可以从任意环节直接开始</text></view></view>
    <view class="study-flow"><view v-for="stage in stages" :key="stage.round" class="stage" :class="stage.tone"><view class="stage-header"><view class="stage-number">{{ stage.round }}</view><view><text class="stage-title">{{ stage.title }}</text><text class="stage-summary">{{ stage.summary }}</text></view></view><view class="action-list"><view v-for="action in stage.actions" :key="action.no" class="action-row"><view class="action-copy"><view class="action-heading"><text class="action-no">{{ action.no }}</text><text class="action-name">{{ action.name }}</text><text class="action-meta">{{ action.meta }}</text></view><text class="action-description">{{ action.description }}</text></view><view class="action-buttons"><button class="start-button" @tap="action.route ? gated(action.route) : showMessage(action.message)">立即开始</button></view></view></view></view></view>

    <view class="section-head report-home-head"><view><text class="section-title">学习报告</text><text class="section-subtitle">回顾每个月的学习记录与成长</text></view></view>
    <swiper
      class="home-report-swiper"
      :current="homeReportSlide"
      :next-margin="'104rpx'"
      :previous-margin="'0rpx'"
      :duration="260"
      @change="homeReportSlide = $event.detail.current"
    >
      <swiper-item v-for="item in visibleHomeReports" :key="item.id" class="home-report-swiper-item">
        <view class="home-report-card" :class="{ generating: item.status === 'generating', locked: item.locked }">
          <view class="home-report-head"><view><text>{{ item.month }}月学习报告</text><text v-if="item.report">{{ item.status === 'ready' ? `本月累计学习 ${item.report.metrics.studyDays} 天` : `本月已学习 ${item.report.metrics.studyDays} 天` }}</text><text v-else>完整月度学习记录</text></view><text>{{ reportMonthName(item.month) }}</text></view>
          <view class="home-calendar-week"><text v-for="day in ['一','二','三','四','五','六','日']" :key="day">{{ day }}</text></view>
          <view v-if="item.report" class="home-calendar-grid"><view v-for="(day,index) in reportCalendar(item.report)" :key="index" :class="{ empty:!day, studied:day?.studied }"><text v-if="day">{{ day.day }}</text></view></view>
          <view v-else class="home-calendar-grid locked-calendar" aria-hidden="true"><view v-for="index in 35" :key="index"><text>{{ index <= 31 ? index : '' }}</text></view></view>
          <view v-if="item.locked" class="home-report-lock" @tap.stop="openHomeReport(item)"><view><uni-icons type="locked" size="23" color="#f4dc9a" /></view><text>SVIP用户专属</text><text>升级后查看完整学习报告</text></view>
          <view v-if="isFlagship" class="home-report-foot"><button class="home-report-action" :class="{ pending: item.status === 'generating' }" :disabled="item.status === 'generating'" @tap.stop="item.status === 'ready' && openHomeReport(item)">{{ item.status === 'generating' ? reportGenerationLabel(item) : '立即查看' }}</button></view>
        </view>
      </swiper-item>
    </swiper>
    <view v-if="visibleHomeReports.length > 1" class="report-pagination">
      <button role="button" tabindex="0" aria-label="上一个月报" :aria-disabled="homeReportSlide === 0" :disabled="homeReportSlide === 0" @keydown.enter="homeReportSlide > 0 && homeReportSlide--" @keydown.space.prevent="homeReportSlide > 0 && homeReportSlide--" @tap="homeReportSlide > 0 && homeReportSlide--"><uni-icons type="back" size="19" color="#536987" /></button>
      <text class="report-position" aria-live="polite">{{ homeReportSlide + 1 }} / {{ visibleHomeReports.length }}</text>
      <button role="button" tabindex="0" aria-label="下一个月报" :aria-disabled="homeReportSlide >= visibleHomeReports.length - 1" :disabled="homeReportSlide >= visibleHomeReports.length - 1" @keydown.enter="homeReportSlide < visibleHomeReports.length - 1 && homeReportSlide++" @keydown.space.prevent="homeReportSlide < visibleHomeReports.length - 1 && homeReportSlide++" @tap="homeReportSlide < visibleHomeReports.length - 1 && homeReportSlide++"><uni-icons type="forward" size="19" color="#536987" /></button>
    </view>

    <view class="section-head"><view><text class="section-title">选择你的学习版本</text><text class="section-subtitle">权益可按备考阶段选择，SVIP包含全部服务</text></view></view>
    <view class="price-list"><view v-for="plan in plans" :key="plan.name" class="price-card" :class="plan.color"><view class="price-pattern"></view><text v-if="plan.color === 'flagship'" class="recommended">推荐版本</text><view class="plan-heading"><view class="plan-icon"><uni-icons :type="plan.icon" size="22" :color="plan.color === 'flagship' ? '#f2b04f' : plan.color === 'pro' ? '#6949df' : '#3569e8'" /></view><view><text class="plan-name">{{ plan.name }}</text><text class="plan-intro">{{ plan.intro }}</text></view></view><view class="price"><text>¥</text><text>{{ plan.price }}</text><text class="original">¥{{ plan.price * 2 }}</text></view><view class="benefits"><view v-for="(benefit, index) in benefitCatalog" :key="benefit" class="benefit-row" :class="{ unavailable: index >= plan.includedCount }"><view class="benefit-check"><uni-icons v-if="index < plan.includedCount" type="checkmarkempty" size="14" :color="plan.color === 'flagship' ? '#f2b04f' : '#fff'" /><uni-icons v-else type="closeempty" size="13" color="#a9b3c2" /></view><text>{{ benefit }}</text></view></view><button class="plan-button" @tap="openPlanPayment(plan)">选择{{ plan.name }}<uni-icons type="arrowright" size="15" :color="plan.color === 'flagship' ? '#1d2d43' : '#fff'" /></button></view></view>
    <view v-if="purchaseVisible && selectedPlan" class="home-payment-mask" @tap="closePlanPayment">
      <view class="home-payment-dialog" @tap.stop>
        <view class="home-payment-top"><view class="home-payment-icon"><uni-icons type="wallet" size="28" color="#fff" /></view><view><text>订单支付</text><text>选择支付方式并完成付款</text></view><button :disabled="purchaseProcessing" @tap="closePlanPayment"><uni-icons type="closeempty" size="20" color="#7d8a9c" /></button></view>
        <view class="home-payment-product"><view><text>上行宝{{ selectedPlan.name }}</text><text>{{ selectedPlan.color === 'trial' ? '支付后24小时' : '当前考试权益，有效至本考期结束' }}</text></view><text>¥{{ selectedPlan.price }}</text></view>
        <view class="home-payment-methods"><text>选择支付方式</text><view>
          <view :class="{ active: selectedPurchaseMethod === 'wechat' }" @tap="selectedPurchaseMethod = 'wechat'"><view class="home-pay-brand wechat">微</view><view><text>微信支付</text><text>使用微信安全支付</text></view><uni-icons :type="selectedPurchaseMethod === 'wechat' ? 'checkbox-filled' : 'circle'" size="21" :color="selectedPurchaseMethod === 'wechat' ? '#19a974' : '#b2bbc7'" /></view>
          <!-- #ifdef H5 -->
          <!-- #endif -->
        </view></view>
        <view v-if="purchaseProcessing" class="home-payment-processing"><view></view><text>正在发起{{ paymentMethodLabel(selectedPurchaseMethod) }}</text></view>
        <view class="home-payment-actions"><button :disabled="purchaseProcessing" @tap="closePlanPayment">暂不支付</button><button :disabled="purchaseProcessing" @tap="confirmPlanPayment">{{ purchaseProcessing ? '支付处理中' : `${paymentMethodLabel(selectedPurchaseMethod)} ¥${selectedPlan.price}` }}</button></view>
      </view>
    </view>
    <view v-if="reportAccessVisible" class="report-access-mask" @tap="reportAccessVisible = false"><view class="report-access-modal" @tap.stop><view class="report-access-mark"><uni-icons type="medal" size="27" color="#e4c36f" /></view><text class="report-access-title">学习报告为SVIP专享</text><text class="report-access-copy">升级SVIP后，可以查看每月学习日历、刷题趋势、知识点掌握变化和学习建议。</text><view class="report-access-preview"><text>{{ selectedReport?.month || '本' }}月学习报告</text><text>完整记录每个月的成长</text></view><button class="report-access-primary" @tap="openFlagshipRights">查看SVIP权益</button><button class="report-access-cancel" @tap="reportAccessVisible = false">暂不升级</button></view></view>
    <AppTabBar active="home" />
    <DebugMenu page="首页账号权限" :options="[{ key:'logged-out',label:'未登录用户' },{ key:'unpaid',label:'已登录未付款用户' },{ key:'trial',label:'1元试听用户' },{ key:'basic',label:'免费版用户' },{ key:'pro',label:'VIP用户' },{ key:'flagship',label:'SVIP用户' }]" @select="applyHomeDebug" />
  </view>
</template>

<style scoped>
.content-notice{margin:16px 0;padding:18px 0;border-top:1px solid #d9e4f4;border-bottom:1px solid #d9e4f4}.notice-heading{display:flex;align-items:center;gap:8px;font-size:16px;color:#24426d;font-weight:700}.notice-title{display:block;font-size:15px;line-height:1.7;color:#53657e;margin:10px 0}.notice-actions{display:flex;justify-content:flex-end;gap:16px}.notice-actions button{min-height:44px;padding:0 8px;margin:0;display:flex;align-items:center;gap:6px;font-size:15px;color:#3569e8;background:transparent}.notice-actions button::after{display:none}.notice-actions button:first-child{color:#64748b}
</style>

<style scoped lang="scss">
.home { max-width: 430px; margin: 0 auto; padding-top: calc(env(safe-area-inset-top) + 22rpx); background: #f5f7fb; }
.top-actions { display: flex; align-items: center; justify-content: space-between; gap: 14rpx; }
.exam-entry, .search-button, .text-button { border: 0; padding: 0; margin: 0; }
.exam-entry { flex: 1; min-width: 0; display: flex; align-items: center; gap: 11rpx; background: transparent; text-align: left; }
.exam-entry-icon { width: 54rpx; height: 54rpx; display: flex; align-items: center; justify-content: center; background: #e9efff; border: 1rpx solid #d7e2ff; border-radius: 16rpx; }
.exam-entry-copy { display: flex; flex-direction: column; gap: 4rpx; min-width: 0; }
.tiny-label { font-size: 19rpx; color: #8a95a5; }
.exam-entry-copy>view { display: flex; align-items: center; gap: 4rpx; font-size: 27rpx; font-weight: 800; white-space: nowrap; }
.search-button { width: 58rpx; height: 58rpx; display: flex; align-items: center; justify-content: center; background: #f0efff; border-radius: 16rpx; }
.overview { display: flex; justify-content: space-between; align-items: center; padding: 28rpx 0 24rpx; border-bottom: 1rpx solid #e1e7f0; }
.overview-title { display: block; font-size: 32rpx; font-weight: 850; color: #152238; }.overview-title text { color: #3569e8; }.overview-sub { display: block; margin-top: 7rpx; color: #758297; font-size: 21rpx; }.mastery { display: flex; flex-direction: column; align-items: flex-end; gap: 4rpx; }.mastery>text:first-child { color: #6949df; font-size: 29rpx; font-weight: 850; }.mastery>text:last-child { color: #7f8b9b; font-size: 21rpx; }
.promo { position: relative; margin-top: 20rpx; padding: 24rpx; overflow: hidden; color: #fff; border-radius: 16rpx; background: linear-gradient(135deg,#172c4c 0%,#2e3a79 100%); box-shadow: 0 14rpx 30rpx rgba(35,46,100,.18); }.promo::after { content:''; position:absolute; width:180rpx; height:180rpx; right:-76rpx; top:-90rpx; border:20rpx solid rgba(255,194,90,.16); border-radius:50%; box-shadow:0 0 0 18rpx rgba(255,194,90,.06); }.promo.collapsed { padding: 18rpx 22rpx; }.promo-head { position:relative; z-index:1; display:flex; justify-content:space-between; align-items:flex-start; gap:12rpx; }.promo-head>view { display:flex; flex-direction:column; gap:7rpx; }.promo-kicker { color:#a7c8ff; font-size: 19rpx; font-weight:750; }.promo-title { font-size: 29rpx; font-weight:850; }.collapse-btn { height:42rpx; line-height:42rpx; padding:0 13rpx; color:#dfe8ff; background:rgba(255,255,255,.12); border-radius:7rpx; font-size: 19rpx; }.promo-content { position:relative; z-index:1; }.promo-desc { display:block; margin-top:16rpx; color:#c8d5ea; font-size: 21rpx; line-height:1.55; }.promo-stats { display:grid; grid-template-columns:repeat(3,1fr); margin:18rpx 0 15rpx; padding:15rpx 0; border-top:1rpx solid rgba(255,255,255,.14); border-bottom:1rpx solid rgba(255,255,255,.14); }.promo-stats view { display:flex; flex-direction:column; align-items:center; gap:3rpx; border-right:1rpx solid rgba(255,255,255,.14); }.promo-stats view:last-child { border-right:0; }.promo-stats text:first-child { font-size: 29rpx; font-weight:850; }.promo-stats text:last-child { color:#aebbd0; font-size: 19rpx; }.promo-tags { display:flex; flex-wrap:wrap; gap:8rpx; margin-bottom:18rpx; }.promo-tags text { padding:6rpx 10rpx; color:#dfd8ff; background:rgba(119,88,230,.28); border-radius:6rpx; font-size: 19rpx; }.trial-btn { height:68rpx; line-height:68rpx; display:flex; align-items:center; justify-content:center; gap:6rpx; color:#fff; background:#7655df; border-radius:10rpx; font-size: 22rpx; font-weight:800; box-shadow:0 8rpx 18rpx rgba(118,85,223,.3); }.trial-price { color:#ffd16b; font-size: 27rpx; font-weight:900; }.promo-mini { position:relative; z-index:1; display:flex; justify-content:space-between; align-items:center; color:#edf2ff; font-size: 21rpx; font-weight:700; }.promo-mini text:last-child { color:#c3b7ff; font-weight:500; }
.section-head { display:flex; justify-content:space-between; align-items:flex-start; margin:34rpx 0 15rpx; }.section-head>view { display:flex; flex-direction:column; gap:5rpx; }.section-title { color:#152238; font-size: 27rpx; font-weight:850; }.section-subtitle { color:#7b8797; font-size: 21rpx; line-height:1.45; }.text-button { height:36rpx; line-height:36rpx; color:#3569e8; background:transparent; font-size: 21rpx; font-weight:750; }.plan-board { padding:22rpx; background:#fff; border:1rpx solid #dfe6f0; border-left:6rpx solid #3569e8; border-radius:12rpx; box-shadow:0 8rpx 22rpx rgba(51,74,115,.05); }.plan-main { display:flex; justify-content:space-between; align-items:flex-start; }.remaining { display:grid; grid-template-columns:auto auto; align-items:end; column-gap:4rpx; }.remaining>text:first-child { color:#315bd4; font-size:54rpx; line-height:1; font-weight:850; }.remaining>text:nth-child(2) { color:#657382; margin-bottom:6rpx; font-size: 21rpx; }.remaining>text:last-child { grid-column:1/3; margin-top:7rpx; color:#7f8a98; font-size: 19rpx; }.days-left { display:flex; flex-direction:column; align-items:flex-end; gap:5rpx; }.days-left>text:first-child { color:#ef7e42; font-size: 32rpx; font-weight:850; }.days-left>text:last-child { color:#7f8a98; font-size: 19rpx; }.progress-track { height:9rpx; margin:19rpx 0 10rpx; overflow:hidden; background:#e9edf6; border-radius:9rpx; }.progress-track view { height:100%; background:linear-gradient(90deg,#3569e8,#7655df); border-radius:9rpx; }.plan-foot { display:flex; justify-content:space-between; color:#526171; font-size: 19rpx; }.plan-note { display:block; margin-top:16rpx; padding:12rpx; color:#4c5d83; background:#f1f4ff; border-radius:7rpx; font-size: 19rpx; line-height:1.55; }
.flow-head { margin-bottom:17rpx; }.study-flow { display:flex; flex-direction:column; gap:14rpx; }.stage { overflow:hidden; background:#fff; border:1rpx solid #e0e6ef; border-radius:13rpx; box-shadow:0 8rpx 22rpx rgba(51,74,115,.04); }.stage-header { display:flex; align-items:flex-start; gap:12rpx; padding:18rpx 18rpx 14rpx; }.stage-number { width:42rpx; height:42rpx; display:flex; align-items:center; justify-content:center; flex:none; color:#fff; border-radius:12rpx; font-size: 19rpx; font-weight:900; }.stage-title { display:block; color:#152238; font-size: 25rpx; font-weight:850; }.stage-summary { display:block; margin-top:5rpx; color:#738092; font-size: 19rpx; line-height:1.4; }.action-list { border-top:1rpx solid #edf0f5; }.action-row { display:flex; align-items:flex-start; gap:10rpx; padding:15rpx 14rpx; border-bottom:1rpx solid #edf0f5; }.action-row:last-child { border-bottom:0; }.action-icon { width:42rpx; height:42rpx; display:flex; align-items:center; justify-content:center; flex:none; border-radius:11rpx; }.action-copy { flex:1; min-width:0; }.action-heading { display:flex; align-items:baseline; gap:6rpx; min-width:0; }.action-no { font-size: 17rpx; font-weight:900; }.action-name { color:#152238; font-size: 22rpx; font-weight:800; white-space:nowrap; }.action-meta { overflow:hidden; color:#9aa5b3; font-size: 17rpx; white-space:nowrap; text-overflow:ellipsis; }.action-description, .action-detail { display:block; margin-top:5rpx; color:#647487; font-size: 19rpx; line-height:1.45; }.action-detail { color:#536bb2; }.action-buttons { display:flex; flex-direction:column; gap:6rpx; flex:none; }.start-button, .detail-button { min-width:96rpx; height:38rpx; line-height:38rpx; padding:0 8rpx; border-radius:7rpx; font-size: 17rpx; font-weight:750; }.start-button { color:#fff; background:#3569e8; }.detail-button { color:#536273; background:#f2f5fa; }.blue .stage-number, .blue .action-icon { background:#3569e8; }.blue .stage-number { box-shadow:0 5rpx 12rpx rgba(53,105,232,.22); }.blue .action-no { color:#3569e8; }.purple .stage-number, .purple .action-icon { background:#7655df; }.purple .action-no { color:#7655df; }.orange .stage-number, .orange .action-icon { background:#e98a3a; }.orange .action-no { color:#e98a3a; }.pink .stage-number, .pink .action-icon { background:#e35f8f; }.pink .action-no { color:#e35f8f; }.purple .start-button { background:#7655df; }.orange .start-button { background:#e98a3a; }.pink .start-button { background:#e35f8f; }
.report-home-head { align-items:flex-end; }
.home-report-swiper { width:calc(100% + 20px); height:640rpx; margin-right:-20px; }
.home-report-swiper-item { box-sizing:border-box; padding-right:13rpx; }
.home-report-card { position:relative; overflow:hidden; width:100%; height:640rpx; box-sizing:border-box; padding:22rpx 20rpx 82rpx; color:#edf1f6; white-space:normal; background:linear-gradient(150deg,#273849 0%,#171e34 58%,#282052 100%); border:1rpx solid #424c60; border-radius:14rpx; box-shadow:0 13rpx 27rpx rgba(25,31,53,.18); }
.home-report-card::before { position:absolute; top:69rpx; right:-6rpx; content:attr(data-month); color:rgba(255,255,255,.035); font-size:80rpx; font-weight:950; }
.home-report-card.generating { background:linear-gradient(150deg,#344150,#222b3d 60%,#313247); }
.home-report-head { position:relative; z-index:1; display:flex; justify-content:space-between; align-items:flex-start; gap:10rpx; padding-bottom:16rpx; border-bottom:1rpx solid rgba(255,255,255,.1); }
.home-report-head>view { display:flex; min-width:0; flex-direction:column; gap:6rpx; }
.home-report-head>view text:first-child { color:#f5f2e9; font-size:25rpx; font-weight:900; }
.home-report-head>view text:last-child { color:#a7b1c0; font-size:17rpx; }
.home-report-head>text { color:rgba(214,181,98,.2); font-size:40rpx; font-weight:950; }
.home-calendar-week,.home-calendar-grid { position:relative; z-index:1; display:grid; grid-template-columns:repeat(7,1fr); gap:6rpx; }
.home-calendar-week { margin-top:18rpx; color:#8390a2; font-size:14rpx; text-align:center; }
.home-calendar-grid { margin-top:10rpx; }
.home-calendar-grid>view { aspect-ratio:1; display:flex; align-items:center; justify-content:center; color:#728095; background:#303a4d; border:1rpx solid #3c475a; border-radius:50%; font-size:14rpx; font-weight:800; }
.home-calendar-grid>view.empty { visibility:hidden; }
.home-calendar-grid>view.studied { color:#182033; background:#d8b75f; border-color:#e5cc82; box-shadow:0 0 0 3rpx rgba(216,183,95,.08); }
.home-report-card.locked .home-report-head,.home-report-card.locked .home-calendar-week,.home-report-card.locked .locked-calendar { opacity:.34; }
.locked-calendar { filter:blur(2rpx); }
.locked-calendar>view { color:#778399; }
.home-report-lock { position:absolute; z-index:3; top:124rpx; right:20rpx; left:20rpx; display:flex; align-items:center; flex-direction:column; margin-top:112rpx; padding:53rpx 16rpx; background:rgba(17,24,41,.86); border:1rpx solid rgba(244,220,154,.28); border-radius:12rpx; box-shadow:0 14rpx 30rpx rgba(7,11,21,.28); backdrop-filter:blur(5px); }
.home-report-lock>view { width:50rpx; height:50rpx; display:flex; align-items:center; justify-content:center; margin-bottom:10rpx; background:rgba(216,183,95,.12); border:1rpx solid rgba(244,220,154,.22); border-radius:50%; }
.home-report-lock>text:nth-child(2) { color:#f5f0e2; font-size:22rpx; font-weight:900; }
.home-report-lock>text:last-child { margin-top:5rpx; color:#9eabbd; font-size:19rpx; }
.home-report-foot { position:absolute; z-index:2; right:20rpx; bottom:18rpx; left:20rpx; display:flex; align-items:center; justify-content:flex-end; }
.home-report-action { width:100%; height:52rpx; line-height:52rpx; margin:0; padding:0; color:#20283a; background:linear-gradient(100deg,#f0dc9c,#d4b45f); border:1rpx solid rgba(255,242,195,.68); border-radius:10rpx; box-shadow:0 7rpx 16rpx rgba(9,14,27,.2); font-size:18rpx; font-weight:900; text-align:center; }
.home-report-action.pending { color:#8b95a4; background:#d9dee6; }
.home-report-action::after { display:none; }
.home-payment-mask { position:fixed; z-index:100; inset:0; display:flex; align-items:center; justify-content:center; padding:34rpx; background:rgba(17,28,48,.6); backdrop-filter:blur(5px); }
.home-payment-dialog { width:100%; max-width:360px; box-sizing:border-box; padding:24rpx; background:#fff; border:1rpx solid rgba(255,255,255,.7); border-radius:14rpx; box-shadow:0 30rpx 76rpx rgba(19,34,61,.3); }
.home-payment-top { display:flex; align-items:center; gap:13rpx; }
.home-payment-icon { width:59rpx; height:59rpx; display:flex; align-items:center; justify-content:center; flex:none; background:linear-gradient(135deg,#3569e8,#5b54d8); border-radius:13rpx; box-shadow:0 8rpx 18rpx rgba(53,105,232,.22); }
.home-payment-top>view:nth-child(2) { display:flex; flex:1; min-width:0; flex-direction:column; gap:5rpx; }
.home-payment-top>view:nth-child(2) text:first-child { color:#20324a; font-size:26rpx; font-weight:900; }
.home-payment-top>view:nth-child(2) text:last-child { color:#8290a2; font-size:17rpx; }
.home-payment-top>button { width:42rpx; height:42rpx; display:flex; align-items:center; justify-content:center; flex:none; margin:0; padding:0; background:#f1f3f7; border-radius:50%; }
.home-payment-top>button::after { display:none; }
.home-payment-product { display:flex; align-items:center; justify-content:space-between; gap:14rpx; margin-top:22rpx; padding:17rpx; background:linear-gradient(120deg,#f3f6ff,#f7f5ff); border:1rpx solid #dfe6fa; border-radius:10rpx; }
.home-payment-product>view { display:flex; flex:1; min-width:0; flex-direction:column; gap:6rpx; }
.home-payment-product>view text:first-child { color:#263953; font-size:21rpx; font-weight:850; }
.home-payment-product>view text:last-child { color:#7f8da1; font-size:16rpx; }
.home-payment-product>text { flex:none; color:#203753; font-size:29rpx; font-weight:950; }
.home-payment-methods { margin-top:18rpx; }
.home-payment-methods>text { color:#53647b; font-size:18rpx; font-weight:850; }
.home-payment-methods>view { display:flex; flex-direction:column; gap:9rpx; margin-top:10rpx; }
.home-payment-methods>view>view { display:flex; align-items:center; gap:11rpx; padding:12rpx 13rpx; background:#f7f8fb; border:2rpx solid transparent; border-radius:9rpx; }
.home-payment-methods>view>view.active { background:#f2f6ff; border-color:#b9caf3; }
.home-payment-methods>view>view>view:nth-child(2) { display:flex; flex:1; min-width:0; flex-direction:column; gap:4rpx; }
.home-payment-methods>view>view>view:nth-child(2) text:first-child { color:#293b54; font-size:20rpx; font-weight:850; }
.home-payment-methods>view>view>view:nth-child(2) text:last-child { color:#8995a5; font-size:16rpx; }
.home-pay-brand { width:45rpx; height:45rpx; display:flex; align-items:center; justify-content:center; flex:none; color:#fff; border-radius:10rpx; font-size:19rpx; font-weight:900; }
.home-pay-brand.wechat { background:#19a974; }
.home-pay-brand.alipay { background:#1677ff; }
.home-payment-processing { display:flex; align-items:center; gap:9rpx; margin-top:13rpx; padding:11rpx 13rpx; color:#536f9d; background:#edf3ff; border-radius:8rpx; font-size:17rpx; }
.home-payment-processing>view { width:22rpx; height:22rpx; box-sizing:border-box; border:3rpx solid #b8c9ee; border-top-color:#3569e8; border-radius:50%; animation:home-payment-spin .8s linear infinite; }
@keyframes home-payment-spin { to { transform:rotate(360deg); } }
.home-payment-actions { display:grid; grid-template-columns:1fr 1.35fr; gap:10rpx; margin-top:20rpx; }
.home-payment-actions button { height:58rpx; line-height:58rpx; margin:0; padding:0; color:#66768c; background:#edf0f4; border-radius:9rpx; font-size:19rpx; font-weight:850; }
.home-payment-actions button:last-child { color:#fff; background:linear-gradient(105deg,#3569e8,#5d51d8); box-shadow:0 7rpx 16rpx rgba(53,105,232,.18); }
.home-payment-actions button[disabled] { opacity:.7; }
.home-payment-actions button::after { display:none; }
.report-access-mask { position:fixed; z-index:90; inset:0; display:flex; align-items:center; justify-content:center; padding:27px; background:rgba(15,22,36,.58); backdrop-filter:blur(4px); }
.report-access-modal { width:100%; max-width:350px; box-sizing:border-box; display:flex; align-items:center; flex-direction:column; padding:26rpx 24rpx 22rpx; color:#edf1f6; background:linear-gradient(150deg,#273849 0%,#171e34 62%,#282052 100%); border:1rpx solid #596176; border-radius:15rpx; box-shadow:0 24rpx 58rpx rgba(10,15,29,.38); }
.report-access-mark { width:64rpx; height:64rpx; display:flex; align-items:center; justify-content:center; background:rgba(214,181,98,.12); border:1rpx solid rgba(226,196,118,.35); border-radius:18rpx; }
.report-access-title { margin-top:16rpx; color:#f4f1e8; font-size:27rpx; font-weight:950; }
.report-access-copy { margin-top:9rpx; color:#aeb8c7; font-size:19rpx; line-height:1.65; text-align:center; }
.report-access-preview { width:100%; box-sizing:border-box; display:flex; justify-content:space-between; margin-top:18rpx; padding:14rpx 15rpx; color:#d8b75f; background:rgba(255,255,255,.055); border:1rpx solid rgba(255,255,255,.08); border-radius:9rpx; font-size:18rpx; }
.report-access-preview text:last-child { color:#8f9bad; font-size:16rpx; }
.report-access-primary,.report-access-cancel { width:100%; height:58rpx; line-height:58rpx; margin:17rpx 0 0; padding:0; border-radius:9rpx; font-size:20rpx; font-weight:850; }
.report-access-primary { color:#1c2638; background:#d8b75f; }
.report-access-cancel { margin-top:8rpx; color:#a7b1c0; background:rgba(255,255,255,.07); }
.report-access-primary::after,.report-access-cancel::after { display:none; }
.price-list { display:flex; flex-direction:column; gap:14rpx; padding-bottom:18rpx; }.price-card { position:relative; overflow:hidden; padding:22rpx; background:#eef5ff; border:1rpx solid #cfddf6; border-radius:13rpx; }.price-card.pro { background:#f3efff; border-color:#d9cdfa; }.price-card.flagship { color:#fff; background:#1d2d43; border-color:#1d2d43; }.price-pattern { position:absolute; right:-42rpx; top:-46rpx; width:170rpx; height:170rpx; border:21rpx solid rgba(47,104,216,.08); border-radius:50%; box-shadow:0 0 0 22rpx rgba(47,104,216,.04); }.pro .price-pattern { border-color:rgba(105,73,223,.1); box-shadow:0 0 0 22rpx rgba(105,73,223,.04); }.flagship .price-pattern { border-color:rgba(242,176,79,.13); box-shadow:0 0 0 22rpx rgba(242,176,79,.05); }.recommended { position:absolute; z-index:1; right:16rpx; top:16rpx; padding:5rpx 10rpx; color:#27343a; background:#f2b04f; border-radius:6rpx; font-size: 17rpx; font-weight:800; }.plan-heading { position:relative; z-index:1; display:flex; align-items:center; gap:11rpx; padding-right:75rpx; }.plan-icon { width:48rpx; height:48rpx; display:flex; align-items:center; justify-content:center; flex:none; background:rgba(255,255,255,.78); border-radius:12rpx; }.flagship .plan-icon { background:rgba(255,255,255,.1); }.plan-heading>view:last-child { display:flex; flex-direction:column; gap:4rpx; }.plan-name { font-size: 27rpx; font-weight:850; }.plan-intro { color:#6e7b8e; font-size: 19rpx; line-height:1.4; }.flagship .plan-intro { color:#b8c4d2; }.price { position:relative; z-index:1; display:flex; align-items:baseline; margin:17rpx 0 15rpx; color:#2f68d8; }.pro .price { color:#6949df; }.flagship .price { color:#f2b04f; }.price>text:first-child { font-size: 21rpx; font-weight:800; }.price>text:nth-child(2) { font-size:48rpx; line-height:1; font-weight:850; }.original { margin-left:8rpx; color:#9ca5ad; font-size: 19rpx; text-decoration:line-through; }.benefits { position:relative; z-index:1; display:flex; flex-direction:column; gap:9rpx; margin-bottom:17rpx; }.benefit-row { display:flex; align-items:flex-start; gap:8rpx; }.benefit-check { width:25rpx; height:25rpx; display:flex; align-items:center; justify-content:center; flex:none; margin-top:1rpx; background:#2f68d8; border-radius:50%; }.pro .benefit-check { background:#6949df; }.flagship .benefit-check { background:rgba(242,176,79,.12); border:1rpx solid #f2b04f; }.benefit-row>text { flex:1; color:#4e5e72; font-size: 19rpx; line-height:1.45; }.benefit-row.unavailable>text { color:#9ba6b5; }.benefit-row.unavailable .benefit-check { background:transparent; border:1rpx solid #c5ccd7; }.flagship .benefit-row>text { color:#d0d9e3; }.flagship .benefit-row.unavailable>text { color:#68788c; }.plan-button { position:relative; z-index:1; display:flex; align-items:center; justify-content:center; gap:5rpx; width:100%; height:61rpx; line-height:61rpx; color:#fff; background:#2f68d8; border-radius:8rpx; font-size: 21rpx; font-weight:800; }.pro .plan-button { background:#6949df; }.flagship .plan-button { color:#1d2d43; background:#f2b04f; }

/* Final alignment overrides for the compact mobile canvas. */
.exam-entry { border: 0 !important; background: transparent !important; }
.exam-entry::after, .search-button::after { display: none; }
.exam-entry-icon { width: 46rpx; height: 46rpx; border-radius: 13rpx; }
.exam-entry-copy { display: flex; align-items: center; min-width: 0; }
.exam-entry-copy > view { font-size: 25rpx; }
.overview-copy { flex: 1; min-width: 0; }
.overview-title { font-size: 32rpx; white-space: nowrap; }
.overview-sub { max-width: 250rpx; font-size: 21rpx; line-height: 1.4; }
.mastery { align-items: center; flex: none; margin-left: 12rpx; }
.mastery-ring { width: 60rpx; height: 60rpx; display: flex; align-items: center; justify-content: center; border-radius: 50%; }
.mastery-center { width: 46rpx; height: 46rpx; display: flex; align-items: center; justify-content: center; background: #f5f7fb; border-radius: 50%; }
.mastery-center text { color: #6949df; font-size: 19rpx; font-weight: 850; }
.mastery > text:last-child { font-size: 19rpx; }
.promo-head { position: relative; display: flex; align-items: flex-start; min-height: 42rpx; }
.promo-head > view { padding-right: 78rpx; }
.collapse-btn { position: absolute; top: 0; right: 0; }
.collapse-btn::after { display: none; }
.plan-edit { display: flex; align-items: center; gap: 3rpx; padding-top: 3rpx; color: #3569e8; font-size: 19rpx; font-weight: 700; }
.stage-header { align-items: center; gap: 13rpx; }
.stage-number { width: 50rpx; height: 50rpx; border-radius: 14rpx; font-size: 21rpx; }
.action-row { align-items: center; gap: 12rpx; padding: 16rpx 18rpx; }
.action-buttons { flex-direction: row; align-items: center; margin-left: 6rpx; }
.start-button { min-width: 100rpx; height: 40rpx; line-height: 40rpx; padding: 0 9rpx; }
.start-button::after { display: none; }

@import '@/styles/pilot-home.scss';
</style>

<style scoped>
.plan-reminders { margin-top:12px; }.plan-live-status { font-size:14px;color:#64748b;line-height:1.6; }.plan-continue,.plan-reminder { display:flex;align-items:center;justify-content:space-between;min-height:44px;margin:8px 0 0;padding:0 12px;background:#fff;color:#3569e8;font-size:15px;border-radius:6px; }.plan-reminder { color:#34465f;border-bottom:1px solid #edf0f5; }.plan-continue::after,.plan-reminder::after { display:none; }
</style>
