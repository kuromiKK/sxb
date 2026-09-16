<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import uniIcons from '@dcloudio/uni-ui/lib/uni-icons/uni-icons.vue'
import { useAppStore } from '@/store/app'
import { backOrFallback } from '@/utils/navigation'
import { api, acceptSession, refreshRights, refreshPersonalData, showApiError } from '@/services/api'
import {siteSettings,refreshSiteSettings} from '@/services/site-settings'
import ProtocolConsent from '@/components/ProtocolConsent.vue'
import VerificationGate from '@/components/VerificationGate.vue'
import {learningReady} from '@/utils/learning-bootstrap'
import {refreshCatalog} from '@/services/catalog'

const { login } = useAppStore()
const phone = ref('')
const code = ref('')
const consent=ref<any>(),consentError=ref('')
const countdown = ref(0)
const redirect = ref('')
const referral = ref('')
const testCode = ref('')
const busy = ref(false)
const bindingTicket=ref('')
const sendingCode = ref(false)
const verification=ref<InstanceType<typeof VerificationGate>>(),smsSettings=ref({mode:'disabled',codeLength:4,intervalSeconds:60})
let timer: ReturnType<typeof setInterval> | undefined

onLoad((options) => { redirect.value = options?.redirect ? decodeURIComponent(options.redirect) : ''; referral.value = String(options?.referral || '').toUpperCase();void api('/verification/settings').then(r=>smsSettings.value=r.sms).catch(showApiError);if(options?.wechatResult)void finishWechat(String(options.wechatResult)) })
const toast = (title: string) => uni.showToast({ title, icon: 'none' })
const back = () => backOrFallback('/pages/index/index')
onUnmounted(() => { if (timer) clearInterval(timer) })
watch(phone, () => {
  testCode.value = ''; code.value = ''; countdown.value = 0
  if (timer) clearInterval(timer)
})
const sendCode = async () => {
  if (countdown.value || sendingCode.value) return
  if (smsSettings.value.mode==='disabled') return toast('短信服务暂未开启')
  if (!/^1\d{10}$/.test(phone.value)) return toast('请输入正确的手机号')
  const requestedPhone = phone.value
  sendingCode.value = true
  try {
  const captchaProof=await verification.value!.verify('sms',requestedPhone)
  if(phone.value!==requestedPhone)return
  const result = await api('/auth/code', 'POST', { phone: requestedPhone,captchaProof })
  if (phone.value !== requestedPhone) return
  testCode.value = result.testCode || ''
  countdown.value = result.retryAfter||60
  timer = setInterval(() => { countdown.value -= 1; if (!countdown.value && timer) clearInterval(timer) }, 1000)
  } catch (error) { showApiError(error) } finally { sendingCode.value = false }
}
const finish = (identity: string) => {
  login(identity)
  uni.showToast({ title: '登录成功', icon: 'success' })
  setTimeout(() => redirect.value ? openRoute(redirect.value) : uni.reLaunch({ url: '/pages/index/index' }), 350)
}
const submit = async () => {
  if (busy.value) return
  if (!/^1\d{10}$/.test(phone.value)) return toast('请输入正确的手机号')
  if (!(new RegExp(`^\\d{${smsSettings.value.codeLength}}$`)).test(code.value)) return toast(`请输入${smsSettings.value.codeLength}位验证码`)
  busy.value = true
  try {
    const result=await api('/auth/phone', 'POST', { phone: phone.value, code: code.value })
    if(result.consentRequired){consentError.value='';consent.value=result;return}
    await complete(result)
  } catch (error) { showApiError(error) } finally { busy.value = false }
}
async function handleWechat(result:any){if(result.bindingRequired){bindingTicket.value=result.bindingTicket;toast('微信授权成功，请用手机号登录完成绑定');return}if(result.consentRequired){consent.value=result;return}await complete(result)}
async function finishWechat(ticket:string){
 // #ifdef H5
 const verifier=sessionStorage.getItem('sxb-wechat-verifier')||'';sessionStorage.removeItem('sxb-wechat-verifier');history.replaceState(null,'',location.href.replace(/([?&])wechatResult=[^&]*/,'$1').replace(/[?&]$/,''));busy.value=true;try{await handleWechat(await api('/auth/wechat/finish','POST',{ticket,verifier}))}catch(e){showApiError(e)}finally{busy.value=false}
 // #endif
}
const wechat = async () => {if(busy.value)return;busy.value=true;try{
 // #ifdef MP-WEIXIN
 const loginCode=await new Promise<string>((resolve,reject)=>uni.login({provider:'weixin',success:r=>resolve(r.code),fail:reject}));await handleWechat(await api('/auth/wechat/mini','POST',{code:loginCode}));
 // #endif
 // #ifdef H5
 const verifier=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');sessionStorage.setItem('sxb-wechat-verifier',verifier);const r=await api('/auth/wechat/start','POST',{channel:/MicroMessenger/i.test(navigator.userAgent)?'official':'web',verifier});location.assign(r.url);
 // #endif
 }catch(e){showApiError(e)}finally{busy.value=false}}
