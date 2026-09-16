/** Keep persisted action codes stable; all user-facing history uses this catalogue. */
export const auditActions:Record<string,string>={
 'admin.login':'管理员登录','administrator.create':'新增管理员','administrator.update':'修改管理员','administrator.password_reset':'重设管理员密码','administrator.delete':'删除管理员',
 'ai.configure':'配置 AI 服务','ai.discover':'测试并读取模型','page-agent.model':'AI员工调用模型','page-agent.task':'AI员工执行任务',
 'article.save':'保存文章','article.status':'调整文章上下架','article.delete':'删除文章','cheatsheet.status':'调整小抄状态','cheatsheet.push':'推送考前小抄',
 'content.save':'保存教学内容','content.seed_test':'初始化测试教学内容','course.delete':'删除课程','course.status':'调整课程状态','knowledge.status':'调整知识节点状态','question.status':'调整题目状态',
 'entitlement.adjust':'人工调整权益','permissions.update':'修改会员权益','exam.category':'保存考试分类','exam.project':'保存考试项目','exam.settings':'修改考试设置','exam.date':'修改考期起止时间','exam.plan_config':'配置学习计划规则',
 'import.preview':'预览导入数据','import.commit':'确认导入数据','integration.configure':'配置第三方接口','integration.test':'测试接口连接',
 'media.upload':'上传资源','media.external':'添加资源外链','resource.cleanup':'清理未引用资源',
 'message.template.save':'保存消息模板','message.save':'保存消息','message.send':'发送消息','message.delete':'删除消息',
 'order.close':'关闭订单','order.refund_requested':'登记线下退款','order.manual_refund_confirmed':'确认线下退款','order.delete_test':'删除测试订单','order.provider_payment':'接收支付结果',
 'product.save':'保存商品','product.publish':'上架商品','product.offline':'下架商品','product.delete':'删除商品',
 'question-type.save':'保存题型','question-type.status':'调整题型状态','referral.create':'新增推荐码','referral.status':'调整推荐码状态',
 'settings.draft':'保存系统设置草稿','settings.publish':'发布系统设置','settings.environment':'切换运行环境','protocol.draft':'保存协议草稿','protocol.publish':'发布协议新版本',
 'user.developer':'设置开发者身份','user.status':'调整用户状态','user.enable':'启用用户','user.disable':'停用用户','user.inviter':'绑定推荐人'
}
export function auditActionLabel(action:string){
 if(/^product\.restore-v\d+$/.test(action))return '恢复商品历史版本（第'+action.split('-v')[1]+'版）'
 return auditActions[action]||'其他历史操作'
}
export const auditModules:Record<string,string>={admin:'管理员管理',administrator:'管理员管理',ai:'AI配置与数据','page-agent':'AI员工',article:'文章内容',cheatsheet:'考前小抄',content:'教学内容',course:'课程管理',knowledge:'知识图谱',question:'题目管理','question-type':'题型管理',entitlement:'人工权益',permissions:'会员权益',exam:'考试管理',import:'内容导入',integration:'接口配置',media:'资源管理',resource:'资源管理',message:'消息管理',order:'订单管理',product:'商品管理',referral:'推荐码',settings:'系统设置',protocol:'协议管理',user:'用户管理'}
export const auditModuleLabel=(action:string)=>auditModules[action.split('.')[0]]||'其他模块'
const targetLabels:Record<string,string>={basic:'基本设置',search:'搜索设置',customer:'客服设置',about:'关于平台',agreement:'用户服务协议',privacy:'隐私政策',captcha:'验证码',sms:'短信',wechat:'微信登录',payment:'微信支付',alipay:'支付宝支付',g6:'知识图谱样式','page-agent':'AI员工',chat:'知识点答疑',review:'AI复习资料',wrong:'错题分析',report:'学习报告解读',grading:'主观题判分',plan:'学习计划建议',questionReview:'题目解析审核',questionGenerate:'题目生成',graph:'知识图谱整理',summary:'讲义与课程摘要'}
export const auditTargetLabel=(action:string,target:string)=>/^(ai|page-agent|settings|protocol|integration)\./.test(action)?targetLabels[target]||target||'—':target||'—'
const detailLabels:Record<string,string>={before:'变更前',after:'变更后',previous:'原人工权益',manual:'人工设置',action:'处理方式',reason:'原因',title:'标题',name:'名称',nickname:'姓名',phone:'手机号',role:'角色',enabled:'是否启用',status:'状态',examId:'考试标识',examName:'考试名称',parentId:'父级标识',contentId:'内容标识',kind:'内容类型',filename:'文件名称',size:'文件大小（字节）',sizeBytes:'文件大小（字节）',count:'数量',valid:'有效条数',invalid:'无效条数',isTest:'是否测试',level:'权益档位',year:'年度',cycleId:'考期标识',startsAt:'开始时间',endsAt:'结束时间',revoked:'是否撤销',version:'版本',revision:'修订号',config:'配置内容',model:'模型名称',mode:'运行模式',test:'是否测试调用',durationMs:'耗时（毫秒）',modelCount:'模型数量',page:'所在页面',task:'任务内容',steps:'执行步数',code:'推荐码',channel:'渠道',permissionLevel:'赠送权益档位',permissionHours:'赠送权益时长（小时）',expiresAt:'到期时间',sendType:'发送类型',messageId:'消息标识',opensAt:'开放时间',previousOpensAt:'原开放时间',typeId:'题型标识',productId:'商品标识',amountCents:'金额（分）',refundReference:'退款凭证',revokedOrderEntitlement:'是否撤销关联订单权益',provider:'服务商',transactionId:'支付流水号',issue:'异常说明',credentialsChanged:'凭据变更',cleared:'已清除项目',hasCover:'是否设置封面',results:'检测结果',checks:'检查项目',message:'说明',testedAt:'检测时间',description:'说明',target:'操作对象',userId:'用户标识',prepDays:'备考天数',sprintDays:'冲刺天数',defaultRestDays:'默认休息天数',defaultRound:'默认学习轮次',permissions:'权益内容'}
const values:Record<string,string>={true:'是',false:'否',draft:'草稿',review:'待审核',published:'已发布',offline:'已下架',deleted:'已删除',active:'启用',disabled:'停用',expired:'已过期',pending:'待生效',success:'成功',failed:'失败',failure:'失败',warning:'需关注',completed:'已完成',stopped:'已停止',running:'执行中',pending_payment:'待支付',paid:'已支付',closed:'已关闭',refunding:'待线下退款',refunded:'已退款',payment_failed:'支付失败',free:'普通会员',none:'普通会员',vip:'VIP会员',svip:'SVIP会员',trial:'体验权益',entitlement:'权益商品',superadmin:'超级管理员',student:'学员',admin:'管理员',live:'真实接口',mock:'本地测试',test:'测试',manual:'人工',restore:'恢复订单权益',set:'人工设置',subject:'科目',chapter:'章',section:'节',knowledge:'知识点',question:'题目',course:'课程',faq:'常见问题',douyin:'抖音',video_account:'视频号',kuaishou:'快手',xiaohongshu:'小红书',bilibili:'哔哩哔哩',community:'社群',scheduled:'定时发送',preset:'预设消息',all:'全站',wechat:'微信',alipay:'支付宝'}
// Values may contain administrator supplied configuration. Never expose credentials in history.
export const sensitiveAuditKey=(key:string)=>/password|secret|token|api.?key|private.?key|encrypted|authorization|credential/i.test(key)&&key!=='credentialsChanged'
export function redactAuditDetails(value:any):any{
 if(Array.isArray(value))return value.map(redactAuditDetails)
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,sensitiveAuditKey(k)?'已隐藏':redactAuditDetails(v)]))
 return value
}
export function auditDetailRows(value:any,path=''):Array<{label:string;value:string}>{
 if(value===null||value===undefined)return [{label:path||'详情',value:'未记录'}]
 if(typeof value!=='object')return [{label:path||'详情',value:values[String(value)]||String(value)}]
 return Object.entries(value).flatMap(([key,item])=>{
  const label=path?path+' / '+(detailLabels[key]||(/^\d+$/.test(key)?'第'+(Number(key)+1)+'项':'扩展信息')):detailLabels[key]||'扩展信息'
  return sensitiveAuditKey(key)?[{label,value:'已隐藏'}]:auditDetailRows(item,label)
 })
}
