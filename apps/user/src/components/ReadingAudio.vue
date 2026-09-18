<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
const props=withDefaults(defineProps<{src:string;title:string;label?:string;initialPosition?:number;presentation?:'default'|'course';poster?:string}>(),{label:'配套音频',initialPosition:0,presentation:'default',poster:''})
const emit=defineEmits<{progress:[position:number,duration:number];pause:[];error:[];ended:[]}>()
const playing=ref(false),waiting=ref(false),position=ref(0),duration=ref(0),seeking=ref(false)
const posterFailed=ref(false)
let audio:Pick<UniApp.InnerAudioContext,'duration'|'currentTime'|'play'|'pause'|'seek'|'destroy'>|undefined
let disposed=false
let resumed=false
const time=(seconds:number)=>{const n=Math.floor(seconds||0);return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0')}
function sync(){if(!audio)return;duration.value=Number.isFinite(audio.duration)?audio.duration:0;if(!resumed&&duration.value>0){resumed=true;if(props.initialPosition>0&&props.initialPosition<duration.value){audio.seek(props.initialPosition);position.value=props.initialPosition;return}}if(!seeking.value)position.value=audio.currentTime||0;emit('progress',audio.currentTime||0,duration.value)}
function toggle(){if(!audio)return;if(playing.value){audio.pause()}else{waiting.value=true;audio.play()}}
function seek(e:any){const value=Number(e.detail.value);audio?.seek(value);position.value=value;seeking.value=false}
const onPlay=()=>{playing.value=true;waiting.value=false}
const onPause=()=>{playing.value=false;waiting.value=false;emit('pause')}
const onError=()=>{if(disposed)return;playing.value=false;waiting.value=false;emit('error')}
onMounted(()=>{
 // H5's uni audio wrapper discards the play promise. Handle cancellation when
 // switching courses or leaving while playback is still starting.
 // #ifdef H5
 const element=new Audio();element.preload='metadata'
 element.onloadedmetadata=sync;element.oncanplay=sync;element.ontimeupdate=sync
 element.onplaying=onPlay;element.onpause=onPause;element.onended=()=>{sync();onPause();emit('ended')};element.onerror=onError
 audio={get duration(){return element.duration},get currentTime(){return element.currentTime},play:()=>{void element.play().catch(e=>{waiting.value=false;if(e.name!=='AbortError')onError()})},pause:()=>element.pause(),seek:value=>{element.currentTime=value},destroy:()=>{element.onloadedmetadata=null;element.oncanplay=null;element.ontimeupdate=null;element.onplaying=null;element.onpause=null;element.onended=null;element.onerror=null;element.removeAttribute('src');element.load()}}
 element.src=props.src
 // #endif
 // #ifndef H5
 const inner=uni.createInnerAudioContext();audio=inner;inner.autoplay=false;inner.onCanplay(sync);inner.onPlay(onPlay);inner.onPause(onPause);inner.onEnded(()=>{sync();onPause();emit('ended')});inner.onTimeUpdate(sync);inner.onError(onError);inner.src=props.src
 // #endif
})
onBeforeUnmount(()=>{disposed=true;audio?.pause();audio?.destroy();audio=undefined})
</script>
<template><view class="reading-audio" :class="{'audio-course':presentation==='course',playing}"><view class="audio-top"><view v-if="presentation==='course'" class="audio-art" aria-hidden="true"><image v-if="poster&&!posterFailed" :src="poster" mode="aspectFill" @error="posterFailed=true"/><view v-else class="audio-disc"><view/></view></view><button class="audio-toggle" role="button" tabindex="0" :aria-label="playing?'暂停音频':'播放音频'" :disabled="waiting" @tap="toggle"><image :src="playing?'/static/navigation/media-pause.svg':'/static/navigation/media-play.svg'" aria-hidden="true"/></button><view class="audio-copy"><text class="audio-eyebrow">{{waiting?'正在加载…':label}}</text><text v-if="presentation==='default'" class="audio-title">{{title}}</text><text v-else class="audio-state">{{playing?'正在播放':position>0?'继续收听':'点击播放'}}</text></view><view class="audio-wave" aria-hidden="true"><view/><view/><view/><view/><view/></view></view><slider class="audio-seek" :value="position" :max="Math.max(1,duration)" :disabled="duration<=0" :step="1" activeColor="#6b91cb" backgroundColor="#dce6f4" block-color="#fff" :block-size="16" aria-label="音频进度" @changing="seeking=true" @change="seek"/><view class="audio-times"><text>{{time(position)}}</text><text>{{time(duration)}}</text></view></view></template>
<style scoped>
.reading-audio{padding:18px 18px 14px;background:linear-gradient(125deg,#edf4fc,#e8eff9);border:1px solid #e1e9f5;border-radius:16px}.audio-top{display:flex;align-items:center;gap:13px}.audio-toggle{flex:none;display:grid;place-items:center;width:48px;height:48px;margin:0;padding:0;background:#466ea8;border-radius:50%;box-shadow:0 4px 12px #466ea820}.audio-toggle:after{border:0}.audio-toggle image{width:24px;height:24px}.audio-copy{flex:1;min-width:0}.audio-eyebrow{display:block;font-size:11px;color:#647fa3;margin-bottom:5px}.audio-title{display:block;color:#304d72;font-size:14px;line-height:1.6;font-weight:600;overflow-wrap:anywhere}.audio-wave{display:flex;align-items:center;gap:3px;height:30px;flex:none}.audio-wave>view{width:3px;height:12px;background:#9db7d9;border-radius:3px}.audio-wave>view:nth-child(2),.audio-wave>view:nth-child(4){height:23px}.audio-wave>view:nth-child(3){height:30px}.audio-seek{margin:20px 0 4px}.audio-times{display:flex;justify-content:space-between;color:#69809e;font-size:11px;font-variant-numeric:tabular-nums}.audio-toggle:focus-visible{outline:2px solid #3569e8;outline-offset:3px}.audio-toggle:active{opacity:.75}
</style>
<style scoped>
.audio-course{padding:0;border:0;border-radius:0;background:transparent}.audio-course .audio-top{gap:16px}.audio-art{flex:none;width:76px;height:76px;border-radius:16px;overflow:hidden;background:#dce7f5;display:grid;place-items:center;box-shadow:0 4px 12px #31567912}.audio-art>image{width:100%;height:100%}.audio-disc{display:grid;place-items:center;width:60px;height:60px;border-radius:50%;border:1px solid #8aa6c3;background:repeating-radial-gradient(circle,#3d6286 0 2px,#4c7398 3px 4px);box-shadow:0 3px 8px #294e7929}.audio-disc>view{width:19px;height:19px;border-radius:50%;background:#d9e7f5;border:5px solid #a5bfd8;box-sizing:border-box}.audio-course .audio-copy{order:1}.audio-course .audio-toggle{order:2;background:#416fba;width:46px;height:46px;box-shadow:none}.audio-course .audio-eyebrow{font-size:14px;font-weight:600;color:#304d72;margin-bottom:8px}.audio-state{display:block;font-size:12px;color:#586e84}.audio-course .audio-wave{display:none}.audio-course .audio-seek{margin-top:22px}.audio-course .audio-times{font-size:12px;color:#586e84}.audio-course.playing .audio-disc{animation:record-turn 18s linear infinite}@keyframes record-turn{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.audio-course.playing .audio-disc{animation:none}}
</style>
