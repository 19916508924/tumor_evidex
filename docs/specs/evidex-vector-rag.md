# Evidex 向量数据库与混合 RAG 技术规格

> 状态：设计完成，待实施
> 日期：2026-09-17
> 适用范围：已审核知识发布、自然语言问答、Knowledge 浏览与 Agent/Skill 平台

## 1. 决策摘要

Evidex 不应把现有结构化知识库替换成一个只靠相似度的“纯向量库”。推荐方案是：

```text
Neon PostgreSQL（现有业务与版本数据）
+ pgvector（语义向量检索）
+ PostgreSQL 全文检索（基因、变异、PMID、药物等精确词）
+ 现有结构化关系检索（疾病、基因、变异、药物、FDA、证据等级硬过滤）
= 发布版本隔离的混合 RAG
```

核心原则：

1. **只有已人工审核、属于已发布 Release、且允许模型处理的内容才能进入可用向量索引。**
2. **向量检索负责找语义相关的 Claim 和 Passage，不负责判断变异身份、FDA 状态或证据等级。**
3. **结构化检索继续作为医学安全门。** 疾病、精确变异、药物、证据方向、审核状态和 Release 成员关系必须由数据库确定。
4. **问答使用混合检索。** 向量召回、全文关键词召回和结构化精确召回合并后，再扩展为完整 Evidence Pack。
5. **索引按知识版本构建并审计。** 新 Release 的向量索引未达到 `READY` 前，不能成为公开问答使用的最新版本。
6. **不新增外部向量数据库。** 第一版直接在现有 Neon PostgreSQL 启用 pgvector，减少双写、权限、版本一致性和运维成本。

## 2. 当前实现审计

截至 2026-09-17，现有下游问答流程为：

```text
自然语言问题
→ 确定性实体解析
→ 锁定最新 PUBLISHED Release
→ PostgreSQL 结构化精确检索
→ Evidence Pack
→ 大模型归纳
→ 引用白名单校验
```

当前已经具备且必须保留：

- `knowledge_release`、`knowledge_release_association`、`knowledge_release_claim` 的版本成员关系；
- `review_status = APPROVED` 审核门禁；
- `source_passage.model_use_policy = ALLOWED` 模型使用门禁；
- Evidence Pack、回答缓存、引用白名单和历史 Release 复现；
- 异步 Question Run、持久 Worker、Agent/Skill Trace；
- 待审核、批准发布和 Knowledge 浏览链路。

当前缺少：

- embedding 生成服务；
- pgvector 表和检索 Repository；
- Release 向量索引构建状态；
- 向量召回、全文召回、融合排序和召回评估；
- 发布完成前的向量索引就绪门禁；
- Ops 侧索引状态、失败重试和检索轨迹。

当前数据库实测：

- 最新已发布版本：`v0.2.0`；
- 已发布 Claim：20 条；
- 已审核且 `model_use_policy = ALLOWED` 的关联 Passage：15 条；
- Neon 可用 `pgvector 0.8.6`，当前尚未执行 `CREATE EXTENSION vector`；
- 当前 Drizzle 版本已支持 `vector` 字段、余弦距离和 HNSW 索引。

由于当前语料很小，V1 使用 pgvector **精确余弦检索**。在语料达到至少 10,000 个 Chunk 且基准测试证明有必要之前，不启用近似 HNSW 作为默认路径。医学证据检索优先保证召回率和可复现性。

## 3. 产品目标与非目标

### 3.1 本期目标

- 中文问题能够召回英文文献中的语义相关证据；
- 支持“有哪些治疗证据”“耐药证据是什么”“研究人群和限制是什么”等自然语言问法；
- 新证据批准后自动生成向量，索引就绪后才进入公开问答；
- 每次回答可以追溯到 Release、索引版本、embedding 模型、Chunk、Claim、Passage 和原始来源；
- 向量服务失败时不泄漏草稿，也不把半成品索引投入使用；
- 保持现有 `/api/v1/evidence-answer` 和异步 Ask 的公开返回兼容。

