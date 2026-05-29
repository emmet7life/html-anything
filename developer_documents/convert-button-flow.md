# 「生成HTML」按钮执行链路

点击编辑区与预览区之间的浮动「⚡ 生成 HTML」按钮（`ConvertChip`）后，从前端到后端再到 AI Agent 的完整数据流。

## 总体流程

```
ConvertChip (onClick)
  → useConvert.run()
    → 状态初始化 (running / 清空旧输出)
    → 内容预处理 (asset 内联 / 格式检测摘要 / diff-edit 判断)
    → POST /api/convert (SSE)
      → loadSkill(templateId) 加载模板
      → assemblePrompt() 或 buildEditPrompt() 组装 prompt
      → invokeAgent() spawn 子进程
        → resolveBinForAgent() 解析二进制路径
        → buildArgv() 构建命令行参数
        → spawn(bin, argv) 启动 AI CLI
        → stdout 逐行解析 → ReadableStream<InvokeEvent>
      → 转为 SSE 流返回前端
    → 前端逐事件处理 (start/delta/html/meta/done/error)
    → PreviewPane iframe 实时渲染
```

## 1. 按钮触发 — `ConvertChip`

文件：`next/src/components/convert-chip.tsx`

- 浮动 Chip，仅在 split 布局模式下显示
- 点击调用 `useConvert().run(taskId, agent, templateId, content, format, model)`
- 全局快捷键 `⌘/Ctrl+Enter` 触发同一逻辑
- 运行中再次点击变为停止按钮

## 2. `useConvert.run()` — 前端编排

文件：`next/src/lib/use-convert.ts`

### 状态初始化
- 任务状态 → `running`
- 清空上一次的 HTML、日志、统计数据
- 记录 `startedAt`

### 内容预处理
- **Asset 内联**：将编辑区的 `asset:<id>` 占位符还原为真实的 `data:image/...` URL
- **格式检测与摘要**：调用 `summarizeForAgent()`（`next/src/lib/parsers/auto.ts`）
  - CSV/TSV → 解析表头、行数、前 20 行 JSON 预览
  - 其他格式 → 直接透传原始内容
- **Diff-edit 判断**：如果该任务之前已生成过 HTML 且内容有变化，附加 `editFromHtml` + `editFromContent`，请求服务端做最小化差异修改

### POST `/api/convert`
- 请求体：`{ agent, templateId, content, format, model, binOverride?, editFromHtml?, editFromContent? }`
- 响应为 SSE 流，逐事件解析：
  - `start` — agent 进程已启动（argv、prompt 字节数）
  - `delta` — 流式 HTML 片段，`store.appendHtmlFor()` 累积
  - `html` — agent 用了 Write 工具，从工具调用中抢救的完整 HTML（替换而非追加）
  - `meta` — 模型、用时、费用、token 用量
  - `stderr` / `raw` — 调试日志
  - `done` — agent 进程退出
  - `error` — 异常

## 3. 服务端 `POST /api/convert`

文件：`next/src/app/api/convert/route.ts`

### 加载模板
`loadSkill(templateId)` 取出模板定义：`zhName`、`aspectHint`、`body`。

### 组装 Prompt

**Diff-edit 模式**：`buildEditPrompt()` 生成专门 prompt，要求 agent 只改内容差异部分，严禁改动设计。

**全量生成模式**：`assemblePrompt()`（`next/src/lib/templates/shared.ts`）拼接三部分：
1. `SHARED_DESIGN_DIRECTIVES` — 全局设计指令：
   - 内容驱动数量（模板不定义页数，由用户内容长度决定）
   - 禁止使用 Write/Edit/Bash 等文件工具
   - CDN 引用规则（Tailwind、Google Fonts、jsdelivr）
   - 排版/配色/网格/动效/无障碍标准
   - 内容真实性要求
2. 模板的 `body` — 该模板专属的版面/风格/组件库
3. 用户内容尾部（含格式标注）

### 调用 Agent
`invokeAgent()` → 返回 `ReadableStream<InvokeEvent>` → 转为 SSE 流。

## 4. `invokeAgent()` — 启动 AI Agent 子进程

文件：`next/src/lib/agents/invoke.ts`

### 二进制路径解析（优先级）
1. 用户在 Settings 设的绝对路径
2. 环境变量（如 `CLAUDE_BIN`、`CODEX_BIN`）
3. PATH 扫描 + 扩展目录（`~/.local/bin`、npm 全局目录、Scoop shims 等）

### 协议适配

| 协议 | prompt 传递方式 | 典型 agent |
|---|---|---|
| `stdin` | 管道喂入子进程 stdin | Claude Code、Codex、Gemini、Copilot 等 |
| `argv` | 命令行最后的位置参数 | DeepSeek |
| `argv-message` | `--message <text>` 标志 | OpenClaw |
| `acp` / `pi-rpc` | 不支持，直接报错 | Hermes、Kimi、Pi 等 |

### 输出解析
stdout 逐行解析（`makeParser()`），产出 `delta`、`html`、`meta` 等事件。OpenClaw 特殊处理：等进程关闭后一次性解析完整 JSON。

## 5. 前端实时渲染

文件：`next/src/components/preview-pane.tsx`

- `delta` 事件 → HTML 实时累积到 `store.appendHtmlFor()`
- iframe 以约 3fps（320ms debounce）刷新 `srcDoc`
- 日志面板实时滚动显示 argv、模型、token 用量、费用
- 完成后自动检测 deck 格式（多 slide），若检测到则切换到 Deck 视图

## 6. HTML 存储方式

生成的 HTML 全部为内存形式，不落磁盘临时文件。

| 层级 | 存储位置 | 说明 |
|---|---|---|
| 当前 HTML | Zustand store（内存 + localStorage） | `Task.html` 字段，localStorage key: `html-everything-store` |
| 历史版本 | IndexedDB | 数据库 `html-anything-history`，每任务保留最近 20 个版本 |
| Agent 侧 | stdout（内存） | prompt 禁止 agent 写文件；即使违规写了，解析器只读内容到内存 |

## 相关文件索引

| 文件 | 职责 |
|---|---|
| `next/src/components/convert-chip.tsx` | 生成按钮 UI 与触发逻辑 |
| `next/src/lib/use-convert.ts` | 前端编排：预处理、POST、SSE 解析 |
| `next/src/app/api/convert/route.ts` | 服务端：模板加载、prompt 组装、agent 调用 |
| `next/src/lib/agents/invoke.ts` | 子进程 spawn、stdout 解析 |
| `next/src/lib/agents/detect.ts` | agent 检测、路径解析、协议定义 |
| `next/src/lib/agents/argv.ts` | 命令行参数构建、解析器工厂 |
| `next/src/lib/templates/shared.ts` | 全局设计指令 + prompt 组装 |
| `next/src/lib/templates/loader.ts` | 模板加载 |
| `next/src/lib/parsers/auto.ts` | 格式检测与内容摘要 |
| `next/src/lib/store.ts` | Zustand 全局状态（含 html 字段持久化） |
| `next/src/lib/history/db.ts` | IndexedDB 历史版本存储 |
| `next/src/components/preview-pane.tsx` | 预览面板实时渲染 |
