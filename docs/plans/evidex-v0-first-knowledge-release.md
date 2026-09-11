# Evidex V0 首批医学知识获取与发布计划

状态：提案  
制定日期：2026-09-09  
目标版本：`v0.1.0`

## 1. 目标与边界

首批知识只服务于当前 V0 查询闭环：

- 疾病：非小细胞肺癌（NSCLC）；
- 基因：`EGFR`；
- 变异：`p.L858R`；
- 监管地区：美国 FDA；
- 证据来源：PubMed/PMC 与 FDA 官方记录；
- 输出：经人工审核、可追溯、可重复导入、不可变的 `knowledge_release v0.1.0`。

首批不纳入指南、ClinicalTrials.gov、其他监管地区、开放式病例匹配或自动持续更新。OncoKB 只作为等级设计背景，不读取、复制或导入其治疗知识。

## 2. 先监管、后文献的获取漏斗

2026-09-09 的探索性检索显示：

- PubMed 中“NSCLC + EGFR + L858R/Leu858Arg”的宽检索约有 2,203 条；
- 去除标题/摘要中出现 lung/NSCLC 的跨癌种宽检索仍约有 237 条；
- openFDA 在 `indications_and_usage` 中检索 `L858R` 得到 33 条标签记录，按通用名和方案初步去重后约 10 个候选成分/方案。

因此首批采用以下顺序，避免在数千篇文献中盲目筛选：

1. 用 openFDA 机器可读标签发现候选成分、方案和申请号；
2. 回到 Drugs@FDA 的批准记录、最新版 FDA-approved Prescribing Information 和审批文件确认监管事实；
3. 按已确认的药物/方案逐个检索 PubMed，寻找关键临床研究和 L858R 适用范围；
4. 只有在来源、原文权限、医学结论和等级全部通过审核后才进入发布版本。

openFDA 只用于候选发现，不能单独决定“当前获批”或 Evidex 等级。

## 3. 来源分工

| 数据       | 首选官方来源                                          | 用途                                                      | 入库原则                                           |
| ---------- | ----------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------- |
| 疾病规范名 | NCI Thesaurus / EVS                                   | NSCLC 名称、别名、NCIt 编码、实体瘤谱系                   | 写入 `disease`，不作为疗效证据                     |
| 基因规范名 | HGNC REST/API                                         | `EGFR` 官方符号、HGNC ID、别名                            | 写入 `gene`，记录 HGNC ID                          |
| 变异身份   | NCBI ClinVar + MANE/RefSeq                            | 核对 `NM_005228.5:c.2573T>G`、`p.Leu858Arg`、转录本与别名 | 写入 `variant`；ClinVar 仅作身份核验，不作疗效证据 |
| 药物候选   | openFDA Drug Label API                                | 发现包含 L858R 的标签和申请号                             | 只作为候选清单                                     |
| 监管事实   | Drugs@FDA、FDA-approved label、approval letter/review | 批准状态、日期、申请/补充申请、适应证、生物标志物         | 必须有 FDA 来源文档与 `INDICATION` passage         |
| 临床证据   | PubMed E-utilities                                    | 文献检索、PMID/DOI/PMCID、摘要元数据                      | PubMed 负责治疗证据，不能替代 FDA 核验             |
| 可复用全文 | PMC Open Access Subset                                | 合法获取可定位的研究原文                                  | 逐篇读取许可证；只通过 PMC 官方批量接口获取        |

## 4. 具体执行流程

### A. 冻结本批次清单

建立一个带时间戳的采集清单，记录：

- 检索式、检索时间、返回数量和来源 URL；
- `literature_cutoff_at` 与 `regulatory_cutoff_at`；
- 每份原始响应或文档的 SHA-256；
- 来源许可、展示策略、模型使用策略和审核状态；
- 纳入、排除及排除原因。

截止时间应在完成全量候选检索后冻结；发布前再执行一次 FDA 状态差异检查。

### B. 规范化三个核心实体

1. 从 NCIt 确定 NSCLC 的规范概念、别名和 `SOLID` 谱系；
2. 从 HGNC 确认 `EGFR` 官方符号和 HGNC ID；
3. 从 ClinVar/MANE 核对 L858R 的规范表示、转录本和核酸/蛋白变化；
4. 建立稳定键 `EGFR|SNV|p.L858R`，人工确认后锁定。

### C. 获取并核验 FDA 候选

