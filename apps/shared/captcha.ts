export const captchaVariantIds=['slide-default','drag-default','rotate-default','click-default-ch','click-dark-ch','click-default-en','click-dark-en','click-shape-default'] as const
export type CaptchaVariant=typeof captchaVariantIds[number]
export const captchaVariants=[
 {id:'slide-default',type:'slide',label:'滑动拼图',hint:'拖动滑块，将缺口补齐',title:'拖动滑块完成拼图'},
 {id:'drag-default',type:'drag',label:'拖拽拼图',hint:'直接拖动图片中的拼图块',title:'拖拽贴图完成拼图'},
 {id:'rotate-default',type:'rotate',label:'旋转拼图',hint:'拖动滑块，将图片转正',title:'拖动滑块旋转图片'},
 {id:'click-default-ch',type:'click',label:'中文点选',hint:'按提示顺序点击汉字',title:'请依次点击'},
 {id:'click-dark-ch',type:'click',label:'中文点选 · 深色提示',hint:'深色提示图，按顺序点击汉字',title:'请依次点击'},
 {id:'click-default-en',type:'click',label:'英文点选',hint:'按提示顺序点击字母',title:'请依次点击'},
 {id:'click-dark-en',type:'click',label:'英文点选 · 深色提示',hint:'深色提示图，按顺序点击字母',title:'请依次点击'},
 {id:'click-shape-default',type:'click',label:'图形点选',hint:'按提示顺序点击相同图形',title:'请依次点击'},
] as const
export const captchaVariant=(id:string)=>captchaVariants.find(v=>v.id===id)||captchaVariants[0]
export const captchaColors=[{label:'经典蓝',value:'#3569e8'},{label:'鸢尾紫',value:'#6949df'},{label:'翡翠绿',value:'#159b81'},{label:'琥珀橙',value:'#b86716'},{label:'玫瑰红',value:'#c43c67'},{label:'湖水青',value:'#087f9b'}]
// Keep readable text on custom accents, including very light user-chosen colors.
export function captchaTheme(color:string,appearance='light'){
 const channels=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4)
 const luminance=channels[0]*.2126+channels[1]*.7152+channels[2]*.0722,ink=luminance>.179?'#111827':'#ffffff',dark=appearance==='dark'
 return {textColor:dark?'#f1f5f9':'#26354b',bgColor:dark?'#182334':'#ffffff',borderColor:dark?'#465568':'#dce5ef',iconColor:dark?'#dbe6f5':'#42546d',bodyBgColor:dark?'#0c1523':'#edf2f7',dragBarColor:dark?'#44536a':'#e0e5ed',roundColor:dark?'#44536a':'#e0e5ed',dragBgColor:color,dragIconColor:ink,loadingIconColor:color,btnColor:ink,btnBgColor:color,btnBorderColor:color,btnDisabledColor:dark?'#536177':'#91a3bc',activeColor:color,dotColor:ink,dotBgColor:color,dotBorderColor:dark?'#182334':'#ffffff'}
}
export function captchaCssVariables(color:string,appearance='light',variant='slide-default'){
 return {'--sxb-captcha-hint-bg':variant.includes('-dark-')?'#182334':'#ffffff',...Object.fromEntries(Object.entries(captchaTheme(color,appearance)).map(([key,value])=>['--go-captcha-theme-'+key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase()),value]))}
}
export type CaptchaAnswer={x:number;y:number}|{angle:number}|{points:{x:number;y:number}[]}
export function captchaAnswer(type:string,value:any,scale=1):CaptchaAnswer{
 if(type==='rotate')return {angle:Math.round(value)}
 if(type==='click')return {points:(value as {x:number;y:number}[]).map(p=>({x:Math.round(p.x/scale),y:Math.round(p.y/scale)}))}
 return {x:Math.round(value.x/scale),y:Math.round(value.y/scale)}
}
