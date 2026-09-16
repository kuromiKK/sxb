# 上行宝线上内测部署记录

部署日期：2026-09-17（北京时间）。这是独立内测环境，不代表真实短信、微信登录、支付及所有业务流程已经验收。

## 访问与运行环境

| 项目 | 配置 |
| --- | --- |
| 用户端 H5 | https://h5t.shangxingbao.cn |
| 管理后台 | https://htt.shangxingbao.cn |
| 用户端根目录 | `/www/wwwroot/h5t_shangxingbao_cn` |
| 后台根目录 | `/www/wwwroot/htt_shangxingbao_cn` |
| 服务器 | `8.140.249.8`，Alibaba Cloud Linux 3，2 vCPU / 4 GiB |
| 宝塔站点类型 | HTML 项目，站点 ID 分别为 12、13 |
| 后端发布目录 | `/www/sxb/releases/20260917-env-1789592414023` |
| 当前后端 | `/www/sxb/current`，指向上述发布目录 |
| Node.js | `/opt/sxb/node-v24.21.0-linux-x64/bin/node`，不替换服务器现有 Node |
| API | `sxb-api.service`，仅监听 `127.0.0.1:4310` |
| 验证码 | `sxb-captcha.service`，仅监听 `127.0.0.1:4311` / `54311` |
| 数据库 | 独立 Docker 容器 `sxb-postgres`，PostgreSQL 17.11，`127.0.0.1:5433`，库 `sxb_test` |
| 数据目录 | `/www/sxb/shared/postgres`；不要复制运行中的目录充当数据库备份 |
| 上传文件 | `/www/sxb/shared/media`，不在 Nginx 静态网站根目录中 |
| 环境配置 | `/etc/sxb/app.env`，权限 `root:sxb 0640`，不要提交或公开内容 |

API 与验证码使用独立系统账号 `sxb`。数据库应用账号 `sxb_app` 不具有超级用户权限。Docker 使用 host 网络但 PostgreSQL 显式绑定环回地址；未修改服务器已有 Docker 防火墙链。已有 PostgreSQL 16 和其他网站继续使用原配置。

## 宝塔中的两个 PostgreSQL 实例

| 实例 | 版本与端口 | 用途与管理入口 |
| --- | --- | --- |
| 宝塔原有安装 | 16.10，5432 | 原有数据库；软件商店的 PostgreSQL 管理页仍显示此版本 |
| 本项目 Docker `sxb-postgres` | 17.11，127.0.0.1:5433 | `sxb_test`；宝塔左侧「数据库 → PgSQL」，选择下述服务器或全部服务器 |

本项目沿用本机 PostgreSQL 17 的大版本，单独部署以避免修改原有实例。数据库文件实际位于 `/www/sxb/shared/postgres`。

2026-09-17 已补充宝塔数据库登记：服务器名称 `SXB PostgreSQL 17.11 (Docker / 5433)`，服务器 ID 7，数据库记录 ID 12。已通过宝塔列表接口及详情接口核实能够列出 `sxb_test` 并读取 61 张表。若仍看不到，请刷新数据库页面并检查服务器筛选；「从服务器同步」只同步所选实例的数据库清单到宝塔，不会迁移数据，也不会同步本机开发数据。

宝塔连接使用专用账号 `sxb_test`，授予 `sxb_app` 成员资格，无超级用户权限。应用仍使用 `sxb_app`，没有更换其凭据。面板连接配置保存在 `/etc/sxb/panel-db.env`（仅 root 可读），本机受限迁移备份目录另有 `server-panel-db.env` 副本。

宝塔登记不等于接管 Docker 的服务与版本管理。当前面板备份代码调用原安装的 PostgreSQL 16 `pg_dump`，不能备份 17 实例；请使用下述 `sxb-backup` 自动备份或容器内的 17 版工具，不要替换原实例的工具或在软件商店升级原实例。

