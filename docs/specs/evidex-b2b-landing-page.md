# Evidex B 端 Landing Page 改版需求文档

## 1. 文档信息

| 项目     | 内容                                               |
| -------- | -------------------------------------------------- |
| 文档版本 | V1.2                                               |
| 更新日期 | 2026-09-12                                         |
| 页面类型 | 面向肿瘤基因检测与临床解读团队的 B 端 Landing Page |
| 首发语言 | 简体中文、英文                                     |
| 改版性质 | 在 V1.1 已实现页面上进行内容、布局、视觉与动效重构 |
| 文档状态 | 可进入前端拆解与视觉设计                           |

本文档同时保留 V1.1 的有效产品定位，并明确列出 V1.2 新增、删除和替换内容。开发应以 V1.2 为准；当本文档与旧版文案或当前页面实现冲突时，以本文档为最终要求。

## 2. 本次改版结论

### 2.1 一句话设计方向

> 一个以真实查询为首屏核心、用动态病例上下文和证据链讲清价值的蓝色毛玻璃精准肿瘤学产品页面。

### 2.2 设计参数

- `DESIGN_VARIANCE: 6`：使用有节奏的非对称布局，不再依赖连续文字卡片。
- `MOTION_INTENSITY: 7`：页面持续有轻量环境动效，并在滚动、查询、切换和展开时提供清晰反馈。
- `VISUAL_DENSITY: 6`：增加产品界面、数据流、人物角色和医学主题视觉，同时减少可见文字量。
- 主题：浅色冷蓝灰背景、深海军蓝正文、单一高饱和蓝色强调色。
- 材质：导航、首屏查询、证据链和底部 CTA 使用分层毛玻璃；正文区使用清晰实色背景。
- 字体：中文使用现代无衬线，英文使用 Manrope，Landing Page 不使用 Merriweather 等衬线字体作为大标题。

### 2.3 本次不变的内容

以下 V1.1 内容继续保留：

- 面向肿瘤基因检测公司、临床解读团队、医学审核和产品技术负责人；
- 两项核心价值不变：更精细地理解患者，以及更全面地组织循证证据；
- 产品同时支持在线查询与 API 接入的整体定位；
- 产品结果用于专业决策支持，不替代医生或临床解读人员；
- 候选临床试验不代表确认入组，最终资格由研究团队判断；
- 中英文页面同时交付；
- 蓝色毛玻璃视觉方向继续保留；
- 不虚构客户名称、客户 Logo、用户证言、准确率、节省时长、商业数据或认证。

## 3. V1.1 到 V1.2 变更范围

### 3.1 变更总表

| 区域         | V1.1 现状                                                | V1.2 要求                                                                | 变更类型   |
| ------------ | -------------------------------------------------------- | ------------------------------------------------------------------------ | ---------- |
| 首屏标题     | 标题过长，大字号下形成多行文字墙                         | 改为短标题“看见患者全貌，匹配治疗机会”                                   | 替换       |
| 首屏副标题   | 一句话塞入大量患者字段和证据来源                         | 压缩为一条核心路径，详细来源交给后续可视化                               | 替换       |
| 首屏高度     | `min-h-[100dvh]` 与内部最小高度叠加，内容下方留白过大    | 改为内容驱动高度；1440×900 下应看到下一信息带                            | 修改       |
| 首屏查询卡   | 查询前显示“等待结构化查询”和“不会发送患者身份信息”       | 两行及其空容器全部删除；提交后才挂载加载或结果区                         | 删除       |
| 查询结果     | 空状态预留固定高度                                       | 加载、成功、无证据、越界和错误结果在按钮下方直接展开                     | 修改       |
| 产品状态文案 | 多处出现“当前版本”“产品方向”“规划中”“尚未开放”“正在配置” | 访客页面全部移除，改为一次产品级 `Early Access` 说明                     | 删除与替换 |
| 产品叙事     | 围绕 MVP 当前覆盖反复解释                                | 围绕完整产品价值讲解患者上下文、药物、临床试验、证据和 API               | 重构       |
| 痛点         | 三段长场景与三列文字代价                                 | 改为动态时间线，保留具体时点、事件和代价，每个节点只留一句场景与一句后果 | 重构       |
| 核心价值     | 大段说明和列表                                           | 改为“患者线索图”和“证据汇聚图”两段可视化叙事                             | 重构       |
| 结果类型     | 两张大文字卡片并附状态标签                               | 改为可切换的药物结果与临床试验结果产品视觉                               | 重构       |
| 工作方式     | 四张等宽静态卡片                                         | 改为一条有方向的数据流，节点随滚动依次点亮                               | 重构       |
| 角色价值     | 无人物视觉                                               | 增加三个职业角色头像与一句话收益，不伪装成客户证言                       | 新增       |
| 信任背书     | 大量当前知识库小规模覆盖数字                             | 以真实查询结果、证据追溯和质量控制机制为主；数字由接口实时产生，不硬编码 | 替换       |
| 动效         | 主要是整个区块淡入                                       | 增加首屏编排、环境光、数据流、节点点亮、标签切换和结果展开               | 增强       |
| 字体         | 中文依赖系统回退，标题观感不稳定                         | 中文指定 Noto Sans SC 或思源黑体，英文继续使用 Manrope                   | 修改       |
| CTA          | “体验当前版本”等进度感表达，底部还有“正在配置”           | 顶部直接“运行证据查询”，底部递进为“申请团队演示”                         | 替换       |
| FAQ          | 反复说明当前不支持什么                                   | 只回答适用对象、工作方式、证据、试验边界、数据和接入                     | 精简       |

### 3.2 明确删除的访客可见内容

前端需要从中英文 locale、组件渲染和可访问文案中同步删除：

