import {reactive} from 'vue'
export type PublishedProtocol={kind:'agreement'|'privacy';title:string;version:number;html:string;publishedAt:string}
export const siteSettings=reactive({basic:{name:'上行宝',logo:'',favicon:'',siteDomain:''},customer:{name:'平台客服',qrCode:'',contact:'',hours:'',description:''},search:{enabled:true,placeholder:'搜索知识点、精品课、常见问题',types:['knowledge','course','faq']},about:{html:'',operator:'',copyright:'',filing:''},protocols:[] as PublishedProtocol[],ready:false,error:''})
let pending:Promise<void>|undefined
export function refreshSiteSettings(){
 if(pending)return pending
 pending=new Promise<void>((resolve,reject)=>uni.request({url:`${import.meta.env.VITE_API_BASE||'/api'}/site-settings`,success:r=>{
  if(r.statusCode!==200){reject(new Error('平台配置加载失败，请稍后重试'));return}
  const data=r.data as any;Object.assign(siteSettings,data,{ready:true,error:''})
  // #ifdef H5
  document.title=data.basic.name
  let icon=document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if(data.basic.favicon){if(!icon){icon=document.createElement('link');icon.rel='icon';document.head.appendChild(icon)}icon.href=data.basic.favicon}else if(icon)icon.remove()
  // #endif
  resolve()
 },fail:()=>reject(new Error('平台配置加载失败，请检查网络'))})).catch(e=>{siteSettings.error=e.message;throw e}).finally(()=>{pending=undefined})
 return pending
}
