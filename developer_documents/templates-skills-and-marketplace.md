# 模板技能（templates/skills）与市场（marketplace）机制详解

> 本文档解释**机制层**的事实：模板技能在运行时到底是怎么被消费的，市场从 GitHub 装来的 skill 又被放在哪、以什么形状落地。
>
> 顶层目录索引见 `project-structure.md` 的"模板与技能系统"一节；本文档与之互补，不重复罗列 75 个内置模板的清单。
>
> 涉及源码（行号基于阅读时刻的 HEAD）：
>
> - `next/src/lib/templates/loader.ts:273` —— `loadSkill`
> - `next/src/lib/templates/shared.ts:46` —— `assemblePrompt`
> - `next/src/app/api/convert/route.ts:30` —— `buildEditPrompt`
> - `next/src/lib/skills/paths.ts:10-38` —— `userSkillsDir` / `packageId` / `makeSkillId`
> - `next/src/lib/skills/install.ts:394-481` —— `installFromGitHub`
> - `next/src/lib/skills/install.ts:487-494` —— `uninstallPackage`

---

## 1. 核心结论：next/src/lib/templates/skills/ 里的 SKILL.md **不是** agent skill

这一节是这份文档最重要的纠偏。本项目里凡是被叫做 "skill" 的东西，**在运行时并不是** Codex / Claude Code / OpenClaw 那种由 agent runtime 自动发现、可被工具调用的 skill。它在 runtime 的实际身份是**模板 prompt 包**，运行方式是**prompt composition（提示词拼接）**。

### 1.1 数据流（从用户点"生成 HTML"到 agent 收到一坨文本）

```
useConvert().run({ taskId, agent, templateId, content, format, model })
  → POST /api/convert
  → loadSkill(templateId)             # loader.ts:273
       • 校验 id
       • id 含 "--" → 去 ~/.html-anything/skills/<pkgId>/skills/<origId>/ 读
       • 否则         → 去 next/src/lib/templates/skills/<id>/ 读
       • 读 SKILL.md → 拆 frontmatter + body
       • 可选加载 example.html / example.md
  → assemblePrompt({ body, content, format })   # shared.ts:46
       或 buildEditPrompt({ ... }, route.ts:30，convert 路由内部)
  → 把拼好的整段 prompt 喂给本地 agent 子进程（codex / claude code / openclaw）
  → agent 不"知道"自己正在被某个 skill 调用
```

agent 实际看到的整段文本大致是这个形状（顺序重要）：

1. 全局 HTML 生成规则（共享指令，集中在 `templates/shared.ts`）
2. 某个模板的专属排版 / 风格 / 版式说明（即 SKILL.md body）
3. `【输入格式】: <format>` 之类的格式声明
4. `【用户内容】: <content>` 用户贴进的内容

### 1.2 关键含义

- **没有自动发现机制**。`/api/templates` 是显式 fs 扫描的结果，不是 agent 在启动时按 SKILL.md 里的触发条件匹配的。
- **没有工具流程**。`loadSkill` 不注册任何 MCP tool、不暴露 `allowed-tools` 头（frontmatter 里写了也只是字段，不会被 agent runtime 消费）。
- **example.html / example.md 的角色是 UI 资产**。它们给 picker 缩略图、给"载入示例"按钮喂数据，**不是**给 agent 学习用的 few-shot。
- **要新做一个模板 skill，就是在写一份 prompt 增量**。文件树长这样：

  ```text
  next/src/lib/templates/skills/<id>/
    SKILL.md       # 必填，frontmatter + prompt body
    example.md     # 可选，喂给 UI"载入示例"按钮
    example.html   # 可选，给 picker 缩略图
  ```

  `/api/templates` 会重新扫描这个目录并把新条目暴露给前端。**不需要改任何代码注册表**。

### 1.3 误称带来的实际坑