- `等待结构化查询` / `Waiting for a structured query`；
- `不会发送患者身份信息或自然语言病历。` 及对应英文；
- 查询前固定占位结果框；
- 所有 `当前已开放`、`产品方向`、`规划中`、`试点沟通` 状态徽章；
- 首屏关于“当前演示版本只开放部分能力”的状态段落；
- 独立“当前能力与产品方向”区块及 `#roadmap` 锚点；
- FAQ 中“当前是否支持临床试验”“为什么只支持少量癌种和变异”等进度说明；
- API 区的“仅开放试点沟通”“尚未提供生产级能力”；
- 底部 CTA 上方“外部演示申请渠道正在配置中”；
- 对访客暴露的 `V0.2.0` 产品进度表达。结果追溯所需的知识版本仍可保留在真实查询结果中；
- 重复出现的“产品方向示意”标签。

### 3.3 产品能力的对外表达原则

页面应宣传完整产品体系，不围绕 MVP 罗列缺失项。药物匹配、临床试验匹配、多维患者上下文、多来源证据和 API 均作为产品核心能力进行叙述。

为避免把不可操作入口伪装成已可交付功能，统一采用以下处理：

1. 导航品牌旁只出现一次 `Early Access`，不在各区块重复状态标签。
2. 可点击的“运行证据查询”必须调用真实接口，不能返回前端伪造结果。
3. 产品预览视觉可以展示完整工作流，但不得使用虚构的患者结论、试验资格、药物疗效或来源数据。
4. 临床试验视觉的 CTA 指向团队演示或产品能力说明，不伪装成当前真实查询结果。
5. FAQ 使用对外语言说明：“Early Access 期间，团队演示会根据客户场景说明可用数据范围和接入方式。”不展示内部排期或研发进度。
6. 在真实能力尚未覆盖前，不得使用“已全面上线”“立即调用全部能力”“覆盖所有来源”等绝对表达。

此处理既满足完整产品宣传，又不在公开页面暴露内部路线图或制造不可验证的功能承诺。

## 4. 页面目标与信息优先级

### 4.1 首屏 8 秒内需要传达的信息

访客在不滚动时必须理解：

1. Evidex 能结合更完整的患者信息匹配治疗机会；
2. 匹配范围包括药物与临床试验；
3. 结果带有可追溯的循证依据；
4. 用户可以立即运行一个真实证据查询；
5. 产品支持在线工作台和 API 两种使用方式。

### 4.2 内容密度规则

- H1 最多两行；中文建议每行 8 至 15 个汉字，英文最多 7 至 9 个词一行。
- 首屏副标题中文不超过 68 个汉字，英文不超过 28 个词，桌面端最多三行。
- 首屏可见文字元素不超过四组：标题、副标题、行动区、查询卡标题与说明。
- 每个主体区块最多一个 H2、一句引导文案和一组视觉叙事。
- 单段中文正文建议不超过 55 个汉字，英文不超过 30 个词。
- 列表每组最多四项，每项中文不超过 18 个汉字。
- 页面不再连续出现三个以上以文字为主体的区块。
- 功能详情优先通过标签、结构图、结果界面和交互状态呈现。

## 5. 新页面信息架构

| 顺序 | 区块             | 主要说服任务           | 主要表现形式          |
| ---- | ---------------- | ---------------------- | --------------------- |
| 1    | 顶部导航         | 识别品牌并快速行动     | 轻毛玻璃导航          |
| 2    | 首屏与真实查询   | 一眼理解价值并立刻体验 | 短文案 + 真实查询卡   |
| 3    | 核心能力带       | 用最少文字强化三项能力 | 横向动态标签带        |
| 4    | 痛点时间线       | 让客户识别流程代价     | 动态时间线            |
| 5    | 多维患者上下文   | 证明“更精细”           | 患者线索星图          |
| 6    | 多来源证据       | 证明“更全面”           | 证据来源汇聚图        |
| 7    | 药物与临床试验   | 展示两类输出           | 可切换结果界面        |
| 8    | 工作流与角色     | 说明怎么用、谁受益     | 数据流 + 角色头像     |
| 9    | 在线工作台与 API | 说明如何进入企业流程   | 工作台预览 + API 响应 |
| 10   | 信任与结果证据   | 降低黑箱与医学风险顾虑 | 真实结果链 + 控制机制 |
| 11   | FAQ              | 处理关键异议           | 精简折叠项            |
| 12   | 底部 CTA         | 收口 B 端转化          | 高对比毛玻璃 CTA      |

## 6. 中文页面完整文案与布局

### 6.1 顶部导航

品牌：`Evidex`

品牌状态：`Early Access`

导航项：

- 产品能力
- 工作方式
- 证据体系
- 接入方式
- 常见问题

右侧 CTA：`申请团队演示`

要求：

- 导航高度 72px，桌面端保持单行；
- 吸顶后背景从透明过渡为蓝白毛玻璃；
- `Early Access` 是全页唯一产品级状态说明；
- 移动端菜单打开后管理焦点，关闭后焦点返回菜单按钮。

### 6.2 首屏

#### 左侧文案

H1：

> 看见患者全貌，匹配治疗机会

副标题：

> Evidex 用 AI 理解分期、亚型、治疗线次和基因变异等患者线索，汇集多来源循证知识，为药物与临床试验匹配提供可追溯依据。

主 CTA：`运行证据查询`

次 CTA：`查看平台能力`

门槛说明：

> 示例查询无需注册，点击后直接查看结果。

#### 右侧真实查询卡

卡片标题：`运行证据查询`

说明：

> 选择癌种与变异，查看匹配结果及原始来源。

字段：

- 癌种
- 基因变异

按钮默认：`运行证据查询`

按钮加载：`正在检索证据`

成功标题：`已找到可追溯证据`

结果摘要标签：

- 治疗关联
- 证据结论
- 来源记录
- 知识版本

结果链接：`查看完整结果`

#### 查询卡状态要求

- 初始状态到按钮结束，不渲染任何结果外框、箭头、占位标题或隐私小字。
- 点击按钮后，加载骨架在按钮下方出现，并将卡片自然向下撑开。
- 成功、无证据、越界或错误状态直接替换加载骨架。
- 状态区域使用 `aria-live="polite"`，但只有查询开始后才挂载。
- 用户更换查询条件后，旧结果平滑收起，卡片恢复到无结果的紧凑状态。
- 真实查询可以继续展示知识版本和医学免责声明，但不把内部产品版本写成宣传文案。

