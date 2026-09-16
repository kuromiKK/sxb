import {computed,onMounted,onUnmounted,ref,type CSSProperties} from 'vue'
import {graphDefaults,type GraphSettings} from '../../../shared/workspace-tools'
import {request} from '../api'

const saved=ref<GraphSettings>(structuredClone(graphDefaults))
export function useGraphSettings(override:()=>GraphSettings|undefined=()=>undefined){
 const config=computed(()=>override()||saved.value)
 async function load(){if(override())return;try{saved.value=(await request('/admin/integrations/g6')).config}catch{/* Keep the existing graph available if settings cannot load. */}}
 function changed(e:Event){saved.value=(e as CustomEvent).detail}
 onMounted(()=>{void load();window.addEventListener('sxb-graph-settings',changed)})
 onUnmounted(()=>window.removeEventListener('sxb-graph-settings',changed))
 const style=computed(()=>({
  '--graph-background':config.value.background,'--graph-grid':config.value.grid?'radial-gradient(#9aa8bd55 .8px, transparent .8px)':'none',
  '--graph-radius':config.value.radius+'px','--graph-font':config.value.fontSize+'px','--graph-height':config.value.canvasHeight+'px',
  '--graph-shadow':config.value.shadow?'0 6px 18px #23365f15':'none','--graph-root':config.value.colors.exam,
 } as CSSProperties))
 return {config,style}
}