- 不要把 Codex / Claude Code 的 `~/.codex/skills/` 或 `~/.claude/skills/` 习惯搬过来：那里 SKILL.md 是给 agent 用的（带 YAML 触发词、YAML allowed-tools），本项目里它**只是 Markdown 文本**。
- 不要尝试用 `use_skill` 类工具调用或 skill-cli 之类的桥接器去"激活"本项目里的 SKILL.md，没有任何钩子会接住。
- 修改 SKILL.md 之后不需要 reload agent，**只是改了"下次拼 prompt 时会读到的文本"**。

---

## 2. 用户安装的 skill 存到 `~/.html-anything/skills/`

### 2.1 路径解析

`next/src/lib/skills/paths.ts:10-14`：

```ts
export function userSkillsDir(): string {
  const override = process.env.HTML_ANYTHING_USER_SKILLS_DIR;
  if (override) return override;
  return path.join(os.homedir(), ".html-anything", "skills");
}
```

- 默认：`<homedir>/.html-anything/skills/`
- 覆盖：环境变量 `HTML_ANYTHING_USER_SKILLS_DIR`（测试代码大量使用，见 `lib/skills/__tests__/install-rejections.test.ts:8` 等）
- 设计意图：放仓库外，**不被 `git clean` 误删、不被误 commit**

### 2.2 一个 GitHub repo 安装后的目录结构

源码：`next/src/lib/skills/install.ts:411-475`。从 GitHub codeload 拉 tarball → preflight 校验 → 解压到 `os.tmpdir()` → 在 `userSkillsDir/<pkgId>/.stage-...` 组好最终布局 → 原子 rename 到目标位置。

最终落盘形状：

```text
~/.html-anything/skills/
└── <owner>__<repo>/                # 包目录，id 由 packageId() 用 "__" 拼成
    ├── package.json                # 安装清单（来源、ref、安装时间、含哪些 skills）
    └── skills/
        └── <originalId>/           # 每个 repo 子目录一个 skill
            ├── SKILL.md            # 必填，≤ 256 KB
            ├── example.html        # 可选，≤ 2 MB
            └── example.md          # 可选，≤ 512 KB
```

> 已在本环境验证：`/home/cjl/.html-anything/skills/op7418__guizang-ppt-skill/` 存在，对应 `package.json` 里的 `source` 指向 `github.com/op7418/guizang-ppt-skill@main`。

### 2.3 两种 GitHub repo 布局

`install.ts:267-299` 故意只识别两种 layout（避免 docs/ 里的 `SKILL.md` 误入注册表）：

1. **单 skill**：仓库根有 `SKILL.md` → 装 1 个 skill，id 取 repo 名
2. **多 skill 包**：仓库根有 `skills/<id>/SKILL.md` → `skills/` 的每个直接子目录装一个

任何 repo 都不符合这两种 → 抛 `InstallError("no_skills_found", ...)`。

### 2.4 命名空间与 id 冲突处理

| 层级 | 字段 | 来源 |
|---|---|---|
| 包 id | `<owner>__<repo>` | `packageId()`（paths.ts:24） |
| skill 命名空间 id | `pkg-<owner>__<repo>--<originalId>` | `makeSkillId()`（paths.ts:36） |
| `loadSkill` 分流 | id 含 `--` → 走用户包；否则走内置 | `loader.ts:275-280` |

这保证 `nexu-io__html-anything` 仓库里的 skill `foo`（完整 id `pkg-nexu-io__html-anything--foo`）不会和内置 `foo` 撞名。

### 2.5 安全模型（来源不可信 → 必须自己校验）

源码 `install.ts:166-258`，覆盖 `preflightTarball`（166-233）和 `extractTarball`（241-258）。从 GitHub 抓公网 tarball 是不可信输入，所以**在调 `tar` 之前自己校验**：

