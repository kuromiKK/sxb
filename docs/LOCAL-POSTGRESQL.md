# 本机 PostgreSQL

2026-09-17，本机网站已从 PGlite 迁移到独立 PostgreSQL 17.11。后台「系统设置 → 运行环境」读取实际数据库版本。

## 本机配置

- 地址：`127.0.0.1:5432`，仅本机可连接，认证使用 SCRAM-SHA-256。
- 数据库：`sxb_local`；业务角色：`sxb_app`，没有超级管理员、创建数据库或创建角色权限。
- PostgreSQL 来自 Windows 官方下载页面所指向的 EDB 发行包（17.11-3）；本机采用免系统服务的独立进程方式。
- 可执行文件：`.local/postgresql-runtime/pgsql/bin`；数据：`.local/postgresql/data`；日志：`.local/postgresql/server.log`。
- 连接凭据：`.env` 和受限目录下的 `.local/postgresql/connection.json`，不输出到日志或提交 Git。
- 上传资源继续保存在原 `MEDIA_DIR`（默认 `.local/media`），URL、资源 ID、引用关系不变。
- 原加密密钥保持不变。不要重新生成 `.local/secret.key` 或替换已有 `SECRET_KEY`，否则已存接口凭据无法解密。

## 启动与停止

运行 `node scripts/start-local.mjs` 启动网站，脚本会先检查并启动本项目 PostgreSQL。也可运行 `npm run dev:api` 仅启动数据库和后端；单独检查数据库使用 `node scripts/local-postgres.mjs`。

PostgreSQL 未注册为 Windows 开机服务。电脑重启后，重新执行上述网站启动命令即可。启动脚本只管理与本机配置匹配的数据库，不管理其他服务器的数据库。

如需停止数据库，先核实并停止此项目 API，再执行：

```powershell
& ./.local/postgresql-runtime/pgsql/bin/pg_ctl.exe stop -D .local/postgresql/data -m fast -w
```

## 已完成的迁移核验

- 61 张数据表、8,824 条记录，包含历史归档；逐表记录数和完整行摘要一致。
- 表、视图、序列清单，以及字段、约束、索引定义一致。
- 16 个上传文件逐一校验大小和 SHA-256；1 份已有加密配置通过解密校验。
- 备份路径及迁移摘要记于 `.local/postgresql/migration.json`；受限备份目录内包含 SQL、媒体、原 `.env`、密钥、恢复日志及完整核验报告。
- 原 `.local/database` 未删除或改写，不再被网站使用。

迁移脚本 `scripts/migrate-local-postgres.mjs` 仅接受停止写入的旧 PGlite 和空的本机目标库；导入使用单一事务，任何 SQL 错误都会回滚。所有核验通过后才更改 `DATABASE_URL`。现已完成迁移，不要重复运行此脚本。

## 备份与回退

以后备份数据库使用 PostgreSQL `pg_dump`，并配套保存媒体文件及加密密钥；不能把运行中的 PostgreSQL 数据目录直接复制当作一致性备份。

如必须回到迁移前状态：先停止 API，备份切换后新增的 PostgreSQL 数据，再恢复迁移备份中的 `.env`，确认它指向原 `.local/database`，随后启动 API。原数据仍在，无需删除 PostgreSQL。此方式只能恢复到迁移前，不能保留切换后新增的业务记录；需要保留新记录时，应另行安排反向数据迁移。

数据库、备份、上传文件和密钥均不进入 Git。本次本机迁移并不代表已完成阿里云部署。
