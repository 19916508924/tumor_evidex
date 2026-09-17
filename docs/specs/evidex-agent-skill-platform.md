# Evidex Agent 与 Skill 平台产品及开发规格

| 项目     | 内容                                                               |
| -------- | ------------------------------------------------------------------ |
| 文档状态 | Draft，可进入需求评审与技术拆解                                    |
| 文档日期 | 2026-09-17                                                         |
| 适用范围 | Evidex 上游知识生产、人工审核、知识发布、知识浏览与下游循证问答    |
| 当前基线 | V0.2 已发布知识库、结构化检索、Evidence Pack、受约束生成与引用校验 |
| 目标版本 | V1 Agent & Skill Platform                                          |
| 主要读者 | 产品、前端、后端、AI 工程、测试、医学审核人员                      |

## 1. 文档目的

本文档将 Evidex 后续建设统一为一套可审计的 Agent 与 Skill 平台，并分别说明两条核心链路的前端和后端开发任务：

1. **上游知识生产链路**：知识运营人员在页面上主动发起一次知识更新任务，系统按全库或指定疾病、基因、变异范围检索文献，经多 Agent 处理后生成待审核证据；人工批准后，证据进入正式知识库并形成新的不可变知识版本。
2. **下游知识消费链路**：用户从疾病、基因、变异、药物等维度浏览已发布知识，或提出自然语言临床证据问题；系统只基于已审核、已发布证据生成带引用的回答。

本文档描述目标产品、领域边界、页面、接口、状态、数据、失败行为、开发阶段和验收要求，不替代现有的证据等级与 V0 后端规则。医学证据定义、传播规则和数据字段仍以 [`evidex-v0-backend.md`](./evidex-v0-backend.md) 为基础；若后续修改医学口径，必须单独评审并同步更新两份文档。

### 1.1 本次规格变更与整改范围（2026-09-16）

> **本节为本轮开发的必读入口。** 新的产品决策是：暂不建设每周自动调度，改为由内部用户在 Evidence Ops 主动发起一次知识更新任务。任务启动后仍必须由后台持久执行，不应依赖用户保持页面打开。

本次需要修改的内容按优先级列出如下：

| 优先级 | 整改主题              | 本次要求                                                                                                                                                             |
| ------ | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1     | 人工发起知识更新      | 新增“发起知识更新”入口；支持全库或按疾病、基因、变异限定范围；支持 50、100 或全部匹配文献。                                                                          |
| P1     | 长任务可靠性          | 即使不做定时调度，仍需使用持久任务和 Worker，支持分页、游标、断点续跑、限流、重试、暂停和失败恢复。                                                                  |
| P1     | 审核闭环              | 增加审核任务列表和可达入口；修复退回必填字段和拒绝必填原因；决策成功后刷新状态并防止重复操作。                                                                       |
| P1     | 真实 Agent/Skill 执行 | 生产 Workflow 必须经过 Skill Runtime，落实 allowlist、Schema、超时、重试、失败 Trace 和人工 handoff；不再只把 Agent/Skill 版本当作字符串记录。                       |
| P1     | 医学证据质量          | 将收录判断、实体抽取、规范化、关系抽取、证据分级和 QA 拆成独立节点；证据等级不得直接复用旧 Association 结果；字段需定位到可核验句子或段落。                          |
| P2     | 问答 Agent 化         | 将目前固定别名解析扩展为目录驱动的问题理解、检索规划、证据分析、回答生成和引用 QA，仍由确定性代码执行实体白名单和引用校验。                                          |
| P2     | 平台可组合性          | Agent、Skill 和 Workflow 页从只读目录升级为受控的声明式组合工具，支持复制新版本、配置允许的 Skill/Tool、节点顺序、分支、重试和回滚，仍不允许在浏览器中任意执行代码。 |
| P2     | 可观测性              | Workflow 在人工审核前不得误标为 `SUCCEEDED`；需记录发现、去重、筛选、抽取、标准化、分级、QA 和审核节点的真实 Trace。                                                 |
| P2     | 前端完整性与可访问性  | 拆分过大客户端组件，增加导航当前态，修复移动抽屉焦点锁定、Escape 关闭和焦点返回，将交互热区统一到至少 44px，用设计令牌代替重复颜色常量。                             |
| P2     | 性能、安全与测试      | 完成同区部署/缓存与延迟预算，用共享存储实现限流，将 Knowledge/Ask/Ops 主组件和 PostgreSQL Repository 纳入覆盖率与真实交互 E2E。                                      |
| P2     | 交付治理              | 核心平台代码、迁移和文档必须进入版本控制；不得以大量未跟踪文件作为可交付状态。                                                                                       |

其中“每周自动调度”与本次新决策冲突，已从 V1 验收中移除；其他整改项保留。ClinVar、OncoKB、ClinicalTrials.gov、指南和向量检索仍作为后续数据源或技术路线，不阻塞本轮 PubMed 人工发起更新。

### 1.2 代码审计基线：已实现、当前缺口与本轮动作

> **以下是 2026-09-16 对当前仓库的审计结论，不代表目标能力已经完成。** 开发拆任务时必须保留“当前状态”和“目标状态”两列，完成后以第 7.8、8.9、13、14 节的验收为准。

| 模块                      | 当前已实现                                                                                                           | 当前缺口与本轮动作                                                                                                                                          |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Knowledge 前端            | 疾病、基因、变异、药物四类目录与详情；全局搜索；Evidence 和 Source 详情                                              | 保持已发布版本隔离；补真实性能预算、移动端与键盘可访问性、真实交互 E2E                                                                                      |
| Ask 前端                  | 自然语言提问、可选结构化上下文、轮询恢复、反馈和引用展示                                                             | 运行阶段必须来自真实节点；停止等待需中止客户端轮询；补完整澄清、失败、恢复和引用跳转 E2E                                                                    |
| Evidence Ops 前端         | 驾驶舱、检索策略、Run、Candidate、Release、Agent/Skill/Workflow/Question Run 页面以及审核工作台雏形                  | 新增统一“发起知识更新”表单、审核队列入口和单篇 PMID 入口；修复审核字段契约、状态刷新、导航当前态和移动端可访问性                                            |
| 平台数据模型              | 已有 Skill、Agent、Workflow、Run、Artifact、Candidate、Draft、Review、Release、Question Run 与 Feedback 等模型或迁移 | 增加 Scope Snapshot、Preview、子查询游标、数量限制、暂停/取消和持久任务所需字段与约束                                                                       |
| 文献发现                  | 已支持 PubMed 增量检索、单 PMID 获取和基础去重                                                                       | 当前人工触发依赖请求后的临时执行；改为 Preview + 幂等创建 + 持久队列/Worker + 游标恢复，暂不增加 Cron 调度                                                  |
| 证据生产                  | 已有结构化抽取、草稿、审核和发布纵向链路                                                                             | 当前链路依赖预选 Association、可能继承旧等级，并用整段摘要支撑多个字段；拆成独立收录、实体/关系、规范化、分级和 QA Artifact，并保存句段定位                 |
| Skill Runtime             | 已有定义、Schema 校验和单元级执行原语                                                                                | 生产 Workflow 尚未全面经过 Runtime；本轮必须真实执行 allowlist、Schema、超时、重试、预算和失败 Trace，而非只记录版本字符串                                  |
| Workflow Trace            | 已有 Run、Step、Artifact 查询和页面                                                                                  | 当前固定链路的节点记录不足，人工审核前可能提前成功；补真实节点 Trace，并以 `NEEDS_HUMAN` 表示等待审核                                                       |
| 审核发布                  | 后端已有乐观锁审核、幂等发布和不可变 Release Snapshot                                                                | 前端缺少可导航审核队列；`REQUEST_CHANGES`、`REJECT` 与后端必填契约不一致；决策后需刷新状态并禁用非法重复操作                                                |
| 问答后端                  | 已有结构化 Evidence Pack、异步 Question Run、回答生成、引用白名单和安全门                                            | 实体解析仍依赖有限硬编码目录；改为发布目录驱动，并把理解、规划、分析、生成和 QA 纳入可审计 Agent/Skill 流程                                                 |
| Agent/Skill/Workflow 管理 | 已有只读目录、详情和版本展示                                                                                         | 增加受控的声明式复制、编辑、评估、激活和回滚；不开放任意代码或未经审核的 Prompt 执行                                                                        |
| 性能与安全                | 已有基础分页、缓存、内部鉴权/同源保护和进程内限流                                                                    | 解决数据库冷启动与跨区延迟，定义接口延迟预算；限流迁移到 Redis/数据库等共享存储，覆盖多实例部署                                                             |
| 测试与交付                | 审计时 40 个测试文件、286 个测试通过；隔离生产构建及 8 条 Playwright E2E 通过                                        | Knowledge/Ask/Ops 三个大型主组件和 PostgreSQL Repository 未完整进入覆盖范围；数据库测试本次审计未重跑；核心平台代码、迁移和文档须全部进入版本控制后才能交付 |

### 1.3 本次验收：审核发布门禁的真实状态（2026-09-17）

> **本节覆盖 1.2 中已经过时的“审核队列尚未实现”描述。当前审核队列、审核工作台、审核 API、幂等发布事务和 Release 隔离已经存在；本轮不得重复建设，开发应只修复下列差距。**

#### 已实现

- 页面：`/[locale]/ops/reviews` 审核队列和 `/[locale]/ops/reviews/[reviewTaskId]` 审核工作台，且已加入 Ops 主导航。
- Staging：自动处理结果先写 Candidate、Evidence Draft、Workflow Artifact 和 Review Task，不直接写公开 Claim。
- 审核：支持版本化修改、退回、驳回、阻断 QA、乐观锁和审核决定幂等。
- 发布：`APPROVE_AND_PUBLISH` 在单事务中创建正式来源、Passage、Claim、Change Set、patch Release 及 Release 成员关系；旧 Release 保持不变。
- 公开检索：Knowledge 与异步 Ask 读取 `PUBLISHED` Release，并过滤已审核 Claim、来源和发布成员关系；Question Run 在创建时锁定 Release。

#### **P1 整改状态（2026-09-17 已完成）**