服务器启动安全配置始终为 `APP_MODE=production`，用于校验独立数据库和密钥并禁止自动导入演示种子数据。业务运行模式由 `platform_environment` 表持久化控制，当前为 **test**（测试环境）。短信配置为 **test**，登录页在通过图形验证后显示测试验证码，不发送短信；管理员仍使用密码及真实图形验证码登录。模式切换入口是后台「系统设置 → 运行环境」，要求当前管理员密码、明确确认和修订号校验，并记录审计日志。

切换业务模式会使旧验证码、未完成协议确认和学生会话失效；保留管理员会话、业务数据、上传文件及接口凭据。测试环境允许模拟支付，但正式订单不能模拟支付。2026-09-17 已补齐 GoCaptcha 服务访问密钥，生产切换前置检查全部通过。以后开放正式运营时仍需开通真实短信等渠道；不要通过修改 `APP_MODE` 来切换业务测试模式。

Nginx 代理两个域名的 `/api/` 到同一 API。它用连接来源 IP 覆盖 `X-Forwarded-For`；API 仅在 `TRUST_PROXY=loopback` 时信任本机代理。新服务端口均不对公网监听。单文件上传仍使用已注册资源管线，Nginx 请求上限 210 MiB，应用单文件上限 200 MiB。

## 数据迁移与验证

源：本机 PostgreSQL 17，通过一致性快照导出；源库和本机配置未切换、未删除。

- 61 张表、8,866 条记录（含历史归档）全部导入。
- 逐表行数及完整行摘要、表/视图/序列清单、字段、约束、索引核验一致。
- 16 个已注册上传文件逐一核验大小与 SHA-256：10 张图片、2 个音频、3 个附件、1 个视频。
- 保留原有资源 ID、文件名、创建时间和引用关系；资源不改为公开静态文件。
- 原应用加密密钥随迁移保存，1 项已有加密配置成功解密验证。
- 恢复后的核验记录：`/www/sxb/backups/migration/verified.json`。
- 本地受限备份：`.local/deploy/snapshot-2026-09-16T19-37-54-647Z/`，包含原始备份及部署恢复密钥；不要发送整个目录到聊天或提交 Git。

首次迁移是一次性复制，之后本机和线上数据库各自独立，不会自动同步编辑。

首次部署完成：类型检查、114 项自动化测试、后台/H5 构建、两个公网 HTTPS 首页及 API 健康检查、HTTP 跳转 HTTPS、图形验证码挑战生成、验证码管理接口拒绝匿名访问、后台接口拒绝匿名访问、`.env` 不公开，以及伪造转发 IP 被 Nginx 覆盖。后续版本验证见下节。

所有原有 Nginx 站点配置文件保持不变。首次部署未完成浏览器交互验收，后续已使用 Playwright 驱动 Chrome 完成管理员及测试学生登录验证；真实短信送达、微信授权、真实支付与通知回调仍待配置后验收。

## 2026-09-17 环境切换与 H5 修复发布