#### 首屏能力标签带

位于首屏主内容下方，同一视口内至少露出一部分：

- 多维患者线索
- 药物与临床试验
- 多来源循证知识
- 在线工作台 + API

标签之间用缓慢移动的蓝色光点或连线表现信息传递，不使用跑马灯。

### 6.3 痛点时间线

H2：

> 报告越临近，碎片化检索越昂贵

时间线节点一：

- 时点：`病例进入解读`
- 场景：`患者背景被压缩为少量字段，简单匹配返回一份宽泛清单。`
- 代价：`解读人员把时间花在二次筛选。`

时间线节点二：

- 时点：`复杂证据需要复核`
- 场景：`论文、指南、批准、试验和会议信息散落在不同入口。`
- 代价：`来源反复查找，关键限制容易被遗漏。`

时间线节点三：

- 时点：`报告等待交付`
- 场景：`检索、引用和审核同时占用有限的资深医学人力。`
- 代价：`交付时间被拉长，新增样本继续放大重复工作。`

视觉：使用一条从“样本进入”到“报告交付”的横向时间线。滚动进入时三个节点依次激活，代价以短标签从节点下方出现。移动端改为纵向时间线。

### 6.4 多维患者上下文

H2：

> 从一个变异，看到完整病例

正文：

> AI 将患者线索组织为同一匹配上下文，让每个结果都能回答为什么相关、哪里受限。

视觉节点：

- 疾病
- 临床分期
- 分子亚型
- 治疗线次
- 既往治疗
- 基因与变异
- 其他生物标志物

中心结果：`患者上下文`

收益句：

> 从宽泛清单，变为带病例上下文的候选结果。

视觉：中心病例节点与七个线索节点组成可响应鼠标或滚动的星图。节点依次汇入中心，再向药物与临床试验两类输出分流。不得展示真实患者姓名、病历号或身份信息。

### 6.5 多来源循证知识

H2：

> 一次检索，串起完整证据链

正文：

> 不同来源在同一结构中呈现，证据的人群、结论、限制、版本和原始出处一并保留。

来源节点：

- 同行评议论文
- 临床指南
- 监管批准与标签
- 公开医学数据库
- 临床试验注册
- 医学会议摘要

输出节点：

- 匹配依据
- 适用人群
- 证据强度
- 主要限制
- 原始来源

收益句：

> 少一些跨站搜索，多一条可复核的来源链。

视觉：左侧六类来源以不同图标汇入中心知识图谱，右侧展开一条结构化证据卡。连接线内有低速流动光点；鼠标悬停某个来源时，只高亮该来源对应的结果字段。

### 6.6 药物与临床试验结果

H2：

> 药物与临床试验，一起看

引导：

> 同一份患者上下文，连接两类治疗机会和各自的证据依据。

标签一：`药物匹配`

说明：

> 查看匹配原因、研究人群、监管状态、证据强度与适用限制。

结果字段：

- 匹配依据
- 敏感或耐药方向
- 研究人群
- 监管记录
- 证据与限制

标签二：`临床试验匹配`

说明：

> 对照疾病、分期、线次、生物标志物和关键入组条件，定位可能相关的研究机会。

结果字段：

- 研究方向
- 关键匹配条件
- 可能限制条件
- 招募地点
- 注册来源与版本

边界说明：

> 候选匹配不代表确认入组，最终资格由研究团队判断。

视觉：以共享布局动画在药物和临床试验两种产品界面间切换。药物视图可使用中性的分子结构或药物研发主题图，临床试验视图使用协议摘要、地点和入组条件图形。不得使用具体药品包装、医院 Logo 或虚构研究编号制造背书。

### 6.7 工作方式

H2：

> 从病例输入，到可复核结果

流程节点：

1. `输入患者线索`：结构化字段或合规资料。
2. `AI 组织上下文`：识别影响匹配的关键条件。
3. `匹配循证知识`：连接药物、试验和支持证据。
4. `输出可复核结果`：保留依据、限制、来源和版本。

视觉：四个节点不是四张独立卡片，而是一条连续数据流。滚动时输入字段变成结构化标签，随后进入证据网络，最终组装成结果卡。

### 6.8 角色价值

H2：

> 让不同角色，在同一条证据链上协作

角色一：

- 角色：`临床解读人员`
- 收益：`更快定位候选结果与关键限制。`

角色二：

- 角色：`医学审核人员`
- 收益：`逐条核查研究人群、依据和来源。`

角色三：

- 角色：`产品与技术团队`
- 收益：`通过 API 将证据能力接入报告流程。`

视觉：使用同一插画体系的职业头像或半身像，人物身份只代表岗位，不使用姓名、公司、引语、星级或客户 Logo，避免被误解为真实用户证言。

### 6.9 在线工作台与 API

H2：

> 直接查询，也能接入报告系统

在线工作台：

- 标题：`在线工作台`
- 说明：`用于单例检索、报告复核、案例讨论和接入前验证。`
- CTA：`打开在线工作台`

API：

- 标题：`结构化 API`
- 说明：`返回匹配结果、证据字段、引用关系和知识版本。`
- CTA：`查看 API 示例`

API 示例保留真实请求字段和脱敏响应结构，提供复制按钮。不得出现密钥、数据库地址、模型配置或真实患者数据。

### 6.10 信任与结果证据

H2：

> 不是黑箱，而是可核验的证据工作流

说明：

> 从匹配结果回到证据结论，再回到原始来源，每一步都可以复核。

控制机制：

- 已审核证据进入检索
- 证据包约束模型综述
- 引用通过来源白名单校验
- 结果保留知识版本
- 无结果与超出范围明确返回
- 综述不可用时仍保留结构化证据

效果展示要求：

- 使用首屏真实查询产生的结果，不在本区块重复硬编码一套医学结果；
- 以可交互证据链展示“治疗关联 → 证据结论 → PMID、监管记录或其他原始来源”；
- 数量指标从当前查询响应实时计算，只显示“治疗关联、证据结论、来源记录”，不得写死营销数字；
- 没有真实客户授权前，不显示客户 Logo 或虚构证言；
- 有真实试点数据后，可追加前后对比与实名或匿名证言，但必须同时记录样本量、测量口径和授权状态。

