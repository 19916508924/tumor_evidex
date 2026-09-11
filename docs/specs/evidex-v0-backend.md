# Evidex V0 后端技术规格

## 1. 文档状态

- 状态：可进入开发；首批医学内容与具体等级仍需用户复核后才能发布
- 版本：`0.1.0`
- 日期：2026-09-09
- 产品范围：`NSCLC + EGFR p.L858R`
- 监管范围：美国 FDA
- 文献范围：PubMed 索引文献，PMC 开放全文优先
- 实现范围：真实后端、结构化检索、受约束的大模型归纳；Landing Page 后置

本规格是 V0 开发、测试和验收的实现依据。README 保留产品摘要；字段、规则、接口和验收细节以本文件为准。

本文中的“必须”表示验收要求，“应该”表示默认实现建议；偏离“应该”时，开发者必须在变更说明中写明原因和替代验证。

## 2. 背景与目标

Evidex 的长期目标是建立一个由疾病、基因、变异、药物等知识实体组成，并通过可追溯证据表达实体关系的肿瘤循证知识库。V0 不以完整覆盖为目标，只验证以下真实闭环：

1. 将一次性收集并经用户复核的知识导入 PostgreSQL；
2. 接收结构化的疾病和变异输入；
3. 从已发布知识版本中确定性检索同适应证和受限跨适应证证据；
4. 仅保留在任一适应证存在有效 FDA 批准记录的药物；
5. 将全部匹配证据及其原文段落组成 evidence pack；
6. 由大模型生成结构化、有引用、保留适用限制的中文循证综述；
7. 在返回前校验模型引用和输出边界；
8. 即使模型失败，仍返回可追溯的结构化证据。

V0 验证的是“知识入库后到回答”的后端链路。长期自动检索、自动抽取、审核后台和持续更新流程不属于本次实现。

## 3. 已确认的产品决策

### 3.1 知识库与 V0 范围分离

数据库模型不得将 `NSCLC`、`EGFR`、`p.L858R` 或“FDA 已批准”固化为全局准入约束。

- 知识库模型允许保存其他疾病、基因、变异、药物、监管机构、批准状态和证据类型；
- V0 的收集范围由一次性数据包定义；
- V0 的回答范围由发布版本和检索策略定义；
- 后续扩展不得要求重建核心数据模型。

### 3.2 知识实体

V0 建立四类一级知识实体：

- 疾病 `disease`；
- 基因 `gene`；
- 变异 `variant`；
- 药物 `drug`。

变异到基因的归属属于身份关系，可通过外键直接表达。疾病、变异、药物之间的治疗意义必须由治疗关联及其证据表达，不能通过无来源的静态标签推断。

### 3.3 PubMed 与 FDA 职责分离

- PubMed 文献及其合法可用全文用于支持治疗证据；
- FDA 官方记录用于描述药物的监管批准事实；
- FDA 批准本身不能替代某药物与目标疾病/变异之间的治疗证据；
- PubMed 文献也不能替代 FDA 批准状态核验；
- 大模型不得生成或修改监管状态和 Evidex 等级。

### 3.4 V0 药物筛选

V0 只返回至少存在一条有效 FDA 批准记录的药物，但不要求该批准适应证必须是 NSCLC。

必须分开显示：

- `MATCHED_INDICATION`：FDA 批准适应证覆盖当前疾病，并且标签中的生物标志物范围覆盖当前变异；
- `OTHER_INDICATION`：药物在其他适应证获 FDA 批准，但当前疾病/变异不在相应批准范围；
- `NOT_VERIFIED`：尚未完成 FDA 核验；V0 不返回；
- `NOT_APPROVED`：未找到有效 FDA 批准；V0 不返回；
- `WITHDRAWN_OR_INACTIVE`：当前快照下已撤回或不再有效；V0 不返回。

“FDA 在其他适应证获批”只满足 V0 药物筛选条件，不会自动产生治疗关联或提升证据等级。治疗关联仍必须由 PubMed 证据支持。

### 3.5 跨适应证检索

跨适应证检索只允许到同一精确体细胞变异：

- 查询基因必须相同；
- 查询变异必须为同一规范化精确变异；
- 不允许仅根据同一基因、通路、蛋白功能或相似变异传播；
- V0 查询为实体瘤，因此自动传播只允许其他实体瘤到 NSCLC；
- 血液肿瘤证据不得自动传播到 NSCLC；
- 耐药证据不得跨适应证传播；
- 低等级或仅临床前证据不得自动传播为跨适应证结果。

同适应证和跨适应证结果必须分组展示，不能仅依靠等级数字让用户自行辨别。

### 3.6 原文可追溯

每条可发布的原子证据必须至少关联一个原文段落。只保存 PMID 或论文标题不满足 V0 发布要求。

原文段落的对外展示由来源许可决定：

- `FULL_TEXT`：允许完整显示保存的段落；
- `EXCERPT`：只允许显示审核后的短摘录；
- `LINK_ONLY`：接口只返回位置和原始链接；
- `INTERNAL_ONLY`：只供内部审核，不对前端返回正文。

“能否公开展示”和“能否发送给大模型处理”是两项独立权限。每个段落还必须单独记录 `model_use_policy`；只有明确标记为 `ALLOWED` 的段落才能进入 Evidence Pack。`INTERNAL_ONLY` 不自动代表允许模型处理。

## 4. 明确不在 V0 范围内

- 组织学亚型、分期、治疗线次和既往治疗参与检索；
- FASTQ、VCF、基因组坐标标准化或复杂转录本归一化；
- EGFR 其他变异、其他基因或其他查询癌种；
- 指南证据和 Evidex Level 2 的实际数据生产；
- NMPA 或其他监管地区；
- ClinicalTrials.gov 和临床试验匹配；
- 向量数据库、embedding 或语义相似检索；
- 开放式问题、多轮对话和自然语言病例解析；
- 长期自动抓取、自动解构、自动审核或定时更新；
- 冲突证据的自动裁决；
- 患者身份信息、病例持久化、处方、剂量或个体化治疗决策；
- 生产级企业 API、计费、配额、SDK 或 SLA；
- 完整管理后台。

## 5. 关键术语

