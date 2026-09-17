# Neon Singapore 迁移与性能回滚记录

日期：2026-09-17

## 范围与验收

- 验证将 Evidex 数据库从 Neon AWS `us-east-2` 迁移到 AWS `ap-southeast-1`（Singapore）能否显著改善性能。
- 判定标准：两边 compute 预热、同机同代码至少 5 轮；Singapore 的核心接口整体中位数至少改善约 30%，且关键接口不能明显退化。
- 完整保留 `public` schema、扩展、索引、约束、序列和全部业务数据。
- Web/API 与 Worker 必须读取同一个区域的 `DATABASE_URL`。
- 不修改前端接口契约，不在仓库文档中保存数据库口令或连接串。

## 迁移结果

迁移使用源库只读可重复读快照、目标库单事务写入。写入期间仅在目标事务内临时停用用户级业务触发器；外键约束保持启用，提交前恢复全部触发器。为避免 JavaScript 日期对象损失 PostgreSQL 时间戳微秒精度，数据使用数据库生成的带显式类型转换的 INSERT 文本传输。

| 项目          |          源库 | 目标库（提交后） |
| ------------- | ------------: | ---------------: |
| public tables |            59 |               59 |
| indexes       |           157 |              157 |
| constraints   |           709 |              709 |
| sequences     |             0 |                0 |
| rows          |           877 |              877 |
| extensions    | `plpgsql 1.0` |    `plpgsql 1.0` |

提交前和提交后分别对 59 张表执行了行数和整行内容指纹比较，结果全部一致。迁移提交后启动 Worker，新加坡库的 `worker_heartbeat` 从 11 行增加到 12 行，这是切换后的第一条运行时写入，不属于迁移差异。

## 计算规格对照

Neon 控制台逐项核对结果相同：

- PostgreSQL `18.6`；
- pooled endpoint；
- autoscaling `0.25 ↔ 2 CU`（约 1–8 GB RAM）；
- 5 分钟无活动后 scale-to-zero；
- 894 direct / 10,000 pooled connections。

对照期间两个 compute 都为 `ACTIVE`。当前 Vercel 线上请求的 `x-vercel-id` 显示函数执行区为 `iad1`；仓库没有可操作的 Vercel 项目链接或 Worker 托管配置，因此没有把线上计算一并迁到 Singapore。

## 性能对照与结论

同一台开发机、相同代码、两边 compute 预热后，数据库层交替顺序测试结果：

| 项目                              | Singapore 中位数 | US East 2 中位数 | Singapore 相对变化 |
| --------------------------------- | ---------------: | ---------------: | -----------------: |
| reused `select 1`（各 30 轮）     |         486.8 ms |         321.7 ms |             +51.3% |
| published release SQL（各 10 轮） |         486.6 ms |         321.1 ms |             +51.5% |
| overview SQL（各 10 轮）          |         489.3 ms |         324.1 ms |             +51.0% |
| review SQL（各 10 轮）            |         486.7 ms |         320.7 ms |             +51.8% |
| job SQL（各 10 轮）               |         492.7 ms |         341.7 ms |             +44.2% |

真实 API 在每个区域独立启动 Next.js、先完成编译预热，再各跑 5 轮：

| 接口              | US East 2 原始 ms                      | 中位数 | Singapore 原始 ms                           |  中位数 | Singapore 相对变化 |
| ----------------- | -------------------------------------- | -----: | ------------------------------------------- | ------: | -----------------: |
| knowledge summary | 7803.1, 6469.3, 6977.7, 6756.1, 7401.3 | 6977.7 | 10486.1, 10279.7, 10721.5, 11267.5, 12265.8 | 10721.5 |             +53.7% |
| knowledge search  | 5900.6, 3246.7, 3689.4, 3993.4, 3559.0 | 3689.4 | 5139.4, 5188.3, 5988.2, 5771.9, 5108.6      |  5188.3 |             +40.6% |
| ops dashboard     | 3242.2, 4434.0, 3074.4, 3083.7, 3465.5 | 3242.2 | 4776.2, 4269.6, 6047.4, 4980.1, 4435.9      |  4776.2 |             +47.3% |

