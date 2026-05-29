# HTML 生成流程

本文档描述用户点击"生成HTML"按钮后的完整调用链路。

## 1. 前端触发 `ConvertChip`

**文件**: `next/src/components/convert-chip.tsx`

```typescript
// 用户点击按钮 → 调用 useConvert().run()
run({ taskId, agent, templateId, content, format, model })
```

**触发条件**:
- 必须已选择 Agent
- 输入内容不能为空
- 当前状态不是"运行中"

---

## 2. `useConvert` Hook 处理

**文件**: `next/src/lib/use-convert.ts`

**主要工作流程**:

1. 创建 `AbortController` 用于取消请求
2. 更新状态为 `running`
3. 内联资产占位符 (`asset:id` → 真实 `data:image/...` URL)
4. 调用 `summarizeForAgent()` 分析内容格式
5. **diff-edit 模式**: 如果已有 baseHtml 且内容变化，发送旧 HTML 给 API 实现增量编辑
6. 发送 `POST /api/convert` 请求

### SSE 流式事件处理

| 事件 | 处理 |
|------|------|
| `start` | 记录启动信息（bin 路径、prompt 大小） |
| `delta` | 追加 HTML 文本到预览 |
| `html` | 从 Write 工具恢复完整 HTML |
| `meta` | 更新 token/费用等元数据 |
| `stderr` | 记录错误输出 |
| `done/error` | 完成或出错 |

---

## 3. API Route 处理

**文件**: `next/src/app/api/convert/route.ts`

**POST 处理流程**:

1. 解析请求体
2. 加载对应模板 (`loadSkill(templateId)`)
3. 组装提示词:
   - **全量模式**: `assemblePrompt({ body, content, format })`
   - **diff-edit 模式**: 调用 `buildEditPrompt()` 生成差异化提示词
4. 调用 `invokeAgent()` 执行 Agent

---

## 4. Agent 调用

**文件**: `next/src/lib/agents/invoke.ts`

**核心流程**:

1. 解析 Agent 定义 (`AGENTS`)
2. 解析 Agent 二进制路径 (`bin`)
3. 构建 CLI 参数 (`argv`)
4. **Spawn 进程**:
   - Windows 下使用 `shell: true`
   - 通过 stdin 或命令行参数传递 prompt
5. 解析 stdout 输出:
   - 流式文本块 (`delta`)
   - 元数据事件 (`meta`)
   - 文件写入工具调用 (`html`)
6. 通过 SSE 返回给前端

---

## 流程图

```
用户点击 ⚡生成HTML
    ↓
ConvertChip.run()
    ↓
useConvert (POST /api/convert)
    ↓
/api/convert/route.ts
    ↓
invokeAgent() → spawn Agent CLI
    ↓
SSE 流式返回
    ↓
前端实时更新预览区 HTML
```

---

## 关键文件

| 文件 | 职责 |
|------|------|
| `next/src/components/convert-chip.tsx` | 转换按钮组件 |
| `next/src/lib/use-convert.ts` | 转换逻辑 Hook，SSE 处理 |
| `next/src/app/api/convert/route.ts` | API 路由，提示词组装 |
| `next/src/lib/agents/invoke.ts` | Agent 进程调用，stdout 解析 |
| `next/src/lib/agents/argv.ts` | CLI 参数构建 |
| `next/src/lib/agents/detect.ts` | Agent 检测和路径解析 |

---

## diff-edit 模式

当任务已有生成的 HTML，且内容发生变化时：

1. 前端发送 `editFromHtml` 和 `editFromContent`
2. API 构建差异化提示词，要求 Agent 只修改变化部分
3. 节省 token 消耗，保持设计一致性

```typescript
// use-convert.ts 中的判断逻辑
const isEdit =
  !!task?.baseHtml &&
  !!task?.baseContent &&
  task.baseContent.trim() !== req.content.trim();
```
