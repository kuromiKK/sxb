# 知识结构分表（版本 10）

本次迁移已在本地数据库执行。旧内容 ID 保持不变，前后端沿用原接口地址。

## 当前物理表

| 表 | 职责 | 关联规则 |
| --- | --- | --- |
| exam_categories | 考试分类 | 考试根节点通过 category_id 关联 |
| knowledge_nodes | 考试、科目、章、节、知识点 | kind 区分类型，parent_id 建立目录关系 |
| questions | 题目正文、选项、答案、解析 | exam_id 限定考试；parent_id 保存主知识点 |
| question_knowledge_points | 题目与知识点的多对多关系 | 同一考试可跨科目、章、节；恰有一个主知识点 |
| premium_courses | 节的精品课程 | parent_id 指向节；一节允许多门 |
| knowledge_courses | 知识点的配套课程 | parent_id 指向知识点；一个知识点允许多门 |
| other_content | 其他既有内容 | 保留文章、通知、旧讲义等内容，不混入知识目录 |
| content_identity | 全局内容 ID 注册 | 避免不同物理表复用同一内容 ID，并维持旧记录引用 |

knowledge_nodes 的考试根节点使用 kind=exam，exam_id、parent_id 均为空；科目的 parent_id 是考试 ID。其余节点的 exam_id 始终指向所属考试，父级类型按科目→章→节→知识点校验。内容 ID、类型、考试归属不可原地改换，课程归属也不可更换。

课程从节或知识点编辑器的“课程管理”创建，继承所属考试与父级。没有课程数量唯一约束，列表支持分页。原有课程 ID、媒体字段、知识点正文和已上传资料保持不变。

## 接口兼容与前端

### 题目等级（版本 12）

- `questions.grade` 独立保存 A、B、C、D、E，数据库 CHECK 限制合法值；NULL 表示未设置，旧题和未指定等级的导入题保持 NULL。不推定等级对应的难度或优先顺序。
- 后台 `GET /admin/content?kind=question` 返回顶层 `grade`，`PUT /admin/content/:id` 接受该字段。省略时保留已有等级，显式 NULL 清空；等级与题目编辑在同一事务内提交，并使用原有版本冲突检查。
- 后台题目编辑提供等级选择；用户端题目不显示等级，公开 catalog 的题目数据格式保持不变。
- 等级不进入旧 `content` 兼容视图，旧导入、内容编辑及知识点关联写入不会覆盖它。
- 本地 v12 迁移前备份：`.local/backups/question-grades-v12-20260915/database`。迁移后 526 道旧题等级均为 NULL；1,397 条原内容及订单、答题、学习记录等业务数据核对未变。

### 既有结构接口

- exams、content、course_links 现在是兼容视图，不是重复存储的业务表。exams 展示考试根节点；content 按种类汇总各物理表；course_links 从课程所属父级推导。
- content 的写入触发器将旧接口写入分发到对应实体表；subject 在兼容视图仍呈现 parent_id=null，供旧目录读取使用。
- 不要对 content 使用 ON CONFLICT 或 SELECT FOR UPDATE；它是 UNION 视图。内容保存接口改用事务、按 ID 的事务锁和 version 乐观锁。
- questions.payload 中旧知识点字段保留；对外接口以关联表生成 knowledgePointIds，同时保留主 knowledgePointId。题目在题库只出现一次，知识点、节、章、科目统计均按题目 ID 去重。
- 用户端章节练习、学习计划、薄弱知识点和答题统计已支持多个关联知识点。精品课列表显示每一门节课程；知识点详情分别列出本节精品课和自身配套课。
- 后台知识图谱改为读取 /admin/knowledge-structure/:id 的真实结构，默认列表管理；与“知识点”页共用 ContentTable 和内容编辑器。图谱、脑图、Excel 标题导出也使用这份结构。
- 后台结构接口包含草稿；公开 catalog 仍严格检查完整祖先链的发布状态。未发布内容不会因为换表而出现在用户端。
- 题目导入格式本次保持兼容，原单知识点导入会生成一条主知识点关联；没有扩展题目导入或讲义业务。

## 迁移与恢复

本地执行日期：2026-09-15。

先停止 API，离线复制数据库；在独立副本上演练并核对全部原内容与业务记录，再迁移实际数据库并重启服务。

迁移前备份：.local/backups/knowledge-v10-20260915/database

数据库内还保留 migration_archive.content_v9、exams_v9、course_links_v9 作为只读历史快照。原 content、course_links 物理表被兼容视图替代；exams 实体改名为 knowledge_nodes。

迁移验证脚本：scripts/migrate-knowledge.ts。它比较迁移前后所有内容记录，以及考试、分类、考期、用户、订单、会员、答题、学习记录、媒体和导入批次的数量与 SHA-256 摘要。禁止在服务运行时另开同一个 PGlite 目录。

恢复应先停止 API，将当前数据库保留到另一个已核实的目录，再从离线备份复制恢复，并切回配套旧代码。不要在服务运行时覆盖目录；恢复旧快照会丢失快照之后的新增修改，需要先另行保留。

| 本地迁移后实体 | 数量 |
| --- | ---: |
| knowledge_nodes（含 2 个考试） | 825 |
| questions | 526 |
| question_knowledge_points | 526 |
| premium_courses | 8 |
| knowledge_courses | 2 |
| other_content | 38 |

原 1,397 条内容逐条核对通过。原 48 条答题记录、76 条学习事件、9 条用户记录、9 条媒体记录、订单和会员记录均未发生内容变化。课程与题目的新增测试数据仅存在于隔离测试库，没有写入当前开发库。

## 验证命令

- npm run check
- npm test（62 项通过）
- npm --prefix apps/user run type-check
- npm run build:admin
- npm --prefix apps/user run build:h5
- node --experimental-strip-types tests/knowledge-migration.browser.mjs
- node --experimental-strip-types tests/exam-projects.browser.mjs
- node tests/knowledge-live.browser.mjs

knowledge-migration.browser.mjs 使用隔离数据库与真实浏览器，验证课程从所属位置新增、多门课存储、跨科目题目多选保存、归属校验、冲突版本拒绝、失败不产生部分写入、真实结构导出及 H5 课程展示。

knowledge-live.browser.mjs 检查当前 5180 管理端、5174 用户端与 4310 API，不写入内容、订单或学习记录。它会用既有本地管理员登录。
