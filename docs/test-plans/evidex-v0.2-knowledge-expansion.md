# Evidex V0.2 知识扩展测试记录

## 验收范围

- 新增疾病：`CRC`（结直肠癌）。
- 新增变异：`EGFR p.E746_A750del`、`EGFR p.T790M`、`KRAS p.G12C`、`KRAS p.G12D`。
- 保留并回归 `NSCLC + EGFR p.L858R`。
- 发布不可变知识版本 `v0.2.0`，所有新增来源、段落、FDA 记录、关联和 claim 按产品负责人指示标记为 `APPROVED`。
- 前端可读取 6 个有直接证据的疾病/变异组合；支持的实体组合即使暂无直接证据也返回 `NO_CURATED_EVIDENCE`，而非误判为非法输入。
- 已撤回的 adagrasib + cetuximab CRC 适应证不得作为当前有效 FDA 证据进入发布版本。

## 可观察场景

| 场景                              | 预期结果                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------- |
| NSCLC + EGFR p.L858R              | 旧的 4 个同疾病治疗关联保持可检索                                               |
| NSCLC + EGFR p.E746_A750del       | 返回 4 个同疾病 Level 1 关联                                                    |
| NSCLC + EGFR p.T790M              | 返回 osimertinib 同疾病 3A 关联                                                 |
| NSCLC + KRAS p.G12C               | 返回 2 个同疾病 Level 1 关联，并分组返回符合规则的 CRC 跨适应证证据             |
| CRC + KRAS p.G12C                 | 返回 sotorasib + panitumumab 同疾病 Level 1 关联及符合规则的 NSCLC 跨适应证证据 |
| CRC + KRAS p.G12D                 | 返回 panitumumab 同疾病 R1 关联，不传播耐药证据                                 |
| CRC + EGFR p.L858R                | 输入有效，但返回 `NO_CURATED_EVIDENCE`                                          |
| 未支持癌种、基因或变异            | 返回 `OUT_OF_SCOPE`，不调用模型                                                 |
| 非法结构或不匹配的 alterationType | 返回 `INVALID_INPUT`                                                            |
| 前端选项                          | 返回 2 个疾病、5 个变异和上述 6 个直接证据组合                                  |
| 模型失败                          | 返回 `SUMMARY_UNAVAILABLE`，结构化证据仍可见                                    |
| 同版本重复导入                    | 返回 `UNCHANGED`                                                                |
| 稳定记录内容冲突                  | 整个新版本导入回滚                                                              |

## RED / GREEN 证据

- 查询规范化与选项目录 RED：`./node_modules/.bin/vitest run tests/unit/evidence/normalize-query.test.ts tests/integration/evidence-options.test.ts`；10 个预期失败，分别捕获空选项目录、DEL 格式和新增疾病/基因/变异尚未支持。
- 查询规范化与选项目录 GREEN：同命令；2 个文件、26 个测试全部通过。
- 页面选择器 RED：`./node_modules/.bin/vitest run tests/components/evidence-explorer.test.tsx`；2 个预期失败，固定癌种仍 disabled 且没有 CRC 选项。
- 页面选择器 GREEN：相关单元、接口和组件组合测试共 5 个文件、49 个测试全部通过。
- 数据包校验 GREEN：`./node_modules/.bin/vitest run tests/unit/evidence/knowledge-package.test.ts`；6/6 通过。`evidex:import -- --dry-run` 返回 v0.2.0、13 associations、20 claims、9 approvals。
- 隔离数据库 GREEN：`vitest run --config vitest.database.config.ts tests/database/evidex-import.test.ts`；2/2 通过，覆盖事务发布、6 类查询结果、R1 方向、幂等和冲突回滚。

## 完整验收

- `pnpm verify`：19 个测试文件、140 个测试全部通过；整体语句覆盖 97.79%、分支 92.51%、函数 99.32%、行 98.09%。
- `pnpm verify:full`：无凭证隔离副本生产构建通过；Chrome 5/5 E2E 通过。
- Neon 正式导入：首次 `IMPORTED`，新增 61 / 复用 45 条稳定记录；同包复跑 `UNCHANGED`，复用 106 条。
- Evolink 冒烟：默认 L858R 返回 `ANSWERED`、4 个治疗关联、release `v0.2.0`。
- 真实 HTTP：选项目录返回 2 个疾病、5 个变异、6 个查询；`CRC + KRAS p.G12D` 返回 `ANSWERED`、同疾病 R1 帕尼单抗耐药关联且跨适应证为空。
- 包哈希：`95560ecf61fedae27d31e66c9fb60f9d62fd8e37d82af61c034abed878faee76`。