1. 在 openFDA 标签的 `indications_and_usage`、`clinical_studies` 和药品名称字段中检索 `L858R`、`exon 21` 与 EGFR；
2. 按活性成分、联合方案、NDA/BLA/ANDA、产品和标签生效时间去重；
3. 优先保留参考 NDA/BLA 及其补充申请，避免把多个仿制药 ANDA 误算成多个治疗关联；
4. 对每个候选回查 Drugs@FDA：当前状态、批准日期、最新 FDA-approved label、申请号/补充申请号以及方案组成；
5. 分别截取适应证、生物标志物和状态原文，并保存页码、章节或文档定位；
6. 联合方案逐一核验每个组成药物，同时确认 FDA 正式记录是否覆盖该组合。

### D. 为每个 FDA 候选定向检索 PubMed

基础检索模板：

```text
("non-small cell lung cancer"[Title/Abstract] OR NSCLC[Title/Abstract])
AND EGFR[Title/Abstract]
AND (L858R[Title/Abstract] OR Leu858Arg[Title/Abstract])
AND (<generic-name-or-regimen>[Title/Abstract])
```

每个方案分两轮：

1. 找注册性/关键研究：方案名、试验名、NCT 号、关键终点；
2. 找 L858R 专门或预设亚组结果，区分 `EXACT` 与 `EXPLICIT_GROUP_INCLUDES_EXACT`。

文献优先级：

1. 生物标志物定义人群的前瞻性随机研究；
2. 成熟的前瞻性单臂研究或独立重复的人体研究；
3. 回顾性队列、事后亚组、病例系列；
4. 临床前研究，仅在需要表达 Level 4 时纳入；
5. 综述仅用于追溯原始研究，不直接决定等级。

同一试验的主文、更新分析和亚组论文必须共享 `cohort_fingerprint`，不能被误算成独立重复证据。

### E. 有条件地做跨适应证检索

跨适应证不是首批配额。只有同时满足以下条件才发布：

- 其他实体瘤；
- 精确 `EGFR p.L858R`，不能只是 EGFR 或相似变异；
- 来源疾病中的关联可达到 1、2 或 3A；
- 有可合法使用且允许送入模型的 PRIMARY passage；
- 人工确认不是肺癌转移、混合队列或错误疾病归类。

若没有合格记录，`v0.1.0` 的跨适应证组为空是正确结果，不为演示效果强行补数据。

### F. 提取原子证据

一条 claim 只表达一个可核验结论，并保存：

- 真实疾病、变异适用性、治疗方案和证据方向；
- 研究设计、人群、样本量、分期、线次、既往治疗；
- 干预、对照、终点、效应值、结论与局限；
- PMID/DOI/PMCID、章节/段落/表格/页码定位；
- PRIMARY、CONTEXT、LIMITATION passage；
- `proposed_level`、规则版本和逐项判级理由。

模型可以辅助生成候选字段，但不能决定 FDA 状态、`approved_level`、适用性或是否发布。

### G. 版权与模型使用策略

- openFDA 内容通常按 CC0 提供，但仍检查数据集是否标注第三方权利例外；
- PubMed 摘要可能受作者或出版商版权保护，不能因“可在线阅读”就默认可再分发或送入第三方模型；
- PMC 文章逐篇检查许可证。优先选择 PMC Open Access Subset 中许可明确的全文；
- 非开放全文默认 `LINK_ONLY + PROHIBITED`；只有权利范围明确时才改为 `EXCERPT/FULL_TEXT + ALLOWED`；
- 不在仓库保存付费 PDF、整篇受限论文或凭证；
- 每个 passage 的公开展示权和模型处理权分别审核。

### H. 医学审核与发布

建议至少由一名具备肿瘤学、肿瘤药学或分子病理背景的合格审核人逐条确认：

- 药物/方案是否纳入；
- 结论是否忠实于人群、终点和效应值；
- L858R 是独立结果还是组合人群的一部分；
- FDA 适应证和生物标志物覆盖范围；
- `approved_level` 与限制说明。

没有合格医学审核人时，可以完成候选搜集和 DRAFT 数据包，但不发布 `PUBLISHED` release。

审核后执行：

1. 生成 `data/evidex/v0/*.json`；
2. 运行 Zod/JSON Schema 校验和导入 dry-run；
3. 检查稳定 ID、外键、重复队列、PRIMARY passage、模型权限和 FDA INDICATION passage；
4. 在单一事务中导入 DRAFT；
5. 发布不可变 `v0.1.0`；
6. 用真实数据执行 API golden case 和模型引用一致性测试。