1. **最终证据等级已版本化发布。** `knowledge_release_association` 保存每个 Release 的最终等级和分级理由；发布事务复制旧快照，只以当前 Draft 覆盖目标 Association。Knowledge、Ask 和 Release Diff 读取该快照，全局 Association 不被修改。
2. **公开查询已统一 Release 选择规则。** Knowledge、异步 Ask 与 `/api/v1/evidence-answer` 默认使用最新 `PUBLISHED` Release；只有显式 `EVIDEX_KNOWLEDGE_RELEASE_OVERRIDE` 才固定历史版本，且回答继续返回锁定版本。
3. **批准确认信息已由后端提供并强校验。** Review Task 返回 `publicationPreview`，包含当前/拟发布等级与理由、等级是否变化、新增/修改 Claim 数、来源、当前 Release 和预计新 Release；批准说明在 API Schema 和服务层均为非空必填，成功结果返回实际 `releaseVersion`。
4. **门禁回归测试已补齐。** 覆盖未审核/退回/拒绝不可见、等级新旧版本隔离、默认最新 Release、发布失败回滚和批准幂等。

#### P2 能力边界

- 当前更新链路主要围绕已有、已批准 Association 发现并新增 Claim。它可以更新现有知识关系的证据，但还不能完整地把全新疾病、基因、变异、药物或治疗关联从模型提议直接发布。后续需增加 Proposed Entity / Proposed Association 的 Staging、去重、人工合并和版本化发布。
- 当前 RAG 是结构化关系检索形成 Evidence Pack，再由模型生成并校验引用；没有 embedding 或向量数据库。若后续引入混合 RAG，只有已审核且属于目标 Release 的 Passage 可以进入向量索引，索引需按 `release_id` 隔离并具有 `BUILDING / READY / FAILED` 状态；索引未 READY 时不得让未审核内容或半成品进入问答。

统一状态口径：

```text
Candidate / Draft / Review Task = 待审核区，不属于公开知识
REJECTED / REQUESTED_CHANGES    = 不可检索
APPROVE_AND_PUBLISH             = 原子创建新 Release
PUBLISHED + Release Membership  = Knowledge / Ask 唯一可读取范围
```

## 2. 产品目标

### 2.1 一句话定位

> Evidex 是一套由人工发起更新、由多 Agent 执行证据生产、经人工审核后版本发布，并支持知识浏览与 RAG 问答的可审计肿瘤证据系统。

### 2.2 目标闭环

```text
运营人员发起一次全库或指定范围的知识更新
→ 多 Agent 筛选、抽取、标准化、分级和质检
→ 生成待审核证据
→ 人工对照原文审核
→ 批准并原子发布新知识版本
→ 用户浏览新知识
→ RAG 使用同一版本回答问题
→ 从回答反向追溯到证据、原文、Agent、审核人和发布版本
```

### 2.3 核心业务价值

- 将知识更新从人工逐篇搜索转为“人工定义范围并发起、系统批量发现和处理、人工集中审核”。
- 将医学人员的时间从复制、整理和格式转换转移到证据判断。
- 保证所有公开知识和回答均可追溯到已审核来源。
- 保证历史答案可以通过知识版本复现。
- 通过 Agent、Skill、Tool 和 Workflow 的统一运行平台复用能力，而不是为两条链路分别开发不可复用的 Prompt 流程。

### 2.4 成功标准

完整产品必须证明以下结果，而不只证明模型能够生成文本：

- 人工发起的同范围、同时间窗更新任务可重复运行，且不会产生重复候选或重复入库。
- 新来源只能进入草稿区，任何 Agent 都不能绕过人工审核直接发布。
- 批准和发布具备事务性，失败时不会产生半发布状态。
- 知识浏览和问答只读取已审核、已发布版本。
- 每个公开医学结论均可定位到证据 Claim 和来源段落。
- 问答缺少必要上下文时要求补充，知识不足时明确拒答。
- 每个 Agent 和 Skill 的版本、输入输出、耗时、成本和评估结果可追踪。

## 3. 范围与边界

### 3.1 V1 必须包含

- 从 Evidence Ops 页面人工发起 PubMed 增量或指定范围发现任务。
- 支持全知识库更新，以及按疾病、基因、变异单独或组合限定检索范围。
- 单次任务支持最多处理 50 篇、100 篇或当前检索窗内全部匹配文献。
- 合法可用的 PubMed 摘要与 PMC 开放全文处理。
- 候选去重、相关性初筛、多 Agent 证据抽取和自动质检。
- 原文与结构化证据对照审核。
- 人工批准、驳回、退回修改和重新运行。
- 审核批准后自动写入正式知识并创建不可变发布版本。
- 疾病、基因、变异、药物、证据和来源的知识浏览。
- 自然语言临床证据问题解析、检索、生成、引用与安全校验。
- Agent、Skill、Workflow、运行轨迹和评估的内部管理能力。

### 3.2 V1 明确不包含

- 未经人工审核的自动发布。
- 患者诊断、处方、剂量、疗程或个体化治疗决策。
- FASTQ、VCF、基因组坐标转换或完整变异注释流水线。
- 从付费、受限或未明确授权来源批量抓取和再分发内容。
- 以 OncoKB 数据作为可自由导入的公开知识源；如后续接入，必须先完成授权与许可评审。
- 指南全文抓取和再分发。
- 将 ClinVar 的变异临床意义直接当作药物治疗证据。
- 对真实医疗机构承诺医疗器械、SLA 或临床决策能力。
- 第一版拖拽式低代码 Workflow 编辑器；V1 使用受版本控制的声明式表单，允许复制 Draft、受限配置、评估、激活和回滚，不开放自由画布或任意代码执行。
- 自动按周或 Cron 定时发起知识更新；当前阶段只实现人工按钮触发，保留未来接入调度器的扩展点。

### 3.3 数据源角色

| 数据源              | V1 角色                    | 是否进入人工发起的更新任务 | 说明                                       |
| ------------------- | -------------------------- | -------------------------- | ------------------------------------------ |
| PubMed              | 治疗证据候选发现           | 是                         | 第一优先级，保存 PMID、元数据和摘要范围    |
| PMC                 | 合法开放全文               | 条件式                     | 仅处理明确可用全文，记录许可和模型使用策略 |
| Drugs@FDA / openFDA | 监管状态                   | 后续增量管线               | 监管事实不能代替治疗证据                   |
| ClinVar             | 变异名称和临床意义辅助信息 | 后续                       | 不能直接提升治疗证据等级                   |
| OncoKB              | 分级思想参考或授权数据     | 否                         | 未授权前不得导入或再分发其知识数据         |

## 4. 用户与权限

| 角色            | 主要任务                                    | 默认权限                                  |
| --------------- | ------------------------------------------- | ----------------------------------------- |
| 访客 / 普通用户 | 浏览知识、提出证据问题                      | 只读已发布知识                            |
| 知识运营人员    | 配置检索策略、查看候选、重试任务            | 读写工作流和草稿，不可批准发布            |
| 医学审核人员    | 对照原文审核结构化证据                      | 修改草稿、批准、驳回、退回                |
| 发布人员        | 查看变更集和发布结果                        | V1 可与医学审核人员合并；生产环境建议分离 |
| 管理员          | 管理角色、Agent、Skill、Workflow 和运行配置 | 管理权限，不改变医学规则                  |

权限要求：

- 所有 `/ops` 页面和内部接口必须鉴权。
- 普通用户不得读取草稿、Agent 原始输出、内部 Prompt、成本和审核备注。
- 下游问答 Agent 只允许使用只读已发布知识工具。
- 上游 Agent 只允许写入草稿和运行记录，不拥有发布工具。
- 发布操作必须记录操作者、时间、输入版本和变更集哈希。

## 5. Agent、Skill、Tool 与 Workflow 定义

### 5.1 Tool

Tool 是最底层的可执行能力，包括数据库查询、外部 API、对象存储、日志和事务写入。Tool 必须使用强类型参数，不依赖模型解析返回文本。

示例：

- `pubmed.search`
- `pubmed.fetch_document`
- `knowledge.get_published_release`
- `knowledge.query_associations`
- `knowledge.get_source_passages`
- `staging.save_evidence_draft`
- `release.publish_change_set`
- `feedback.record`

每个 Tool 必须声明：

- 输入与输出 Schema；
- 访问的数据域；
- 是否有副作用；
- 是否可安全重试；
- 超时、错误码和速率限制；
- 允许调用它的 Agent 或 Skill；
- 审计字段。

### 5.2 Skill

Skill 是可独立运行、测试、版本化和复用的领域能力。Skill 可以调用一个或多个 Tool，但不拥有完整业务目标。

Skill 分为三类：

- `DETERMINISTIC`：完全由代码和规则实现，如 ID 白名单、状态过滤、哈希去重。
- `MODEL`：需要模型理解或生成，如研究限制摘要。
- `HYBRID`：模型提出结果，确定性规则完成规范化和校验。

每个 Skill 必须声明：

```text
skill_id
name
version
kind
description
input_schema
output_schema
allowed_tools
side_effect: NONE | STAGING_WRITE | PUBLISH
timeout_ms
max_attempts
risk_level
evaluation_suite_id
status: DRAFT | ACTIVE | DEPRECATED
```

V1 中任何独立 Skill 均不得拥有 `PUBLISH` 副作用；正式发布只能通过受权限保护的发布服务完成。

### 5.3 Agent

Agent 是拥有明确目标、可根据上下文选择 Skill、可以停止或转交任务的工作角色。

每个 Agent 必须声明：

```text
agent_id
name
version
goal
instructions_version
allowed_skill_versions
allowed_tools
input_schema
output_schema
model_configuration
token_and_cost_budget
stop_conditions
handoff_conditions
failure_policy
status
```

Agent 不得通过自由文本绕过 Skill 的输入输出 Schema，也不得拥有超出角色需要的 Tool。

### 5.4 Workflow

Workflow 定义 Agent、Skill、人工节点和确定性质量门之间的关系。V1 使用版本化 DAG 或状态机配置，不把顺序只写在 Prompt 中。

每个 Workflow 必须声明：

- 入口条件；
- 节点和依赖关系；
- 节点输入映射；
- 成功、失败和人工介入分支；
- 重试与退避规则；
- 幂等键；
- 超时和总成本预算；
- 最终产物；
- Workflow 版本。

## 6. 总体架构

