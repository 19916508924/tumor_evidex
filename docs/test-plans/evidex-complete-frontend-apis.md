# Evidex 完整前端 API 验收记录

## 1. 目标

按 `docs/specs/evidex-agent-skill-platform.md` 为完整 Knowledge、Ask 和 Evidence Ops 前端准备可执行接口，不再把范围限制在 Landing Page。

## 2. 可观察验收

### 2.1 公开 Knowledge API

- 疾病、基因、变异和药物支持发布版本锁定的列表、搜索和详情。
- Evidence Claim 与 Source 支持详情和双向追溯。
- 列表支持分页、稳定排序以及适用的疾病、基因、方向和等级筛选。
- 所有实体、关联、Claim、监管记录和来源必须属于同一个已发布版本。
- `LINK_ONLY` 与 `INTERNAL_ONLY` 来源不得公开原文。
- 未知 ID 返回稳定的 `404` 错误协议，非法分页和筛选返回 `400`。

### 2.2 Ask API

- Question Run 创建和轮询使用统一 DTO；所有终态包含知识版本、截止日期、生成时间和免责声明。
- 支持证据问答、治疗比较和监管状态意图；药物上下文必须实际约束返回证据。
- 缺字段、越界、无证据、模型失败和系统失败返回稳定状态。
- 用户可提交帮助度、引用、限制、可理解性和其他反馈；反馈关联 Question Run、回答版本和知识版本。
- 反馈不能修改正式证据；非法分类、非终态问题或未知问题返回稳定错误。

### 2.3 单篇入库与审核 API

- 前端可以检索可用治疗关联，提交 PMID，并取得 Candidate、Workflow、Draft 和 Review Task ID。
- Candidate 和 Review Task 支持列表、筛选、分页及详情。
- 审核人可以用最新版本修改草稿并保留 Agent 原值、修改理由和新版本；旧版本提交返回 `409`。
- 可以请求修改、驳回和幂等批准发布；操作者只来自服务端会话。
- 可重试 Candidate，但不能跳过审核或发布质量门。

### 2.4 Ops、运行和发布 API

- Dashboard 返回时间范围内的漏斗、积压、失败率、重试、人工介入、最近运行、最近发布和告警。
- Discovery Strategy 支持列表、手工触发、暂停和恢复；动作鉴权并记录操作者。
- Discovery Run 支持列表和详情，详情包含节点、版本、耗时、费用、错误摘要和 Candidate。
- Release 支持列表和详情，详情包含成员数量、变更集、审核任务和版本差异。
- Agent、Skill 和 Workflow 目录支持列表、版本、状态、Schema 摘要和最近运行统计。
- 内部接口全部要求 `admin.access`，跨站 Origin 的写请求被拒绝。

### 2.5 契约和兼容

- 统一成功体为 `{ code: 0, message: "ok", data }`，错误体为 `{ code: -1, message, details? }`。
- 列表统一返回 `items` 和 `{ page, pageSize, total, totalPages }`。
- 保留 `GET /api/v1/evidence-options` 与 `POST /api/v1/evidence-answer` 的行为。
- 提供共享 TypeScript DTO，前端不需要复制响应类型。

## 3. 测试路径

- API Surface 测试：目标路由文件和 HTTP 方法完整存在。
- 单元测试：分页、筛选、公开许可、终态元数据、反馈和草稿并发。
- 接口集成测试：公开详情、反馈、内部列表/修改/运行/发布/目录、鉴权和 Origin。
- 数据库测试：迁移、发布版本过滤、反馈持久化、草稿新版本、Discovery 幂等。
- 完整验收：`pnpm verify`、`pnpm verify:full`、隔离 PostgreSQL 数据库测试、真实 Neon 只读烟测。

## 4. RED / GREEN 证据

### RED

- API surface：`pnpm ... test --project node tests/integration/evidence-platform-api-surface.test.ts`，29/29 因目标 route/method 不存在而失败。
- 比较问题：`tests/unit/evidence-platform/natural-language-question.test.ts`，新增双药比较用例 1/7 失败，解析结果尚未包含 `drugs`。
- 路由输入：`tests/integration/evidence-platform-routes.test.ts`，Discovery 非法 JSON 实际返回 500，期望 400；Dashboard 非法时间范围实际返回 200，期望 400。
- 真实 PostgreSQL 回归：新增目录详情断言后，发现没有任何已发布 FDA 有效批准药物的关联仍出现在公开详情中。

### GREEN

- 受影响平台用例：6 个测试文件、68 项全部通过。
- 全仓覆盖率：`pnpm test:coverage`，36 个文件、267 项全部通过；受保护文件总计 statements 97.58%、branches 91.92%、functions 99.59%、lines 98.30%。
- 隔离 PostgreSQL：`tests/database/evidex-database.test.ts`，8/8 通过，覆盖迁移、不可变发布、FDA 准入、公开详情授权、草稿乐观锁、发布事务、反馈幂等和 Discovery 幂等。完整数据库套件曾运行 10/10 通过。
- 实际 Neon：`pnpm db:migrate` 成功应用 `0003_lowly_mordo.sql`；本地 Next 服务对 summary、disease detail、evidence detail、source detail 均返回 HTTP 200 和 `v0.2.0`，未登录 Ops 返回 401。
- 完整验收：在不含开发密钥的隔离副本执行 `PLAYWRIGHT_CHANNEL=chrome pnpm ... verify:full`，类型、lint、格式、测试策略、267 项覆盖率测试、生产构建和 7 项 Chromium E2E 全部通过。

首次隔离构建因 `node_modules` 软链接超出 Turbopack 文件系统根而失败；改为副本内硬链接后，使用同一 `verify:full` 命令完整通过。

## 5. 不在本轮扩大范围

- 不开发前端页面本身。
- 不实现浏览器内 Prompt/代码编辑器。
- 不承诺生产 SLA、企业 SDK、计费或医疗用途。
- 定时器和持久 Worker 可以使用现有部署平台后续接管，但接口必须完整表达任务和恢复状态。
- 当前本地访问美东 Neon 的 Knowledge 冷请求约为十几到数十秒；功能契约已验证，生产部署前还需通过同区部署、读缓存或聚合查询完成延迟预算验收。
