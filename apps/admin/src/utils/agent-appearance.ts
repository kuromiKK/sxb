import {computed,onMounted,onUnmounted,ref,type CSSProperties} from 'vue'
import {agentAppearanceSchema,type AgentAppearance} from '../../../shared/workspace-tools'

const rgb=(hex:string)=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16))
const mix=(a:string,b:string,ratio:number)=>'#'+rgb(a).map((v,i)=>Math.round(v*(1-ratio)+rgb(b)[i]*ratio).toString(16).padStart(2,'0')).join('')
function luminance(hex:string){return rgb(hex).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0)}
const contrast=(a:string,b:string)=>(Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05)
function readable(color:string,background:string,ink:string){for(let i=0;i<=20;i++){const candidate=mix(color,ink,i/20);if(contrast(candidate,background)>=4.5)return candidate}return ink}

export function useAgentAppearance(source:()=>AgentAppearance|undefined){
 const media=window.matchMedia('(prefers-color-scheme: dark)'),systemDark=ref(media.matches)
 const update=()=>systemDark.value=media.matches
 onMounted(()=>media.addEventListener('change',update))
 onUnmounted(()=>media.removeEventListener('change',update))
 const mode=computed(()=>{const a=source();return a?.theme==='auto'||!a?.theme?(systemDark.value?'dark':'light'):a.theme})
 const style=computed(()=>{
  const parsed=agentAppearanceSchema.safeParse(source()||{}),a=parsed.success?parsed.data:agentAppearanceSchema.parse({})
  const background=mode.value==='dark'?a.backgroundDark:a.backgroundLight
  const ink=contrast('#ffffff',background)>contrast('#111827',background)?'#ffffff':'#111827'
  const primary=a.primaryColor,surface=mix(background,ink,.055),muted=mix(background,ink,.68),border=mix(background,ink,.2)
  const styles:Record<string,string>={
   'color-scheme':mode.value,'--el-bg-color':background,'--el-bg-color-overlay':background,'--el-fill-color-blank':background,
   '--el-fill-color-light':surface,'--el-fill-color':surface,'--el-fill-color-lighter':surface,'--el-fill-color-dark':mix(background,ink,.12),
   '--el-text-color-primary':ink,'--el-text-color-regular':muted,'--el-text-color-secondary':muted,'--el-text-color-placeholder':muted,'--muted':muted,
   '--el-border-color':border,'--el-border-color-light':border,'--el-border-color-lighter':border,'--admin-border':border,
   '--el-color-primary':primary,'--el-color-primary-dark-2':mix(primary,ink,.16),
   '--agent-accent-text':readable(primary,background,ink),'--agent-button-text':contrast('#ffffff',primary)>contrast('#111827',primary)?'#ffffff':'#111827',
   '--el-disabled-bg-color':surface,'--el-disabled-text-color':muted,'--el-disabled-border-color':border,
   '--el-color-info-light-9':surface,'--el-color-info-light-8':border,'--el-color-info':muted,
  }
  for(const n of [3,5,7,8,9])styles['--el-color-primary-light-'+n]=mix(primary,background,n/10)
  return styles as CSSProperties
 })
 return {mode,style}
}