```text
                         Evidex Agent & Skill Runtime
┌──────────────────────────────────────────────────────────────────────┐
│ Registry │ Orchestrator │ State Store │ Artifact Store │ Trace │ Eval │
└──────────────────────────────────────────────────────────────────────┘
               │                                      │
               ▼                                      ▼
┌──────────────────────────────┐       ┌───────────────────────────────┐
│ 上游 Knowledge Operations    │       │ 下游 Knowledge Consumption    │
│ 周期发现 → 草稿 → 人审 → 发布 │       │ 浏览 → 提问 → 检索 → 回答 → QA │
└──────────────────────────────┘       └───────────────────────────────┘
               │                                      ▲
               ▼                                      │
┌──────────────────────────────────────────────────────────────────────┐
│ Published Knowledge Releases                                         │
│ Disease │ Gene │ Variant │ Drug │ Association │ Claim │ Passage │ FDA │
└──────────────────────────────────────────────────────────────────────┘
```

### 6.1 不可违反的系统约束

1. 草稿数据不能出现在公开知识浏览或问答 Evidence Pack 中。
2. Agent 只能提出 `proposed_level`，最终 `approved_level` 来自人工审核。
3. 问答请求期间不能实时搜索 PubMed 或实时执行知识抽取。
4. 问答只能使用请求开始时锁定的一个已发布知识版本。
5. 每个公开医学陈述必须引用当前 Evidence Pack 中的 Claim 或监管记录。
6. 引用白名单、发布版本成员关系、权限、Schema 和发布事务必须由确定性代码保证。
7. 同一发布版本和同一规范化检索计划必须得到相同证据集合。
8. 失败时优先返回结构化证据或明确状态，不得补写模型猜测结果。

## 7. 上游链路：知识生产与发布

### 7.1 用户故事

- 作为知识运营人员，我希望在页面上点击“发起知识更新”，让系统完成一次从文献发现到待审核证据的完整任务。
- 作为知识运营人员，我希望可以更新整个当前知识库，也可以只输入一个疾病、基因或变异来限定本次检索范围。
- 作为知识运营人员，我希望在成本、时间和覆盖范围之间做取舍，选择本次最多处理 50 篇、100 篇或全部匹配文献。
- 作为知识运营人员，我希望任务离开页面后仍继续执行，并可以查看进度、暂停、恢复、取消或重试失败项。
- 作为知识运营人员，我希望知道候选为什么被收录、排除、标记为重复或转人工。
- 作为医学审核人员，我希望逐字段对照原文，修改 Agent 草稿后批准或驳回。
- 作为医学审核人员，我希望批准后知识自动进入正式版本，不需要手工编辑 JSON 或运行导入脚本。
- 作为管理员，我希望查看每个 Agent、Skill 和 Workflow 的执行结果、失败、成本与版本。

### 7.2 上游主流程

```text
内部用户点击“发起知识更新”
→ 选择全库或指定疾病 / 基因 / 变异范围
→ 选择最多处理 50 篇 / 100 篇 / 全部匹配文献
→ 预览规范化范围、检索策略和预估文献数
→ 确认后创建 MANUAL Discovery Run
→ 按版本化检索策略分页查询 PubMed
→ 保存原始候选和检索上下文
→ PMID / DOI / document hash 去重
→ 收录范围初筛
→ 获取摘要或合法全文
→ 实体和关系抽取
→ 研究设计、结局、限制与原文依据抽取
→ 实体规范化与已有知识对齐
→ 提出证据等级
→ 完整性、引用、许可和一致性质检
→ READY_FOR_REVIEW
→ 人工修改、退回、驳回或批准
→ 构建 Knowledge Change Set
→ 事务校验并发布新知识版本
```

### 7.2.1 更新范围模型

本次发起页提供两种模式：

1. `ALL_KNOWLEDGE`：更新当前已发布知识版本涵盖的全部范围。Planner 从当前发布版本读取有效疾病、基因、变异和治疗关联，生成多个受版本控制的子检索任务，再在 Run 级别跨策略去重。
2. `SCOPED`：用户至少输入疾病、基因、变异中的一项。输入使用搜索和自动完成，提交前必须解析为当前知识目录中的规范实体 ID。

组合范围采用 AND 语义：

- 仅疾病：检索该疾病与当前知识库内相关基因、变异和治疗的文献。
- 仅基因：跨当前知识库已收录疾病检索该基因及其已知变异。
- 仅变异：自动带入所属基因，跨已收录疾病检索该精确变异。
- 疾病 + 基因或疾病 + 变异：只保留同时满足所有已填条件的结果。

V1 不使用模型猜测未匹配的自由文本实体。若输入无法映射到规范目录，页面必须阻止发起并提示先补充别名或创建经审查的新范围。“借此任务直接扩展到知识库外的新疾病或基因”作为后续独立能力，不与本轮混在一起。

### 7.2.2 文献数量与排序规则

表单字段为 `documentLimit: 50 | 100 | ALL`，默认值为 `50`。

- `50` 或 `100` 表示本次 Run 最多进入去重后处理流程的唯一文献数，不是每个子检索各处理 50 或 100 篇。
- `ALL` 表示处理当前检索时间窗内可发现的全部唯一匹配文献，不表示在一个 HTTP 请求中一次性拉取或处理全部结果。
- 来源返回结果按发表日期倒序、PMID 倒序形成稳定顺序；达到数量限制后停止获取新页。
- “全部”必须在发起前显示来源可提供的预估数量和费用/时间警告，并要求二次确认。
- 预估数为来源结果数，可包含已入库或跨策略重复项，不得把它显示为最终新增证据数。

### 7.2.3 时间窗、预览与确认

- 默认使用对应范围最后一次完整成功的截止时间，并保留可配置重叠天数。
- 若范围从未成功运行，默认查询过去 90 天；用户可在“高级设置”中修改开始和结束日期。
- 发起前先请求 Preview，展示规范化实体、子检索数、时间窗、查询摘要、预估结果数、选定上限和风险提示。
- Preview 不创建 Candidate，不调用抽取模型，也不推进成功截止点。
- 用户确认后才创建 Run；返回 `202` 和 `discoveryRunId`，页面立即跳转到 Run 详情。

### 7.3 上游 Agent

| Agent                 | 目标                           | 主要输入                          | 主要输出                               | 禁止行为               |
| --------------------- | ------------------------------ | --------------------------------- | -------------------------------------- | ---------------------- |
| Knowledge Ops Planner | 编排整条知识生产任务           | Discovery Run、候选状态、运行策略 | 下一节点、重试、转人工或停止           | 不做医学判断、不发布   |
| Discovery Agent       | 发现新增来源并保留检索上下文   | 检索策略、上次成功截止点          | Candidate Document 列表                | 不判断最终证据等级     |
| Eligibility Agent     | 判断来源是否进入抽取流程       | 标题、摘要、产品范围              | INCLUDE / EXCLUDE / NEEDS_HUMAN 与理由 | 不删除来源记录         |
| Extraction Agent      | 从允许处理的来源中提取证据草稿 | 来源文档和段落                    | 实体、关系、Claim、研究限制            | 不补充原文不存在的信息 |
| Normalization Agent   | 将抽取结果映射到规范实体       | 草稿实体、现有知识目录            | 规范 ID、别名匹配、冲突                | 不猜测未知变异         |
| Grading Agent         | 按 Evidex 规则提出等级         | 关系、Claim、FDA 快照             | proposed_level 与理由                  | 不写 approved_level    |
| Ingestion QA Agent    | 检查草稿可审核性与风险         | 完整草稿、原文链接、规则          | 问题列表、风险和处理建议               | 不批准、不发布         |

### 7.4 上游 Skill 目录

第一批 Skill 应包括：

#### 发现与来源

- `search_pubmed_incremental`
- `fetch_pubmed_metadata`
- `fetch_permitted_full_text`
- `deduplicate_source_document`
- `record_source_license_policy`
- `screen_evidence_eligibility`
- `explain_exclusion_reason`

#### 实体与证据抽取

- `extract_disease_entities`
- `extract_gene_entities`
- `extract_variant_entities`
- `extract_drug_entities`
- `extract_study_design`
- `extract_study_population`
- `extract_treatment_line`
- `extract_prior_therapy`
- `extract_endpoints_and_effects`
- `extract_evidence_claims`
- `extract_study_limitations`
- `link_claim_to_source_passages`

#### 规范化与分级

- `normalize_disease`
- `normalize_gene`
- `normalize_variant`
- `normalize_drug`
- `match_existing_entities`
- `classify_variant_applicability`
- `classify_disease_applicability`
- `classify_evidence_maturity`
- `propose_evidence_level`
- `compare_with_existing_associations`

#### 质检与发布准备

- `validate_draft_completeness`
- `validate_primary_passage`
- `validate_source_model_policy`
- `validate_source_display_policy`
- `detect_duplicate_claim`
- `detect_entity_conflict`
- `detect_grade_rule_conflict`
- `build_review_summary`
- `build_knowledge_change_set`
- `validate_change_set`

### 7.5 上游前端开发任务

#### 7.5.1 Evidence Ops 导航与驾驶舱

路由建议：`/[locale]/ops`。

页面需要展示：

- 最近一次人工发起的 Discovery Run 状态和范围；
- 新发现、重复、排除、处理中、待审核、已发布和失败数量；
- 待审核积压和最老任务等待时间；
- Agent 失败率、重试次数和人工介入数量；
- 最近发布版本；
- 需要管理员处理的告警。

开发任务：

- 新增仅内部角色可访问的 Ops Layout 和导航；
- 新增指标卡、漏斗、最近运行和异常列表；
- 在首屏放置明确的主操作按钮“发起知识更新”；
- 支持加载、空状态、部分失败和完整失败状态；
- 数据不得前端硬编码；
- 指标可按本周、近 30 天切换；
- 页面默认桌面优先，同时保证窄屏可查看核心状态。

#### 7.5.2 发起知识更新与检索策略页

路由建议：

- `/[locale]/ops/discovery-runs/new`：发起知识更新；
- `/[locale]/ops/discovery-strategies`：查看受审查的检索策略。

发起页必须包含：