### 3.2 本期非目标

- 不用向量相似度自动确认未知变异就是某个规范变异；
- 不用向量相似度自动改变 Evidex 证据等级；
- 不用向量相似度代替 FDA 适应证核验；
- 不索引未审核 Draft、REJECTED 证据或未发布 Release；
- 不把整篇受版权限制的论文发送给 embedding 服务；
- 不新增 Pinecone、Weaviate、Milvus 等独立服务；
- 不在第一版引入收费 reranker，先用可解释的融合排序建立基线。

## 4. 目标链路

### 4.1 发布与索引链路

```text
人工批准证据
→ 创建 DRAFT Knowledge Release
→ 写入已审核 Claim / Passage / Release 成员关系
→ 创建 RELEASE_INDEX_BUILD Job
→ Chunk Materialization Skill 生成规范 Chunk
→ Embedding Skill 批量生成向量
→ Index QA Skill 校验数量、哈希、维度、权限和 Release 成员关系
→ rag_index_build = READY
→ 在同一事务中将 Knowledge Release 切换为 PUBLISHED
→ 公开 Knowledge 与 Ask 开始使用新版本
```

构建失败时：

- 新 Release 保持 `DRAFT`；
- Review Task 进入 `PUBLISH_FAILED`；
- 保存失败原因和成功进度，允许幂等重试；
- 上一个 `PUBLISHED + READY` 版本继续服务，不影响用户问答。

### 4.2 问答检索链路

```text
自然语言问题
→ Question Understanding Agent
→ 确定性解析疾病 / 基因 / 变异 / 药物
→ 锁定一个 PUBLISHED Release 及其 READY 向量索引
→ 构造规范 Query Text 并生成 Query Embedding
→ 结构化硬过滤
→ Vector Recall Skill
→ Lexical Recall Skill
→ Hybrid Rank Skill
→ 将命中 Chunk 扩展为完整 Claim / Association / FDA / Passage
→ Evidence Pack
→ Evidence Analysis / Answer Composition / Answer QA
→ 引用、版本和安全确定性校验
```

## 5. 数据模型

### 5.1 `rag_index_build`

每次 Release 和 embedding 配置对应一个可审计索引构建。

| 字段                      | 类型                 | 说明                                            |
| ------------------------- | -------------------- | ----------------------------------------------- |
| `id`                      | text PK              | 索引构建 ID                                     |
| `knowledge_release_id`    | text FK              | 对应知识版本                                    |
| `status`                  | text                 | `PENDING / BUILDING / READY / FAILED / RETIRED` |
| `embedding_provider`      | text                 | embedding 服务商                                |
| `embedding_model`         | text                 | 固定模型 ID                                     |
| `embedding_dimensions`    | integer              | 向量维度                                        |
| `chunker_version`         | text                 | Chunk 规则版本                                  |
| `retrieval_version`       | text                 | 融合检索规则版本                                |
| `expected_chunk_count`    | integer              | 预期 Chunk 数                                   |
| `embedded_chunk_count`    | integer              | 已成功生成数                                    |
| `failed_chunk_count`      | integer              | 失败数                                          |
| `manifest_hash`           | text                 | 稳定排序后的 Chunk 清单哈希                     |
| `error_code`              | text nullable        | 可机器识别错误                                  |
| `error_summary`           | text nullable        | 脱敏错误摘要                                    |
| `started_at`              | timestamptz          | 开始时间                                        |
| `completed_at`            | timestamptz nullable | 完成时间                                        |
| `created_at / updated_at` | timestamptz          | 审计时间                                        |

唯一约束：

```text
(knowledge_release_id, embedding_provider, embedding_model,
 embedding_dimensions, chunker_version, retrieval_version)
```

### 5.2 `rag_chunk`

V1 使用“一条索引构建对应一份 Release Chunk 快照”的简单模型，优先保证版本隔离和可复现性。数据量明显增长后再评估按内容哈希去重。