### 6.11 FAQ

H2：`常见问题`

问题一：`Evidex 适合谁使用？`

> 面向肿瘤基因检测、临床解读及相关医学团队，用于支持治疗机会匹配、证据检索、报告解读和内部复核。

问题二：`Evidex 如何做到更精细的匹配？`

> 系统将疾病、分期、亚型、治疗线次、既往治疗、基因变异等线索组织为患者上下文，再与证据中的研究人群和适用条件进行匹配。

问题三：`证据来自哪里？`

> 证据体系涵盖论文、指南、监管资料、公开数据库、临床试验注册和会议摘要，并保留来源、版本、适用人群与限制。

问题四：`临床试验匹配是否代表可以入组？`

> 不代表。Evidex 用于定位可能相关的研究机会并解释匹配依据，最终资格由研究团队确认。

问题五：`可以接入现有报告系统吗？`

> 可以通过结构化 API 获取匹配结果、证据字段、引用关系和知识版本。团队演示会结合实际工作流说明接入方式。

问题六：`是否需要上传患者身份信息？`

> 示例查询不需要患者身份信息。正式接入时，数据范围与处理方式应按照客户的安全、隐私和合规要求确认。

问题七：`Early Access 代表什么？`

> Evidex 正在邀请基因检测与临床解读团队体验完整产品方案。团队演示会根据具体场景说明可用数据范围与接入方式。

### 6.12 底部 CTA

H2：

> 让下一份报告，从更完整的证据开始

说明：

> 带上一个典型案例，看看 Evidex 如何匹配治疗机会并返回可追溯依据。

主 CTA：`申请团队演示`

次 CTA：`查看 API 示例`

门槛说明：

> 示例查询无需注册；演示申请不收集患者数据。

顶部与底部递进：顶部先让访客运行查询，底部在完成产品理解后引导团队演示与接入沟通。

## 7. English Full Page Copy

英文页面与中文页面共享组件和信息架构，但不逐字直译。

### 7.1 Navigation

Brand: `Evidex`

Product status: `Early Access`

Navigation:

- Platform
- How it works
- Evidence
- Integration
- FAQ

Primary action: `Request a team demo`

### 7.2 Hero

H1:

> See the whole patient. Match treatment opportunities.

Subtitle:

> Evidex uses AI to understand stage, subtype, treatment line, genomic variants, and other patient context, then connects drugs and clinical trials to traceable medical evidence.

Primary CTA: `Run an evidence search`

Secondary CTA: `Explore the platform`

Barrier copy:

> No registration required for the sample search. Results appear immediately.

Live query title: `Run an evidence search`

Live query description:

> Select a cancer type and variant to view matched results and original sources.

Fields:

- Cancer type
- Genomic variant

Default button: `Run evidence search`

Loading button: `Searching the evidence`

Success title: `Traceable evidence found`

Result labels:

- Treatment associations
- Evidence claims
- Source records
- Knowledge release

Result link: `View full results`

Hero capability rail:

- Multidimensional patient context
- Drug and clinical trial matching
- Multisource medical evidence
- Web workspace + API

### 7.3 Pain Timeline

H2:

> Fragmented search gets more expensive as the report deadline approaches

Node 1:

- Moment: `A case enters interpretation`
- Scenario: `Complex patient context is reduced to a few fields, producing a broad list of matches.`
- Cost: `Interpretation time is spent filtering the list again.`

Node 2:

- Moment: `Complex evidence needs review`
- Scenario: `Publications, guidelines, approvals, trials, and meeting abstracts live in different places.`
- Cost: `Sources are searched repeatedly and important limitations are easier to miss.`

Node 3:

- Moment: `The report is waiting to ship`
- Scenario: `Search, citation, and review compete for the same senior medical capacity.`
- Cost: `Turnaround slows while repetitive work grows with every new batch.`

### 7.4 Patient Context

H2:

> Go from a single variant to the full case

Body:

> AI organizes patient clues into one matching context, so every result can explain why it is relevant and where it is limited.

Nodes:

- Disease
- Clinical stage
- Molecular subtype
- Treatment line
- Prior therapies
- Gene and variant
- Other biomarkers

Center: `Patient context`

Outcome:

> Replace a broad list with candidate matches grounded in the case.

### 7.5 Evidence Knowledge Base

H2:

> One search. A connected evidence trail.

Body:

> Evidence types appear in one structure, with population, finding, limitations, version, and original source preserved.

Sources:

- Peer-reviewed publications
- Clinical guidelines
- Regulatory approvals and labels
- Public medical databases
- Clinical trial registries
- Medical meeting abstracts

Outputs:

- Match rationale
- Relevant population
- Evidence strength
- Key limitations
- Original source

Outcome:

> Spend less time searching across sites and keep a trail reviewers can verify.

### 7.6 Drug and Clinical Trial Results

H2:

> See drugs and clinical trials together

Lead:

> Connect the same patient context to two types of treatment opportunity and the evidence behind each one.

Tab 1: `Drug matching`

> Review match rationale, study population, regulatory status, evidence strength, and limitations.

Fields:

- Match rationale
- Sensitivity or resistance direction
- Study population
- Regulatory record
- Evidence and limitations

Tab 2: `Clinical trial matching`

> Compare disease, stage, treatment line, biomarkers, and key eligibility conditions to locate potentially relevant studies.

Fields:

- Research direction
- Key matching conditions
- Potential limitations
- Recruiting locations
- Registry source and version

Boundary:

> A candidate match does not confirm eligibility. Final eligibility is determined by the study team.

### 7.7 Workflow

H2:

> From case input to a reviewable result

Steps:

1. `Enter patient clues`: Structured fields or appropriately governed records.
2. `Organize the context`: AI identifies conditions that affect matching.
3. `Match the evidence`: Connect drugs, trials, and supporting evidence.
4. `Return reviewable results`: Preserve rationale, limitations, sources, and versions.

### 7.8 Role Value