- 更新范围单选：“整个知识库”或“指定范围”；
- 指定范围时，提供疾病、基因、变异三个可搜索自动完成输入，并把规范实体显示为可移除标签；
- 文献数量单选：`50`、`100`、`全部`，默认 `50`；
- 高级设置：开始日期、结束日期；
- “预览检索”和“确认发起”两步操作，未预览或预览已过期时不能直接发起；
- Preview 显示范围、时间窗、预估命中数、实际处理上限、去重说明和成本/时间提示；
- 选择“全部”时必须二次确认，确认框不使用模糊的“确定”，按钮文案使用“处理全部预估 N 篇文献”；
- 发起成功后显示 Run ID，并跳转到运行详情；页面关闭不得取消后台任务。

表单边界和失败行为：

- `SCOPED` 没有任何规范实体时禁用预览；
- 疾病、基因和变异彼此冲突时，显示冲突项而不自动忽略任一条件；
- 预估为 0 时允许发起，但需明确提示“当前来源未发现匹配项”；
- 来源预览超时时保留已填表单并提供重试；
- 重复点击、网络重试或刷新不得创建两个相同 Run。

检索策略页能力：

- 查看疾病、基因、变异对应的检索策略；
- 查看策略版本、启用状态、最近成功截止点和最近一次人工运行；
- 管理员可启用或暂停策略；发起更新统一进入新建 Run 页，不在每行策略上放置意义不清的“立即运行”；
- V1 不提供自由编辑原始查询表达式；查询策略通过受审查配置发布；
- 暂停和恢复必须有确认与审计记录。

#### 7.5.3 Discovery Run 列表与详情

路由建议：

- `/[locale]/ops/discovery-runs`
- `/[locale]/ops/discovery-runs/[runId]`

列表字段：

- 运行 ID；
- 触发方式；
- 更新范围模式及疾病、基因、变异快照；
- 文献数量选项、预估匹配数和实际处理数；
- Workflow 版本；
- 检索时间窗；
- 开始和结束时间；
- 当前状态；
- 候选、重复、排除、待审核和失败数量。

详情页需要展示：

- Workflow 节点时间线；
- 每个节点使用的 Agent 和 Skill 版本；
- 节点输入输出摘要；
- 重试、超时和转人工原因；
- Token、模型费用和总耗时；
- 关联的候选文献。
- 分页游标、已检索页数、已发现唯一 PMID 数、处理进度与预计剩余量；
- “暂停”、“继续”和“取消”操作；暂停只停止获取新页和发放新节点，已执行的外部请求完成后安全落盘。

前端只能展示经过脱敏和截断的运行摘要，不显示密钥或完整内部系统指令。

#### 7.5.4 候选文献池

路由建议：`/[locale]/ops/candidates`。

筛选项：

- 发现时间；
- 疾病、基因、变异和药物；
- 来源类型；
- 工作流状态；
- 收录结果；
- 风险等级；
- 是否重复；
- 是否需要人工处理。

列表需要显示标题、PMID、发表时间、命中策略、当前节点、风险、排除或失败原因。运营人员可以查看详情、重试可重试任务、将不确定候选转入人工处理；不能直接将候选发布。

候选文献池页还必须提供次要入口“按 PMID 添加单篇文献”，使现有单篇入库 API 可从界面访问。该入口需选择或提议治疗关联，但不得跳过抽取、QA 和人工审核。

#### 7.5.5 证据审核队列与工作台

路由建议：

- `/[locale]/ops/reviews`：审核任务列表；
- `/[locale]/ops/reviews/[reviewTaskId]`：审核工作台。

审核队列必须出现在 Ops 主导航，候选详情也必须可直接跳转到对应 Review Task。列表至少支持按等待时间、状态、疾病、基因、变异、风险和是否存在阻断问题筛选。

桌面端使用三栏布局：

1. 左栏：来源信息、摘要或允许显示的全文段落；
2. 中栏：疾病、基因、变异、药物、研究设计、Claim、适用性、等级和限制等结构化字段；
3. 右栏：QA 问题、重复提示、冲突、Agent 运行轨迹和审核历史。

交互要求：

- 点击结构化字段时，高亮其 PRIMARY、CONTEXT 或 LIMITATION 段落；
- 关键字段必须显示“来自摘要 / 全文”和定位信息；
- 审核人可逐字段修改，并填写修改理由；
- 支持“请求重新处理”“驳回”“批准并发布”；
- “请求重新处理”必须选择至少一个需要修改或重跑的字段，并将 `requestedFields` 提交给后端；
- “驳回”必须填写原因，界面不得把该字段标成可选；
- “批准并发布”前显示变更摘要、当前发布版本和预计新版本；
- 审核决定成功后必须更新本地任务状态或重新获取详情，并禁用不再合法的操作；
- 数据已被其他审核人修改时必须阻止覆盖并提示刷新；
- 离开存在未保存修改的页面前给出提醒；
- 所有按钮有可访问名称，关键状态通过 `aria-live` 告知。

#### 7.5.6 发布版本页

路由建议：

- `/[locale]/ops/releases`
- `/[locale]/ops/releases/[releaseId]`

页面需要展示：

- 版本号、发布时间、发布人和截止日期；
- 新增或修改的实体、关联、Claim、来源和 FDA 记录；
- 发布前后差异；
- 关联审核任务和 Agent Workflow；
- 发布失败原因；
- 当前版本标识。

V1 只支持查看历史版本，不提供直接删除或修改已发布版本。

#### 7.5.7 Agent、Skill 与 Workflow 目录

路由建议：

- `/[locale]/ops/agents`
- `/[locale]/ops/skills`
- `/[locale]/ops/workflows`

页面需要：

- 查看定义、版本、状态和用途；
- 查看被哪些 Workflow 使用；
- 查看最近成功率、耗时和评估结果；
- 查看输入输出 Schema 摘要；
- 管理员可启用或回滚到已有版本；
- 可从已有版本复制为新的 Draft 版本，使用结构化表单配置 Agent 允许的 Skill/Tool、模型与预算；
- Workflow 可以树或有向图展示节点，并用受限表单配置节点顺序、条件分支、重试与人工 handoff；
- Draft 版本必须通过 Schema 验证和评估套件后才能激活；
- 不提供在浏览器内任意修改或执行系统 Prompt 模板以外的代码。

### 7.6 上游后端开发任务

#### 7.6.1 来源适配与检索策略

- 建立 `SourceAdapter` 接口，统一搜索、获取元数据和获取允许内容的返回协议；
- 首个实现为 PubMed，PMC 作为 PubMed 文档的条件式全文补充；
- 检索策略必须有稳定 ID 和版本；
- 每次运行保存实际查询、策略版本、时间窗和来源游标；
- 本阶段不实现周期调度，所有 Discovery Run 由登录且有权限的内部用户人工发起；
- 将人工输入规范化为不可变 `DiscoveryScopeSnapshot`，保存模式、疾病 ID、基因 ID、变异 ID、别名版本和当前知识版本；
- Planner 将 Scope Snapshot 展开为一个或多个版本化查询，并对跨查询 PMID 做 Run 级去重；
- 支持 Preview 只读计数，Preview 不创建 Candidate 或调用模型；
- `documentLimit` 在 Run 级、跨子查询、去重后统一计算；`ALL` 使用 `null` 或明确的枚举表示，不使用任意极大数伪装；
- 增量窗口以最后一次成功截止点为基础，并允许配置重叠窗口；
- 只有完整成功后才能推进成功截止点；
- 外部请求遵守速率限制并记录可重试错误。

#### 7.6.2 候选与去重

- 新增 Candidate Document 领域模型；
- 依次使用 `source_type + external_id`、DOI 和文档哈希去重；
- 同一个候选可以记录多个命中策略，但只能有一个活动处理任务；
- 重跑 Discovery Run 不得创建重复候选或重复 Workflow Run；
- 重复项保留指向主记录的关系和判断依据；
- 排除项保留排除理由、规则版本和可重新评估入口。

#### 7.6.3 Agent 与 Skill Runtime

- 建立统一的 Skill 执行接口和 Schema 校验；
- 建立 Agent 定义、允许 Skill 集合和预算限制；
- 建立 Workflow 状态机、节点依赖和 handoff；
- 每一步产物保存为不可变 Artifact，并通过引用传递；
- 运行记录保存定义版本、输入哈希、输出哈希、耗时、Token 和费用；
- 节点必须支持幂等重试；
- 达到最大重试次数后进入人工队列，不能无限循环；
- 运行恢复从最近成功节点继续；
- 所有生产 Workflow 节点必须通过 Skill Runtime 调用，不得跳过 Runtime 直接执行同名业务函数后只记录一个 Skill 版本字符串；
- Runtime 必须实际强制 `timeoutMs` 和 `maxAttempts`，并为失败、超时和不合法输出保存 Trace；
- Workflow Run 处于人工审核节点时应标记 `NEEDS_HUMAN` 或对应非终态，不得提前标记 `SUCCEEDED`；
- 不把模型自由文本当作下一个节点的唯一控制信号；
- 所有模型输出先经过 Structured Output 和领域校验。

#### 7.6.4 草稿与审核领域

- Agent 输出写入独立草稿或 Staging 领域；
- Evidence Draft 保存字段值、字段来源、置信信息、Agent 版本和审核修改；
- 候选文献不得必须依赖用户预先选择的单一 Association；Extraction 和 Normalization 先生成提议实体与关系，无法确定时转人工；
- Grading Agent 必须根据当前文献、研究成熟度、变异适用性和监管快照独立提出等级，不得把已有 Association 的 `approved_level` 原样复制为新证据结论；
- 每个关键字段必须关联到支持它的句子或段落 locator，不得默认把整个摘要标为所有字段的唯一来源；
- Eligibility、Normalization、Grading 和 QA 结果分别保存为独立 Artifact，供审核人比对；
- 一个 Review Task 可以包含同一来源产生的多个 Claim 和关联；
- 审核操作使用乐观锁或版本号防止并发覆盖；
- `REQUEST_CHANGES` 必须指定需要重跑或人工修改的字段；
- `REJECT` 必须记录结构化原因；
- `APPROVE_AND_PUBLISH` 必须使用最新草稿版本；
- 审核日志不可由普通更新接口覆盖。

#### 7.6.5 发布服务

