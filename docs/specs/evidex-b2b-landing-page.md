# Evidex B 端 Landing Page 需求文档

## 1. 文档信息

| 项目       | 内容                                     |
| ---------- | ---------------------------------------- |
| 文档版本   | V1.1                                     |
| 文档状态   | 待产品确认，可进入视觉与前端方案设计     |
| 更新日期   | 2026-09-11                               |
| 产品工作名 | Evidex，最终中英文名称仍待确认           |
| 页面类型   | 面向基因检测企业的 B 端产品 Landing Page |
| 主要语言   | 简体中文与英文，首发版本同时交付         |

本文档定义 Landing Page 的产品定位、完整文案、页面结构、能力状态、交互要求、视觉方向、响应式规则和前端验收标准。它不修改当前后端接口、数据库结构或医学证据规则。

## 2. 项目背景

Evidex 的长期目标是为肿瘤基因检测与临床解读团队提供治疗机会匹配和循证决策支持能力。

传统匹配通常只使用癌种、基因和变异等少量结构化字段。Evidex 的产品设想是利用 AI 从合规输入中提取和组织更多患者线索，包括疾病、临床分期、治疗线次、组织学或分子亚型、既往治疗和基因变异等信息，再结合持续扩展的循证知识库，对相关药物与临床试验进行更精细的匹配。

循证知识库的长期来源范围包括：

- 同行评议论文与 PubMed 索引资料；
- FDA、NMPA 等监管机构的批准、标签与审评资料；
- 获得合法使用权限的专业指南或结构化指南结论；
- 公开医学数据库；
- 临床试验注册信息；
- 重要医学会议摘要及后续更新；
- 经审核的其他公开来源。

当前可运行版本 V0.2 只验证了其中一条核心链路：根据结构化癌种和基因变异，从已审核、已发布的 PubMed 与 FDA 证据中检索治疗相关内容，并生成带引用的循证综述。Landing Page 应宣传完整产品方向，同时明确当前版本与规划能力的差异。

## 3. 设计判断

这是一个面向基因检测企业管理者、医学负责人、临床解读人员和产品技术负责人的信任型医疗科技 Landing Page。页面应采用克制、专业、证据优先的表达，并使用蓝色冷调毛玻璃质感建立现代科技感。不使用面向患者的情绪化医疗营销，也不采用常见的 AI 紫色渐变、霓虹光效或夸张疗效承诺。

建议设计参数：

- `DESIGN_VARIANCE: 4`：结构清晰，允许适度非对称，不追求实验性布局；
- `MOTION_INTENSITY: 6`：使用流畅的首屏编排、滚动进入、数据流和状态过渡，同时保证动效有明确叙事目的；
- `VISUAL_DENSITY: 5`：能够承载专业信息，但保持营销页面的阅读节奏；
- 页面主题：全页浅色主题，使用冷蓝灰背景、深海军蓝文本和统一的蓝色强调色系；
- 材质方向：导航、首屏产品容器和重点证据面板使用有边界、有层次的毛玻璃效果，普通正文区保持清晰的实色或轻透明背景；
- 字体方向：现代无衬线字体，数字、HGVS 和 API 字段可局部使用等宽字体。

## 4. 目标用户

### 4.1 核心使用者

基因检测公司的临床解读人员、医学编辑和医学审核人员。

他们希望：

- 减少论文、指南、监管网站和数据库之间的重复检索；
- 将更多患者信息纳入匹配，而不只依据基因与变异；
- 快速获得按药物或临床试验组织的证据结果；
- 查看研究人群、证据等级、适用限制和原始来源；
- 将结果用于报告撰写、医学复核和内部讨论。

### 4.2 购买与决策者

- 公司创始人或业务负责人；
- 医学负责人或实验室负责人；
- 产品负责人；
- 技术负责人或报告系统负责人。

他们关注：

- 是否能够提升报告解读的差异化与专业度；
- 是否能够降低知识库建设和维护成本；
- 是否能够减少资深人员成为流程瓶颈；
- 是否能够通过 API 接入现有报告流程；
- 输出是否稳定、可审计、可追溯；
- 数据来源、授权、隐私和合规边界是否清晰。

### 4.3 当前非目标用户

- 直接寻求诊断、处方或治疗决策的患者；
- 希望系统替代肿瘤科医生或专业解读人员的用户；
- 未经医学复核即把生成结果直接写入正式报告的使用方式。

## 5. 产品定位与核心价值

### 5.1 产品定位

> Evidex 是面向肿瘤基因检测与临床解读团队的 AI 治疗机会匹配与循证知识平台。

### 5.2 核心价值一：更精细地理解患者

传统匹配常停留在“癌种 + 基因 + 变异”。Evidex 的长期方向是利用 AI 从结构化字段或经过授权的患者资料中提取更多临床线索，将分期、治疗线次、亚型、既往治疗和生物标志物等信息纳入匹配上下文。

价值结果：

- 减少只按单个变异返回宽泛结果；
- 更好地区分研究人群与当前病例条件；
- 为临床解读人员提供更细粒度的候选结果和适用限制；
- 将人工判断集中在真正需要专业复核的部分。

### 5.3 核心价值二：更全面地组织循证证据

Evidex 不把单篇论文或单一数据库当作完整答案。长期知识体系应整合论文、指南、监管资料、公开数据库、临床试验注册和会议摘要，并保存来源、版本、适用范围、证据等级与限制。

价值结果：

- 在同一结果中比较不同证据类型；
- 减少在多个网站之间反复搜索和搬运；
- 每项匹配都有明确的证据链路；
- 支持报告复核、内部质控和历史结果追溯。

### 5.4 支撑价值：能够进入企业工作流

产品应同时提供在线工作台和 API 两种使用方式。在线工作台适合单例查询、医学复核和产品验证；API 适合后续接入报告生成与内部业务系统。

## 6. Landing Page 目标

### 6.1 用户目标

访客在进入页面后应能快速理解：

1. Evidex 不只根据基因和变异做简单匹配；
2. 系统会综合更多患者信息，匹配药物与临床试验；
3. 每项结果都有来自多种公开医学来源的循证依据；
4. 产品可以在线使用，也具备 API 接入方向；
5. 当前演示版本只开放部分能力，不能把规划功能误认为已经上线。

### 6.2 商业目标

- 让潜在客户体验当前证据查询链路；
- 收集产品演示、团队试用和 API 试点线索；
- 用真实结果展示产品的证据质量和可追溯能力；
- 建立“AI 精细匹配 + 全面循证知识库”的差异化认知。

### 6.3 转化动作

| 位置       | 主要动作      | 次要动作     | 转化强度 |
| ---------- | ------------- | ------------ | -------- |
| 顶部导航   | 申请产品演示  | 无           | 中       |
| 首屏       | 体验当前版本  | 查看结果示例 | 低       |
| 接入方式区 | 查看 API 示例 | 了解试点接入 | 中       |
| 页面底部   | 申请产品演示  | 体验当前版本 | 高       |

CTA 的目标地址由产品确认。若演示申请表单尚未实现，前端不得使用无响应按钮，可以先链接到明确的联系渠道或标注为待接入。

## 7. 能力状态与对外表达

页面必须区分“已开放”“试点或演示”“规划中”。不得把产品愿景全部写成当前已经交付的生产能力。

