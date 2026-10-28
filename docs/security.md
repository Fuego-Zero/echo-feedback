# 接口与安全边界

## 数据与身份

用户填写 content（1–2000 字符）、images（0–3 张，每张 5 MiB）、contact（0–200 字符）。宿主可传 userId（128）、projectVersion（64），SDK 打开时读取 origin + pathname（2048）。服务端再次清理地址。非 HTTP(S) 地址留空。

严格 Schema 拒绝额外字段，不采集标题、Cookie、Token、控制台、网络、自动截图。IP 仅用于内存限流，不写入反馈档案。保存 UTC 毫秒时间；单管理员管理所有项目。反馈及图片默认持续保存，首版不含删除与 AK 轮换。

AK 不是秘密或身份认证。只用于查找项目；只有管理会话可以读取反馈和附件。允许网页 Origin 精确匹配，列表为空允许任意有效 HTTP(S) Origin。扩展开关默认关闭；开启允许扩展 Origin、缺失或 null Origin。该开关不验证扩展身份，CORS 不是防刷边界。

## API

| 方法与路径                                            | 职责                                          |
| ----------------------------------------------------- | --------------------------------------------- |
| GET /api/setup/status                                 | 是否需要初始化，不返回密钥                    |
| POST /api/setup/admin                                 | 一次性密钥创建唯一管理员                      |
| POST /api/auth/login、/logout                         | 登录与注销                                    |
| GET /api/auth/session                                 | 当前会话                                      |
| PUT /api/auth/password                                | 校验旧密码，改密并撤销全部会话                |
| GET/POST /api/admin/projects                          | 项目列表、创建                                |
| PATCH /api/admin/projects/:id                         | 完整项目配置：名称、说明、开关、Origins、扩展 |
| GET /api/admin/feedback                               | projectId/status/page/pageSize 筛选与分页     |
| GET/PATCH /api/admin/feedback/:id                     | 详情、状态与内部备注（5000 字符）             |
| GET /api/admin/feedback/:id/attachments/:attachmentId | 会话、反馈和附件关联校验                      |
| POST /api/public/projects/:ak/feedback                | 匿名 multipart 提交                           |

提交先附名为 metadata 的 JSON 字段，随后为零至三个 images 文件，HTTP 头 Idempotency-Key 使用 UUID。成功仅返回 { receipt }；失败返回 { code, requestId }。同项目相同键与规范化内容返回原回执；不同内容 409。停用项目连重试也拒绝，已有反馈仍可处理。

管理写请求 Origin 必须等于 WEB_ORIGIN。scrypt 密码哈希、数据库会话 Token 哈希；生产 Cookie 为 Secure/HttpOnly/SameSite=Lax。无默认密码、公开注册或开发免登录。

## 图片与资源

私有目录不挂静态路由，无独立匿名上传或公开下载。检验大小、实际格式、静态图片、解码结果和 2000 万像素上限。Sharp 校正方向，移除元数据，最长边 4096，WebP 质量 85，再检查 5 MiB 上限。只保留转换结果。

总请求 16 MiB，文件/字段/parts 和超时另有限制；反代流式转发。全部处理成功后先落文件，再以事务关联，事务再次检查采集开关、唯一键和容量。失败清理本请求文件；超过 24h 无引用残留在启动和每小时清理。

默认图片解码并发 2，附件总配额 1 GiB。配额是正式附件配额，临时上传还需要空余空间；生产应监控磁盘。IP 30 次/分钟、IP+项目 5 次/分钟，登录等敏感接口 10 次/分钟。拒绝返回 429 与 Retry-After，计数重启重置。公开端点仍可能被滥用，不承诺抵御分布式攻击。

日志只投影资源 ID、操作、状态、耗时与错误码，JSONL 按天保留 14 天，不序列化请求或异常对象。后台按纯文本展示；图片读取返回 nosniff 和 private, no-store。