| 字段                     | 类型             | 说明                                             |
| ------------------------ | ---------------- | ------------------------------------------------ |
| `id`                     | text PK          | 稳定 Chunk ID                                    |
| `index_build_id`         | text FK          | 对应 `rag_index_build`                           |
| `knowledge_release_id`   | text FK          | 直接过滤 Release                                 |
| `chunk_type`             | text             | `CLAIM_SUMMARY / SOURCE_PASSAGE / REGULATORY`    |
| `association_id`         | text nullable FK | 治疗关联                                         |
| `evidence_claim_id`      | text nullable FK | Claim                                            |
| `source_passage_id`      | text nullable FK | 来源段落                                         |
| `regulatory_approval_id` | text nullable FK | FDA 记录                                         |
| `content`                | text             | 实际用于 embedding 的规范文本                    |
| `content_hash`           | text             | 内容哈希，支持幂等与缓存                         |
| `language`               | text             | 内容语言                                         |
| `metadata`               | jsonb            | 疾病、基因、变异、药物、方向、等级等可审计元数据 |
| `embedding`              | `vector(D)`      | 模型向量；D 在选定模型后固化                     |
| `text_search`            | `tsvector`       | PostgreSQL 全文检索字段                          |
| `created_at`             | timestamptz      | 生成时间                                         |

必须建立：

- `(knowledge_release_id, index_build_id)` B-tree；
- `evidence_claim_id`、`association_id`、`regulatory_approval_id` B-tree；
- `text_search` GIN；
- V1 暂不强制 HNSW；达到规模阈值并通过召回评估后增加 `embedding vector_cosine_ops` HNSW。

### 5.3 为什么按 Release 保存 Chunk

- 查询可以直接写 `WHERE knowledge_release_id = ? AND index_build_id = ?`；
- 历史回答不会被新内容或重新 embedding 污染；
- 新索引可以在后台完整构建，只有 `READY` 后才原子切换；
- 失败索引可整批删除或重建，不影响当前线上版本；
- 面试演示时容易解释“知识版本”和“向量版本”如何一起审计。

## 6. Chunk 设计

Evidex 已有人工审核后的原子 Passage 和 Claim，不需要盲目按固定字符切整篇论文。

### 6.1 `CLAIM_SUMMARY`

每条已发布 Claim 生成一个规范文本，建议顺序固定：

```text
Disease: Non-small cell lung cancer (NSCLC)
Gene: EGFR
Variant: EGFR p.L858R
Therapy: osimertinib
Direction: sensitivity
Evidence level: 1
Study type: phase 3 randomized trial
Population: ...
Intervention: ...
Endpoint and effect: ...
Conclusion: ...
Limitations: ...
```

用途：让中文或自由表达的问题召回到完整结构化证据。

### 6.2 `SOURCE_PASSAGE`

- 直接使用已审核 `source_passage`；
- 仅包含 `review_status = APPROVED` 且 `model_use_policy = ALLOWED`；
- 不索引 `PROHIBITED` Passage；
- `LINK_ONLY` 只影响公开展示，不自动禁止模型使用，仍以 `model_use_policy` 为准；
- Passage 必须通过 `knowledge_release_claim → evidence_claim_passage` 证明属于目标 Release。

### 6.3 `REGULATORY`

将 FDA 记录的适应证、biomarker、状态、日期和覆盖关系生成单独 Chunk。检索命中后仍必须回到结构化 `regulatory_approval` 数据判断 `MATCHED_INDICATION / OTHER_INDICATION`，不能由向量文本自行判断。

### 6.4 Chunk 稳定性

- Chunk 内容必须确定性序列化；
- `chunk_id` 由 Release、类型、来源 ID、`chunker_version` 和 `content_hash` 生成；
- 相同输入重跑不产生重复记录；
- Chunk 文本规则变更必须升级 `chunker_version` 并重建索引；
- embedding 模型或维度变化必须创建新索引构建，不能在原索引中混用。

## 7. Embedding Provider

新增服务端接口：