- 从已批准 Review Task 构建 Knowledge Change Set；
- 校验稳定 ID、外键、PRIMARY passage、模型使用许可、FDA 关系、审核状态和等级重算；
- 复用并扩展现有 knowledge package 校验逻辑，避免维护两套医学规则；
- 在单一数据库事务中写入正式知识、发布成员关系和知识版本；
- 批准并发布必须具备幂等键；
- 同一审核任务重复请求返回原发布结果，不创建第二个版本；
- 发布成功后再更新 Review Task 为 `PUBLISHED`；
- 发布失败时回滚所有正式知识写入，并保留可诊断错误；
- 新版本发布后按 release ID 失效或隔离旧缓存，不能无版本全量清缓存；
- 已发布版本不可原地编辑；修正通过新证据、新审核和新版本完成。

#### 7.6.6 人工触发、持久队列与恢复

- API 只负责验证 Preview/确认令牌并创建 Discovery Run，不在请求生命周期内直接执行长任务；
- Worker 从持久队列消费节点任务；
- 支持并发上限、指数退避、速率限制和死信状态；
- 运行重启后可以从持久状态恢复；
- 同一规范化范围、时间窗和数量限制使用唯一幂等键；
- 暂停保存当前来源游标和已处理唯一文献数，继续时不从第一页重新消耗配额；
- 取消不删除已保存候选和 Trace，也不回滚已单独成功生成的待审核任务；
- 部分候选失败时 Discovery Run 可以为 `PARTIAL_SUCCESS`，成功候选继续进入审核；
- 管理员可以重试单个候选或可重试节点，不能跳过必需质量门。

#### 7.6.7 上游内部 API

建议接口：

```text
GET    /api/internal/v1/ops/dashboard
GET    /api/internal/v1/discovery-strategies
POST   /api/internal/v1/discovery-strategies/{id}/pause
POST   /api/internal/v1/discovery-strategies/{id}/resume
POST   /api/internal/v1/discovery-runs/preview
POST   /api/internal/v1/discovery-runs
GET    /api/internal/v1/discovery-runs
GET    /api/internal/v1/discovery-runs/{id}
POST   /api/internal/v1/discovery-runs/{id}/pause
POST   /api/internal/v1/discovery-runs/{id}/resume
POST   /api/internal/v1/discovery-runs/{id}/cancel
GET    /api/internal/v1/candidates
POST   /api/internal/v1/candidates
GET    /api/internal/v1/candidates/{id}
POST   /api/internal/v1/candidates/{id}/retry
GET    /api/internal/v1/review-tasks
GET    /api/internal/v1/review-tasks/{id}
PATCH  /api/internal/v1/review-tasks/{id}/draft
POST   /api/internal/v1/review-tasks/{id}/decision
GET    /api/internal/v1/releases
GET    /api/internal/v1/releases/{id}
GET    /api/internal/v1/agents
GET    /api/internal/v1/skills
GET    /api/internal/v1/workflows
```

Preview 与发起请求建议契约：

```json
{
  "scope": {
    "mode": "SCOPED",
    "diseaseIds": ["disease_nsclc"],
    "geneIds": ["gene_egfr"],
    "variantIds": []
  },
  "documentLimit": 50,
  "window": {
    "from": "2026-06-01T00:00:00.000Z",
    "to": "2026-09-16T23:59:59.999Z"
  }
}
```

`documentLimit` 为 `50 | 100 | "ALL"`。Preview 返回 `previewToken`、规范化 Scope Snapshot、时间窗、子查询摘要、预估数和警告；创建 Run 时携带 `previewToken` 和 `idempotencyKey`。服务端必须防止客户端在 Preview 后偷换范围或数量限制。

审核决策示例：

```json
{
  "decision": "APPROVE_AND_PUBLISH",
  "expectedDraftVersion": 7,
  "comment": "已核对主要终点、研究人群与原文段落",
  "idempotencyKey": "review-task-id:7:approve"
}
```

后端必须从会话和权限系统获取审核人身份，不接受客户端提交 `reviewedBy`。

### 7.7 上游状态模型

#### Discovery Run

```text
PENDING → RUNNING → SUCCEEDED
          ↘ PAUSED → RUNNING
                  ↘ PARTIAL_SUCCESS
                  ↘ FAILED
PENDING / RUNNING / PAUSED → CANCELLED
```

#### Candidate Document

```text
DISCOVERED
→ DUPLICATE
→ EXCLUDED
→ QUEUED
→ PROCESSING
→ NEEDS_HUMAN
→ READY_FOR_REVIEW
→ REJECTED
→ PUBLISHED
→ FAILED
```

`DUPLICATE`、`EXCLUDED`、`REJECTED`、`PUBLISHED` 为终态；因规则或来源更新需要重新评估时，创建新的 Workflow Run，不直接覆盖历史状态。

#### Workflow Step

```text
PENDING → RUNNING → SUCCEEDED
                  ↘ RETRY_WAIT → RUNNING
                  ↘ NEEDS_HUMAN
                  ↘ FAILED
PENDING / RUNNING → CANCELLED
```

#### Review Task

```text
PENDING → IN_REVIEW → REQUESTED_CHANGES → READY_FOR_REVIEW
                    ↘ REJECTED
                    ↘ PUBLISHING → PUBLISHED
                                  ↘ PUBLISH_FAILED
```

### 7.8 上游验收标准

1. 管理员可在 Ops 首页点击“发起知识更新”，选择全库、单一疾病、单一基因、单一变异或其合法组合。
2. `SCOPED` 没有规范实体、实体无法匹配或疾病/基因/变异相互冲突时，系统不创建 Run。
3. 发起前可看到范围、时间窗、预估结果数和处理上限；选择“全部”时有二次确认。
4. 选择 50 或 100 时，跨子查询去重后进入处理的文献不超过指定上限；选择全部时使用分页和游标处理到来源耗尽。
5. 页面关闭后 Run 仍继续；服务重启后可从最近游标和成功节点恢复。
6. 暂停后不再获取新页；恢复不重复处理已完成文献；取消保留已生成 Candidate、Review Task 和 Trace。
7. 使用测试数据发起更新后，新增文献生成候选，重复 PMID 被标记但不重复处理。
8. 不相关文献保存结构化排除原因，不进入抽取模型后续节点。
9. 合格文献生成包含句子或段落定位的 Evidence Draft，且收录、规范化、分级和 QA 产物可分别查看。
10. Agent 缺少必要证据时返回 `NEEDS_HUMAN`，不猜测字段或复制历史等级。
11. 单节点首次超时后可重试并继续原 Workflow Run；达到最大重试次数后任务可见且可人工处理。
12. 审核队列可从导航到达；退回提交 `requestedFields`；驳回强制原因；成功决策后界面不再显示非法操作。
13. 未批准草稿不能通过公开接口、知识浏览或问答查询到。
14. 审核人修改草稿时保留 Agent 原值和修改差异；两名审核人同时编辑时，旧版本提交被拒绝。
15. `APPROVE_AND_PUBLISH` 成功后创建新不可变版本，知识浏览和问答均能使用新证据。
16. 发布中任一数据库约束失败时全部回滚，旧发布版本保持有效。
17. 同一 Run 创建或批准请求重复提交不会创建重复任务、重复证据或第二个知识版本。

## 8. 下游链路：知识浏览与循证问答

### 8.1 用户故事

- 作为用户，我希望分别从疾病、基因、变异和药物进入知识库并查看相关证据。
- 作为用户，我希望搜索实体别名也能找到规范实体。
- 作为用户，我希望提出自然语言临床证据问题，并获得带来源的回答。
- 作为用户，我希望系统在问题不完整、超出范围或没有证据时明确说明，而不是猜测。
- 作为用户，我希望从回答中的结论进入证据 Claim 和原始文献。
- 作为运营人员，我希望查看一次问答调用了哪些 Agent 和 Skill、使用哪个知识版本以及为什么拒答。

### 8.2 下游主流程

```text
用户浏览或提问
→ Intent Router 判断直接查询或 Agent Workflow
→ 临床问题结构化
→ 必要字段与歧义检查
→ 锁定已发布知识版本
→ 生成检索计划
→ 执行结构化精确检索
→ 条件式补充段落检索或语义召回
→ 构建 Evidence Pack
→ 分析支持、耐药、监管、冲突和限制
→ 生成结构化 Answer Draft
→ Agent 语义审查
→ 确定性引用、安全和版本校验
→ 返回回答、证据、来源、版本和免责声明
```

### 8.3 下游路由模式

| 模式                 | 示例                                               | 执行方式                                                |
| -------------------- | -------------------------------------------------- | ------------------------------------------------------- |
| `ENTITY_LOOKUP`      | “EGFR 有哪些变异？”                                | 直接调用知识查询 Skill 和 Tool，不启动完整多 Agent 流程 |
| `EVIDENCE_QA`        | “NSCLC 携带 EGFR p.L858R 是否有奥希替尼相关证据？” | 完整问题理解、检索、分析、生成和 QA                     |
| `THERAPY_COMPARISON` | “奥希替尼和阿法替尼的证据有什么区别？”             | 增加比较、冲突和适用性分析 Skill                        |
| `REGULATORY_STATUS`  | “FDA 是否覆盖这个癌种和变异？”                     | 监管检索为主，明确区分药物获批与适应证匹配              |
| `OUT_OF_SCOPE`       | 剂量、处方、真实个体治疗决策                       | 不检索或有限检索后返回边界说明                          |

### 8.4 下游 Agent

| Agent                        | 目标                               | 主要输入                    | 主要输出                          | 禁止行为                     |
| ---------------------------- | ---------------------------------- | --------------------------- | --------------------------------- | ---------------------------- |
| Answer Orchestrator          | 选择问答路径并控制状态、预算和降级 | 用户问题、会话范围          | Workflow 选择、下一节点、最终状态 | 不直接生成医学结论           |
| Question Understanding Agent | 将问题转换为规范临床问题           | 原始问题、可选结构化上下文  | intent、实体、缺失字段、风险      | 不猜测缺失癌种或未知变异     |
| Retrieval Planning Agent     | 决定检索范围和顺序                 | 规范问题、当前发布版本      | Retrieval Plan                    | 不直接选择最终结论           |
| Evidence Retrieval Agent     | 执行计划并构建证据集合             | Retrieval Plan              | Evidence Pack                     | 不读取草稿、不实时搜外网     |
| Evidence Analysis Agent      | 组织支持、耐药、监管、限制和冲突   | Evidence Pack               | Structured Evidence Analysis      | 不修改等级和监管状态         |
| Answer Composition Agent     | 生成用户可读的受约束回答           | Evidence Pack、分析结果     | Answer Draft                      | 不添加 Pack 外事实或处方建议 |
| Answer QA Agent              | 检查回答是否被证据支持             | Answer Draft、Evidence Pack | Validation Findings               | 不能替代确定性安全门         |

