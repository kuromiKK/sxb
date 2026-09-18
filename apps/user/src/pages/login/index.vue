<script setup lang="ts">
import CircleAction from '@/components/ui/CircleAction.vue'
import { ref, watch, onUnmounted, nextTick, getCurrentInstance } from 'vue'
import { onLoad, onReady, onResize } from '@dcloudio/uni-app'
import uniIcons from '@dcloudio/uni-ui/lib/uni-icons/uni-icons.vue'
import { useAppStore } from '@/store/app'
import { backOrFallback, finishLoginNavigation, safePageUrl } from '@/utils/navigation'
import { api, acceptSession, refreshRights, refreshPersonalData, showApiError } from '@/services/api'
import {siteSettings,refreshSiteSettings} from '@/services/site-settings'
import ProtocolConsent from '@/components/ProtocolConsent.vue'
import VerificationGate from '@/components/VerificationGate.vue'
import {learningReady} from '@/utils/learning-bootstrap'
import {refreshCatalog} from '@/services/catalog'

const { login } = useAppStore()
const phone = ref('')
const pageInstance = getCurrentInstance()
const sceneScale = ref(0)
const visibleHeight = ref(0)
let sceneObserver: ResizeObserver | undefined
// #ifdef H5
function syncViewport() {
  const viewport = window.visualViewport
  // Keep browser text/viewport zoom usable; only follow keyboard and browser chrome.
  if (!viewport || viewport.scale === 1) visibleHeight.value = viewport?.height || window.innerHeight
}
// #endif
function fitScene() {
  void nextTick(() => {
    uni.createSelectorQuery().in(pageInstance?.proxy).select('.study-scene').boundingClientRect((rect: any) => {
      if (rect) sceneScale.value = Math.max(0, Math.min(1, rect.height / 222))
    }).exec()
  })
}
onReady(() => {
  fitScene()
  // #ifdef H5
  syncViewport()
  window.visualViewport?.addEventListener('resize', syncViewport)
  const scene = (pageInstance?.proxy?.$el as HTMLElement)?.querySelector('.study-scene')
  if (scene) { sceneObserver = new ResizeObserver(fitScene); sceneObserver.observe(scene) }
  // #endif
})
onResize(fitScene)
onUnmounted(() => {
  sceneObserver?.disconnect()
  // #ifdef H5
  window.visualViewport?.removeEventListener('resize', syncViewport)
  // #endif
})
const code = ref('')
const consent=ref<any>(),consentError=ref('')
const countdown = ref(0)
const redirect = ref('')
const referral = ref('')
const testCode = ref('')
const busy = ref(false)
const phoneError = ref('')
const codeError = ref('')
const bindingTicket=ref('')
watch([phoneError, codeError, testCode, bindingTicket], fitScene, { flush: 'post' })
const sendingCode = ref(false)
const verification=ref<InstanceType<typeof VerificationGate>>(),smsSettings=ref({mode:'disabled',codeLength:4,intervalSeconds:60})
watch([() => siteSettings.basic.name, () => smsSettings.value.mode], fitScene, { flush: 'post' })
let timer: ReturnType<typeof setInterval> | undefined