- `query disease`：用户输入的目标疾病，V0 固定为 NSCLC；
- `evidence disease`：研究证据实际涉及的疾病；
- `regulatory indication`：FDA 批准记录中的适应证；
- `exact variant`：相同基因、变异类型和规范化 HGVS 表达指向同一变异；
- `variant included`：研究将目标变异纳入一个明确变异集合，但没有给出该变异独立结果；
- `evidence claim`：从一项研究中提取的单一、可由原文段落直接支持的事实或结论；
- `therapeutic association`：疾病、变异、治疗和方向组成的可评级关联；
- `evidence pack`：一次请求中允许大模型使用的全部结构化关联、原子证据和原文段落；
- `knowledge release`：不可变的、已发布知识快照；
- `direct evidence`：`evidence disease` 与 `query disease` 相同；
- `cross-indication evidence`：疾病不同，但满足精确变异传播规则的证据。

## 6. Evidex 治疗证据等级 v1

### 6.1 参考与独立性

Evidex 等级借鉴 AMP/ASCO/CAP 对肿瘤体细胞变异的 A–D 证据分层，以及 OncoKB 对同适应证、跨适应证、监管证据和耐药证据的分层思想，但采用 Evidex 自有规则和人工审核结果。

- 不购买、复制、导入或再分发 OncoKB 的受许可知识数据；
- 不把 OncoKB 的具体注释当作 Evidex 证据来源；
- 等级规则必须携带 `grading_rule_version = evidex-therapeutic-v1`；
- 等级授予对象不是药物，也不是单篇论文，而是：

```text
疾病 + 规范化变异 + 药物或方案 + 证据方向
```

- 变异致癌性、药物监管状态和治疗证据等级必须分别保存；
- 规则引擎只产生 `proposed_level`，人工复核后写入 `approved_level`；
- 大模型不能提出、修改或覆盖等级；
- 证据不足时使用 `UNRATED`，不得强行赋予最低等级。

参考资料：