async function complete(result:any){await learningReady;acceptSession(result);consent.value=undefined;if(bindingTicket.value){try{await api('/auth/wechat/bind','POST',{ticket:bindingTicket.value});bindingTicket.value=''}catch(e){showApiError(e)}}if(referral.value){try{await api('/referrals/use','POST',{code:referral.value})}catch{}}await refreshCatalog();await refreshRights();await refreshPersonalData();finish(result.user.phone)}
async function confirmConsent(){if(busy.value||!consent.value)return;busy.value=true;consentError.value='';try{await complete(await api('/auth/protocol-consent','POST',{challenge:consent.value.challenge,confirmed:true,versions:consent.value.protocols.map((p:any)=>({kind:p.kind,version:p.version}))}))}catch(e:any){consentError.value=e.message;if(!consent.value)showApiError(e);if(e.message.includes('协议已更新')){await refreshSiteSettings().catch(()=>{});if(siteSettings.ready)consent.value={...consent.value,protocols:JSON.parse(JSON.stringify(siteSettings.protocols))}}}finally{busy.value=false}}
const openProtocol=(kind:string)=>uni.navigateTo({url:'/pages/profile-center/index?mode='+kind})
const tabRoutes = ['/pages/index/index', '/pages/knowledge/index', '/pages/courses/index', '/pages/practice/index', '/pages/profile/index']
const openRoute = (url: string) => tabRoutes.includes(url) ? uni.reLaunch({ url }) : uni.navigateTo({ url })
</script>

<template>
  <view class="login-page safe-top">
    <button class="back-button" @tap="back"><uni-icons type="back" size="21" color="#4b5a70" /></button>
    <view class="login-brand"><image v-if="siteSettings.basic.logo" class="brand-logo" :src="siteSettings.basic.logo" mode="aspectFit" alt="平台 Logo"/><view v-else class="brand-mark"><text>{{siteSettings.basic.name.slice(0,1)}}</text></view><view><text class="brand-name">{{siteSettings.basic.name}}</text><text class="brand-tag">让备考更有方向</text></view></view>
    <view class="login-title">欢迎回来</view><text class="login-subtitle">登录后，开启你的高效备考之旅</text>
    <view class="login-form">
      <view class="field"><uni-icons type="phone" size="21" color="#8793a6" /><input v-model="phone" type="number" maxlength="11" aria-label="手机号" placeholder="请输入手机号" placeholder-class="placeholder" /></view>
      <view class="field"><uni-icons type="locked" size="21" color="#8793a6" /><input v-model="code" type="number" :maxlength="smsSettings.codeLength" aria-label="验证码" placeholder="请输入验证码" placeholder-class="placeholder" /><button class="code-button" :disabled="Boolean(countdown) || sendingCode || smsSettings.mode==='disabled'" @tap="sendCode">{{ sendingCode ? '获取中…' : countdown ? `${countdown}s 后重发` : '获取验证码' }}</button></view>
      <view class="field"><uni-icons type="gift" size="21" color="#8793a6" /><input v-model="referral" maxlength="10" aria-label="推荐码" placeholder="推荐码（选填）" placeholder-class="placeholder" @input="referral=referral.toUpperCase()" /></view>
      <button class="login-button" :loading="busy" :disabled="busy" @tap="submit">登录</button>
    </view>
    <view class="agreement-links"><view><button @tap="openProtocol('agreement')">用户服务协议</button><button @tap="openProtocol('privacy')">隐私政策</button></view><text>首次登录或协议更新后，需阅读并确认协议。未注册手机号将自动创建账号。</text></view>
    <view class="split-line"><text>其他登录方式</text></view><button class="wechat-button" @tap="wechat"><view class="wechat-mark"><uni-icons type="weixin" size="21" color="#fff" /></view><text>微信一键登录</text></button>
    <text class="login-tip">{{ testCode ? `测试验证码：${testCode}（不发送短信）` : smsSettings.mode==='test'?'测试环境：点击获取验证码后在此显示，仅供测试账号使用':smsSettings.mode==='disabled'?'短信登录暂未开启':'验证码将发送至你的手机，请注意查收' }}</text>
    <VerificationGate ref="verification"/>
    <ProtocolConsent v-if="consent" :protocols="consent.protocols" :busy="busy" :error="consentError" @confirm="confirmConsent" @cancel="consent=undefined;code='';consentError=''"/>
  </view>