H2:

> Keep every role on the same evidence trail

- `Clinical interpreters`: Find candidate matches and key limitations faster.
- `Medical reviewers`: Verify populations, rationale, and sources directly.
- `Product and engineering teams`: Bring evidence capabilities into reporting workflows through an API.

### 7.9 Workspace and API

H2:

> Search directly or integrate with your reporting system

Workspace:

- Title: `Web workspace`
- Body: `Use it for individual cases, report review, case discussions, and pre-integration validation.`
- CTA: `Open the workspace`

API:

- Title: `Structured API`
- Body: `Return matched results, evidence fields, citation relationships, and knowledge releases.`
- CTA: `View API example`

### 7.10 Trust and Proof

H2:

> Not a black box. A verifiable evidence workflow.

Body:

> Move from a match to its evidence claim and then to the original source. Every step stays reviewable.

Controls:

- Reviewed evidence enters retrieval
- Evidence packages constrain AI summaries
- Citations pass source allowlist checks
- Results preserve the knowledge release
- No-result and out-of-scope states are explicit
- Structured evidence remains available if a summary fails

### 7.11 FAQ

`Who is Evidex for?`

> Evidex is built for oncology genomic testing, clinical interpretation, and related medical teams supporting treatment opportunity matching, evidence search, report interpretation, and review.

`How does Evidex make matching more precise?`

> It organizes disease, stage, subtype, treatment line, prior therapy, genomic variants, and other clues into patient context, then compares that context with study populations and evidence conditions.

`Where does the evidence come from?`

> The evidence system brings together publications, guidelines, regulatory materials, public databases, trial registries, and meeting abstracts while preserving source, version, population, and limitations.

`Does a clinical trial match confirm eligibility?`

> No. Evidex identifies potentially relevant studies and explains the rationale. Final eligibility is determined by the study team.

`Can Evidex connect to an existing reporting system?`

> A structured API can return matches, evidence fields, citation relationships, and knowledge releases. A team demo can walk through the integration for your workflow.

`Do we need to submit patient identifiers?`

> The sample search does not require patient identifiers. For a formal integration, data scope and processing must be agreed according to the customer’s security, privacy, and compliance requirements.

`What does Early Access mean?`

> Evidex is inviting genomic testing and clinical interpretation teams to experience the complete product approach. A team demo will clarify the available data scope and integration path for each use case.

### 7.12 Bottom CTA

H2:

> Start the next report with a more complete evidence trail

Body:

> Bring a representative case and see how Evidex matches treatment opportunities with traceable rationale.

Primary CTA: `Request a team demo`

Secondary CTA: `View API example`

Barrier copy:

> No registration is required for the sample search. Demo requests do not collect patient data.

## 8. 首屏布局规格

### 8.1 桌面端

- 导航高度：72px。
- 首屏不使用 `min-height: 100vh`、`100dvh` 或内部视口最小高度。
- 首屏容器宽度：最大 1280px，左右安全边距最小 32px。
- 首屏顶部内边距：48 至 64px；底部内边距：40 至 56px。
- 主体使用 12 列网格，左侧 5 列，右侧 7 列，间距 48 至 64px。
- 左侧标题与右侧查询卡顶部视觉对齐。
- 查询卡初始高度由标题、表单和按钮决定，不为结果预留空间。
- 1440×900 视口中，导航、首屏主体和至少 40px 的能力标签带必须可见。
- 查询卡下方到下一内容之间不允许出现超过 80px 的纯空白。
- 左侧文案过短时，通过能力标签带和环境图形补充画面，不通过增加段落填空。

### 8.2 平板端

- 768px 至 1023px 可采用 5:7 双栏或单栏；查询控件必须保持可读。
- 采用单栏时，文案在上、查询卡在下，首个视口内必须看到主 CTA 和查询卡标题。
- 首屏总垂直留白不得超过内容高度的 25%。

### 8.3 移动端

- 宽度小于 768px 时改为单栏。
- 页面水平边距 20px，首屏上内边距 32 至 40px。
- H1 最多三行，不使用强制固定断行。
- CTA 可纵向排列并占满可用宽度。
- 查询卡字段为单列；结果出现后在原位置向下展开。
- 不使用固定视口高度，避免浏览器地址栏导致裁切。

## 9. 字体与排版规范

### 9.1 字体方案

- 中文标题与正文：`Noto Sans SC`，回退为 `Source Han Sans SC`、`PingFang SC`、`Microsoft YaHei`、sans-serif。
- 英文标题与正文：`Manrope`，回退为 ui-sans-serif、system-ui、sans-serif。
- API、HGVS、PMID、知识版本和数字：`JetBrains Mono`。
- Landing Page 不使用 `Merriweather` 或其他衬线字体。
- 如果引入 Noto Sans SC 影响首屏字体体积，可改为自托管可变字体并做字符子集；禁止因为加载性能回退到浏览器默认宋体。

### 9.2 字号

| 层级       | 桌面端     | 移动端     | 字重       | 行高         |
| ---------- | ---------- | ---------- | ---------- | ------------ |
| H1 中文    | 52 至 60px | 36 至 42px | 700        | 1.08 至 1.12 |
| H1 英文    | 56 至 64px | 38 至 44px | 700        | 1.02 至 1.08 |
| H2         | 38 至 46px | 30 至 36px | 650 至 700 | 1.12 至 1.2  |
| H3         | 22 至 28px | 20 至 24px | 650        | 1.25         |
| 首屏副标题 | 18 至 20px | 16 至 18px | 400 至 500 | 1.55 至 1.7  |
| 正文       | 16 至 18px | 15 至 17px | 400 至 500 | 1.6 至 1.75  |
| 标签与说明 | 12 至 14px | 12 至 14px | 550 至 650 | 1.4 至 1.55  |

标题字距：中文 H1 使用 `-0.02em`，英文 H1 使用 `-0.035em`。中文正文不使用明显负字距。

## 10. 视觉系统

### 10.1 色彩

