<script setup lang="ts">
import { ref, onUnmounted } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import uniIcons from '@dcloudio/uni-ui/lib/uni-icons/uni-icons.vue'
import { useAppStore } from '@/store/app'
import { backOrFallback } from '@/utils/navigation'
import { api, acceptSession, refreshRights, refreshPersonalData, showApiError } from '@/services/api'

const { login } = useAppStore()
const phone = ref('')
const code = ref('')
const agreed = ref(false)
const countdown = ref(0)
const redirect = ref('')
const testCode = ref('')
const busy = ref(false)
let timer: ReturnType<typeof setInterval> | undefined

onLoad((options) => { redirect.value = options?.redirect ? decodeURIComponent(options.redirect) : '' })
const toast = (title: string) => uni.showToast({ title, icon: 'none' })
const back = () => backOrFallback('/pages/index/index')
onUnmounted(() => { if (timer) clearInterval(timer) })
const sendCode = async () => {
  if (countdown.value) return
  if (!/^1\d{10}$/.test(phone.value)) return toast('请输入正确的手机号')
  try {
  const result = await api('/auth/code', 'POST', { phone: phone.value })
  testCode.value = result.testCode || ''
  countdown.value = 60
  timer = setInterval(() => { countdown.value -= 1; if (!countdown.value && timer) clearInterval(timer) }, 1000)
  } catch (error) { showApiError(error) }
}
const finish = (identity: string) => {
  login(identity)
  uni.showToast({ title: '登录成功', icon: 'success' })
  setTimeout(() => redirect.value ? openRoute(redirect.value) : uni.reLaunch({ url: '/pages/index/index' }), 350)
}
const submit = async () => {
  if (busy.value) return
  if (!/^1\d{10}$/.test(phone.value)) return toast('请输入正确的手机号')
  if (!/^\d{4}$/.test(code.value)) return toast('请输入4位验证码')
  if (!agreed.value) return toast('请先同意用户协议和隐私政策')
  busy.value = true
  try {
    acceptSession(await api('/auth/phone', 'POST', { phone: phone.value, code: code.value }))
    await refreshRights()
    await refreshPersonalData()
    finish(phone.value)
  } catch (error) { showApiError(error) } finally { busy.value = false }
}
const wechat = () => toast('微信登录正在申请，请先使用手机号测试登录')
const tabRoutes = ['/pages/index/index', '/pages/knowledge/index', '/pages/courses/index', '/pages/practice/index', '/pages/profile/index']
const openRoute = (url: string) => tabRoutes.includes(url) ? uni.reLaunch({ url }) : uni.navigateTo({ url })
</script>

<template>
  <view class="login-page safe-top editorial-page">
    <button class="back-button" @tap="back"><uni-icons type="back" size="21" color="#4b5a70" /></button>
    <view class="login-brand"><view class="brand-mark"><text>上</text></view><view><text class="brand-name">上行宝</text><text class="brand-tag">让备考更有方向</text></view></view>
    <view class="login-title">欢迎回来</view><text class="login-subtitle">登录后，开启你的高效备考之旅</text>
    <view class="login-form"><view class="field"><uni-icons type="phone" size="21" color="#8793a6" /><input v-model="phone" type="number" maxlength="11" placeholder="请输入手机号" placeholder-class="placeholder" /></view><view class="field"><uni-icons type="locked" size="21" color="#8793a6" /><input v-model="code" type="number" maxlength="4" placeholder="请输入验证码" placeholder-class="placeholder" /><button class="code-button" :disabled="Boolean(countdown)" @tap="sendCode">{{ countdown ? `${countdown}s 后重发` : '获取验证码' }}</button></view><button class="login-button" :loading="busy" :disabled="busy" @tap="submit">登录</button></view>
    <view class="agreement" @tap="agreed = !agreed"><view class="checkbox" :class="{ checked: agreed }"><uni-icons v-if="agreed" type="checkmarkempty" size="14" color="#fff" /></view><text>我已阅读并同意《用户服务协议》和《隐私政策》，未注册手机号将自动创建账号</text></view>
    <view class="split-line"><text>其他登录方式</text></view><button class="wechat-button" @tap="wechat"><view class="wechat-mark"><uni-icons type="weixin" size="21" color="#fff" /></view><text>微信一键登录</text></button>
    <text class="login-tip">{{ testCode ? `测试验证码：${testCode}（5分钟内有效，不发送短信）` : '本地测试环境：点击获取验证码后在此显示' }}</text>
  </view>
