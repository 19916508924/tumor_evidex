# Evidex 桌面演示审核入口测试记录

## 目标与范围

- 从 Landing、Knowledge、Ask 与 Evidence 的公开单行导航进入“证据审核”。
- 当前面试 Demo 只支持 1024px 至 1920px 桌面浏览器；删除汉堡菜单、移动抽屉、遮罩、焦点陷阱和小屏重复导航。
- 默认不设置任何额外环境变量时，匿名用户即可使用固定 `demo-reviewer` 身份访问完整 Ops 运营中心及读取、运行控制、版本管理、草稿和审核决定接口；不使用前端伪数据。
- 保留登录会话优先、同源校验、Zod 输入、版本冲突、幂等、QA 阻断、状态机和发布事务。
- 不改变数据库结构；演示模式只能连接隔离演示数据库。

## 修改实现前：验收用例

| 场景            | 输入 / 前置条件                                     | 可观察的预期结果                                               | 测试层与文件        |
| --------------- | --------------------------------------------------- | -------------------------------------------------------------- | ------------------- |
| 公开导航        | 中文公开应用页或中英文 Landing                      | 单行导航始终显示本地化“证据审核”，链接到当前 locale 的审核队列 | 组件、单元、E2E     |
| 匿名演示        | 环境变量缺失且没有登录会话                          | 队列、详情、草稿与审核决定可用，服务端记录 `demo-reviewer`     | 接口集成、E2E       |
| 完整 Ops        | Demo 模式且无 Cookie                                | 总览、候选、Worker、发现任务和定义版本接口不因缺少会话拒绝     | 接口集成、E2E       |
| 显式关闭        | `EVIDEX_DEMO_MODE=0` 且没有登录会话                 | 匿名审核请求返回 401，Ops Layout 恢复管理员权限                | 单元、接口集成      |
| 写入保护        | 演示模式下跨站提交审核决定                          | 返回 403；合法同源写入仍经过原有 Schema 与业务门禁             | 接口集成            |
| 桌面壳          | 1024px 以上访问 Landing 与 Ops                      | 主导航不滚动、不隐藏；侧栏常驻；不存在移动菜单按钮或抽屉       | 组件、静态契约、E2E |
| Chrome 用户路径 | `/zh/knowledge` → 证据审核 → 列表 → 详情 → 退回修改 | 无需登录，页面可读；模拟网络边界记录非发布决定，不改变真实数据 | Playwright Chrome   |

## RED → GREEN 证据

- RED：`pnpm exec vitest run tests/components/evidex-product-frontend.test.tsx tests/unit/landing-content.test.ts tests/unit/evidence-platform/frontend-surface.test.ts tests/integration/evidence-platform-routes.test.ts -t "evidence|desktop operations|demo reviewer|operations route group|Chinese public application shell"`，4 项需求相关失败：缺少公开审核入口、Ops 仍有移动按钮、匿名演示列表返回 401、Ops Layout 未读取显式演示开关。
- 第二轮 RED：`pnpm exec vitest run tests/unit/evidence-platform/frontend-surface.test.ts tests/integration/evidence-platform-routes.test.ts -t "demo operator|does not tell"`，2 项需求相关失败：手工候选写入仍因无会话返回 401，Ops 错误态仍提示检查登录状态。
- 最小实现：增加默认启用、可显式关闭的演示身份和固定审核人；完整内部 API 统一身份解析；公开导航增加入口；Landing 与 Ops 删除移动菜单分支并设置 1024px 最小宽度；删除 Evidex 登录提示。
- 第一轮 GREEN：`pnpm exec vitest run tests/unit/evidence-platform/evidex-demo-mode.test.ts tests/unit/landing-content.test.ts tests/unit/evidence-platform/frontend-surface.test.ts tests/integration/evidence-platform-routes.test.ts tests/components/evidex-product-frontend.test.tsx`，5 个文件、68 个用例通过。
- 第二轮 GREEN：同一聚焦命令的 2 个目标用例通过；完整 Ops 演示身份集成用例随后通过。
- 最终需求相关回归：上述 5 个文件共 70 个用例通过；内部 API 静态契约 42 个用例通过。
- 默认免登录整改 RED：`pnpm exec vitest run tests/unit/evidence-platform/evidex-demo-mode.test.ts tests/unit/evidence-platform/frontend-surface.test.ts tests/integration/evidence-platform-routes.test.ts`，3 个文件中 7 项按预期失败：环境变量缺失时 Demo 仍关闭、匿名候选与 Ops 请求返回 401、隔离浏览器启动脚本仍注入演示变量。
- 默认免登录整改 GREEN：同一命令 3 个文件、40 个用例全部通过；环境变量缺失时完整 Ops 使用固定 `demo-reviewer`，显式 `EVIDEX_DEMO_MODE=0` 时匿名列表、详情和写入恢复 401，测试启动脚本不再注入该变量。

## 交付检查

- `pnpm verify`：通过；类型、Lint、格式、测试策略与覆盖率均通过，49 个测试文件、418 个用例全绿；总覆盖率为 statements 96.69%、branches 90.53%、functions 99.5%、lines 97.4%。
- `PLAYWRIGHT_CHANNEL=chrome pnpm verify:full`：在无 `.env*`、且启动脚本不注入 `EVIDEX_DEMO_MODE` 的全新隔离副本通过；生产构建成功，49 个测试文件、418 个 Vitest 用例和 21 个 Chrome E2E 用例全绿。
- 浏览器复核：通过；无 Demo 环境变量的隔离生产进程中，匿名 `/zh/ops` 返回 200，并从 `/zh/knowledge` 的“证据审核”导航进入队列、详情和“退回修改”动作。真实运行页也确认 `/zh/ops` 桌面侧栏常驻、没有登录入口和移动抽屉；真实演示库当时没有待审核任务，因此没有改动真实数据。
- 未覆盖范围：不验收 1024px 以下视口；不使用真实发布动作做浏览器验收。
- 兼容性与恢复：无需设置 `EVIDEX_DEMO_MODE` 即可使用默认 Demo；未来显式设为 `0` 可恢复管理员门禁；没有迁移或数据回填。