onLoad((options) => { redirect.value = safePageUrl(options?.redirect); referral.value = String(options?.referral || '').toUpperCase();void api('/verification/settings').then(r=>smsSettings.value=r.sms).catch(showApiError);if(options?.wechatResult)void finishWechat(String(options.wechatResult)) })
const toast = (title: string) => uni.showToast({ title, icon: 'none' })
const back = () => backOrFallback('/pages/index/index')
onUnmounted(() => { if (timer) clearInterval(timer) })
watch(phone, () => {
  phoneError.value = ''; codeError.value = ''
  testCode.value = ''; code.value = ''; countdown.value = 0
  if (timer) clearInterval(timer)
})
watch(code, () => { codeError.value = '' })
const validatePhone = () => {
  phoneError.value = /^1\d{10}$/.test(phone.value) ? '' : '请输入正确的 11 位手机号'
  return !phoneError.value
}
const sendCode = async () => {
  if (countdown.value || sendingCode.value) return
  if (smsSettings.value.mode==='disabled') return toast('短信服务暂未开启')
  if (!validatePhone()) return
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
  setTimeout(() => finishLoginNavigation(redirect.value), 350)
}
const submit = async () => {
  if (busy.value) return
  if (!validatePhone()) return
  codeError.value = (new RegExp(`^\\d{${smsSettings.value.codeLength}}$`)).test(code.value) ? '' : `请输入${smsSettings.value.codeLength}位验证码`
  if (codeError.value) return
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
</script>

<template>
  <view class="login-page" :class="{ 'keyboard-layout': visibleHeight > 0 && visibleHeight <= 500 }" :style="visibleHeight ? { height: visibleHeight + 'px' } : {}">
    <view class="login-nav"><CircleAction class="back-button" @tap="back" tone="light"/><button class="wechat-button" role="button" tabindex="0" @keydown.enter.prevent="wechat" @keydown.space.prevent="wechat" :aria-disabled="busy" :disabled="busy" @tap="wechat"><uni-icons type="weixin" size="16" color="#ffffff" aria-hidden="true" /><text>微信登录</text></button></view>
    <view class="login-content">
      <view class="login-brand">
        <view class="brand-tile"><image v-if="siteSettings.basic.logo" class="brand-logo" :src="siteSettings.basic.logo" mode="aspectFit" alt="平台 Logo"/><text v-else class="brand-mark">{{siteSettings.basic.name.slice(0,1)}}</text></view>
        <text class="brand-name">{{siteSettings.basic.name}}</text>
        <text class="brand-tag">让备考更有方向</text>
      </view>
      <text v-if="bindingTicket" class="binding-hint" role="status">微信授权成功，请用手机号登录完成绑定</text>
      <view class="login-form">
        <view class="field-group"><view class="field" :class="{'field-invalid':phoneError}"><label for="login-phone" class="field-label">手机号</label><input id="login-phone" v-model="phone" type="number" maxlength="11" aria-label="手机号" :aria-invalid="Boolean(phoneError)" placeholder="请输入手机号" placeholder-class="placeholder" /></view><text v-if="phoneError" class="field-error" role="alert">{{phoneError}}</text></view>
        <view class="field-group"><view class="field" :class="{'field-invalid':codeError}"><label for="login-code" class="field-label">验证码</label><input id="login-code" v-model="code" type="number" :maxlength="smsSettings.codeLength" aria-label="验证码" :aria-invalid="Boolean(codeError)" placeholder="输入验证码" placeholder-class="placeholder" confirm-type="done" @confirm="submit" /><button class="code-button" role="button" tabindex="0" @keydown.enter.prevent="sendCode" @keydown.space.prevent="sendCode" :aria-disabled="Boolean(countdown) || sendingCode || smsSettings.mode==='disabled'" :disabled="Boolean(countdown) || sendingCode || smsSettings.mode==='disabled'" @tap="sendCode">{{ sendingCode ? '获取中…' : countdown ? `${countdown}s 后重发` : '获取验证码' }}</button></view><text v-if="codeError" class="field-error" role="alert">{{codeError}}</text></view>
        <view class="field referral-field"><label for="login-referral" class="field-label">推荐码</label><input id="login-referral" v-model="referral" maxlength="10" aria-label="推荐码（选填）" placeholder="选填，有朋友推荐可以填这里" placeholder-class="placeholder" @input="referral=referral.toUpperCase()" /></view>
        <button class="login-button" role="button" tabindex="0" @keydown.enter.prevent="submit" @keydown.space.prevent="submit" :aria-disabled="busy" :loading="busy" :disabled="busy" @tap="submit">{{busy ? '正在登录' : bindingTicket ? '登录并绑定微信' : '登录 / 注册'}}<uni-icons v-if="!busy" type="arrow-right" size="18" color="#ffffff" aria-hidden="true" /></button>
      </view>
      <view class="agreement-links"><view><button role="button" tabindex="0" @keydown.enter.prevent="openProtocol('agreement')" @keydown.space.prevent="openProtocol('agreement')" @tap="openProtocol('agreement')">用户服务协议</button><text aria-hidden="true">·</text><button role="button" tabindex="0" @keydown.enter.prevent="openProtocol('privacy')" @keydown.space.prevent="openProtocol('privacy')" @tap="openProtocol('privacy')">隐私政策</button></view></view>
      <text class="login-tip" :class="{'has-test-code':testCode}" role="status">{{ testCode ? `测试验证码：${testCode}（不发送短信）` : smsSettings.mode==='test'?'测试环境：点击获取验证码后在此显示，仅供测试账号使用':smsSettings.mode==='disabled'?'短信登录暂未开启':'验证码将发送至你的手机，请注意查收' }}</text>
    </view>
    <view class="study-scene" aria-hidden="true">
      <view class="scene-artwork" :style="{ transform: 'scale(' + sceneScale + ')' }">
      <view class="scene-spark spark-one"></view><view class="scene-spark spark-two"></view>
      <view class="study-notebook"><view class="notebook-rings"></view><view class="notebook-label"><view></view><view></view></view><view class="notebook-band"></view></view>
      <view class="study-book book-back"><view class="book-spine"></view><view class="book-lines"></view></view>
      <view class="study-book book-front"><view class="book-spine"></view><view class="book-eyes"></view><view class="book-smile"></view></view>
      <view class="book-stack"><view class="stack-volume volume-top"><view class="page-edges"></view><view class="ribbon-bookmark"></view></view><view class="stack-volume volume-middle"><view class="page-edges"></view></view><view class="stack-volume volume-bottom"><view class="page-edges"></view></view></view>
      <view class="pocket-book"><view class="pocket-label"></view><view class="pocket-binding"></view></view>
      <view class="scene-message"><text>保持好奇</text><text>继续向上</text><view class="message-line"></view></view>
      <view class="study-pencil"><view class="pencil-band"></view></view>
      </view>
    </view>
    <VerificationGate ref="verification"/>
    <ProtocolConsent v-if="consent" :protocols="consent.protocols" :busy="busy" :error="consentError" @confirm="confirmConsent" @cancel="consent=undefined;code='';consentError=''"/>
  </view>
</template>
<style scoped lang="scss">
.login-page {
  --login-bg: var(--sxb-blue, #3569e8);
  --login-ink: #14264f;
  --login-surface: #ffffff;
  --login-muted: #dce6ff;
  --login-field: #ffffff;
  --login-placeholder: #5d6e83;
  position: relative; display: flex; flex-direction: column; height:100vh; height:100dvh; min-height:0; overflow:hidden; box-sizing:border-box;
  max-width: 430px; margin: 0 auto; padding-top: env(safe-area-inset-top, 0px); padding-bottom:env(safe-area-inset-bottom,0px);
  color: var(--login-surface); background-color: var(--login-bg);
  background-image: linear-gradient(45deg,rgba(255,255,255,.035) 25%,transparent 25%,transparent 75%,rgba(255,255,255,.035) 75%),linear-gradient(45deg,rgba(255,255,255,.035) 25%,transparent 25%,transparent 75%,rgba(255,255,255,.035) 75%);
  background-size: 64px 64px; background-position: 0 0,32px 32px;
}
.login-nav { flex:none; display:flex; align-items:center; justify-content:space-between; padding:8px 20px 0; }
.back-button { display:flex; align-items:center; justify-content:center; width:44px; height:44px; margin:0; padding:0; border-radius:50%; background:rgba(20,38,79,.18); }

.login-content { position:relative; z-index:1; flex:0 0 auto; box-sizing:border-box; max-height:calc(100% - 52px); overflow-y:auto; padding:clamp(4px,1.5vh,16px) 28px 12px; }
.login-brand { display:flex; flex-direction:column; align-items:center; margin:4px 0 clamp(14px,2.5vh,26px); }
.brand-tile { display:flex; align-items:center; justify-content:center; width:64px; height:64px; padding:6px; border-radius:20px; background:var(--login-surface); box-shadow:0 6px 0 rgba(20,38,79,.18); transform:rotate(-7deg); }
.brand-logo { width:60px; height:60px; border-radius:16px; transform:rotate(7deg); }
.brand-mark { font-size:40px; font-weight:900; color:var(--login-bg); transform:rotate(7deg); }
.brand-name { max-width:100%; overflow-wrap:anywhere; margin-top:12px; color:var(--login-surface); font-size:28px; font-weight:800; letter-spacing:3px; line-height:1.3; text-align:center; }
.brand-tag { margin-top:7px; font-size:14px; font-weight:600; letter-spacing:3px; }
.binding-hint { display:block; text-align:center; margin-bottom:18px; font-size:13px; line-height:1.7; }


.login-form { display:flex; flex-direction:column; gap:10px; }
.field { display:flex; align-items:center; gap:10px; min-height:54px; padding:0 14px; color:var(--login-ink); background:var(--login-field); border:2px solid transparent; border-radius:16px; transition:border-color 160ms; }
.field:focus-within { border-color:var(--login-ink); }
.field-label { flex:none; font-size:13px; font-weight:600; }
.field input { min-width:0; flex:1; height:50px; color:var(--login-ink); font-size:16px; }
.placeholder { color:var(--login-placeholder); font-size:13px; }
.field-invalid { border-color:var(--login-ink); }
.field-error { display:block; margin:5px 10px 0; font-size:12px; font-weight:600; line-height:1.6; }
.code-button { flex:none; display:flex; align-items:center; min-height:44px; margin:0 -6px 0 0; padding:0 6px; background:transparent; color:var(--login-bg); font-size:12px; font-weight:700; border-radius:8px; white-space:nowrap; }
.code-button[disabled] { background:transparent; color:var(--login-placeholder); }
.referral-field { min-height:48px; background:rgba(255,255,255,.92); }
.referral-field input { height:44px; font-size:16px; }
.login-button { display:flex; align-items:center; justify-content:center; gap:10px; width:100%; min-height:54px; margin:8px 0 0; padding:10px 16px; border-radius:18px; background:var(--login-ink); color:var(--login-surface); font-size:16px; font-weight:700; line-height:1.6; box-shadow:0 4px 0 rgba(20,38,79,.2); }
.login-button[disabled] { background:#53658d; color:var(--login-surface); }
.wechat-button { display:flex; align-items:center; justify-content:center; gap:6px; min-height:44px; margin:0; padding:0 4px 0 12px; border:0; border-radius:8px; background:transparent; color:var(--login-surface); font-size:12px; font-weight:400; line-height:1.6; }
.wechat-button[disabled] { background:transparent; color:var(--login-muted); opacity:.65; }
.agreement-links { margin-top:9px; text-align:center; font-size:12px; line-height:1.7; }
.agreement-links>view { display:flex; align-items:center; justify-content:center; gap:8px; }
.agreement-links button { display:flex; align-items:center; min-height:44px; margin:0; padding:6px 2px; background:transparent; color:var(--login-surface); font-size:12px; font-weight:700; line-height:1.6; text-decoration:underline; text-underline-offset:3px; }

.login-tip { display:block; margin-top:4px; text-align:center; font-size:12px; line-height:1.7; }
.has-test-code { color:var(--login-ink); padding:8px 10px; background:var(--login-surface); border-radius:12px; font-weight:600; }
button { cursor:pointer; touch-action:manipulation; transition:opacity 160ms,background-color 160ms; }
button::after { border:0; }
button:active:not([disabled]) { opacity:.78; }
button:focus-visible { outline:3px solid var(--login-surface); outline-offset:3px; }
.code-button:focus-visible { outline-color:var(--login-ink); outline-offset:0; }
.study-scene { position:relative; flex:1 1 222px; min-height:0; overflow:hidden; pointer-events:none; }
.scene-artwork { position:absolute; bottom:0; left:0; width:100%; height:222px; transform-origin:center bottom; }
.study-book { position:absolute; bottom:14px; border:2px solid var(--login-ink); border-radius:9px 14px 14px 9px; box-shadow:5px 5px 0 rgba(20,38,79,.15); }
.book-back { left:3%; bottom:38px; width:24%; height:139px; background:#b2bde9; transform:rotate(-16deg); }
.book-front { left:15%; bottom:22px; width:24%; height:119px; background:#f8d575; transform:rotate(9deg); }
.book-spine { position:absolute; left:9px; top:0; bottom:0; border-left:2px solid rgba(20,38,79,.35); }
.book-lines { position:absolute; left:24px; top:24px; width:34px; height:6px; border-top:2px solid var(--login-ink); border-bottom:2px solid var(--login-ink); }
.book-eyes { position:absolute; top:30px; left:31px; width:5px; height:8px; border-radius:50%; background:var(--login-ink); box-shadow:21px 0 0 var(--login-ink); }
.book-smile { position:absolute; top:46px; left:41px; width:15px; height:9px; border:2px solid var(--login-ink); border-top:0; border-radius:0 0 12px 12px; }
.scene-message { position:absolute; bottom:108px; left:40%; transform:rotate(-5deg); }
.scene-message text { display:block; font-size:16px; font-weight:800; line-height:1.5; letter-spacing:2px; }
.message-line { width:74px; margin-top:5px; border-top:3px solid var(--login-surface); border-radius:50%; transform:rotate(-5deg); }
.study-pencil { position:absolute; right:5%; bottom:48px; width:24px; height:132px; background:#a9cdb4; border:2px solid var(--login-ink); border-radius:10px 10px 0 0; transform:rotate(18deg); }
.study-pencil::after { content:''; position:absolute; left:-2px; bottom:-21px; width:0; height:0; border-left:14px solid transparent; border-right:15px solid transparent; border-top:22px solid var(--login-surface); }
.pencil-band { position:absolute; top:19px; left:0; right:0; border-top:7px solid var(--login-surface); border-bottom:2px solid var(--login-ink); }
.scene-spark { position:absolute; width:17px; height:17px; background:var(--login-surface); clip-path:polygon(50% 0,62% 36%,100% 50%,62% 62%,50% 100%,38% 62%,0 50%,38% 36%); }
.spark-one { top:22px; left:37%; transform:rotate(12deg); }
.spark-two { top:17px; right:12%; width:11px; height:11px; }
.study-notebook { position:absolute; right:12%; bottom:59px; width:24%; height:137px; border:2px solid var(--login-ink); border-radius:10px; background:#d2e8f6; transform:rotate(12deg); box-shadow:4px 4px 0 rgba(20,38,79,.16); }
.notebook-rings { position:absolute; left:-6px; top:13px; bottom:12px; width:11px; background:repeating-linear-gradient(to bottom,var(--login-ink) 0,var(--login-ink) 3px,transparent 3px,transparent 15px); }
.notebook-label { margin:23px 15px 0; padding:9px 6px; border:1.5px solid var(--login-ink); border-radius:5px; background:#fffdf5; }
.notebook-label>view { height:2px; margin:4px 0; background:#8da8c6; }
.notebook-label>view:last-child { width:65%; }
.notebook-band { position:absolute; top:0; right:10px; bottom:0; width:5px; background:#80accb; border-left:1px solid rgba(20,38,79,.3); }
.book-stack { position:absolute; left:32%; bottom:17px; width:57%; height:87px; }
.stack-volume { position:absolute; height:29px; border:2px solid var(--login-ink); border-radius:6px 9px 9px 6px; box-shadow:0 3px 0 rgba(20,38,79,.15); }
.volume-top { top:0; left:4%; width:88%; background:#a9cdb4; transform:rotate(-5deg); z-index:3; }
.volume-middle { top:28px; left:0; width:100%; background:#d6c7f5; transform:rotate(3deg); z-index:2; }
.volume-bottom { top:55px; left:6%; width:94%; background:#f8d575; transform:rotate(-2deg); }
.page-edges { position:absolute; top:5px; bottom:5px; left:13px; right:0; border:1px solid rgba(20,38,79,.4); border-right:0; border-radius:5px 0 0 5px; background:repeating-linear-gradient(to bottom,#fffdf5 0,#fffdf5 3px,#cad5de 3px,#cad5de 4px); }
.ribbon-bookmark { position:absolute; right:23%; top:9px; width:13px; height:29px; background:#6489ee; border:1px solid var(--login-ink); clip-path:polygon(0 0,100% 0,100% 100%,50% 78%,0 100%); }
.pocket-book { position:absolute; bottom:9px; left:-3%; width:30%; height:52px; border:2px solid var(--login-ink); border-radius:6px; background:#8fb8df; transform:rotate(8deg); }
.pocket-label { position:absolute; top:14px; left:30%; width:44%; height:17px; border:1px solid var(--login-ink); border-radius:3px; background:#fffdf5; }
.pocket-binding { position:absolute; left:13%; top:0; bottom:0; border-left:2px solid rgba(20,38,79,.35); }
@media (max-width:350px) {
  .login-content { padding-left:18px; padding-right:18px; }
  .field { padding:0 10px; gap:7px; }
  .brand-name { font-size:28px; }
  .login-brand { margin-top:4px; margin-bottom:14px; }
}
@media (max-height:740px) {
  .login-brand { display:grid; grid-template-columns:64px auto; justify-content:center; column-gap:16px; margin:4px 0 16px; }
  .brand-tile { grid-row:1 / 3; width:52px; height:52px; border-radius:17px; }
  .brand-logo { width:48px; height:48px; }
  .brand-name { margin-top:0; font-size:26px; text-align:left; }
  .brand-tag { margin-top:2px; font-size:12px; letter-spacing:1px; }
}
@media (max-height:500px) {
  .login-brand { display:none; }
  .login-content { padding-top:4px; padding-bottom:4px; }
  .login-form { gap:6px; }
  .field { min-height:44px; }
  .field input { height:40px; }
  .login-button { min-height:44px; margin-top:2px; padding:8px 16px; }
  .agreement-links { margin-top:2px; }
}
.keyboard-layout .login-brand { display:none; }
.keyboard-layout .login-content { padding-top:4px; padding-bottom:4px; }
.keyboard-layout .login-form { gap:6px; }
.keyboard-layout .field { min-height:44px; }
.keyboard-layout .field input { height:40px; }
.keyboard-layout .login-button { min-height:44px; margin-top:2px; padding:8px 16px; }
.keyboard-layout .agreement-links { margin-top:2px; }
@media (prefers-reduced-motion:reduce) { button,.field { transition:none; } }
</style>