| 用途     | 色值建议  |
| -------- | --------- |
| 页面背景 | `#F4F8FF` |
| 主文本   | `#0B1F3A` |
| 次文本   | `#52637A` |
| 主蓝     | `#175CD3` |
| 主蓝悬停 | `#134EAE` |
| 浅蓝背景 | `#EAF2FF` |
| 深蓝区块 | `#0B3975` |
| 边框     | `#B4CAE6` |
| 正向状态 | `#087A5B` |
| 警示状态 | `#9A6700` |
| 错误状态 | `#B42318` |

全页只使用蓝色作为主强调色。绿、黄、红只用于状态，不扩大为装饰色。禁止 AI 紫色渐变和高饱和霓虹。

### 10.2 毛玻璃

- 导航：白色 72% 至 82% 透明度，`backdrop-blur` 16 至 20px，1px 半透明蓝边框。
- 首屏查询卡：白色 70% 至 78% 透明度，`backdrop-blur` 24px，内高光与两层柔和蓝色阴影。
- 证据链与底部 CTA：使用同一材质家族，但改变背景深浅，不能每张卡都使用毛玻璃。
- 不支持模糊时回退为不透明 `#F8FBFF` 或白色。
- 不在滚动过程中逐帧改变大面积模糊值。

### 10.3 圆角与阴影

- 主要容器统一 20px 圆角。
- 输入框与按钮统一 10 至 12px 圆角。
- 标签使用胶囊圆角。
- 阴影以冷蓝灰为主，不使用纯黑重阴影。
- 不在同一层级混用多个无规则圆角值。

### 10.4 背景

- 首屏使用非常浅的蓝色径向光晕、细网格和低对比证据节点，不使用纯空白。
- 背景装饰不能与正文竞争，默认对比度低于正文的 20%。
- 深蓝信任区可作为页面节奏转折，但全页只出现一次大面积深色区。

## 11. 可视化与素材清单

### 11.1 必须实现的可视化

1. 首屏真实证据查询卡。
2. 患者上下文星图，展示七类患者线索汇聚与分流。
3. 多来源证据汇聚图，展示六类来源到结构化证据字段。
4. 药物与临床试验结果切换视图。
5. 四步工作流数据流。
6. 三个职业角色头像。
7. 可点击回溯的结果、证据结论和原始来源链。

### 11.2 图片素材

建议准备三至四组统一风格素材：

- 一张抽象但医学准确的分子或药物研发主题图；
- 一张临床试验协议、入组条件和地点的编辑插画；
- 三张同风格职业角色头像或半身像；
- 可选的一张知识图谱纹理，用于深蓝信任区。

素材要求：

- 优先使用原创 SVG、授权素材或生成式插画；
- 保存素材来源、授权范围和生成提示词；
- 视觉风格为清晰、克制的科学编辑插画，不使用通用“医生拿平板”图库；
- 药物图不得让用户误以为某个具体品牌药被系统推荐；
- 临床试验图不得出现虚构医院、赞助方或研究编号；
- 人物头像只表达岗位，不伪装成真实客户、医生或患者；
- 所有有信息意义的图片必须有中英文替代文本；纯装饰图使用空替代文本。

### 11.3 图形实现方式

- 数据流、节点关系和时间线优先使用语义化 DOM + SVG。
- 连接线使用 SVG path，动画使用 `stroke-dashoffset` 或沿路径移动的单个光点。
- 不引入 Three.js、WebGL 或大型图表库。
- 产品结果必须基于真实字段结构，不能只制作无法映射到产品的装饰仪表盘。

## 12. 动效规范

### 12.1 首屏

- 页面加载后，H1、副标题、CTA 按阅读顺序错开 60 至 90ms 进入。
- 查询卡延后 120ms，以 16px 纵向位移和透明度进入。
- 背景光晕做 10 至 14 秒的低速呼吸，位移不超过 16px，透明度变化不超过 12%。
- 能力标签带中的光点 8 至 12 秒完成一次路径移动，不自动横向滚动文字。

### 12.2 查询交互

- 输入框聚焦时边框、高光和标签颜色在 160 至 200ms 内过渡。
- 按钮按下提供 1px 位移反馈。
- 点击查询后，按钮文案与加载图标直接切换；结果骨架在 180 至 240ms 内展开。
- 真实结果使用布局动画向下展开，时长 280 至 380ms。
- 更换条件时旧结果在 180 至 240ms 内收起。
- 不通过固定空容器避免布局变化，允许查询卡自然增高。

### 12.3 滚动叙事

- 痛点时间线节点随滚动依次点亮，间隔 100 至 160ms。
- 患者线索节点依次汇入中心，用户悬停时突出一条路径。
- 证据来源进入视口后分批汇聚，悬停或键盘聚焦时显示字段映射。
- 药物与试验标签由用户切换，不自动轮播。
- 工作流只在首次进入时播放一次，回滚不反复闪动。
- 角色头像可在悬停时产生 2 至 4px 的轻微抬升和边框光效。

### 12.4 技术和无障碍

- 使用项目现有 `motion/react`，不新增动画库。
- 使用 Motion values、Intersection Observer 或 CSS 动画，不用 React state 驱动逐帧滚动。
- 不注册全局 `window` scroll listener 驱动动画。
- 优先动画化 transform、opacity 和颜色，不持续动画 width、height、top、left 或大面积 blur。
- 使用布局动画处理结果区高度变化。
- 所有非必要动画遵循 `prefers-reduced-motion`。
- 减少动态效果时直接展示最终状态，保留查询、标签、折叠和来源追溯能力。
- 动画不能导致焦点丢失、内容跳回或读屏顺序改变。

## 13. 交互与功能要求

### 13.1 页面锚点

- `#platform`：产品能力；
- `#workflow`：工作方式；
- `#evidence`：证据体系；
- `#integration`：接入方式；
- `#faq`：常见问题；
- `#contact`：团队演示。

删除 `#roadmap`。

### 13.2 真实查询

