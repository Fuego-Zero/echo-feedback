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

GitHub Verify 验证 push 与 PR；Release image 在同仓库 PR 合入 main 后验证、发布 GHCR SHA 镜像并通过 SSH 部署 DC6。详见下方自动发布配置。Compose 使用 --wait 等待就绪。

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

## DC6 自动发布

目标域名为 `https://echo.fuego.site`，部署目录为 `/data/echo-feedback`，固定 Compose 项目名 `echo-feedback`。域名由 DC6 的 Nginx 反代；容器 Web 监听 8730，宿主仅绑定 `127.0.0.1:8730` 供 Nginx 使用，API 的 8731 不映射，8730 不对公网开放。

### 触发与执行顺序

1. 同仓库功能分支的 PR 合入 main（推荐 Merge commit 或 Squash and merge）触发 Release image。关闭但未合并、直接 push、fork PR 不触发部署。
2. 检出准确的 merge_commit_sha，执行 pnpm verify，构建 linux/amd64 镜像。
3. 对该镜像运行 tests/deploy/docker-smoke.mjs，验证启动、图片权限、重建以及数据库和附件备份恢复。通过后将同一镜像推送为 `ghcr.io/fuego-zero/echo-feedback:sha-<40位SHA>`，不重新构建。
4. SSH 连接 DC6，严格核对主机密钥。使用一次性 Docker 登录目录拉取镜像，不改变服务器其他项目的 GHCR 登录状态。
5. 拉取成功后停止回声写入，将整个 data 目录及旧 Compose、旧 .env 保存到 backups/release-时间-随机值；备份失败恢复旧服务，拉取失败不停止服务。
6. 更新回声专用 Compose 与 .env 中的 ECHO_IMAGE，等待容器就绪，再检查公网 `/api/health/ready`。

工作流串行执行且不取消正在部署的任务；部署前若发现 main 已更新，旧任务只保留 SHA 镜像、不再部署。服务器还有 flock 部署锁。不克隆仓库、不修改岁时记、不自动覆盖 Nginx、不自动发布 npm SDK。

### GitHub Actions Secrets

在 **Fuego-Zero/echo-feedback** 仓库 Settings → Secrets and variables → Actions 配置以下 Repository secrets。岁时记仓库的 Secrets 不会自动继承，也不能通过 GitHub API 读回密钥值；复用时从原安全存储重新配置，不发到聊天或提交到 Git。

| Secret               | 配置                                                       |
| -------------------- | ---------------------------------------------------------- |
| SSH_HOST             | DC6 可达地址，不是必须使用站点域名                         |
| SSH_PORT             | DC6 SSH 端口                                               |
| SSH_USER             | 有 Docker、部署目录写入及调整 UID 1000 权限的部署用户      |
| SSH_PRIVATE_KEY      | 获准用于 DC6 的 SSH 私钥                                   |
| SSH_KNOWN_HOSTS      | 经可信渠道核对的主机公钥记录，不在工作流中临时信任扫描结果 |
| DEPLOY_PATH          | `/data/echo-feedback`；脚本要求目录名为 echo-feedback      |
| COMPOSE_PROJECT_NAME | `echo-feedback`                                            |
| GHCR_USER            | 可读取镜像的 GitHub 用户                                   |
| GHCR_TOKEN           | 只读 read:packages 凭据，用于 DC6 拉取私有镜像             |

Actions 构建推送使用内置 GITHUB_TOKEN 的 packages:write 权限，不使用服务器拉取凭据。需允许仓库 Actions 运行，并确认包权限允许该仓库写入。

### 首次准备

- DC6 安装 Docker、Compose v2（支持 up --wait）、Bash、flock、tar；Actions runner 使用 GitHub 托管 Ubuntu。
- 建立独立 `/data/echo-feedback`，放入权限 600 的生产 .env，WEB_ORIGIN 设置为 `https://echo.fuego.site`；初始化密钥在服务器安全生成。不复制岁时记 .env、数据库或附件。
- data 目录归属 UID/GID 1000，权限 700。不要使用指向其他产品的符号链接；备份包含敏感数据，由部署用户私有保管并另行异地备份。
- DNS 指向 DC6，Nginx 配置 echo.fuego.site 的 HTTPS 证书与到 `127.0.0.1:8730` 的代理。在 DC6 实际配置基础上追加该域名，不覆盖已有其他域名；模板见 nginx.conf.example，证书路径须按实机替换。修改后 nginx -t，通过后 reload。
- TRUSTED_PROXY_IPS 填容器实际看到的可信 Nginx 地址（可能为 Docker bridge 网关），不能凭示例猜测。
- 首次上线通过 PR 合入包含完整应用及本工作流的 main；本地配置完成、远端 Secrets 已配置和首次远端运行成功是不同状态，需分别确认。

### 失败与回滚

部署脚本只在镜像拉取、成套备份成功后切换。新容器不能就绪时停止失败服务并保留备份，不擅自把旧程序运行在已经迁移的数据上；公网检查失败也会标记任务失败，但不会因此改动 Nginx 或回滚数据库。

手动在 main 运行 Release image，image_sha 填已发布的 40 位 SHA；仅部署对应已有镜像，不重新构建，使用目标版本 Compose。仅当数据库兼容时直接这样回滚。若迁移不兼容，先停服务，将当前 data 留存，再从选定备份 data.tar.gz 恢复数据库及附件，恢复相应 .env/Compose 与权限，再启动旧镜像。备份目录不自动清理，应制定保留周期。

本流程不生成 GitHub Release 或 npm 包，不创建 latest 或可覆盖的版本号标签；部署始终锁定提交 SHA。
