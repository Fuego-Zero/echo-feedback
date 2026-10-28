# 配置、部署和恢复

## 配置

完整字段见根 .env.example。pnpm env:init 只在不存在时创建 .env，生成随机初始化密钥，不输出密钥。

关键配置：WEB_ORIGIN（公开 HTTPS Origin）、DATA_DIR、SETUP_TOKEN（首次初始化至少 32 字符）、WEB_PORT/API_PORT、SESSION_TTL_SECONDS（默认 30 天）、限流、IMAGE_CONCURRENCY、ATTACHMENT_CAPACITY_BYTES、TRUSTED_PROXY_IPS。

只接受明确的代理 IP。Nginx 必须覆盖外来 X-Real-IP/X-Forwarded-For。容器看到的 Nginx 地址可能是 Docker bridge 网关；在目标机查明该地址后加入 TRUSTED_PROXY_IPS，验证两个客户端被识别为不同 IP。API 只绑定容器回环，Web 仅映射宿主回环，不应开放裸端口到公网。

## Docker Compose

把 deploy/compose.yml、以 .env.example 为基础编辑的 .env 放入独立部署目录。在 .env 中增加 ECHO_IMAGE=ghcr.io/owner/echo-feedback:sha-完整提交SHA，设置 WEB_ORIGIN、初始化密钥和可信代理。首次创建 data 并交给 UID/GID 1000，权限 700。不要使用岁时记数据目录。

```sh
mkdir -p data backups
sudo chown 1000:1000 data
chmod 700 data
docker compose pull
docker compose up -d --wait --wait-timeout 90
```

镜像使用非 root、只读根目录、独立 ./data:/data、最小权限和健康检查。单容器单进程启动 Web/API，迁移成功后才接流量。/api/health/live 检查存活，/api/health/ready 检查数据库和存储可写。

Nginx 示例在 deploy/nginx.conf.example，替换域名、证书并执行 nginx -t。镜像包含服务端 TypeScript 和 tsx。生产输出在 apps/web/dist 和 packages/sdk/dist。

GitHub Verify 验证每次提交；手动 Release image 完整验证后发布 GHCR SHA 镜像。配置实际仓库权限后执行。工作流不自动 SSH 部署服务器。Compose 使用 --wait 等待就绪。

## 备份、升级、回滚

源码运行执行 pnpm data:backup [新的备份目录]。脚本使用 SQLite 一致快照，按快照引用复制不可变附件，附带 manifest；不包含临时上传和日志。目录不能已存在，失败备份不能用于恢复。

正式升级推荐短暂停服成套备份：

```sh
docker compose stop echo
tar -czf backups/echo-before-upgrade.tar.gz data
# 修改 .env 的 ECHO_IMAGE 为目标 SHA，然后：
docker compose pull
docker compose up -d --wait --wait-timeout 90
```

备份包含反馈、联系方式及管理员哈希，应限制访问并保存到可靠介质。

恢复时停止服务，将当前 data 改名保留，恢复整套快照并恢复 UID/GID 1000 权限。脚本备份的 echo.sqlite 和 attachments 放入新 data；旧 WAL/SHM 不能混入恢复目录。不兼容迁移须同时恢复原镜像及完整旧数据。启动后验证登录、反馈数量、图片读取、停用状态；不要仅凭容器健康判断恢复成功。
