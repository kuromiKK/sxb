export type ProviderKey='wechat'|'payment'|'alipay'
export type ProviderField={key:string;label:string;hint?:string;secret?:boolean;multiline?:boolean;options?:{value:string;label:string}[];toggle?:boolean;when?:[string,unknown]}
export const providerDefinitions:Record<ProviderKey,{title:string;description:string;docs:string;defaults:Record<string,any>;fields:ProviderField[]}>= {
 wechat:{title:'微信登录',description:'网站扫码、微信内网页和小程序分别配置，首次使用微信登录后绑定已验证的手机号。',docs:'https://developers.weixin.qq.com/doc/oplatform/Website_App/WeChat_Login/Wechat_Login.html',defaults:{enabled:false,webEnabled:false,webAppId:'',officialEnabled:false,officialAppId:'',miniEnabled:false,miniAppId:'',callbackUrl:'',returnUrl:''},fields:[
 {key:'webEnabled',label:'网站扫码登录',toggle:true},{key:'webAppId',label:'网站应用 AppID',hint:'来自微信开放平台的网站应用。',when:['webEnabled',true]}, {key:'webSecret',label:'网站应用 AppSecret',secret:true,when:['webEnabled',true]},
 {key:'officialEnabled',label:'微信内网页授权',toggle:true},{key:'officialAppId',label:'公众号 AppID',hint:'用于微信内置浏览器的网页授权。',when:['officialEnabled',true]},{key:'officialSecret',label:'公众号 AppSecret',secret:true,when:['officialEnabled',true]},
 {key:'miniEnabled',label:'微信小程序登录',toggle:true},{key:'miniAppId',label:'小程序 AppID',hint:'小程序构建时的 AppID 也需要与此一致。',when:['miniEnabled',true]},{key:'miniSecret',label:'小程序 AppSecret',secret:true,when:['miniEnabled',true]},
 {key:'callbackUrl',label:'网页登录回调地址',hint:'公网 HTTPS API 域名 + /api/auth/wechat/callback；同时配置微信平台的授权回调域名。'},
 {key:'returnUrl',label:'登录完成返回地址',hint:'学生端完整登录页，例如 https://学习域名/#/pages/login/index。'}]},
 payment:{title:'微信支付',description:'直连商户 API v3，支持 Native 扫码、H5、JSAPI 和小程序支付。',docs:'https://pay.weixin.qq.com/doc/v3/merchant/4012791856',defaults:{enabled:false,mchId:'',appId:'',miniAppId:'',nativeEnabled:true,h5Enabled:false,jsapiEnabled:false,miniEnabled:false,serialNo:'',verifyMode:'publicKey',platformSerial:'',notifyUrl:'',h5Name:'',h5Url:''},fields:[
 {key:'mchId',label:'商户号 MchID'}, {key:'appId',label:'支付 AppID',hint:'与商户号绑定的公众号或应用 AppID；JSAPI 须与公众号登录 AppID 一致。'},
 {key:'nativeEnabled',label:'电脑扫码支付（Native）',toggle:true},{key:'h5Enabled',label:'手机浏览器支付（H5）',toggle:true},{key:'jsapiEnabled',label:'微信内支付（JSAPI）',toggle:true},{key:'miniEnabled',label:'小程序支付',toggle:true},{key:'miniAppId',label:'支付小程序 AppID',when:['miniEnabled',true],hint:'须与小程序登录 AppID 一致，并与商户号绑定。'},
 {key:'serialNo',label:'商户 API 证书序列号',hint:'商户 API 证书的 serial_no，不是商户号。'}, {key:'privateKey',label:'商户 API 私钥',secret:true,multiline:true,hint:'粘贴 apiclient_key.pem 的完整 PEM 内容。'}, {key:'apiV3Key',label:'API v3 密钥',secret:true,hint:'32 位字符，用于支付通知解密。'},
 {key:'verifyMode',label:'微信支付验签方式',options:[{value:'publicKey',label:'微信支付公钥'},{value:'certificate',label:'微信支付平台证书'}]},
 {key:'platformSerial',label:'微信支付公钥 ID / 平台证书序列号',hint:'公钥模式为 PUB_KEY_ID_…；证书模式填写平台证书序列号。'}, {key:'platformKey',label:'微信支付公钥 / 平台证书 PEM',secret:true,multiline:true,hint:'公钥模式粘贴 pub_key.pem；证书模式粘贴微信支付平台证书。证书到期或轮换后请更新。'},
 {key:'notifyUrl',label:'支付结果通知地址',hint:'公网 HTTPS API 域名 + /api/payments/wechat/notify。'}, {key:'h5Name',label:'H5 网站名称',when:['h5Enabled',true]}, {key:'h5Url',label:'H5 网站地址',when:['h5Enabled',true],hint:'已在商户平台配置的 HTTPS 支付网站。'}]},
 alipay:{title:'支付宝支付',description:'电脑网站支付与手机网站支付，使用支付宝官方 SDK 和 RSA2 签名验签。',docs:'https://github.com/alipay/alipay-sdk-nodejs-all',defaults:{enabled:false,appId:'',sellerId:'',environment:'production',keyMode:'publicKey',keyType:'PKCS8',pageEnabled:true,wapEnabled:true,notifyUrl:'',returnUrl:''},fields:[
 {key:'appId',label:'支付宝应用 AppID'},{key:'sellerId',label:'支付宝收款账号 PID',hint:'2088 开头的支付宝用户 ID，用于核对通知的收款方。'}, {key:'environment',label:'接口环境',options:[{value:'production',label:'正式环境'},{value:'sandbox',label:'支付宝沙箱'}]},
 {key:'pageEnabled',label:'电脑网站支付',toggle:true},{key:'wapEnabled',label:'手机网站支付',toggle:true},
 {key:'keyMode',label:'加签方式',options:[{value:'publicKey',label:'普通公钥模式'},{value:'certificate',label:'公钥证书模式'}]}, {key:'keyType',label:'应用私钥格式',options:[{value:'PKCS8',label:'PKCS8'},{value:'PKCS1',label:'PKCS1'}]},
 {key:'privateKey',label:'应用私钥',secret:true,multiline:true,hint:'粘贴完整 PEM；应用公钥需上传至支付宝开放平台。'}, {key:'alipayPublicKey',label:'支付宝公钥',secret:true,multiline:true,when:['keyMode','publicKey'],hint:'这是支付宝公钥，不是应用公钥。'},
 {key:'appCert',label:'应用公钥证书',secret:true,multiline:true,when:['keyMode','certificate']},{key:'alipayCert',label:'支付宝公钥证书',secret:true,multiline:true,when:['keyMode','certificate']},{key:'rootCert',label:'支付宝根证书',secret:true,multiline:true,when:['keyMode','certificate']},
 {key:'notifyUrl',label:'支付结果通知地址',hint:'公网 HTTPS API 域名 + /api/payments/alipay/notify。'}, {key:'returnUrl',label:'支付完成返回地址',hint:'填写 https://学习域名/#/pages/payment/index；系统附加订单号，返回后查询支付结果。'}]}
}
