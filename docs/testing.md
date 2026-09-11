# Evidex 自动化测试指南

## 开发流程与完成标准

每次改动从 [AGENTS.md](../AGENTS.md) 和 [测试记录模板](./test-plan-template.md) 开始。需求用例先于实现，Bug 回归用例先于修复。先运行用例验证预期失败，再完成最小实现并回归。仅框架尚未安装导致的报错不算 RED。

每轮实现变动先跑受影响用例；交付前跑 `pnpm verify`。页面、路由、鉴权、依赖、构建配置变化，交付前再跑 `pnpm verify:full`。任一失败都要调查，不得通过跳过测试或关闭检查来交付。

## 分层架构

| 层级 | 位置 / 工具                                  | 应当验证                                   | 隔离边界                                    |
| ---- | -------------------------------------------- | ------------------------------------------ | ------------------------------------------- |
| 单元 | `tests/unit` / Vitest Node                   | 纯逻辑、输入边界、限流、返回协议、质量策略 | 固定时间、独立状态、无真实服务              |
| 组件 | `tests/components` / Testing Library + jsdom | 可访问名称、键盘、点击、禁用与错误状态     | 清理 DOM，按需声明 HTTP fixture             |
| 集成 | `tests/integration` / Vitest Node            | 路由与响应/服务组合、授权、失败处理        | mock 数据库/会话/外部服务边界，保留被测路由 |
| E2E  | `tests/e2e` / Playwright Chromium            | 生产构建上的页面、语言、重定向与 HTTP 协议 | 测试配置、浏览器独立上下文、无生产凭证      |

