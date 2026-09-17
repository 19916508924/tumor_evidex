# Evidex

Evidex 是基于 ShipAny Template Two 的新产品项目。当前技术栈为 Next.js 16 App Router、React 19、TypeScript、Tailwind CSS、Drizzle ORM 和 Better Auth。产品功能与验收标准随需求逐步定义。

## 产品定义与当前共识

> 本节汇总截至 2026-09-16 的产品讨论。当前可运行基线为 V0.2；标为“待确认”的内容尚未定案。

### 产品定位

Evidex 暂作为项目工作名。产品目标是构建一个面向肿瘤知识学习与循证研究的知识库，根据结构化的疾病和基因变异信息，从经过人工审核的知识中匹配治疗相关证据，再由受证据约束的大模型生成带引用的归纳回答。

产品首先验证真实后端闭环，之后再开发调用同一后端的 Landing Page。V0 不作为医疗器械，不向医院或患者提供真实诊疗服务，也不生成处方或个体化治疗决策。目标用户和使用方式包括：

- 个人用户通过网页学习肿瘤、基因、变异、药物和循证资料；
- 基因检测公司了解结构化变异如何用于循证内容生成；
- 用户与 Codex 共同完成产品：用户负责医学与产品定义，Codex 负责代码实现。遇到会改变产品范围或医学口径的不确定事项，先向用户确认，不自行定案。

### V0.2 核心目标

V0.2 验证一条可扩展但仍保持严格结构化的真实纵向链路：

> 从页面选择癌种与变异，从当前已审核、已发布的知识版本中检索全部匹配证据，并由大模型基于这些证据生成可追溯的治疗证据综述。

V0.2 的明确范围为：

- 癌种支持 NSCLC 与 CRC（结直肠癌），不进一步区分组织学亚型；
- 变异支持 `EGFR p.L858R`、`EGFR p.E746_A750del`、`EGFR p.T790M`、`KRAS p.G12C`、`KRAS p.G12D`；
- 不要求输入分期、治疗线次或既往治疗，也不使用这些字段进行匹配；
- 文献证据只收录 PubMed 索引文献；
- 只有至少在一个适应证存在有效 FDA 批准记录的药物或方案可以进入 V0 的可回答范围；该适应证不必是 NSCLC；
- 运行时从已审核、已发布的数据库记录开始，不在用户请求链路中搜索 PubMed、调用 FDA 数据源或执行知识抽取；
- 检索采用结构化数据库精确匹配，V0 不使用 embedding 或向量数据库；
- 大模型负责在检索结果范围内组织、比较和解释证据，不负责决定检索结果、监管状态或证据等级；
- V0 使用固定回答意图，不提供自由问题、多轮对话或开放式知识问答；
- 不处理临床试验匹配、指南证据或完整肿瘤知识目录。

上述癌种、变异和“药物须在任一适应证获得 FDA 批准”只是 V0.2 的收集与回答策略，不是永久准入条件。底层数据模型可以继续收录其他疾病、基因、变异、药物、监管状态和证据等级。

### 知识模型

知识库包含四类一级实体：疾病、基因、变异和药物。变异通过身份关系归属于基因；疾病、变异和药物之间的治疗意义必须由可追溯的治疗关联及证据建立。

药物监管状态与治疗证据分别建模：药物不能只保存一个全局 `fda_approved` 布尔值；每条 FDA 批准记录必须带适应证、日期、状态和来源。FDA 在其他适应证获批只满足 V0 的药物筛选条件，不会自动产生治疗关联或提高证据等级。

### 知识来源与准入

V0 将“治疗证据”和“监管批准状态”作为两类不同的知识，不得互相替代。

#### PubMed：治疗证据来源

- 第一批文献由 Codex 一次性检索和整理；用户完成人工复核后，数据才能进入已发布知识版本；
- 优先使用 PubMed 摘要和由 PubMed 链接的 PMC 开放获取全文；
- 对无法合法获取全文的论文，只能提取摘要足以支持的结论，不得假装完成全文审阅；
- 原始研究优先。综述可帮助发现原始研究或提供背景，但不能替代原始研究支持核心治疗结论；
- 第一批以人体治疗相关证据为主；有限临床或可信临床前证据可以保存在知识库中并按较低等级处理，但不得因药物已获 FDA 批准而升级；
- 当前知识版本并非 PubMed 全量收录，产品必须展示文献检索截止日期和知识版本，不得声称结果代表全部公开文献。

文献必须明确涉及已收录变异和药物或治疗方案相关结局，可以来自查询癌种，也可以来自其他实体瘤。同疾病证据与跨适应证证据分组使用。变异适用性至少区分：

- `EXACT`：论文以查询的精确变异定义研究人群，或报告了独立结果；
- `EXPLICIT_GROUP_INCLUDES_EXACT`：明确的变异集合包含该精确变异，但没有独立结果；仅可用于同疾病证据；
- `GENE_ONLY`：只到基因层级；不能支持精确变异结论或跨适应证传播。

跨适应证只允许其他实体瘤中同一精确变异的敏感性证据；不允许按同基因、相似变异、通路或功能类比传播，也不传播血液肿瘤、耐药、低等级或仅临床前证据。

#### FDA：药物批准状态来源

- V0 的监管地区固定为美国，监管机构固定为 FDA；
- 药物进入可回答知识范围前，必须核验其 FDA 批准状态，并记录批准适应证是否明确覆盖当前疾病与变异；
- 主要依据 Drugs@FDA 的申请记录以及关联的批准信、审评资料和标签；openFDA 可用于发现和结构化访问，但不能单独替代对 Drugs@FDA 正式记录和适应证文本的核验；
- 每条监管记录至少保存药物通用名和商品名、申请号、批准日期、适应证原文摘要、适应证覆盖范围、标签版本或生效日期、FDA 来源链接、获取日期和人工复核日期；
- “药物已获 FDA 批准”与“FDA 批准适应证覆盖当前癌种和变异”必须分开表达。不能因为药物在其他适应证获批，就暗示其已获批用于当前查询；
- 结果必须区分 `MATCHED_INDICATION`（标签覆盖当前疾病与变异）和 `OTHER_INDICATION`（仅在其他适应证获批）；未核验、未批准、已撤回或失效的药物不进入 V0 回答；
- 运行时使用已审核的 FDA 状态快照，不实时依赖 FDA 接口。历史回答必须能通过知识版本复现。

官方入口：

