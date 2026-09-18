// Business descriptions supplement the live database catalogue, never sampled records.
const entries=`
platform_environment|系统管理|运行环境设置|全站测试或生产模式及修订号；切换记录管理员与时间，独立于服务器启动配置。
knowledge_nodes|考试与内容|知识结构节点|统一存储考试、科目、章、节和知识点，通过 kind 区分层级。
exams|考试与内容|考试项目视图|兼容视图，读取 knowledge_nodes 中的考试节点；不是另一份考试数据。
exam_categories|考试与内容|考试分类|考试项目的分类树，支持父子分类和排序。
exam_cycles|考试与内容|考试考期|考试的起止时间，供商品售卖、权益有效期判断使用。
exam_year_entries|考试与内容|考试年度图文|按考试年度保存了解考试图文；实际考期起止时间以 exam_cycles 为准。
exam_plan_configs|考试与内容|学习计划规则|每个考试的备考、冲刺和默认休息规则。
content|考试与内容|内容兼容视图|合并知识节点、题目、精品课、配套课及其他内容，写入由数据库触发器路由到实际表。
content_identity|考试与内容|内容标识索引|统一登记内容标识、类型和实际所属表。
questions|考试与内容|题目|题目主体、等级和题型组件内容；知识点关联另存关联表。
question_types|考试与内容|题型|跨考试复用的题型名称、启用状态和当前版本。
question_type_versions|考试与内容|题型历史版本|每版题型组件定义与考试评分规则。
question_knowledge_points|考试与内容|题目知识点关联|一题可对应多个知识点，并标记主要知识点。
premium_courses|考试与内容|精品课|归属于节的图文、视频或音频课程及讲义配置。
knowledge_courses|考试与内容|配套课|归属于知识点的配套课程，在知识点详情访问。
course_links|考试与内容|课程关联视图|兼容读取课程及其父级，实际关系来自课程所属节或知识点。
other_content|考试与内容|其他图文内容|保存常见问题、考前小抄等其他内容，由 kind 区分。
import_batches|考试与内容|导入批次|保存临时导入预览、解析结果、错误及提交状态。
import_jobs|考试与内容|导入任务|登记源文件、考试、逐行处理状态与可继续的导入进度。
content_origins|考试与内容|内容导入来源|关联内容、导入批次、资源文件、工作表和原始行号，保留多次来源历史。
users|用户与权益|用户账号|同时保存学员和管理员，使用 account_kind 区分，昵称不作为唯一登录标识。
sessions|用户与权益|登录会话|保存令牌摘要及有效期，前后台会话隔离。
login_codes|用户与权益|登录验证码|保存验证码摘要、有效期和失败次数，不存明文验证码。
memberships|用户与权益|订单权益履约|支付订单对应的考试、考期和权益有效期，退款撤销由 revoked 标记。
manual_entitlements|用户与权益|人工权益|按用户和考试设置人工权益，记录操作人和原因。
permission_policies|用户与权益|会员权益规则|每个考试、权益档位对应的功能权限。
wechat_identities|用户与权益|微信身份绑定|微信应用和用户标识与平台用户的绑定关系。
wechat_tickets|用户与权益|微信登录临时凭证|微信登录流程中的短期状态和身份交接凭证。
products|交易管理|商品|商品名称、展示内容、价格及上下架状态。
product_entitlements|交易管理|商品权益配置|权益商品绑定的考试、考期、档位及体验时长限制。
product_versions|交易管理|商品历史版本|每次保存或恢复产生的完整商品快照，支持历史版本恢复。
orders|交易管理|订单|购买、退款及履约信息，保留购买时商品和权益快照。
payments|交易管理|支付尝试|记录订单的支付方式、结果和错误。
provider_payments|交易管理|第三方支付单|对接支付服务商的交易引用、金额、配置快照和处理结果。
answers|学习数据|客观题答题记录|每次有效提交的答案、正确性和题目快照，重复请求按标识去重。
question_submissions|学习数据|组件题答题记录|自定义题型的作答、判分结果和重试信息。
user_records|学习数据|个人学习内容|收藏、笔记、错题本状态等；按用户、考试、类型和来源隔离。
learning_visits|学习数据|学习访问记录|轻量级内容访问和媒体播放位置，不记录每次鼠标操作。
learning_daily_users|学习数据|每日学习汇总|按日期、用户和考试汇总访问与答题次数。
learning_events|学习数据|学习事件|既有学习事件和时长记录，用于学习汇总。
monthly_reports|学习数据|月度报告|按用户、考试、月份保存生成的报告内容。
content_notices_seen|学习数据|内容已读记录|记录用户对内容通知的查看时间。
message_templates|运营管理|消息模板|站内消息的标题、图文内容和模板变量。
messages|运营管理|消息|消息内容、受众范围、发送方式和计划。
message_deliveries|运营管理|消息投递|按接收用户记录投递及已读状态。
cheatsheet_pushes|运营管理|小抄推送记录|记录小抄推送的操作人、消息、人数和时间。
referral_codes|运营管理|推荐码|渠道、适用考试及赠送权益配置。
referral_uses|运营管理|推荐码使用记录|记录用户使用推荐码及获得的权益信息。
media_assets|系统管理|资源文件|登记上传文件或外链的类型、原文件名、大小和归属。
media_tickets|系统管理|资源访问凭证|有时效的受保护资源访问授权，绑定会话。
ai_features|系统管理|AI服务配置|每项 AI 功能的模型、调用限制和加密密钥。
ai_calls|系统管理|AI调用记录|记录模型、用量、费用、结果和错误。
integration_settings|系统管理|接口配置|验证码、短信、支付、登录及工具的配置和加密凭据。
sms_deliveries|系统管理|短信发送记录|发送结果和服务商请求标识，用于限流与排错。
verification_challenges|系统管理|验证码挑战|本机验证码挑战的绑定、有效期、消费状态和验证凭证摘要。
site_preferences|系统管理|平台设置|基本信息、搜索、客服、关于平台的草稿与发布版本。
site_protocols|系统管理|协议草稿|用户服务协议和隐私政策的草稿及当前发布版本。
site_protocol_versions|系统管理|协议历史版本|每次发布的协议正文和发布人。
user_protocol_consents|系统管理|用户协议确认|用户确认的协议种类、版本和时间。
protocol_login_challenges|系统管理|协议确认临时凭证|登录时等待确认新协议的短期凭证。
system_settings|系统管理|基础键值设置|兼容基础系统设置，例如推荐码使用的站点域名。
audit_logs|系统管理|操作日志|保存稳定操作代码、操作人、对象及变更详情。
record_numbers|系统管理|业务入库编号|实际记录标识与后台展示编号之间的映射。
schema_versions|系统管理|数据库迁移版本|记录已执行的结构迁移，避免重复迁移。
`
export const tableNotes:Record<string,{group:string;label:string;description:string}>=Object.fromEntries(entries.trim().split('\n').map(line=>{const [name,group,label,description]=line.split('|');return [name,{group,label,description}]}))
const fields=`file_hash:文件内容摘要|headers:导入表头|job_id:导入任务标识|sheet:来源工作表|line:来源行号|id:唯一标识|user_id:用户标识|exam_id:考试项目标识|actor_id:操作人标识|created_at:创建时间|updated_at:更新时间|kind:业务类型|status:状态|title:标题|name:名称|parent_id:父级标识|payload:扩展业务内容|source:来源|is_test_data:是否测试数据|version:版本号|enabled:是否启用|year:年度|starts_at:开始时间|ends_at:结束时间|expires_at:到期时间|cycle_id:考期标识|level:权益档位|order_id:订单标识|product_id:商品标识|content_id:内容标识|target_id:操作对象标识|source_id:来源对象标识|question_id:题目标识|phone:手机号|nickname:姓名或昵称|role:角色|password_hash:密码摘要|invite_code:用户邀请码|inviter_id:推荐人标识|is_developer:开发者标记|account_kind:账号类型|last_login_at:最近登录时间|token_hash:凭证摘要|audience:会话所属端|code_hash:验证码摘要|sent_at:发送时间|attempts:尝试次数|short_title:简称|category_id:分类标识|intro:简介|cover_url:封面图片地址|sort_order:排序值|prep_days:备考天数|sprint_days:冲刺天数|default_rest_days:默认休息天数|default_round:默认学习轮次|cutoff_date:旧版截止日期|guide_document:了解考试图文|guide_updated_at:了解考试更新时间|owner_table:实际所属表|course_id:课程标识|description:说明|builtin:是否内置|type_id:题型标识|definition:组件定义|knowledge_id:知识点标识|is_primary:是否主要关联|grade:题目等级|product:购买类别|amount_cents:金额（分）|paid_at:支付时间|close_reason:关闭原因|product_snapshot:购买时商品快照|checkout_confirmation:支付确认信息|deleted_at:删除时间|refund_requested_at:退款登记时间|refunded_at:退款确认时间|refund_reason:退款原因|refund_reference:退款凭证|fulfillment_snapshot:履约快照|method:支付方式|error:错误说明|trial_ends_at:体验结束时间|revoked:是否撤销|entitlement_ends_at:权益结束时间|trial_level:体验权益档位|first_granted_at:首次人工授予时间|reason:原因|permissions:功能权限|type:商品类型|price_cents:售价（分）|original_price_cents:划线原价（分）|document:富文本文档|frontend_title:前端商品名称|trial_hours:体验时长（小时）|minimum_hours:最低剩余时长（小时）|short_notice:剩余时长不足提示语|snapshot:业务快照|action:操作类型|ref:服务商支付引用号|provider:服务商|channel:渠道|config:配置内容|secrets:加密凭据|transaction_id:第三方交易流水号|processed_at:处理时间|issue:异常说明|selection:所选答案|correct:是否正确|score:得分|request_id:请求标识|response:幂等响应快照|question_snapshot:作答时题目快照|answers:作答内容或次数|result:处理结果|grading_attempt:判分尝试次数|grading_started_at:开始判分时间|day:统计日期|visits:访问次数|session_id:学习访问会话标识|media_type:媒体类型|path:内容所属路径|started_at:访问开始时间|last_activity_at:最近活动时间|position_seconds:播放位置（秒）|duration_seconds:媒体总时长（秒）|progress_sequence:进度更新序号|minutes:时长（分钟）|month:月份|generated_at:生成时间|seen_at:查看时间|template_id:消息模板标识|content:纯文本内容|variables:模板变量|send_type:发送方式|channels:投递渠道|category_ids:适用分类|exam_ids:适用考试|permission_levels:接收权益档位|user_ids:指定用户|schedule:发送计划|message_id:消息标识|read_at:已读时间|delivered_at:投递时间|recipient_count:接收人数|pushed_at:推送时间|code:推荐码|permission_level:赠送权益档位|permission_hours:赠送时长（小时）|creator_id:创建人标识|referral_id:推荐码记录标识|used_at:使用时间|owner_id:上传人标识|filename:原始文件名|mime:文件格式|size_bytes:文件大小（字节）|disk_name:服务端存储文件名|external_url:外链地址|legacy_image_hash:历史内嵌图片摘要|asset_id:资源标识|session_hash:授权会话摘要|feature_id:AI功能标识|model:模型名称|endpoint:接口地址|input_tokens:输入用量|output_tokens:输出用量|cached_tokens:缓存用量|cost_yuan:估算费用（元）|pricing:计价快照|duration_ms:耗时（毫秒）|is_test:是否测试调用|context:调用上下文|encrypted_key:加密接口密钥|revision:修订号|key:配置键|ip_hash:来源地址摘要|provider_code:服务商状态码|biz_id:服务商业务标识|binding:验证码绑定摘要|scope:适用场景|upstream_key:验证码服务挑战标识|claimed:是否已消费|proof_hash:验证凭证摘要|proof_expires_at:验证凭证到期时间|variant:验证方式|draft:草稿内容|published:已发布内容|published_at:发布时间|draft_document:草稿正文|draft_revision:草稿修订号|published_version:当前发布版本|accepted_at:同意时间|value:设置值|table_name:所属表名|record_id:实际记录标识|entry_no:入库编号|applied_at:迁移执行时间|details:变更详情|rows:导入行数据|errors:导入错误|app_id:微信应用标识|openid:微信用户标识|data:临时业务数据`
export const fieldLabels:Record<string,string>=Object.fromEntries(fields.split('|').map(s=>s.split(':')))
fieldLabels.mode='运行模式'
fieldLabels.admin_deleted_at='管理员删除时间'
export const fieldNotes:Record<string,string>={
 'users.nickname':'允许重名；用户由唯一标识区分，手机号受唯一约束。','users.account_kind':'student：学员；admin：管理员。','users.role':'角色代码，后台超级管理员为 superadmin。','users.is_developer':'历史开发者标记，当前后台设置入口已隐藏。',
 'products.title':'后台商品名称，订单管理使用此名称。','products.frontend_title':'前端商品展示名称。','products.type':'entitlement：权益商品；trial：体验权益商品。','questions.grade':'A、B、C、D、E；空值表示尚未设置。','orders.status':'pending_payment：待支付；paid：已支付；closed：已关闭；refunding：待线下退款；refunded：已退款。其他约束以实际数据库为准。',
 'exam_year_entries.cutoff_date':'旧版兼容字段；当前商品与履约按 exam_cycles.starts_at、ends_at 判断。','user_records.kind':'例如 favorite（收藏）、note（笔记）、wrongDismissal（错题本移除状态）、handoutDownload（讲义下载）。','audit_logs.action':'保留稳定的英文操作代码；后台通过统一中文词典展示名称。','media_assets.source':'upload：已上传文件；external：外链，不代表文件存储在本站。','verification_challenges.upstream_key':'验证码服务内部标识，仅服务端使用。',
 'knowledge_nodes.kind':'exam：考试；subject：科目；chapter：章；section：节；knowledge：知识点。','learning_daily_users.answers':'当日该用户在该考试的答题提交次数。','question_submissions.answers':'以题型组件标识为键的作答内容。'
}
export const jsonNotes:Record<string,string>={
 'knowledge_nodes.payload':'document：正文富文本；no：排序；其他节点内容按 kind 区分。',
 'import_jobs.headers':'结构导入配置：mode 新增或更新、fields 所选字段、blankBehavior 空值保留或清空。旧批次和题目批次保留数组形式。',
 'questions.payload':'templateId、templateVersion：题型及版本；values：以组件标识为键的题目配置；旧题可含 stem、options、answer、analysis、knowledgePointIds。',
 'premium_courses.payload':'type：图文/视频/音频；document：图文正文；mediaAssetId、posterAssetId：资源标识；handouts：讲义列表；totalMinutes：时长。',
 'knowledge_courses.payload':'与精品课一致；父级为知识点。资源标识通过登记资源管线保存。',
 'other_content.payload':'按 kind 区分。常见问题含 document、scope、examIds；小抄含 document、opensAt、closesAt；deletedAt 用于软删除。',
 'question_type_versions.definition':'fields：组件列表（id、kind、label、required、answerRequired、minOptions、maxOptions、aiGrading、children 等）；examRules：各考试的评分规则。',
 'question_submissions.answers':'以题型组件标识为键的用户作答，结构取决于题型版本。','question_submissions.result':'判分状态、总分、满分、组件评分及自评标记；按判分流程逐步更新。',
 'user_records.payload':'按 kind 区分：笔记正文、来源类型、错题移除状态或下载资源信息。','orders.product_snapshot':'下单时商品版本、名称、考试、考期、价格、图文及权益配置；后续修改商品不覆盖此快照。','orders.fulfillment_snapshot':'订单支付后履约时保留的权益信息。','product_versions.snapshot':'该版本完整商品配置，恢复时创建新版本，不覆盖原历史。',
 'permission_policies.permissions':'以权限代码为键的开关或额度，由会员权益管理统一配置。','ai_features.config':'provider、baseUrl、protocol、mode、model、计价、超时、每日限额、提示词；密钥单独加密保存。','ai_calls.pricing':'本次调用采用的输入、输出、缓存计价与币种。','integration_settings.config':'按 key 保存验证码、短信、微信、支付宝、AI员工外观、G6 样式等配置。','integration_settings.secrets':'加密后的服务商凭据，数据字典不读取字段值。',
 'site_preferences.draft':'按 key 保存 basic、customer、search、about 的未发布配置。','site_preferences.published':'对应配置的已发布版本，前后台展示读取此版本。','audit_logs.details':'操作相关的变更前后值、原因、版本和结果；结构随操作类型变化。',
 'messages.schedule':'定时或预设发送计划，由发送方式决定。','provider_payments.config':'创建支付单时使用的接口配置快照。','provider_payments.snapshot':'创建支付单时的商品和交易信息。'
}