- [AMP/ASCO/CAP 体细胞变异解释共识](https://pmc.ncbi.nlm.nih.gov/articles/PMC5707196/)
- [OncoKB Therapeutic Levels of Evidence V2](https://www.oncokb.org/therapeutic-levels)
- [OncoKB Data Curation FAQ](https://faq.oncokb.org/data-curation)

### 6.2 独立判定维度

等级判定必须基于三个独立维度，不能只看 FDA 状态或研究类型。

#### 研究成熟度 `evidence_maturity`

- `REGULATORY`：FDA 正式批准记录和标签明确支持；
- `GUIDELINE`：专业指南明确推荐；V0 不生产此类数据；
- `MATURE_CLINICAL`：满足以下任一条件：
  - 一项同行评议、前瞻性、以生物标志物定义人群的成熟临床研究，研究设计和终点足以支持稳定结论；
  - 至少两项相互独立、同行评议的人体临床研究结论方向一致，且至少一项为前瞻性研究；
- `LIMITED_CLINICAL`：早期探索性研究、单一回顾性队列、事后亚组、病例系列或个案报告；
- `PRECLINICAL`：细胞、类器官、动物、异种移植或其他实验性证据；
- `INSUFFICIENT`：无法从合法可用文本中确认方法、人群、变异和结果，或证据不能直接支持拟议结论。

`MATURE_CLINICAL` 由人工依据研究设计、样本量、预设分析、终点成熟度、独立重复和局限性复核。不得仅按研究“Phase”或单一样本量阈值自动判断。

#### 变异适用性 `variant_applicability`

- `EXACT`：研究对精确变异给出独立结果或明确以该精确变异定义人群；
- `EXPLICIT_GROUP_INCLUDES_EXACT`：研究的明确变异集合包含目标变异，但没有独立结果；
- `GENE_ONLY`：只到基因层级；不能支持跨适应证传播；
- `ANALOGOUS_VARIANT`：相似或同位点其他变异；V0 不匹配；
- `UNKNOWN`：无法确定；不能发布为目标变异证据。

#### 疾病适用性 `disease_applicability`

- `SAME_DISEASE`：证据疾病与查询疾病相同；
- `OTHER_SOLID_TUMOR_EXACT_VARIANT`：其他实体瘤且为同一精确体细胞变异；
- `OTHER_HEMATOLOGIC_EXACT_VARIANT`：血液肿瘤精确变异；V0 不向 NSCLC 传播；
- `OTHER_DISEASE_NON_EXACT`：其他疾病但变异不精确；V0 不匹配。

### 6.3 等级定义

| 等级      | 方向       | 必须满足的条件                                                                                                                                                |
| --------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `1`       | 敏感       | 同一疾病；FDA 有效批准适应证覆盖该疾病；FDA 标签或批准资料明确识别精确变异或明确包含该变异的生物标志物集合；药物/方案与批准记录一致                           |
| `2`       | 敏感       | 同一疾病；专业指南明确把该生物标志物与治疗关联为标准治疗；不满足 Level 1；V0 不生产 Level 2 数据                                                              |
| `3A`      | 敏感       | 同一疾病；`MATURE_CLINICAL` 人体证据；变异为 `EXACT` 或 `EXPLICIT_GROUP_INCLUDES_EXACT`；不满足 Level 1/2；药物可以在当前适应证获批、其他适应证获批或尚未获批 |
| `3B`      | 敏感       | 证据来自其他实体瘤；必须是同一精确体细胞变异；来源疾病中的关联本身达到 Level 1、2 或 3A；不得从 Level 4 或耐药关联传播                                        |
| `4`       | 敏感或探索 | 同一疾病；存在 `LIMITED_CLINICAL` 或可信 `PRECLINICAL` 证据；变异至少为 `EXACT` 或明确包含；不足以达到 3A                                                     |
| `R1`      | 耐药       | 同一疾病；FDA 标签或未来纳入的专业指南明确认定该生物标志物预测对相应治疗缺乏获益或产生耐药；必须是生物标志物特异的耐药含义，不能把一般禁忌证当作 R1           |
| `R2`      | 耐药       | 同一疾病；存在 `MATURE_CLINICAL` 人体证据支持该变异预测原发或获得性耐药；不满足 R1                                                                            |
| `UNRATED` | 任意       | 证据不足、适用性不清楚、只有不可验证的二次转述，或不满足任何已定义等级                                                                                        |

### 6.4 判级决策顺序

对每个治疗关联分别执行：

1. 校验疾病、变异、药物、方向和支持段落是否完整；
2. 校验至少一条支持证据已审核；
3. 若方向为耐药：依次判断 R1、R2，否则为 `UNRATED`；
4. 若方向为敏感或探索：依次判断 1、2、3A、3B、4，否则为 `UNRATED`；
5. 保存规则计算得到的 `proposed_level` 和判级依据；
6. 人工复核后写入 `approved_level`、复核人、日期和说明；
7. 发布时必须使用 `approved_level`，不能使用模型输出或未审核建议。

等级优先级仅在同一方向内比较：

```text
敏感：1 > 2 > 3A > 3B > 4
耐药：R1 > R2
```

敏感和耐药不可互相覆盖，也不能计算成一个折中等级。如果同一治疗同时存在两个方向，保留两个治疗关联和全部证据；V0 不进一步裁决。

### 6.5 特殊规则

- FDA 在其他适应证批准，不能把目标疾病关联升级为 Level 1；
- 同一疾病存在成熟临床证据时，即使药物只在其他适应证获批，仍可评为 3A；
- 跨适应证结果统一评为 3B，不继承来源疾病中的 Level 1 或 2 展示等级；
- 跨适应证只接受 `EXACT`，不接受 `EXPLICIT_GROUP_INCLUDES_EXACT` 或 `GENE_ONLY`；
- 3B 仅从来源疾病中的 1、2、3A 敏感关联传播；
- R1、R2、4 不跨适应证传播；
- FDA 批准药物的临床前证据不会因为药物已获批而自动高于 Level 4；
- 一篇文献可以贡献多条原子证据，但不能把同一队列的多篇二次分析误算为独立重复；
- 综述可作为导航和背景，不单独决定 1、3A、3B、R1 或 R2；
- V0 不使用指南，因此实际发布数据不得出现 Level 2，除非规格经产品确认修订。

## 7. 总体架构

```text
POST /api/v1/evidence-answer
        │
        ▼
输入校验与规范化
        │
        ▼
读取当前 Knowledge Release
        │
        ▼
检索同疾病关联 + 精确变异跨适应证关联
        │
        ▼
关联 FDA 状态并应用 V0 药物筛选
        │
        ▼
组装 Evidence Pack（结构化证据 + 原文段落）
        │
        ├── 命中 Answer Snapshot → 返回
        │
        ▼
服务端固定模型生成结构化回答
        │
        ▼
Schema、引用、药物和关联范围校验
        │
        ├── 失败 → SUMMARY_UNAVAILABLE + 结构化证据
        ▼
保存 Answer Snapshot → 返回
```

### 7.1 技术选择

- Web/API：Next.js App Router Route Handler；
- 语言：TypeScript；
- 数据库：PostgreSQL；
- ORM/迁移：Drizzle ORM / Drizzle Kit；
- 输入输出校验：Zod；
- 大模型调用：Vercel AI SDK，通过 Evidex 自有 provider adapter 封装；
- 自动测试：Vitest、MSW；
- 浏览器验收：Landing Page 阶段使用 Playwright；
- V0 不引入向量扩展、向量数据库或任务队列。

### 7.2 现有模板复用边界

不得直接复用通用 `/api/chat` 作为 V0 接口。现有聊天接口包含登录、多轮历史、客户端选模型和流式输出，不满足证据检索与返回前校验要求。

可复用：

- PostgreSQL 和 Drizzle 基础；
- Zod、AI SDK；
- 响应、日志和测试基础；
- 现有测试隔离与质量门槛。

必须新建：

- 医学知识表和迁移；
- 知识导入与发布服务；
- 变异规范化、评级和检索服务；
- Evidence Pack 构造器；
- 大模型 provider adapter 和输出校验器；
- V0 API Route；
- 答案快照、缓存和审计逻辑。

## 8. PostgreSQL 数据模型

### 8.1 通用约定

- V0 医学知识模块只保证 PostgreSQL，不同步维护 MySQL、SQLite 或 Turso 表；
- ID 使用应用生成的不透明 `text` ID；
- 数据库列使用 `snake_case`；
- 所有可变记录包含 `created_at`、`updated_at`；
- 审核和发布时间使用带时区时间；
- 状态字段使用受约束枚举值，不能使用任意自由文本；
- 用于检索的字段使用标准列，扩展元数据才使用 `jsonb`；
- 外部标识必须保留来源系统，不能只保存显示名称。

### 8.2 一级实体

#### `disease`

- `id`
- `canonical_name`
- `display_name_zh`
- `display_name_en`
- `ontology_system`，可空
- `ontology_code`，可空
- `lineage`：`SOLID`、`HEMATOLOGIC`、`UNKNOWN`
- `aliases jsonb`
- `status`

`ontology_system + ontology_code` 在非空时唯一。

#### `gene`

- `id`
- `symbol`
- `hgnc_id`，可空
- `name`
- `aliases jsonb`
- `status`

`symbol` 唯一并保存为大写。

#### `variant`

- `id`
- `gene_id`
- `alteration_type`
- `hgvsp`，可空
- `hgvsc`，可空
- `transcript`，可空
- `canonical_key`
- `aliases jsonb`
- `status`

`canonical_key` 唯一。V0 的规范键示例为 `EGFR|SNV|p.L858R`。

#### `drug`

- `id`
- `generic_name`
- `display_name_zh`
- `display_name_en`
- `brand_names jsonb`
- `aliases jsonb`
- `external_ids jsonb`
- `status`

药物实体不保存一个全局 `fda_approved` 布尔值。批准状态必须来自带日期和适应证的监管记录。

### 8.3 来源与原文段落

#### `source_document`

- `id`
- `source_type`：`PUBMED`、`FDA`
- `external_id`：PMID、FDA application/submission ID 等
- `title`
- `publisher_or_agency`
- `journal`
- `publication_date`
- `doi`
- `pmcid`
- `url`
- `source_scope`：`ABSTRACT`、`PMC_FULL_TEXT`、`FDA_LABEL`、`FDA_APPROVAL_RECORD`、`OTHER`
- `language`
- `license`
- `retrieved_at`
- `document_hash`，可空
- `metadata jsonb`
- `review_status`

`source_type + external_id` 唯一。

#### `source_passage`

- `id`
- `source_document_id`
- `section`
- `paragraph_index`
- `locator jsonb`：PMC XML ID、页码、表格、图、字符区间等
- `original_text`
- `text_hash`
- `language`
- `display_policy`：`FULL_TEXT`、`EXCERPT`、`LINK_ONLY`、`INTERNAL_ONLY`
- `model_use_policy`：`ALLOWED`、`PROHIBITED`
- `public_excerpt`，可空
- `context_before_id`，可空
- `context_after_id`，可空
- `review_status`

`source_document_id + text_hash` 唯一。原文发生变化时新增段落版本，不静默覆盖已发布内容。

### 8.4 治疗关联与原子证据

#### `therapeutic_association`

- `id`
- `disease_id`：证据实际疾病
- `variant_id`
- `therapy_key`：按规范药物 ID、角色和顺序生成的稳定治疗组合键
- `direction`：`SENSITIVITY`、`RESISTANCE`、`EXPLORATORY`
- `variant_applicability`
- `proposed_level`
- `approved_level`
- `grading_rule_version`
- `grading_rationale`
- `review_status`
- `reviewed_by`
- `reviewed_at`

`disease_id + variant_id + therapy_key + direction` 必须唯一。组合治疗的成员通过关联表表达；导入器必须先生成 `therapy_key`，再创建关联和成员记录。

#### `therapeutic_association_drug`

- `association_id`
- `drug_id`
- `role`：`PRIMARY`、`COMBINATION_COMPONENT`
- `sort_order`

V0 若纳入联合方案，每个组成药物都必须存在有效 FDA 批准记录；只有 FDA 正式记录覆盖该组合时，监管匹配状态才能是 `MATCHED_INDICATION`。

#### `evidence_claim`

- `id`
- `association_id`
- `claim_type`：`EFFICACY`、`RESISTANCE`、`SAFETY_CONTEXT`、`OTHER`
- `evidence_maturity`
- `study_type`
- `study_name`
- `population_summary`
- `sample_size`，可空
- `disease_stage`，可空
- `treatment_line`，可空
- `prior_therapy`，可空
- `intervention`
- `comparator`，可空
- `endpoint`
- `effect_value jsonb`，可空
- `conclusion`
- `limitations`
- `cohort_fingerprint`，可空，用于识别同一队列的重复论文
- `review_status`
- `reviewed_by`
- `reviewed_at`

虽然分期、线次和既往治疗不参与 V0 检索，但必须在原文能够确认时保存，并进入 Evidence Pack。

#### `evidence_claim_passage`

- `evidence_claim_id`
- `source_passage_id`
- `support_role`：`PRIMARY`、`CONTEXT`、`LIMITATION`

发布规则：每条 `APPROVED` evidence claim 必须至少有一个 `PRIMARY` passage。

### 8.5 FDA 监管记录

#### `regulatory_approval`

- `id`
- `authority`：V0 为 `FDA`
- `application_number`
- `submission_number`，可空
- `approval_status`：`APPROVED`、`WITHDRAWN`、`INACTIVE`、`NOT_APPROVED`、`UNKNOWN`
- `approval_date`
- `status_as_of`
- `indication_text`
- `biomarker_text`，可空
- `label_effective_date`，可空
- `source_document_id`
- `review_status`
- `reviewed_by`
- `reviewed_at`

#### `regulatory_approval_drug`

- `regulatory_approval_id`
- `drug_id`

#### `regulatory_approval_disease`

- `regulatory_approval_id`
- `disease_id`
- `scope`：`EXACT`、`BROADER`、`OTHER`

#### `regulatory_approval_variant`

- `regulatory_approval_id`
- `variant_id`
- `scope`：`EXACT`、`EXPLICIT_GROUP_INCLUDES_EXACT`、`GENE_ONLY`

#### `regulatory_approval_passage`

- `regulatory_approval_id`
- `source_passage_id`
- `support_role`：`INDICATION`、`BIOMARKER`、`STATUS`、`CONTEXT`

FDA 记录必须关联来源文档，并通过 `regulatory_approval_passage` 关联支持其适应证、生物标志物和状态判断的原文。至少应有一条 `INDICATION` passage；标签中的原文遵守相同的定位、展示和模型使用策略。

### 8.6 知识发布

#### `knowledge_release`

- `id`
- `version`
- `status`：`DRAFT`、`PUBLISHED`、`RETIRED`
- `literature_cutoff_at`
- `regulatory_cutoff_at`
- `grading_rule_version`
- `published_at`
- `published_by`
- `notes`

`version` 唯一。已发布版本不可原地修改。

#### `knowledge_release_association`

- `knowledge_release_id`
- `therapeutic_association_id`

#### `knowledge_release_approval`

- `knowledge_release_id`
- `regulatory_approval_id`

发布服务必须在同一事务中验证所有实体、证据、段落、监管记录和等级，再将版本状态切换为 `PUBLISHED`。失败必须整体回滚。

### 8.7 答案快照

#### `answer_snapshot`

- `id`
- `request_fingerprint`
- `knowledge_release_id`
- `prompt_version`
- `provider`
- `model`
- `locale`
- `evidence_ids jsonb`
- `association_ids jsonb`
- `regulatory_approval_ids jsonb`
- `structured_output jsonb`
- `validation_status`
- `latency_ms`
- `created_at`

缓存唯一键：

```text
request_fingerprint
+ knowledge_release_id
+ prompt_version
+ provider
+ model
+ locale
```

只缓存通过全部后置校验的模型输出。

## 9. 一次性知识数据包与入库

### 9.1 数据包

第一批数据保存在版本控制中，建议目录：

```text
data/evidex/v0/
├── entities.json
├── publications.json
├── passages.json
├── fda-approvals.json
├── associations.json
├── evidence-claims.json
└── release.json
```

数据包是一次性导入材料，不是长期采集系统。不得在文件中保存密钥、付费全文文件或无权再分发的整篇论文。

### 9.2 人工复核

Codex 负责：

- 检索候选 PubMed 文献和 FDA 正式记录；
- 提取结构化字段、原文段落和定位；
- 生成 proposed Evidex level 与判级依据；
- 标明摘要/全文范围、许可和不确定项；
- 将数据包交给用户复核。

用户负责确认：

- 纳入文献和药物；
- 医学结论是否忠实；
- 变异、疾病和治疗关联；
- FDA 适应证覆盖判断；
- `approved_level`；
- 是否允许发布。

未经用户复核的记录保持 `DRAFT` 或 `IN_REVIEW`，不能出现在 `PUBLISHED` release 中。

### 9.3 导入脚本

建议命令：

```bash
pnpm evidex:import --data data/evidex/v0 --release v0.1.0
```

导入必须：

- 支持 dry-run；
- 在写入前完成 JSON Schema/Zod 校验；
- 验证所有外键和稳定 ID；
- 验证 PMID、FDA application number 等唯一键；
- 验证每个 claim 至少有一个 PRIMARY passage；
- 验证进入回答范围的每个 claim 至少有一个 `model_use_policy = ALLOWED` 的 PRIMARY passage；
- 验证每条 FDA 批准记录至少有一个 INDICATION passage；
- 重新计算 `proposed_level` 并核对数据包；
- 拒绝没有人工复核信息的发布记录；
- 使用单一数据库事务；
- 支持以稳定 ID 幂等重跑；
- 冲突时失败，不静默覆盖已发布版本；
- 输出新增、复用、跳过、冲突和失败统计。

## 10. 输入规范化

### 10.1 V0 请求字段

```json
{
  "disease": "NSCLC",
  "biomarkers": [
    {
      "gene": "EGFR",
      "alterationType": "SNV",
      "hgvsp": "p.L858R"
    }
  ],
  "jurisdiction": "US",
  "locale": "zh-CN"
}
```

### 10.2 规范化规则

- `nsclc`、`NSCLC` 可规范化为 `NSCLC`；
- `egfr`、`EGFR` 可规范化为 `EGFR`；
- `L858R`、`p.l858r`、`P.L858R` 可规范化为 `p.L858R`；
- V0 只允许一个 biomarker；
- `alterationType` 必须为 `SNV`；
- `jurisdiction` 必须为 `US`；
- `locale` V0 只支持 `zh-CN`；
- 未知变异、相似变异、其他基因不得由大模型猜测或纠正；
- 变异格式合法但不在 V0 范围时返回 `OUT_OF_SCOPE`，格式非法时返回 `INVALID_INPUT`。

规范化必须由确定性代码完成，不调用大模型。

## 11. 检索规则

### 11.1 前置条件

只读取当前配置的单一 `PUBLISHED` knowledge release。若没有可用发布版本，返回服务错误且不调用大模型。

只读取：

- release 中包含的治疗关联；
- `review_status = APPROVED` 的关联、claim、passage 和 FDA 记录；
- 具有 `approved_level` 的关联；
- 至少含一个 PRIMARY passage 的 claim。
- 至少含一个允许模型处理的 PRIMARY passage 的 claim。

### 11.2 同适应证检索

同适应证结果满足：

- association disease = NSCLC；
- association variant = `EGFR p.L858R`；
- `variant_applicability` 为 `EXACT` 或 `EXPLICIT_GROUP_INCLUDES_EXACT`；
- 治疗中的每个药物至少有一条当前有效的 FDA `APPROVED` 记录，适应证可以不同；
- 关联等级可以是 1、3A、4、R1、R2；V0 没有 Level 2 数据。

### 11.3 跨适应证检索

跨适应证结果满足：

- association disease != NSCLC；
- association disease lineage = `SOLID`；
- association variant 必须与 `EGFR p.L858R` 精确相同；
- `variant_applicability = EXACT`；
- 来源关联方向为 `SENSITIVITY`；
- 来源关联 `approved_level` 为 1、2 或 3A；
- 治疗中的每个药物至少有一条当前有效的 FDA `APPROVED` 记录；
- 查询结果中的投影等级固定为 3B；
- 必须保留原始证据疾病和来源关联等级。

不得匹配：

- 仅同一 EGFR 基因但不是 p.L858R；
- 其他类似激活突变；
- `EXPLICIT_GROUP_INCLUDES_EXACT` 的跨疾病证据；
- 血液肿瘤证据；
- 来源等级为 4、R1、R2 或 `UNRATED` 的关联。

### 11.4 FDA 监管匹配

对每个返回治疗计算相对于查询的 `regulatory_alignment`：

- 若存在有效 FDA 记录，疾病覆盖 NSCLC，且变异为 `EXACT` 或 `EXPLICIT_GROUP_INCLUDES_EXACT`，则为 `MATCHED_INDICATION`；
- 若只在其他疾病或不匹配的生物标志物范围获批，则为 `OTHER_INDICATION`；
- 没有有效 FDA 记录则不进入 V0 结果。

FDA 匹配状态不改变已人工批准的 Evidex 等级；若数据出现等级与 FDA 状态矛盾，发布验证必须失败并要求复核。

### 11.5 分组与排序

一级分组顺序：

1. `SAME_DISEASE`
2. `CROSS_INDICATION_EXACT_VARIANT`

同疾病组内按方向分组，再按等级排序：

```text
敏感/探索：1、2、3A、4
耐药：R1、R2
```

同等级按治疗规范名和 association ID 稳定排序。不得根据大模型生成内容决定排序。

所有匹配且已发布的 evidence claims 都必须进入 Evidence Pack，不能只选择最有利或最新的一条。

## 12. Evidence Pack

Evidence Pack 是唯一允许传给大模型的医学上下文。不得发送完整数据库行、整篇论文、未审核记录或本次检索之外的材料。

每个治疗关联包含：

- association ID；
- 查询分组和来源疾病；
- 规范化变异及适用性；
- 药物列表；
- 方向、approved Evidex level 和判级依据；
- FDA 监管匹配状态和允许引用的 approval IDs；
- 全部已发布 evidence claims；
- 每条 claim 的结构化研究信息、结论和局限；
- 每条 claim 中允许模型处理的 PRIMARY/CONTEXT/LIMITATION passages；
- 每个 passage 的位置、原文、公开显示策略、模型使用策略和来源文档 ID；
- PMID、DOI、PMCID 或 FDA 来源标识。

Evidence Pack 必须有稳定排序和确定性序列化，以支持缓存指纹和测试。

## 13. 大模型生成

### 13.1 Provider 抽象

建立 `EvidenceAnswerGenerator` 接口，业务代码不得直接依赖现有通用聊天路由或某个模型供应商。

```ts
interface EvidenceAnswerGenerator {
  generate(input: {
    normalizedQuery: NormalizedEvidenceQuery;
    evidencePack: EvidencePack;
    promptVersion: string;
    locale: 'zh-CN';
  }): Promise<EvidenceAnswerDraft>;
}
```

供应商和模型由服务端环境配置固定，客户端不得指定。V0 不做自动模型切换；切换模型必须形成新的答案缓存键和验收记录。

### 13.2 生成模式

- 使用非流式结构化输出；
- 使用 Zod/JSON Schema 限制输出；
- 低随机性配置，但不得把低随机性当作确定性保证；
- 每个临床证据陈述必须引用至少一个 evidence claim ID；
- 纯监管陈述可以不引用 evidence claim，但必须引用相应 regulatory approval ID；
- 每条陈述至少包含一个 evidence claim ID 或 regulatory approval ID，两类引用不能同时为空；
- 模型不能创建 PMID、链接、段落正文或等级；这些字段由后端拼装；
- 模型不能输出 dosage、疗程、处方或“最佳方案”；
- 模型必须明确提示未提供分期、线次、既往治疗，不能判断个体适用性；
- 同疾病和跨适应证必须分别总结；
- `EXPLICIT_GROUP_INCLUDES_EXACT` 不能被表述为 L858R 独立结果。

### 13.3 模型输出 Schema

```json
{
  "overallSummary": "string",
  "groups": [
    {
      "scope": "SAME_DISEASE",
      "therapies": [
        {
          "associationId": "assoc_xxx",
          "overview": "string",
          "statements": [
            {
              "text": "string",
              "evidenceIds": ["evidence_xxx"],
              "regulatoryApprovalIds": ["approval_xxx"]
            }
          ],
          "limitations": ["string"]
        }
      ]
    },
    {
      "scope": "CROSS_INDICATION_EXACT_VARIANT",
      "therapies": []
    }
  ],
  "overallLimitations": ["string"]
}
```

`regulatoryApprovalIds` 仅在陈述涉及批准状态时必填；纯监管陈述允许 `evidenceIds` 为空。模型不得把 `OTHER_INDICATION` 描述成当前适应证获批。

### 13.4 后置校验

返回给客户端前必须验证：

- JSON Schema 完整；
- association ID 属于本次 Evidence Pack；
- evidence ID 属于对应 association；
- regulatory approval ID 属于对应药物；
- 所有 therapy statements 至少有一个 evidence ID 或 regulatory approval ID；
- 模型没有增加未检索药物；
- 模型返回的分组与 association scope 一致；
- Level、FDA 状态、PMID、链接和原文位置使用后端事实，不接受模型覆盖；
- 输出长度在配置上限内。

任何校验失败都不得返回部分模型文本。响应状态改为 `SUMMARY_UNAVAILABLE`，同时返回完整结构化证据。

## 14. API 契约

### 14.1 Endpoint

```text
POST /api/v1/evidence-answer
Content-Type: application/json
```

V0 接口允许匿名访问，不创建聊天、不保存病例、不要求用户账号。正式公开 Landing Page 前必须配置限流和答案缓存。

### 14.2 成功响应

HTTP `200`：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "status": "ANSWERED",
    "normalizedInput": {
      "disease": "NSCLC",
      "gene": "EGFR",
      "alterationType": "SNV",
      "hgvsp": "p.L858R",
      "jurisdiction": "US",
      "locale": "zh-CN"
    },
    "knowledge": {
      "release": "v0.1.0",
      "literatureCutoffAt": "ISO-8601",
      "regulatoryCutoffAt": "ISO-8601",
      "gradingRuleVersion": "evidex-therapeutic-v1",
      "promptVersion": "evidex-answer-v1"
    },
    "answer": {
      "overallSummary": "string",
      "groups": [],
      "overallLimitations": []
    },
    "resultGroups": [
      {
        "scope": "SAME_DISEASE",
        "therapies": []
      },
      {
        "scope": "CROSS_INDICATION_EXACT_VARIANT",
        "therapies": []
      }
    ],
    "generatedAt": "ISO-8601",
    "cached": false,
    "disclaimer": "仅用于肿瘤知识学习与研究，不构成医疗建议、诊断或治疗决策。"
  }
}
```

`resultGroups` 由后端结构化事实构建，包含 association、evidence claim、可公开 passage、PMID 和 FDA 记录；不得使用模型生成的数据覆盖。

### 14.3 领域状态

- `ANSWERED`：找到证据并通过模型输出校验；
- `NO_CURATED_EVIDENCE`：输入在产品语义上有效，但当前 release 没有匹配证据；
- `OUT_OF_SCOPE`：疾病、基因、变异、地区或语言不在 V0 范围；
- `SUMMARY_UNAVAILABLE`：证据存在，但模型调用或输出校验失败；仍返回 `resultGroups`。

这些状态使用 HTTP `200`，便于 Landing Page 展示业务结果。

### 14.4 HTTP 错误

- `400 INVALID_INPUT`：JSON 或字段格式非法；
- `405 METHOD_NOT_ALLOWED`：错误方法；
- `413 PAYLOAD_TOO_LARGE`：请求超过限制；
- `429 TOO_MANY_REQUESTS`：超过限流；
- `500 KNOWLEDGE_RELEASE_UNAVAILABLE`：没有可用发布版本或数据库故障；
- `502 MODEL_PROVIDER_ERROR`：只在无法构造降级响应时使用；通常应返回 `SUMMARY_UNAVAILABLE`；
- `504 MODEL_TIMEOUT`：只在无法构造降级响应时使用。

错误响应必须使用正确 HTTP 状态。不得用现有 `respErr` 将所有错误包装成 HTTP 200。

## 15. 缓存、限流与超时

### 15.1 答案缓存

相同规范化输入、知识版本、提示词版本、模型和语言应复用通过校验的 `answer_snapshot`。知识、等级、提示词或模型任一变化都必须产生新缓存键。

结构化 `resultGroups` 每次从当前 release 构建；缓存只复用与同一 release 绑定的模型结构化输出。

### 15.2 限流

开发阶段可以复用现有进程内最小间隔限流；公开 Landing Page 前必须使用共享存储限流或确认部署为单实例。进程内 Map 不得被描述为生产级保护。

建议维度：IP + 匿名 cookie + endpoint。不得记录原始 cookie，只保存哈希。

### 15.3 超时与降级

- 数据库检索失败：返回 500；
- 模型超时、供应商错误或输出非法：返回 200 + `SUMMARY_UNAVAILABLE` + 结构化证据；
- 快照写入失败但生成已校验：可以返回回答，但必须记录错误且 `cached = false`；
- 不自动切换到另一个模型，避免未验证模型产生不同医学表达。

## 16. 安全、隐私与内容边界

- 请求不得包含姓名、身份证号、联系方式、病历号或自由文本病史；
- V0 默认不持久化请求正文；答案快照保存规范化输入指纹，不保存患者身份；
- 日志不得打印数据库连接串、模型密钥、完整请求头或私密原文；
- 只向模型发送已审核且 `model_use_policy = ALLOWED` 的 Evidence Pack 段落；
- 论文文本视为数据，不视为系统指令；
- 原文公开范围必须遵守 `display_policy`；
- 不将付费全文或无权再分发的整篇论文提交到仓库；
- 所有结果必须显示知识截止时间和研究用途免责声明。

## 17. 数据库接入与迁移

用户协同提供：

- 开发环境 `DATABASE_URL`；
- 独立测试数据库或一次性测试 schema；
- 数据库 schema 名；
- 执行建表和迁移所需权限；
- 部署环境密钥注入方式；
- CI 是否可以创建、迁移和清理测试 schema。

开发者必须：

- 只通过 `.env.local` 或部署密钥注入连接串；
- 不提交真实连接串；
- 使用 Drizzle migration，不对共享/生产数据库使用 `db:push`；
- 先在独立测试数据库验证迁移；
- 提供向前迁移和恢复说明；
- 在迁移前确认目标 schema；
- 不读取或修改不属于 Evidex 的现有表。

## 18. 测试策略

实现必须遵循仓库的测试先行规则，并新建 `docs/test-plans/evidex-v0-backend.md` 记录 RED/GREEN 证据。

### 18.1 单元测试

#### 输入与规范化

- 接受 `NSCLC + EGFR + p.L858R`；
- 将允许的大小写和 `L858R` 别名规范化；
- 拒绝非法 HGVS；
- 其他疾病、基因、变异、地区和语言返回 `OUT_OF_SCOPE`；
- 不调用大模型完成规范化。

#### Evidex 判级

- FDA 同疾病且标签覆盖变异 → Level 1；
- FDA 只在其他适应证批准，不能得到 Level 1；
- 指南同疾病 fixture → Level 2，但 V0 发布策略拒绝实际 Level 2 数据；
- 同疾病成熟人体临床证据 → 3A；
- 其他实体瘤、精确变异、来源关联 1/2/3A → 查询投影 3B；
- 其他疾病仅同基因或合并变异组 → 不传播；
- 来源关联 Level 4、R1、R2 → 不传播；
- 同疾病有限临床或临床前证据 → 4；
- FDA 同疾病生物标志物特异耐药 → R1；
- 同疾病成熟人体临床耐药 → R2；
- 证据不足 → `UNRATED`；
- 模型输出不得改变 approved level。

#### 检索与 Evidence Pack

- 只读取当前发布 release；
- 未审核或未发布关联不可见；
- 所有匹配 claims 都进入 pack；
- 每条 claim 必须有关联 passage；
- 分组、等级和 ID 顺序稳定；
- 同疾病和跨适应证不混组；
- 无有效 FDA 批准的药物被 V0 策略过滤。

#### 模型输出校验

- 接受所有 ID 均在 pack 内的合法输出；
- 拒绝未知 association/evidence/approval ID；
- 拒绝把 association 放入错误分组；
- 拒绝既没有 evidence ID、也没有 regulatory approval ID 的事实陈述；
- 拒绝模型增加数据库外药物；
- 校验失败返回 `SUMMARY_UNAVAILABLE`。

#### 缓存

- 相同键命中缓存不调用模型；
- release、prompt、model、locale 任一变化缓存失效；
- 未通过校验的输出不缓存。

### 18.2 PostgreSQL 集成测试

使用独立测试数据库验证：

- migration 可从空库成功执行；
- 唯一约束和外键生效；
- 已发布 release 不可原地修改；
- claim 缺少 PRIMARY passage 时发布失败；
- claim 的 PRIMARY passage 均禁止模型处理时，不能进入 V0 回答 release；
- FDA 记录缺少 INDICATION passage 时发布失败；
- 未审核 FDA 记录不能用于 V0 药物筛选；
- 一次性导入幂等；
- 任一记录失败时事务整体回滚；
- 实际 SQL 检索结果和预期分组一致。

不得把 mock repository 测试作为 SQL 正确性的证据。

### 18.3 API 集成测试

保留真实 route 和业务服务，替换模型供应商边界：

- 标准请求返回 `ANSWERED`；
- 无证据返回 `NO_CURATED_EVIDENCE` 且不调用模型；
- 越界输入返回 `OUT_OF_SCOPE` 且不调用模型；
- 非法输入返回 HTTP 400；
- 模型超时、抛错和非法 JSON 返回 `SUMMARY_UNAVAILABLE`；
- 缓存命中不再次调用模型；
- 返回的公开 passage 遵守 `display_policy`，模型上下文遵守 `model_use_policy`；
- 未声明外部 HTTP 请求被 MSW 阻止。

### 18.4 真实模型评估

真实模型调用不进入默认 CI。提供手工触发的 golden-case 评估，至少检查：

- 是否覆盖全部返回治疗；
- 是否混淆同疾病和跨适应证；
- 是否把 `EXPLICIT_GROUP_INCLUDES_EXACT` 写成 L858R 独立结果；
- 是否遗漏关键研究限制；
- 是否产生未提供的数字、文献或药物；
- 是否准确表达 FDA 当前适应证与其他适应证；
- 是否给出个体化处方或剂量；
- 每个结论能否追溯到 evidence claim 和原文段落。

模型、提示词或输出 Schema 变化后必须重新执行此评估。

### 18.5 覆盖率与完整检查

所有新增可单测的业务模块加入 `vitest.config.ts` 覆盖范围，每个文件要求：

- 语句、行、函数覆盖率不低于 90%；
- 分支覆盖率不低于 80%。

交付前必须运行：

```bash
pnpm verify
pnpm verify:full
```

本功能涉及 API、数据库、环境配置和构建，不能只以单元测试通过作为完成证据。

## 19. V0 验收场景

| 场景           | 输入/前置条件                                           | 可观察结果                                                                    |
| -------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 正常回答       | NSCLC + EGFR p.L858R；发布版本存在同疾病证据            | 返回 `ANSWERED`、同疾病组、全部证据、段落定位、PMID、FDA 状态和等级           |
| 跨适应证       | 其他实体瘤中存在精确 EGFR p.L858R 且来源关联为 1/2/3A   | 单独进入跨适应证组，查询等级为 3B，保留来源疾病和来源等级                     |
| 非精确跨适应证 | 其他疾病只有 EGFR 或相似变异证据                        | 不进入结果                                                                    |
| FDA 其他适应证 | 药物有有效 FDA 批准，但不覆盖 NSCLC/L858R               | 可以进入有 PubMed 支持的结果，监管状态为 `OTHER_INDICATION`，不能评为 Level 1 |
| 无 FDA 批准    | 有 PubMed 证据但无有效 FDA 批准记录                     | 知识库可保存，V0 不返回                                                       |
| 未审核知识     | 关联、claim、passage 或 FDA 记录未审核                  | 不进入发布版本或回答                                                          |
| 段落缺失       | claim 没有 PRIMARY passage                              | 发布失败                                                                      |
| 权限受限原文   | passage 不允许公开展示，但 `model_use_policy = ALLOWED` | 可用于模型归纳；公开响应只返回许可范围内的摘录或链接                          |
| 禁止模型处理   | PRIMARY passages 均为 `model_use_policy = PROHIBITED`   | 可留在草稿知识中，但不能进入 V0 回答 release 或模型上下文                     |
| 模型越界引用   | 模型返回未知 evidence ID                                | 模型文本被丢弃，返回 `SUMMARY_UNAVAILABLE` 和结构化证据                       |
| 模型失败       | 超时、供应商错误或 Schema 不合法                        | 返回 `SUMMARY_UNAVAILABLE`，证据仍可追溯                                      |
| 无匹配证据     | 输入有效但 release 无记录                               | 返回 `NO_CURATED_EVIDENCE`，不调用模型                                        |
| 越界输入       | 其他癌种、基因或变异                                    | 返回 `OUT_OF_SCOPE`，不调用模型                                               |
| 非法输入       | 缺字段或非法 HGVS                                       | HTTP 400                                                                      |
| 可复现性       | 相同输入和 release 重复请求                             | 证据集合相同，命中已校验答案快照                                              |

## 20. 建议代码组织

```text
src/app/api/v1/evidence-answer/route.ts

src/shared/types/evidence.ts
src/shared/models/disease.ts
src/shared/models/gene.ts
src/shared/models/variant.ts
src/shared/models/drug.ts
src/shared/models/evidence.ts
src/shared/models/regulatory-approval.ts
src/shared/models/knowledge-release.ts
src/shared/models/answer-snapshot.ts

src/shared/services/evidence/normalize-query.ts
src/shared/services/evidence/grade-association.ts
src/shared/services/evidence/retrieve-evidence.ts
src/shared/services/evidence/build-evidence-pack.ts
src/shared/services/evidence/validate-answer.ts
src/shared/services/evidence/answer-evidence-query.ts

src/extensions/ai/evidence-answer.ts
scripts/import-evidex-data.ts
data/evidex/v0/

tests/unit/evidence/
tests/integration/evidence-answer.test.ts
tests/integration/evidex-database.test.ts
```

文件可在实现时按职责进一步拆分，但不能把检索、评级、模型调用和 HTTP route 混在同一模块。

## 21. 实施顺序

1. 建立测试计划和 API/等级纯逻辑用例，确认 RED；
2. 实现领域类型、规范化和 Evidex 判级纯函数；
3. 用户提供开发/测试 PostgreSQL 接入条件；
4. 新增 Drizzle schema 和 migration，并在空测试库验证；
5. 实现 repository、发布验证和确定性检索；
6. 实现一次性数据包 Schema、dry-run 和事务导入；
7. 完成第一批文献/FDA 资料整理并提交用户复核；
8. 将复核数据导入测试库并发布 `v0.1.0`；
9. 实现 Evidence Pack 和模型 adapter；
10. 实现结构化生成、后置校验、降级和答案快照；
11. 实现 API Route、限流与集成测试；
12. 运行真实模型 golden-case 评估并由用户复核；
13. 运行 `pnpm verify` 和 `pnpm verify:full`；
14. 后端验收后再开始 Landing Page。

## 22. 完成定义

只有同时满足以下条件，V0 后端才可标记完成：

- 本规格中的范围、数据模型、等级规则、检索规则和 API 已实现；
- 第一批文献、原文段落、FDA 记录、治疗关联和等级已由用户复核；
- PostgreSQL migration 在独立测试库通过；
- 导入支持 dry-run、幂等和事务回滚；
- 所有自动测试和覆盖率门槛通过；
- 真实模型 golden-case 评估通过；
- `pnpm verify` 和 `pnpm verify:full` 通过；
- 没有未说明的测试跳过、真实外部请求、生产凭证或未授权全文；
- 最终交付记录包含 RED/GREEN、数据库迁移、回滚和未验证范围的真实证据。
