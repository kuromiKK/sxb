import {api} from '@/services/api'

/** The server rechecks the current sale window before both confirmation and payment. */
export async function payConfiguredOrder(orderId:string,outcome:'success'|'failure'='success'){
  const options=await api('/payments/options')
  if(!options.test){uni.navigateTo({url:'/pages/payment/index?orderId='+encodeURIComponent(orderId)});return null}
  const checkout=await api(`/orders/${orderId}/checkout`,'POST',{})
  if(checkout.paid)return {alreadyPaid:true}
  const expiry=new Date(checkout.expiresAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})
  const details=checkout.shortened?`${checkout.notice}\n\n实际可用：${Math.floor(checkout.availableHours*100)/100} 小时\n权益结束：${expiry}`:`权益有效至：${expiry}`
  const confirmed=await new Promise<boolean>(resolve=>uni.showModal({title:checkout.shortened?'体验时间提醒':'确认订单支付',content:`${checkout.title}\n支付金额：¥${(checkout.amountCents/100).toFixed(2)}\n${details}\n\n当前为测试支付，不会实际扣款。`,confirmText:'确认支付',cancelText:'暂不支付',success:r=>resolve(r.confirm),fail:()=>resolve(false)}))
  if(!confirmed)return null
  return api(`/orders/${orderId}/test-payment`,'POST',{outcome,...(checkout.confirmationToken?{confirmationToken:checkout.confirmationToken}:{})})
}
