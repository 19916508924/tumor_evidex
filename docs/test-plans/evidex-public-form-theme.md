# Evidex 公共表单主题回归验收

## 验收范围

- 输入条件：系统配色偏好为深色，`next-themes` 以 `system` 模式为页面添加 `.dark`。
- 正常路径：Landing Page、证据问答、知识库首页及四类知识目录仍使用浅色表单；正文和占位文字对实际可见背景的对比度不低于 4.5:1，键盘聚焦时显示可见焦点环。
- 隐藏与动态字段：问答页展开后的疾病、基因、变异、药物输入框，以及回答后的反馈说明输入框均纳入验收。
- 旧行为回归：`/zh/evidence` 保持原有浅色查询控件；登录页继续使用深色主题，并保持表单可读。
- 失败条件：公共浅色页面上的任一原生表单控件被系统深色主题压成深色背景，或正文、占位文字、焦点状态不可辨识。

## 自动化方法

`tests/e2e/public-form-theme.spec.ts` 在真实 Chromium 中启用系统深色偏好，确认根节点进入 `.dark`。测试读取控件和祖先元素的最终计算背景色，按 alpha 顺序合成实际可见表面，再计算 WCAG 相对亮度与对比度；测试不依赖组件 `className` 断言。

## RED / GREEN

- RED：`pnpm dlx pnpm@10.30.3 exec playwright test tests/e2e/public-form-theme.spec.ts --config=playwright.red.config.ts`，1 项失败、1 项通过；Landing Page 癌种下拉框的实际背景亮度为 `0.0088`，低于浅色表面阈值 `0.78`。`/zh/evidence` 与登录页回归已通过。
- GREEN：同一浏览器测试在修复后 2/2 通过，覆盖 Landing 两个下拉框、Ask 主输入与 4 个条件输入和反馈输入、Knowledge 首页搜索、四类目录搜索与 4 个筛选，以及 Evidence 与登录页回归。
- 相关组件回归：`pnpm dlx pnpm@10.30.3 test --project components tests/components/evidex-landing-interactions.test.tsx tests/components/evidex-product-frontend.test.tsx tests/components/evidence-explorer.test.tsx`，3 个文件、39 项测试通过。
- 类型检查：`pnpm dlx pnpm@10.30.3 typecheck`，通过。
- 仓库验收：`pnpm dlx pnpm@10.30.3 verify`，46 个文件、380 项测试通过；语句覆盖率 97.42%，分支覆盖率 90.90%。
- 完整验收：在不携带本地 `.env` 的隔离副本中执行 `PLAYWRIGHT_CHANNEL=chrome pnpm dlx pnpm@10.30.3 verify:full`，生产构建通过，46 个文件、380 项测试通过，20 项 Chromium 端到端测试通过。

## 实现边界

- 通用 `input`、`select`、`textarea` 和 `button` 默认样式移入 Tailwind `base` layer，使页面自身的背景与文字 utility 可以正确覆盖默认值。
- `.evidex-landing-page` 与 `.evidex-product` 明确使用浅色 `color-scheme`，不改变登录页及模板页面的深色主题。
- 公共产品表单统一使用 Ink Navy 正文、`#60748D` 占位文字和蓝色可见焦点环。