| 能力                               | 当前状态 | 页面表达                                 |
| ---------------------------------- | -------- | ---------------------------------------- |
| 癌种、基因与变异结构化查询         | 已开放   | 可直接体验                               |
| 已审核 PubMed 与 FDA 证据检索      | 已开放   | 可直接体验                               |
| 带引用的循证综述                   | 已开放   | 可直接体验                               |
| 证据 ID、PMID、FDA 来源和知识版本  | 已开放   | 可直接展示                               |
| 分期、线次、亚型、既往治疗参与匹配 | 规划中   | 标注“产品方向”或“规划中”                 |
| 从患者资料中提取多维临床线索       | 规划中   | 标注“产品方向”，不得暗示已支持病历上传   |
| 临床试验匹配                       | 规划中   | 标注“规划中”                             |
| 指南、公开数据库和会议摘要         | 规划中   | 作为知识体系方向展示                     |
| 企业生产 API                       | 尚未开放 | 只展示接口示例或招募试点，不承诺即刻接入 |
| 企业鉴权、配额、SDK 和 SLA         | 尚未开放 | 不在页面中作现有能力承诺                 |

状态标签必须出现在对应功能附近，不能只藏在页脚或常见问题中。

## 8. 页面信息架构

建议区块顺序：

1. 顶部导航；
2. 首屏价值主张；
3. 现有流程为什么不够；
4. 两项核心差异化价值；
5. 药物与临床试验两类结果；
6. 产品工作方式；
7. 在线工作台与 API 接入；
8. 结果与证据链展示；
9. 信任背书与当前覆盖；
10. 当前能力与产品方向；
11. 常见问题；
12. 底部 CTA；
13. 页脚。

页面不使用连续三段相同的图文左右交替结构，也不使用三张完全相同的功能卡作为主要信息表达。每个区块应承担一个明确的说服任务。

## 9. 页面区块详细需求与完整文案

### 9.1 顶部导航

#### 导航结构

- 左侧：Evidex 标志与产品名；
- 中部：产品价值、工作方式、证据体系、接入方式、常见问题；
- 右侧主按钮：申请产品演示；
- 可选：语言切换；
- 暂不展示无明确用途的登录、定价或开发者入口。

#### 交互要求

- 桌面端导航保持单行，高度不超过 80px；
- 点击导航项滚动到对应区块；
- 移动端收起为可键盘操作的菜单；
- 主按钮在桌面端和移动菜单中保持相同名称；
- 当前没有可用目标地址时，不允许使用空链接。

### 9.2 首屏

#### 页面目的

在一个视口内说明产品解决什么问题、为什么不同、可以如何开始体验。

#### 主标题

> 看见更多患者细节，用全面证据匹配药物与临床试验

#### 副标题

> Evidex 利用 AI 拆解疾病、分期、亚型、治疗线次、既往治疗和基因变异等临床线索，并将论文、指南、监管批准、公共数据库与会议摘要整合为统一的循证知识库，让每项匹配都有据可查。

#### 使用方式说明

> 支持在线查询，也可通过 API 接入现有报告解读流程。

#### CTA

- 主 CTA：体验当前版本；
- 次 CTA：查看结果示例；
- 门槛说明：无需上传完整病历或患者身份信息，可先用已开放的癌种和变异验证核心证据链路。

#### 能力状态提示

> 当前版本已开放治疗证据查询。多维患者信息匹配、临床试验及更多证据来源正在规划中。

#### 视觉要求

- 使用非对称左右分栏，左侧为文案，右侧为真实产品界面或由真实接口数据驱动的演示；
- 不使用医生手持平板、实验室人物或患者肖像等通用医疗图库；
- 不使用纯装饰性的 DNA、粒子、神经网络光效作为主视觉；
- 不制作无法操作、数据无法追溯的假仪表盘；
- 主标题桌面端不超过两行，CTA 在首屏内可见；
- 若展示未来界面，必须明确标注“产品方向示意”，且不得使用虚构医学结论。

### 9.3 痛点区：现有流程为什么不够

#### 标题

> 只看一个变异，无法还原患者全貌；只查一种来源，也无法支撑完整解读

#### 引导文案

> 当病例信息与医学证据不断增加，简单规则和人工检索很难同时兼顾匹配精度、证据覆盖和交付效率。

#### 场景一：患者信息被压缩成少量字段

> 同一个基因变异，在不同癌种、分期、亚型、治疗线次和既往治疗背景下，可能对应不同的证据与适用限制。只按基因和变异匹配，结果往往过于宽泛，仍需要解读人员重新筛选。

不解决的代价：

- 匹配结果缺少病例上下文；
- 人工二次筛选时间增加；
- 不同解读人员可能形成不同的筛选口径；
- 资深人员持续成为复核瓶颈。

#### 场景二：证据散落在不同来源

> 论文、监管标签、指南、公共数据库、临床试验注册和会议摘要分别存在于不同平台，数据结构、更新节奏和证据强度并不一致。

不解决的代价：

- 解读人员在多个网站之间重复搜索；
- 报告中的来源格式和证据口径难以统一；
- 后续质控与客户问询需要重新还原证据链；
- 企业需要持续投入人力维护分散的知识资产。

#### 场景三：报告截止时间放大流程问题

> 当样本量增加或报告临近交付，检索、整理、引用和复核会同时争夺有限的医学人力。

不解决的代价：

- 报告周转时间受到影响；
- 重复劳动随样本量增长；
- 新人培养与质量一致性更难保障；
- 团队难以稳定扩展解读产能。

#### 布局建议

使用左侧固定标题与右侧纵向场景叙事，或使用两个主问题加一个流程成本收口。不要使用三张等宽同样式卡片。

### 9.4 核心价值区

#### 标题

> 更细地理解患者，更全面地组织证据

#### 价值模块一：AI 拆解更多患者线索

> 从疾病、分期、亚型和治疗线次，到既往治疗与基因变异，Evidex 计划利用 AI 将合规输入中的临床信息转化为可用于匹配的结构化线索。

带来的改变：

- 从单一变异匹配升级为多维病例上下文；
- 明确哪些患者特征影响证据适用性；
- 将研究人群条件与病例线索放在同一结果中比较。

具体收益：

> 解读人员获得的是更细粒度的候选结果和限制说明，而不是一份缺少上下文的药物清单。

能力标签：产品方向。

#### 价值模块二：多来源循证知识库

> Evidex 将不同类型的医学资料拆解为可检索、可比较、可引用的结构化证据，并保留来源、证据等级、适用人群、主要结论和局限。

带来的改变：

- 论文、指南、监管资料、数据库、试验注册和会议摘要能够在统一结构中呈现；
- 支持区分获批适应证、成熟临床证据、有限证据和耐药信息；
- 每项结论与原始来源、知识版本和复核状态关联。

具体收益：

> 团队可以在一个结果中理解证据全貌，并将来源用于报告复核、内部质控和历史追溯。

能力标签：当前已开放 PubMed 与 FDA 证据，其他来源规划中。

#### 布局建议

使用两个比例不等的大型叙事区域。患者信息模块配真实的字段结构或授权材料示例，知识库模块配真实证据卡与来源链截图。两个模块不能只是相同白色卡片换标题。

### 9.5 结果类型区

#### 标题

> 从治疗药物，到仍在研究中的临床机会

#### 药物匹配

> 结合患者特征与证据适用条件，整理相关药物、治疗方案、敏感或耐药方向、监管状态、研究人群和主要证据。

结果应回答：

- 为什么这个药物或方案被匹配；
- 哪些患者特征支持或限制该结果；
- 证据来自什么研究和监管记录；
- 结论针对精确变异还是合并人群；
- 哪些信息仍需专业人员复核。

能力标签：当前版本已开放有限范围的治疗证据匹配。

#### 临床试验匹配

