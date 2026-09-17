# Evidex 问证据停滞处理验收

## 验收范围

- 输入：用户提交自然语言问题后，创建接口返回持久任务，轮询接口持续返回 `PENDING` 或 `RUNNING`。
- 正常路径：任务在合理时间内进入终态时，继续展示原有回答、无证据、需澄清、失败或摘要不可用状态。
- 慢任务路径：第一次按服务端建议时间查询，随后至少按 1、2、4、8、10 秒节奏退避；等待满 30 秒仍无终态时停止自动轮询。
- 可观察结果：页面显示“任务仍在排队”，说明后台处理可能暂时不可用，并提供“重新检查”和“停止等待”。
- 持久性：停滞不会取消或删除任务；任务编号继续保存在 URL 与本地存储中，用户离开或刷新页面后仍可恢复。
- 失败路径：网络或接口读取失败继续进入现有错误状态，不伪装成仍在处理。

## RED / GREEN

- RED：`pnpm dlx pnpm@10.30.3 test --project components tests/components/evidex-product-frontend.test.tsx`，新增回归用例失败；预期第 3 秒才发生第二次状态查询，实际第 2 秒已发出，调用次数为 3 而不是 2，证明页面固定每秒轮询。
- GREEN：`pnpm dlx pnpm@10.30.3 test --project components tests/components/evidex-product-frontend.test.tsx -t "backs off polling"`，新增用例 1/1 通过。
- 组件回归：`pnpm dlx pnpm@10.30.3 test --project components tests/components/evidex-product-frontend.test.tsx`，25/25 通过。
- 仓库验收：`pnpm dlx pnpm@10.30.3 verify`，48 个文件、396 项测试通过；语句覆盖率 96.82%，分支覆盖率 90.97%。
- 完整验收：在不携带本地 `.env` 的隔离副本中执行 `pnpm dlx pnpm@10.30.3 verify:full`，生产构建通过，48 个文件、396 项测试通过，Chromium 端到端测试 20/20 通过。

## 运行环境核查

- 真实 Neon Worker Health 为 `STALE`，`liveWorkerCount=0`，队列中有 1 个等待任务；这是复现任务长期停在 `PENDING` 的直接原因。
- 本地可使用 `pnpm dev:full` 同时启动 Web 与 Worker；生产环境仍必须以相同源码版本和 `DATABASE_URL` 常驻运行至少一个 `pnpm evidex:worker`。
- 旧任务保留修复前的问题解析结果；Worker 恢复后应重新提交问题以创建新任务。

## 实现边界

- 客户端只使用公开问答接口返回的 `pollAfterMs`，不调用内部 Worker 健康接口，也不向公众暴露运维细节。
- “重新检查”只恢复读取同一持久任务，不创建重复任务；`FAILED` 和 `SUMMARY_UNAVAILABLE` 仍使用既有重试契约。
- 用户主动停止等待后，后续计时不会再触发额外状态请求。
