<script setup lang="ts">
import {ref,onUnmounted,computed} from 'vue'
import GoCaptchaUni from 'go-captcha-uni'
import {api} from '@/services/api'
import {captchaAnswer,captchaTheme,captchaCssVariables} from '../../../shared/captcha'
const visible=ref(false),challenge=ref<any>(),error=ref(''),busy=ref(false),localCode=ref(''),answer=ref('')
let target='',scope:'sms'|'handout'='handout',resolve:((proof:string)=>void)|undefined,reject:((e:Error)=>void)|undefined,generation=0
const width=Math.min(300,uni.getSystemInfoSync().windowWidth-64)
const scale=computed(()=>width/(challenge.value?.width||300))
const slideData=computed(()=>{const d=challenge.value?.data;return d?{...d,thumbX:d.thumbX*scale.value,thumbY:d.thumbY*scale.value,thumbWidth:d.thumbWidth*scale.value,thumbHeight:d.thumbHeight*scale.value}:{}})
const theme=computed(()=>captchaTheme(challenge.value?.color||'#3569e8',challenge.value?.appearance))
const widgetData=computed(()=>({...slideData.value,thumbSize:(challenge.value?.data.thumbSize||0)*scale.value}))
const widgetConfig=computed(()=>({width,height:(challenge.value?.height||220)*scale.value,size:(challenge.value?.size||220)*scale.value,thumbWidth:(challenge.value?.data.thumbWidth||150)*scale.value,thumbHeight:(challenge.value?.data.thumbHeight||40)*scale.value,title:challenge.value?.title,buttonText:'确认',showTheme:false,horizontalPadding:0,verticalPadding:0}))
async function refresh(){const current=++generation;busy.value=true;challenge.value=undefined;answer.value='';try{const value=await api('/verification/challenge','POST',{scope,target});if(current!==generation)return;if(value.mode==='frontend'&&!value.required){finish('');return}challenge.value=value;localCode.value=String(Math.floor(1000+Math.random()*9000))}catch(e:any){if(current===generation)error.value=e.message}finally{if(current===generation)busy.value=false}}
function finish(proof:string){visible.value=false;generation++;resolve?.(proof);resolve=undefined;reject=undefined}
function cancel(){visible.value=false;generation++;reject?.(Object.assign(new Error('已取消验证'),{code:'VERIFICATION_CANCELLED'}));resolve=undefined;reject=undefined}
function verify(nextScope:'sms'|'handout',nextTarget:string):Promise<string>{if(resolve)cancel();scope=nextScope;target=nextTarget;visible.value=true;error.value='';const result=new Promise<string>((ok,no)=>{resolve=ok;reject=no});void refresh();return result}
async function confirm(value:any){if(busy.value||!challenge.value)return;const answer=captchaAnswer(challenge.value.type||'slide',value,scale.value);if('points' in answer&&!answer.points.length){error.value='请先按提示顺序点选图片';return}busy.value=true;const current=generation;error.value='';try{const result=await api('/verification/check','POST',{scope,target,challengeId:challenge.value.challengeId,answer});if(current===generation)finish(result.proof)}catch(e:any){if(current===generation){error.value=e.message;await refresh()}}finally{if(current===generation)busy.value=false}}
function confirmLocal(){if(answer.value.trim()!==localCode.value){error.value='验证码不正确';return}finish('')}
onUnmounted(cancel)
defineExpose({verify})
</script>
<template>
 <view v-if="visible" class="verify-mask" :style="captchaCssVariables(challenge?.color||'#3569e8',challenge?.appearance,challenge?.variant)" @touchmove.stop.prevent>
  <view class="verify-card sxb-dialog" :class="{'is-dark':challenge?.appearance==='dark','is-busy':busy}" :style="{background:theme.bgColor,color:theme.textColor}" role="dialog" aria-label="安全验证" aria-modal="true">
   <view class="verify-heading" :style="{color:theme.textColor}"><text>安全验证</text><button :style="{color:theme.iconColor}" aria-label="取消验证" @tap="cancel">×</button></view>
   <text v-if="busy" class="verify-hint">正在加载…</text>
   <GoCaptchaUni v-if="challenge?.mode==='gocaptcha'" :key="challenge.challengeId" :type="challenge.type||'slide'" :data="widgetData" :config="widgetConfig" :theme="theme" @event-confirm="confirm" @event-refresh="error='';refresh()" @event-close="cancel"/>
   <view v-else-if="challenge?.mode==='frontend'" class="local-verify"><text class="local-code">{{localCode}}</text><input v-model="answer" type="number" maxlength="4" placeholder="请输入上方验证码" aria-label="验证码"/><button class="sxb-dialog-action" @tap="confirmLocal">确认</button></view>
   <text v-if="error" class="verify-error" role="alert">{{error}}</text>
   <button v-if="!challenge&&!busy" class="verify-retry sxb-dialog-action" @tap="error='';refresh()">重新加载</button>
  </view>
 </view>
</template>
<style scoped>
.verify-mask{position:fixed;inset:0;z-index:10050;background:rgba(20,33,54,.48);display:flex;align-items:center;justify-content:center;padding:16px}.verify-card{width:332px;max-width:100%;box-sizing:border-box;padding:16px;background:#fff;border-radius:16px;box-shadow:0 16px 60px #172b4a26}.verify-heading{display:flex;align-items:center;justify-content:space-between;font-size:17px;font-weight:600;margin-bottom:12px;color:#22354e}.verify-heading button{width:44px;height:44px;line-height:44px;margin:-10px -8px -10px 0;padding:0;font-size:26px;background:transparent;color:#53677e}.verify-heading button:after{border:0}.verify-hint,.verify-error{display:block;font-size:14px;line-height:1.7;margin:10px 0}.verify-hint{color:#53677e}.verify-error{color:#b42318}.local-verify{display:flex;flex-direction:column;gap:14px}.local-code{text-align:center;letter-spacing:12px;font-size:30px;background:#eef2ff;color:#294bb1;padding:18px}.local-verify input{height:46px;border:1px solid #dce3ed;border-radius:6px;padding:0 12px;font-size:16px}.local-verify button,.verify-retry{min-height:44px;background:#3569e8;color:#fff;font-size:15px;width:100%}
</style>
<style>
/* The upstream UniApp slider uses a fixed background; inherit the saved theme on both clients. */
.verify-mask .go-captcha .gc-drag-block{background-color:var(--go-captcha-theme-drag-bg-color,#3569e8)!important;color:var(--go-captcha-theme-drag-icon-color,#fff)!important;min-height:44px;margin-top:-22px!important}
.verify-mask .go-captcha .gc-drag-line{background:var(--go-captcha-theme-drag-bar-color)!important}
.verify-mask .go-captcha .gc-header{height:auto;min-height:40px;line-height:1.5;gap:4px}
.verify-mask .go-captcha .gc-header .gc-text{white-space:normal;overflow-wrap:anywhere;min-width:0}
.verify-mask .go-captcha .gc-header>uni-image,.verify-mask .go-captcha .gc-header>image{flex-shrink:0;background:var(--sxb-captcha-hint-bg);border-radius:4px}
.verify-mask .verify-card{max-height:calc(100vh - 32px);overflow-y:auto}
.verify-mask .verify-card.is-busy .go-captcha{pointer-events:none}
.verify-mask .verify-card.is-dark .verify-error{color:#ffb4ab}
.verify-mask .verify-card.is-dark .verify-hint{color:#b8c9e0}
.verify-mask .go-captcha .gc-icon-block .gc-icon{padding:8px}
</style>
