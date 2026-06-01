# 项目结构

`html-anything` 是一个 pnpm monorepo，核心功能是把任意格式内容（Markdown、CSV、PPTX、图片、HTML 等）交给本地 AI Agent 转换成可预览、可导出、可部署的 HTML。当前仓库把公开 harness、Next 应用、浏览器级测试和开发文档分开管理。

## 顶层目录

| 路径 | 说明 |
|---|---|
| `package.json` | workspace 根，包管理器 `pnpm@10`，只承载根级工具依赖；不要在这里代理子包脚本 |
| `pnpm-workspace.yaml` | 声明两个子包：`next`、`e2e` |
| `scripts/guard.ts` | workspace 结构守卫脚本，检查目录边界、脚本、CI 和测试放置规则 |
| `.github/workflows/ci.yml` | CI：guard、Next typecheck/test/build、e2e typecheck、Playwright Chromium、e2e smoke |
| `developer_documents/` | 面向开发者的架构、流程、启动和环境说明 |
| `docs/` | 项目展示文档、截图、PR 资源和静态说明页 |
| `next/` | 完整 Next 应用：路由、组件、库、配置、public 资源、单元测试 |
| `e2e/` | Playwright 浏览器级测试包，是 UI e2e 的唯一来源 |
| `output/` | 本地生成产物和示例输出，不属于应用源码边界 |

工具运行时可能生成未跟踪目录（例如 `.claude-flow/`、`.omx/`）。它们不是公开 harness 的结构约束，也不应作为应用源码或测试入口使用。

## 子包：`next/`（主应用）

技术栈：Next.js 16 + React 19 + TypeScript + Tailwind CSS 4 + Zustand + Vitest。

`next/` 内部的关键配置：

| 路径 | 说明 |
|---|---|
| `next.config.ts` | Next 配置，目前包含 dev origin allowlist |
| `postcss.config.mjs` | Tailwind CSS 4 / PostCSS 配置 |
| `vitest.config.ts` | Vitest 配置，使用 `happy-dom`，测试匹配 `src/**/*.{test,spec}.{ts,tsx}` |
| `public/` | Next 默认静态 SVG 资源 |

### `next/src/app/`

Next.js App Router 入口。主界面是单页面工作台：

- `page.tsx`：组装 toolbar、任务侧栏、编辑器、预览、历史面板、欢迎弹窗和设置弹窗。
- `layout.tsx`：根布局。
- `globals.css`：全局样式和设计变量。
- `api/`：Node.js runtime API 路由，当前均显式使用 dynamic 行为。

当前 API 路由：

| 路由 | 职责 |
|---|---|
| `GET /api/agents` | 检测本机可用 agent CLI 和模型选项 |
| `POST /api/convert` | 组装模板 prompt，调用 agent，SSE 流式返回 HTML、日志和统计信息 |
| `POST /api/draft` | 调用 agent 生成 Markdown 草稿，SSE 流式追加到编辑器输入 |
| `POST /api/deploy` | 发布当前 HTML，目前主要走 Vercel 部署流程 |
| `GET/PUT/DELETE /api/deploy/config` | 管理部署 provider 配置；token 只以 mask 形式返回给客户端 |
| `GET /api/templates` | 返回模板/技能元数据列表 |
| `GET /api/templates/[id]/example` | 返回某个模板的示例输入和预渲染 HTML bundle |
| `GET /api/templates/[id]/preview` | 直接返回某个模板的 `example.html`，供 iframe 缩略图加载 |
| `GET /api/marketplace` | 列出已安装的用户技能包 |
| `POST /api/marketplace/install` | 从 GitHub 安装技能包，并刷新模板缓存 |
| `DELETE /api/marketplace/packages/[id]` | 卸载用户技能包，并刷新模板缓存 |
| `GET /api/vendor/pptxgenjs` | 从 `node_modules` 暴露 `pptxgenjs` 浏览器 bundle，供 deck 导出 PPTX 使用 |

Marketplace 路由带有本地 Host header guard，默认只接受 loopback host；可通过 `HTML_ANYTHING_ALLOWED_HOSTS` 或 `HTML_ANYTHING_ALLOW_ANY_HOST=1` 调整。

### `next/src/components/`（17 个 React 组件）