> 根据疾病、分期、亚型、治疗线次、既往治疗、生物标志物和其他关键条件，匹配可能相关的临床试验，并解释关键匹配依据与来源。

结果计划回答：

- 试验研究什么治疗方向；
- 哪些患者线索与主要入组条件相关；
- 哪些条件可能限制匹配；
- 试验信息来自哪个注册来源和版本；
- 哪些内容需要由试验中心进一步确认。

能力标签：规划中。

#### 合规要求

页面不得将候选匹配描述为确定适用、保证入组或最佳治疗方案。临床试验匹配必须提示最终资格由研究团队确认。

### 9.6 工作方式区

#### 标题

> 从患者线索，到有依据的匹配结果

#### 流程节点

**组织患者信息**

> 接收结构化字段，长期方向包括在获得授权和完成安全设计后处理合规患者资料。

**提取关键线索**

> 利用 AI 识别疾病、分期、亚型、治疗线次、既往治疗和生物标志物等信息，并保留原始依据。

**匹配循证知识**

> 从已审核、已发布的知识版本中检索相关药物、临床试验和支持证据，不让模型自行创造来源。

**生成可复核结果**

> 按候选结果组织推荐依据、研究人群、证据强度、限制与来源，供专业人员审核和使用。

#### 交互建议

使用真实的数据流动或逐步结果展开动效。动效只用于说明信息如何从输入进入证据结果，不使用无意义的循环粒子动画。启用减少动态效果时，流程应完整静态展示。

### 9.7 使用方式区

#### 标题

> 单次查询和系统接入，使用同一套证据能力

#### 在线工作台

> 临床解读人员可以直接输入或选择病例条件，查看匹配结果、研究限制和原始来源。

适用场景：

- 复杂病例的单次检索；
- 报告出具前的证据复核；
- 内部案例讨论与新人培训；
- API 接入前的结果质量验证。

CTA：体验当前版本。

#### API 接入

> 通过结构化请求获取候选结果、证据字段、引用关系和知识版本，便于接入报告系统或内部工作流。

适用场景：

- 报告解读流程调用；
- 多产品复用同一证据能力；
- 标准化输出字段和引用格式；
- 保存可追溯的知识版本与证据 ID。

CTA：查看 API 示例。

状态说明：

> 当前接口用于产品内部与演示链路，尚未提供生产级企业鉴权、配额、SDK 或 SLA。对外接入仅可作为试点方向沟通。

#### API 示例要求

- 页面可以展示脱敏、固定的请求与响应示例；
- 示例不得包含真实患者身份信息；
- 请求字段必须与当前接口实际字段一致；
- 未来字段使用单独的“产品方向”标签，不得混入当前可调用示例；
- 代码块提供复制按钮和复制成功反馈；
- 移动端允许横向滚动，不截断字段；
- 不展示真实密钥、数据库地址或模型配置。

### 9.8 结果与证据链展示区

#### 标题

> 推荐结果只是起点，证据链才是产品核心

#### 展示文案

> 每项候选药物或临床试验都应说明匹配原因、适用人群、证据强度、主要限制和原始来源，让结果能够被专业人员核验，而不是只能被接受。

#### 当前真实示例

输入示例：

> 非小细胞肺癌 + EGFR p.L858R

当前结果可展示：

- 按药物组织的治疗证据；
- 同疾病证据与跨适应证精确变异证据；
- 敏感、耐药及其他证据方向；
- 研究类型、样本量和研究人群；
- 分期、治疗线次与既往治疗限制；
- 主要结论与研究局限；
- PMID、FDA 来源和可公开展示的原文依据；
- 知识版本、文献与监管截止日期、生成时间；
- 中英文免责声明。

#### 展示要求

- 使用真实接口数据，不在 Landing Page 硬编码独立医学结果；
- 模型摘要与结构化证据卡必须清楚区分；
- 引用必须能够回连到对应治疗关联与证据记录；
- 不允许把跨适应证证据混入同疾病证据；
- 原文受展示策略限制时，只显示允许公开的来源与定位信息；
- 当前示例不得混入指南、会议摘要或临床试验等尚未开放的结果。

### 9.9 信任背书区

#### 标题

> 不要求团队相信一个黑箱，而是让每项结果经得起复核

#### 当前量化覆盖

基于当前已发布知识版本 `v0.2.0`：

- 2 个癌种；
- 2 个基因；
- 5 个变异；
- 6 个直接证据查询组合；
- 20 条临床证据结论；
- 9 条 FDA 批准记录；
- 22 份来源文档。

这些数字只代表当前演示知识版本，不代表最终产品覆盖，也不能表述为全部公开医学证据。实现时优先从后端或单一配置来源读取，不在多个组件中重复硬编码。

#### 机制背书

- 只有已审核、已发布的证据进入检索；
- 相同输入和相同知识版本得到确定的证据集合；
- 模型只归纳本次 Evidence Pack，不负责决定检索结果；
- 每个治疗结论必须关联本次检索到的证据 ID；
- 不存在或未检索到的引用会被拒绝；
- 模型摘要失败时仍可返回结构化证据；
- 未收录和超出范围会被明确显示，不使用虚构结果补齐。

#### 用户证言与客户标志

- 没有真实授权的客户前，不展示虚构公司标志；
- 没有真实访谈前，不展示虚构用户姓名、头像或评价；
- 首批证言应包含用户角色、使用场景、可观察变化和授权范围；
- 效率数字必须来自真实测试或客户数据，并说明样本与统计口径；
- 客户标志只能使用获得授权的真实资源。

### 9.10 当前能力与产品方向区

#### 标题

> 从核心证据链路开始，扩展到完整的治疗机会匹配

#### 当前已开放

- 结构化癌种与基因变异选择；
- 有限癌种和变异目录；
- 已审核 PubMed 与 FDA 证据；
- 按药物组织的治疗证据；
- 受 Evidence Pack 约束的中文综述；
- 证据 ID、PMID、监管来源和知识版本追溯；
- 在线体验与同源内部 API。

#### 产品方向

- 更多癌种、基因、变异与治疗方向；
- 分期、亚型、治疗线次和既往治疗参与匹配；
- 合规患者资料的 AI 结构化；
- 药物与临床试验联合匹配；
- 指南、监管资料、公开数据库、试验注册和会议摘要；
- 持续获取、审核、发布与版本更新工作流；
- 企业鉴权、日志、配额、SDK 和服务保障。

#### 展示要求

- 使用“当前已开放”和“产品方向”两个清晰区域；
- 不使用模糊的“即将上线”倒计时；
- 没有确定日期的能力不展示发布日期；
- 规划能力不提供看似可以立即使用的主按钮；
- 可以提供“申请参与试点”作为商业线索入口。

### 9.11 常见问题

#### Evidex 是给谁使用的？

> Evidex 主要面向肿瘤基因检测、临床解读和相关医学团队，用于支持证据检索、结果匹配、报告解读与内部复核。

#### Evidex 会替代临床解读人员吗？

> 不会。Evidex 负责组织患者线索、匹配证据并解释来源，最终判断、报告表达和医学复核仍由具备相应能力的专业人员完成。

#### 当前可以匹配临床试验吗？

> 当前演示版本暂未开放临床试验匹配。该能力属于产品方向，后续将结合患者条件、试验注册信息和关键入组要求逐步建设。

#### 为什么当前只支持少量癌种和变异？

> 当前版本优先验证知识建模、人工审核、确定性检索、模型引用约束和结果追溯链路。覆盖范围会随着证据复核和知识版本发布逐步扩展。

#### 没有匹配结果是否代表没有相关医学证据？