### 8.5 下游 Skill 目录

#### 问题理解

- `classify_question_intent`
- `extract_clinical_entities`
- `normalize_disease`
- `normalize_gene`
- `normalize_variant`
- `normalize_drug`
- `detect_missing_context`
- `detect_ambiguous_variant`
- `detect_out_of_scope_request`
- `detect_personal_identifiers`
- `build_clarification_request`

#### 检索规划与执行

- `select_published_release`
- `build_retrieval_plan`
- `retrieve_entity_profile`
- `retrieve_exact_association`
- `retrieve_same_disease_evidence`
- `retrieve_cross_indication_evidence`
- `retrieve_resistance_evidence`
- `retrieve_regulatory_approval`
- `retrieve_source_passages`
- `filter_approved_evidence`
- `rank_evidence`
- `build_evidence_pack`

#### 证据分析

- `group_evidence_by_therapy`
- `compare_evidence_maturity`
- `analyze_population_applicability`
- `analyze_variant_applicability`
- `analyze_regulatory_alignment`
- `detect_evidence_conflict`
- `summarize_study_limitations`
- `determine_evidence_sufficiency`

#### 生成与质量

- `compose_evidence_answer`
- `compose_regulatory_context`
- `compose_clarification_response`
- `compose_no_evidence_response`
- `format_citations`
- `validate_answer_schema`
- `validate_citation_whitelist`
- `validate_claim_entailment`
- `validate_release_membership`
- `detect_unsupported_entity`
- `detect_overclaim`
- `detect_treatment_recommendation`
- `detect_dosage_or_regimen`
- `decide_abstention`
- `build_safe_fallback`

### 8.6 知识浏览前端开发任务

#### 8.6.1 信息架构

建议公开路由：

```text
/[locale]/knowledge
/[locale]/knowledge/diseases
/[locale]/knowledge/diseases/[id]
/[locale]/knowledge/genes
/[locale]/knowledge/genes/[id]
/[locale]/knowledge/variants
/[locale]/knowledge/variants/[id]
/[locale]/knowledge/drugs
/[locale]/knowledge/drugs/[id]
/[locale]/knowledge/evidence/[id]
/[locale]/knowledge/sources/[id]
```

#### 8.6.2 知识首页

需要提供：

- 全局搜索；
- 疾病、基因、变异和药物四类入口；
- 当前知识版本、文献截止日期和更新时间；
- 已发布实体、治疗关联、Claim 和来源数量；
- 最近发布内容；
- 来源范围和免责声明。

#### 8.6.3 列表与搜索

- 支持规范名、显示名和别名搜索；
- 支持按实体类型、疾病、基因、证据方向和等级筛选；
- 支持分页和稳定排序；
- URL 保存筛选条件，页面刷新后可恢复；
- 无结果时区分“当前版本没有收录”和“输入无法识别”；
- 搜索建议只来自当前已发布版本。

#### 8.6.4 实体详情

疾病详情至少显示：相关基因、变异、药物、治疗关联和证据。

基因详情至少显示：规范符号、别名、相关变异、疾病和药物关系。

变异详情至少显示：所属基因、规范表达、别名、疾病、药物、敏感或耐药方向、等级和证据。

药物详情至少显示：通用名、商品名、组合方案、相关疾病和变异、证据方向、FDA 记录及其适应证覆盖。

证据详情必须显示：

- Claim 类型和成熟度；
- 研究设计、样本量、人群、分期、线次和既往治疗；
- 干预、对照、终点、效应值、结论和限制；
- 来源题名、PMID、DOI、允许展示的原文摘录；
- 所属治疗关联和知识版本；
- 不展示内部模型 Prompt、置信思维过程或许可不允许的全文。

### 8.7 问答前端开发任务

#### 8.7.1 问答入口

路由建议：`/[locale]/ask`。

页面提供：

- 自然语言输入框；
- 可选的疾病、基因、变异和药物结构化上下文；
- 示例问题；
- 不输入个人身份信息的提示；
- 运行状态和停止等待入口；
- V1 为单轮问题，不实现开放多轮诊疗对话。

#### 8.7.2 运行中状态

用户可看到面向任务的阶段，不展示内部思维：

```text
正在理解问题
正在检索已审核证据
正在整理证据与限制
正在校验引用
```

前端通过轮询状态接口实现；SSE 可作为后续优化。页面刷新后可以根据 Question Run ID 恢复状态。

页面显示的阶段必须由后端实际完成的 Workflow Step 映射，不能用定时器伪造进度。“停止等待”只停止当前页面轮询并中止在途请求，不应误导为已取消服务端 Question Run；若未来提供取消能力，必须调用明确的取消接口并展示最终状态。

#### 8.7.3 回答结果

回答固定展示：

1. 证据结论；
2. 支持或耐药证据；
3. FDA 监管背景；
4. 研究人群与适用限制；
5. 不确定性和证据缺口；
6. 参考证据与原始来源；
7. 知识版本、生成时间和免责声明。

每条结论旁必须有可点击引用。点击引用展开 Evidence Claim，再点击进入来源详情。

#### 8.7.4 特殊结果状态

- `NEEDS_CLARIFICATION`：展示系统缺少的字段和一个最小补充问题；保留用户原始问题。
- `NO_CURATED_EVIDENCE`：说明当前知识版本未收录相关证据，不表述为医学上无效。
- `OUT_OF_SCOPE`：说明产品边界，不调用不必要的生成模型。
- `SUMMARY_UNAVAILABLE`：保留结构化证据卡片，说明自然语言综述暂不可用。
- `FAILED`：提供可重试入口，不重复创建 Question Run。

#### 8.7.5 用户反馈

用户可以提交：

- 有帮助 / 无帮助；
- 引用不相关；
- 回答遗漏重要限制；
- 结果难以理解；
- 其他文字反馈。

反馈关联 Question Run、回答版本和知识版本，不允许直接修改证据。

### 8.8 下游后端开发任务

#### 8.8.1 兼容现有能力

- 保留现有 `POST /api/v1/evidence-answer` 作为结构化固定意图查询；
- 复用现有 `normalize-query`、`build-evidence-pack`、生成和引用校验逻辑；
- 先将现有能力包装为可独立评估的 Skill，再新增自然语言 Agent；
- 模块化重构阶段不得改变现有公开接口返回和证据集合。

#### 8.8.2 知识浏览查询层

- 建立只读 Knowledge Catalog Repository；
- 所有列表和详情查询显式接收或锁定发布版本；
- 默认使用当前已发布版本；
- 查询必须包含审核和发布成员关系过滤；
- 为实体别名、规范键和常用关系补充索引；
- 统一分页、排序、过滤和错误协议；
- 接口只返回来源许可允许公开展示的字段。

#### 8.8.3 问题接收与隐私

- 输入只接受自然语言问题和可选结构化上下文；
- 限制请求体大小和问题长度；
- 检测明显个人身份字段，返回提示或使用脱敏文本继续；
- V1 默认不要求姓名、病历号、联系方式等身份信息；
- 运行记录保存脱敏问题、结构化问题和哈希；原始问题留存策略必须可配置；
- 限流按匿名会话或用户执行；
- 不支持的输入不触发后续模型和数据库重查询。

#### 8.8.4 问题结构化

规范化结果建议：

```json
{
  "intent": "EVIDENCE_QA",
  "disease": { "id": "disease_nsclc", "status": "RESOLVED" },
  "biomarkers": [
    {
      "geneId": "gene_egfr",
      "variantId": "variant_egfr_l858r",
      "status": "RESOLVED"
    }
  ],
  "drugIds": ["drug_osimertinib"],
  "clinicalContext": {
    "stage": null,
    "treatmentLine": null,
    "priorTherapy": null
  },
  "missingFields": [],
  "ambiguities": [],
  "riskLevel": "HIGH"
}
```

- 模型只负责提出实体候选和意图；
- 实体 ID 必须通过当前目录和别名表确定性解析；
- 疾病、基因、变异和药物候选集合必须从锁定的已发布目录读取，不得在解析代码中维护仅覆盖少量实体的硬编码白名单；
- 无法解析的实体不能用近似名称自动替代；
- 对治疗证据问题，疾病缺失时默认 `NEEDS_CLARIFICATION`；
- 结构化结果不满足 Schema 时进入安全失败，不使用自由文本继续。

#### 8.8.5 检索计划与 Evidence Pack

- Retrieval Plan 明确同疾病精确检索、跨适应证、耐药、监管和来源段落步骤；
- 精确实体匹配使用结构化查询；
- 语义或全文检索只能补充来源段落和发现候选，不能改变精确变异身份；
- Evidence Pack 构建前再次过滤审核状态、发布版本和模型使用策略；
- 所有 Evidence Pack 保存哈希，便于缓存、复现和审计；
- Evidence Pack 包含查询、发布版本、关系、Claim、来源段落、FDA 记录和限制；
- Answer Agent 只能接收 Evidence Pack，不直接拥有数据库或外部搜索 Tool。

#### 8.8.6 生成、QA 与安全门

- Answer Composition Agent 使用结构化输出；
- 每条 Statement 包含 `evidenceIds` 和适用的 `regulatoryApprovalIds`；
- QA Agent 检查语义支持、遗漏限制、夸大和监管混淆；
- 确定性校验检查引用白名单、关联归属、版本成员关系和返回 Schema；
- 安全规则拦截剂量、疗程、处方和个体化推荐表达；
- QA Agent 通过但确定性校验失败时仍视为失败；
- 生成失败或校验失败时返回 `SUMMARY_UNAVAILABLE` 和公开结构化证据；
- `NO_CURATED_EVIDENCE` 不调用 Answer Composition Agent；
- 回答缓存键至少包含规范问题、Evidence Pack 哈希、知识版本、Prompt 版本和 locale。