## 5. 首批规模建议

规模是上限目标，不是硬配额；质量门槛优先。

| 对象                 |               建议范围 |
| -------------------- | ---------------------: |
| 核心实体             | 1 疾病、1 基因、1 变异 |
| 候选药物/方案        |    6–10 个进入人工核验 |
| 发布的同疾病关联     |                 4–8 个 |
| 发布的跨适应证关联   |       0–2 个，允许为 0 |
| FDA 监管记录         |                6–12 条 |
| PubMed/PMC 文档      |               12–30 篇 |
| 原子 evidence claims |                8–20 条 |
| 可定位 passages      |               20–60 条 |
| Knowledge release    |         1 个不可变版本 |

每个方案优先只纳入一篇关键研究、一篇必要的成熟更新或 L858R 亚组论文，以及对应 FDA 记录。这样既能验证真实闭环，也把首轮医学审核控制在可管理范围内。

## 6. 发布门槛

`v0.1.0` 发布前必须全部通过：

- 每个结果药物均存在截至监管截止时间仍有效的 FDA 批准记录；
- 每条监管记录都有 FDA 来源和至少一个 `INDICATION` passage；
- 每条 claim 至少有一个 PRIMARY passage；
- 所有进入回答的 PRIMARY passage 均为 `model_use_policy = ALLOWED`；
- 所有 association、claim、passage、approval 均为 `APPROVED`；
- `EXPLICIT_GROUP_INCLUDES_EXACT` 不被描述成 L858R 独立结果；
- FDA 匹配、证据成熟度和 Evidex 等级没有逻辑矛盾；
- 同一队列未被重复计权；
- 来源 URL、检索时间、许可、哈希和原文定位完整；
- 发布 dry-run 无冲突，事务发布与失败回滚测试通过。

## 7. 当前尚未准备好的事项

1. 一次性数据包的 Zod/JSON Schema、导入、dry-run、幂等和事务发布服务尚未实现；
2. 尚未指定合格医学审核人及统一的 `reviewed_by` 标识；
3. 尚未确认产品是否按商业用途处理；在确认前按商业产品的最保守版权策略执行；
4. 尚未冻结首批文献与监管截止时间；
5. 尚未建立来源清单、纳排表和逐段版权/模型权限记录。

这些事项不妨碍开始候选搜集，但第 1、2 项会阻止知识正式发布。

## 8. 推荐排期

| 阶段                           | 产出                         | 预计时间 |
| ------------------------------ | ---------------------------- | -------: |
| 1. 来源清单与实体锁定          | manifest、实体记录、检索式   |   0.5 天 |
| 2. FDA 候选与状态核验          | 去重候选表、FDA passage      |     1 天 |
| 3. PubMed/PMC 筛选与提取       | 文献纳排表、claims、passages |   2–3 天 |
| 4. 医学审核与修订              | 审核记录、approved levels    |   1–2 天 |
| 5. dry-run、发布与 golden case | `v0.1.0`、测试报告           |     1 天 |

整体约 5.5–7.5 个工作日，主要变量是全文许可和医学审核反馈速度。

## 9. 官方参考

- FDA Drugs@FDA data files: https://www.fda.gov/drugs/drug-approvals-and-databases/drugsfda-data-files
- FDA labeling resources: https://www.fda.gov/drugs/laws-acts-and-rules/fdas-labeling-resources-human-prescription-drugs
- openFDA drug label API: https://open.fda.gov/apis/drug/label/
- openFDA license and terms: https://open.fda.gov/license/ and https://open.fda.gov/terms/
- NCBI E-utilities usage: https://www.ncbi.nlm.nih.gov/books/NBK25497/
- NCBI data policies: https://www.ncbi.nlm.nih.gov/home/about/policies/
- PMC copyright and automated retrieval: https://pmc.ncbi.nlm.nih.gov/about/copyright/ and https://pmc.ncbi.nlm.nih.gov/tools/developers/
- HGNC REST and CC0 data: https://www.genenames.org/help/rest/ and https://www.genenames.org/about/license/
- NCI EVS/NCIt: https://www.cancer.gov/about-nci/organization/cbiit/vocabulary
- NCBI ClinVar L858R: https://www.ncbi.nlm.nih.gov/clinvar/variation/16609/
