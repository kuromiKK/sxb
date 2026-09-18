<script setup lang="ts">
import CircleAction from '@/components/ui/CircleAction.vue'
import {ref} from 'vue'
import {onLoad} from '@dcloudio/uni-app'
import {api,refreshRights} from '@/services/api'
import {refreshOrders} from '@/utils/orders'
import {backOrFallback} from '@/utils/navigation'
const orderId=ref(''),checkout=ref<any>(),channels=ref<{id:string;name:string}[]>([]),selected=ref(''),busy=ref(false),error=ref(''),qr=ref(''),launched=ref(false),paid=ref(false)
onLoad(async(options)=>{orderId.value=String(options?.orderId||'');try{const o=await api('/payments/options');let ids:string[]=[]
 // #ifdef MP-WEIXIN
 ids=o.wechat.includes('mini')?['mini']:[]
 // #endif
 // #ifdef H5
 const wx=/MicroMessenger/i.test(navigator.userAgent),mobile=/Android|iPhone|iPad/i.test(navigator.userAgent);ids=[...o.wechat.filter((x:string)=>x===(wx?'jsapi':mobile?'h5':'native')),...(wx?[]:o.alipay.filter((x:string)=>x===(mobile?'wap':'page')))];
 // #endif
 const names:Record<string,string>={mini:'微信支付',jsapi:'微信支付',h5:'微信支付',native:'微信扫码支付',page:'支付宝支付',wap:'支付宝支付'};channels.value=ids.map(id=>({id,name:names[id]}));selected.value=ids[0]||'';const status=await api('/orders/'+orderId.value+'/payment-status','POST',{});if(status.status==='paid'){paid.value=true;await refreshRights();await refreshOrders();return}if(status.status==='refunding'){error.value='已收到款项，订单需要人工处理，请联系客服。';return}checkout.value=await api('/orders/'+orderId.value+'/checkout','POST',{});paid.value=checkout.value.paid;if(!paid.value&&!ids.length)error.value='当前设备没有可用的支付方式，请联系客服。'}catch(e:any){error.value=e.message}})
async function check(){busy.value=true;error.value='';try{const r=await api('/orders/'+orderId.value+'/payment-status','POST',{});if(r.status==='paid'){paid.value=true;await refreshRights();await refreshOrders()}else error.value=r.status==='refunding'?'已收到款项，订单需要人工处理，请联系客服。':'尚未确认付款成功，请稍后再查询。'}catch(e:any){error.value=e.message}finally{busy.value=false}}
async function pay(){if(busy.value||!selected.value)return;busy.value=true;error.value='';try{const c=await api('/orders/'+orderId.value+'/checkout','POST',{});checkout.value=c;if(c.paid){paid.value=true;return}if(c.shortened){const accepted=await new Promise<boolean>(resolve=>uni.showModal({title:'体验时间提醒',content:c.notice,success:r=>resolve(r.confirm),fail:()=>resolve(false)}));if(!accepted)return}const r=await api('/orders/'+orderId.value+'/payment','POST',{channel:selected.value,...(c.confirmationToken?{confirmationToken:c.confirmationToken}:{})});if(r.paid){paid.value=true;return}launched.value=true
 if(r.kind==='qr'){qr.value=r.qr;return}
 // #ifdef MP-WEIXIN
 if(r.kind==='mini')await new Promise<void>((resolve,reject)=>uni.requestPayment({...r.params,provider:'wxpay',success:()=>resolve(),fail:reject}));
 // #endif
 // #ifdef H5
 if(r.kind==='redirect'){location.assign(r.url);return}
 if(r.kind==='jsapi'){const bridge=(window as any).WeixinJSBridge;if(!bridge)throw new Error('微信支付组件未就绪，请在微信内重新打开');await new Promise<void>((resolve,reject)=>bridge.invoke('getBrandWCPayRequest',r.params,(x:any)=>x.err_msg==='get_brand_wcpay_request:ok'?resolve():reject(new Error('支付未完成，可稍后查询订单'))))}
 // #endif
 await check()
 }catch(e:any){error.value=e.message||'支付未完成，请查询订单后再试'}finally{busy.value=false}}
function back(){backOrFallback('/pages/profile-center/index?mode=orders')}
</script>
<template><view class="pay-page"><CircleAction class="back" @tap="back"/><view class="pay-card"><text class="eyebrow">订单支付</text><text class="title">{{paid?'支付成功':checkout?.title||'确认订单'}}</text><text v-if="checkout?.amountCents!==undefined" class="amount">¥{{(checkout.amountCents/100).toFixed(2)}}</text><text v-if="paid" class="hint">权益已按当前考试生效。</text><template v-else><view class="methods"><button v-for="c in channels" :key="c.id" :class="{active:selected===c.id}" :disabled="busy||launched" @tap="selected=c.id">{{c.name}}</button></view><image v-if="qr" class="qr" :src="qr" mode="aspectFit"/><text v-if="qr" class="hint">请使用微信扫描二维码付款</text><button v-else class="primary" :disabled="busy||!selected" :loading="busy" @tap="pay">{{launched?'继续支付':'确认支付'}}</button><button v-if="launched" class="check" :disabled="busy" @tap="check">我已支付，查询结果</button></template><text v-if="error" class="error" role="alert">{{error}}</text><text class="hint">支付结果以订单确认为准，请勿重复付款。</text></view></view></template>
<style scoped>.pay-page{max-width:480px;margin:auto;padding:30px 20px;min-height:100vh;background:#f5f7fc;box-sizing:border-box}.back{margin:0 0 28px;padding:0;text-align:left;background:transparent;color:#526580;font-size:14px}.back:after{border:0}.pay-card{padding:32px 24px;background:white;border:1px solid #e6ebf3;border-radius:20px;box-shadow:0 12px 40px #1d3a6910}.eyebrow,.title,.amount,.hint,.error{display:block}.eyebrow{color:#8b99ac;font-size:12px;letter-spacing:2px}.title{font-size:21px;font-weight:700;color:#20324f;margin-top:12px}.amount{font-size:36px;font-weight:700;margin:24px 0;color:#20324f}.methods{display:flex;gap:10px;margin:24px 0}.methods button{flex:1;font-size:14px;background:#f6f8fc;color:#54637a}.methods button.active{color:#3569e8;background:#edf3ff}.primary{background:#3569e8;color:white;border-radius:10px;font-size:16px}.check{background:#edf3ff;color:#3569e8;margin-top:18px;font-size:14px}.hint{font-size:12px;line-height:1.8;color:#7b889a;text-align:center;margin-top:20px}.error{font-size:14px;color:#b24343;line-height:1.8;margin-top:20px}.qr{display:block;width:240px;height:240px;max-width:100%;margin:auto}</style>
