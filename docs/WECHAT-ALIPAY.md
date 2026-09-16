# 微信登录、微信支付与支付宝接口

实现与文档核对：2026-09-16。入口：系统管理 → 系统设置 → 接口配置。默认未启用，无真实凭据不会发起实际登录或支付。

## 官方依据

- [微信网站扫码登录](https://developers.weixin.qq.com/doc/oplatform/Website_App/WeChat_Login/Wechat_Login.html)：qrconnect、snsapi_login、state、服务端 code 换取 OpenID。
- [公众号网页授权](https://developers.weixin.qq.com/doc/offiaccount/OA_Web_Apps/Wechat_webpage_authorization.html)：微信内浏览器 snsapi_base 授权。
- [小程序 code2Session](https://developers.weixin.qq.com/miniprogram/dev/OpenApiDoc/user-login/code2Session.html)：服务端 jscode2session，session_key 不返回客户端。
- [微信支付 JSAPI/小程序下单](https://pay.weixin.qq.com/doc/v3/merchant/4012791856)：AppID/MchID 绑定、32 字符商户单号、金额单位分、通知地址及支付截止时间。
- [微信支付官方 API v3 SDK 规范与示例](https://github.com/wechatpay-apiv3/wechatpay-go)：请求签名、响应验签、平台公钥/证书、通知验签与 AES-256-GCM 解密。
- [支付宝官方 Node SDK](https://github.com/alipay/alipay-sdk-nodejs-all)：公钥及证书模式、RSA2、pageExecute、checkNotifySignV2 和签名验证。
- [支付宝电脑网站支付](https://opendocs.alipay.com/open/028r8t?scene=22)：alipay.trade.page.pay。手机网站使用 alipay.trade.wap.pay。

## 需要申请并填写的内容

微信登录分别配置网站应用、公众号、小程序 AppID / AppSecret，不混用。网页方式填写 API 授权回调 HTTPS 地址和学生端登录页返回地址；微信平台也必须配置相应域名。小程序 AppID 还需写入构建配置，这是微信开发者工具的要求，不能只靠运行时后台配置改变安装包身份。

微信支付填写商户号、与商户绑定的支付 AppID、小程序支付 AppID（启用时）、商户 API 证书序列号、商户 API 私钥、32 位 API v3 密钥，以及微信支付公钥 ID/公钥或平台证书序列号/证书。开启 H5 需填网站名称与地址。各渠道必须在微信商户平台开通。

支付宝填写 AppID、收款账号 PID、应用私钥及格式。普通公钥模式填支付宝公钥；证书模式填应用公钥证书、支付宝公钥证书、支付宝根证书。支持正式/沙箱环境及电脑/手机网站支付。应用公钥上传至支付宝平台。

配置允许未启用时保存草稿；启用和“检查配置”验证必填项及密钥格式。检查是本地配置检查，不是平台联通证明，不创建真实交易。私钥/AppSecret 加密保存、不回显，空值保留，清除需明确选中相应字段。系统 SECRET_KEY 必须稳定保存备份，否则已有密文不可解。

## 回调与前端

- 微信登录：`https://API域名/api/auth/wechat/callback`
- 微信支付：`https://API域名/api/payments/wechat/notify`
- 支付宝：`https://API域名/api/payments/alipay/notify`
- 微信登录返回：`https://学生端域名/#/pages/login/index`
- 支付宝返回：`https://学生端域名/#/pages/payment/index`，自动追加订单号。

微信网页登录使用服务端 state 和浏览器随机 verifier 双重绑定。首次授权仅签发短期绑定票据，必须登录已验证手机号后绑定；已绑定用户登录仍检查停用状态与最新协议。不会根据昵称或用户提交的 OpenID 自动合并账号。

支付开始时保存当时的商户配置/加密凭据与商品快照，以便配置变更后处理旧单回调。真实支付不允许切换为模拟支付，关联第三方支付的订单不允许测试删除。通道成功回调和主动查单确认后才履约；回调验签、商户/AppID、金额/币种验证及幂等均在服务端执行。原始微信通知正文必须由 JSON parser verify 钩子保留，反向代理不得修改正文。

保留按考试、考期发放权益与体验时长限制。主动关闭后收到款项、付款晚于有效期或重复权益等异常记录到账并转人工处理，不调用自动退款 API。后台订单详情可查看服务商交易号及操作日志。异步通知不可达时，支付页“查询结果”会向服务商查单。

生产 H5 部署须正确配置受信任代理，使 Express `req.ip` 是用户 IP；不要盲目信任来自公网的 X-Forwarded-For。回调域名可公网访问且使用 HTTPS；小程序增加 API/download 合法域名。证书模式需要运维更新轮换证书，推荐微信支付公钥模式。

## 验证边界

接口配置各详情页提供“测试连接”，使用已保存版本，不修改配置或自动开启接口。未保存时禁止测试；测试中禁止重复提交，显示时间、耗时与分项结果。结果写入操作日志，不记录凭据或 access_token。配置版本在测试中变化时要求重试。

- 微信支付：签名查询随机不存在的商户单号，仅在响应验签通过并返回 `ORDER_NOT_EXIST` 时显示该测试通过，不创建支付，不证明通知解密/API v3 密钥或回调域名已经验证。
- 支付宝：使用官方 SDK 查随机不存在的交易号并验签，只接受 `ACQ.TRADE_NOT_EXIST` 这一预期结果，区分正式/沙箱。其他业务错误不视为成功。
- 微信公众号/小程序：调用 stable_token 且 `force_refresh=false` 验证 AppID/AppSecret；令牌不返回后台浏览器。网站应用没有等价的无需扫码凭据校验接口，测试仅检查扫码授权页面可达，明确显示“待真实扫码验证”，不会误报已完整接通。
- 阿里云：只查询已保存签名和模板的审核状态，不发送短信。RAM 需额外具有 `dysms:QuerySmsSign` / `dysms:QuerySmsTemplate` 权限；查询权限不足不代表 SendSms 一定不可用。测试/关闭模式显示未执行真实调用。
- GoCaptcha：实际生成当前验证码类型，检查服务响应；完整交互可在预览中验证。前端生成模式不伪装为服务器测试成功。

连接测试通过不等于短信送达、用户登录完整流程、各支付渠道业务权限或公网回调已经联调完成。

本地测试使用临时数据库、临时 RSA 密钥和伪造服务商响应验证加解密、验签、金额不符拒绝、回调幂等、OAuth state、绑定、配置加密与旧功能回归。未申请 AppID/商户权限前，不能完成真实微信授权、真实扣款、证书轮换、小程序真机和公网回调验收。

真实接入前还需要在服务商控制台完成域名与业务权限设置，并以沙箱/商户测试按各支付通道逐一验收。当前未实现自动对账任务和平台退款 API；第一期退款由工作人员处理并人工标记。
