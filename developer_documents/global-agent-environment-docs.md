# 全局 Agent 环境文档接入记录

本文记录 2026-05-28 对 WSL / Windows / Clash Verge / CDP 相关环境文档的全局接入方案。

## 背景

当前项目的 `developer_documents/` 中有两份重要环境文档：

- `developer_documents/wsl-windows-browser-cdp.md`
- `developer_documents/wsl-clash-network-tooling.md`

它们不是项目业务文档，而是用户本机开发环境经验：

- WSL 如何连接 Windows 宿主机 Chrome / Edge CDP 调试端口。
- Clash Verge 常开时，WSL 中 `git`、`curl`、`fetch`、`npm`、`pnpm`、`pip` 等工具如何稳定访问网络。

目标是让以后打开任意项目时，Codex 或 Claude Code 都能知道这些文档存在，并在相关问题出现时主动读取。

## 决策

采用“用户级单一知识库 + Claude/Codex 双入口引用”的方案：

- 文档内容放在用户级目录，避免绑定某个具体项目。
- Claude 通过全局 `~/.claude/CLAUDE.md` 感知。
- Codex 通过全局 `~/.codex/AGENTS.md` 感知。
- Codex shell 环境额外暴露 `AGENT_ENVIRONMENT_DOCS`，方便命令行定位文档目录。

这样可以避免在每个项目中复制同样说明，也避免多份文档内容漂移。

## 已落地位置

用户级环境文档目录：

```text
/home/cjl/.agent_environment/developer_documents/
```

已放入：

```text
/home/cjl/.agent_environment/developer_documents/wsl-windows-browser-cdp.md
/home/cjl/.agent_environment/developer_documents/wsl-clash-network-tooling.md
```

便捷软链接：

```text
/home/cjl/.claude/developer_documents -> /home/cjl/.agent_environment/developer_documents
/home/cjl/.codex/developer_documents  -> /home/cjl/.agent_environment/developer_documents
```

## Claude Code 接入

已更新：

```text
/home/cjl/.claude/CLAUDE.md
```

新增说明的核心含义：

- 全局环境文档在 `/home/cjl/.agent_environment/developer_documents/`。
- 在调试 WSL-to-Windows 浏览器自动化、Chrome/Edge CDP、Windows `portproxy`、Clash Verge、GitHub 下载、`git clone`、`curl`、`fetch`、`npm`、`pnpm`、`pip` 网络失败之前，先读取相关文档。

## Codex 接入

已新增：

```text
/home/cjl/.codex/AGENTS.md
```

该文件包含：

- 默认使用中文与用户沟通。
- 全局环境文档路径。
- 遇到 WSL / Windows / CDP / Clash Verge / 网络工具问题时，优先读取相关文档。

已更新：

```text
/home/cjl/.codex/config.toml
```

在 `[shell_environment_policy.set]` 中加入：

```toml
AGENT_ENVIRONMENT_DOCS = "/home/cjl/.agent_environment/developer_documents"
```

## 验证结果

使用以下命令验证 Codex 是否会加载全局 `AGENTS.md`：

```bash
codex debug prompt-input 'ping' | rg -n 'Global Environment Documents|agent_environment'
```

在 `/tmp` 下验证通过，说明即使不在任何项目中，Codex 也能看到全局说明。

在当前项目下验证也通过：

```bash
codex debug prompt-input 'ping' | rg -n 'Global Environment Documents|project-doc|agent_environment'
```

输出显示 Codex 会先加载全局 `~/.codex/AGENTS.md`，再合并项目自己的 `AGENTS.md`，中间用 `--- project-doc ---` 分隔。

## 后续维护建议

- 如果这两份环境文档继续演进，优先维护用户级目录：

```text
/home/cjl/.agent_environment/developer_documents/
```

- 如果某个项目也需要保留副本，可放入项目的 `developer_documents/`，但要注意内容可能与用户级版本分叉。
- 如果 Codex 或 Claude Code 升级后全局说明机制变化，重新用 `codex debug prompt-input` 验证全局 `AGENTS.md` 是否仍进入上下文。
- 如果迁移到新机器，至少复制：

```text
/home/cjl/.agent_environment/developer_documents/
/home/cjl/.claude/CLAUDE.md
/home/cjl/.codex/AGENTS.md
```

并检查 `~/.codex/config.toml` 中的 `AGENT_ENVIRONMENT_DOCS`。