| 威胁 | 防御 | 位置 |
|---|---|---|
| gzip bomb | `zlib.gunzipSync({ maxOutputLength: 96 * 1024 * 1024 })` | `install.ts:170-183` |
| tarball 传输大小 | `content-length` + 实际 buffer 双重检查，≤ 32 MB | `install.ts:129-145` |
| 解压后累计声明大小 | walk 每个 header 的 size 字段求和，≤ 96 MB | `install.ts:222-229` |
| 路径穿越（`..` / 绝对路径 / NUL） | 解析 header name 时 reject | `install.ts:203-209` |
| symlink / hardlink / char / block / fifo / socket | 只允许 `'0' / '\0' / '5' / 'x' / 'g'` 几种 typeFlag | `install.ts:215-221` |
| GNU long-name 扩展（`K` / `L`） | 显式拒，避免 100 字节 name 字段被绕 | 同上 |
| 写入时的 symlink | `assertNoSymlink()` 在 copy 前 `lstat` | `install.ts:374-379` |
| 跨文件系统 rename | stage 目录故意放在 target 同级，保证 `rename(2)` 不跨 fs | `install.ts:411-420, 461-462` |

### 2.6 原子替换流程

源码 `install.ts:421-472`。`/tmp` 在很多 Linux 主机上是独立 tmpfs，从 `os.tmpdir()` rename 到用户目录会触发 `EXDEV`。所以 staging 故意放在 `targetDir` 旁边（**同 fs**）：

1. 在 `userSkillsDir/<pkgId>.stage-<random8hex>/` 组装最终布局（package.json + skills/...）
2. 若 `targetDir` 已存在 → rename 成 `targetDir.bak-<timestamp>` 备份
3. `rename(stageDir, targetDir)` —— 同 fs、同 inode 替换
4. 失败时把 `targetDir.bak-*` rename 回去
5. 成功时把 `targetDir.bak-*` 删掉

### 2.7 大小限制汇总

| 资源 | 限制 | 源码 |
|---|---|---|
| 单个 SKILL.md | ≤ 256 KB | `install.ts:26` |
| 单个 example.html | ≤ 2 MB | `install.ts:27` |
| 单个 example.md | ≤ 512 KB | `install.ts:28` |
| 压缩 tarball | ≤ 32 MB | `install.ts:29, 130-145` |
| 解压后 tarball | ≤ 96 MB | `install.ts:36, 170-183, 222-229` |

### 2.8 卸载行为（注意点）

`uninstallPackage`（`install.ts:487-494`）**只删 `userSkillsDir/<pkgId>/`，不清理 `os.tmpdir()` 里残留的 `ha-skill-install-*` 临时目录**。如果装失败过几次想擦干净那些临时文件，需要手动 `rm -rf /tmp/ha-skill-install-*`（OS 的 tmp 清理也会覆盖，影响不大）。

---

## 3. 基于本项目原理，做一个"自媒体内容排版 skill"具体怎么落地

把 §1 的纠偏结论翻译成可操作步骤：

### 3.1 形态选择

| 形态 | 触发方式 | 适用场景 |
|---|---|---|
| **内置模板**（放 `next/src/lib/templates/skills/<id>/`） | 跟代码一起 commit，UI 自动列出 | 团队/项目级固定排版 |
| **marketplace 包**（放 GitHub 公开 repo，市场里安装） | 一次发布，多人复用 | 跨项目 / 公开分发的排版 |

**不要**走"在用户机器上手写 SKILL.md 到 `~/.html-anything/skills/`"这条路：文件确实能被 `loadSkill` 读到（loader.ts:275-280 不限制来源是否带 package.json），但**绕过 `package.json` 的包不参与版本追踪、卸载、原子替换**——手动 rm 反而更可靠。短期调试可以这么玩，生产不要。

### 3.2 内置模板最小骨架

```text
next/src/lib/templates/skills/<id>/
  SKILL.md
```

`SKILL.md` 最小可用模板：

