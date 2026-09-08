// Shared business vocabulary. Keys are stable; labels are for operators.
export const variables = [
 ['user_nickname','用户昵称','小陈','common'],['user_phone','手机号（脱敏）','139****0001','common'],['publish_time','发送时间','2026-09-08 09:00','common'],
 ['exam_name','考试名称','初级社会工作师','exam'],['membership_permission','会员权限','VIP','exam'],['exam_end_time','考试结束时间','2027-05-31 23:59','exam'],['exam_days_left','距考试天数','30','exam'],
 ['last_week_study_days','上周学习天数','3','plan'],['last_week_questions','上周首次完成新题','80','plan'],['last_week_wrong_questions','上周复习错题（去重）','20','plan'],['last_week_wrong_correct','上周复习答对错题','12','plan'],['this_week_questions','本周剩余计划题数','100','plan'],['this_week_study_days','本周剩余学习日','5','plan'],['plan_stage','学习阶段','备考阶段','plan'],['weekly_review','上周回顾（无记录自动调整）','上周学习3天，完成80道新题，复习20道错题，其中12道已答对。','plan'],
 ['order_no','订单号','SXB202609080001','order'],['order_product','订单商品','SVIP','order'],['order_amount','订单金额（元）','799.00','order'],['order_status','订单状态','支付成功','order'],['membership_expire_time','权益有效期','2027-05-31 23:59','rights'],
 ['report_month','报告月份','2026年8月','report'],['content_title','资料标题','考前复盘清单','content'],['content_close_time','资料关闭时间','2027-05-31 23:59','content'],['ai_result_status','复习资料生成状态','生成成功','ai']
].map(([key,label,example,group])=>({key,label,example,group}))
export const routes = [
 ['none','不跳转',''],['home','首页','/pages/index/index'],['plan','学习计划','/pages/learning-plan/index'],['courses','精讲课列表','/pages/courses/index'],['knowledge','知识图谱','/pages/knowledge/index'],['practice','刷题','/pages/practice/index'],['wrong','错题本','/pages/practice-tools/index?mode=wrong'],['notes','笔记列表','/pages/practice-tools/index?mode=note'],['favorites','收藏列表','/pages/practice-tools/index?mode=favorite'],['recite','背题列表','/pages/recite/index'],['handouts','我的讲义','/pages/profile-center/index?mode=handouts'],['rights','我的权益','/pages/profile-center/index?mode=rights'],['orders','我的订单','/pages/profile-center/index?mode=orders'],['report','本消息对应的学习报告',''],['order','本消息对应的订单详情',''],['review','AI复习资料','/pages/ai-review/index'],['sheets','考前小抄列表','/pages/cheatsheets/index'],['notices','考试须知列表','/pages/exam-notices/index'],['course','指定精讲课',''],['point','指定知识点',''],['sheet','指定考前小抄',''],['article','指定考试须知',''],['external','外部 HTTPS 网站','']
].map(([key,label,url])=>({key,label,url}))
export const presets = [
 {key:'weekly',name:'每周安排与上周回顾',group:'learning',groups:['plan'],title:'{{exam_name}}本周学习安排已更新',body:'{{weekly_review}}\n本周剩余{{this_week_study_days}}个学习日，预计完成{{this_week_questions}}道题。安排会随学习进度调整，请查看最新计划。',route:'plan',help:'每周首个学习日09:00；周中首次创建计划立即发送，每人每考试每周一次。'},
 {key:'paid',name:'购买成功',group:'account',groups:['order','rights'],title:'{{exam_name}}购买成功',body:'{{order_product}}订单已支付，金额¥{{order_amount}}。当前会员权限：{{membership_permission}}，有效至{{membership_expire_time}}。',route:'order',help:'真实业务记录支付成功后发送，同一订单只发一次。'},
 {key:'payment_failed',name:'支付失败',group:'account',groups:['order'],title:'订单支付未成功',body:'{{exam_name}}的{{order_product}}订单尚未支付成功，请查看订单状态后重试。',route:'order',help:'支付失败记录产生时发送，每笔失败记录一次。'},
 {key:'pending',name:'待支付订单提醒',group:'account',groups:['order'],title:'你有一笔待支付订单',body:'{{exam_name}}{{order_product}}订单尚未支付，请在订单有效期内处理。',route:'order',help:'创建订单10分钟后仍待支付时发送一次；30分钟已关闭的订单不提醒。'},
 {key:'rights_changed',name:'会员权限变更',group:'account',groups:['rights'],title:'{{exam_name}}会员权限已更新',body:'当前会员权限：{{membership_permission}}。请进入我的权益查看详情。',route:'rights',help:'已记录的权益发生变化时发送，包括到期降为免费、SVIP转VIP和后台人工调整。'},
 {key:'rights_expiring',name:'会员权限到期提醒',group:'account',groups:['rights'],title:'{{exam_name}}会员权限即将调整',body:'当前{{membership_permission}}有效至{{membership_expire_time}}。VIP到期变为免费用户，SVIP到期转为下一年度VIP。',route:'rights',help:'到期前7天、1天各发一次。'},
 {key:'prep',name:'进入备考阶段',group:'learning',groups:['plan'],title:'{{exam_name}}进入备考阶段',body:'距考试还有{{exam_days_left}}天，建议查看并调整学习计划。',route:'plan',help:'按考试后台配置的备考起始天数提醒一次。'},
 {key:'sprint',name:'进入冲刺阶段',group:'learning',groups:['plan'],title:'{{exam_name}}进入冲刺阶段',body:'距考试还有{{exam_days_left}}天，建议结合错题、笔记与考前资料复习。',route:'plan',help:'按考试后台配置的冲刺起始天数提醒一次。'},
 {key:'countdown',name:'考试倒计时',group:'learning',groups:[],title:'距{{exam_name}}考试还有{{exam_days_left}}天',body:'请留意考试通知，按自己的节奏完成考前复习。',route:'notices',help:'距考试30、14、7、1天各提醒一次。'},
 {key:'report',name:'学习报告已生成',group:'learning',groups:['report'],title:'{{report_month}}学习报告已生成',body:'你的{{exam_name}}学习报告已经生成，点击查看学习回顾。',route:'report',help:'仅在数据库中实际生成报告后发送，每份报告一次。'},
 {key:'sheet',name:'考前小抄开放',group:'learning',groups:['content'],title:'{{exam_name}}考前小抄已开放',body:'《{{content_title}}》现已开放，请在{{content_close_time}}前查看。',route:'sheet',help:'已发布小抄开放时发送；默认SVIP，每份资料每用户一次。'},
 {key:'review',name:'AI复习资料生成结果',group:'learning',groups:['ai'],title:'专属复习资料{{ai_result_status}}',body:'{{exam_name}}专属复习资料{{ai_result_status}}，请进入复习资料页查看。',route:'review',help:'仅根据真实AI调用完成或失败记录通知，每次调用一次。'}
]
export const sampleValues = Object.fromEntries(variables.map(v=>[v.key,v.example]))
export function placeholders(text:string){return [...new Set([...text.matchAll(/\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/g)].map(m=>m[1]))]}
export function substitute(text:string,values:Record<string,unknown>){return text.replace(/\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/g,(_,k)=>{if(values[k]===undefined||values[k]===null)throw new Error('缺少通配符数据：'+k);return String(values[k])})}
export function plainDoc(text:string){return {type:'doc',content:text.split('\n').map(t=>({type:'paragraph',...(t?{content:[{type:'text',text:t}]}:{})}))}}