</template>
<style scoped>.brand-logo{width:58rpx;height:58rpx;border-radius:12rpx;flex:none}.agreement-links{margin-top:16px;font-size:12px;color:#65758b;line-height:1.7}.agreement-links>view{display:flex;gap:14px}.agreement-links button{font-size:13px;color:#3569e8;margin:0;padding:8px 0;background:transparent;line-height:1.8;min-height:40px}.agreement-links button:after{border:0}</style>

<style scoped lang="scss">
.login-page { position:relative; max-width:430px; min-height:100vh; margin:0 auto; box-sizing:border-box; padding:28rpx 30rpx 50rpx; background:linear-gradient(180deg,#f7f9ff 0,#fff 42%); }.back-button { width:58rpx; height:58rpx; margin:0; padding:0; display:flex; align-items:center; justify-content:center; background:#edf1fb; border-radius:16rpx; }.back-button::after { display:none; }.login-brand { display:flex; align-items:center; gap:12rpx; margin-top:50rpx; }.brand-mark { width:58rpx; height:58rpx; display:flex; align-items:center; justify-content:center; color:#fff; background:linear-gradient(135deg,#3569e8,#7655df); border-radius:17rpx; box-shadow:0 8rpx 16rpx rgba(53,105,232,.2); }.brand-mark text { font-size: var(--sxb-text-heading); font-weight:700; }.login-brand>view:last-child { display:flex; flex-direction:column; gap:3rpx; }.brand-name { color:#1c2d45; font-size: var(--sxb-text-title); font-weight:700; }.brand-tag { color:#8a95a5; font-size: var(--sxb-text-meta); }.login-title { margin-top:92rpx; color:#152238; font-size:var(--sxb-text-display); font-weight:700; letter-spacing:0; }.login-subtitle { display:block; margin-top:10rpx; color:#7b8797; font-size: var(--sxb-text-body); }.login-form { display:flex; flex-direction:column; gap:15rpx; margin-top:43rpx; }.field { height:84rpx; display:flex; align-items:center; gap:12rpx; padding:0 20rpx; background:#fff; border:1rpx solid #e2e8f4; border-radius:12rpx; box-shadow:0 5rpx 14rpx rgba(39,57,93,.035); }.field input { flex:1; height:84rpx; color:#27364d; font-size: var(--sxb-text-item); }.placeholder { color:#a2adbb; }.code-button { min-width:136rpx; height:48rpx; line-height:48rpx; margin:0; padding:0; color:#3569e8; background:#eaf0ff; border-radius:8rpx; font-size: var(--sxb-text-small); font-weight:700; }.code-button::after { display:none; }.code-button[disabled] { color:#9ba6b5; background:#eef1f5; }.login-button { width:100%; height:82rpx; line-height:82rpx; margin:8rpx 0 0; padding:0; color:#fff; background:linear-gradient(100deg,#3569e8,#6949df); border-radius:12rpx; font-size: var(--sxb-text-title); font-weight:700; box-shadow:0 12rpx 22rpx rgba(75,88,213,.2); }.login-button::after { display:none; }.agreement { display:flex; align-items:flex-start; gap:9rpx; margin-top:19rpx; color:#8b96a5; font-size: var(--sxb-text-small); line-height:1.55; }.checkbox { width:27rpx; height:27rpx; display:flex; align-items:center; justify-content:center; flex:none; margin-top:1rpx; border:2rpx solid #cbd3df; border-radius:7rpx; }.checkbox.checked { background:#3569e8; border-color:#3569e8; }.split-line { display:flex; align-items:center; gap:12rpx; margin-top:52rpx; color:#a1aab7; font-size: var(--sxb-text-small); }.split-line::before,.split-line::after { content:''; height:1rpx; flex:1; background:#e6ebf3; }.wechat-button { width:100%; height:78rpx; display:flex; align-items:center; justify-content:center; gap:11rpx; margin:18rpx 0 0; color:#243951; background:#fff; border:1rpx solid #dce3ee; border-radius:12rpx; font-size: var(--sxb-text-item); font-weight:700; }.wechat-button::after { display:none; }.wechat-mark { width:42rpx; height:42rpx; display:flex; align-items:center; justify-content:center; background:#16b777; border-radius:50%; }.login-tip { display:block; margin-top:31rpx; text-align:center; color:#a8b1bc; font-size: var(--sxb-text-meta); }

@import '@/styles/content-system.scss';
</style>