- 调用现有同源 `/api/v1/evidence-answer`；
- 支持 `ANSWERED`、`SUMMARY_UNAVAILABLE`、`NO_CURATED_EVIDENCE`、`OUT_OF_SCOPE` 和 HTTP 错误；
- 请求期间禁止重复提交；
- 页面不得在失败时展示预置医学答案；
- 结果的治疗关联、证据结论和来源数量从响应实时计算；
- 真实结果继续保留知识版本、来源链接和免责声明；
- 切换癌种或变异时清理旧结果；
- 中文页面和英文页面的按钮、状态、错误和可访问名称同步本地化。

### 13.3 API 示例

- 使用与真实接口一致的字段；
- 请求和响应并排或切换展示；
- 提供复制按钮、复制成功和失败反馈；
- 移动端代码块内部横向滚动，不让页面横向溢出；
- 不出现 `Get API Key`，除非真实开发者鉴权入口已经可用；
- 不展示内部接口、内部模型、数据库或运维表达。

### 13.4 团队演示

“申请团队演示”必须连接真实目标，可以是表单、日历或明确联系渠道。若没有可用目标，发布前必须由产品提供，不能在页面写“正在配置”或保留无响应按钮。

若使用表单，只收集：

- 公司名称；
- 工作邮箱；
- 联系人称呼；
- 所在岗位；
- 主要使用场景；
- 希望了解在线工作台、API 或团队试用。

演示表单不得收集患者资料或身份信息。

## 14. 对外内容与医学边界

### 14.1 推荐表达

- 治疗机会匹配；
- 药物与临床试验匹配；
- 多维患者上下文；
- 多来源循证知识；
- 候选结果；
- 匹配依据；
- 证据强度与限制；
- 可追溯、可复核；
- 决策支持。

### 14.2 禁止表达

- 最佳治疗方案；
- 最适合患者的药物；
- 保证临床试验入组；
- 替代医生或临床解读人员；
- 覆盖全部医学证据；
- 已全面上线全部能力；
- 提高患者生存率；
- 未经测量的准确率、节省时间或节省成本；
- 未经授权的客户数量、客户 Logo、用户证言或合作关系；
- 未取得的企业级安全、合规认证或 SLA。

### 14.3 内部信息不得渲染

以下内容可以存在于需求、代码注释或开发任务中，但不得出现在访客页面：

- MVP、V0.2、内部接口、内部演示链路；
- 研发规划、交付排期、正在配置、后续建设；
- 哪些功能尚未开发的内部能力表；
- 团队暂未准备好的商务或技术能力；
- 研发决策过程和项目管理说明。

## 15. 响应式、可访问性与性能

### 15.1 响应式

- 验收宽度：320、375、768、1024、1440、1920px。
- 所有布局无页面级横向滚动。
- 时间线、患者星图和证据汇聚图在移动端转换为可读的纵向结构，不能只是缩小桌面图。
- API、HGVS 和长来源标题允许局部换行或容器内滚动。
- 英文按钮预留更长宽度，桌面端按钮文本不换行。

### 15.2 可访问性

- 文本和按钮满足 WCAG AA。
- 页面只有一个可见 H1，标题层级连续。
- 键盘可完成导航、查询、结果切换、来源追溯、API 复制、FAQ 和演示申请。
- 所有交互元素具有清晰焦点状态。
- 视觉节点不能只靠颜色表达状态。
- 动态结果使用合适的 live region，不重复播报装饰动画。
- 支持浏览器放大到 200%。
- 人物、药物、试验和证据图片按信息意义设置替代文本。

### 15.3 性能

- LCP 小于 2.5 秒，INP 小于 200ms，CLS 小于 0.1。
- 首屏字体、查询卡和主视觉预留空间，避免字体切换和结果容器导致初始布局偏移。
- 首屏以外图片懒加载。
- 角色头像使用 AVIF 或 WebP，单张建议不超过 120KB。
- SVG 数据流控制节点与滤镜数量，避免主线程持续高负载。
- 大面积毛玻璃保持静态，不在滚动时持续重算模糊。
- 动画组件保持为小型 Client Component，主体内容继续由 Server Component 输出。

## 16. 国际化与 SEO

### 16.1 工程要求

- 继续使用 `next-intl` 和现有 locale message。
- 中英文共享同一组件结构，不在 JSX 中硬编码业务文案。
- 导航、CTA、查询状态、错误、FAQ、表单、替代文本、可访问名称、Meta 和 OG 全部国际化。
- 中英文修改必须在同一需求或 Pull Request 中交付。
- 语言切换尽量保留当前锚点。
- HTML `lang`、canonical 和 hreflang 与当前 locale 一致。
- 英文医学表达需要最终校对。

### 16.2 中文 SEO

页面标题：

> Evidex | AI 肿瘤药物与临床试验匹配平台

Meta Description：

> Evidex 结合多维患者线索与多来源循证知识，为肿瘤基因检测和临床解读团队匹配药物与临床试验，并提供可追溯依据。

OG 标题：

> 看见患者全貌，匹配治疗机会

OG 描述：

> AI 理解患者上下文，多来源证据支撑药物与临床试验匹配。

### 16.3 English SEO

Page title:

> Evidex | AI Drug and Clinical Trial Matching for Precision Oncology

Meta description:

> Evidex combines multidimensional patient context with multisource evidence to help oncology genomic testing and interpretation teams match drugs and clinical trials with traceable rationale.

OG title:

> See the whole patient. Match treatment opportunities.

OG description:

> AI-organized patient context and multisource evidence for drug and clinical trial matching.

## 17. 前端文件级改动建议

| 文件或模块                                                | 主要改动                                                              |
| --------------------------------------------------------- | --------------------------------------------------------------------- |
| `src/config/locale/messages/zh/pages/index.json`          | 替换为第 6 节短文案；删除状态、roadmap、idle 占位和内部进度文案       |
| `src/config/locale/messages/en/pages/index.json`          | 同步第 7 节英文文案与相同字段结构                                     |
| `src/shared/types/evidex-landing.ts`                      | 更新 locale 内容类型，移除 idle 和 roadmap 字段，增加可视化及角色字段 |
| `src/shared/components/landing/evidex-landing.tsx`        | 重构信息架构、首屏高度、动态可视化、角色区和底部 CTA                  |
| `src/shared/components/landing/landing-evidence-demo.tsx` | 删除 idle 结果容器；查询后才挂载加载与结果；增加布局动画              |
| `src/shared/components/landing/landing-reveal.tsx`        | 从整区统一淡入改为可复用的错开进入与 reduced-motion 方案              |
| `src/app/layout.tsx`                                      | 加入中文无衬线字体变量；Landing Page 停止使用衬线标题                 |
| `public/imgs/evidex/`                                     | 增加药物、临床试验和岗位头像素材及来源记录                            |
| Landing Page 测试                                         | 更新文案、首屏、idle 删除、查询状态、双语、动效降级和响应式断言       |

