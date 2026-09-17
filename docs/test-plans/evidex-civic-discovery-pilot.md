# Evidex CIViC 候选发现试点验收记录

## 范围

本试点把 CIViC 作为人工 Discovery Run 的候选发现来源，不把 CIViC 内容直接发布为 Evidex 证据。范围固定为现有 NSCLC、CRC 与 5 个变异；后续正文、去重、抽取、QA 和人工审核仍使用现有 PubMed 链路。

## 可观察验收

1. Ops 可显式选择 PubMed 或 CIViC；预览 Token 和持久 Run 快照保存来源。
2. CIViC 只查询 `ACCEPTED + PREDICTIVE + PUBMED` Evidence Item，并在客户端再次校验。
3. 只接受试点疾病/变异矩阵；错误疾病、错误基因和非 PubMed 来源不会形成候选。
4. 同一 PMID 的多个 EID 合并为一个候选，同时保留各 EID 的查询和证据元数据。
5. 分子谱标记为精确、集合包含、复合或其他；只有精确分子谱且治疗覆盖当前 Association 时才继续抽取，其余进入 `NEEDS_HUMAN`。
6. 候选始终重新获取 PubMed 原文，并沿用现有 PMID/DOI/文档哈希去重。
7. CIViC 预览显示 Evidence Item 估算说明，不宣称是唯一文献数；CIViC 不使用 PubMed 时间窗。
8. 429、5xx 和网络失败有限重试；游标绑定查询范围；共享限流不依赖单进程内存。
9. EID、治疗、CIViC Level/Direction/Significance、查询范围和检索时间写入平台审计事件；CIViC 成功运行不推进 PubMed cutoff。
10. 现有 PubMed Discovery 行为、正式发布边界和人工审核要求保持不变。

## RED 证据

- `civic-source-adapter.test.ts`：首轮因适配器未实现而 4/5 失败；补齐有效响应后，错误疾病过滤用例仍按预期失败。
- `discovery-run.test.ts`：CIViC 预览仍调用 PubMed，新增来源路由用例失败。
- `process-discovery-run.test.ts`：CIViC Run 仍调用 PubMed Search；治疗不匹配时仍触发两次模型抽取。
- `evidence-platform-routes.test.ts`：严格请求 Schema 首轮以 HTTP 400 拒绝 `source: CIVIC`。
- `evidex-product-frontend.test.tsx`：首轮找不到 CIViC 来源选择控件。
- 首次全量覆盖率：389 个行为用例通过，但新适配器逐文件语句/行/函数/分支均未达到仓库门槛。

## GREEN 证据

- `civic-source-adapter.test.ts`：8 个用例通过，覆盖筛选、PMID/EID 合并、终页保留 `endCursor`、游标、限流、授权头、重试和失败分类。
- `discovery-run.test.ts` 与 `process-discovery-run.test.ts`：21 个用例通过；CIViC 只承担发现，PubMed 仍承担原文获取，治疗不匹配不调用抽取模型。
- 路由与组件定向回归通过：CIViC 请求返回来源快照，前端发送 `source: CIVIC`。
- `pnpm test:coverage`：47 个文件、391 个用例通过；新 CIViC 适配器语句 92.3%、分支 93.07%、函数 100%、行 93.51%，达到逐文件门槛。
- `pnpm test:database`：2 个文件、12 个隔离 PostgreSQL 用例通过；CIViC Run 来源可恢复、EID 审计事件持久化且不推进 PubMed cutoff。
- 正式 CIViC GraphQL 只读 smoke：L858R 预览 32 个 Evidence Item，首批 PMID `23982599`、`24868098` 与 EID `2997`、`2994` 经正式适配器解析成功。
- `pnpm verify`：通过类型、Lint 增量门禁、202 个变更文件格式、测试策略、391 个测试和逐文件覆盖率。
- `pnpm verify:full`：在包含当前全部改动且不含开发密钥的隔离副本中通过；Next.js 生产构建成功，Playwright 20/20 通过。当前工作区直接运行按安全规则拒绝读取 `.env.local`，未删除或移动开发密钥。

## 2026-09-17 真实试跑