> 不是。它只表示当前 Evidex 知识版本没有收录符合条件的证据，或该查询暂时超出当前产品范围。

#### 可以通过 API 接入现有报告系统吗？

> 当前可以查看结构化接口与结果示例。生产级企业接入仍需补充鉴权、配额、日志、安全和服务保障能力，具体以试点范围为准。

#### 系统如何控制 AI 生成风险？

> 当前链路先从已审核、已发布的知识中构建 Evidence Pack，再由模型进行归纳。模型不能自行决定检索结果、监管状态或证据等级，生成引用还需要通过白名单校验。

#### 是否需要上传患者病历？

> 当前版本不上传自然语言病历，也不收集姓名、身份证号、联系方式或病历号。未来如果处理更多患者资料，必须先完成数据最小化、授权、安全、审计与合规设计。

#### 结果可以直接写入正式报告吗？

> Evidex 输出用于支持专业解读与复核。是否进入正式报告以及如何表述，应由使用机构按照自身医学、质控和合规流程决定。

### 9.12 底部 CTA

#### 标题

> 用一个真实案例，验证 Evidex 能为解读流程带来什么

#### 副标题

> 先体验当前证据查询与来源追溯，再一起评估多维患者信息、临床试验和 API 接入如何进入你的报告流程。

#### CTA

- 主 CTA：申请产品演示；
- 次 CTA：体验当前版本；
- 门槛说明：无需先改造现有系统。演示从一个已支持的癌种和变异开始，生产接入与数据范围另行确认。

### 9.13 页脚

建议内容：

- Evidex 产品名与一句话定位；
- 产品价值、证据体系、接入方式、常见问题等页面锚点；
- 隐私政策、服务条款和数据来源说明入口；
- 联系方式；
- 版权信息；
- 医疗与产品边界声明。

边界声明建议：

> Evidex 为肿瘤治疗证据检索与决策支持产品，不构成诊断、处方、最佳治疗方案或临床试验入组保证。输出结果应由具备相应能力的专业人员复核。

暂不展示无真实内容的社交媒体、客户数量、版本号或认证标志。

## 10. 视觉与素材要求

### 10.1 视觉原则

- 专业、克制、可信，优先表达证据结构与可追溯性；
- 全页使用一个浅色主题和统一的蓝色强调色系；
- 卡片圆角、按钮圆角和输入框圆角使用统一规则；
- 以冷调毛玻璃作为主要材质语言，但只用于导航、首屏产品容器、关键证据面板和 CTA 等需要层级的区域；
- 不使用 AI 紫色渐变、霓虹外发光、无层级的玻璃卡片堆叠或持续运动背景；
- 不使用夸大的医疗疗效、病人生存数据或没有来源的效果数字；
- 不用大量药丸、DNA、十字标志作为装饰。

### 10.2 蓝色视觉系统

以下颜色作为视觉设计起点，最终实现仍需逐项验证 WCAG AA 对比度：

| Token             | 建议值                    | 用途                     |
| ----------------- | ------------------------- | ------------------------ |
| `page-background` | `#F4F8FF`                 | 页面主背景               |
| `background-tint` | `#EAF2FF`                 | 蓝色环境光与区块浅色层次 |
| `text-primary`    | `#0B1F3A`                 | 标题与主要正文           |
| `text-secondary`  | `#52637A`                 | 辅助说明                 |
| `primary`         | `#175CD3`                 | 主按钮、链接和重点状态   |
| `primary-hover`   | `#134EAE`                 | 主按钮悬停状态           |
| `glass-surface`   | `rgb(255 255 255 / 0.72)` | 毛玻璃面板背景           |
| `glass-border`    | `rgb(56 118 205 / 0.20)`  | 毛玻璃面板边界           |
| `glass-highlight` | `rgb(255 255 255 / 0.72)` | 内侧高光                 |
| `glass-shadow`    | `rgb(20 70 140 / 0.14)`   | 蓝色调阴影               |

颜色要求：

- 只使用一个蓝色主色家族，状态色仅用于真实的成功、警告和错误语义；
- 蓝色环境光保持低饱和度，不能演变为紫蓝霓虹渐变；
- 大面积正文保持深色文字，不使用浅蓝文字承担主要信息；
- 主按钮、次按钮、链接、焦点环和选中状态使用一致的蓝色逻辑；
- 规划中标签不能只用颜色与已开放状态区分。

### 10.3 毛玻璃材质规范

毛玻璃必须表现为有边界和物理层次的半透明表面，而不是简单降低背景透明度。

建议基础参数：

- 背景透明度：白色 62% 至 78%；
- 背景模糊：18px 至 24px；
- 饱和度：110% 至 130%，避免高饱和塑料感；
- 边框：1px 半透明蓝色边界；
- 高光：顶部或内侧 1px 白色高光；
- 阴影：使用低透明度蓝灰阴影，不使用纯黑阴影；
- 圆角：主要玻璃容器统一使用 16px，按钮可以使用 10px 至 12px；
- 玻璃背后只放低对比度蓝色环境光或稳定背景，避免正文在复杂图片上失去可读性。

优先使用位置：

1. 吸顶导航；
2. 首屏真实产品界面外框；
3. 多维患者线索与循证证据汇合的核心价值区；
4. 证据来源、引用链和知识版本面板；
5. 底部 CTA 容器。

不应使用位置：

- 每一张普通功能卡；
- 长正文阅读区域；
- 错误信息和医学免责声明；
- 需要高密度阅读的完整 API 响应；
- 复杂照片或高对比图像之上。

降级要求：

- 不支持 `backdrop-filter` 时使用不透明的浅蓝白背景；
- 用户开启减少透明度时优先显示实色面板；
- 即使关闭模糊，文字、边框和按钮也必须保持足够对比度；
- 不能用模糊本身隐藏信息层级问题。

### 10.4 必需素材

正式开发至少需要以下真实素材：

1. 当前在线工作台完整截图或可嵌入的真实组件；
2. 一张展示证据卡、研究限制和来源追溯的局部截图；
3. 一份与真实接口一致的 API 请求和响应示例；
4. 产品方向示意图，用于表达多维患者线索进入药物与临床试验匹配流程；
5. Evidex 正式 Logo 或临时文字标志规范。

产品方向示意图必须标注“产品方向示意”。不得用生成图片伪装成已经上线的产品界面。

### 10.5 图标与图片

- 优先沿用项目已安装且全页一致的图标体系；
- 不手绘无必要的 SVG 图标；
- 所有功能图片提供明确的替代文本；
- 纯装饰图片使用空替代文本；
- 不使用虚构客户头像、公司 Logo 或病人照片增强可信度。

## 11. 响应式要求

### 11.1 桌面端

- 内容最大宽度建议 1200px 至 1400px；
- 首屏采用左右分栏，文案与产品视觉共同出现在首个视口；
- 主标题最多两行，按钮文字不换行；
- 导航保持单行；
- API 示例与证据结果可以使用更高的信息密度。

### 11.2 平板端

- 首屏可以降为单列或 5:7 比例布局；
- 产品视觉不能小到无法阅读字段；
- 宽表格改为卡片或允许局部横向滚动；
- 导航在空间不足时提前进入折叠菜单。

### 11.3 移动端

- 所有多列区块收敛为单列；
- 首屏先展示标题、副标题和 CTA，再展示产品视觉；
- 主 CTA 在首屏内可见；
- 正文不出现横向页面滚动；
- API 代码块允许自身横向滚动；
- 点击目标至少 44px；
- 长证据来源与 HGVS 字段允许安全换行或内部滚动；
- 避免使用固定视口高度，使用动态视口最小高度。

