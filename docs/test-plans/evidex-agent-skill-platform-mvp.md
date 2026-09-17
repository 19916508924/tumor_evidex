# Evidex Agent 与 Skill 平台 MVP 验收记录

## 1. 范围与取舍

本轮按 `docs/specs/evidex-agent-skill-platform.md` 交付一条可运行的后端纵向切片，而不是一次性实现全部运营页面：

- 上游：版本化 Skill Runtime、PubMed 单篇候选接收、去重、结构化草稿、审核乐观锁、批准发布与幂等。
- 下游：发布版本隔离修复、只读知识目录、自然语言问题结构化、锁定发布版本、复用现有 Evidence Pack/生成/引用校验。
- 兼容：保留 `POST /api/v1/evidence-answer` 与 `/api/v1/evidence-options` 的既有请求和响应。
- 暂不包含：每周调度器、持久队列、完整多 Agent 自主编排、Ops/Knowledge/Ask 页面、实体详情/反馈接口和拖拽 Workflow 编辑器。

## 2. 可观察验收

### 2.1 共享 Skill Runtime

1. Skill 定义必须有稳定 ID、版本、种类、允许工具、副作用、超时、重试和状态。
2. 执行前校验输入 Schema，执行后校验输出 Schema；非法结果不能进入下一节点。
3. Agent 只能调用显式允许的 Skill 版本，越权调用失败且不执行处理器。
4. 每次执行生成包含输入/输出哈希、版本、耗时和状态的不可变运行结果。
5. 任意 Skill 都不能声明 `PUBLISH`；发布只能由审核发布服务执行。

### 2.2 上游单篇文献闭环

输入：合法 PMID 和一个已审核的治疗关联 ID。服务端获取 PubMed 元数据/摘要，并通过固定 Evolink 抽取 Workflow 生成符合草稿 Schema 的结果。

正常路径：

1. 首次提交创建一个 Candidate、一个 Workflow Run、一个版本化 Draft 和一个 Review Task。
2. `source_type + external_id`、规范 DOI 或文档哈希任一重复时复用主 Candidate，不创建第二个活动 Workflow。
3. 草稿保存原文段落定位、字段来源、Agent/Skill 版本、建议等级和 QA 问题；状态只能进入草稿/待审核域。
4. 审核人可退回修改或驳回；动作保留结构化原因和审计记录。
5. 审核人以最新草稿版本批准后，在单一事务中创建 patch release；新 Claim 只进入新版本。
6. 相同 `idempotencyKey` 重复批准返回第一次发布结果，不创建第二个版本。

边界与失败：

- 非法 PMID、空摘要、缺少 PRIMARY passage 或未获模型使用许可的草稿被拒绝。
- 旧 `expectedDraftVersion` 返回并发冲突，正式知识不发生变化。
- 发布校验或数据库写入失败时事务全部回滚，旧发布版本仍有效。
- 未批准、已驳回和发布失败的草稿不能通过公开目录或问答检索到。

### 2.3 下游发布隔离与知识目录

1. Release 必须显式记录 Claim 成员；向同一 Association 新增 Claim 不得污染旧 Release 的检索结果。
2. 知识目录默认锁定最新已发布版本，也可按 release version 复现。
3. Summary 返回版本、截止日期及已发布疾病/基因/变异/药物/关联/Claim/来源数量。
4. Search 支持规范名、显示名和别名，稳定排序与分页；未知搜索返回空列表而非模型猜测。
5. 所有目录结果只能由该 Release 的已审核 Association、Claim、FDA 记录及其来源推导。

### 2.4 自然语言循证问答

1. 完整问题解析为受支持 intent 和规范实体，锁定单一发布版本并复用现有结构化回答链路。
2. 治疗证据问题缺少疾病时返回 `NEEDS_CLARIFICATION`，不检索证据、不调用生成模型。
3. 剂量、处方或“最佳治疗”问题返回 `OUT_OF_SCOPE`，不调用生成模型。
4. 未知实体不会近似映射；返回澄清或无证据状态。
5. 已解析但无发布证据时返回 `NO_CURATED_EVIDENCE`。
6. 回答、结构化证据、引用、知识版本、免责声明与现有链路一致；模型失败仍返回 `SUMMARY_UNAVAILABLE`。
7. Question Run 持久化脱敏问题、输入哈希、锁定版本和终态；公开响应不包含 Prompt、内部 Trace、费用或原始模型输出。