</template>

<style lang="scss">
.login-page { position:relative; max-width:430px; min-height:100vh; margin:0 auto; box-sizing:border-box; padding:28rpx 30rpx 50rpx; background:linear-gradient(180deg,#f7f9ff 0,#fff 42%); }.back-button { width:58rpx; height:58rpx; margin:0; padding:0; display:flex; align-items:center; justify-content:center; background:#edf1fb; border-radius:16rpx; }.back-button::after { display:none; }.login-brand { display:flex; align-items:center; gap:12rpx; margin-top:50rpx; }.brand-mark { width:58rpx; height:58rpx; display:flex; align-items:center; justify-content:center; color:#fff; background:linear-gradient(135deg,#3569e8,#7655df); border-radius:17rpx; box-shadow:0 8rpx 16rpx rgba(53,105,232,.2); }.brand-mark text { font-size: 32rpx; font-weight:900; }.login-brand>view:last-child { display:flex; flex-direction:column; gap:3rpx; }.brand-name { color:#1c2d45; font-size: 27rpx; font-weight:900; }.brand-tag { color:#8a95a5; font-size: 17rpx; }.login-title { margin-top:92rpx; color:#152238; font-size:47rpx; font-weight:900; letter-spacing:0; }.login-subtitle { display:block; margin-top:10rpx; color:#7b8797; font-size: 22rpx; }.login-form { display:flex; flex-direction:column; gap:15rpx; margin-top:43rpx; }.field { height:84rpx; display:flex; align-items:center; gap:12rpx; padding:0 20rpx; background:#fff; border:1rpx solid #e2e8f4; border-radius:12rpx; box-shadow:0 5rpx 14rpx rgba(39,57,93,.035); }.field input { flex:1; height:84rpx; color:#27364d; font-size: 25rpx; }.placeholder { color:#a2adbb; }.code-button { min-width:136rpx; height:48rpx; line-height:48rpx; margin:0; padding:0; color:#3569e8; background:#eaf0ff; border-radius:8rpx; font-size: 19rpx; font-weight:750; }.code-button::after { display:none; }.code-button[disabled] { color:#9ba6b5; background:#eef1f5; }.login-button { width:100%; height:82rpx; line-height:82rpx; margin:8rpx 0 0; padding:0; color:#fff; background:linear-gradient(100deg,#3569e8,#6949df); border-radius:12rpx; font-size: 27rpx; font-weight:850; box-shadow:0 12rpx 22rpx rgba(75,88,213,.2); }.login-button::after { display:none; }.agreement { display:flex; align-items:flex-start; gap:9rpx; margin-top:19rpx; color:#8b96a5; font-size: 19rpx; line-height:1.55; }.checkbox { width:27rpx; height:27rpx; display:flex; align-items:center; justify-content:center; flex:none; margin-top:1rpx; border:2rpx solid #cbd3df; border-radius:7rpx; }.checkbox.checked { background:#3569e8; border-color:#3569e8; }.split-line { display:flex; align-items:center; gap:12rpx; margin-top:52rpx; color:#a1aab7; font-size: 19rpx; }.split-line::before,.split-line::after { content:''; height:1rpx; flex:1; background:#e6ebf3; }.wechat-button { width:100%; height:78rpx; display:flex; align-items:center; justify-content:center; gap:11rpx; margin:18rpx 0 0; color:#243951; background:#fff; border:1rpx solid #dce3ee; border-radius:12rpx; font-size: 25rpx; font-weight:800; }.wechat-button::after { display:none; }.wechat-mark { width:42rpx; height:42rpx; display:flex; align-items:center; justify-content:center; background:#16b777; border-radius:50%; }.login-tip { display:block; margin-top:31rpx; text-align:center; color:#a8b1bc; font-size: 17rpx; }
</style>