## 12. 动效要求

### 12.1 动效原则

- 动效应让页面感觉连续、顺滑和有层次，同时帮助用户理解信息流与状态变化；
- 每个动画必须服务于层级、叙事、操作反馈或状态转换；
- 首屏标题、副标题、CTA 和产品视觉按照阅读顺序依次进入，避免所有元素同时出现；
- 数据流动画用于解释患者线索如何进入循证知识库，再形成药物与临床试验候选结果；
- 区块进入动画只播放一次，用户回滚页面时不反复闪动；
- 毛玻璃表面的透明度与阴影可以在导航吸顶或内容聚焦时平滑变化，但不能影响文字对比度；
- CTA、标签切换、FAQ、API 复制和查询结果展开都应提供连续的状态过渡；
- 不使用自动播放的横向跑马灯、滚动劫持、复杂视差或持续粒子动画。

### 12.2 建议节奏

| 场景           | 建议参数                                |
| -------------- | --------------------------------------- |
| 首屏元素进入   | 450ms 至 700ms，元素间错开 50ms 至 90ms |
| 区块滚动进入   | 450ms 至 600ms，每个区块只触发一次      |
| 按钮与链接反馈 | 160ms 至 220ms                          |
| 卡片展开与收起 | 260ms 至 380ms                          |
| 标签与结果切换 | 220ms 至 320ms，使用淡入与小幅位移      |
| 数据流叙事     | 800ms 至 1400ms，按节点顺序推进         |

推荐使用平滑但快速收束的缓动，例如 `cubic-bezier(0.16, 1, 0.3, 1)`。需要弹性反馈时使用低振幅弹簧，避免按钮或卡片明显反弹。

### 12.3 技术实现

- 优先使用项目已经安装的 `motion/react`，不为基础动效新增动画依赖；
- 连续滚动值使用 Motion values 或浏览器原生滚动动画能力，不写入 React state；
- 不使用 `window.addEventListener('scroll')` 驱动逐帧动画；
- 仅动画化 transform、opacity、background-color 和必要的滤镜参数；
- 避免动画 width、height、top 和 left；
- 所有动画组件作为小型客户端叶子组件，不把整页转为 Client Component；
- 组件卸载时清理观察器、计时器和动画控制器。

### 12.4 可访问性与降级

- 所有非必要动画遵循 `prefers-reduced-motion`；
- 减少动态效果模式下取消错开进入、视差和数据流移动，直接显示最终状态；
- 关闭动画后，信息顺序、状态含义和 CTA 可用性不能改变；
- 动画不能导致焦点丢失、内容重排或页面滚动位置突变；
- 复制 API 示例后通过视觉和 live region 同时反馈成功或失败。

## 13. 功能与交互要求

### 13.1 页面锚点

建议锚点：

- `#value`：产品价值；
- `#workflow`：工作方式；
- `#evidence`：证据体系；
- `#integration`：接入方式；
- `#roadmap`：当前能力与产品方向；
- `#faq`：常见问题。

### 13.2 在线体验

- 首屏和底部“体验当前版本”指向真实证据体验页；
- 若在 Landing Page 内嵌查询组件，必须调用真实同源 API；
- 请求期间显示加载状态并阻止重复提交；
- 支持 `ANSWERED`、`SUMMARY_UNAVAILABLE`、`NO_CURATED_EVIDENCE`、`OUT_OF_SCOPE` 和 HTTP 错误状态；
- 失败时不能降级为前端预置的医学答案；
- 结果固定展示知识版本与免责声明。

### 13.3 产品演示申请

申请入口的最终交互待产品确认。若实现表单，建议只收集：

- 公司名称；
- 工作邮箱；
- 联系人称呼；
- 所在岗位；
- 主要使用场景；
- 期望在线试用、API 试点或商务沟通。

不得在演示申请表中收集患者数据。表单必须包含隐私说明、提交中状态、成功状态、错误状态和防重复提交。

### 13.4 API 示例

- 使用真实接口字段；
- 当前请求与未来请求分开显示；
- 默认隐藏过长响应，只展示足以说明结构的真实片段；
- 提供“查看完整字段说明”和“复制代码”；
- 当前没有公开密钥或开发者平台时，不展示“获取 API Key”按钮。

## 14. 内容与医学表达规则

### 14.1 推荐使用

- 治疗机会匹配；
- 药物与临床试验匹配；
- 循证知识库；
- 推荐依据；
- 候选结果；
- 证据检索；
- 决策支持；
- 可追溯、可复核；
- 当前知识版本已收录的证据。

### 14.2 禁止或需要证据后才能使用

- 最佳治疗方案；
- 最适合患者的药物；
- 保证临床试验入组；
- 替代医生或临床解读人员；
- 覆盖全部医学证据；
- 提高患者生存率；
- 准确率达到某个百分比；
- 节省固定小时数或固定成本；
- 已服务某数量客户；
- 企业级安全、合规认证或 SLA，除非已经真实取得和交付。

### 14.3 “全面证据”的解释

主标题中的“全面证据”表达的是多来源、结构化和持续扩展的产品方向，不代表已经收录所有公开医学资料。当前页面必须同时展示知识版本、覆盖范围和规划状态，避免形成绝对完整性的承诺。

## 15. SEO 与分享信息

### 15.1 中文 SEO 文案

页面标题：

> Evidex | AI 肿瘤药物与临床试验匹配平台

Meta Description：

> Evidex 综合多维患者线索与多来源循证知识，为肿瘤基因检测和临床解读团队匹配相关药物与临床试验，并提供可追溯的推荐依据。

OG 标题：

> 看见更多患者细节，用全面证据匹配治疗机会

OG 描述：

> AI 精细理解患者线索，多来源循证知识支撑药物与临床试验匹配。

### 15.2 English SEO Copy

Page title:

> Evidex | AI Drug and Clinical Trial Matching for Precision Oncology

Meta description:

> Evidex combines multidimensional patient context with multisource medical evidence to help genomic testing and clinical interpretation teams match drugs and clinical trials with traceable rationale.

OG title:

> See more of the patient. Match treatment opportunities with comprehensive evidence.

OG description:

> AI-structured patient context and multisource evidence for traceable drug and clinical trial matching.

### 15.3 基础要求

- 页面只包含一个可见 `h1`；
- 每个主要区块使用语义化标题层级；
- Meta 和 OG 文案不得宣传当前未开放能力为已上线功能；
- 中英文页面使用正确的 canonical 与 hreflang；
- 不修改已有路由结构前，先确认 SEO 与导航影响。

## 16. 数据分析要求

事件名称仅为建议，最终与现有分析方案对齐：

| 事件                          | 触发时机         | 禁止采集                       |
| ----------------------------- | ---------------- | ------------------------------ |
| `landing_demo_open`           | 点击体验当前版本 | 癌种、变异以外的患者数据       |
| `landing_example_view`        | 打开结果示例     | 任何身份信息                   |
| `landing_api_example_view`    | 查看 API 示例    | 密钥或请求中的敏感字段         |
| `landing_api_copy`            | 复制 API 示例    | 剪贴板内容                     |
| `landing_demo_request_start`  | 打开演示申请     | 表单内容                       |
| `landing_demo_request_submit` | 表单提交成功     | 患者资料、自由文本中的敏感信息 |
| `landing_nav_click`           | 点击导航锚点     | 无关浏览器数据                 |

分析事件不得携带病历、患者身份、自然语言病例或未来扩展的敏感临床字段。

