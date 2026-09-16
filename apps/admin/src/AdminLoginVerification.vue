<script setup lang="ts">
import {computed,onUnmounted,ref} from 'vue'
import {Click,Slide,SlideRegion,Rotate} from 'go-captcha-vue'
import 'go-captcha-vue/dist/style.css'
import {send} from './api'
import {captchaAnswer,captchaCssVariables} from '../../shared/captcha'
const visible=ref(false),puzzle=ref<any>(),busy=ref(false),error=ref('')
const components={slide:Slide,drag:SlideRegion,rotate:Rotate,click:Click}
const component=computed(()=>components[puzzle.value?.type as keyof typeof components]||Slide)
let generation=0,target='',resolve:((proof:string)=>void)|undefined,reject:((error:Error)=>void)|undefined
function cancel(){generation++;visible.value=false;busy.value=false;puzzle.value=undefined;reject?.(new Error('已取消验证'));resolve=undefined;reject=undefined}
function finish(proof:string){generation++;visible.value=false;busy.value=false;puzzle.value=undefined;resolve?.(proof);resolve=undefined;reject=undefined}
async function refresh(clearError=true){
 const current=++generation;busy.value=true;puzzle.value=undefined;if(clearError)error.value=''
 try{const result=await send('/verification/challenge',{scope:'admin-login',target});if(current===generation)puzzle.value=result}
 catch(e:any){if(current===generation)error.value=e.message}
 finally{if(current===generation)busy.value=false}
}
function verify(phone:string):Promise<string>{cancel();target=phone;visible.value=true;error.value='';const promise=new Promise<string>((ok,no)=>{resolve=ok;reject=no});void refresh();return promise}
function confirm(value:any){
 if(busy.value||!puzzle.value)return false
 const answer=captchaAnswer(puzzle.value.type,value)
 if('points' in answer&&!answer.points.length){error.value='请先按提示顺序点选图片';return false}
 const current=generation;busy.value=true;error.value=''
 void send('/verification/check',{scope:'admin-login',target,challengeId:puzzle.value.challengeId,answer}).then(result=>{if(current===generation)finish(result.proof)}).catch(async(e:any)=>{if(current===generation){error.value=e.message;await refresh(false)}}).finally(()=>{if(current===generation)busy.value=false})
 return true
}
onUnmounted(cancel)
defineExpose({verify,cancel})
</script>
<template>
 <el-dialog v-model="visible" title="登录安全验证" width="min(400px, calc(100vw - 24px))" class="admin-login-verification" align-center :close-on-click-modal="false" destroy-on-close @close="cancel">
  <p class="verification-help">完成验证后，将自动登录管理后台。</p>
  <div class="verification-widget" :class="{'is-busy':busy,'is-dark':puzzle?.appearance==='dark'}" :style="captchaCssVariables(puzzle?.color||'#3569e8',puzzle?.appearance,puzzle?.variant)" v-loading="busy" :aria-busy="busy">
   <component :is="component" v-if="puzzle" :key="puzzle.challengeId" :data="puzzle.data" :config="{width:puzzle.width,height:puzzle.height,size:puzzle.size,thumbWidth:puzzle.data.thumbWidth,thumbHeight:puzzle.data.thumbHeight,title:puzzle.title,buttonText:'确认',horizontalPadding:12}" :events="{confirm,refresh:()=>refresh(),close:cancel}"/>
   <span v-else-if="busy" class="verification-loading">正在加载验证码…</span>
  </div>
  <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon/>
  <el-button v-if="!puzzle&&!busy" class="verification-retry" @click="refresh()">重新加载验证码</el-button>
  <template #footer><el-button @click="cancel">取消登录</el-button></template>
 </el-dialog>
</template>
<style scoped>
.verification-help{margin:0 0 16px;color:var(--el-text-color-regular);font-size:13px;line-height:1.7}.verification-widget{display:flex;justify-content:center;min-height:200px;border-radius:10px;overflow-x:auto;margin-bottom:16px}.verification-widget.is-dark{background:#182334}.verification-widget.is-busy :deep(.go-captcha){pointer-events:none}.verification-loading{align-self:center;font-size:13px;color:var(--el-text-color-regular)}.verification-retry{margin-top:12px;width:100%}.verification-widget :deep(.gc-header){height:auto;min-height:40px;line-height:1.5;gap:6px}.verification-widget :deep(.gc-header>img){background:var(--sxb-captcha-hint-bg);flex-shrink:0;border-radius:4px}
</style>
