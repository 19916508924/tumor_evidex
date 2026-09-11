# Evidex V0 后端 · 验收与测试记录

日期：2026-09-09，最近更新：2026-09-10。实现依据：`docs/specs/evidex-v0-backend.md` 0.1.0。

## 目标与范围

- 用户目标：为 `NSCLC + EGFR p.L858R` 建立真实 PostgreSQL 后端、确定性证据检索、受证据约束的结构化归纳和可追溯 API。
- 本次改变：新增 Evidex 医学知识领域模型、迁移、输入规范化、评级、检索、Evidence Pack、模型输出校验、答案快照与 `POST /api/v1/evidence-answer`。
- 受影响旧功能：复用现有 PostgreSQL/Drizzle 基础，不改变聊天、鉴权、支付与 Landing Page 的既有接口。
- 外部系统：Neon PostgreSQL 与 Evolink；模型供应商仅通过服务端 adapter；默认自动测试不访问真实数据库或模型。

## 修改实现前：验收用例

| 场景           | 输入 / 前置条件                                                     | 可观察的预期结果                                          | 测试层与文件                                          |
| -------------- | ------------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------- |
| 标准输入       | `NSCLC + EGFR + SNV + p.L858R + US + zh-CN`                         | 得到唯一规范化查询                                        | 单元：`tests/unit/evidence/normalize-query.test.ts`   |
| 有限别名       | `nsclc / egfr / L858R` 等                                           | 确定性规范化为标准值，不调用模型                          | 单元：同上                                            |
| 非法输入       | 缺字段、多 biomarker、自由文本或非法 HGVS                           | `INVALID_INPUT`；API 返回 HTTP 400                        | 单元 + API 集成                                       |
| 语义越界       | 其他合法疾病、基因、变异、地区或语言                                | `OUT_OF_SCOPE`；不检索、不调用模型                        | 单元 + API 集成                                       |
| 同疾病评级     | FDA 匹配 / 成熟临床 / 有限临床或临床前                              | 分别为 1 / 3A / 4                                         | 单元：`tests/unit/evidence/grade-association.test.ts` |
| FDA 其他适应证 | FDA 有效但不覆盖 NSCLC/L858R                                        | 不能产生 Level 1                                          | 单元：同上                                            |
| 跨适应证       | 其他实体瘤、精确变异、敏感、来源 1/2/3A                             | 查询投影为 3B                                             | 单元：同上                                            |
| 禁止传播       | 合并变异组、血液肿瘤、耐药或来源 4/R1/R2                            | `UNRATED` / 不进入检索                                    | 单元 + repository 集成                                |
| 发布约束       | claim 无 PRIMARY、无模型可用 PRIMARY、FDA 无 INDICATION、未审核记录 | 发布事务失败且整体回滚                                    | PostgreSQL 集成                                       |
| 确定性检索     | 同输入、同 release 重复检索                                         | 结果分组、claim 与 ID 顺序完全一致                        | 单元 + PostgreSQL 集成                                |
| 模型合法输出   | 所有 ID 与分组均属于 Evidence Pack                                  | 接受并可缓存                                              | 单元 + API 集成                                       |
| 模型越界/失败  | 未知 ID、错误分组、无证据陈述、超时或异常                           | 丢弃模型文本，返回 `SUMMARY_UNAVAILABLE` 和完整结构化证据 | 单元 + API 集成                                       |
| 缓存           | 相同指纹/release/prompt/provider/model/locale                       | 命中快照且不再次调用模型                                  | 单元 + PostgreSQL 集成                                |
| 旧行为回归     | 既有访客页面和匿名用户接口                                          | 原冒烟与集成测试继续通过                                  | 现有 Vitest + Playwright                              |

## 数据库接入基线

- `.env.local` 保存用户提供的开发连接串并被 Git 忽略；权限设为仅当前用户可读写。
- 迁移前只读检查确认数据库为空、当前角色可以在 `public` 创建对象；正式迁移已执行。
- 迁移后 `public` 有 37 张应用表、`drizzle` 有 1 条迁移记录，三个发布不可变触发器均启用；业务表为空且无测试 schema 残留。
- 真实迁移测试必须使用可创建并清理的一次性测试 schema，不能把 mock repository 当作 SQL 证据。

## RED → GREEN 证据