## 17. 可访问性要求

- 正文和按钮颜色满足 WCAG AA，对核心正文以更高对比度为目标；
- 页面可仅用键盘完成导航、查看 FAQ、复制 API 示例和提交表单；
- 所有交互元素具有可见焦点状态；
- 移动菜单打开后正确管理焦点，关闭后返回触发按钮；
- 图标按钮提供可访问名称；
- FAQ 使用原生按钮语义和正确的展开状态；
- 加载、错误、复制成功和表单提交结果通过合适的 live region 提示；
- 不依赖颜色单独区分“已开放”和“规划中”；
- 支持浏览器放大到 200% 后继续使用；
- 所有动画提供减少动态效果方案。

## 18. 性能要求

- LCP 目标小于 2.5 秒；
- INP 目标小于 200 毫秒；
- CLS 目标小于 0.1；
- 首屏真实产品图预留尺寸并优先加载；
- 首屏以外图片懒加载；
- 不为营销动效引入大型 3D 或滚动动画依赖；
- 避免在滚动过程中持续动画化大面积 `backdrop-filter`，毛玻璃模糊尽量保持静态；
- 低性能设备上允许减少背景模糊和阴影层数，但不能减少信息内容；
- 交互组件保持客户端边界最小化；
- API 示例、FAQ 和非首屏交互可按需加载；
- 首发锁定浅色蓝色主题，不在页面区块之间切换深浅主题；暗色模式如需增加，应作为独立需求完整设计和验收。

## 19. 前端实现建议

当前首页由 `src/config/locale/messages/zh/pages/index.json` 驱动通用区块，仍保留 ShipAny 模板内容。现有通用 Hero 是居中式布局，难以直接满足本需求的非对称首屏、能力状态和真实产品演示要求。

英文首页应同步使用 `src/config/locale/messages/en/pages/index.json`。中英文内容需要共享同一套组件结构，只替换 locale message 和对应 SEO 信息。

建议前端在实现前评估两种方式：

1. 扩展现有 Landing 区块系统，新增 Evidex 专用 Hero、价值模块、证据链、能力路线和 API 示例区块；
2. 为首页建立 Evidex 专用页面组合，同时继续复用通用 Header、Footer、Button、FAQ 和国际化能力。

不得为了快速上线，把全部复杂内容塞入现有 `hero`、`features` 和 `stats` 配置并接受模板默认外观。页面应优先复用已有真实 `EvidenceExplorer` 的数据和展示逻辑，避免维护第二套医学结果。

实现前还需：

- 检查现有组件与依赖，避免无必要地新增设计系统；
- 保留现有用户未提交修改；
- 所有行为改动遵循测试先行；
- 页面、路由或构建变化交付前运行 `pnpm verify` 与 `pnpm verify:full`。

## 20. 验收标准

### 20.1 内容与定位

- [ ] 首屏使用已确认主标题和副标题；
- [ ] 首屏同时表达多维患者线索、全面证据、药物和临床试验；
- [ ] 页面明确面向基因检测与临床解读团队；
- [ ] 在线工作台和 API 两种方式均被说明；
- [ ] 所有规划能力在附近标注状态；
- [ ] 页面没有把临床试验、多维患者匹配或企业 API 宣传为当前已开放；
- [ ] 页面没有使用最佳治疗、保证入组或替代专业人员等表达；
- [ ] 当前覆盖数字与知识版本一致；
- [ ] 没有虚构客户、证言、Logo、效率数字或认证。

### 20.2 页面结构

- [ ] 顶部导航、11 个主体内容区块和页脚完整存在；
- [ ] 每个导航项滚动到正确锚点；
- [ ] 桌面端导航保持单行；
- [ ] 首屏 CTA 在初始视口可见；
- [ ] 主标题桌面端不超过两行；
- [ ] 页面至少使用四种不同的区块布局；
- [ ] 不出现连续三段相同图文交替布局；
- [ ] 不使用三张等宽同样式卡片作为主要功能表达。

### 20.3 交互

- [ ] 所有 CTA 有真实、可访问的目标；
- [ ] 移动导航可键盘操作并正确管理焦点；
- [ ] API 示例可以复制并反馈成功或失败；
- [ ] FAQ 可以通过键盘展开和收起；
- [ ] 若嵌入在线查询，加载、成功、无证据、越界和失败状态完整；
- [ ] 请求期间不能重复提交；
- [ ] 页面错误时不展示前端伪造医学结果。

### 20.4 响应式与视觉

- [ ] 320px、375px、768px、1024px、1440px 宽度下无页面横向滚动；
- [ ] 移动端多列内容按规定变为单列；
- [ ] API 和 HGVS 长文本不会破坏布局；
- [ ] 全页仅使用一个主题、一个强调色和统一圆角规则；
- [ ] 所有按钮文字在桌面端保持单行；
- [ ] 页面使用真实产品视觉，不使用假仪表盘或虚构医学结果；
- [ ] 导航、首屏产品容器、证据链和底部 CTA 按规范使用蓝色毛玻璃材质；
- [ ] 不支持背景模糊或启用减少透明度时，毛玻璃正确降级为实色面板；
- [ ] 首屏与区块进入、状态切换和数据流动效符合规定的时长与顺序；
- [ ] 动效在减少动态效果设置下可以正常降级。

### 20.5 可访问性与性能

- [ ] 键盘、焦点、语义标题、替代文本和 live region 满足本需求；
- [ ] 文本和按钮对比度达到 WCAG AA；
- [ ] 浏览器放大 200% 后核心流程仍可使用；
- [ ] Lighthouse 或等效工具验证 LCP、INP 和 CLS 目标；
- [ ] 页面无严重可访问性自动检查错误。

### 20.6 自动化验证

实现阶段至少补充：

- 组件测试：导航、CTA、能力状态、FAQ、API 复制和表单状态；
- 集成测试：首页国际化数据与区块渲染；
- E2E：中英文首页加载、语言切换、导航锚点、在线体验入口、API 示例和移动菜单；
- 回归测试：现有 `/zh/evidence` 体验页和 API 行为保持不变；
- 交付前：`pnpm verify` 与 `pnpm verify:full` 全部通过。

新增行为必须先写能够因缺少该行为而失败的测试，再完成最小实现。不得通过删除断言、跳过测试或降低覆盖门槛使检查通过。

## 21. 双语与本地化要求

### 21.1 首发范围

- 简体中文与英文 Landing Page 必须在同一首发版本交付；
- 本次双语范围至少覆盖 Landing Page、演示申请流程和结果示例外壳，不自动代表整个证据工作台已经完成英文医学内容建设；
- 中文路径沿用项目现有中文 locale，英文路径沿用现有英文 locale；
- 两种语言具有相同的信息架构、功能状态、CTA 能力和医学边界；
- 英文不是中文字符串的机器直译，应使用符合国际基因检测、临床解读和精准肿瘤学语境的表达；
- 中文页面的未来能力不能在英文页面写成当前能力，反之亦然；
- 页面更新时，中英文文案必须在同一个需求或 Pull Request 中同步修改。

### 21.2 工程要求