- 固定版本：`20260917-env-1789592414023`。包含环境切换、管理员删除、登录验证码、AI 请求修复、H5 存储 API 修复及既有部署改动。
- 发布包 SHA-256：`ad0d9dcf51202f04338aa1a856b93204167abad50242511030fde487f5714f17`；源码归档 SHA-256：`17bca717b58520c51d81b031bdc0ba9fb65533fec9065e27a7a55a9039b95bb3`。
- 独立源码快照包含 435 个文件；本机 `.local/deploy/20260917-env-1789592414023/` 保存源码归档、源文件 SHA-256 清单、Git 基线与工作区 diff、构建日志及发布包。秘密配置、数据库和上传文件不在源码快照或发布包中。
- 从快照构建后台和 H5，后端使用同一快照。运行自动幂等增量迁移，没有导入本机数据库。新增 `platform_environment`、管理员删除标记，保留原有用户、订单与媒体。
- 已通过真实后台登录及密码确认切换业务模式：`production → test`，修订号 2，审计事件 `settings.environment`。已验证 API 重启后仍为 test，服务器 `APP_MODE=production` 及服务配置、密钥的文件哈希未变。
- 验证：116 项自动化测试通过，类型检查及后台/H5 构建成功；针对构建产物的环境切换/标识/首页/测试验证码浏览器验证通过。公网真实 GoCaptcha 管理员登录、环境切换、测试短信码展示、学生协议确认与登录成功；首页和学习计划无 `getStorageSync` 错误。管理员列表显示删除入口，未执行任何管理员删除。
- 公网验收新增一个学生测试账号 `19900009117`（`is_test_data=true`），确认用户协议 V3 和隐私协议 V1；未发送短信、未付款。原有 2 笔订单和 16 个资源保留，原上传文件哈希一致。
- 额外修复 H5 依赖 chunk 的点开头文件名，避免被 Nginx 隐藏文件规则拦截；仅调整 H5 构建配置，不修改服务器隐藏文件保护规则。
- 最终两个站点的 91 个静态构建文件均通过公网 HTTP 200 与逐文件 SHA-256 核对；两个健康检查均为 test，公开短信模式为 test，匿名后台访问为 401。
- 发布前加密数据备份：`/www/sxb/backups/sxb-20260916T204945Z.tar.gz.enc`。发布前原应用/静态备份记录：`/www/sxb/backups/releases/20260917-env-1789591618250/`，其中 `previous-release.txt` 指向原版 `20260917-internal-1789587604276`，`static-before.tar.gz` 保存两个网站发布前静态文件。

回退本次更新可运行 `/www/sxb/backups/releases/20260917-env-1789592414023/rollback-app.sh`。脚本只切回原应用、恢复两个项目静态目录并重启 API，不覆盖数据库、上传文件或配置；新增字段/表保留。原版不支持业务环境开关，会按服务器 `APP_MODE=production` 禁用测试短信。之后若已有新的业务或结构变更，需重新评估回退兼容性，不要直接恢复旧数据库备份覆盖新数据。

## GoCaptcha 访问密钥配置（2026-09-17）

检查时现有服务的 `api_keys` 为空，后端 `GOCAPTCHA_API_KEY` 也未设置，因此新建了本项目专用的随机访问密钥，并同步写入 `/www/sxb/shared/gocaptcha/config.json` 与 `/etc/sxb/app.env`，两个文件均为 0640。未更换应用 `SECRET_KEY` 或数据库连接，服务器 `APP_MODE=production`、业务模式 test（修订号 2）保持不变。

GoCaptcha 的 `/api/v1/public/get-data`、`/api/v1/public/check-data` 已加入 `auth_apis`，保留原有管理接口保护和本机监听地址。服务间使用 `X-API-Key` 请求头；该密钥不发给浏览器。缺失/错误密钥的生成、校验及管理请求均返回 401，正确密钥能生成验证码。重启 GoCaptcha 与 API 后核实运行进程密钥匹配，调用实际 `productionIssues()` 返回空数组，并通过公网页面验证图形验证码、测试短信码和学生登录。

变更前配置备份在 `/www/sxb/backups/gocaptcha-key-20260916T211834Z/`（仅 root 可访问），实际路径也记录在 `/etc/sxb/gocaptcha-key-backup-path`。该目录保存变更前的 `app.env`、`gocaptcha-config.json` 和变更后的 `gocaptcha-config-current.json`。配置完成后另执行一次现有加密备份，以保存含新密钥的应用配置。灾难恢复时需将备份中的 `GOCAPTCHA_API_KEY` 同步配置到 GoCaptcha 的 `api_keys` 并保留上述鉴权路径，然后重启两个服务；不要只恢复其中一端。

未代替用户切换生产模式。切换后测试验证码停止显示；如果短信仍为 test 配置，生产模式会关闭短信登录，需在接口配置中设置真实短信服务。

## HTTPS、服务与备份