- 基线检查：`pnpm dlx pnpm@10.30.3 verify`，退出码 0；9 个测试文件、40 个测试通过，显式覆盖范围满足门槛。
- 直接执行 `pnpm verify`：在测试启动前因本机 pnpm 11.19.0 与仓库要求的 10.x 不兼容而退出；后续命令使用固定的 pnpm 10.30.3。
- 领域逻辑 RED：`vitest run tests/unit/evidence/normalize-query.test.ts tests/unit/evidence/grade-association.test.ts`，2 个 suite 因实现模块尚不存在而失败；随后 Evidence Pack、输出校验和编排各自先以同样方式得到缺少实现的预期失败。
- 领域逻辑 GREEN：规范化与评级 32 个用例通过；Evidence Pack 与模型输出校验 11 个用例通过；服务编排 9 个初始用例通过，补齐缓存/失败分支后纳入最终覆盖运行。
- PostgreSQL RED：`pnpm ... test:database` 先因 migration 不存在而失败。生成 migration 后真实暴露 Neon pooler 不适合依赖会话级 `search_path` 的 schema 隔离；正式迁移后复测又捕获到测试语句可能跨连接落入 `public`。数据库测试因此从 pooler URL 确定性转换为同一 Neon 分支的直连 URL，并把远程测试超时调整为 30 秒。
- PostgreSQL GREEN：`pnpm dlx pnpm@10.30.3 test:database`，5 个用例通过；迁移从空随机 schema 完成，验证 19 张 Evidex 表、唯一约束、外键、发布版本不可变、真实检索过滤、确定性结果和快照缓存；临时 schema 已删除。测试意外写入 `public` 的唯一已知记录已在事务中精确删除，保护触发器重新启用并复核。
- API RED：`vitest run tests/integration/evidence-answer.test.ts` 因 V0 route 尚不存在而失败。
- API GREEN：初始 7 个 route/service 集成用例通过；补齐 runtime 初始化失败分支后纳入最终覆盖运行。
- 数据库命令回归：`db:generate` 曾因默认读取 `.env.development` 且运行环境没有 `npx` 而失败；改为默认 `.env.local` 和项目内 `drizzle-kit` 后，命令成功读取 37 张表并报告无待生成 schema 变化。
- 数据包 RED：先新增 `knowledge-package.test.ts` 和真实 Neon `evidex-import.test.ts`；实现前分别因校验模块、导入模块不存在而按预期失败。
- 数据包 GREEN：`v0.1.0` 包含 4 个关联、6 条 claim、5 条 FDA 记录；纯校验测试覆盖稳定 ID/外键、模型可用 PubMed PRIMARY、FDA INDICATION、审核状态、therapy key 与等级重算。真实隔离 schema 验证 dry-run 零写入、单事务发布、4 条关联可检索、同包重跑幂等、冲突回滚。
- 真实模型 RED：首次 golden case 中，Evolink 正确生成了纯 FDA 监管陈述并只引用 approval ID，但旧 Schema 强制 `evidenceIds` 非空，因此安全降级为 `SUMMARY_UNAVAILABLE`。
- 真实模型 GREEN：先补失败测试，再将契约明确为“临床陈述引用 claim；纯监管陈述可只引用 approval；两类不能同时为空”。复测返回 `ANSWERED`、4 个治疗关联，所有 ID 通过白名单校验；第二次相同查询命中数据库快照缓存。

## 交付检查

- 原始 V0 后端的 `pnpm verify` 与 `pnpm verify:full` 基线均已通过；本轮数据发布后的最终全量结果见本节末的追加验收记录。
- 新增知识包校验纳入逐文件覆盖门槛；本轮中间运行 `test:coverage` 为 17 个文件、120 个用例通过，知识包校验语句覆盖 94.7%、分支覆盖 82.45%，均超过阈值。
- Evolink：`.env.local` 已配置服务端密钥、`https://direct.evolink.ai/v1` 与固定模型 `gpt-5.6-terra`；实际模型快照为 `gpt-5.6-terra-2026-07-09`。真实医学 golden case 返回 `ANSWERED`，4 个治疗关联完整，复跑 `cached: true`。
- 正式 Neon `public` 已发布 `v0.1.0`，包哈希 `93501d3c3a0f9a4c80788f9a18a915e09f4f6a315dcbd5f93f598710849f94c4`；首次插入 45 条稳定主记录，复跑返回 `UNCHANGED` 并复用 45 条。
- 最终 `pnpm dlx pnpm@10.30.3 verify`：通过；17 个测试文件、121 个用例通过，总语句覆盖率 98.11%、分支覆盖率 94.03%。
- 最终 `pnpm dlx pnpm@10.30.3 test:database`：通过；2 个数据库测试文件、7 个真实 Neon 用例全部通过，临时 schema 均已清理。
- 生产构建与 E2E：开发目录中的 `verify:full` 按安全设计拒绝含 `.env.local` 的工作区；在排除 ENV 的当前代码临时副本中，生产构建成功并列出 `/api/v1/evidence-answer`，随后使用本机 Google Chrome 的 4 个 Playwright 冒烟用例全部通过。临时副本和 1.7 GB 临时依赖已清理。
- HTTP golden case：本地 Next 服务实测 `POST /api/v1/evidence-answer` 返回 HTTP 200、`ANSWERED`、4 个关联、release `v0.1.0`，并命中答案快照。
- 迁移恢复：向前迁移使用 Drizzle SQL；部署前备份/分支数据库，恢复优先使用 Neon 分支或数据库备份，不在共享库运行 `db:push`。
- 尚未完成但不阻塞 MVP：专业医学复核、商业使用场景的最终版权审核、Landing Page。第一批数据已根据产品负责人明确授权按快速默认审核发布。