```ts
interface EmbeddingProvider {
  readonly provider: string;
  readonly model: string;
  readonly dimensions: number;

  embedDocuments(texts: string[]): Promise<number[][]>;
  embedQuery(text: string): Promise<number[]>;
}
```

环境变量建议：

```bash
EVIDEX_EMBEDDING_PROVIDER="openai-compatible"
EVIDEX_EMBEDDING_MODEL="text-embedding-3-small"
EVIDEX_EMBEDDING_DIMENSIONS="1536"
EVIDEX_EMBEDDING_BASE_URL="https://.../v1"
EVIDEX_EMBEDDING_API_KEY="..."
EVIDEX_EMBEDDING_BATCH_SIZE="64"
EVIDEX_CHUNKER_VERSION="evidex-chunk-v1"
EVIDEX_RETRIEVAL_VERSION="hybrid-rag-v1"
```

实施规则：

- API Key 只放 `.env.local` 或部署平台 Secret，不写入仓库和聊天；
- 文档 embedding 只发送 `model_use_policy = ALLOWED` 的内容；
- 批量接口要有超时、指数退避、有限重试和幂等缓存；
- 校验返回数量、维度、有限数值和非零向量；
- 日志不得保存 API Key、原始未脱敏问题或未授权全文；
- Query 和 Document 必须使用同一个模型、维度和规范化策略。

如无其他选择，第一版默认使用支持 `/v1/embeddings` 的 OpenAI-compatible 服务和 1536 维模型。现有 Evolink 配置已确认支持 Chat Completions，但不能假设同一 Key 和 Base URL 一定提供 embeddings；实施前必须确认具体 endpoint 与模型。

## 8. 检索策略

### 8.1 Query Text

Question Understanding 完成后，将用户问题和已解析实体组成稳定文本：

```text
Intent: EVIDENCE_QA
Disease: NSCLC
Gene: EGFR
Variant: EGFR p.L858R
Drug: osimertinib
Question: EGFR L858R 在非小细胞肺癌中有哪些已审核治疗证据？
```

缺失疾病且业务规则要求疾病时，继续返回 `NEEDS_CLARIFICATION`，不能用向量最近邻猜一个疾病。

### 8.2 结构化硬过滤

向量 SQL 执行前至少过滤：

- `knowledge_release.status = PUBLISHED`；
- `rag_index_build.status = READY`；
- Question Run 锁定的 `knowledge_release_id` 和 `index_build_id`；
- 已解析的疾病、基因、精确变异和可选药物；
- 现有同疾病 / 跨适应证传播规则；
- Claim、Association、Passage 和 FDA 的审核及 Release 成员关系；
- `model_use_policy = ALLOWED`。

### 8.3 三路召回

1. **Structured Recall**：保留现有精确关系检索。对于“有哪些已审核证据”一类完整性问题，所有符合规则的精确匹配 Claim 都是必选候选。
2. **Vector Recall**：在硬过滤范围内按 cosine distance 取前 30 个 Chunk。
3. **Lexical Recall**：使用 PostgreSQL 全文检索和规范字段匹配取前 30 个，保护 `EGFR`、`L858R`、药名、PMID 等精确术语。

### 8.4 融合与扩展

- V1 使用 Reciprocal Rank Fusion 合并 Vector 与 Lexical 排名；
- Structured Recall 是准入和必选集合，不和相似度竞争；
- 合并后按 Claim 去重，保留命中的 Chunk 和得分来源；
- 一旦某个 Claim 被选中，必须回库扩展完整 Association、所有允许使用的支持/限制 Passage、药物和 FDA 元数据；
- 检索分数不能改变 `approvedLevel`、`direction` 或 `regulatoryAlignment`；
- 对敏感、耐药、监管、限制分别保留覆盖，不能只返回高相似度的有利结论；
- 最终 Evidence Pack 继续使用稳定排序和哈希。

### 8.5 小数据与大数据模式

当前 15 个可用 Passage 直接执行精确余弦查询即可。建议切换条件：

