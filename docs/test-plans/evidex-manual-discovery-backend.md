# Evidex 人工知识更新后端验收记录

## 范围

本轮只交付后端和前端所需接口，不修改产品前端页面。实现范围包括：Discovery Preview、幂等创建、持久 PostgreSQL 队列、独立 Worker、分页与游标、跨查询去重、运行级 50/100/全部上限、暂停/继续/取消、指数退避/死信、Candidate durable retry，以及受 Skill Runtime 治理的抽取、独立建议等级与 QA。下游补充发布目录驱动的问题理解、持久 Question Job、下游 Workflow Run、真实 Skill Trace 和前端可轮询的实际阶段。

明确不包含每周/Cron 调度、自动发布、开放式自主 Agent、企业配额/SLA。

## 可观察验收

1. Preview 输入为全库或规范疾病/基因/变异 ID 范围、50/100/全部和可选时间窗；输出规范快照、子查询、预估数量、警告、哈希和 15 分钟用户绑定 Token，且不创建 Run/Candidate、不调用抽取模型。
2. 创建 Run 必须验证 Token 与幂等键，返回 HTTP 202；同一规范计划重复创建复用原 Run。
3. Run、子查询游标、唯一文献进度和任务均持久化；Worker 锁过期后可恢复，失败指数退避，耗尽重试进入死信并同步业务状态。
4. 50/100 上限在全部子查询合并且 PMID 去重后执行；`ALL` 用稳定分页处理到来源耗尽。
5. pause/resume/cancel 更新 Run 与队列状态，Worker 每页前重新读取控制状态。
6. 新文献依次执行 `extract_evidence_claims`、`propose_evidence_level`、`validate_draft_completeness`；强制 Schema、allowlist、超时、最大重试和 Trace。
7. 新文献等级不复制旧 Association 等级；草稿完成后 Workflow 为 `NEEDS_HUMAN`，只有人工批准才能发布。
8. Candidate retry 写入同一持久队列，成功产生新 Draft 版本，重复完成请求幂等。
9. 旧单策略 trigger 返回 HTTP 410，引导前端使用 Preview；无每周或 Cron 调度。
10. 自然语言实体只从锁定的发布目录解析；目录新增实体不需要修改解析代码，未知或歧义实体不做近似映射。
11. 创建 Question Run 时在同一事务内创建下游 Workflow Run 和 `QUESTION_RUN` Job；并发幂等提交只产生一个 Run。
12. Worker 可恢复锁超时后的 `RUNNING` Question Run，并真实执行问题规范化、检索规划、Evidence Pack、证据分析、回答生成和引用校验 Skill。
13. 公开轮询阶段来自当前 Workflow Step；内部接口可以查看 Workflow、Step、Artifact 和版本哈希，公开接口不泄露内部 Prompt 或原始模型输出。

## RED 证据

- `discovery-run.test.ts`：首轮 3/3 因 Preview/确认未实现失败。
- API surface：新增 5 个路由契约首轮 5/5 失败。
- `pubmed-source-adapter.test.ts`：分页预览因 `NOT_IMPLEMENTED` 失败。
- `persistent-worker.test.ts`：持久领取、完成和失败恢复首轮 3/3 失败。
- `process-discovery-run.test.ts`：持久分页处理首轮 2/2 失败。
- `candidate-retry.test.ts`：治理式重试首轮 2/2 失败。
- Skill Runtime：重试用例失败、超时用例挂起；实现超时与最大尝试后转绿。
- 独立判级/Trace：2 个用例因仍复制历史等级/缺真实节点 Trace 失败。
- 隔离 PostgreSQL：新增队列/死信断言失败，并暴露 0004 外键错误指向 `public` 及任务创建/领取时钟不一致。
- 首次将新增模块加入覆盖范围：319 个行为用例通过，但 4 个新增文件未达到逐文件覆盖门槛，质量门槛按预期失败。
- 下游目录扩展用例：加入已发布的 `ALK` 融合后仍返回 `NEEDS_CLARIFICATION`，证明问题解析仍依赖旧硬编码目录。
- Question API 路由用例：创建成功后仍触发进程内调度回调，没有形成可由独立 Worker 恢复的持久任务。
- stale job 恢复用例：队列锁过期后重新领取，但已标记 `RUNNING` 的 Question Run 没有继续执行。
- 隔离 PostgreSQL 首轮：旧问题样例不属于锁定发布目录而正确返回澄清，且未消费的 Question Job 影响后续队列断言；调整为由真实 Worker 顺序消费后验证通过。
- 公开轮询契约：新增所有状态都必须返回中英文免责声明的路由断言后，首轮 1/15 按预期失败；提升为顶层稳定字段后转绿。

## GREEN 证据

- 下游与 API 定向回归：6 个文件、88 个用例通过，覆盖目录解析、Question 状态机、Worker 分发、回答 Skill 与全部路由契约。
- `pnpm test:coverage`：44 个文件、322 个用例通过；总语句 97.46%、分支 92.08%、函数 99.35%、行 98.07%，所有受保护文件达到逐文件门槛。
- API route 集成：15 个场景通过；API surface 34 个路由契约通过。
- TypeScript：`pnpm typecheck` 通过。
- `pnpm test:database`：2 个文件、12 个真实 PostgreSQL 用例通过；包含空 schema 迁移、外键/不可变约束、旧 Release 隔离、持久 Discovery/Question Run、下游 Workflow Step、恢复、Candidate retry/死信、知识包导入幂等与冲突回滚。
- `pnpm db:migrate`：真实 Neon `public` schema 成功应用 0005/0006；`question_run.workflow_run_id`、`QUESTION_RUN` 队列类型、3 个新增 ACTIVE Skill 和 7 步 `evidence-question-v1` 定义均已只读核验。
- `pnpm evidex:worker -- --once`：真实 Neon 空队列启动、领取检查并正常退出。首次运行复现 CJS 顶层 `await` 启动失败，改为显式 `main()` 后转绿。
- 真实 Question Run 纵向 smoke：在 Neon `v0.2.0` 创建问题后由独立 Worker 领取，Job 为 `SUCCEEDED`、Question Run 为 `ANSWERED`、Workflow 为 `SUCCEEDED/completed`；只读核验得到 7 个唯一 Step 和 7 个 Artifact。
- `pnpm verify`：通过；类型、Lint、158 个变更文件格式、测试策略、322 个测试与逐文件覆盖率门槛全部通过。第一次全并发覆盖率运行有 1 个既有前端组件用例超过默认 5 秒；单文件 8/8 通过后，完整命令重跑退出码为 0。
- 隔离无密钥工作区执行 `pnpm verify:full`：整体退出码为 0，Next.js 生产构建成功，Playwright 8/8 通过。本轮第一次副本未带 `.git`，变更文件检查无法确定基准；补入只读 Git 元数据后同一命令转绿。依赖使用 copy-on-write 副本，避免符号链接越过 Turbopack 根目录。

完整验收已完成。真实工作区因安全规则保留 `.env.local`，构建/E2E 在包含当前代码但不含密钥的隔离 Git 工作区执行。

## 恢复方案

0004 只新增队列/游标表和 Discovery Run 字段，并停用旧策略的调度字段；0005 仅扩展任务类型约束；0006 仅增加 Question Run 到 Workflow Run 的可空外键并登记下游 Skill/Workflow 定义。三者都不删除医学知识数据。应用可回退旧版本并保留新增表。若 Worker 发布了新知识 patch release，不删除 Release 成员表；通过部署旧应用版本停止新链路，保留审计与版本历史。