- 使用现有 `next-intl` 与 locale message 结构；
- Landing Page 组件不得硬编码可见的中文或英文业务文案；
- 导航、CTA、状态标签、表单、错误信息、FAQ、图片替代文本、可访问名称、Meta 和 OG 信息全部进入国际化资源；
- API 返回的医学字段如果尚无目标语言内容，应显示明确的缺省提示，不能把未翻译英文冒充中文结论；
- 数字、日期、复数、标点和列表连接词使用 locale 对应格式；
- 语言切换应尽量保留当前页面锚点，不能把用户送到无关页面；
- HTML `lang`、canonical、hreflang 和分享信息必须与当前语言一致；
- 中英文按钮都必须在桌面端保持单行，英文按钮需预留更长文本宽度；
- 英文标题允许根据自然语序调整断行，不能依赖中文的固定字符数布局。
- 如果英文页面链接的证据体验仍只有中文内容，CTA 必须明确标注语言或先显示说明，不能让用户误以为目标页面已经英文化；

### 21.3 术语对照

| 中文         | 推荐英文                       | 说明                                    |
| ------------ | ------------------------------ | --------------------------------------- |
| 治疗机会匹配 | treatment opportunity matching | 用于整体产品价值                        |
| 药物匹配     | drug matching                  | 不使用 drug recommendation 作为默认标题 |
| 临床试验匹配 | clinical trial matching        | 不暗示保证入组                          |
| 临床解读     | clinical interpretation        | 面向检测报告团队                        |
| 循证知识库   | evidence knowledge base        | 避免使用 complete database              |
| 循证综述     | evidence-based summary         | 当前产品结果                            |
| 推荐依据     | rationale for the match        | 强调依据，不直接承诺处方建议            |
| 候选结果     | candidate match                | 需要专业复核                            |
| 研究人群     | study population               | 保留适用性上下文                        |
| 证据等级     | evidence level                 | 使用 Evidex 自有等级时需说明            |
| 已开放       | Available now                  | 当前真实能力                            |
| 产品方向     | Product direction              | 尚未交付能力                            |
| 规划中       | Planned                        | 不承诺日期                              |
| 申请产品演示 | Request a demo                 | B 端主转化动作                          |
| 体验当前版本 | Try the current demo           | 低门槛动作                              |

### 21.4 双语验收

- [ ] `/zh` 与 `/en` 均能完整渲染 Landing Page；
- [ ] 两种语言的区块数量、状态标签和 CTA 意图一致；
- [ ] 中文和英文均只有一个可见 `h1`；
- [ ] 两种语言下导航和 CTA 均不换行或溢出；
- [ ] 中英文 Meta、OG、canonical 和 hreflang 正确；
- [ ] 语言切换保留当前页面或锚点；
- [ ] 两种语言都通过键盘、对比度和 200% 放大检查；
- [ ] 英文由产品或具备医学语境能力的人员完成最终校对。

## 22. 待产品确认事项

在前端正式实现前，产品需要确认：

1. 最终产品名称使用 Evidex、EvidOnc 或其他名称；
2. 顶部和底部“申请产品演示”的真实目标地址；
3. 是否立即实现企业线索表单，以及线索由谁接收；
4. 当前在线体验是否继续使用 `/zh/evidence`，或嵌入首页；
5. API 示例使用弹窗、页面区块还是独立开发者页面；
6. 企业 API 试点是否已经开放，页面应该使用“了解试点”还是“申请试点”；
7. 哪些未来证据来源已经具备可合法使用和展示的授权；
8. 是否已有可公开的客户 Logo、试点证言或效率数据；
9. 英文医学与产品文案由谁完成最终校对；
10. 未来处理患者资料前需要满足的数据安全、隐私和合规要求；
11. 对外使用“推荐”一词的医学、法律与市场审核边界；
12. 页面上线前由谁完成最终医学文案和合规复核。

## 23. 本次文档验收说明

本次仅新增需求文档，不修改页面、接口、路由、依赖或生产行为，因此不需要人为制造业务测试 RED。文档完成后应运行 Markdown 格式检查或仓库的变更格式检查，确认链接、结构和格式可被后续实现人员直接使用。

## 24. English Full Page Copy

本节是与第 9 节中文页面一一对应的英文首发文案。前端应将两套内容放入 locale message，不在组件中直接硬编码。

### 24.1 Navigation

Navigation items:

- Product value
- How it works
- Evidence base
- Integration
- FAQ

Primary navigation CTA:

> Request a demo

### 24.2 Hero

#### Headline

> See more of the patient. Match drugs and clinical trials with comprehensive evidence.

#### Subheadline

> Evidex uses AI to structure clinical signals across disease, stage, subtype, line of therapy, prior treatments, and genomic variants. It unifies publications, guidelines, regulatory approvals, public databases, and conference abstracts into one evidence base, so every match can be traced to its source.

#### Access line

> Search in the workspace or integrate the same capabilities through an API.

#### CTA

- Primary: Try the current demo
- Secondary: View a sample result

Barrier-reduction copy:

> No full medical record or patient identity data is required. Start with an available cancer type and variant to review the core evidence workflow.

Capability status:

> Treatment evidence search is available in the current demo. Multidimensional patient matching, clinical trial matching, and additional evidence sources are product directions.

### 24.3 Why current workflows fall short

#### Headline

> One variant cannot capture the patient. One source cannot support the full interpretation.

#### Introduction

> As patient context and medical evidence expand, simple rules and manual search struggle to deliver precision, coverage, and speed at the same time.

#### Scenario: Patient context is reduced to a few fields

> The same genomic variant may carry different evidence and limitations across cancer types, stages, subtypes, lines of therapy, and treatment histories. Matching on gene and variant alone often returns broad results that still require extensive manual filtering.

Cost of leaving it unresolved:

- Matches lack clinical context.
- Interpretation teams spend more time on secondary filtering.
- Different reviewers may apply different criteria.
- Senior reviewers remain a bottleneck.

#### Scenario: Evidence is fragmented across sources

> Publications, regulatory labels, guidelines, public databases, trial registries, and conference abstracts live in separate systems with different structures, update cycles, and levels of evidence.

Cost of leaving it unresolved:

- Teams repeat searches across multiple sites.
- Evidence language and citation formats vary across reports.
- Quality review and customer questions require the evidence chain to be rebuilt.
- The company must keep investing in fragmented knowledge maintenance.

#### Scenario: Reporting deadlines expose every workflow gap

> As sample volume grows or a report approaches its deadline, search, synthesis, citation, and review compete for the same limited medical resources.

Cost of leaving it unresolved:

- Report turnaround is affected.
- Repetitive work grows with sample volume.
- Training and consistency become harder to maintain.
- Interpretation capacity becomes difficult to scale.

### 24.4 Core value

#### Headline

> Deeper patient context. Broader evidence.

#### AI-structured patient signals

> From disease, stage, subtype, and line of therapy to prior treatments and genomic variants, Evidex is designed to turn authorized clinical inputs into structured signals that can inform matching.

What changes:

- Matching moves beyond a single variant to multidimensional patient context.
- Patient factors that affect evidence applicability become explicit.
- Study populations and patient signals can be reviewed together.

Business value:

> Interpretation teams receive more specific candidate matches and limitations, not a context-free list of drugs.

Status label:

> Product direction

#### Multisource evidence knowledge base

> Evidex structures different forms of medical knowledge into evidence that can be searched, compared, and cited while preserving sources, levels, populations, conclusions, and limitations.

What changes:

- Publications, guidelines, regulatory materials, databases, trial registries, and conference abstracts can follow a shared evidence structure.
- Approved indications, mature clinical evidence, limited evidence, and resistance findings remain distinct.
- Each conclusion stays connected to its source, knowledge version, and review status.

Business value:

> Teams can review the evidence landscape in one result and reuse the source trail for reporting, quality control, and historical review.

Status label:

> PubMed and FDA evidence available now. Additional sources are planned.

### 24.5 Result types

#### Headline

> From treatment evidence to clinical opportunities still under investigation