| 模式         | 使用条件                                    | 特点                     |
| ------------ | ------------------------------------------- | ------------------------ |
| Exact cosine | 默认；Chunk 少于 10,000 或延迟达标          | 召回确定、易复现         |
| HNSW cosine  | 数据量和 QPS 导致精确检索不达标，且评估通过 | 更快，但必须监控召回损失 |

启用 HNSW 前必须用同一金标准集比较 Exact 与 HNSW 的 Recall@K。不得只因为“向量数据库通常有索引”就提前切换。

## 9. Agent 与 Skill 设计

### 9.1 新增 Agent

| Agent                  | 职责                                      | 禁止行为                                 |
| ---------------------- | ----------------------------------------- | ---------------------------------------- |
| Release Indexing Agent | 编排 Release Chunk、embedding、校验和激活 | 不审核医学内容，不直接发布未就绪 Release |
| Hybrid Retrieval Agent | 执行结构化、向量和全文召回并构建候选集    | 不修改实体身份、等级或监管状态           |

### 9.2 新增 Skill

发布侧：

- `materialize_release_chunks`
- `compute_chunk_manifest`
- `generate_document_embeddings`
- `validate_embedding_dimensions`
- `validate_release_index_coverage`
- `activate_ready_release_index`
- `retry_failed_index_build`
- `retire_release_index`

问答侧：

- `build_embedding_query`
- `generate_query_embedding`
- `retrieve_vector_chunks`
- `retrieve_lexical_chunks`
- `fuse_retrieval_results`
- `expand_chunks_to_evidence`
- `validate_vector_release_membership`
- `build_hybrid_evidence_pack`

所有 Skill 必须有 Zod 输入输出 Schema、版本、超时、最大重试和 Trace。向量查询是确定性 Tool，不让 LLM 自己拼 SQL。

## 10. 发布流程改造

当前 `APPROVE_AND_PUBLISH` 在一个事务里立即把新 Release 标记为 `PUBLISHED`。引入向量索引后改为两段式：

### 阶段 A：医学批准事务

- 校验草稿版本、批准说明和 Blocking QA；
- 写入正式 Claim / Passage 和 Release 成员关系；
- 创建 `DRAFT` Release；
- 创建 `rag_index_build(PENDING)` 和 `RELEASE_INDEX_BUILD` Job；
- Review Task 改为 `PUBLISHING`；
- 返回 Release ID、版本和索引构建状态。

### 阶段 B：索引激活事务

- Worker 完成 Chunk 和 embedding；
- 校验预期数量 = 实际数量、维度一致、哈希一致、无未审核内容；
- 将 `rag_index_build` 改为 `READY`；
- 将 Release 改为 `PUBLISHED`；
- 将 Review Task、Candidate 和 Workflow 改为 `PUBLISHED / SUCCEEDED`。

任一步失败：索引为 `FAILED`、Review Task 为 `PUBLISH_FAILED`、Release 仍为 `DRAFT`。重试复用同一 Release 和 Index Build，不重复创建医学记录。

### 10.1 首次迁移与回填

1. 创建 pgvector 扩展和新表；
2. 不改变当前 `v0.2.0` 的公开状态；
3. 为 `v0.2.0` 创建一次性 Backfill Index Build；
4. 校验通过后标记为 `READY`；
5. 启用 Hybrid Retrieval Feature Flag；
6. 新发布任务再切换为两段式。

这样可以避免迁移时让现有问答停服。

## 11. 失败与降级

| 场景                         | 行为                                                                                     |
| ---------------------------- | ---------------------------------------------------------------------------------------- |
| Query embedding 超时         | 精确结构化问题降级到现有结构化检索；向量必需的开放问题返回可解释失败，不伪装成“没有证据” |
| 新 Release 索引失败          | 继续使用上一版 `PUBLISHED + READY` Release                                               |
| 索引 Chunk 数不完整          | 不允许 `READY`，不发布 Release                                                           |
| 向量维度不一致               | 整批构建失败，禁止部分写入成为可用索引                                                   |
| 召回到错误 Release           | 确定性门禁拒绝整个结果并记录高优先级告警                                                 |
| 召回到未审核内容             | 确定性门禁拒绝，视为安全缺陷，不允许回答                                                 |
| 向量检索无结果但结构化有结果 | 使用结构化结果并记录召回缺口，用于评估改进                                               |

