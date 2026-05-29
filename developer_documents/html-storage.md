# HTML 存储方式

## 概述

生成的 HTML 存储在**内存中，不涉及磁盘文件**。

---

## 存储位置

### 前端内存 (Zustand Store)

**文件**: `next/src/lib/store.ts`

HTML 存储在 Zustand 全局状态中：

```typescript
// store 中的 tasks 数组，每个 task 有 html 字段
tasks: [{ id, content, html, baseHtml, ... }]
```

### 流式传输过程

```
Agent stdout → invoke.ts (解析) → SSE → useConvert → store.appendHtmlFor() → 前端内存
```

---

## 关键代码

### use-convert.ts:190-199

```typescript
case "delta": {
  if (typeof d.text === "string")
    store.appendHtmlFor(taskId, d.text);  // 内存追加
  break;
}
case "html": {
  if (typeof d.text === "string") {
    store.setHtmlFor(taskId, d.text);    // 内存替换
    ...
  }
  break;
}
```

---

## 为什么不写入文件

1. **性能**: 流式传输避免等待完整生成
2. **实时预览**: 用户可以边生成边看效果
3. **diff-edit 优化**: 已有 HTML 存在 `task.baseHtml`，下次编辑时发送给 API 实现增量生成

---

## 写入磁盘的时机

只有用户主动"导出"时，才会调用 `export-menu` 将内存中的 HTML 写入磁盘文件。

---

## 相关文件

| 文件 | 职责 |
|------|------|
| `next/src/lib/store.ts` | Zustand 状态存储 |
| `next/src/lib/use-convert.ts` | SSE 接收，内存更新 |
| `next/src/components/export-menu.tsx` | 导出功能，写入磁盘 |