异步 Server Component 不依赖 jsdom 验证，用真实 Next.js 的集成/E2E 测试覆盖。[Next.js Vitest 指南](https://nextjs.org/docs/app/guides/testing/vitest) · [Playwright 指南](https://nextjs.org/docs/app/guides/testing/playwright)

新增支付/额度/回调需求时增加幂等和重复请求用例；新增鉴权需求覆盖未登录、非管理员及跨用户访问；新增数据库功能使用一次性测试库，验证约束、迁移和事务回滚。当前接口集成测试没有运行真实数据库，不能作为 SQL 正确性的证据。

## 命令

| 命令                                         | 用途                                                   |
| -------------------------------------------- | ------------------------------------------------------ |
| `pnpm test`                                  | 一次运行所有单元、组件、接口集成测试                   |
| `pnpm test:watch`                            | 持续反馈，开发 RED/GREEN 循环                          |
| `pnpm test -- tests/unit/rate-limit.test.ts` | 单文件回归                                             |
| `pnpm test:coverage`                         | 测试与逐文件覆盖率门槛，生成 HTML/LCOV                 |
| `pnpm typecheck`                             | 生成路由类型并检查 TypeScript（包含 Next.js 路由约束） |
| `pnpm lint`                                  | 静态检查质量门槛                                       |
| `pnpm format:changed`                        | 只检查本次差异的格式，不重排整份模板                   |
| `pnpm test:policy`                           | 业务源码变化是否附带可执行测试变化                     |
| `pnpm verify`                                | 上述快速质量门槛（无浏览器与真实外部服务）             |
| `pnpm build:test`                            | 无业务凭证的生产构建                                   |
| `pnpm test:e2e`                              | 先构建，再启动专用服务并运行浏览器测试                 |
| `pnpm test:e2e:run`                          | 仅对已完成的测试构建运行浏览器测试                     |
| `pnpm verify:full`                           | 快速门槛 + 构建 + 浏览器测试                           |
| `pnpm exec playwright show-report`           | 查看浏览器测试报告                                     |

首次安装：`pnpm install --frozen-lockfile` 和 `pnpm exec playwright install chromium`。Linux CI 使用 `--with-deps chromium`。Node 24 与 pnpm 10.30.3 在本地、CI、Docker 中统一。

## 隔离与稳定性

- `tests/setup/node.ts` 通过 MSW 拦截 HTTP，未声明请求直接报错。需模拟接口时导入 `server`，使用 `server.use(http.get(...))` 定义 fixture；每个测试后自动清理。
- HTTP 拦截不覆盖数据库 TCP 连接。接口测试必须替换数据库/会话边界；真实数据库测试必须单独配置一次性测试库，不能读取开发/生产连接。
- 时间相关逻辑使用 fake timers，每个测试后恢复。组件测试自动清理 DOM 和 mock；不使用任意时长 sleep，用 Testing Library / Playwright 的等待断言。
- `scripts/test-app.mjs` 只传入系统运行所需环境变量和测试配置，不继承支付/AI/数据库凭证。因为 Next.js 会自动读取环境文件，检测到 `.env`、`.env.local`、`.env.production` 或 `.env.production.local` 时拒绝 E2E 构建/启动。
- 正常开发可用 `.env.local`；完整测试应在包含本次所有改动的干净测试工作区或 CI 运行。不要删除自己的开发密钥，也不要对落后于当前修改的旧提交报告通过。单元测试与 `pnpm verify` 可在正常开发目录运行。
- 浏览器连接 `localhost:3100` 上由 Playwright 启动的 standalone 生产服务，禁止复用未知已有服务。构建、服务和浏览器统一主机名，避免国际化中间件发生代理循环。端口冲突时结束自己启动的旧测试服务后重试。
- 默认不重试失败测试，让不稳定用例直接暴露。失败保存 trace、截图、视频；不自动更新快照接受变化。
- 构建使用模板已有的 Google Fonts，首次生产构建需要网络下载字体；网络失败属于构建阻塞，不能伪报测试通过，也不能关闭构建检查。

## 覆盖率与当前范围

`vitest.config.ts` 显式列出初始受保护模块：限流、响应格式、按钮、用户信息路由、测试策略和遗留诊断匹配规则。每个文件要求语句/行/函数 ≥90%，分支 ≥80%。报告位于 `coverage/index.html`。

新/改业务模块应同步加入覆盖范围。无法单测的异步页面、外部集成等使用集成/E2E 并在测试记录中说明。不要只测最容易的文件来抬高数字。

当前范围不包括完整登录注册、支付扣费、真实数据库、邮件发送、文件存储或真实 AI 生成。浏览器冒烟验证英文首页到定价页的导航、中文首页、访客保护页跳转和匿名用户接口。覆盖率是显式受保护文件的数字，不能称为全项目覆盖率。

## CI 与执行约束

`Quality Gate` 对 PR、main/dev 推送及手动运行执行完整检查。Docker 发布作为依赖 `verify` 的后续工作，只在推送且检查成功后执行；PR 不发布镜像。

`QUALITY_BASE` 指定检查差异的 Git 基准。PR 使用合并基点，推送使用之前的提交，首次推送新分支/手动运行检查最近一次提交，无父提交时才使用空树。本地默认比较 `origin/main` 的合并基点，并包含暂存、未暂存及未跟踪文件。显式传入无效基准会失败，不会悄悄跳过。

`test:policy` 检查 `src` 中 JS/TS 实现变化（含删除）是否伴随 `tests` 中新增或修改的 `.test.*` / `.spec.*`。删除测试或修改 fixture 不算回归测试。这只能防止完全漏写测试，不能证明用例相关性、质量或编写顺序，仍须审查验收场景与 RED/GREEN 证据。

ESLint 禁止提交测试的 `.only`、`.skip` 和 `.todo`；测试框架禁止仅运行聚焦用例。不得通过修改工作流、门槛或断言规避检查。

工作流配置随代码提交后生效；若要阻止未通过的 PR 合并，仓库管理员还需设置 `Quality Gate / verify` 为必需检查。分支保护未由本次本地改动开启。

## 模板遗留问题基线

首次全量 ESLint 扫描发现 **48 个未修改的上游文件中共有 43 个 error、45 个 warning**，主要涉及 Hooks 调用顺序、effect 内同步 setState、effect 依赖、动态组件和图片可访问性。这些问题没有在本次测试架构工作中被修复，也不表示没有运行风险。

`.quality/eslint-baseline.json` 记录原文件内容哈希和逐条诊断指纹。`pnpm lint` 仍扫描全仓：只有源码逐字未变、诊断完全相同的遗留项才计入已知问题；任何新增诊断会失败，**修改遗留文件后，其全部旧问题也必须修复**。不会按目录或规则关闭检查，也不会自动扩大基线。`pnpm lint:strict` 可查看全部未解决诊断，当前会因这些已知问题失败。

后续需求触及这些文件时，先为待改行为补回归测试，再清理该文件的诊断；修复完成后可删除对应基线条目。不得重新生成基线来吸收新错误。测试策略与基线匹配器自身也有单元测试。类型配置另有回归测试，防止把 `.next/types/validator.ts` 从 TypeScript 程序中误排除。

上游依赖还存在 Fumadocs / next-intl 对 Next 16、react-copy-to-clipboard 对 React 19、部分 AI SDK 对 Zod 的 peer 声明不匹配。保留现有锁定的生产依赖，本次不进行无关升级；当前构建和已覆盖路径的通过不能替代这些库全部功能的兼容性验证。

本地若已安装 Google Chrome，可用 `PLAYWRIGHT_CHANNEL=chrome pnpm test:e2e` 运行隔离浏览器测试，避免首次下载；不会使用个人浏览器配置。CI 默认安装 Playwright 对应的 Chromium。