#### 8.8.7 下游公开 API

建议新增：

```text
GET  /api/v1/knowledge/summary
GET  /api/v1/knowledge/search
GET  /api/v1/knowledge/diseases
GET  /api/v1/knowledge/diseases/{id}
GET  /api/v1/knowledge/genes
GET  /api/v1/knowledge/genes/{id}
GET  /api/v1/knowledge/variants
GET  /api/v1/knowledge/variants/{id}
GET  /api/v1/knowledge/drugs
GET  /api/v1/knowledge/drugs/{id}
GET  /api/v1/knowledge/evidence/{id}
GET  /api/v1/knowledge/sources/{id}
POST /api/v1/evidence-questions
GET  /api/v1/evidence-questions/{id}
POST /api/v1/evidence-questions/{id}/feedback
```

问题请求示例：

```json
{
  "question": "NSCLC 患者携带 EGFR p.L858R，是否有奥希替尼相关治疗证据？",
  "locale": "zh-CN",
  "context": {
    "disease": "NSCLC",
    "gene": "EGFR",
    "variant": "p.L858R",
    "drug": "osimertinib"
  }
}
```

创建成功返回 `202`：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "questionRunId": "qr_123",
    "status": "RUNNING",
    "pollAfterMs": 1000
  }
}
```

Question Run 状态：

```text
PENDING
RUNNING
NEEDS_CLARIFICATION
ANSWERED
NO_CURATED_EVIDENCE
OUT_OF_SCOPE
SUMMARY_UNAVAILABLE
FAILED
CANCELLED
```

所有终态返回：

- Question Run ID；
- 规范化问题；
- 用户可见结果；
- 公开证据与来源；
- 知识版本；
- 文献截止日期；
- 生成时间；
- 免责声明。

内部 Trace、模型输出、Prompt 和成本不通过公开 API 返回。

### 8.9 下游验收标准

1. 用户可以分别从疾病、基因、变异和药物列表进入实体详情。
2. 使用别名搜索能够命中规范实体，但未知实体不会被模型猜测映射。
3. 所有公开实体、关系、Claim 和来源均属于同一已发布版本。
4. 支持范围内且字段完整的问题生成带引用回答。
5. 缺少疾病或存在实体歧义时返回 `NEEDS_CLARIFICATION`，不启动完整生成。
6. 无已审核证据时返回 `NO_CURATED_EVIDENCE`，不表述为药物无效。
7. 未审核、已驳回或未发布证据不会进入 Evidence Pack。
8. Answer Draft 中每个医学 Statement 至少有一个当前 Pack 内的有效引用。
9. 越界引用、错误关联或跨版本引用被确定性校验拒绝。
10. 合并变异人群不会被表述为精确变异独立结果。
11. FDA 在其他适应证获批不会被描述成当前疾病和变异已获批。
12. 回答保留研究人群、分期、线次、既往治疗和局限。
13. 模型失败时结构化证据仍可见。
14. 相同发布版本和规范问题得到相同检索证据集合。
15. 页面刷新后可以恢复运行中或已完成的 Question Run。

## 9. 共享平台前端与后端

### 9.1 共享前端任务

- 统一展示 Agent、Skill、Workflow 和运行版本；
- 提供上游与下游 Run Trace；
- 支持按 Agent、Skill、状态、日期和 Workflow 过滤；
- 提供单次运行的节点图、时间线、耗时、费用和错误；
- 提供评估集、评估运行、通过率和回归变化；
- 对高风险失败突出显示，不用颜色作为唯一状态表达；
- 将 Knowledge、Ask、Ops 等大型客户端组件按查询状态、表单、列表、详情和运行视图拆分，并为拆分出的业务模块建立组件测试；
- 所有主导航展示当前路由状态；移动抽屉支持焦点锁定、`Escape` 关闭和关闭后焦点返回；主要交互热区不小于 44px；
- 将页面中重复的颜色、边框、阴影和状态样式收敛为设计令牌，避免以零散硬编码形成多个视觉体系；
- 不向普通用户暴露内部运行信息。

### 9.2 共享后端任务

建议新增或等价实现以下领域模型：

| 领域模型                                   | 用途                               |
| ------------------------------------------ | ---------------------------------- |
| `skill_definition` / `skill_version`       | Skill 元数据、Schema、权限和版本   |
| `agent_definition` / `agent_version`       | Agent 目标、允许 Skill、模型和预算 |
| `workflow_definition` / `workflow_version` | 节点、分支、重试和人工节点         |
| `workflow_run`                             | 一次上游或下游工作流执行           |
| `workflow_step_run`                        | 节点状态、输入输出哈希、耗时和费用 |
| `workflow_artifact`                        | 不可变中间产物                     |
| `discovery_strategy`                       | 来源检索策略和游标                 |
| `discovery_run`                            | 一次由内部用户发起的知识发现       |
| `discovery_run_query`                      | Run 内展开的子检索、策略版本和游标 |
| `candidate_document`                       | 候选来源及去重、收录状态           |
| `evidence_draft`                           | Agent 草稿、字段来源和版本         |
| `review_task` / `review_decision`          | 审核任务、修改、决定和并发版本     |
| `knowledge_change_set`                     | 待发布正式知识差异                 |
| `question_run`                             | 自然语言问题状态和锁定发布版本     |
| `answer_validation`                        | QA Agent 与确定性校验结果          |
| `user_feedback`                            | 用户对答案和引用的反馈             |
| `evaluation_suite` / `evaluation_run`      | Agent、Skill 和 Workflow 评估      |

实现时可以在保证约束、查询和审计能力的前提下合并部分表；不得只把所有状态塞进一条不可查询的 JSON 日志。

`discovery_run` 或等价结构至少增加：`trigger_type=MANUAL`、`scope_mode`、`scope_snapshot`、`document_limit`、`estimated_match_count`、`unique_discovered_count`、`processed_document_count`、`source_cursor`、`preview_hash`、`paused_at`、`cancelled_at`。`document_limit` 为 `NULL` 时代表 `ALL`；数据库必须限制其他非空值只能为 50 或 100。

### 9.3 Artifact 契约

Workflow 节点之间通过版本化 Artifact 传递数据。第一批 Artifact：

```text
SourceSearchResult
CandidateDocument
EligibilityDecision
ExtractedEvidenceDraft
NormalizedEvidenceDraft
GradingProposal
IngestionQAReport
ReviewDecision
KnowledgeChangeSet
KnowledgeRelease
ClinicalQuestion
RetrievalPlan
EvidencePack
StructuredEvidenceAnalysis
AnswerDraft
AnswerValidationReport
PublicEvidenceAnswer
```

每个 Artifact 必须有：

- 稳定 ID；
- Artifact 类型和 Schema 版本；
- 创建者 Agent、Skill 或用户；
- 创建时间；
- 输入 Artifact 引用；
- 内容哈希；
- 所属 Workflow Run；
- 敏感性和公开策略。

## 10. 可观测性与评估

### 10.1 运行指标

上游至少记录：

- 按时间范围和单次 Run 统计的发现候选数；
- 去重、排除、待审核、批准、驳回和发布数；
- 每个节点成功率与重试率；
- 从发现到待审核、从待审核到发布的时间；
- 人工修改字段比例；
- 单条已发布证据的模型成本和人工时间。

下游至少记录：

- 问题类型分布；
- 澄清、拒答、无证据、回答和失败比例；
- 检索证据数；
- 引用校验失败率；
- Answer QA 问题类型；
- 回答延迟和模型成本；
- 用户反馈。

### 10.2 金标准评估集

在实现模型能力前先建立人工标注的代表性数据：

- 30 至 50 篇包含正例、负例、摘要不足、合并变异人群、耐药、跨适应证和重复文献的来源；
- 30 至 50 个包含完整问题、缺失疾病、歧义变异、无证据、比较、监管和越界请求的问题；
- 每个样本保存期望结构化输出、允许证据集合和禁止结论。

### 10.3 发布质量门

以下指标必须为 100%，否则不能对外发布：

- 未审核证据泄漏率为 0；
- 越界引用接受率为 0；
- 发布幂等测试通过率为 100%；
- 失败事务残留正式知识记录为 0；
- 回答中无引用医学 Statement 的接受率为 0。

抽取准确率、召回率、审核时间和问答质量目标在金标准集冻结后由产品与医学审核人员共同设定，未测量前不得写入对外宣传或简历成果。

## 11. 非功能要求

### 11.1 安全与隐私

- V1 不要求或主动收集患者身份信息；
- 日志、Trace 和错误信息不得保存密钥或未经脱敏的敏感字段；
- 外部来源内容遵守显示许可和模型使用许可；
- 所有内部写接口进行鉴权、角色校验、CSRF 或同等防护和审计；
- 发布接口使用幂等键和事务；
- 公开问答接口进行请求大小、频率和并发限制；
- 频率和并发限制使用 Redis、数据库或等价共享存储，不能只依赖单进程内存 Map；多实例下仍必须得到一致结果。

### 11.2 性能

- 知识列表和详情接口应使用分页和数据库索引；
- 直接知识浏览不应启动模型；
- Question Run 使用异步状态，避免长请求连接成为唯一执行状态；
- 相同发布版本与问题允许使用版本化缓存；
- 人工发起的批量更新任务使用独立队列和并发预算削峰，不与公开问答争抢无限并发；
- 应用与 Neon/PostgreSQL 优先同区域部署，并为连接建立、Knowledge 列表、详情、Ask 创建和轮询分别定义 p50/p95 延迟预算；
- 驾驶舱聚合指标使用预计算、缓存或增量汇总，不能在每次请求中扫描完整运行历史；达到预算前不得将偶发冷启动长延迟包装成稳定性能。

### 11.3 前端可维护性与可访问性

- 单个页面组件不继续堆叠检索、状态机、表单、渲染和埋点全部职责；新增功能前先按领域边界拆分现有大型组件；
- 键盘用户能够完成导航、发起更新、审核和问答；焦点顺序、错误提示、加载状态和决策结果可由辅助技术感知；
- 移动端抽屉、弹窗和二次确认遵守焦点锁定、`Escape` 关闭、焦点返回及触控热区要求；
- 不仅以颜色表达风险、成功、失败或当前步骤。

### 11.4 可恢复性

- Workflow 状态和 Artifact 持久化；
- 服务重启后可恢复未完成任务；
- 外部请求、模型调用和写入步骤区分可重试与不可重试错误；
- 支持单节点重试，但不能跳过必需前置节点；
- 已发布版本不可被失败的新任务破坏。

### 11.5 版本与复现

一次运行至少锁定并记录：

- Workflow 版本；
- Agent 版本；
- Skill 版本；
- Prompt / instructions 版本；
- 模型标识和主要配置；
- 规则版本；
- 输入 Artifact 哈希；
- 知识版本；
- 输出 Artifact 哈希。

## 12. 分阶段开发计划

### Phase 0：冻结基线与验收集

产品形态：现有结构化 Evidence Explorer 和 V0.2 后端继续可用。

前端任务：

- 记录现有证据页正常、无证据、越界和模型失败行为；
- 不改变公开行为。

后端任务：

- 固化当前公开接口契约；
- 建立上游和下游首批金标准数据集；
- 定义 Agent、Skill、Workflow 和 Artifact TypeScript 接口。

完成标志：当前回归用例通过，金标准数据和新行为验收用例进入仓库。

### Phase 1：共享 Skill Runtime 与知识浏览

前端任务：

- 建设知识首页、四类实体列表和详情页；
- 建设内部 Skill、Agent、Workflow 只读目录。

后端任务：

- 将现有规范化、Evidence Pack 和引用校验包装为 Skill；
- 建设只读 Knowledge Catalog API；
- 建立 Skill、Agent、Workflow 版本和基础运行日志。

完成标志：用户可以从四种实体角度浏览当前发布知识；现有问答行为不变。

### Phase 2：单篇文献辅助入库闭环

前端任务：

- 建设候选详情、原文对照和审核工作台；
- 支持修改、退回、驳回和批准并发布。

后端任务：

- 手工输入 PMID；
- 建立 Candidate、Draft、Review、Change Set 和发布事务；
- 先使用固定 Workflow 串联抽取 Skill，不要求完整 Agent 自主编排。

完成标志：一篇测试文献可以从 PMID 转换成待审证据，批准后形成新版本并被浏览和现有查询使用。

### Phase 3：上游多 Agent 与运行轨迹

前端任务：

- 建设 Workflow Run 时间线、节点详情、错误和重试界面；
- 在审核页显示 Agent 来源和 QA 报告。

后端任务：

- 启用 Planner、Discovery、Eligibility、Extraction、Normalization、Grading 和 QA Agent；
- 完成节点重试、人工 handoff、预算和恢复；
- 每个 Agent 使用受限 Skill 与 Tool 集合。

完成标志：正常、重试成功和转人工三条代表性路径均可演示并可追溯。

### Phase 4：人工发起的批量知识更新

前端任务：

- 建设“发起知识更新”表单、Preview 确认、Discovery Run 和运行摘要页面；
- 支持全库与指定疾病/基因/变异范围，以及 50、100、全部三种文献数量选项；
- 驾驶舱展示漏斗和失败告警。

后端任务：

- 完成 Scope Preview、PubMed 增量/指定范围检索、跨查询去重、数量上限、游标、持久队列和限流；
- 完成暂停、续跑、取消、失败恢复和幂等创建；
- 成功候选自动进入多 Agent 流程；
- 生成待审核队列，不自动发布。

完成标志：人工发起一次可配置范围和数量的更新任务后，新增、重复、排除和失败候选被正确分类，合格项进入待审核区。关闭页面或重启 Worker 不会丢失进度。

### Phase 5：自然语言问答多 Agent

前端任务：

- 建设 Ask 页面、运行状态、澄清、回答、引用、失败和反馈体验；
- 从回答跳转到 Claim 和来源详情。

后端任务：

- 建设 Answer Orchestrator、Question Understanding、Retrieval Planning、Evidence Analysis、Composition 和 QA Agent；
- 新增异步 Question Run API；
- 完成确定性引用与安全门；
- 保留现有结构化 API。

完成标志：完整、歧义、无证据、越界和模型失败问题均按协议返回，未审核数据不可见。

### Phase 6：评估、运营与面试演示闭环

前端任务：

- 建设评估看板、运行对比和成本质量趋势；
- 完成一条端到端演示入口。

后端任务：

- 自动运行上游与下游评估集；
- 比较 Agent、Skill、Prompt 和 Workflow 版本；
- 输出可复现评估报告；
- 增加完整审计导出。

完成标志：可以演示“人工定义范围并发起 → 系统批量发现与多 Agent 处理 → 待审 → 人审发布 → 知识浏览 → 问题回答 → 反向追溯”的完整案例，并有真实质量与效率数据。

## 13. 测试策略

本项目继续遵守仓库测试先行规则。每个 Phase 在实现前先提交用户可观察的验收用例并完成 RED，随后做最小实现转 GREEN。

### 13.1 单元测试

重点覆盖：

- Skill 输入输出 Schema；
- 全库与指定范围规范化、实体冲突和子查询展开；
- 50、100 与全部文献数量语义和跨查询去重上限；
- 实体规范化；
- PMID、DOI 和哈希去重；
- 状态机转换；
- 检索计划；
- Evidence Pack 构建；
- 等级规则；
- 引用白名单；
- 发布版本成员关系；
- 拒答和安全规则；
- 缓存键和幂等键。

### 13.2 组件测试

重点覆盖：

- 知识列表筛选与空状态；
- 实体详情关系和引用跳转；
- 审核字段编辑、原文高亮和未保存提醒；
- 发起更新表单、Preview、范围冲突、数量选择、全部二次确认和失败恢复；
- 批准确认、并发冲突和失败提示；
- 退回字段必填、驳回原因必填和决策后状态刷新；
- Question Run 状态恢复；
- 澄清、无证据、模型失败和引用展开；
- 键盘操作和可访问名称。
- Knowledge、Ask、Ops 主组件拆分后的核心用户行为和错误边界。

### 13.3 接口与服务集成测试

重点覆盖：

- 内部接口鉴权与角色边界；
- 外部来源成功、限流、超时和非法响应；
- Preview 不产生候选，Preview Token 不可篡改，Run 创建幂等；
- 分页获取、跨策略去重、数量上限、暂停、续跑和取消语义；
- Agent 输出非法 Schema；
- 最大重试和人工 handoff；
- 未审核数据隔离；
- 审核乐观锁；
- 发布事务回滚；
- 重复批准幂等；
- 自然语言问题完整、缺失、歧义、越界和无证据协议；
- 模型失败仍返回结构化证据。

HTTP 测试继续默认拦截未声明网络请求，只 mock 外部边界，不 mock 被测业务流程。

### 13.4 数据库测试

使用独立测试数据库验证：

- 唯一键和外键；
- 候选和发布幂等；
- 审核并发控制；
- 知识发布原子性；
- 版本不可变；
- 发布成员关系过滤；
- 失败回滚后无残留。
- PostgreSQL Repository 的真实查询、分页、发布版本隔离和并发更新，不以 mock Repository 替代数据库语义验证。

### 13.5 E2E

至少覆盖：

1. 内部用户提交 PMID，看到待审草稿，批准并发布；
2. 内部用户选择一个基因和 50 篇上限，预览后发起更新，刷新页面后仍可看到进度和范围；
3. 全库 + 全部文献需二次确认，分页执行中可暂停和续跑；
4. 发现的新证据进入可导航的审核队列，退回和驳回必填项与后端契约一致；
5. 新证据出现在实体详情和证据详情；
6. 用户问题使用新版本并引用新证据；
7. 普通用户无法访问 Ops 页面或草稿接口；
8. 模型回答失败时仍展示证据卡片。

每轮实现运行受影响测试；交付前运行 `pnpm verify`。页面、路由、鉴权、依赖、数据库迁移或构建配置变化还必须运行 `pnpm verify:full`，数据库变化另运行独立数据库测试。

交付前还必须运行 `git status --short` 核对新增平台代码、迁移、测试和文档均已纳入版本控制；未跟踪的核心文件不能作为已完成交付物。

## 14. 端到端最终验收

V1 完成必须现场跑通以下案例：

1. 内部用户选择全库或指定疾病、基因、变异，并选择 50、100 或全部文献；
2. 系统在不调用抽取模型的前提下预览规范化范围、时间窗和预估结果数；
3. 用户确认后创建一次人工触发的 PubMed Discovery Run，任务在页面关闭后持续执行；
4. 新文献通过多 Agent 生成带原文定位的待审核证据；
5. QA Agent 标记至少一个需要审核关注的适用性或完整性问题；
6. 医学审核人员通过可导航的审核队列进入工作台，修改并批准；
7. 系统通过单一事务写入正式知识并创建新发布版本；
8. 新证据出现在疾病、基因、变异和药物相关页面；
9. 用户提出与该证据相关的自然语言问题；
10. 系统使用新发布版本生成带有效引用的回答；
11. 回答可以追溯到 Claim、来源段落、Review Task、Workflow Run、Agent 和 Skill 版本；
12. 重新运行相同范围、时间窗、数量限制和批准请求不会产生重复数据。

## 15. 待确认但不阻塞首期开发的事项

以下事项采用默认值启动，后续产品评审可调整：

| 事项          | V1 默认决定                                                       |
| ------------- | ----------------------------------------------------------------- |
| 更新触发方式  | 当前只支持内部用户人工发起；不建设每周自动调度                    |
| 默认文献上限  | 50；用户可改为 100 或全部，全部需预览和二次确认                   |
| 首个自动来源  | PubMed；PMC 仅作为合法全文补充                                    |
| 审核与发布    | 作品集 MVP 使用单人 `APPROVE_AND_PUBLISH`；生产化再评估双人复核   |
| 发布粒度      | 一个 Review Task 形成一个 patch release；规模增加后再改为批量发布 |
| 自然语言问答  | 单轮、受支持意图，不做开放多轮诊疗对话                            |
| 向量检索      | 结构化检索优先；只在评估证明有价值后用于段落补充召回              |
| Workflow 编辑 | 受控声明式表单与版本管理；不先做自由拖拽画布或任意代码执行        |
| 原始问题留存  | 默认保存脱敏问题与哈希，原文留存策略配置化                        |
