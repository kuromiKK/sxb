# Linux 部署前置说明

2026-09-17 已在 Alibaba Cloud Linux 3 完成线上内测部署、数据库及文件迁移核验、HTTPS 与 API 冒烟检查。实际目录、服务、备份及回调配置见 [线上内测部署记录](ONLINE-INTERNAL-TEST.md)。真实短信、微信登录和支付仍需配置凭据并由业务方联调；不要把测试验证码和模拟支付暴露到公网。以下为通用部署要求。

## 架构

- 用户端：Vue 3 + uni-app，一套代码编译 H5 / 微信小程序；App 尚未真机打包验收。
- 后台：Vue 3 + Element Plus + Lucide + Vite。
- API：NestJS 11 承载 Express 路由，TypeScript、Zod 校验。
- 数据：本机网站已使用 PostgreSQL 17，正式环境也使用 PostgreSQL，通过 `DATABASE_URL` 配置连接；PGlite 仅保留用于隔离的自动化测试与历史回退。
- 正式入口：Nginx HTTPS 443，静态资源与 `/api` 反向代理；Node API 仅监听 127.0.0.1:4310。不要把 Vite 开发服务用于公网。

## 环境与流程

1. 安装 Node.js 24、PostgreSQL、Nginx，创建非 root 系统服务账号和最小权限数据库用户。无需 Docker。
2. 确认 `ACCEPTANCE.md` 的上线阻断项已完成，特别是登录、支付、测试数据清理、正式协议和文件服务。
3. 构建后台与 H5，分别部署 `apps/admin/dist` 和 `apps/user/dist/build/h5` 到独立站点；配置 HTTPS 受信任证书，HTTP 跳转 HTTPS。
4. 配置生产环境变量：`APP_MODE=production`、`DATABASE_URL`、`SECRET_KEY`（64 位十六进制）、`API_HOST=127.0.0.1`、`API_PORT=4310`、正式 `ADMIN_ORIGIN` / `USER_ORIGIN`。
5. 首次初始化临时提供 `ADMIN_PHONE` / `ADMIN_PASSWORD`，创建管理员后从部署环境移除初始密码。密钥不可进入仓库、镜像或前端。
6. 用 systemd 管理 `node --experimental-strip-types apps/api/src/main.ts`，固定工作目录并加载权限受限的环境文件。设定重启策略、日志轮转和资源限制。
7. 生产启动只迁移表和初始化指定管理员，不自动注入 DEMO、考试或 AI 配置。正式基础数据初始化与筛选迁移工具尚需补齐，**不能将测试库直接作为正式库发布**。
8. 数据库定期 `pg_dump` 加密备份，单独备份 AI 加密密钥，配置恢复演练、监控与告警。PGlite 本地目录不能直接复制为 PostgreSQL 的数据目录，需逻辑导出 / 导入。

Nginx `/api/` 代理至 `http://127.0.0.1:4310`，保留路径，设置合理请求体上限和 AI 超时时间；静态站点使用 SPA fallback。小程序设置 `VITE_API_BASE` 为正式 HTTPS API 域名并登记微信合法域名。

生产模式明确禁止测试验证码、模拟支付；在真实提供商接入前，相关调用返回不可用。配置 AI 实调并不自动完成各前台业务工作流，需分别验收。