```markdown
---
name: <id>            # 顶栏显示名（可选，不写则用 id）
description: ...      # picker 描述（可选）
---

# 你的模板专属规则

1. <排版约束 1>
2. <排版约束 2>
...

# 输出约束
- 单文件 HTML，所有 CSS inline 或写在 <style> 里
- 不要外部资源依赖
- 移动端优先 / 桌面端优先 / 响应式（按需写）
```

`example.html` / `example.md` 是**可选**的，但有 `example.html` 才会出 picker 缩略图，有 `example.md` 才会出"载入示例"按钮。**注意：这两个文件是 UI 资产，不是给 agent 学的 few-shot**——如果你想让 agent 学某种排版，把它**写进 SKILL.md body**，或者把样例 HTML 的关键样式规则**显式列在 prompt 约束里**。

### 3.3 marketplace 包最小骨架（GitHub repo）

```text
<owner>/<repo>/
  SKILL.md            # 单 skill 形态
```

或

```text
<owner>/<repo>/
  skills/
    <id-1>/SKILL.md
    <id-2>/SKILL.md
```

SKILL.md 内容同 §3.2。`example.html` / `example.md` 同样可选。安装时用 `owner/repo` 或 `owner/repo#ref` 或 `https://github.com/owner/repo[/tree/ref]`（见 `install.ts:63-92` 的 `parseGitHubSpec`）。

### 3.4 调试与排错

- **改完 SKILL.md 没生效**：dev server 走内存缓存时可能不重读；触发 `/api/templates` 重新扫描或在 settings modal 里点刷新。
- **想看拼好的 prompt 到底长啥样**：在 `assemblePrompt`（`shared.ts:46`）或 `buildEditPrompt`（`app/api/convert/route.ts:30`）里 `console.log` 一下整段，触发一次"生成 HTML"即可。
- **marketplace 安装失败**：error code 在 `InstallError.code` 里：
  - `invalid_spec` / `invalid_skill_id` —— id 校验没过
  - `unsafe_path` / `forbidden_entry_type` / `symlink_rejected` —— 仓库里有危险 entry
  - `tarball_too_large` / `tarball_uncompressed_too_large` —— 超出 §2.7 的限制
  - `skill_md_too_large` / `example_too_large` —— 资源文件过大
  - `skill_md_no_frontmatter` —— SKILL.md 缺 YAML 头
  - `no_skills_found` —— 不符合 §2.3 两种 layout
  - `download_failed` / `tarball_corrupt` / `tar_failed` —— 网络或 tar 进程问题
- **WSL/GitHub 网络问题**：见 `wsl-clash-network-tooling.md`（涉及 TLS EOF / Clash 代理）

---

## 4. 速查表

| 想知道... | 看哪 | 行号 |
|---|---|---|
| 默认用户 skill 目录 | `next/src/lib/skills/paths.ts` | 10-14 |
| 包 id 怎么拼 | `next/src/lib/skills/paths.ts` | 24-26 |
| 命名空间 skill id 怎么拼 | `next/src/lib/skills/paths.ts` | 36-38 |
| install 完整流程 | `next/src/lib/skills/install.ts` | 394-481 |
| preflightTarball 函数体 | `next/src/lib/skills/install.ts` | 166-233 |
| 两种 repo layout | `next/src/lib/skills/install.ts` | 267-299 |
| 卸载行为 | `next/src/lib/skills/install.ts` | 487-494 |
| `loadSkill` 怎么分流 | `next/src/lib/templates/loader.ts` | 273-281 |
| `assemblePrompt` 在哪 | `next/src/lib/templates/shared.ts` | 46 |
| `buildEditPrompt` 在哪 | `next/src/app/api/convert/route.ts` | 30 |
| 内置模板的 75 个目录和文件分布 | `developer_documents/project-structure.md` | 107-128 |
| 启动 + 安装依赖流程 | `developer_documents/project-startup.md` | 全文 |
| 转换按钮完整数据流 | `developer_documents/convert-button-flow.md` | 全文 |
| WSL 网络/代理问题 | `developer_documents/wsl-clash-network-tooling.md` | 全文 |
