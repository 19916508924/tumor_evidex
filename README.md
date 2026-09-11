# Evidex

Evidex 是基于 ShipAny Template Two 的新产品项目。当前技术栈为 Next.js 16 App Router、React 19、TypeScript、Tailwind CSS、Drizzle ORM 和 Better Auth。产品功能与验收标准随需求逐步定义。

## 产品定义与当前共识

> 本节汇总截至 2026-09-11 的产品讨论。当前可运行基线为 V0.2；标为“待确认”的内容尚未定案。

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
- 长期自动获取、自动解构、自动审核和定期更新知识；
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
- 证据与监管复核入口见 [`data/evidex/v0/REVIEW.md`](./data/evidex/v0/REVIEW.md)。

知识包操作：

```bash
pnpm evidex:import -- --dry-run --data data/evidex/v0 --release v0.2.0
pnpm evidex:import -- --data data/evidex/v0 --release v0.2.0
pnpm evidex:smoke
```

导入器会校验 Zod 字段、稳定 ID、外键、PRIMARY passage、模型使用权限、FDA INDICATION passage、审核状态和等级重算；正式发布在单一事务中完成，同内容重跑返回 `UNCHANGED`，冲突内容失败并回滚。

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
pnpm dev

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

V0.2 请求是严格结构化输入，只接受一个 biomarker。疾病、基因和 HGVS 的大小写，以及 `p.` 前缀、`CRC`/`colorectal cancer`、`exon19del` 等有限别名可以规范化；`jurisdiction` 必须是 `US`，`locale` 必须是 `zh-CN`。不要先做自由文本病例输入，因为当前接口不会让模型猜测疾病或变异。

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

EVIDEX_KNOWLEDGE_RELEASE="v0.2.0"
EVIDEX_PROMPT_VERSION="evidex-answer-v1"
EVIDEX_AI_PROVIDER="evolink"
EVIDEX_AI_MODEL="gpt-5.6-terra"
EVIDEX_EVOLINK_API_KEY="..."
EVIDEX_EVOLINK_BASE_URL="https://direct.evolink.ai/v1"
```

真实值已经放在本地、被 Git 忽略的 `.env.local` 中；README 和前端代码只保留占位符。浏览器只调用 Evidex API，不能直接连接 Neon 或 Evolink。当前接口没有登录、限流、配额和公开 API SLA，应按演示版同源接口使用，不要在 Landing Page 上宣传为开放企业 API。

现有 Neon 数据库无需为 Landing Page 再执行迁移或重复导入。只有连接一套全新数据库时，才依次执行：

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
pnpm dev
```

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
