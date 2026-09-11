# Evidex V0.2.0 证据快速复核索引

状态：按产品负责人指示默认通过，待后续肿瘤学、肿瘤药学和分子病理专业复核  
发布版本：`v0.2.0`  
文献与监管截止：2026-09-11  
审核人：`product-owner-fast-track`
数据包 SHA-256：`95560ecf61fedae27d31e66c9fb60f9d62fd8e37d82af61c034abed878faee76`

> 本版用于尽快跑通可展示 MVP，不等同于专科医师正式审核，也不构成医疗建议。所有原始来源、短段落、适用性、等级理由和局限均保留稳定 ID；后续删除或修订应发布新版本，不直接改写历史发布。

## 1. 发布摘要

| 对象                |      数量 | 状态                              |
| ------------------- | --------: | --------------------------------- |
| 疾病 / 基因 / 变异  | 2 / 2 / 5 | `ACTIVE`                          |
| 药物                |         8 | `ACTIVE`                          |
| 治疗关联            |        13 | `APPROVED`                        |
| 原子 evidence claim |        20 | `APPROVED`                        |
| FDA 批准记录        |         9 | `APPROVED`                        |
| PubMed/PMC 文档     |        14 | `APPROVED`                        |
| FDA 标签文档        |         8 | `APPROVED`                        |
| 可展示直接查询      |         6 | 已进入 `/api/v1/evidence-options` |

首批可展示查询：

1. `NSCLC + EGFR p.L858R`
2. `NSCLC + EGFR p.E746_A750del`
3. `NSCLC + EGFR p.T790M`
4. `NSCLC + KRAS p.G12C`
5. `CRC + KRAS p.G12C`
6. `CRC + KRAS p.G12D`

## 2. 治疗关联与等级索引

| 索引 | 查询                      | 治疗关联 ID                                            | 方案                  | 方向 / 等级 | 主要证据                                    |
| ---- | ------------------------- | ------------------------------------------------------ | --------------------- | ----------- | ------------------------------------------- |
| A01  | NSCLC · EGFR L858R        | `assoc_nsclc_egfr_l858r_osimertinib`                   | 奥希替尼              | 敏感 / 1    | FLAURA                                      |
| A02  | NSCLC · EGFR L858R        | `assoc_nsclc_egfr_l858r_afatinib`                      | 阿法替尼              | 敏感 / 1    | LUX-Lung 3、L858R OS 亚组                   |
| A03  | NSCLC · EGFR L858R        | `assoc_nsclc_egfr_l858r_gefitinib`                     | 吉非替尼              | 敏感 / 1    | IFUM                                        |
| A04  | NSCLC · EGFR L858R        | `assoc_nsclc_egfr_l858r_amivantamab_lazertinib`        | 阿米万单抗 + 拉泽替尼 | 敏感 / 1    | MARIPOSA PFS、最终 OS                       |
| A05  | NSCLC · EGFR E746_A750del | `assoc_nsclc_egfr_e746_a750del_osimertinib`            | 奥希替尼              | 敏感 / 1    | FLAURA                                      |
| A06  | NSCLC · EGFR E746_A750del | `assoc_nsclc_egfr_e746_a750del_afatinib`               | 阿法替尼              | 敏感 / 1    | LUX-Lung 3、del19 OS 亚组                   |
| A07  | NSCLC · EGFR E746_A750del | `assoc_nsclc_egfr_e746_a750del_gefitinib`              | 吉非替尼              | 敏感 / 1    | IFUM                                        |
| A08  | NSCLC · EGFR E746_A750del | `assoc_nsclc_egfr_e746_a750del_amivantamab_lazertinib` | 阿米万单抗 + 拉泽替尼 | 敏感 / 1    | MARIPOSA PFS、最终 OS                       |
| A09  | NSCLC · EGFR T790M        | `assoc_nsclc_egfr_t790m_osimertinib`                   | 奥希替尼              | 敏感 / 3A   | AURA3 PFS、最终 OS                          |
| A10  | NSCLC · KRAS G12C         | `assoc_nsclc_kras_g12c_sotorasib`                      | 索托拉西布            | 敏感 / 1    | CodeBreaK 100、200                          |
| A11  | NSCLC · KRAS G12C         | `assoc_nsclc_kras_g12c_adagrasib`                      | 阿达格拉西布          | 敏感 / 1    | KRYSTAL-1、12                               |
| A12  | CRC · KRAS G12C           | `assoc_crc_kras_g12c_sotorasib_panitumumab`            | 索托拉西布 + 帕尼单抗 | 敏感 / 1    | CodeBreaK 300                               |
| A13  | CRC · KRAS G12D           | `assoc_crc_kras_g12d_panitumumab_resistance`           | 帕尼单抗单药          | 耐药 / R1   | 随机试验 KRAS 生物标志物分析 + FDA RAS 限制 |

