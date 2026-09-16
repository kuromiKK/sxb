import { api, token, selectedExamId } from '@/services/api'
import { learningReady } from './learning-bootstrap'
let leavingDocument=false
// #ifdef H5
window.addEventListener('beforeunload',()=>{leavingDocument=true})
window.addEventListener('pagehide',()=>{leavingDocument=true})
window.addEventListener('pageshow',()=>{leavingDocument=false})
// #endif

/** One row per content visit. No scroll/click stream and no periodic idle heartbeat. */
export function createLearningVisit(){
 let active:any,closed=false
 const clear=(entry:any)=>{
  // #ifdef H5
  if(entry&&sessionStorage.getItem(entry.key)===entry.sessionId)sessionStorage.removeItem(entry.key)
  // #endif
 }
 async function begin(contentId:string){
  await learningReady
  if(!token()||closed)return
  const examId=selectedExamId(),key='sxb-learning-visit:'+examId+':'+contentId
  if(active?.key===key&&active.token===token()){if(!active.id)await start(active);return}
  clear(active)
  let sessionId='visit-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)+Math.random().toString(36).slice(2)
  // A hard refresh keeps the active visit; normal navigation clears it on unload.
  // #ifdef H5
  sessionId=sessionStorage.getItem(key)||sessionId;sessionStorage.setItem(key,sessionId)
  // #endif
  const entry={key,sessionId,examId,contentId,token:token(),id:'',sequence:0,lastSent:0,position:null,duration:0,dirty:false,pending:null}
  active=entry;await start(entry)
 }
 async function start(entry:any){
  if(entry.pending)return entry.pending
  entry.pending=api('/learning-visits','POST',{examId:entry.examId,contentId:entry.contentId,sessionId:entry.sessionId})
   .then((result:any)=>{entry.id=result.id;entry.sequence=result.sequence||0})
   .catch(()=>{}).finally(()=>{entry.pending=null})
  return entry.pending
 }
 function progress(seconds:number,duration:number){
  if(!active||!Number.isFinite(seconds)||!Number.isFinite(duration)||duration<=0)return
  const position=Math.max(0,Math.min(Math.floor(seconds),Math.ceil(duration)))
  if(active.position===position)return
  active.position=position;active.duration=Math.ceil(duration);active.dirty=true
  if(Date.now()-active.lastSent>=45000)void flush()
 }
 async function flush(){
  const entry=active
  if(!entry?.id||!entry.dirty||entry.sending||entry.token!==token())return
  const position=entry.position;entry.sending=true;entry.lastSent=Date.now()
  try{
   const sequence=++entry.sequence
   const result:any=await api('/learning-visits/'+entry.id+'/progress','PUT',{positionSeconds:position,durationSeconds:entry.duration,sequence})
   if(result.sequence===sequence&&entry.position===position)entry.dirty=false
  }catch{/* Telemetry failure must not interrupt learning; retry only on later activity. */}
  finally{entry.sending=false}
 }
 function leave(){
  void flush()
  // Browser refresh/backgrounding is not a new navigation inside the learning app.
  // #ifdef H5
  if(leavingDocument||document.visibilityState==='hidden')return
  // #endif
  clear(active);active=undefined
 }
 function close(){leave();closed=true}
 return {begin,progress,flush,leave,close}
}
