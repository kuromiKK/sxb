<script setup lang="ts">
import {computed,ref,watch,onUnmounted} from 'vue'
import {Click,Slide,SlideRegion,Rotate} from 'go-captcha-vue'
import {RefreshCw} from 'lucide-vue-next'
import 'go-captcha-vue/dist/style.css'
import {send} from './api'
import {captchaAnswer,captchaCssVariables,captchaVariant} from '../../shared/captcha'
const props=defineProps<{config:any}>()
const puzzle=ref<any>(),busy=ref(false),error=ref(''),success=ref(false)
let generation=0
const components={slide:Slide,drag:SlideRegion,rotate:Rotate,click:Click}
const component=computed(()=>components[puzzle.value?.type as keyof typeof components]||Slide)
function reset(){generation++;puzzle.value=undefined;busy.value=false;error.value='';success.value=false}
watch(()=>props.config,reset,{deep:true});onUnmounted(reset)
async function refresh(){const current=++generation;busy.value=true;error.value='';success.value=false;puzzle.value=undefined;try{const next=await send('/admin/integrations/captcha/preview',props.config);if(current===generation)puzzle.value=next}catch(e:any){if(current===generation)error.value=e.message}finally{if(current===generation)busy.value=false}}
function confirm(value:any){if(busy.value||!puzzle.value)return false;const answer=captchaAnswer(puzzle.value.type,value);if('points' in answer&&!answer.points.length){error.value='请先按提示顺序点选图片';return false}const current=generation;busy.value=true;void send('/admin/integrations/captcha/check',{challengeId:puzzle.value.challengeId,answer}).then(()=>{if(current===generation){success.value=true;puzzle.value=undefined}}).catch((e:any)=>{if(current===generation){error.value=e.message;puzzle.value=undefined}}).finally(()=>{if(current===generation)busy.value=false});return true}
</script>
<template>
 <section class="captcha-preview-panel">
  <h3>验证预览</h3><p class="preview-help">{{captchaVariant(config.variant).label}} · {{config.appearance==='dark'?'深色':'浅色'}}面板<br/>按当前表单预览，保存后用户端生效。</p>
  <template v-if="config.mode==='gocaptcha'">
   <div class="captcha-preview" :class="{'is-dark':config.appearance==='dark'}" :style="captchaCssVariables(config.color||'#3569e8',config.appearance,config.variant)" v-loading="busy">
    <component :is="component" v-if="puzzle" :key="puzzle.challengeId" :data="puzzle.data" :config="{width:puzzle.width,height:puzzle.height,size:puzzle.size,thumbWidth:puzzle.data.thumbWidth,thumbHeight:puzzle.data.thumbHeight,title:puzzle.title,buttonText:'确认',horizontalPadding:12}" :events="{confirm,refresh,close:reset}"/>
    <el-result v-else-if="success" icon="success" title="验证通过" sub-title="预览结果不会用于真实业务"/>
    <el-empty v-else description="选择样式后，点击下方按钮体验" :image-size="60"/>
   </div>
   <el-alert v-if="error" :title="error" type="error" :closable="false"/>
   <el-button :loading="busy" @click="refresh"><RefreshCw :size="16"/>{{puzzle||success?'重新验证':'加载预览'}}</el-button>
  </template>
  <div v-else class="local-preview"><strong>8 6 2 4</strong><el-input placeholder="请输入上方验证码" disabled/><p class="preview-help">前端生成示意，不提供服务端防刷能力。</p></div>
 </section>
</template>
<style scoped>
.captcha-preview :deep(.gc-header>img){background:var(--sxb-captcha-hint-bg);border-radius:4px}
.captcha-preview-panel h3{font-size:16px;margin:0 0 12px}.preview-help{font-size:13px;line-height:1.8;color:var(--el-text-color-regular);margin:8px 0 20px}.captcha-preview{min-height:280px;margin:18px 0;display:flex;justify-content:center;border-radius:10px;overflow:hidden}.captcha-preview.is-dark{background:#182334}.captcha-preview :deep(.gc-header){min-height:40px;height:auto;line-height:1.5;gap:6px}.captcha-preview :deep(.gc-header span){overflow-wrap:anywhere}.captcha-preview :deep(.gc-header>img){flex-shrink:0}.is-dark :deep(.el-empty__description p),.is-dark :deep(.el-result__title p),.is-dark :deep(.el-result__subtitle p){color:#dbe6f5}.captcha-preview-panel>.el-button{width:100%;margin-top:16px}.local-preview>strong{display:block;padding:20px;background:var(--el-fill-color-light);border-radius:8px;text-align:center;letter-spacing:6px;font-size:26px;margin:20px 0}
</style>