#### Drug matching

> Organize relevant drugs and regimens with evidence direction, regulatory status, study populations, clinical context, and the rationale for each match.

Each result should answer:

- Why was this drug or regimen matched?
- Which patient factors support or limit the match?
- Which studies and regulatory records support the result?
- Does the evidence apply to the exact variant or a broader population?
- What still requires professional review?

Status label:

> Limited treatment evidence matching is available in the current demo.

#### Clinical trial matching

> Match potentially relevant clinical trials using disease, stage, subtype, line of therapy, prior treatments, biomarkers, and other key criteria, with an explanation of the match and its source.

Planned results should answer:

- What treatment strategy is the trial studying?
- Which patient signals align with key eligibility criteria?
- Which conditions may limit the match?
- Which registry and version supplied the trial information?
- What must still be confirmed by the study site?

Status label:

> Planned

Boundary copy:

> Candidate matches do not confirm eligibility. Final eligibility must be determined by the study team.

### 24.6 How it works

#### Headline

> From patient signals to evidence-backed matches

#### Organize patient context

> Start with structured fields. The long-term product direction includes authorized clinical documents after privacy and security requirements are met.

#### Structure key signals

> Use AI to identify disease, stage, subtype, line of therapy, prior treatments, and biomarkers while preserving the source context.

#### Match reviewed evidence

> Search approved knowledge releases for relevant drugs, clinical trials, and supporting evidence. The model cannot invent sources outside the retrieved evidence.

#### Return reviewable results

> Organize candidate matches with rationale, study populations, evidence strength, limitations, and sources for professional review.

### 24.7 Ways to use Evidex

#### Headline

> One evidence engine, two ways to work

#### Online workspace

> Clinical interpretation teams can enter or select case criteria, then review matches, study limitations, and original sources.

Use cases:

- One-off review of complex cases
- Evidence review before report delivery
- Internal case discussions and training
- Output validation before API integration

CTA:

> Try the current demo

#### API integration

> Submit structured requests and receive candidate matches, evidence fields, citation relationships, and knowledge versions for use in reporting systems and internal workflows.

Use cases:

- Report interpretation workflows
- Shared evidence capabilities across multiple products
- Standardized output and citation formats
- Traceable knowledge versions and evidence IDs

CTA:

> View the API example

Current status:

> The current API supports internal product and demonstration workflows. Production authentication, quotas, SDKs, and service-level commitments are not yet available. External integration is discussed as a pilot.

### 24.8 Result and evidence chain

#### Headline

> A match is the starting point. The evidence chain is the product.

#### Body copy

> Each candidate drug or clinical trial should explain why it was matched, which population the evidence applies to, how strong the evidence is, what its limitations are, and where the information came from.

Current example input:

> Non-small cell lung cancer + EGFR p.L858R

The current result can show:

- Treatment evidence organized by drug
- Same-disease evidence and exact-variant cross-indication evidence
- Sensitivity, resistance, and other evidence directions
- Study design, sample size, and study population
- Stage, line of therapy, and prior-treatment limitations
- Main findings and study limitations
- PMID, FDA sources, and permitted source passages
- Knowledge release, literature and regulatory cutoffs, and generation time
- Chinese and English disclaimers

### 24.9 Trust and evidence quality

#### Headline

> Built to be reviewed, not blindly trusted

#### Current coverage

Based on the published `v0.2.0` knowledge release:

- 2 cancer types
- 2 genes
- 5 variants
- 6 direct evidence query combinations
- 20 clinical evidence claims
- 9 FDA approval records
- 22 source documents

Coverage note:

> These figures describe the current demonstration release. They do not represent the final product scope or all publicly available medical evidence.

#### Quality controls

- Only reviewed and published evidence enters retrieval.
- The same input and knowledge release return a deterministic evidence set.
- The model summarizes the retrieved Evidence Pack and does not decide which evidence is retrieved.
- Every treatment statement must cite evidence retrieved for the current request.
- References that were not retrieved are rejected.
- Structured evidence remains available if the narrative summary fails.
- Missing and out-of-scope results are shown explicitly rather than filled with generated content.

### 24.10 Available now and product direction

#### Headline

> Starting with a traceable evidence workflow, expanding toward complete treatment opportunity matching

#### Available now

- Structured cancer type and genomic variant selection
- A limited catalog of supported cancer types and variants
- Reviewed PubMed and FDA evidence
- Drug-centered treatment evidence results
- Evidence Pack constrained summaries in Chinese
- Evidence IDs, PMID, regulatory sources, and knowledge release traceability
- Online demonstration and same-origin internal API

#### Product direction

- Broader cancer, gene, variant, and treatment coverage
- Stage, subtype, line of therapy, and prior treatments in matching
- AI structuring of authorized clinical inputs
- Combined drug and clinical trial matching
- Guidelines, regulatory materials, public databases, trial registries, and conference abstracts
- Continuous evidence acquisition, review, publishing, and versioning
- Enterprise authentication, logs, quotas, SDKs, and service commitments

### 24.11 FAQ

#### Who is Evidex designed for?

> Evidex is designed for genomic testing, clinical interpretation, and medical teams that need evidence search, matching, report support, and internal review capabilities.

#### Does Evidex replace clinical interpretation professionals?

> No. Evidex organizes patient signals, matches evidence, and explains sources. Final interpretation, report language, and medical review remain the responsibility of qualified professionals.

#### Can Evidex match clinical trials today?

> Not in the current demonstration release. Clinical trial matching is a product direction that will be developed around patient criteria, trial registry data, and key eligibility requirements.

#### Why does the current demo support only a small set of cancer types and variants?

> The current release focuses on validating the knowledge model, human review, deterministic retrieval, citation controls, and source traceability. Coverage will expand through reviewed knowledge releases.

#### Does no result mean that no relevant medical evidence exists?

> No. It means that the current Evidex knowledge release does not contain eligible evidence for the query, or that the query is outside the current product scope.

#### Can Evidex integrate with an existing reporting system?

> A structured request and response example is available today. Production integration still requires authentication, quotas, logging, security, and service commitments. The exact scope is discussed as part of a pilot.

#### How does Evidex control AI generation risk?

> The current workflow builds an Evidence Pack from reviewed, published knowledge before asking the model to summarize it. The model cannot decide retrieval results, regulatory status, or evidence levels, and generated citations must pass an allowlist check.

#### Do we need to upload patient medical records?

> No. The current release does not accept narrative medical records or collect names, identity numbers, contact details, or medical record numbers. Any future use of broader patient data requires data minimization, authorization, security, audit, and compliance design first.

#### Can the output be inserted directly into a final report?

> Evidex provides evidence and decision support for professional interpretation and review. Each organization is responsible for deciding whether and how the output enters its reports under its own medical, quality, and compliance processes.

### 24.12 Final CTA

#### Headline

> Test Evidex with one real interpretation scenario

#### Subheadline

> Start with the current evidence search and source trail, then explore how multidimensional patient context, clinical trials, and API integration could fit into your reporting workflow.

#### CTA

- Primary: Request a demo
- Secondary: Try the current demo

Barrier-reduction copy:

> No system integration is required to begin. Start with one supported cancer type and variant. Production integration and data scope are evaluated separately.

### 24.13 Footer

Product description:

> AI treatment opportunity matching and evidence intelligence for genomic testing and clinical interpretation teams.

Boundary statement:

> Evidex supports oncology evidence retrieval and professional decision support. It does not provide a diagnosis, prescription, best treatment determination, or guarantee of clinical trial eligibility. All outputs require review by qualified professionals.