- 范围：`NSCLC + EGFR p.L858R`，CIViC 来源，上限 50；预览得到 32 个 Evidence Item。
- 第一条 Run `bec9bdba-fb4d-4c3e-b49f-19c0735ab8af` 暴露正式 GraphQL 终页仍返回非空 `endCursor`，原适配器错误地把它判为无效响应；5 次有限重试后进入 Dead Letter，没有创建 Candidate 或发布数据。
- 回归用例先复现 `hasNextPage=false + endCursor="MQ"` 的失败，再放宽为接受 GraphQL 合法终页，同时仍要求有下一页时必须存在有效 cursor；定向测试由失败变为 8/8 通过。
- 修复后重新发起 Run `64d46047-9706-4c82-8b6f-5449581955c8`：32 个 EID 合并为 29 个唯一 PMID，29/29 均完成 PubMed 回源并落库，查询页标记 exhausted，自动发布 0。
- 其中 26 个因 CIViC 治疗或分子谱未精确覆盖当前 Afatinib Association 进入 `NEEDS_HUMAN`；另 3 个精确 Afatinib EID 因 PubMed 可用文本未找到精确 L858R 目标而进入 `NEEDS_HUMAN`。当前计数模型把上述治理分流记为 failed，因此 Run 汇总状态为 `FAILED`，但没有系统级候选处理错误。

## 2026-09-17 关联级转化与 29 篇回放

### 新增验收

1. CIViC PMID 不再只绑定 Discovery Strategy 预选的单个治疗，而是按疾病、精确变异和治疗集合匹配全部现有 `APPROVED` Association。
2. 治疗匹配同时识别通用名、展示名、商品名和别名；联合治疗要求一一精确匹配，不接受子集覆盖。
3. 同一 PMID 可以复用一个 Candidate Document，生成多个 Association 专属 Workflow、Evidence Draft 和 Review Task；全局草稿版本递增。
4. 同一 PMID 与 Association 重复提交保持幂等，且在抽取模型调用前检查，避免重复模型费用。
5. 许可为 `PMC_FULL_TEXT` 的全文参与疾病、基因和精确变异筛选；无许可全文仍只使用摘要。
6. 未知治疗、非精确分子谱、缺少精确变异文本或没有现有批准 Association 的记录继续进入 `NEEDS_HUMAN`；不自动创建医学关系，不自动发布。

### RED / GREEN 证据

- RED：定向执行 25 个用例时新增 4 个行为用例失败，分别覆盖关联级复用、关联级幂等、许可全文筛选和一个 PMID 多 Association 分流。
- GREEN：补齐边界分支后，`upstream-workflow.test.ts` 7/7、`screen-evidence-eligibility.test.ts` 4/4、`process-discovery-run.test.ts` 18/18 通过。
- `pnpm verify`：49 个文件、418 个用例通过；`process-discovery-run.ts` 语句 93.61%、分支 82.8%、函数 100%、行 96.61%，`upstream-workflow.ts` 语句 94.82%、分支 87.5%、函数 100%、行 96.22%。
- 隔离 PostgreSQL 套件显示 11/11 业务用例通过，新增用例验证一个 Candidate 下两个 Association 草稿的版本为 1/2，且第二次关联级提交返回同一草稿；远程测试库在用例结束后的连接清理阶段无输出等待，外层命令被人工中止并清除了遗留的隔离测试 schema。

### 真实回放结果

- Run：`dca0b3e4-e50d-4d5f-99c9-b56c53103902`；32 个 CIViC Evidence Item 合并为 29 个唯一 PMID，29/29 均完成处理；持久 Job 一次成功、无重试，Run 为 `PARTIAL_SUCCESS` 且系统错误码为空。
- 2 篇生成 Evidex 待审草稿，27 篇保留 `NEEDS_HUMAN`，自动发布 0：
  - PMID `18509184` → `assoc_nsclc_egfr_l858r_gefitinib`，摘要来源，2 条 Claim，建议等级 `3B`。
  - PMID `26515464` → `assoc_nsclc_egfr_l858r_afatinib`，许可 PMC 全文来源，1 条临床前 Claim，建议等级 `4`。
- 27 篇人工复核原因：22 篇没有可精确映射的现有治疗 Association，5 篇匹配到现有 Association 但 PubMed 允许使用的文本未找到精确 L858R。
- 两个草稿均有独立 `READY_FOR_REVIEW` Review Task 和非阻断 QA Warning；其中全文草稿仍带模型生成的 `ABSTRACT_ONLY` 警告，需审核员纠正该不一致后再决定是否发布。

## 尚需部署后观察

- 更多疾病/变异真实运行的唯一 PMID 数、去重率、Association 精确匹配率、`NEEDS_HUMAN` 比例和每条可审核草稿成本。
- 长任务期间 Worker 不刷新心跳，超过两分钟会被健康接口暂时显示为非 live，需补充运行中续租或独立心跳。
- `NEEDS_HUMAN` 与真正处理失败共用 failed 计数，导致“全部安全转人工”的 Run 汇总为 `FAILED`；后续应拆分治理结果与系统错误。
- CIViC 上游 Schema 或枚举变化由 fail-closed 校验拦截，但仍需通过 Worker 告警及时处理。
