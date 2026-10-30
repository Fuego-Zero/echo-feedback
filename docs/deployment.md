# 配置、部署和恢复

## 配置

完整字段见根 .env.example。pnpm env:init 只在不存在时创建 .env，生成随机初始化密钥，不输出密钥。

关键配置：WEB_ORIGIN（公开 HTTPS Origin）、DATA_DIR、SETUP_TOKEN（首次初始化至少 32 字符）、WEB_PORT/API_PORT、SESSION_TTL_SECONDS（默认 30 天）、限流、IMAGE_CONCURRENCY、ATTACHMENT_CAPACITY_BYTES、TRUSTED_PROXY_IPS。

只接受明确的代理 IP。Nginx 必须覆盖外来 X-Real-IP/X-Forwarded-For。容器看到的 Nginx 地址可能是 Docker bridge 网关；在目标机查明该地址后加入 TRUSTED_PROXY_IPS，验证两个客户端被识别为不同 IP。API 只绑定容器回环，Web 仅映射宿主回环，不应开放裸端口到公网。

## Docker Compose

把 deploy/compose.yml、以 .env.example 为基础编辑的 .env 放入独立部署目录。在 .env 中增加 ECHO_IMAGE=ghcr.io/fuego-zero/echo-feedback:0.1.0（替换为已发布版本），设置 WEB_ORIGIN、初始化密钥和可信代理。首次创建 data 并交给 UID/GID 1000，权限 700。不要使用岁时记数据目录。

```sh
mkdir -p data backups
sudo chown 1000:1000 data
chmod 700 data
docker compose pull
docker compose up -d --wait --wait-timeout 90
```

镜像使用非 root、只读根目录、独立 ./data:/data、最小权限和健康检查。单容器单进程启动 Web/API，迁移成功后才接流量。/api/health/live 检查存活，/api/health/ready 检查数据库和存储可写。

服务镜像版本来自根目录 `package.json` 的 `version`，使用 `主版本.次版本.修订号`，例如 `0.1.0`。每次发布新服务版本前更新该字段，避免覆盖已有版本。SDK 在 `packages/sdk/package.json` 中独立管理版本。

自动部署从 GHCR 拉取 `ghcr.io/fuego-zero/echo-feedback:0.1.0` 后，将同一镜像添加为本地 `echo-feedback:0.1.0` 标签并写入 `.env` 的 ECHO_IMAGE，使 `docker ps` 的 IMAGE 列保持简洁。服务器 `.deployed-image` 和备份的 `target-image` 保留完整 GHCR 版本引用。

如果 `.env` 中已使用本地版本标签，日常重启使用 `docker compose up -d --pull never --wait --wait-timeout 90`。本地标签不能直接 `docker compose pull`；换机或手动升级时，先从 GHCR 拉取目标版本并以 `docker tag` 添加相应本地版本标签，或按上面的方式将 ECHO_IMAGE 改为完整 GHCR 引用后拉取。

Nginx 示例在 deploy/nginx.conf.example，替换域名、证书并执行 nginx -t。镜像包含服务端 TypeScript 和 tsx。生产输出在 apps/web/dist 和 packages/sdk/dist。

GitHub Verify 验证 push 与 PR；Release image 在同仓库 PR 合入 main 后验证、发布 GHCR 版本镜像并通过 SSH 部署 DC6。详见下方自动发布配置。Compose 使用 --wait 等待就绪。

## 备份、升级、回滚

源码运行执行 pnpm data:backup [新的备份目录]。脚本使用 SQLite 一致快照，按快照引用复制不可变附件，附带 manifest；不包含临时上传和日志。目录不能已存在，失败备份不能用于恢复。

正式升级推荐短暂停服成套备份：

