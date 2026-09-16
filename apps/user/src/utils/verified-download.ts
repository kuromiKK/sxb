import {api} from '@/services/api'
export async function verifiedDownload(gate:{verify:(scope:'handout',target:string)=>Promise<string>},path:string){
 const parts=path.split('/'),kind=parts[1],id=decodeURIComponent(parts[2]||'')
 const target=(kind==='study-handouts'||kind==='media'?'media:':kind==='courses'?'course:':'handout:')+id
 const proof=await gate.verify('handout',target)
 return api(path,kind==='media'?'POST':'GET',kind==='media'?{}:undefined,proof?{'X-Captcha-Proof':proof}:{})
}
export function openDownload(url:string){
 // #ifdef H5
 const link=document.createElement('a');link.href=url;link.target='_blank';link.rel='noreferrer';link.click()
 // #endif
 // #ifndef H5
 if(url.startsWith('/api/'))url=String(import.meta.env.VITE_API_BASE||'/api').replace(/\/$/,'')+url.slice(4)
 if(!/^https:\/\//.test(url)){uni.showToast({title:'下载服务尚未配置HTTPS地址',icon:'none'});return}
 uni.downloadFile({url,success:r=>{if(r.statusCode===200)uni.openDocument({filePath:r.tempFilePath,showMenu:true,fail:()=>uni.showToast({title:'无法预览该文件，请稍后再试',icon:'none'})});else uni.showToast({title:'下载失败',icon:'none'})},fail:()=>uni.showToast({title:'下载失败',icon:'none'})})
 // #endif
}
