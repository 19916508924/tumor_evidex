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

- `civic-source-adapter.test.ts`：7 个用例通过，覆盖筛选、PMID/EID 合并、游标、限流、授权头、重试和失败分类。
- `discovery-run.test.ts` 与 `process-discovery-run.test.ts`：21 个用例通过；CIViC 只承担发现，PubMed 仍承担原文获取，治疗不匹配不调用抽取模型。
- 路由与组件定向回归通过：CIViC 请求返回来源快照，前端发送 `source: CIVIC`。
- `pnpm test:coverage`：47 个文件、391 个用例通过；新 CIViC 适配器语句 92.3%、分支 93.07%、函数 100%、行 93.51%，达到逐文件门槛。
- `pnpm test:database`：2 个文件、12 个隔离 PostgreSQL 用例通过；CIViC Run 来源可恢复、EID 审计事件持久化且不推进 PubMed cutoff。
- 正式 CIViC GraphQL 只读 smoke：L858R 预览 32 个 Evidence Item，首批 PMID `23982599`、`24868098` 与 EID `2997`、`2994` 经正式适配器解析成功。
- `pnpm verify`：通过类型、Lint 增量门禁、202 个变更文件格式、测试策略、391 个测试和逐文件覆盖率。
- `pnpm verify:full`：在包含当前全部改动且不含开发密钥的隔离副本中通过；Next.js 生产构建成功，Playwright 20/20 通过。当前工作区直接运行按安全规则拒绝读取 `.env.local`，未删除或移动开发密钥。

## 尚需部署后观察

- 试点真实运行的唯一 PMID 数、去重率、Association 精确匹配率、`NEEDS_HUMAN` 比例和每条可审核草稿成本。
- CIViC 上游 Schema 或枚举变化由 fail-closed 校验拦截，但仍需通过 Worker 告警及时处理。