| 分类 | 组件 | 职责 |
|---|---|---|
| 工作台 | `toolbar.tsx` | 顶部工具栏：agent、模板、导出、设置、部署入口 |
| | `tasks-sidebar.tsx` | 多任务列表、创建、切换、重命名、复制、删除 |
| 编辑 | `editor-pane.tsx` | 主输入区、格式/示例 tab、上传、自动保存状态 |
| | `ai-prompt-bar.tsx` | 通过 `/api/draft` 生成并追加 Markdown 草稿 |
| | `drafts-menu.tsx` | localStorage 草稿快照恢复/删除 |
| 转换 | `convert-chip.tsx` | 生成 HTML 按钮状态、快捷键触发、取消转换 |
| | `formats-gallery.tsx` | 内置输入格式示例和格式筛选 |
| 预览 | `preview-pane.tsx` | iframe 预览、源码/日志/指标 tab、版本切换、全屏 |
| | `deck-viewer.tsx` | Deck HTML 解析、幻灯片翻页、演讲者备注、全屏 |
| 导出/部署 | `export-menu.tsx` | 平台复制、HTML/图片下载、deck 导出、Remotion zip |
| | `deploy-control.tsx` | 一键部署、部署历史、可达性状态、复制/打开 URL |
| 管理 | `history-pane.tsx` | IndexedDB 版本历史、备注、对比、恢复、删除 |
| 设置/模板 | `settings-modal.tsx` | agent path/model、部署配置、marketplace 管理、语言设置 |
| | `template-picker.tsx` | 模板/技能选择和筛选 |
| | `samples-gallery.tsx` | 可预览模板示例，iframe 加载 `/api/templates/[id]/preview` |
| 布局/引导 | `layout-mode-toggle.tsx` | editor/split/preview 布局切换 |
| | `welcome-modal.tsx` | 首次进入引导和 agent 检测提示 |

### `next/src/lib/`

| 模块 | 职责 |
|---|---|
| `store.ts` | Zustand 全局状态；persist 到 localStorage，管理任务、agent、布局、部署历史和迁移 |
| `use-convert.ts` | 客户端转换流程：格式摘要、asset placeholder 还原、diff-edit payload、SSE 解析、HTML 写入 |
| `use-draft.ts` | 客户端草稿生成流程：调用 `/api/draft`，SSE delta 追加到输入内容 |
| `use-deploy.ts` | 调用 `/api/deploy`，维护部署状态并写入任务部署历史 |
| `use-autosave.ts` | 自动保存 UI 状态和草稿快照 |
| `use-upload.ts` | 文件上传/粘贴解析，图片以 `asset:<id>` 占位并存入任务 assets |
| `agents/` | agent CLI 检测、参数组装、子进程调用与事件抽取 |
| `deploy/` | 部署配置读写、Vercel API 调用、部署 URL 可达性检测 |
| `export/` | 微信、知乎、Bilibili、Bluesky、Mastodon、Notion、Remotion、Markdown roundtrip、图片、deck、下载、剪贴板导出 |
| `history/` | IndexedDB 版本历史，保存转换 run、备注、对比和当前版本判断 |
| `parsers/` | 输入格式自动检测和文件解析 |
| `skills/` | 用户技能包安装、校验、路径、manifest 和 registry |
| `templates/` | 文件系统模板加载、客户端模板缓存、场景分类、prompt 组装共享逻辑 |
| `deck.ts` | Deck HTML 解析和 deck 模式判断 |
| `drafts.ts` | 独立 localStorage 草稿历史；避免依赖 Zustand store 是否损坏 |
| `extract-html.ts` | 从 agent 输出中提取可渲染 HTML |
| `hyperframes.ts` | Hyperframes 解析和 Remotion 导出数据支持 |
| `i18n.ts` | 中英文内置字典、locale 类型和翻译函数 |

## 模板与技能系统

模板已经从硬编码数组迁移为文件系统技能注册表：

```text
next/src/lib/templates/skills/<id>/
  SKILL.md       # frontmatter + prompt body
  example.md     # 可选：示例输入
  example.html   # 可选：预渲染预览
```

当前内置模板目录数量为 75 个，并且 75 个都带 `example.html`。其中 26 个还带 `example.md`。新增内置模板通常只需要新增一个目录和 `SKILL.md`，可选补充示例文件；`/api/templates` 会重新扫描并向客户端返回元数据。

