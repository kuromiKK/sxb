<script setup lang="ts">
import { computed, ref } from 'vue'
import CustomerService from '@/components/CustomerService.vue'
import {siteSettings} from '@/services/site-settings'
import { onShow } from '@dcloudio/uni-app'
import uniIcons from '@dcloudio/uni-ui/lib/uni-icons/uni-icons.vue'
import AppTabBar from '@/components/AppTabBar.vue'
import DebugMenu from '@/components/DebugMenu.vue'
import { useAppStore } from '@/store/app'
import { api, account, refreshRights, refreshPersonalData, selectedExamId, showApiError } from '@/services/api'
import { ensureStudentNickname } from '@/utils/profile'

const { state, exam } = useAppStore()
const nickname = ref('')
const wrongCount = ref(0)
const favoriteCount = ref(0)
const noteCount = ref(0)
const serviceVisible = ref(false)
const referralVisible = ref(false)
const referralCode = ref('')
const referralBusy = ref(false)
const unreadNotice = ref(true)
const pendingOrder = ref(true)
type RightsLevel = 'none' | 'basic' | 'trial' | 'pro' | 'flagship'
const rightsLevel = ref<RightsLevel>((uni.getStorageSync('sxb-demo-rights') || 'none') as RightsLevel)
const wrongBadge = computed(() => wrongCount.value > 99 ? '99+' : String(wrongCount.value))
const rightsOptions: Array<{ key: RightsLevel; name: string; description: string }> = [
  { key: 'none', name: '普通会员', description: '仅可浏览公开学习内容' },
  { key: 'basic', name: '普通会员', description: '题库与基础学习功能' },
  { key: 'trial', name: '限时体验', description: '权益以当前考试的实际授权为准' },
  { key: 'pro', name: 'VIP', description: '全科题库、课程与知识图谱' },
  { key: 'flagship', name: 'SVIP', description: '解锁全部学习服务' },
]
const currentRights = computed(() => {
  if(account.trial){
    const detail=account.trialDetails
    const duration=detail?.actualHours
    return {name:detail?.title||`${account.level.toUpperCase()} 限时体验`,description:duration?`本次体验 ${Math.floor(duration*100)/100} 小时`:'限时体验权益'}
  }
  return rightsOptions.find(item => item.key === rightsLevel.value) || rightsOptions[0]
})
const rightsExpiry=computed(()=>account.expiresAt?new Date(account.expiresAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',...(account.trial?{hour:'2-digit',minute:'2-digit',hour12:false}:{})}):'待配置')

const totalAnswers=ref(0)
const learningDays=ref(0)
const streakDays=ref(0)
const correctRate = ref(0)

const loadProfileData = async () => {
  await refreshRights()
  await refreshPersonalData()
  rightsLevel.value=account.trial?'trial':account.level==='svip'?'flagship':account.level==='vip'?'pro':'none'
  const stats=await api(`/stats/${selectedExamId()}`)
  totalAnswers.value=stats.daily.reduce((sum:number,r:any)=>sum+r.attempts,0)
  state.todayDone=stats.todayIds.length
  correctRate.value=totalAnswers.value?Math.round(stats.daily.reduce((sum:number,r:any)=>sum+r.correct,0)/totalAnswers.value*100):0
  learningDays.value=stats.studyDays.length
  const days=new Set(stats.studyDays)
  let date=new Date();streakDays.value=0
  const dayKey=(d:Date)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(d)
  if(!days.has(dayKey(date)))date=new Date(date.getTime()-86400000)
  while(days.has(dayKey(date))){streakDays.value++;date=new Date(date.getTime()-86400000)}
  nickname.value = ensureStudentNickname()
  wrongCount.value = (uni.getStorageSync('sxb-wrong-questions') || []).length
  favoriteCount.value = (uni.getStorageSync('sxb-favorite-items') || []).length
  noteCount.value = (uni.getStorageSync('sxb-note-records') || []).length
  unreadNotice.value = uni.getStorageSync('sxb-unread-announcements') !== false
  pendingOrder.value = (await api<any[]>('/orders')).some(order=>order.status==='pending_payment')
}

onShow(() => {
  state.selectedTab = 4
  if (!state.isLoggedIn) {
    uni.navigateTo({ url: '/pages/login/index?redirect=%2Fpages%2Fprofile%2Findex' })
    return
  }
  void loadProfileData().catch(showApiError)
})

const open = (path: string) => uni.navigateTo({ url: path })
const openTool = (mode: 'wrong' | 'favorite' | 'note') => open(`/pages/practice-tools/index?mode=${mode}`)
const openCenter = (mode: string) => open(`/pages/profile-center/index?mode=${mode}`)
const selectRights = (level: RightsLevel) => {
  rightsLevel.value = level
  uni.setStorageSync('sxb-demo-rights', level)
}
const applyDebug = (key: string) => {
  if (key.startsWith('rights-')) selectRights(key.replace('rights-', '') as RightsLevel)
}
const useReferral = async () => { if(!/^[A-Z2-9]{10}$/.test(referralCode.value)) return uni.showToast({title:'请输入10位推荐码',icon:'none'}); referralBusy.value=true; try { const r=await api('/referrals/use','POST',{code:referralCode.value}); referralVisible.value=false; referralCode.value=''; uni.showToast({title:r.permission?`成功获取${String(r.permission).toUpperCase()} ${r.hours}小时`:'推荐码使用成功',icon:'none'}); if(r.examId) uni.reLaunch({url:`/pages/exam-switch/index?examId=${r.examId}`}) } catch(e){showApiError(e)} finally {referralBusy.value=false} }
</script>

<template>
  <view class="page profile-page safe-top">
    <view class="profile-header">
      <view class="identity"><text class="welcome">你好，</text><text class="nickname">{{ nickname }}</text><text class="identity-meta">已连续学习 {{ streakDays }} 天</text></view>
      <button class="security-button" @tap="openCenter('security')"><uni-icons type="gear" size="22" color="#5e6f88" /></button>
    </view>

    <view class="account-band" :class="`rights-${rightsLevel}`">
    <view class="exam-band" @tap="open('/pages/exam-switch/index')">
      <view><text class="band-label">当前考试</text><text class="exam-name">{{ exam.name }}</text><text class="exam-meta">距离考试 {{ exam.daysLeft }} 天</text></view>
      <view class="exam-action"><text>切换</text><uni-icons type="right" size="17" color="currentColor" /></view>
    </view>

    <view class="rights-band" @tap="openCenter('rights')">
      <view class="rights-icon"><uni-icons :type="rightsLevel === 'none' ? 'locked' : 'medal'" size="22" color="currentColor" /></view>
      <view class="rights-copy"><text>{{ currentRights.name }}</text><text>{{ rightsLevel === 'none' ? currentRights.description : `有效至 ${rightsExpiry} · ${currentRights.description}` }}</text></view>
      <uni-icons type="right" size="18" color="currentColor" />
    </view>
    </view>

    <view class="data-strip">
      <view><text>{{ state.todayDone }}</text><text>今日刷题</text></view>
      <view><text>{{ totalAnswers }}</text><text>累计刷题</text></view>
      <view><text>{{ correctRate }}%</text><text>答题正确率</text></view>
      <view><text>{{ learningDays }}</text><text>学习天数</text></view>
    </view>

    <view class="tools-card"><view class="learning-grid">
      <view class="learning-item" @tap="openCenter('report')"><view class="feature-icon report"><uni-icons type="map-filled" size="23" color="#d6b562" /></view><text>学习报告</text></view>
      <view class="learning-item" @tap="openTool('wrong')"><view class="feature-icon wrong"><uni-icons type="refresh" size="22" color="#e98a3a" /><text v-if="wrongCount" class="count-badge">{{ wrongBadge }}</text></view><text>错题本</text></view>
      <view class="learning-item" @tap="openTool('favorite')"><view class="feature-icon favorite"><uni-icons type="star" size="22" color="#7655df" /></view><text>收藏</text></view>
      <view class="learning-item" @tap="openTool('note')"><view class="feature-icon note"><uni-icons type="compose" size="22" color="#1a9a7b" /></view><text>笔记</text></view>
    </view></view>

    <view class="section-card"><view class="section-head"><text>学习服务</text></view><view class="menu-group">
      <view class="menu-row" @tap="open('/pages/learning-plan/index?returnUrl=%2Fpages%2Fprofile%2Findex')"><view class="menu-icon"><uni-icons type="calendar" size="20" color="#5f748b" /></view><view class="menu-copy"><text>学习计划</text><text>每日目标 {{ state.todayTarget }} 题</text></view><uni-icons type="right" size="18" color="#a2adbb" /></view>
      <view class="menu-row" @tap="open('/pages/exam-notice-detail/index')"><view class="menu-icon"><uni-icons type="notification" size="20" color="#5f748b" /></view><view class="menu-copy"><text>了解考试</text><text>本考期报考指南与学习指导</text></view><uni-icons type="right" size="18" color="#a2adbb" /></view>
      <view class="menu-row" @tap="openCenter('handouts')"><view class="menu-icon"><uni-icons type="paperclip" size="20" color="#5f748b" /></view><view class="menu-copy"><text>我的讲义</text><text>课程讲义与下载记录</text></view><uni-icons type="right" size="18" color="#a2adbb" /></view>
      <view class="menu-row" @tap="openCenter('orders')"><view class="menu-icon"><uni-icons type="wallet" size="20" color="#5f748b" /></view><view class="menu-copy"><text>我的订单</text><text>购买与支付记录</text></view><view v-if="pendingOrder" class="unread-dot"></view><uni-icons type="right" size="18" color="#a2adbb" /></view>
    </view></view>

    <view class="section-card"><view class="section-head"><text>消息中心</text></view><view class="menu-group compact">
      <view class="menu-row" @tap="openCenter('announcements')"><view class="menu-icon"><uni-icons type="notification" size="20" color="#5f748b" /></view><view class="menu-copy"><text>消息中心</text><text>学习提醒、订单通知与考试公告</text></view><view v-if="unreadNotice" class="unread-dot"></view><uni-icons type="right" size="18" color="#a2adbb" /></view>
      <view class="menu-row" @tap="openCenter('faq')"><view class="menu-icon"><uni-icons type="help" size="20" color="#5f748b" /></view><view class="menu-copy"><text>常见问题</text><text>账号、学习和购买问题</text></view><uni-icons type="right" size="18" color="#a2adbb" /></view>
      <view class="menu-row" @tap="serviceVisible = true"><view class="menu-icon"><uni-icons type="chat" size="20" color="#5f748b" /></view><view class="menu-copy"><text>联系客服</text><text>{{siteSettings.customer.name}}</text></view><uni-icons type="right" size="18" color="#a2adbb" /></view>
      <view class="menu-row" @tap="referralVisible = true"><view class="menu-icon"><uni-icons type="gift" size="20" color="#5f748b" /></view><view class="menu-copy"><text>使用推荐码</text><text>绑定推荐关系，领取专属权益</text></view><uni-icons type="right" size="18" color="#a2adbb" /></view>
      <view class="menu-row" @tap="openCenter('about')"><view class="menu-icon"><uni-icons type="info" size="20" color="#5f748b" /></view><view class="menu-copy"><text>关于{{siteSettings.basic.name}}</text><text>协议、隐私与版本信息</text></view><uni-icons type="right" size="18" color="#a2adbb" /></view>
    </view></view>

    <AppTabBar active="profile" />
    <DebugMenu page="我的页面" :options="[{ key: 'rights-none', label: '无权益' }, { key: 'rights-basic', label: '基础版权益' }, { key: 'rights-trial', label: '1元试听权益' }, { key: 'rights-pro', label: '专业版权益' }, { key: 'rights-flagship', label: '旗舰版权益' }]" @select="applyDebug" />

    <CustomerService v-model="serviceVisible"/>
    <view v-if="referralVisible" class="modal-mask" @tap="referralVisible = false"><view class="service-modal" @tap.stop><text class="service-title">使用推荐码</text><text class="service-time">每位用户只能使用一次推荐码</text><input v-model="referralCode" maxlength="10" class="referral-input" placeholder="请输入10位推荐码" @input="referralCode=referralCode.toUpperCase()"/><button class="copy-button" :loading="referralBusy" @tap="useReferral">立即使用</button><button class="cancel-button" @tap="referralVisible=false">取消</button></view></view>
  </view>
</template>

<style lang="scss" scoped>
.profile-page { max-width:430px; min-height:100vh; margin:0 auto; padding-top:calc(env(safe-area-inset-top) + 28rpx); padding-bottom:108px; background:#f5f7fb; }.profile-header { display:flex; align-items:flex-start; justify-content:space-between; }.identity { display:flex; flex-direction:column; }.welcome { color:#77869a; font-size:var(--sxb-text-small); }.nickname { margin-top:2rpx; color:#152238; font-size:var(--sxb-text-heading); line-height:1.35; font-weight:700; }.identity-meta { margin-top:5rpx; color:#8490a0; font-size:var(--sxb-text-small); }.security-button { width:52rpx; height:52rpx; display:flex; align-items:center; justify-content:center; margin:3rpx 0 0; padding:0; background:#fff; border:1rpx solid #e1e7f0; border-radius:13rpx; }.security-button::after { display:none; }.exam-band { display:flex; align-items:center; justify-content:space-between; gap:12rpx; margin-top:24rpx; padding:19rpx; background:#fff; border:1rpx solid #dfe6f0; border-radius:12rpx; }.exam-band>view:first-child { display:flex; flex:1; min-width:0; flex-direction:column; gap:4rpx; }.band-label { color:#8995a5; font-size:var(--sxb-text-meta); }.exam-name { overflow:hidden; color:#243650; font-size:var(--sxb-text-body); font-weight:700; text-overflow:ellipsis; white-space:nowrap; }.exam-meta { color:#7b8797; font-size:var(--sxb-text-meta); }.exam-action { display:flex; align-items:center; gap:2rpx; color:#3569e8; font-size:var(--sxb-text-small); font-weight:700; }.rights-band { display:flex; align-items:center; gap:12rpx; margin-top:12rpx; padding:16rpx 18rpx; color:#fff; background:linear-gradient(105deg,#315fda,#6952ce); border-radius:12rpx; box-shadow:0 10rpx 23rpx rgba(68,79,187,.17); }.rights-icon { width:43rpx; height:43rpx; display:flex; align-items:center; justify-content:center; flex:none; background:rgba(255,255,255,.16); border-radius:11rpx; }.rights-copy { display:flex; flex:1; min-width:0; flex-direction:column; gap:4rpx; }.rights-copy text:first-child { font-size:var(--sxb-text-body); font-weight:700; }.rights-copy text:last-child { overflow:hidden; color:#dbe1ff; font-size:var(--sxb-text-meta); text-overflow:ellipsis; white-space:nowrap; }.data-strip { display:grid; grid-template-columns:repeat(4,1fr); margin-top:14rpx; padding:15rpx 4rpx; background:#fff; border:1rpx solid #e6eaf0; border-radius:10rpx; box-shadow:none; }.data-strip view { display:flex; align-items:center; flex-direction:column; gap:5rpx; border-right:1rpx solid #edf0f5; }.data-strip view:last-child { border-right:0; }.data-strip text:first-child { color:#243650; font-size:var(--sxb-text-title); font-weight:700; }.data-strip text:last-child { color:#8692a2; font-size:var(--sxb-text-meta); }.section-head { margin:26rpx 0 12rpx; }.section-head text { color:#152238; font-size:var(--sxb-text-item); font-weight:700; }.learning-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:0; padding:10rpx 0; background:#fff; border:1rpx solid #e6eaf0; border-radius:10rpx; }.learning-item { min-width:0; display:flex; align-items:center; flex-direction:column; padding:10rpx 4rpx; background:transparent; border:0; border-right:1rpx solid #edf0f5; border-radius:0; }.learning-item:last-child { border-right:0; }.feature-icon { width:43rpx; height:43rpx; display:flex; align-items:center; justify-content:center; margin-bottom:8rpx; border-radius:11rpx; }.feature-icon.report { background:#e7f7f1; }.feature-icon.wrong { background:#fff0e5; }.feature-icon.favorite { background:#f0ecff; }.feature-icon.note { background:#e7f7f1; }.learning-item>text:nth-child(2) { color:#263953; font-size:var(--sxb-text-small); font-weight:700; }.learning-item>text:last-child { overflow:hidden; width:100%; margin-top:4rpx; color:#8a96a5; font-size:var(--sxb-text-meta); text-align:center; text-overflow:ellipsis; white-space:nowrap; }.menu-group { margin-top:13rpx; padding:0 17rpx; background:#fff; border:1rpx solid #e0e6f0; border-radius:12rpx; }.menu-group.compact { margin-top:0; }.menu-row { display:flex; align-items:center; gap:12rpx; min-height:76rpx; border-bottom:1rpx solid #edf0f5; }.menu-row:last-child { border-bottom:0; }.menu-icon { width:42rpx; height:42rpx; display:flex; align-items:center; justify-content:center; flex:none; color:#5f748b; background:#eef2f6; border-radius:10rpx; }.menu-copy { display:flex; flex:1; min-width:0; flex-direction:column; gap:4rpx; }.menu-copy text:first-child { color:#25364d; font-size:var(--sxb-text-body); font-weight:700; }.menu-copy text:last-child { overflow:hidden; color:#7f8da0; font-size:var(--sxb-text-meta); text-overflow:ellipsis; white-space:nowrap; }.unread-dot { width:9rpx; height:9rpx; flex:none; background:#e45e64; border-radius:50%; }.logout-button { width:auto; height:52rpx; line-height:52rpx; margin:20rpx auto 0; padding:0 28rpx; color:#b45a60; background:transparent; border:0; border-radius:0; font-size:var(--sxb-text-small); font-weight:700; }.logout-button::after { display:none; }.modal-mask { position:fixed; z-index:80; inset:0; display:flex; align-items:center; justify-content:center; padding:26px; background:rgba(20,31,51,.48); }.service-modal { width:100%; max-width:350px; box-sizing:border-box; display:flex; align-items:center; flex-direction:column; padding:24rpx; background:#fff; border-radius:15rpx; box-shadow:0 20rpx 46rpx rgba(22,37,64,.2); }.service-mark { width:62rpx; height:62rpx; display:flex; align-items:center; justify-content:center; background:#1a9a7b; border-radius:17rpx; }.service-title { margin-top:14rpx; color:#22354d; font-size:var(--sxb-text-item); font-weight:700; }.service-time { margin-top:5rpx; color:#8b96a5; font-size:var(--sxb-text-meta); }.wechat-row { width:100%; box-sizing:border-box; display:flex; align-items:center; justify-content:space-between; margin-top:18rpx; padding:14rpx 16rpx; background:#f3f7f6; border-radius:9rpx; }.wechat-row text:first-child { color:#728197; font-size:var(--sxb-text-meta); }.wechat-row text:last-child { color:#1a806a; font-size:var(--sxb-text-body); font-weight:700; }.copy-button,.cancel-button { width:100%; height:58rpx; line-height:58rpx; margin:15rpx 0 0; padding:0; border-radius:9rpx; font-size:var(--sxb-text-small); }.copy-button { color:#fff; background:#1a9a7b; font-weight:700; }.cancel-button { margin-top:8rpx; color:#718096; background:#f1f3f6; }.copy-button::after,.cancel-button::after { display:none; }
.account-band { margin-top:24rpx; overflow:hidden; background:#eef3ff; border:1rpx solid #d7e2f7; border-radius:14rpx; }
.account-band .exam-band { margin-top:0; padding:19rpx; border:0; border-radius:0; background:transparent; }
.account-band .rights-band { margin-top:0; padding:16rpx 19rpx; color:#49639b; background:rgba(255,255,255,.38); border:0; border-top:1rpx solid rgba(97,126,181,.17); border-radius:0; box-shadow:none; }
.account-band .rights-copy text:first-child { color:inherit; }
.account-band .rights-copy text:last-child { color:inherit; opacity:.72; }
.account-band .rights-icon { color:inherit; background:rgba(255,255,255,.65); }
.account-band.rights-none { color:#f4f6f9; background:linear-gradient(135deg,#303947 0%,#4c596b 58%,#303946 100%); border-color:#505d6f; box-shadow:0 11rpx 26rpx rgba(36,45,58,.22); }.account-band.rights-none .exam-name,.account-band.rights-none .exam-meta,.account-band.rights-none .band-label,.account-band.rights-none .exam-action,.account-band.rights-none .rights-band { color:#fff; }.account-band.rights-none .band-label,.account-band.rights-none .exam-meta { color:#d8dee7; }.account-band.rights-none .rights-band { border-top-color:rgba(255,255,255,.2); background:rgba(255,255,255,.06); }
.account-band.rights-basic { color:#f1fff9; background:linear-gradient(135deg,#075743 0%,#087b5e 55%,#0b604a 100%); border-color:#14745d; box-shadow:0 11rpx 27rpx rgba(4,82,62,.24); }.account-band.rights-basic .exam-name,.account-band.rights-basic .exam-meta,.account-band.rights-basic .band-label,.account-band.rights-basic .exam-action,.account-band.rights-basic .rights-band { color:#fff; }.account-band.rights-basic .band-label,.account-band.rights-basic .exam-meta { color:#d3f2e7; }.account-band.rights-basic .rights-band { border-top-color:rgba(202,244,230,.28); background:rgba(255,255,255,.07); }.account-band.rights-basic .rights-icon { background:rgba(206,255,238,.15); }
.account-band.rights-trial { color:#fff8e8; background:linear-gradient(135deg,#884b20 0%,#b56d2c 52%,#754126 100%); border-color:#9b5a29; box-shadow:0 11rpx 27rpx rgba(121,67,29,.22); }.account-band.rights-trial .exam-name,.account-band.rights-trial .exam-meta,.account-band.rights-trial .band-label,.account-band.rights-trial .exam-action,.account-band.rights-trial .rights-band { color:#fff; }.account-band.rights-trial .band-label,.account-band.rights-trial .exam-meta { color:#ffe8c5; }.account-band.rights-trial .rights-band { border-top-color:rgba(255,233,196,.3); background:rgba(255,255,255,.07); }.account-band.rights-trial .rights-icon { background:rgba(255,236,202,.16); }
.account-band.rights-pro { color:#f7f4ff; background:linear-gradient(135deg,#2449a7 0%,#403cad 52%,#5a3299 100%); border-color:#414aa8; box-shadow:0 12rpx 28rpx rgba(48,48,143,.25); }.account-band.rights-pro .exam-name,.account-band.rights-pro .exam-meta,.account-band.rights-pro .band-label,.account-band.rights-pro .exam-action,.account-band.rights-pro .rights-band { color:#fff; }.account-band.rights-pro .band-label,.account-band.rights-pro .exam-meta { color:#dfe3ff; }.account-band.rights-pro .rights-band { border-top-color:rgba(221,221,255,.27); background:rgba(255,255,255,.07); }.account-band.rights-pro .rights-icon { background:rgba(225,221,255,.15); }
.account-band.rights-flagship { color:#f6d78c; background:linear-gradient(135deg,#17181c,#3b2b15 55%,#17181c); border-color:#7f5d24; box-shadow:0 12rpx 28rpx rgba(18,18,20,.18); }.account-band.rights-flagship .exam-name,.account-band.rights-flagship .exam-meta,.account-band.rights-flagship .band-label { color:#f7e9c2; }.account-band.rights-flagship .exam-action,.account-band.rights-flagship .rights-band { color:#e6ba62; }.account-band.rights-flagship .rights-band { border-top-color:rgba(220,176,88,.4); background:rgba(255,255,255,.05); }.account-band.rights-flagship .rights-copy text:last-child { color:#f3dca4; }.account-band.rights-flagship .rights-icon { background:rgba(220,176,88,.18); }
.section-card { margin-top:18rpx; padding:0 17rpx 3rpx; background:#fff; border:1rpx solid #e0e6f0; border-radius:12rpx; }
.section-card .section-head { margin:0; padding:17rpx 0 10rpx; }
.section-card .menu-group { margin:0 -17rpx; border:0; border-radius:0; }
.tools-card { margin-top:18rpx; padding:0; border:0; background:transparent; }
.tools-card .learning-grid { margin:0; }
.tools-card .learning-item { min-height:102rpx; padding:17rpx 4rpx 14rpx; }
.tools-card .feature-icon { width:50rpx; height:50rpx; }
.tools-card .learning-item>text { font-size:var(--sxb-text-small); }
.tools-card .learning-item:nth-child(1)>text { color:#29364a; }
.tools-card .learning-item:nth-child(2)>text { color:#d97828; }
.tools-card .learning-item:nth-child(3)>text { color:#7655df; }
.tools-card .learning-item:nth-child(4)>text { color:#1a9a7b; }
.feature-icon { position:relative; }
.tools-card .feature-icon.report { background:linear-gradient(145deg,#263444,#171d35); box-shadow:0 6rpx 14rpx rgba(24,31,50,.2); }
.count-badge { position:absolute; top:-11rpx; right:-13rpx; min-width:27rpx; height:27rpx; box-sizing:border-box; padding:0 6rpx; display:flex; align-items:center; justify-content:center; color:#fff; background:#e45e64; border:2rpx solid #fff; border-radius:20rpx; font-size:var(--sxb-text-meta) !important; font-weight:700; line-height:1; }
.rights-modal { width:100%; max-width:350px; box-sizing:border-box; padding:23rpx; background:#fff; border-radius:15rpx; box-shadow:0 20rpx 46rpx rgba(22,37,64,.2); }.rights-modal-title { display:block; color:#22354d; font-size:var(--sxb-text-item); font-weight:700; }.rights-modal-desc { display:block; margin-top:5rpx; color:#8b96a5; font-size:var(--sxb-text-meta); }.rights-option-list { display:flex; flex-direction:column; gap:8rpx; margin-top:18rpx; }.rights-option { display:flex; align-items:center; justify-content:space-between; padding:13rpx 14rpx; color:#fff; background:linear-gradient(135deg,#303947,#4c596b); border:2rpx solid transparent; border-radius:9rpx; box-shadow:0 5rpx 12rpx rgba(38,49,64,.12); }.rights-option>view { display:flex; flex-direction:column; gap:4rpx; }.rights-option>view text:first-child { font-size:var(--sxb-text-body); font-weight:700; }.rights-option>view text:last-child { color:inherit; font-size:var(--sxb-text-meta); opacity:.82; }.rights-option.basic { color:#fff; background:linear-gradient(135deg,#075743,#087b5e); box-shadow:0 5rpx 12rpx rgba(4,82,62,.17); }.rights-option.pro { color:#fff; background:linear-gradient(135deg,#2449a7,#5a3299); box-shadow:0 5rpx 12rpx rgba(48,48,143,.17); }.rights-option.flagship { color:#f1cf7d; background:linear-gradient(135deg,#17181c,#3b2b15); }.rights-option.active { border-color:currentColor; }
.qr-code { width:180rpx; height:180rpx; box-sizing:border-box; display:grid; grid-template-columns:repeat(8,1fr); padding:12rpx; gap:2rpx; background:#fff; border:8rpx solid #fff; box-shadow:0 0 0 1rpx #e1e6ee; }.qr-code view { background:#f2f4f8; }.qr-code view.filled { background:#17202d; }.service-number { margin-top:7rpx; color:#1a9a7b; font-size:var(--sxb-text-meta); }

@import '@/styles/content-system.scss';
.menu-row { min-height: 60px; padding: 8px 0; box-sizing: border-box; }
.menu-copy { line-height: 1.5; }
</style>
