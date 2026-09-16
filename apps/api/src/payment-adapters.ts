import {randomBytes,sign,verify,createDecipheriv} from 'node:crypto'
import {AlipaySdk} from 'alipay-sdk'
import {fail} from './security.ts'
export function wxSign(message:string,key:string){return sign('RSA-SHA256',Buffer.from(message),key).toString('base64')}
export function verifyWechat(headers:Record<string,string>,body:string,c:any,s:any){
 const timestamp=headers['wechatpay-timestamp'],nonce=headers['wechatpay-nonce'],signature=headers['wechatpay-signature'],serial=headers['wechatpay-serial']
 if(!timestamp||!/^\d+$/.test(timestamp)||Math.abs(Date.now()/1000-Number(timestamp))>300||!nonce||!signature||serial!==c.platformSerial)fail(400,'微信支付签名参数无效')
 let ok=false;try{ok=verify('RSA-SHA256',Buffer.from(`${timestamp}\n${nonce}\n${body}\n`),s.platformKey,Buffer.from(signature,'base64'))}catch{}
 if(!ok)fail(400,'微信支付验签失败')
}
export function decryptWechat(resource:any,key:string){try{if(resource.algorithm!=='AEAD_AES_256_GCM')throw 0;const data=Buffer.from(resource.ciphertext,'base64'),cipher=createDecipheriv('aes-256-gcm',Buffer.from(key),Buffer.from(resource.nonce));cipher.setAuthTag(data.subarray(-16));cipher.setAAD(Buffer.from(resource.associated_data||''));return JSON.parse(Buffer.concat([cipher.update(data.subarray(0,-16)),cipher.final()]).toString())}catch{fail(400,'微信支付通知解密失败')}}
export async function wxRequest(path:string,c:any,s:any,body?:any,probeMissingOrder=false){
 const method=body?'POST':'GET',raw=body?JSON.stringify(body):'',time=String(Math.floor(Date.now()/1000)),nonce=randomBytes(16).toString('hex'),signature=wxSign(`${method}\n${path}\n${time}\n${nonce}\n${raw}\n`,s.privateKey)
 let r:Response;try{r=await fetch('https://api.mch.weixin.qq.com'+path,{method,headers:{Accept:'application/json','Content-Type':'application/json',Authorization:`WECHATPAY2-SHA256-RSA2048 mchid="${c.mchId}",nonce_str="${nonce}",timestamp="${time}",serial_no="${c.serialNo}",signature="${signature}"`},body:body?raw:undefined,signal:AbortSignal.timeout(10000),redirect:'error'})}catch{fail(502,'微信支付暂时无法连接，请稍后查询订单状态')}
 const text=await r!.text();verifyWechat(Object.fromEntries(r!.headers),text,c,s)
 if(probeMissingOrder&&!body&&r!.status===404&&JSON.parse(text).code==='ORDER_NOT_EXIST')return {code:'ORDER_NOT_EXIST'}
 if(!r!.ok){let code='UNKNOWN';try{const value=JSON.parse(text).code;if(typeof value==='string'&&/^[A-Z_]{1,80}$/.test(value))code=value}catch{};throw Object.assign(new Error('微信支付未受理请求，请核对商户配置或查询订单状态'),{status:502,code})}
 return text?JSON.parse(text):{}
}
export function alipayClient(c:any,s:any){return new AlipaySdk({appId:c.appId,privateKey:s.privateKey,keyType:c.keyType,signType:'RSA2',timeout:10000,gateway:c.environment==='sandbox'?'https://openapi-sandbox.dl.alipaydev.com/gateway.do':'https://openapi.alipay.com/gateway.do',...(c.keyMode==='certificate'?{appCertContent:s.appCert,alipayPublicCertContent:s.alipayCert,alipayRootCertContent:s.rootCert}:{alipayPublicKey:s.alipayPublicKey})})}
export function moneyToCents(value:string){if(!/^\d+(\.\d{1,2})?$/.test(value))fail(400,'支付金额格式无效');const [i,f='']=value.split('.');const cents=Number(i)*100+Number(f.padEnd(2,'0'));if(!Number.isSafeInteger(cents))fail(400,'支付金额无效');return cents}