```sh
docker compose stop echo
tar -czf backups/echo-before-upgrade.tar.gz data
# 修改 .env 的 ECHO_IMAGE 为目标版本的完整 GHCR 引用，然后：
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
3. 对该镜像运行 tests/deploy/docker-smoke.mjs，验证启动、图片权限、重建以及数据库和附件备份恢复。通过后读取根目录 package.json 的 version，将同一镜像推送为 `ghcr.io/fuego-zero/echo-feedback:<版本号>`，不重新构建，不使用 SHA 标签。
4. SSH 连接 DC6，严格核对主机密钥。使用一次性 Docker 登录目录拉取镜像，并添加本地 `echo-feedback:<版本号>` 标签，不改变服务器其他项目的 GHCR 登录状态。
5. 拉取和添加标签成功后停止回声写入，将整个 data 目录及旧 Compose、旧 .env 保存到 backups/release-时间-随机值；备份失败恢复旧服务，拉取或添加标签失败不停止服务。
6. 更新回声专用 Compose 与 .env 中的 ECHO_IMAGE 为本地版本标签；使用 `--pull never` 从本地镜像启动，等待容器就绪，再检查公网 `/api/health/ready`。完整 GHCR 引用继续保存在部署记录和备份中。

工作流串行执行且不取消正在部署的任务；部署前若发现 main 已更新，旧任务只保留版本镜像、不再部署。服务器还有 flock 部署锁。不克隆仓库、不修改岁时记、不自动覆盖 Nginx、不自动发布 npm SDK。

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

Actions 构建推送使用内置 GITHUB_TOKEN 的 packages:write 权限；部署任务使用独立的 packages:read 短期 GITHUB_TOKEN，通过标准输入在 DC6 一次性 Docker 配置目录登录，任务结束清除。无需另配长期 GHCR_TOKEN 或 GHCR_USER Secret。需允许仓库 Actions 运行，并确认包权限允许该仓库写入。

### 首次准备

- DC6 安装 Docker、Compose v2（支持 up --wait）、Bash、flock、tar；Actions runner 使用 GitHub 托管 Ubuntu。
- 建立独立 `/data/echo-feedback`，放入权限 600 的生产 .env，WEB_ORIGIN 设置为 `https://echo.fuego.site`；初始化密钥在服务器安全生成。不复制岁时记 .env、数据库或附件。
- data 目录归属 UID/GID 1000，权限 700。不要使用指向其他产品的符号链接；备份包含敏感数据，由部署用户私有保管并另行异地备份。
- DNS 指向 DC6，Nginx 配置 echo.fuego.site 的 HTTPS 证书与到 `127.0.0.1:8730` 的代理。在 DC6 实际配置基础上追加该域名，不覆盖已有其他域名；模板见 nginx.conf.example，证书路径须按实机替换。修改后 nginx -t，通过后 reload。
- TRUSTED_PROXY_IPS 填容器实际看到的可信 Nginx 地址（可能为 Docker bridge 网关），不能凭示例猜测。
- 首次上线通过 PR 合入包含完整应用及本工作流的 main；本地配置完成、远端 Secrets 已配置和首次远端运行成功是不同状态，需分别确认。

### 失败与回滚

部署脚本只在镜像拉取、成套备份成功后切换。新容器不能就绪时停止失败服务并保留备份，不擅自把旧程序运行在已经迁移的数据上；公网检查失败也会标记任务失败，但不会因此改动 Nginx 或回滚数据库。

手动在 main 运行 Release image，image_sha 填目标版本对应的 40 位源码 SHA。工作流从该提交读取 package.json 的 version 和 Compose，仅部署对应已有版本镜像，不重新构建；SHA 用于定位源码，不作为镜像标签。仅当数据库兼容时直接这样回滚。若迁移不兼容，先停服务，将当前 data 留存，再从选定备份 data.tar.gz 恢复数据库及附件，恢复相应 .env/Compose 与权限，再启动旧镜像。旧流程发布的 SHA 镜像不适用新版自动回滚；需要使用相应备份的 .env/Compose 手动恢复。备份目录不自动清理，应制定保留周期。

本流程不生成 GitHub Release 或 npm 包，不创建 latest 标签。服务镜像统一使用根目录 package.json 的版本号，发布前需确保版本号唯一；手动发布权限应限制在可信维护者范围内。

## DC6 镜像自动保留

回声使用独立的 `echo-feedback-image-retention.timer`，每 5 分钟检查一次，与其他服务错开执行。脚本源码为 `scripts/echoImageRetention.py`，服务器安装路径为 `/usr/local/sbin/echo-feedback-image-retention.py`；对应 service、timer 源文件位于 `deploy/`，安装到 `/etc/systemd/system/`。任务不依赖服务器上的源码仓库或临时目录，兼容 DC6 的 Python 2.7。

仅管理 `ghcr.io/fuego-zero/echo-feedback` 和 `echo-feedback` 两个镜像仓库，支持既有 SHA 标签与正式版本标签。回声容器必须属于 `echo-feedback` Compose 项目、部署目录必须是 `/data/echo-feedback`，并健康运行至少 5 分钟。保留当前镜像及状态记录中的上一成功镜像；回滚时也保留刚离开的成功镜像。所有容器（含停止的容器）引用的镜像、带其他仓库标签或摘要的镜像、可能正在部署的新镜像都会受到保护。

任务与部署脚本共用 `/data/echo-feedback/.deploy.lock`，并持有自己的清理锁。删除前逐一重新检查容器和镜像引用，只执行限定标签的 `docker image rm --no-prune`，不强制删除、不做全局 prune、不删除容器、卷、数据库、附件或备份。

首次安装需从成功部署记录及备份确认上一成功版本，创建权限 700 的 `/var/lib/echo-feedback-image-retention`，将当前和上一成功镜像的完整镜像 ID 写入权限 600 的 `state.json`，格式为 `{"schema":1,"current":"sha256:当前镜像ID","rollback":"sha256:上一成功镜像ID"}`。不根据构建时间猜测成功版本，缺少可信状态时跳过清理。状态目录应保留，不随应用发布替换。

安装后先预览，再启动清理和定时任务：

```sh
python -B /usr/local/sbin/echo-feedback-image-retention.py
systemctl daemon-reload
systemctl start echo-feedback-image-retention.service
systemctl enable --now echo-feedback-image-retention.timer
systemctl list-timers echo-feedback-image-retention.timer
journalctl -u echo-feedback-image-retention.service -n 30 --no-pager
```

相同部署完成清理后重复执行会跳过，避免持续扫描。规则测试在仓库根目录执行 `python -B tests/deploy/imageRetentionTest.py`。本任务只清理 DC6 本地镜像，不删除 GHCR 的镜像版本。