不得把基础设施失败返回为 `NO_CURATED_EVIDENCE`，否则用户会误以为知识库没有证据。

## 12. 前端与运营页面

### 12.1 Ops 增加“向量索引”页面

建议路由：`/[locale]/ops/vector-indexes`。

显示：

- Release、索引状态、embedding provider/model/dimensions；
- Chunker 和 Retrieval 版本；
- 预期、成功、失败 Chunk 数及覆盖率；
- 开始、完成、耗时、Manifest Hash；
- 失败原因、重试按钮、历史构建；
- 当前公开问答实际使用的 Release + Index。

### 12.2 审核发布页面

批准后不立即显示“已发布”，而是：

```text
医学审核已通过 → 正在构建检索索引 → 校验通过 → 发布完成
```

关闭页面后任务继续执行，重新打开可恢复真实状态。

### 12.3 Ask 内部追踪

普通用户只看到知识版本、引用和来源。Ops Trace 可查看：

- 规范化实体；
- Structured / Vector / Lexical 各自命中；
- 相似度、RRF 排名和去重结果；
- 最终进入 Evidence Pack 的 Claim；
- Release、Index、Embedding、Chunker、Retrieval 版本；
- 降级原因。

不展示模型思维过程。

## 13. API 与兼容性

公开接口保持兼容。可在 `knowledge` 元数据中新增可选字段：

```json
{
  "release": "v0.2.0",
  "retrieval": {
    "mode": "HYBRID",
    "indexVersion": "idx_v0.2.0_...",
    "embeddingModel": "text-embedding-3-small",
    "retrievalVersion": "hybrid-rag-v1"
  }
}
```

内部新增建议：

```text
GET  /api/internal/v1/vector-indexes
GET  /api/internal/v1/vector-indexes/{id}
POST /api/internal/v1/vector-indexes/{id}/retry
POST /api/internal/v1/vector-indexes/releases/{releaseId}/rebuild
```

重建和重试要求管理员权限、同源校验和幂等键。

## 14. 分阶段开发任务

### Phase 0：建立检索金标准

后端：

- 从当前 20 条 Claim 建立 30—50 个中英文问题；
- 标注每个问题必须命中的 Claim ID、允许命中的 Claim ID 和禁止命中的 Claim ID；
- 固化现有结构化检索结果作为回归基线。

可见效果：得到一份可以量化 Recall、Precision 和越权泄漏的评估报告。

完成标准：未审核泄漏 0；引用越界 0；现有结构化问题结果不变。

### Phase 1：pgvector、表结构和 Embedding Provider

后端：

- 增加扩展迁移、`rag_index_build`、`rag_chunk` 和必要索引；
- 实现 Embedding Provider、批处理、校验、缓存和失败协议；
- 为当前 `v0.2.0` 回填向量。

前端：

- Ops 增加只读索引列表与详情。

可见效果：Ops 能看到 `v0.2.0` 的 Chunk 数、模型、进度和 `READY` 状态。

### Phase 2：混合检索接入问答

后端：

- 实现 Query Embedding、Vector/Lexical/Structured Recall、RRF 和 Evidence 扩展；
- 接入现有 Evidence Pack 与引用校验；
- 保存真实 Skill Trace 和检索版本；
- Feature Flag 灰度比较 `STRUCTURED` 与 `HYBRID`。

前端：

- Ask 保持原结果结构；
- Ops Question Trace 增加检索命中和降级原因。

可见效果：不同自然语言表达可以召回同一证据；问答仍只引用已审核来源。

### Phase 3：发布与索引原子门禁

后端：

- 增加 `RELEASE_INDEX_BUILD` Job 和 Release Indexing Agent；
- 将批准发布改为 `PUBLISHING → PUBLISHED` 两段式；
- 实现失败重试、幂等恢复和旧版本继续服务。