Singapore 没有达到“至少改善约 30%”，三个关键接口反而全部明显退化，因此最终选择 **US East 2**，不继续使用 Singapore 作为活动数据库。本轮不修改查询、连接池、缓存、任务并发或前端。

## 回滚与冒烟

`.env.local` 中：

- `DATABASE_URL` 已恢复为 US East 2 pooled endpoint；
- `DATABASE_URL_ROLLBACK_US_EAST_2` 已移除；
- `DATABASE_URL_MIGRATION_SINGAPORE` 已在备份和项目删除后移除；
- Web/API 与 `pnpm dev:full` 启动的 Worker 均读取同一份 `.env.local`。

回滚后用 `pnpm dev:full` 启动并检查：

| 接口                                                     | HTTP / app code | 可观察结果                                                                                |
| -------------------------------------------------------- | --------------- | ----------------------------------------------------------------------------------------- |
| `GET /api/v1/knowledge/summary`                          | `200 / 0`       | release `v0.2.0`；2 diseases、2 genes、5 variants、13 associations、20 claims、22 sources |
| `GET /api/v1/knowledge/search?q=EGFR&page=1&pageSize=10` | `200 / 0`       | 4 条结果                                                                                  |
| `GET /api/internal/v1/review-tasks?page=1&pageSize=20`   | `200 / 0`       | 4 条任务                                                                                  |
| `GET /api/internal/v1/question-runs?page=1&pageSize=20`  | `200 / 0`       | 4 条运行记录                                                                              |
| `GET /api/internal/v1/worker/health`                     | `200 / 0`       | `HEALTHY`，`liveWorkerCount=1`                                                            |

美国库的 `worker_heartbeat` 最终为 14 行且产生了新的 `last_seen_at`，证明 Worker 已恢复向活动库写入。21 张核心知识与审核表在美国库和新加坡库之间逐表行数、内容指纹完全一致。

最终复验的第一次 summary 请求遇到 Neon Free compute 冷启动 `CONNECT_TIMEOUT`（HTTP 503）；compute 唤醒后，五个接口在下一轮全部首次通过：summary、search、review tasks、question runs、worker health 均为 `HTTP 200 / app code 0`，Worker 为 `HEALTHY` 且 `liveWorkerCount=1`。

## Singapore 恢复包

- 归档：`/Users/lavender/Desktop/product/evidex-backups/neon-singapore-20260917T111020Z.tar.gz`
- SHA-256：`4f7a394e6fe75d149816aec181460c71975c978911fcebc9c7bb7f9aae35037d`
- 校验文件：同名 `.sha256`
- 内容：12 个 schema migration、`data.sql`、逐表指纹 manifest、恢复说明；59 张表、890 行。

归档已通过 SHA-256 检查，并在 Singapore 项目内新建的临时 PostgreSQL 数据库中执行完整 schema + data 恢复；恢复后的 schema 和 59 张表指纹全部匹配，临时验证数据库随后已删除。

用户完成不可逆删除确认后，Singapore 项目 `evidex-singapore`（ID `weathered-breeze-04873844`）已删除。Neon 项目列表只保留美国区 `evidex`，直接访问已删除项目返回 `project not found`。

## 质量检查

本次是数据库基础设施与本地密钥配置变更，没有新增业务行为测试，也没有人为制造业务 RED。迁移脚本的失败尝试均由目标事务完整回滚，最终成功记录以提交前后逐表指纹一致为准。

- `pnpm verify`：通过；50 个测试文件、423 个测试全部通过，覆盖率总计 96.74% statements / 90.43% branches / 99.52% functions / 97.25% lines。
- `PLAYWRIGHT_CHANNEL=chrome pnpm verify:full`：在不含 `.env*` 的隔离临时副本通过；50 个测试文件、423 个 Vitest 测试、生产构建与 21 个 Playwright 测试全部通过。
