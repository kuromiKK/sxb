<script setup lang="ts">
const props=withDefaults(defineProps<{disabled?:boolean;loading?:boolean}>(),{disabled:false,loading:false})
const emit=defineEmits<{tap:[event:Event];click:[event:Event]}>()
function activate(event:Event){
 if(props.disabled||props.loading)return
 // uni-app compiles @tap on a custom H5 component to onClick.
 // #ifdef H5
 emit('click',event)
 // #endif
 // #ifndef H5
 emit('tap',event)
 // #endif
}
</script>
<template><button role="button" :tabindex="disabled||loading?-1:0" :disabled="disabled||loading" :loading="loading" :aria-disabled="disabled||loading" @tap="activate" @keydown.enter.prevent="activate" @keydown.space.prevent="activate"><slot/></button></template>