前端：

- 审核页展示真实索引构建阶段；
- Ops 提供失败重试。

可见效果：批准新证据后先显示“正在构建检索索引”，就绪后自动进入知识库和 Ask。

### Phase 4：评估与规模化

后端：

- 自动运行金标准并保存版本对比；
- 记录 Recall@5/10、MRR、无关召回率、检索延迟和 embedding 成本；
- 数据量和延迟达到阈值后评估 HNSW；
- 只有 HNSW Recall 达标才允许切换。

前端：

- 增加检索质量和成本看板。

可见效果：面试时可以展示“模型/Chunk/检索版本变化如何影响质量、速度和成本”。

## 15. 测试与验收

### 15.1 必测安全用例

1. DRAFT、IN_REVIEW、REJECTED 数据永远不进入可用索引；
2. 不属于目标 Release 的 Chunk 永远不进入本次 Evidence Pack；
3. `model_use_policy = PROHIBITED` 内容不会发送给 embedding 服务；
4. `rag_index_build != READY` 时不能被公开问答使用；
5. 新索引构建失败时，上一发布版本继续正常回答；
6. 历史 Release 的相同问题仍得到相同候选集合；
7. Query 与文档向量模型或维度不一致时必须失败关闭；
8. 检索分数不能修改等级、方向、FDA 覆盖或引用 ID；
9. 结构化存在证据但向量漏召回时，不得错误返回 `NO_CURATED_EVIDENCE`；
10. 发布激活、任务状态和索引状态在失败时可以恢复且不产生重复数据。

### 15.2 初始质量门槛

| 指标                       | 门槛                     |
| -------------------------- | ------------------------ |
| 未审核 / 跨 Release 泄漏   | 0                        |
| 引用白名单违规             | 0                        |
| 金标准 Recall@10           | ≥ 95%                    |
| 精确变异识别正确率         | 100%（由结构化解析保证） |
| 当前 V0.2 回归问题证据集合 | 100% 保持                |
| 索引覆盖率                 | 100% eligible Chunk      |
| 索引构建幂等               | 重跑不重复、不污染       |

延迟门槛先采集基线再定。Embedding 网络时间与数据库检索时间必须分开记录。

## 16. 需要产品负责人提供或确认的内容

真正开始编码前只存在一个阻塞项：**embedding 服务配置**。

请提供或确认：

1. 支持 `/v1/embeddings` 的服务商、Base URL、模型 ID 和向量维度；
2. 将对应 API Key 写入本机 `.env.local`，不要粘贴到聊天或提交到 Git；
3. 如果希望继续使用 Evolink，请先确认当前账号可用的 embedding endpoint 和模型；现有 Chat Key 不能自动视为已具备 embedding 能力。

非阻塞但强烈建议后续提供：

- 20—50 个真实面试演示问题及预期证据；
- 5—10 个“很像但绝不能误命中”的负例；
- 可接受的单次问答延迟和每月 embedding 成本上限。

如产品负责人不指定，开发默认采用：OpenAI-compatible `/v1/embeddings`、1536 维模型、精确 cosine、Vector Top 30、Lexical Top 30、RRF、最终按 Claim 去重并扩展 Evidence Pack。

## 17. 面试展示重点

这次改造的亮点不是“用了向量数据库”，而是：

- 发现纯向量检索不适合直接决定医学实体和证据等级，因此设计了结构化硬过滤与语义召回结合的混合 RAG；
- 把人工审核、知识 Release 和向量索引做成同一个发布门禁，杜绝未审核证据进入回答；
- 把 embedding、Chunk、检索和排序都版本化，使每次回答可复现、可评估、可回滚；
- 用 Agent 负责流程编排，用 Skill 封装可测试能力，用确定性规则守住医学安全边界；
- 先按当前真实数据规模使用精确检索，再用指标决定是否启用 HNSW，体现产品和工程取舍，而不是为了技术名词过度设计。