- [PubMed](https://pubmed.ncbi.nlm.nih.gov/)
- [Drugs@FDA](https://www.accessdata.fda.gov/scripts/cder/daf/)
- [openFDA Drugs@FDA API](https://open.fda.gov/apis/drug/drugsfda/)
- [openFDA Drug Labeling API](https://open.fda.gov/apis/drug/label/)

指南暂不纳入 V0。NCCN 等指南只有在取得允许用于产品处理的授权材料，或由用户提供可合法使用且经过复核的结构化结论后，才考虑进入后续版本。

### 一次性知识准备

长期、自动化的知识获取和审核工作流不属于 V0。第一批知识采用一次性流程：

1. Codex 检索候选 PubMed 文献和 FDA 官方记录；
2. Codex 将来源解构为文献、监管记录和原子证据；
3. Codex 提交结构化内容、来源链接和提取依据供用户复核；
4. 只有用户确认后的内容才导入数据库并发布为知识版本；
5. 后端查询仅访问已审核、已发布的知识版本。

一次性准备仍需保留来源、提取范围、复核状态和知识版本；“不搭建长期工作流”不等于可以省略审核与可追溯性。

### Evidex 治疗证据等级 v1

等级借鉴 AMP/ASCO/CAP 和 OncoKB 的分层思想，但使用 Evidex 自有、可执行的规则；不导入或再分发 OncoKB 的知识数据。评级对象是“疾病 + 精确变异 + 药物或方案 + 证据方向”，而不是单个药物或单篇论文。

| 等级      | Evidex v1 判定摘要                                                                           |
| --------- | -------------------------------------------------------------------------------------------- |
| `1`       | 同一疾病，FDA 有效批准记录及标签覆盖疾病、治疗和该精确变异或明确包含该变异的生物标志物集合   |
| `2`       | 同一疾病，专业指南明确作为标准治疗，但不满足 Level 1；V0 暂不生产该等级                      |
| `3A`      | 同一疾病，成熟的人体临床证据支持该变异与治疗关联，但不满足 Level 1/2                         |
| `3B`      | 其他实体瘤中的同一精确变异，且来源疾病关联本身达到 1、2 或 3A；不得从 Level 4 或耐药证据传播 |
| `4`       | 同一疾病的有限临床或可信临床前证据，不足以达到 3A                                            |
| `R1`      | 同一疾病，FDA 标签或未来指南明确支持生物标志物特异的耐药含义                                 |
| `R2`      | 同一疾病，成熟人体临床证据支持原发或获得性耐药，但不满足 R1                                  |
| `UNRATED` | 证据不足、适用性不清或不满足已定义等级                                                       |

规则引擎只生成 `proposed_level`；用户医学复核后形成 `approved_level`，发布和回答只能使用后者。敏感与耐药关联分别保存，V0 不进行冲突裁决。完整判级条件、研究成熟度与传播规则见[后端技术规格](./docs/specs/evidex-v0-backend.md)。

### 结构化输入

V0 不收集姓名、身份证号、联系方式、病历号等个人身份信息。后端只接受疾病和变异的结构化字段，概念示例如下：

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

V0.2 可以确定性规范化大小写、`p.` 前缀、`CRC`/`colorectal cancer` 和 `exon19del` 等有限别名，但不得依靠大模型猜测未知或格式错误的变异。第一版不处理自然语言病历、组织学亚型、分期、治疗线次、既往治疗、FASTQ、VCF、基因组坐标、融合、拷贝数变异或复杂转录本归一化。

### 结构化检索与 RAG 回答

V0 采用受约束的结构化 RAG，不使用向量检索：

1. 校验并规范化疾病和变异字段；
2. 按癌种与规范变异键检索同疾病证据；
3. 只按同一精确变异补充其他实体瘤中达到传播门槛的跨适应证证据，并单独分组；
4. 过滤在所有适应证中都没有有效 FDA 批准记录的药物；
5. 将全部匹配证据、原文段落和监管元数据组成 evidence pack；
6. 将 evidence pack 交给大模型生成结构化综述；
7. 校验模型引用的证据 ID，拒绝不存在或未检索到的引用；
8. 返回自然语言回答、结构化证据列表、PMID、FDA 来源和知识版本。

“全部匹配证据”只指当前 Evidex 知识版本中全部已审核、已发布且符合条件的记录，不代表 PubMed 上所有可能相关的文献。

大模型可以归纳研究发现、按药物组织证据、比较研究设计和说明适用限制，但不得：

- 决定哪些数据库证据应该匹配；
- 创造 evidence pack 中不存在的药物、研究、结论或引用；
- 自行判断或修改 FDA 批准状态；
- 自行创造或修改 Evidex 证据等级；
- 把 `EXPLICIT_GROUP_INCLUDES_EXACT` 的合并人群结果表述为查询变异的独立结果；
- 忽略论文中的分期、线次、既往治疗和研究人群限制；
- 输出剂量、疗程、处方或针对具体患者的治疗建议。

V0 不实现专门的冲突识别、评级或自动裁决功能。所有符合条件的已发布证据仍必须进入 evidence pack；如果来源结论不同，回答应分别陈述，不得隐藏差异或擅自选择一方。

### 证据数据与结果要求

每条原子治疗证据至少记录：

- 疾病、基因、变异和变异特异性；
- 药物或方案、证据方向和人工审核后的证据等级（如适用）；
- 研究类型、研究人群、样本量、分期、治疗线次和既往治疗；
- 干预、对照、终点、效应量、结论和主要局限；
- 论文题名、期刊、年份、PMID、DOI、PubMed 链接；
- 提取依据来自摘要还是开放全文，以及可定位的原文段落、章节、段落索引或其他位置标识；
- 收录日期、复核日期、复核状态和知识版本；
- 对应药物的 FDA 批准记录和适应证覆盖状态。

“能否公开展示原文”和“能否把原文发送给模型”必须分别记录。只有明确允许模型处理的已审核段落可以进入 evidence pack；接口对外只返回来源许可允许的全文、短摘录或链接。

虽然分期、线次和既往治疗不参与 V0 匹配，但它们必须随证据保存并进入大模型上下文。回答必须明确提示：由于没有输入完整临床信息，系统只能总结相关治疗证据，不能判断某项治疗是否适用于具体患者。

后端结果至少区分：

- `ANSWERED`：检索到证据并成功生成归纳回答；
- `NO_CURATED_EVIDENCE`：输入有效，但当前知识版本未收录相应证据；
- `OUT_OF_SCOPE`：癌种、基因、变异或监管地区不在 V0 范围；
- `INVALID_INPUT`：必要字段缺失或格式非法；
- `SUMMARY_UNAVAILABLE`：证据检索成功但模型调用或输出校验失败，此时仍返回结构化证据列表。

每个回答必须包含使用的证据 ID、PMID、FDA 来源、知识版本、文献检索截止日期、生成时间和中英文免责声明。产品使用“治疗证据匹配”“循证综述”等表述，不使用“推荐用药”“最佳治疗方案”等表达。

### V0.2 验收标准

1. 选项接口返回 2 个癌种、5 个变异和 6 个首批直接证据组合；
2. 未审核、未发布或未通过 FDA 准入核验的记录不会进入模型上下文；
3. 模型的每个治疗结论都关联一个或多个本次检索到的证据 ID；
4. 后端拒绝模型生成的越界引用，不将其作为有效回答返回；
5. 合并人群结果不会被错误描述为精确变异独立结果，跨适应证只匹配精确变异；
6. 回答保留研究人群、分期、线次、既往治疗等适用限制；
7. 不支持的疾病或变异不会触发大模型调用；
8. 模型失败时仍可返回可追溯的结构化证据；
9. 相同知识版本和相同输入得到完全一致的检索证据集合；
10. 后续 Landing Page 可以直接调用该真实后端，不维护独立的预置医学结果。

### Landing Page 与 API 边界

V0 先完成并验证真实后端。核心接口稳定后再开发 Landing Page，由页面提交结构化病例并展示后端返回的真实证据综述、证据卡片和来源，不使用前端硬编码的医学结果。

第一阶段接口是产品内部接口，不对外承诺生产级企业 API、鉴权、配额、SDK、SLA 或上游基因检测系统兼容性。Landing Page 后续可以展示接口示例，但不得暗示已具备企业接入能力。

### 明确不在第一版范围内

- 医疗器械申报、临床使用、真实患者决策或医疗建议；
- FASTQ/VCF 处理、变异注释流水线和复杂坐标标准化；
- 组织学亚型、分期、治疗线次和既往治疗参与匹配；
- `ALK`、当前目录以外的变异或其他癌种作为用户查询；
- 指南、NMPA、ClinicalTrials.gov 或其他监管地区；
- 临床试验匹配、完整肿瘤目录和全量 PubMed 收录；
- embedding、向量数据库、开放问题和多轮 RAG；
- 不包含每周或 Cron 自动调度、开放式自主 Agent 和自动审核；知识更新只能由授权 Ops 用户人工发起，并由持久 Worker 执行；
- 冲突证据的专门识别、评级或自动裁决；
- 真实企业 API、账号接入、计费、配额、SLA 或生产运维承诺；
- 剂量、疗程、处方或个体化治疗方案。

### 后续路线

- V0.1：完成 `NSCLC + EGFR p.L858R` 的结构化检索和大模型循证综述后端；
- V0.2：扩展 EGFR、KRAS 与 CRC，并由 Landing Page 通过选择器调用真实后端；
- 后续版本：继续扩展变异、基因和癌种，再评估向量检索、临床试验、指南、冲突处理和多轮问答；
- 长期版本：建立持续的知识获取、人工审核、发布和更新工作流。

### 下一步待确认

- 最终中英文产品名：当前仓库名为 `Evidex`，讨论中的首选候选名为 `EvidOnc`，尚未最终确认；
- 首批证据已按产品负责人指示快速默认通过，仍需后续肿瘤学/肿瘤药学/分子病理专业复核；
- IFUM 全文为 CC BY-NC-SA 3.0，若产品转为商业对外服务需再次完成来源许可审核；
- Landing Page 的下一阶段视觉、账号和产品化交互范围。

开发所需的接口契约、数据库模型、检索逻辑、证据等级、测试范围和完成标准已固化在[《Evidex V0 后端技术规格》](./docs/specs/evidex-v0-backend.md)。

### 当前可运行 MVP

- Neon PostgreSQL 已迁移并发布不可变知识版本 `v0.2.0`；
- 当前知识包含 2 个疾病、2 个基因、5 个变异、8 个药物、13 个治疗关联、20 条临床 claim、9 条 FDA 批准记录和 22 份来源文档；
- Evolink 使用服务端固定模型 `gpt-5.6-terra`；模型只归纳 Evidence Pack，不决定检索、FDA 状态或 Evidex 等级；
- `POST /api/v1/evidence-answer` 已跑通数据库检索、模型结构化输出、引用白名单校验和答案缓存；
- Agent/Skill 平台已有可运行纵向链路：人工 Preview、持久 Discovery Run、分页 PubMed 获取、跨查询去重、受治理抽取/独立判级/QA、待审草稿、人工批准发布、知识目录和异步自然语言问答；
- 证据与监管复核入口见 [`data/evidex/v0/REVIEW.md`](./data/evidex/v0/REVIEW.md)。

知识包操作：

```bash
pnpm evidex:import -- --dry-run --data data/evidex/v0 --release v0.2.0
pnpm evidex:import -- --data data/evidex/v0 --release v0.2.0
pnpm evidex:smoke
```

导入器会校验 Zod 字段、稳定 ID、外键、PRIMARY passage、模型使用权限、FDA INDICATION passage、审核状态和等级重算；正式发布在单一事务中完成，同内容重跑返回 `UNCHANGED`，冲突内容失败并回滚。

### **2026-09-17 验收结论：待审核、发布与问答门禁**

> **结论：审核页面和“先审核、后发布”的核心门禁已经实现；2026-09-17 的发布等级快照、统一 Release 选择和批准说明门禁整改也已完成。不要重新开发已经存在的审核队列。**

当前真实链路为：

```text
Discovery / 单篇 PMID
→ Candidate Document + Evidence Draft（仅 Staging）
→ /[locale]/ops/reviews 待审核队列
→ /[locale]/ops/reviews/[reviewTaskId] 医学审核工作台
→ REQUEST_CHANGES / REJECT / APPROVE_AND_PUBLISH
→ 单事务创建 patch Knowledge Release
→ Knowledge 与异步 Ask 只按已发布 release + 已审核 Claim 查询
```

已核实的安全边界：

- Candidate、Draft 和 Review Task 与正式 `source_document`、`evidence_claim`、`knowledge_release_claim` 分开保存；生成草稿本身不会进入公开知识。
- `APPROVE_AND_PUBLISH` 需要登录管理员权限、最新草稿版本、非空批准说明、幂等键且不得存在 BLOCKING QA；正式知识、Release 成员关系、最终等级快照和审核状态在一个数据库事务内写入。
- Knowledge、异步自然语言 Ask 与兼容结构化问答默认锁定最新 `PUBLISHED` Release，并同时过滤 `review_status=APPROVED` 和 release 成员关系；旧 Release 不会看到后来批准的 Claim，也不会被新等级污染。
- 当前所谓 RAG 是**版本化结构化检索 + Evidence Pack + 受约束生成**，不是 embedding / 向量数据库。医学实体和关系优先使用确定性检索；向量召回只作为后续可评估的补充能力。

下一阶段的向量化方案已经固化在[《Evidex 向量数据库与混合 RAG 技术规格》](./docs/specs/evidex-vector-rag.md)：使用现有 Neon PostgreSQL + pgvector，在保留结构化医学安全门的前提下增加向量与全文召回；该文档目前是待实施设计，不代表向量检索已经上线。

**2026-09-17 已完成整改：**

| 优先级 | 问题                                                                                                      | 整改要求                                                                                                                                                               |
| ------ | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1     | Release Association 等级快照                                                                              | `knowledge_release_association` 保存最终 `approvedLevel` / `gradingRationale`；patch 发布复制旧快照并只覆盖当前 Association，Knowledge、Ask 与 Release Diff 均读取快照 |
| P1     | 公开查询 Release 选择                                                                                     | Knowledge、异步 Ask 和 `POST /api/v1/evidence-answer` 默认使用最新 `PUBLISHED`；仅显式 `EVIDEX_KNOWLEDGE_RELEASE_OVERRIDE` 可用于历史复现/回滚                         |
| P1     | 审核发布确认                                                                                              | Review Task 返回服务端计算的 `publicationPreview`；批准说明在 API Schema 和服务层双重必填，成功体返回实际 `releaseVersion`                                             |
| P2     | 当前自动更新主要向已有已批准 Association 增加 Claim，尚不能完整创建全新的疾病、基因、变异、药物和治疗关联 | 后续增加 Proposed Entity / Proposed Association 的 Staging 与审核发布路径；在实现前不得宣称系统可以自动扩展任意新知识图谱关系                                          |

发布与检索的统一验收必须覆盖：未审核、已退回、已拒绝数据在 Knowledge 和两种问答接口中均不可见；批准后新 Claim、最终等级和 Release 版本均可见；发布失败全部回滚；历史 Release 查询结果保持不变。

### **本轮必须修改：人工发起知识更新与平台整改**

> **开发必读：暂时不做每周自动更新。** 内部用户点击“发起知识更新”，选择检索范围和文献数量后创建一次后台任务。页面关闭、刷新或服务短暂重启都不能导致任务丢失；系统只生成待审核证据，人工批准后才进入正式知识库。

本轮目标交互：

```text
Evidence Ops 点击“发起知识更新”
→ 选择“整个知识库”或疾病 / 基因 / 变异范围
→ 选择处理 50 篇、100 篇或全部匹配文献
→ 预览规范化范围、时间窗、预计数量和警告
→ 用户确认后创建持久 Discovery Run
→ 多 Agent 发现、筛选、抽取、规范化、分级和 QA
→ 生成可导航的待审核任务
→ 人工退回、驳回或批准发布
→ Knowledge 与 Ask 使用新的不可变知识版本
```

表单规则：

| 字段     | 默认值                   | 规则                                                                                                   |
| -------- | ------------------------ | ------------------------------------------------------------------------------------------------------ |
| 更新范围 | 整个知识库               | 也可切换为指定范围；疾病、基因、变异使用当前规范目录的搜索选择器，不能把未识别自由文本直接交给模型猜测 |
| 文献数量 | 50                       | 支持 50、100、全部；上限按所有子查询合并、PMID 去重后统一计算                                          |
| 时间窗   | 最近成功截止点至当前时间 | 新范围无历史游标时默认回看 90 天；可在高级设置中调整                                                   |
| 全部文献 | 关闭                     | 必须先预览并二次确认；使用稳定排序、分页和游标处理到来源耗尽，不用一个伪造的大数字代表全部             |

#### 本轮后端实现前的审计基线（历史）

以下表格保留 2026-09-16 开始开发前的差距，用于解释本轮变更来源；其中持久队列、Preview、Skill Runtime、独立判级、运行 Trace 和 `NEEDS_HUMAN` 等后端 P1 项已经实现，下游 Ask 的发布目录驱动解析、持久任务和真实 Skill Trace 也已经补齐。前端页面项不属于本轮后端交付。更完整的字段、状态、接口和验收见[《Evidex Agent 与 Skill 平台规格》第 1.1—1.2 节](./docs/specs/evidex-agent-skill-platform.md)。

| 优先级 | 当前已有                                                                      | 本轮必须补齐                                                                                                                         |
| ------ | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| P1     | 已有检索策略手工触发和 Discovery Run                                          | 新增统一发起页、全库/指定范围、50/100/全部、Preview 与幂等创建；移除本轮对每周调度的要求                                             |
| P1     | 当前长任务使用请求后的临时执行                                                | 接入持久队列和 Worker，保存分页游标，支持断点续跑、限流、重试、暂停、继续、取消和失败恢复                                            |
| P1     | 已有 Review API 与审核详情雏形                                                | 新增 `/ops/reviews` 队列及导航入口；`REQUEST_CHANGES` 必传字段，`REJECT` 必填原因；决策后刷新状态并禁用非法重复操作                  |
| P1     | 已有 Skill 定义、Schema 校验和执行原语                                        | 生产 Workflow 必须真实调用 Skill Runtime 并强制 allowlist、Schema、超时、最大重试、预算和失败 Trace，不能只记录版本字符串            |
| P1     | 已有抽取、草稿与发布纵向链路                                                  | 不再要求预选单一 Association；收录、实体/关系、规范化、分级和 QA 分节点产出 Artifact；等级不得复制已有结论，字段必须定位到句子或段落 |
| P2     | 已有 Workflow Run/Step/Artifact 页面                                          | 保存所有真实节点轨迹；等待人工审核时使用 `NEEDS_HUMAN` 等非终态，不能提前标记 `SUCCEEDED`                                            |
| P2     | 已有 Knowledge 四类目录、搜索、详情和引用                                     | 保持同一发布版本隔离；补数据库冷启动/跨区性能优化、缓存、移动端与键盘可访问性和真实交互 E2E                                          |
| P2     | 已有异步 Ask、Evidence Pack、引用校验和反馈                                   | 去除只覆盖少数实体的硬编码解析；改为已发布目录驱动，并把问题理解、检索规划、证据分析、回答生成和引用 QA 变成可追踪 Agent/Skill       |
| P2     | Agent、Skill、Workflow 页面目前以查看为主                                     | 提供受控的 Draft 复制、允许 Skill/Tool、节点顺序、条件分支、重试、评估、激活和回滚；不允许浏览器执行任意代码                         |
| P2     | 已有基础内部鉴权、同源保护和进程内限流                                        | 将公开接口限流迁移到 Redis/数据库等共享存储；定义 p50/p95 延迟预算并优先同区部署应用和数据库                                         |
| P2     | Knowledge、Ask、Ops 功能集中在大型客户端组件                                  | 按表单、查询、列表、详情和运行状态拆分；增加导航当前态、移动抽屉焦点锁定、Escape/焦点返回、至少 44px 热区和统一设计令牌              |
| P2     | 审计时 40 个测试文件、286 个测试通过；隔离生产构建与 8 条 Playwright E2E 通过 | 将三大前端主组件和 PostgreSQL Repository 纳入覆盖与真实数据库/交互测试；本次审计未重跑数据库测试，不能据此宣称数据库验收完成         |
| P2     | 核心平台文件当前存在未提交或未跟踪状态                                        | 交付前将代码、迁移、测试和文档全部纳入版本控制，并通过 `git status --short` 复核                                                     |

#### 已实现的 Discovery Run API

以下接口已经实现，供完整 Ops 前端直接调用：

```text
POST /api/internal/v1/discovery-runs/preview
POST /api/internal/v1/discovery-runs
POST /api/internal/v1/discovery-runs/{id}/pause
POST /api/internal/v1/discovery-runs/{id}/resume
POST /api/internal/v1/discovery-runs/{id}/cancel
```

Preview 请求包含 `scope.mode`、规范的 `diseaseIds` / `geneIds` / `variantIds`、`documentLimit` 和时间窗。创建 Run 必须携带服务端返回的 `previewToken` 与 `idempotencyKey`，服务端校验用户没有在 Preview 后偷换范围或数量。

Preview 不创建 Candidate、不调用抽取模型，也不写 Discovery Run。创建接口返回 HTTP `202`，任务由独立 Worker 从 PostgreSQL 队列领取；页面刷新、服务重启不会丢失游标。旧的 `POST /api/internal/v1/discovery-strategies/{id}/trigger` 已退役并返回 HTTP `410` / `USE_DISCOVERY_RUN_PREVIEW`。

```ts
const preview = await fetch('/api/internal/v1/discovery-runs/preview', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    scope: {
      mode: 'SCOPED',
      diseaseIds: ['disease_nsclc'],
      geneIds: ['gene_egfr'],
      variantIds: ['variant_l858r'],
    },
    documentLimit: 50,
    // window 可省略；无历史游标时默认回看 90 天。
  }),
}).then((response) => response.json());

const created = await fetch('/api/internal/v1/discovery-runs', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'idempotency-key': crypto.randomUUID(),
  },
  body: JSON.stringify({ previewToken: preview.data.previewToken }),
}).then((response) => response.json());
```

`preview.data` 包含 `snapshot`、`documentLimit`、`window`、`queries`、`estimatedMatchCount`、`warnings`、`previewHash`、`expiresAt` 和 `previewToken`。Token 与当前登录用户绑定，有效期 15 分钟；相同规范范围和时间窗重复确认会返回同一个 Run，并以 `idempotent: true` 标识。

后端验收标准是：同一范围和时间窗重复提交不产生重复 Run；50/100 上限在跨查询去重后生效；“全部”能够分页续跑；关闭页面和重启 Worker 不丢进度；所有合格候选进入待审核区且不会自动发布；批准后新证据能被 Knowledge 浏览和 Ask 引用。

### Agent/Skill 平台与完整前端 API

仓库已按[《Evidex Agent 与 Skill 平台规格》](./docs/specs/evidex-agent-skill-platform.md)建立 Knowledge、Ask 与 Evidence Ops 后端。现有结构化接口保持兼容；公开知识浏览、问答、证据生产、人工审核和运行监控均有可调用接口。本轮只交付后端，前端页面可依据下列契约独立开发。

当前已实现的上游链路为：

```text
人工选择全库或规范实体范围
  → 只读 Preview 与短期确认 Token
  → PostgreSQL 持久队列、稳定分页与跨查询 PMID 去重
  → PubMed 题录/摘要获取
  → Skill Runtime：抽取、独立建议等级、完整性 QA
  → Candidate / Workflow Run / Draft / Artifact / Review Task
  → 人工审核（乐观锁 + 幂等键）
  → 单事务发布 patch release
  → 新 Claim 仅属于新 release
```

抽取和问答均使用服务端固定的 Evolink `gpt-5.6-terra`。抽取模型只能生成待审草稿，不能调用发布能力；正式发布必须来自已登录且具有 `admin.access` 权限的审核人。生产抽取链路已通过 Skill Runtime 强制执行输入/输出 Schema、Agent allowlist、超时、最大重试和不可变 Trace。新文献的 `proposedLevel` 由文献自身的方向与成熟度独立产生，不复制历史 Association 等级；等待人工审核的 Workflow 状态为 `NEEDS_HUMAN`。

新拉取的 PubMed 摘要默认允许服务端模型处理，但公开展示策略为 `LINK_ONLY`；知识接口返回题录和 PubMed 链接，不直接公开整段摘要。审核页面可以创建新的不可变草稿版本并记录编辑人和原因；只有完成来源许可复核后才能显式调整公开摘录策略。

下游链路为：

```text
自然语言问题
  → PII 脱敏与越界安全门
  → 锁定一个已发布知识版本
  → understand_question：按该版本的疾病/基因/变异/药物目录确定性解析
  → 单事务创建 Question Run、下游 Workflow Run 和 PostgreSQL Job
  → 独立 Worker 执行 normalize_query、build_retrieval_plan、build_evidence_pack
  → analyze_evidence、Evolink compose_evidence_answer、validate_answer
  → 每个真实 Skill 保存 Step、Artifact、版本和输入/输出哈希
  → 前端按 Question Run ID 轮询实际阶段与公开终态
```

问答请求不会依赖 Next.js 进程内的后台回调；API 服务重启后，未完成 Job 仍可由 Worker 领取。Worker 锁过期时可恢复同一个 `RUNNING` Question Run；同一幂等键并发提交只会产生一个 Run。实体候选只来自该 Question Run 锁定的发布目录，新增已发布实体不需要修改解析代码，未知或歧义实体不会被近似猜测。

知识发布现在显式维护 `knowledge_release_claim`。向已有治疗关联增加 Claim 时，旧 release 不会读到新 Claim；目录和问答也只查询同一个 release 下已审核、已发布的数据。

#### 公开 Knowledge 与 Ask 接口

这些接口供完整公开前端使用，不限于 Landing Page。Knowledge 接口只返回同一已发布版本中的审核数据；`LINK_ONLY`/`INTERNAL_ONLY` passage 不返回正文。

| 方法   | 路径                                                       | 用途                                                              |
| ------ | ---------------------------------------------------------- | ----------------------------------------------------------------- |
| `GET`  | `/api/v1/knowledge/summary?release=`                       | 当前或指定发布版本、截止日期、分级规则、数量和最近发布版本        |
| `GET`  | `/api/v1/knowledge/search`                                 | 跨疾病/基因/变异/药物搜索                                         |
| `GET`  | `/api/v1/knowledge/diseases`、`genes`、`variants`、`drugs` | 分类型目录；支持 `q`、`release`、`page`、`pageSize` 和适用筛选    |
| `GET`  | `/api/v1/knowledge/diseases/{id}`                          | 疾病详情、已发布治疗关联和相关实体                                |
| `GET`  | `/api/v1/knowledge/genes/{id}`                             | 基因详情、已发布治疗关联和相关实体                                |
| `GET`  | `/api/v1/knowledge/variants/{id}`                          | 变异详情、已发布治疗关联和相关实体                                |
| `GET`  | `/api/v1/knowledge/drugs/{id}`                             | 药物详情、已发布治疗关联和相关实体                                |
| `GET`  | `/api/v1/knowledge/evidence/{id}`                          | Evidence Claim、治疗关联、来源 passage 和公开摘录                 |
| `GET`  | `/api/v1/knowledge/sources/{id}`                           | PubMed/FDA 来源详情、可公开 passage、关联 Claim 与监管记录        |
| `POST` | `/api/v1/evidence-questions`                               | 创建持久化自然语言 Question Run，返回 HTTP `202`                  |
| `GET`  | `/api/v1/evidence-questions/{id}`                          | 轮询进度与公开终态；不返回 Prompt、模型原始输出、费用或内部 Trace |
| `POST` | `/api/v1/evidence-questions/{id}/retry`                    | 重排原失败任务，不重复创建 Question Run                           |
| `POST` | `/api/v1/evidence-questions/{id}/feedback`                 | 对终态回答提交帮助度、引用、限制、可理解性或其他反馈              |

目录和搜索通用参数：`q`、`release`、`page`（默认 1）、`pageSize`（默认 20，最大 100）。还可按 `diseaseId`、`geneId`、`direction=SENSITIVITY|RESISTANCE|EXPLORATORY` 和 `level=1|2|3A|3B|4|R1|R2|UNRATED` 筛选。成功列表统一返回：

```ts
type PageResult<T> = {
  items: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};
```

自然语言问题示例：

```ts
const created = await fetch('/api/v1/evidence-questions', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'idempotency-key': crypto.randomUUID(),
  },
  body: JSON.stringify({
    question: 'NSCLC 的 EGFR p.L858R 有哪些治疗证据？',
    locale: 'zh-CN',
  }),
}).then((response) => response.json());

const result = await fetch(
  `/api/v1/evidence-questions/${created.data.questionRunId}`
).then((response) => response.json());
```

创建接口固定返回 HTTP `202`，`data` 为 `{ questionRunId, status, pollAfterMs }`。轮询接口的 `data` 包含：

```ts
type PublicQuestionRunResponse = {
  id: string;
  questionRunId: string;
  status:
    | 'PENDING'
    | 'RUNNING'
    | 'NEEDS_CLARIFICATION'
    | 'ANSWERED'
    | 'NO_CURATED_EVIDENCE'
    | 'OUT_OF_SCOPE'
    | 'SUMMARY_UNAVAILABLE'
    | 'FAILED'
    | 'CANCELLED';
  progress:
    | 'UNDERSTANDING_QUESTION'
    | 'RETRIEVING_APPROVED_EVIDENCE'
    | 'ORGANIZING_EVIDENCE'
    | 'COMPOSING_ANSWER'
    | 'VALIDATING_CITATIONS'
    | 'COMPLETED';
  pollAfterMs: number | null;
  question: string; // 已脱敏
  normalizedQuestion: PublicQuestionInterpretation;
  knowledgeRelease: {
    id: string;
    version: string;
    literatureCutoffAt?: string;
    regulatoryCutoffAt?: string;
    gradingRuleVersion?: string;
  };
  result: unknown | null;
  disclaimer: string;
  disclaimerEn: string;
  createdAt: string;
  completedAt: string | null;
};
```

`progress` 来自后端实际 Workflow Step，不是前端计时器。`PENDING`/`RUNNING` 时按 `pollAfterMs` 继续轮询；终态时该值为 `null`。终态包括 `NEEDS_CLARIFICATION`、`ANSWERED`、`NO_CURATED_EVIDENCE`、`OUT_OF_SCOPE`、`SUMMARY_UNAVAILABLE`、`FAILED` 和 `CANCELLED`。缺少疾病，或询问剂量、处方、最佳治疗时，不调用回答模型。治疗比较和监管状态问题会保留 `intent`，问题中明确出现的药物会实际约束 Evidence Pack。`ANSWERED` 和 `SUMMARY_UNAVAILABLE` 的结构化证据仍沿用 [`src/shared/types/evidence.ts`](./src/shared/types/evidence.ts)；公开接口不返回内部 Prompt、模型原始输出、费用或 Trace。

`FAILED` 或 `SUMMARY_UNAVAILABLE` 可调用 `POST /api/v1/evidence-questions/{id}/retry`。接口返回 HTTP `202` 和 `{ questionRunId, status: "PENDING", pollAfterMs: 1000, idempotent }`，复用原 Question Run、锁定知识版本和持久任务；重复点击只返回同一个 `PENDING`/`RUNNING` 任务，不创建副本。已回答、无证据、需澄清或越界等不可重试终态返回 `409 QUESTION_RUN_NOT_RETRYABLE`。

反馈示例：

```ts
await fetch(`/api/v1/evidence-questions/${questionRunId}/feedback`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'idempotency-key': crypto.randomUUID(),
  },
  body: JSON.stringify({
    category: 'MISSING_LIMITATION',
    comment: '希望更明确区分同病种与跨适应证证据',
  }),
});
```

#### 内部 Evidence Ops 接口

内部接口要求服务端登录会话和 `admin.access` 权限；所有写接口还检查同源 `Origin`。前端不要传审核人 ID，服务端只采用登录会话身份。

登录、注册、退出和会话由模板已有的 Better Auth `GET|POST /api/auth/*` 处理；仓库内前端优先复用 [`src/core/auth/client.ts`](./src/core/auth/client.ts) 的 `useSession`、`signIn`、`signUp` 和 `signOut`。Ops 用户还需通过 `pnpm rbac:assign` 获得管理员角色。

| 模块               | 方法与路径                                                                                                                                                                          | 用途                                                      |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| Dashboard          | `GET /api/internal/v1/ops/dashboard?range=`（`7d` 或 `30d`）                                                                                                                        | 漏斗、积压、失败率、重试、人工介入、最近运行/发布和告警   |
| Association        | `GET /api/internal/v1/associations`                                                                                                                                                 | 为 PMID 入库、策略和审核页面选择已审核治疗关联            |
| Discovery Strategy | `GET /api/internal/v1/discovery-strategies`；`POST /{id}/pause`、`resume`                                                                                                           | 策略目录与策略启停；旧 `trigger` 返回 `410`               |
| Discovery Run      | `POST /api/internal/v1/discovery-runs/preview`；`GET`、`POST /api/internal/v1/discovery-runs`；`GET /{id}`；`POST /{id}/pause`、`resume`、`cancel`                                  | 只读预览、幂等创建、进度详情和运行控制                    |
| Candidate          | `GET`、`POST /api/internal/v1/candidates`；`GET /api/internal/v1/candidates/{id}`；`POST /api/internal/v1/candidates/{id}/retry`                                                    | 列表/详情、单篇 PMID 入库和失败任务重试请求               |
| Review             | `GET /api/internal/v1/review-tasks`；`GET /api/internal/v1/review-tasks/{id}`；`PATCH /api/internal/v1/review-tasks/{id}/draft`；`POST /api/internal/v1/review-tasks/{id}/decision` | 审核队列、详情、版本化编辑、退回/驳回/批准发布            |
| Release            | `GET /api/internal/v1/releases`；`GET /api/internal/v1/releases/{id}`                                                                                                               | 版本、成员数量、变更集和审核来源                          |
| Definition Catalog | `GET /api/internal/v1/agents`；`GET /api/internal/v1/skills`；`GET /api/internal/v1/workflows`                                                                                      | Agent/Skill/Workflow 版本、Schema、工具权限和状态         |
| Execution Trace    | `GET /api/internal/v1/workflow-runs`；`GET /api/internal/v1/workflow-runs/{id}`；`GET /api/internal/v1/question-runs`；`GET /api/internal/v1/question-runs/{id}`                    | Workflow step/artifact、Question Run 与反馈的内部排障信息 |
| Definition Version | `POST /api/internal/v1/{agents                                                                                                                                                      | skills                                                    | workflows}/{id}/versions`；`PATCH /versions/{versionId}`；`POST /versions/{versionId}/evaluate`、`activate`、`rollback`；`GET /{id}/audit` | 受控复制、编辑、评估、激活、回滚和审计，不执行任意代码 |
| Worker Health      | `GET /api/internal/v1/worker/health`                                                                                                                                                | Worker 心跳、存活实例数、队列积压、重试等待和死信状态     |

所有内部列表支持 `page`、`pageSize`、`q`、`status`、`from` 和 `to`，并返回与公开列表相同的 `PageResult`。Review 队列额外支持 `waitingAge=24h|72h|7d`、`diseaseId`、`geneId`、`variantId`、`risk=LOW|MEDIUM|HIGH` 和 `blocking=true|false`。未知详情返回 `404`，未登录/无权限返回 `401` 或 `403`，草稿版本或审核状态并发冲突返回 `409`。

Review 列表项同时返回 `waitingHours`、`waitingSince`、疾病/基因/变异摘要、`risk` 和 `hasBlockingIssues`，前端无需自行拼接目录数据。Candidate 详情中的 Workflow Step 和 Artifact 是真实持久记录；手工 PMID 与批量 Discovery 使用同一 Eligibility → Extraction → Entity Recognition → Normalization → Relationship → Grading → QA 链路。不命中目标疾病与基因的来源保存为可审计 `EXCLUDED`，不会调用抽取模型。

审核草稿更新必须携带当前版本并说明原因；更新会创建新 Draft，不覆盖 Agent 原始版本：

```json
{
  "expectedDraftVersion": 1,
  "reason": "已核对 PubMed 摘要中的人群、终点和局限",
  "draft": {
    "associationId": "association-id",
    "proposedLevel": "3A",
    "gradingRationale": "...",
    "passages": [],
    "claims": [],
    "fieldProvenance": {},
    "qaIssues": []
  }
}
```

`fieldProvenance` 的键使用 `claims.<从 0 开始的 claim 下标>.<字段名>`，值是支撑该字段的 `passageId[]`。例如：

```json
{
  "fieldProvenance": {
    "claims.0.populationSummary": ["passage-pubmed-123-abstract-1"],
    "claims.0.endpoint": ["passage-pubmed-123-abstract-2"]
  }
}
```

Passage 可包含 `locator.sentenceIndex`；后端会拒绝未知 passage、越界 claim 下标、未知草稿字段、缺少允许模型使用的 PRIMARY passage 以及带 BLOCKING QA 的草稿。

`GET /api/internal/v1/review-tasks/{id}` 的 `data.publicationPreview` 由服务端按当前最新发布版本计算，前端无需自行对正式知识做 diff：

```json
{
  "currentApprovedLevel": "1",
  "currentGradingRationale": "当前 Release 的分级理由",
  "proposedApprovedLevel": "3A",
  "proposedGradingRationale": "审核后拟发布的分级理由",
  "levelChanged": true,
  "newClaimCount": 1,
  "modifiedClaimCount": 0,
  "source": {
    "sourceType": "PUBMED",
    "externalId": "12345678",
    "sourceScope": "ABSTRACT"
  },
  "currentRelease": { "id": "release-id", "version": "v0.3.0" },
  "expectedNextRelease": "v0.3.1"
}
```

当前 P1 工作流中的 Draft Claim 均按拟新增 Claim 计数，因此 `modifiedClaimCount` 固定为 `0`。Release 详情的 `members.associationSnapshots[]` 返回每个 Association 在该版本的 `associationId`、`approvedLevel` 和 `gradingRationale`，用于版本 Diff。

批准发布请求示例：

```json
{
  "decision": "APPROVE_AND_PUBLISH",
  "expectedDraftVersion": 1,
  "comment": "已核对研究人群、终点和原文摘要",
  "idempotencyKey": "review-task-id:1:approve"
}
```

接口 DTO 可直接从 [`src/shared/types/evidence-platform-api.ts`](./src/shared/types/evidence-platform-api.ts) 导入；医学回答 DTO 继续从 [`src/shared/types/evidence.ts`](./src/shared/types/evidence.ts) 导入。成功体统一为 `{ code: 0, message: "ok", data }`，错误体统一为 `{ code: -1, message, details? }`。

当前边界：Discovery Run、Candidate retry 和 Question Run 均进入 PostgreSQL 持久队列，Worker 支持锁超时恢复、指数退避和死信状态；Discovery 保存每个子查询的分页游标，支持暂停、继续和取消。没有每周或 Cron 定时器。完整自主决策式 Agent、企业配额/SLA 仍不在本轮范围。

Worker 必须作为与 Next.js API 独立的常驻进程部署：

```bash
# 常驻轮询，空闲时默认每 2 秒检查一次
pnpm evidex:worker

# 运维或测试时只领取一个任务
pnpm evidex:worker -- --once

# 可选轮询间隔，限制为 250—60000 ms
pnpm evidex:worker -- --poll-ms 5000

# 使用同一 Dockerfile/源码版本构建 Web 与 Worker
docker build --target runner -t evidex-web .
docker build --target worker -t evidex-worker .
```

生产环境必须从同一 Git revision 构建并部署 Web `runner` 与 `worker` target，至少保持一个独立 Worker 进程，并使用与 API 相同的 `DATABASE_URL`、Evolink、NCBI 和 Workflow 环境变量；不要把 Worker 循环放进请求生命周期。部署前先由一次性发布任务执行 `pnpm db:migrate`。部署后通过 `GET /api/internal/v1/worker/health` 检查：`status=HEALTHY`、`liveWorkerCount >= 1`，并监控 `backlog.queued`、`retryWaiting` 与 `deadLetter`。API 实例和 Worker 的 PubMed 请求使用 PostgreSQL `rate_limit_bucket` 原子行锁共享状态，不依赖单进程内存。

PubMed 分页使用 NCBI History 的 `WebEnv/query_key` 快照游标，服务端按有无 NCBI API key 分别限制请求速率，并对 `429`/`5xx` 执行有限重试和 `Retry-After`。存在 PMCID 时，仅对白名单许可（CC0/Public Domain/不含 NC 或 ND 限制的 CC BY）使用全文；未知或受限许可一律回退 PubMed 摘要，并在 Candidate/Source 中保留 `pmcid`、`sourceScope`、原始 `license`、许可判定及原因。

### CIViC 候选发现试点

Ops 的“发起知识更新”支持显式选择 `CIVIC` 来源。试点只覆盖现有 NSCLC、CRC 与 5 个变异（EGFR L858R、E746_A750del、T790M；KRAS G12C、G12D），只读取 CIViC 中 `ACCEPTED + PREDICTIVE + PUBMED` 的 Evidence Item。服务端仍会校验疾病、基因和分子谱，按 PMID 合并重复 EID，并保存 CIViC EID、查询范围、治疗、等级、方向、显著性和检索时间等审计来源。

CIViC 不作为可直接发布的证据正文，也不会把 CIViC Evidence Level 映射成 Evidex 等级。候选 PMID 必须重新从 PubMed 获取原文，继续经过现有去重、Eligibility、抽取、QA 和人工审核；分子谱不是精确命中，或 CIViC 治疗不能精确覆盖当前 Association 的候选会停在 `NEEDS_HUMAN`。预览数是 CIViC Evidence Item 数而不是唯一文献数，执行时才按 PMID 去重。匿名 GraphQL 调用通过 PostgreSQL 共享限流，并对 `429`/`5xx` 做有限重试；`EVIDEX_CIVIC_API_KEY` 可选。

### Landing Page 开发接入手册

截至 2026-09-11，Landing Page 已直接接入真实后端并提供癌种/变异选择，不需要维护模拟医学结果。当前 Neon `public` schema 使用 `v0.2.0`。`GET /api/v1/evidence-options` 是前端选择项的事实来源，`POST /api/v1/evidence-answer` 返回结构化证据与受约束综述。

#### 最短接入路径

Landing Page 如果继续开发在这个 Next.js 项目内，应使用同源相对地址调用服务端路由：

```ts
const options = await fetch('/api/v1/evidence-options').then((response) =>
  response.json()
);

// options.data.diseases: 2 个可选癌种
// options.data.variants: 5 个规范变异
// options.data.queries: 6 个当前有直接证据的 [disease, canonicalVariantKey] 组合
```

当前 `queries` 为：`NSCLC + EGFR p.L858R`、`NSCLC + EGFR p.E746_A750del`、`NSCLC + EGFR p.T790M`、`NSCLC + KRAS p.G12C`、`CRC + KRAS p.G12C`、`CRC + KRAS p.G12D`。选择器应只展示这些直接证据组合；API 规范化器仍可接受已支持实体的其他组合，并以 `NO_CURATED_EVIDENCE` 明确表示当前版本暂无已收录证据。

```ts
const response = await fetch('/api/v1/evidence-answer', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    disease: 'NSCLC',
    biomarkers: [
      {
        gene: 'EGFR',
        alterationType: 'SNV',
        hgvsp: 'p.L858R',
      },
    ],
    jurisdiction: 'US',
    locale: 'zh-CN',
  }),
});

const payload = await response.json();

if (!response.ok) {
  throw new Error(payload.message ?? 'EVIDEX_REQUEST_FAILED');
}

return payload.data;
```

本地联调：

```bash
# 推荐：同时启动 Web 与异步 Worker；自然语言问答、Discovery 和重试都需要 Worker
pnpm dev:full

curl --request POST 'http://localhost:3000/api/v1/evidence-answer' \
  --header 'content-type: application/json' \
  --data '{
    "disease": "NSCLC",
    "biomarkers": [{
      "gene": "EGFR",
      "alterationType": "SNV",
      "hgvsp": "p.L858R"
    }],
    "jurisdiction": "US",
    "locale": "zh-CN"
  }'
```

`POST /api/v1/evidence-answer` 仍是严格结构化输入，只接受一个 biomarker。疾病、基因和 HGVS 的大小写，以及 `p.` 前缀、`CRC`/`colorectal cancer`、`exon19del` 等有限别名可以规范化；`jurisdiction` 必须是 `US`，`locale` 必须是 `zh-CN`。自由文本页面应改用上面的异步 `/api/v1/evidence-questions`，实体 ID 仍由确定性目录解析，不让模型猜测疾病或变异。

#### 响应状态与页面行为

| HTTP | `data.status`                                      | Landing Page 行为                                                                 |
| ---- | -------------------------------------------------- | --------------------------------------------------------------------------------- |
| 200  | `ANSWERED`                                         | 展示模型综述和 `resultGroups` 中的结构化证据；`cached` 只用于调试或轻量状态提示。 |
| 200  | `SUMMARY_UNAVAILABLE`                              | 显示“综述暂不可用”，但仍完整展示 `resultGroups`、来源和免责声明。                 |
| 200  | `NO_CURATED_EVIDENCE`                              | 显示当前知识版本暂无已收录证据，不要表述成“没有医学证据”。                        |
| 200  | `OUT_OF_SCOPE`                                     | 根据 `field` 提示 V0.2 当前支持的癌种、基因、变异、地区和语言。                   |
| 400  | 无；错误体 `message=INVALID_INPUT`                 | 展示输入格式错误，可读取 `details` 定位具体字段。                                 |
| 413  | 无；错误体 `message=PAYLOAD_TOO_LARGE`             | 提示请求内容过大；接口上限为 64 KiB。                                             |
| 500  | 无；错误体 `message=KNOWLEDGE_RELEASE_UNAVAILABLE` | 展示服务暂不可用，不要降级为前端预置医学答案。                                    |

成功域响应统一使用 `{ code: 0, message: "ok", data }`；HTTP 错误使用 `{ code: -1, message, details? }`。`OUT_OF_SCOPE` 是有效业务结果，因此仍返回 HTTP 200，页面不能只按 HTTP 状态判断结果。

`ANSWERED`、`SUMMARY_UNAVAILABLE` 和 `NO_CURATED_EVIDENCE` 的 `data` 主体如下：

```ts
type EvidencePageData = {
  status: 'ANSWERED' | 'SUMMARY_UNAVAILABLE' | 'NO_CURATED_EVIDENCE';
  normalizedInput: {
    disease: 'NSCLC' | 'CRC';
    gene: 'EGFR' | 'KRAS';
    alterationType: 'SNV' | 'DEL';
    hgvsp: 'p.L858R' | 'p.E746_A750del' | 'p.T790M' | 'p.G12C' | 'p.G12D';
    canonicalVariantKey: string;
    jurisdiction: 'US';
    locale: 'zh-CN';
  };
  knowledge: {
    release: string;
    literatureCutoffAt: string;
    regulatoryCutoffAt: string;
    gradingRuleVersion: string;
    promptVersion: string;
  };
  resultGroups: PublicEvidenceResultGroup[];
  answer: EvidenceAnswerDraft | null;
  generatedAt: string;
  cached: boolean;
  disclaimer: string;
  disclaimerEn: string;
};
```

完整字段定义以 [`src/shared/types/evidence.ts`](./src/shared/types/evidence.ts) 为准。Landing Page 在本仓库内开发时可直接复用 `PublicEvidenceResultGroup` 和 `EvidenceAnswerDraft` 类型，避免复制一份容易漂移的接口声明。

#### 页面字段映射

后端返回的结构化数据是事实来源，模型回答只是受证据约束的展示层。建议按以下关系组装页面：

1. 顶部结论使用 `answer.overallSummary`；仅在 `status === 'ANSWERED'` 时存在。
2. 治疗卡片以 `resultGroups[].therapies[]` 为准，显示 `drugs`、`approvedLevel`、`direction`、`regulatoryAlignment` 和 `gradingRationale`。
3. `SAME_DISEASE` 与 `CROSS_INDICATION_EXACT_VARIANT` 必须分区展示；空分组可以隐藏内容，但不要把跨适应证结果混入同疾病证据。
4. 用 `associationId` 将 `answer.groups[].therapies[]` 的归纳文字关联到对应的结构化治疗卡片，不要依赖数组下标或药名匹配。
5. 每条 `answer` statement 的 `evidenceIds` 只能解析到同一治疗卡片的 `evidenceClaims[].id`；`regulatoryApprovalIds` 同理解析到 `regulatoryApprovals[].id`。
6. 文献卡片显示研究人群、样本量、分期、治疗线次、既往治疗、终点、效应量、结论和局限，并使用 `passages[].source.url` 跳转 PubMed/FDA 原始来源。
7. `passages[].text` 可能因 `displayPolicy` 为 `LINK_ONLY` 或 `INTERNAL_ONLY` 而不存在；此时只显示来源和定位信息，不能假设正文缺失是接口错误。
8. 页面固定显示 `knowledge.release`、两个截止日期、`generatedAt`，以及中英文 `disclaimer`。不要声称结果覆盖全部 PubMed 文献。

前端不要自行修改或推断证据等级、FDA 匹配状态、跨适应证归属和引用关系；也不要用模型综述替代 `resultGroups` 中的原始结构化字段。请求期间应提供明确的加载状态并防止重复提交，因为首次生成需要调用外部模型；相同请求、知识版本、提示版本和模型的有效回答会命中数据库缓存。

#### 服务端环境与部署边界

以下变量由 API 服务端使用，Landing Page 不应读取，也绝不能改成 `NEXT_PUBLIC_*`：

```dotenv
DATABASE_PROVIDER="postgresql"
DATABASE_URL="postgresql://..."
DB_SINGLETON_ENABLED="true"
DB_MAX_CONNECTIONS="1"

# 默认留空并读取最新 PUBLISHED；仅历史复现/运维回滚时显式填写。
EVIDEX_KNOWLEDGE_RELEASE_OVERRIDE=""
EVIDEX_PROMPT_VERSION="evidex-answer-v1"
EVIDEX_AI_PROVIDER="evolink"
EVIDEX_AI_MODEL="gpt-5.6-terra"
EVIDEX_EXTRACTION_MODEL="gpt-5.6-terra"
EVIDEX_EVOLINK_API_KEY="..."
EVIDEX_EVOLINK_BASE_URL="https://direct.evolink.ai/v1"
EVIDEX_DISCOVERY_WORKFLOW_VERSION="pubmed-discovery-v2"
EVIDEX_PREVIEW_SECRET="用 openssl rand -hex 32 生成"
EVIDEX_INGESTION_WORKFLOW_VERSION="single-pubmed-v3"
EVIDEX_EXTRACTION_AGENT_VERSION="extraction-agent@1.0.0"
EVIDEX_QUESTION_MIN_INTERVAL_MS="1000"
EVIDEX_FEEDBACK_MIN_INTERVAL_MS="1000"
EVIDEX_NCBI_EMAIL=""
EVIDEX_NCBI_API_KEY=""
EVIDEX_CIVIC_API_KEY=""
EVIDEX_CIVIC_BASE_URL="https://civicdb.org/api/graphql"
```

真实值已经放在本地、被 Git 忽略的 `.env.local` 中；README 和前端代码只保留占位符。浏览器只调用 Evidex API，不能直接连接 Neon 或 Evolink。内部 Ops 接口已接入登录权限和同源写保护；公开问答与反馈有请求大小和频率限制。当前仍没有企业配额、SDK 和公开 API SLA，不应宣传为生产级开放企业 API。

接入新版 Agent/Skill 平台的现有 Neon 数据库需要执行一次增量迁移，但不需要重复导入 V0 知识包；迁移会为历史发布版本回填 Claim 成员关系：

```bash
pnpm db:migrate
pnpm evidex:smoke
```

迁移新增平台表、Discovery/Ops 表、索引、外键、不可变约束、反馈幂等键和历史成员回填，不删除 V0 医学记录。`0005_robust_onslaught.sql` 允许队列保存 `QUESTION_RUN`，`0006_quick_malcolm_colcord.sql` 将 Question Run 关联下游 Workflow；`0007_bizarre_the_spike.sql` 登记上游 Eligibility 与多 Agent 版本以及 `single-pubmed-v2`；`0008_demonic_terror.sql` 增加 PMC 来源范围和许可字段；`0009_solid_magik.sql` 增加 Worker 心跳和 PostgreSQL 共享限流桶；`0010_broken_silverclaw.sql` 保存 PMC 许可判定并登记精确变异安全链路 `single-pubmed-v3`；`0011_mean_master_mold.sql` 为每个历史 Release 回填 Association 最终等级和分级理由快照，并为后续 patch 发布启用版本隔离。若应用版本需要回退，可直接部署旧代码并保留新增列；旧代码仍读取全局 Association，不受新增列影响。迁移失败由数据库事务回滚。已经通过新链路发布 patch release 后，不应删除 `knowledge_release_claim` 或 `knowledge_release_association`，否则会丢失版本隔离信息。

只有连接一套全新数据库时，才依次执行：

```bash
pnpm db:migrate
pnpm evidex:import -- --data data/evidex/v0 --release v0.2.0
pnpm evidex:smoke
```

接入前可运行 `pnpm evidex:smoke` 验证数据库、发布版本、Evolink、结构化输出和缓存链路；成功条件是 `status: "ANSWERED"` 且 `therapyCount: 4`。后端实现入口为 [`route.ts`](./src/app/api/v1/evidence-answer/route.ts)，查询编排位于 [`answer-evidence-query.ts`](./src/shared/services/evidence/answer-evidence-query.ts)，首批证据复核索引位于 [`REVIEW.md`](./data/evidex/v0/REVIEW.md)。

## AI 每次开工必读

**每次新需求、Bug 修复和代码修改都遵循测试先行：明确验收 → 写用例 → 确认预期失败 → 最小实现 → 测试通过 → 重构与回归。** 不允许先写完代码，最后再考虑测试。

- [AGENTS.md](./AGENTS.md)：AI 持久工作指令，包含强制开发流程和完成标准。
- [测试架构与操作指南](./docs/testing.md)：测试分层、命令、覆盖边界与故障处理。
- [需求测试记录模板](./docs/test-plan-template.md)：记录验收场景、失败证据和通过结果。

Codex 会在启动任务时读取项目的 `AGENTS.md`；README 本身不是所有 AI 工具默认读取的入口。本项目通过 `AGENTS.md` 要求每次工作前重读 README 与测试指南。新增指令后，已有会话也应显式重读；其他 AI 工具需使用其支持的项目指令入口。[官方说明](https://learn.chatgpt.com/docs/agent-configuration/agents-md)

## 本地启动

使用 Node 24 和 pnpm 10.30.3（版本在 `.nvmrc`、`package.json` 中固定）：

```bash
corepack enable
corepack prepare pnpm@10.30.3 --activate
pnpm install --frozen-lockfile
cp .env.example .env.local
# 按本地开发需要配置 .env.local，不要提交密钥
pnpm dev:full
```

`pnpm dev:full` 会同时启动 `next dev` 和 `evidex:worker`，其中任一进程退出时会终止另一进程，适合需要异步 Question Run、Discovery Run 或 Candidate Retry 的本地联调。`pnpm dev` 仍只启动 Web，适合不依赖队列的页面开发；此时提交到持久队列的任务会保持 `PENDING/QUEUED`，不会在请求生命周期内执行。

Worker 是否离线可通过已登录 Ops 账号请求 `GET /api/internal/v1/worker/health` 诊断：`status="STALE"`、`liveWorkerCount=0` 表示最近 2 分钟没有存活 Worker；结合 `backlog.queued`、`backlog.retryWaiting` 和 `backlog.oldestPendingSince` 可以确认任务是否因 Worker 离线而积压。

若没有 Corepack，可使用现有 pnpm 执行 `pnpm dlx pnpm@10.30.3 <命令>`，不要用不匹配的全局版本改写锁文件。

## 每次修改的验收命令

```bash
pnpm test:watch                  # 开发中的 RED → GREEN 循环
pnpm test -- tests/unit/resp.test.ts
pnpm verify                      # 类型、静态检查、变更格式、测试策略、覆盖率
pnpm exec playwright install chromium  # 首次运行浏览器测试
pnpm verify:full                 # verify + 隔离配置的生产构建 + 浏览器冒烟
```

本机已有 Google Chrome 时，可使用 `PLAYWRIGHT_CHANNEL=chrome pnpm verify:full`。本次结果见[测试基础验收记录](./docs/test-plans/testing-foundation.md)。

提交前检查结果必须真实可追溯。未通过或未运行的项目要明确原因，不得称为全部完成。纯文档变动不要求人为添加业务测试；重构先运行现有测试、补足覆盖，再改实现。

## 自动化质量检查

Pull Request 和主分支推送会运行质量工作流：类型检查、ESLint、变更文件格式检查、代码/测试变更检查、覆盖率门槛、生产构建及 Chromium 冒烟。失败保留覆盖率报告、浏览器 trace 和截图，便于定位 AI 改动造成的问题。

模板原有的 88 条静态诊断按原文件哈希保留为遗留基线；新增问题或被修改文件中的旧问题都会使检查失败。当前测试保护的是已列明的基础模块与访客路径，尚不代表所有模板功能已验证。支付、真实数据库、登录完整流程和 AI 服务需要随着具体需求继续补充隔离测试。详细范围、遗留问题与本地环境要求见[测试指南](./docs/testing.md)。

CI 文件会随代码提交后生效；要硬性阻止合并，还需在仓库分支规则中将 `Quality Gate / verify` 设置为必需检查。这是仓库设置，单靠 README 和工作流文件无法开启。

## 目录

```text
src/app/                页面和 API 路由
src/core/               数据库、鉴权、国际化和权限基础
src/shared/             业务服务、模型、通用组件和工具
src/extensions/         AI、支付、邮件、存储等外部服务
tests/unit/            单元与测试策略测试
tests/components/      组件交互测试
tests/integration/     接口/服务组合测试（替换外部边界）
tests/e2e/             真实 Next.js 服务上的浏览器/API 冒烟
tests/setup/           测试隔离、清理、网络拦截
docs/                  项目约定与测试说明
```

## 模板来源与许可

本项目基于 ShipAny Template Two，保留上游许可与署名。请勿公开发布 ShipAny 模板源码；使用范围以 [LICENSE](./LICENSE) 为准。

[ShipAny 文档](https://shipany.ai/docs/quick-start) · [模板信息](https://shipany.ai/templates) · [上游反馈](https://github.com/shipanyai/shipany-template-two/issues)
