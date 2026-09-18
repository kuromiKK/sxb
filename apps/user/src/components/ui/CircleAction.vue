<script setup lang="ts">
import uniIcons from '@dcloudio/uni-ui/lib/uni-icons/uni-icons.vue'
const props=withDefaults(defineProps<{icon?:string;label?:string;tone?:'ink'|'light';active?:boolean;disabled?:boolean;compact?:boolean}>(),{icon:'left',label:'返回',tone:'ink',active:false,disabled:false,compact:false})
const emit=defineEmits<{tap:[];click:[]}>()
function activate(){
 if(props.disabled)return
 // H5 compiles the caller's @tap to onClick; native targets retain tap.
 // #ifdef H5
 emit('click')
 // #endif
 // #ifndef H5
 emit('tap')
 // #endif
}
</script>
<template><button class="circle-action" :class="['circle-'+tone,{active,compact}]" :aria-label="label" :aria-pressed="['heart','heart-filled','star','star-filled'].includes(icon)?active:undefined" :disabled="disabled" role="button" :tabindex="disabled?-1:0" @tap="activate" @keydown.enter.prevent="activate" @keydown.space.prevent="activate"><uni-icons :type="icon" :size="compact?10.5:icon==='left'?22:19" :color="active?(tone==='light'?'#efca80':'#ad7b35'):tone==='light'?'#fff':'#34465e'" aria-hidden="true"/></button></template>
<style scoped>
.circle-action{flex:none!important;display:flex!important;align-items:center!important;justify-content:center!important;width:44px!important;min-width:44px!important;height:44px!important;min-height:44px!important;margin:0!important;padding:0!important;border:0!important;border-radius:50%!important;background:transparent!important;box-shadow:none!important;line-height:1!important;cursor:pointer;pointer-events:auto;touch-action:manipulation;transition:opacity .16s}.circle-action:after{border:0!important}.circle-light{filter:drop-shadow(0 1px 2px #0005)}.circle-action:active{opacity:.7}.circle-action:focus-visible{outline:2px solid #3569e8;outline-offset:2px}.circle-action[disabled]{opacity:.48}.circle-light[disabled]{opacity:.7}@media(prefers-reduced-motion:reduce){.circle-action{transition:none}}
</style>
<style scoped>
.circle-action.compact{position:relative;border:0!important;background:transparent!important;backdrop-filter:none}
.circle-action.compact:before{content:'';position:absolute;box-sizing:border-box;width:22px;height:22px;left:11px;top:11px;border:1px solid rgba(255,255,255,.65);border-radius:50%;background:rgba(255,255,255,.52);backdrop-filter:blur(8px);pointer-events:none}
.circle-action.compact :deep(.uni-icons){position:relative;z-index:1}
.circle-action.compact.circle-light:before{background:rgba(255,255,255,.2);border-color:rgba(255,255,255,.18)}
.circle-action.compact.active:before{background:rgba(255,245,221,.72)}
</style>