判级提醒：Level 1 来自“同疾病 + 有效 FDA 适应证覆盖 + 精确变异或明确包含该精确变异的集合”。T790M 的成熟随机证据仍保留，但当前美国标签不再把 T790M 单列为有效适应证，因此为 3A。G12D 是 RAS-mutant 集合明确包含精确变异的 R1 排除证据，不是 G12D 独立效应量，也不是 G12D 靶向治疗推荐。

## 3. 新增文献证据摘要

### EGFR p.E746_A750del

- FLAURA（PMID `29151359`）：556 名既往未治 EGFR exon 19 deletion/L858R 晚期 NSCLC；奥希替尼对比第一代 EGFR TKI 的中位 PFS 18.9 vs 10.2 个月，HR 0.46。局限：合并变异人群，不是 p.E746_A750del 独立估计。
- LUX-Lung 3（PMID `23816960`）：常见变异组中位 PFS 13.6 vs 6.9 个月，HR 0.47。局限同上。
- LUX-Lung 3/6 OS（PMID `25589191`）：预设 del19 亚组中，OS 分别为 33.3 vs 21.1 个月（HR 0.54）和 31.4 vs 18.4 个月（HR 0.64）。局限：del19 集合包含多种等位基因。
- IFUM（PMID `24263064`）：单臂 IV 期敏感 EGFR 队列，ORR 69.8%，中位 PFS 9.7 个月；未给出 p.E746_A750del 独立结果。
- MARIPOSA（PMID `38924756`、`40923797`）：联合方案对比奥希替尼，中位 PFS 23.7 vs 16.6 个月；最终死亡 HR 0.75。局限：外显子 19 缺失/L858R 合并人群，且联合方案高级别不良事件更多。

### EGFR p.T790M

- AURA3（PMID `27959700`）：419 名一线 EGFR TKI 后进展的 T790M 阳性晚期 NSCLC；奥希替尼对比铂类-培美曲塞，中位 PFS 10.1 vs 4.4 个月，HR 0.30；ORR 71% vs 31%。
- AURA3 最终 OS（PMID `32861806`）：中位 OS 26.8 vs 22.5 个月，HR 0.87，`p=0.277`，未达到统计学显著；对照组 73% 交叉接受奥希替尼，可能稀释 OS 差异。

### KRAS p.G12C · NSCLC

- CodeBreaK 100（PMID `34096690`）：126 名既往治疗患者，索托拉西布单臂 ORR 37.1%，中位 DOR 11.1 个月、PFS 6.8 个月、OS 12.5 个月。局限：无随机对照。
- CodeBreaK 200（PMID `36764316`）：345 名患者，索托拉西布对比多西他赛，中位 PFS 5.6 vs 4.5 个月，HR 0.66；本 claim 不主张 OS 优势。
- KRYSTAL-1（PMID `35658005`）：116 名既往治疗患者，阿达格拉西布 ORR 42.9%，中位 PFS 6.5 个月、OS 12.6 个月；≥3 级治疗相关不良事件 44.8%。
- KRYSTAL-12（PMID `40783289`）：453 名患者，阿达格拉西布对比多西他赛，中位 PFS 5.5 vs 3.8 个月，HR 0.58；两组 ≥3 级治疗相关不良事件分别为 47% 和 46%。

### KRAS p.G12C / p.G12D · CRC

- CodeBreaK 300（PMID `37870968`）：160 名化疗难治 KRAS G12C mCRC；索托拉西布 960 mg 组联合帕尼单抗对比标准治疗，中位 PFS 5.6 vs 2.2 个月，HR 0.49；ORR 26.4% vs 0%。论文发表时 OS 尚未成熟。
- 帕尼单抗 KRAS 生物标志物分析（PMID `18316791`）：427/463 名患者有 KRAS 状态；突变组 PFS HR 0.99，帕尼单抗缓解率为 0%。该证据与 FDA RAS-mutant 限制共同支持 G12D 的 R1 关联；结论仅适用于帕尼单抗单药/非 G12C 特定联合情境。

## 4. PubMed/PMC 来源索引