### 17.1 建议组件拆分

- `EvidexHero`
- `LandingEvidenceDemo`
- `CapabilityRail`
- `PainTimeline`
- `PatientContextMap`
- `EvidenceSourceFlow`
- `OpportunitySwitcher`
- `WorkflowFlow`
- `RoleAudience`
- `IntegrationShowcase`
- `EvidenceTrace`
- `LandingFaq`
- `LandingFinalCta`

不要把所有动画和区块继续堆在单一 `evidex-landing.tsx` 中。

## 18. 测试先行与开发验收

### 18.1 RED 阶段建议用例

实现前先修改或新增测试，确认以下行为在旧版页面上失败：

1. 首屏显示新中英文 H1 与副标题。
2. 首屏不再渲染“等待结构化查询”和隐私小字。
3. 查询前不存在 `result_region` 容器。
4. 点击查询后才出现加载或结果 region。
5. 页面不再渲染 roadmap 区块和公开状态标签。
6. 页面不再包含“规划中”“产品方向”“正在配置中”等访客文案。
7. 顶部 CTA 聚焦或滚动到真实查询卡。
8. 底部 CTA 指向真实团队演示入口。
9. 药物和临床试验标签可用鼠标与键盘切换。
10. `prefers-reduced-motion` 下内容直接可见且所有交互可用。

### 18.2 GREEN 与回归范围

- 用最小实现通过新增测试，再在测试保护下拆分组件。
- 现有真实证据查询 API 和 `/zh/evidence` 工作台行为保持不变。
- 保留无证据、越界、综述不可用和服务错误分支。
- 不通过硬编码营销结果让查询测试变绿。
- 中英文 locale 缺字段时应在测试中失败，而不是静默空白。

### 18.3 页面验收清单

#### 首屏

- [ ] H1 中文不超过两行，英文在 1440px 下不超过两行。
- [ ] 1440×900 下能看到能力标签带，不存在大块无意义留白。
- [ ] 初始查询卡在按钮后结束。
- [ ] 页面中不存在“等待结构化查询”和对应英文。
- [ ] 点击查询后结果直接在按钮下方出现。
- [ ] 查询失败不展示伪造医学结果。

#### 内容

- [ ] 页面不再出现独立 roadmap 区块。
- [ ] 页面不再出现“产品方向”“规划中”“正在配置”等对外表达。
- [ ] 患者精细化与多来源证据两项核心价值在首屏和后续视觉中都可识别。
- [ ] 药物、临床试验、在线工作台和 API 均被清楚展示。
- [ ] 没有虚构客户、证言、Logo、性能数字、医学效果或认证。

#### 视觉与动效

- [ ] 至少实现五类信息可视化，不再以长篇文字为主。
- [ ] 使用三个岗位头像，且不会被误解为客户证言。
- [ ] 首屏、时间线、患者线索、证据汇聚、结果切换和查询展开均有动效。
- [ ] 动效遵循统一时长和缓动，不出现无目的反复弹跳。
- [ ] reduced-motion 下完整可用。
- [ ] 中文大标题使用指定无衬线字体，不回退为宋体或衬线体。

#### 响应式与无障碍

- [ ] 320 至 1920px 无页面级横向滚动。
- [ ] 移动端可视化转为纵向可读结构。
- [ ] 键盘可操作所有控件，焦点可见。
- [ ] 查询结果、复制反馈和表单状态能够被读屏软件识别。
- [ ] 200% 放大后核心流程可使用。

#### 工程验证

- [ ] 相关 Vitest 和 Testing Library 测试通过。
- [ ] Landing Page 中英文 E2E 通过。
- [ ] 视觉回归至少覆盖 375×812、768×1024、1440×900。
- [ ] `pnpm verify` 通过。
- [ ] 页面、路由或构建配置变化后 `pnpm verify:full` 通过。

## 19. 数据分析

建议事件：

| 事件                           | 触发时机                         |
| ------------------------------ | -------------------------------- |
| `landing_query_focus`          | 首次聚焦首屏查询字段             |
| `landing_query_submit`         | 提交真实查询                     |
| `landing_query_result`         | 返回成功、无证据、越界或错误状态 |
| `landing_opportunity_switch`   | 切换药物或临床试验视图           |
| `landing_evidence_source_open` | 打开原始来源                     |
| `landing_workspace_open`       | 打开在线工作台                   |
| `landing_api_example_view`     | 查看 API 示例                    |
| `landing_api_copy`             | 复制 API 示例                    |
| `landing_demo_request_start`   | 打开团队演示申请                 |
| `landing_demo_request_submit`  | 演示申请成功                     |

分析事件不得携带患者身份、自然语言病历、自由文本临床资料、密钥或剪贴板内容。

## 20. 发布前必须确认

1. `申请团队演示` 的真实链接或表单接收方。
2. 临床试验与药物主题素材的来源、授权和替代文本。
3. 三个职业角色头像的生成或授权记录。
4. 中英文医学和产品文案的最终校对人。
5. 产品演示中可展示的数据范围和客户接入说明。
6. 页面上线前的医学、隐私和市场合规复核。

以上事项只在开发和发布流程中确认，不得以“正在配置”或“尚未完成”的形式渲染给访客。

## 21. 本次文档变更的验收说明

本次只更新需求文档，不修改页面、接口、路由、依赖或生产行为，因此不人为制造业务测试 RED。文档需要通过仓库格式检查；页面实现阶段必须按照第 18 节执行测试先行和完整验证。
