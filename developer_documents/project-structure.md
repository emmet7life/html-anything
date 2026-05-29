# 项目结构

`html-anything` 是一个 pnpm monorepo，核心功能是把任意格式内容（Markdown、CSV、PPTX 等）转换成 HTML，支持 AI Agent 辅助转换、多平台导出、离线草稿与历史管理。

## 顶层目录

| 路径 | 说明 |
|---|---|
| `package.json` | workspace 根，包管理器 `pnpm@10`，直接依赖 `tsx` 和 `playwright` |
| `pnpm-workspace.yaml` | 声明两个子包：`e2e`、`next` |
| `scripts/guard.ts` | workspace 结构守卫脚本，确保目录和文件约束不被破坏 |
| `.github/workflows/` | CI 配置 |
| `docs/` | 项目文档、截图（`screenshots/`）、PR 资源（`pr-assets/`） |
| `developer_documents/` | 本地开发环境文档 |
| `output/` | 各类输出产物（PPT、社交卡片等） |
| `.gstack/` | gstack 工具链内部数据 |

## 子包：`next/`（主应用）

技术栈：Next.js 16 + React 19 + TypeScript + Tailwind CSS 4 + Zustand + Vitest

### `next/src/app/`

Next.js App Router 入口。单页面应用，包含：

- `page.tsx` / `layout.tsx` — 主页面与根布局
- `globals.css` — 全局样式
- `api/` — API 路由，按功能分目录：
  - `agents/` — AI Agent 调用
  - `convert/` — 格式转换
  - `deploy/` — 部署操作
  - `draft/` — 草稿存取
  - `marketplace/` — 市场/技能商店
  - `templates/` — 模板管理
  - `vendor/` — 第三方集成

### `next/src/components/`（20 个 React 组件）

| 分类 | 组件 | 职责 |
|---|---|---|
| 编辑 | `editor-pane.tsx` | 主编辑面板 |
| | `preview-pane.tsx` | 实时预览 |
| | `ai-prompt-bar.tsx` | AI 提示输入栏 |
| 导出 | `export-menu.tsx` | 导出菜单 |
| | `formats-gallery.tsx` | 导出格式画廊 |
| | `convert-chip.tsx` | 格式转换状态标签 |
| 管理 | `drafts-menu.tsx` | 草稿列表 |
| | `history-pane.tsx` | 历史记录面板 |
| | `tasks-sidebar.tsx` | 任务侧栏 |
| | `template-picker.tsx` | 模板选择器 |
| 控制 | `toolbar.tsx` | 顶部工具栏 |
| | `settings-modal.tsx` | 设置弹窗 |
| | `deploy-control.tsx` | 部署控制 |
| | `layout-mode-toggle.tsx` | 布局模式切换 |
| 内容 | `deck-viewer.tsx` | Deck 视图 |
| | `samples-gallery.tsx` | 示例画廊 |
| | `welcome-modal.tsx` | 欢迎引导弹窗 |

### `next/src/lib/`（核心逻辑）

| 模块 | 职责 |
|---|---|
| `agents/` | Agent 检测（`detect.ts`）、参数组装（`argv.ts`）、调用执行（`invoke.ts`） |
| `deploy/` | Vercel 部署配置（`config.ts`）和部署后 URL 检测（`url-check.ts`） |
| `export/` | 导出目标：Bilibili、Bluesky、Mastodon、知乎、微信、Notion、Remotion、Markdown 往返、图片、剪贴板、下载、deck |
| `drafts.ts` | 草稿存取 |
| `deck.ts` | Deck 模式状态 |
| `history/` | 基于 IndexedDB 的历史记录（`db.ts`）及去重判断（`is-current.ts`） |
| `parsers/` | 自动格式检测（`auto.ts`）和文件解析（`file.ts`） |
| `skills/` | 技能注册表（`registry.ts`）、安装器（`install.ts`）、路径解析（`paths.ts`） |
| `templates/` | 模板加载（`loader.ts`）、场景匹配（`scenarios.ts`）、共享逻辑（`shared.ts`） |
| `store.ts` | Zustand 全局状态 |
| `extract-html.ts` | HTML 内容提取 |
| `hyperframes.ts` | Hyperframes 协议支持 |
| `i18n.ts` | 国际化 |

### Hooks

| Hook | 职责 |
|---|---|
| `use-autosave.ts` | 自动保存 |
| `use-convert.ts` | 格式转换流程 |
| `use-deploy.ts` | 部署流程 |
| `use-draft.ts` | 草稿操作 |
| `use-upload.ts` | 文件上传 |

### 测试覆盖

- `lib/__tests__/extract-html.test.ts`
- `lib/history/db.test.ts`、`lib/history/is-current.test.ts`
- `lib/skills/__tests__/`
- `lib/templates/__tests__/`
- `components/deck-viewer.test.tsx`

Vitest 搭配 `happy-dom` 和 `fake-indexeddb` 提供浏览器模拟。

## 子包：`e2e/`（端到端测试）

- Playwright + TypeScript，独立 `tsconfig.json`
- 用例放在 `ui/` 下：`deploy-control.spec.ts`、`export-menu.test.ts`
- `scripts/playwright.ts` — Playwright 辅助脚本（清理等）

## 架构约束

1. 顶层只放 workspace 元数据和 CI，不放业务源码
2. `next/` 拥有完整的 Next.js 应用（路由、组件、库、测试、配置）
3. `e2e/` 拥有全部浏览器级测试，不可在 `next/` 下添加 Playwright 用例
4. 跨包命令必须通过 pnpm workspace filter（`-F`）调用，不要在根 `package.json` 代理子包脚本