| PMID       | 研究               | DOI / 全文                                                                                |
| ---------- | ------------------ | ----------------------------------------------------------------------------------------- |
| `27959700` | AURA3 PFS          | [PMC6762027](https://pmc.ncbi.nlm.nih.gov/articles/PMC6762027/) · `10.1056/NEJMoa1612674` |
| `32861806` | AURA3 最终 OS      | [PubMed](https://pubmed.ncbi.nlm.nih.gov/32861806/) · `10.1016/j.annonc.2020.08.2100`     |
| `34096690` | CodeBreaK 100      | [PMC9116274](https://pmc.ncbi.nlm.nih.gov/articles/PMC9116274/) · `10.1056/NEJMoa2103695` |
| `36764316` | CodeBreaK 200      | [PubMed](https://pubmed.ncbi.nlm.nih.gov/36764316/) · `10.1016/S0140-6736(23)00221-0`     |
| `35658005` | KRYSTAL-1          | [PubMed](https://pubmed.ncbi.nlm.nih.gov/35658005/) · `10.1056/NEJMoa2204619`             |
| `40783289` | KRYSTAL-12         | [PubMed](https://pubmed.ncbi.nlm.nih.gov/40783289/) · `10.1016/S0140-6736(25)00866-9`     |
| `37870968` | CodeBreaK 300      | [PubMed](https://pubmed.ncbi.nlm.nih.gov/37870968/) · `10.1056/NEJMoa2308795`             |
| `18316791` | 帕尼单抗 KRAS 分析 | [PubMed](https://pubmed.ncbi.nlm.nih.gov/18316791/) · `10.1200/JCO.2007.14.7116`          |

V0.1 已收录并继续沿用的 PMID：`29151359`、`23816960`、`25589191`、`24263064`、`38924756`、`40923797`。每个 copyrighted abstract 只保留短摘录；没有把付费全文伪装成已审阅全文。

## 5. FDA 监管索引

| 索引    | 批准记录 ID                                             | 当前用途                              | 官方标签                                                                                                                                                                           |
| ------- | ------------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R01     | `approval_fda_nda208065_orig1_osimertinib`              | EGFR L858R / exon 19 deletion NSCLC   | [TAGRISSO](https://www.accessdata.fda.gov/drugsatfda_docs/label/2024/208065s033lbl.pdf)                                                                                            |
| R02     | `approval_fda_nda201292_orig1_afatinib`                 | 非耐药 EGFR 变异 NSCLC                | [GILOTRIF](https://www.accessdata.fda.gov/drugsatfda_docs/label/2022/201292s017lbl.pdf)                                                                                            |
| R03     | `approval_fda_nda206995_orig1_gefitinib`                | EGFR L858R / exon 19 deletion NSCLC   | [IRESSA](https://www.accessdata.fda.gov/drugsatfda_docs/label/2021/206995s004lbl.pdf)                                                                                              |
| R04-R05 | 两条 amivantamab / lazertinib 记录                      | EGFR L858R / exon 19 deletion NSCLC   | [RYBREVANT](https://www.accessdata.fda.gov/drugsatfda_docs/label/2025/761210s011lbl.pdf) · [LAZCLUZE](https://www.accessdata.fda.gov/drugsatfda_docs/label/2026/219008s004lbl.pdf) |
| R06     | `approval_fda_nda214665_orig1_sotorasib_nsclc`          | KRAS G12C NSCLC                       | [LUMAKRAS](https://www.accessdata.fda.gov/drugsatfda_docs/label/2025/214665Orig1s009correctedlbl.pdf)                                                                              |
| R07     | `approval_fda_nda216340_orig1_adagrasib_nsclc`          | KRAS G12C NSCLC                       | [KRAZATI](https://www.accessdata.fda.gov/drugsatfda_docs/label/2026/216340s009lbl.pdf)                                                                                             |
| R08     | `approval_fda_nda214665_s009_sotorasib_panitumumab_crc` | KRAS G12C mCRC 联合方案               | [LUMAKRAS](https://www.accessdata.fda.gov/drugsatfda_docs/label/2025/214665Orig1s009correctedlbl.pdf)                                                                              |
| R09     | `approval_fda_bla125147_s213_panitumumab_crc`           | G12C 联合适应证与其他 RAS-mutant 限制 | [VECTIBIX](https://www.accessdata.fda.gov/drugsatfda_docs/label/2025/125147s213lbl.pdf)                                                                                            |

### 明确排除：已撤回的 CRC 适应证

Adagrasib + cetuximab 的 KRAS G12C mCRC 加速批准已于 **2026-09-01** 撤回。因此，本发布未把它作为当前有效 CRC FDA 证据，也没有生成对应 Level 1 CRC 关联。历史批准页可以保留用于审计，但不能覆盖 FDA 当前状态：[FDA 撤回的肿瘤加速批准列表](https://www.fda.gov/drugs/resources-information-approved-drugs/withdrawn-cancer-accelerated-approvals)。当前仍使用的 CRC G12C 组合为 [FDA 批准的 sotorasib + panitumumab](https://www.fda.gov/drugs/resources-information-approved-drugs/fda-approves-sotorasib-panitumumab-kras-g12c-mutated-colorectal-cancer)。

## 6. 快速复核清单

- [x] 新增疾病、基因、变异和药物均有稳定 ID 与规范键。
- [x] 每条 association 至少有一条 PubMed/PMC PRIMARY claim。
- [x] Level 1 的每个方案成分都有本发布内的疾病/变异匹配 FDA 记录。
- [x] `EXPLICIT_GROUP_INCLUDES_EXACT` 没有被写成精确变异独立效应。
- [x] T790M 保留 PFS 获益与 OS 未显著两个方向的结果。
- [x] G12D 只呈现帕尼单抗 R1 排除/耐药含义，不虚构已批准 G12D 抑制剂。
- [x] 已撤回的 adagrasib + cetuximab CRC 适应证不进入当前有效知识。
- [x] 所有新增记录按用户授权默认 `APPROVED`。

如需删除或更正，优先用 A/R/claim ID 定位，并发布 `v0.2.1` 或更高版本；不要直接修改已写入数据库的 `v0.2.0` 历史记录。
