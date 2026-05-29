# 项目启动指南

## 环境要求

| 依赖 | 版本要求 | 说明 |
|------|----------|------|
| Node.js | >= 20.9.0 | Next.js 16 要求 |
| pnpm | >= 10 | workspace 包管理器 |

**当前环境问题**：系统预装 Node.js 18.19.0，不满足要求。

## 快速启动

### 1. 升级 Node.js（如果版本不满足）

```bash
# 使用 nvm（推荐）
nvm install 20
nvm use 20

# 或使用 n（如果你使用 n 来管理 Node 版本）
n 20

# 或直接下载安装
# https://nodejs.org/en/download/
```

### 2. 安装依赖

```bash
pnpm install --frozen-lockfile
```

### 3. 启动开发服务器

```bash
pnpm -F @html-anything/next dev
```

启动成功后，访问 http://localhost:3000

## 常用命令

| 命令 | 说明 |
|------|------|
| `pnpm -F @html-anything/next dev` | 启动开发服务器 |
| `pnpm -F @html-anything/next build` | 构建生产版本 |
| `pnpm -F @html-anything/next typecheck` | TypeScript 类型检查 |
| `pnpm -F @html-anything/next test` | 运行单元测试 |
| `pnpm -F @html-anything/e2e test` | 运行 E2E 测试 |
| `pnpm exec tsx scripts/guard.ts` | 运行结构守卫检查 |

## 常见问题

### Node.js 版本不符

**错误信息**：
```
You are using Node.js 18.19.0. For Next.js, Node.js version ">=20.9.0" is required.
```

**解决方案**：升级 Node.js 到 20+ 版本。

### 端口被占用

如果 3000 端口被占用，可以指定其他端口：

```bash
PORT=3001 pnpm -F @html-anything/next dev
```

## WSL 环境特殊说明

在 WSL 环境中开发时，注意以下几点：

1. **Node.js 版本**：确保 WSL 内部的 Node.js 版本满足要求（不仅仅是 Windows 端）
2. **浏览器访问**：WSL 中运行的服务可以通过 `localhost:3000` 在 Windows 浏览器中访问
3. **文件路径**：项目位于 WSL 挂载的 Windows 文件系统（`/mnt/e/`），注意文件权限

## 项目结构速查

```
html-anything/
├── next/                    # Next.js 主应用
│   └── src/
│       ├── app/            # App Router 页面和 API
│       ├── components/     # React 组件
│       └── lib/            # 核心逻辑
├── e2e/                    # Playwright E2E 测试
├── output/                 # 输出产物目录
└── developer_documents/    # 开发文档
```