用户通过 marketplace 安装的技能写入：

```text
~/.html-anything/skills/<owner>__<repo>/
  package.json
  skills/<original-id>/SKILL.md
```

运行时会把用户技能用 `pkg-<owner>__<repo>--<original-id>` 命名空间合并进同一模板注册表，避免与内置模板冲突。测试可用 `HTML_ANYTHING_USER_SKILLS_DIR` 改写用户技能目录。

## 状态、存储与转换数据流

- 轻量工作台状态由 `store.ts` 使用 Zustand persist 存入 localStorage，包括任务列表、active task、agent/model 选择、布局、欢迎状态和每个任务最近 5 条部署记录。
- 草稿历史由 `drafts.ts` 独立存入 localStorage，最多保存固定数量快照，避免和主 Zustand store 互相污染。
- 转换版本历史由 IndexedDB 保存，位于 `history/db.ts`；这样可以保存较大的 HTML、统计和备注，不占用 localStorage 的 UTF-16 存储空间。
- 点击“生成 HTML”后，`convert-chip.tsx` 调用 `useConvert()`；hook 会整理格式摘要、模型、agent bin override、diff-edit payload，再 POST 到 `/api/convert`。
- `/api/convert` 读取模板 body，组装 prompt，调用本地 agent 子进程；前端按 SSE event 处理 `start`、`delta`、`html`、`meta`、`error`、`done` 并实时刷新预览。
- `ai-prompt-bar.tsx` 调用 `useDraft()`，POST 到 `/api/draft`，把 agent 生成的 Markdown delta 追加回当前任务输入内容。

## 子包：`e2e/`（端到端测试）

`e2e/` 是 Playwright + TypeScript 独立包，浏览器级测试只能放这里，不能放到 `next/`。

| 路径 | 说明 |
|---|---|
| `playwright.config.ts` | `testDir: "./ui"`；自动 build 并启动 `@html-anything/next`，默认端口 `3317` |
| `ui/` | 扁平 Playwright UI 用例目录 |
| `scripts/playwright.ts` | Playwright 辅助命令，例如清理报告产物 |
| `AGENTS.md` | e2e 专属约束：新增 UI 用例应使用扁平 `*.test.ts` |

当前 UI 用例：

- `ui/export-menu.test.ts`
- `ui/deploy-control.spec.ts`

注意：`e2e/AGENTS.md` 规定新增 UI 用例应命名为 `*.test.ts`。现有 `.spec.ts` 是当前历史状态，不代表新增推荐命名。

## 测试覆盖

Next 单元测试通过 Vitest 运行，环境是 `happy-dom`，并在需要时使用 `fake-indexeddb`：

- `components/deck-viewer.test.tsx`
- `lib/__tests__/extract-html.test.ts`
- `lib/export/__tests__/`
- `lib/history/db.test.ts`
- `lib/history/is-current.test.ts`
- `lib/skills/__tests__/`
- `lib/templates/__tests__/`
- `app/api/marketplace/_lib/__tests__/host-guard.test.ts`

E2E 测试通过 `@html-anything/e2e` 包运行，报告输出在 `e2e/ui/reports/` 下并由 `.gitignore` 排除。

## 常用命令

从仓库根目录运行：

```bash
pnpm install --frozen-lockfile
pnpm exec tsx scripts/guard.ts
pnpm -F @html-anything/next dev
pnpm -F @html-anything/next typecheck
pnpm -F @html-anything/next test
pnpm -F @html-anything/next build
pnpm -F @html-anything/e2e typecheck
pnpm -F @html-anything/e2e test
```

## 架构约束

1. 顶层是 public harness 边界，只放 workspace 元数据、CI、guard 脚本和文档，不放业务源码。
2. `next/` 拥有完整 Next 应用：App Router、API routes、React components、app libraries、config、public assets、unit tests。
3. `e2e/` 拥有全部浏览器级测试；不要在 `next/` 下新增 Playwright 用例。
4. 根 `package.json` 不代理 app/e2e 脚本；跨包命令用 pnpm workspace filter（`-F`）。
5. 新增模板优先走 `next/src/lib/templates/skills/<id>/SKILL.md` 文件系统注册表，不要重新引入硬编码模板数组。
6. 大 HTML 历史写 IndexedDB，轻量 UI 状态才放 localStorage。