### 2.5 兼容回归

- 既有结构化查询的正常、非法、越界、无证据、模型失败和缓存行为不变。
- 数据迁移可在空隔离 Schema 执行，并能为已有 Release 回填 Claim 成员关系。
- 生产密钥不写入源码、测试、README 或日志。

## 3. RED / GREEN 证据

### 基线

- 2026-09-15：`pnpm --config.engine-strict=false dlx pnpm@10.30.3 test -- tests/unit/evidence tests/integration/evidence-answer.test.ts tests/integration/evidence-options.test.ts`
- 结果：24 个测试文件、172 个测试全部通过。

### RED

- 新增 Skill Runtime、上游、目录和自然语言解析测试后运行 `pnpm --config.engine-strict=false dlx pnpm@10.30.3 test --project node tests/unit/evidence-platform`：4 个文件、16 个用例因行为未实现失败。
- 新增审核发布与 PubMed Adapter 测试后运行对应两个测试文件：8 个用例因行为未实现失败。
- 新增平台迁移验收后运行 `tests/database/evidex-database.test.ts`：因平台表不存在失败；实现表后，上游闭环首先在未实现 Repository 处失败 1 个用例。
- 新增 Question Workflow 和 PostgreSQL Question Repository 验收后，分别得到 4 个行为失败和 1 个持久化失败。
- 新增 HTTP 契约后运行 `tests/integration/evidence-platform-routes.test.ts`：5 个路由场景因返回 `501` 失败。
- 补充四类实体列表与审核详情时，同一路由测试按预期出现 2 个 `501`；补充服务端自动抽取、抽取前去重和问题限流时，分别出现 `400 != 201`、`201 != 200`、`202 != 429` 的行为失败。
- 补充并发幂等与来源授权边界后，Question Run 测试因返回本地竞争结果而非数据库胜出结果失败；PubMed 抽取测试因公开授权仍为 `EXCERPT` 而非 `LINK_ONLY` 失败。

### GREEN

- `pnpm --config.engine-strict=false dlx pnpm@10.30.3 test --project node tests/unit/evidence-platform`：9 个文件、42 个用例通过。
- `pnpm --config.engine-strict=false dlx pnpm@10.30.3 test --project node tests/integration/evidence-platform-routes.test.ts`：7 个接口场景通过。
- `pnpm --config.engine-strict=false dlx pnpm@10.30.3 test:coverage`：34 个文件、221 个用例通过；总语句 97.55%、分支 91.78%、函数 99.56%、行 98.24%，所有受保护文件达到逐文件门槛。
- `tests/database/evidex-database.test.ts`：隔离 PostgreSQL 7 个用例通过，包含迁移、约束、旧版本 Claim 隔离、上游发布事务、发布幂等和持久化 Question Run。
- `tests/database/evidex-import.test.ts`：隔离 PostgreSQL 2 个导入用例通过，确认知识包导入同步写入 Release Claim 成员关系。
- `pnpm --config.engine-strict=false dlx pnpm@10.30.3 db:migrate`：真实 Neon 增量迁移成功。
- `pnpm --config.engine-strict=false dlx pnpm@10.30.3 evidex:smoke`：`ANSWERED`、缓存命中、4 个治疗关联、知识版本 `v0.2.0`。
- 新知识目录真实库烟测：版本 `v0.2.0`，返回 2 个疾病、2 个基因、5 个变异、8 个药物、13 个关联、20 条 Claim、22 个来源。
- `pnpm verify`：通过，包含环境、类型、Lint、格式、迁移与知识包策略、221 个测试及覆盖率门槛。
- `pnpm verify:full`：在干净临时工作树通过；生产构建成功，Playwright 7 个浏览器用例全部通过。

## 4. 未在本轮验证的范围

- 定时调度与真实长任务 Worker 的宕机恢复。
- PubMed/PMC 生产速率限制下的连续周任务。
- 真实多 Agent 成本预算和金标准集质量指标。
- Ops、Knowledge 与 Ask 的浏览器页面体验。