两个网站共用一张包含两个域名的 Let's Encrypt 证书，首张有效期至 **2026-12-15**。证书目录 `/etc/sxb/letsencrypt/live/sxb-internal/`；宝塔各站点证书路径为指向此目录的符号链接。

- `sxb-cert-renew.timer`：每天两次检查证书续期，成功后检查配置并平滑重载 Nginx。验证目录为 `/www/sxb/acme`，请保留两个 HTTP 站点的 ACME 路由。
- `sxb-backup.timer`：每天北京时间 04:30 后随机 15 分钟内备份数据库、上传文件、应用环境配置及宝塔专用数据库连接配置。
- 备份文件：`/www/sxb/backups/sxb-*.tar.gz.enc`，使用 AES-256-CBC / PBKDF2 加密，解密密钥在 `/etc/sxb/backup.key`，另有本地受限副本。
- 已成功执行首次加密备份并检查解密后的归档目录。日常备份目前保留在同一服务器，不等于异地容灾；未配置自动删除历史备份。
- `/etc/logrotate.d/sxb` 管理网站日志轮转，保留 14 份；API 日志通过 systemd journal 查看。

常用命令（在服务器执行）：

```bash
systemctl status sxb-api sxb-captcha
systemctl restart sxb-api
journalctl -u sxb-api -n 100 --no-pager
docker ps --filter name=sxb-postgres
systemctl list-timers 'sxb-*'
/usr/local/sbin/sxb-backup
/usr/local/sbin/sxb-cert-renew
```

恢复时先停止 API，再将备份解密至仅 root 可访问的临时目录；使用 `pg_restore` 导入**新建空数据库**，恢复媒体和原 `SECRET_KEY`，修改数据库连接并核验后再切换。不要直接对线上库执行覆盖恢复。

数据库备份不包含集群全局角色。新服务器恢复时需先重建应用登录角色 `sxb_app`，以该角色拥有恢复的业务对象；若还需宝塔管理，则从加密备份的 `panel-db.env` 恢复专用账号 `sxb_test` 的连接凭据，重建该登录角色并执行 `GRANT sxb_app TO sxb_test`，最后重新登记宝塔连接。不要将上述凭据打印到日志或聊天中。

部署前 Nginx 配置和两个静态目录的备份位置记录在 `/etc/sxb/predeploy-backup-path`。回退仅操作本项目的站点配置与服务；不全量覆盖其他网站后续变更。

## 用户填写真实接口配置

入口：管理后台 → 系统管理 → 系统设置 → 接口配置。凭据由用户直接填写，不写入文档。

| 配置项 | 值 |
| --- | --- |
| 微信登录授权回调 | `https://h5t.shangxingbao.cn/api/auth/wechat/callback` |
| 微信登录返回地址 | `https://h5t.shangxingbao.cn/#/pages/login/index` |
| 微信支付通知地址 | `https://h5t.shangxingbao.cn/api/payments/wechat/notify` |
| 支付宝通知地址（启用时） | `https://h5t.shangxingbao.cn/api/payments/alipay/notify` |
| 支付宝返回地址（启用时） | `https://h5t.shangxingbao.cn/#/pages/payment/index` |
| 微信公众号网页授权域名 | `h5t.shangxingbao.cn` |
| 微信支付 JSAPI 支付授权目录（按商户平台要求填写） | `https://h5t.shangxingbao.cn/` |
| 微信 H5 支付网站域名（启用 H5 时） | `h5t.shangxingbao.cn` |

微信内 H5 登录需要具备网页授权权限的公众号；电脑扫码登录使用单独的网站应用 AppID/AppSecret，二者不能混用。微信平台要求的域名校验文件需按其提供的文件名放入用户端静态根目录。各渠道还需在微信商户平台开通并完成 AppID 绑定。

短信需设置阿里云真实模式、已审核签名与验证码模板、RAM 凭据。登录与支付“测试连接”不会代替真实短信送达、微信授权和小额付款回调的端到端验收。上线真实支付后产生真实扣款；退款目前由人工处理，应用未实现平台自动退款 API。
