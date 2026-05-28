# WSL 连接 Windows 浏览器 CDP 调试端口记录

本文记录 2026-05-28 为 `web-access` 技能打通 WSL2 到 Windows 宿主机 Chrome/Edge DevTools Protocol (CDP) 的排查过程、根因和当前可用方案。

## 目标

让 WSL 中的工具可以直接连接 Windows 宿主机浏览器调试端口，并通过 `web-access` 的本地 CDP Proxy 操作浏览器：

```bash
node /home/cjl/.agents/skills/web-access/scripts/check-deps.mjs
curl -s http://127.0.0.1:3456/health
curl -s http://127.0.0.1:3456/targets
```

## 环境事实

- WSL 是 WSL2，网段示例：`172.29.44.169/20`。
- Windows 宿主机在 WSL 默认网关上可达，示例：`172.29.32.1`。
- Windows 上开启了 Clash Verge，规则模式 + TUN 模式。
- WSL 的 `/etc/resolv.conf` 使用固定 DNS，`/etc/wsl.conf` 中 `generateResolvConf = false`。
- 默认 `node` 是 v18.19.0，但本机已有 Node 22/24：
  - `/home/cjl/.nvm/versions/node/v22.22.3/bin/node`
  - `/home/cjl/.nvm/versions/node/v24.14.1/bin/node`

## 根因

最初失败不是单一原因，而是三个问题叠加：

1. Windows Chrome/Edge 的 DevTools 端口默认只监听 Windows `127.0.0.1`，WSL2 不能直接访问 Windows loopback。
2. Windows 上残留的 `0.0.0.0:9222 -> 127.0.0.1:9222` portproxy 可以 TCP 连通，但后端并不是有效 DevTools 服务，`/json/version` 返回 404 或空响应。
3. `web-access` 的旧兜底逻辑只扫描 WSL 本机 `127.0.0.1` 的固定端口，并且对手动调试端口硬编码连接 `/devtools/browser`，没有读取 `/json/version` 中真实的 `webSocketDebuggerUrl`。现代 Chrome/Edge 的真实 WebSocket 路径带随机 browser id，例如 `/devtools/browser/<uuid>`。

Clash Verge/TUN 的影响是：不要假设 Windows loopback、LAN IP、WSL 网关和代理链路等价。排查时必须用 `--noproxy '*'` 验证 WSL 到 Windows 网关端口的直连结果。

## 当前可用方案

当前打通的是 Windows Edge 调试实例：

```bash
"/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" \
  --remote-debugging-address=0.0.0.0 \
  --remote-debugging-port=9335 \
  --remote-allow-origins=* \
  --user-data-dir="C:\\Users\\cjl\\AppData\\Local\\Temp\\web-access-edge-9335" \
  about:blank
```

Windows portproxy：

```powershell
netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=9335 connectaddress=127.0.0.1 connectport=9335
```

从 WSL 验证：

```bash
curl -sS --noproxy '*' --connect-timeout 3 \
  http://172.29.32.1:9335/json/version
```

成功时应返回类似：

```json
{
  "Browser": "Edg/148.0.3967.83",
  "Protocol-Version": "1.3",
  "webSocketDebuggerUrl": "ws://172.29.32.1:9335/devtools/browser/..."
}
```

## 已修改的 web-access 本地脚本

为让 `web-access` 后续可以自动发现 WSL 到 Windows 的 CDP 端口，已修改以下本地 skill 脚本：

- `/home/cjl/.agents/skills/web-access/scripts/browser-discovery.mjs`
  - 新增 WSL 默认网关发现。
  - 兜底端口从“TCP 可连”升级为“`/json/version` 返回有效 DevTools JSON”。
  - 扫描 WSL 本机常见端口以及 WSL 默认网关上的 `9222, 9229, 9333, 9334, 9335`。
- `/home/cjl/.agents/skills/web-access/scripts/cdp-proxy.mjs`
  - 兜底端口连接时读取 `/json/version`。
  - 使用真实 `webSocketDebuggerUrl` 的 path。
  - 支持 `host:port`，不再硬编码只连 `127.0.0.1:<port>`。
- `/home/cjl/.agents/skills/web-access/scripts/check-deps.mjs`
  - 展示兜底端口的 host。
  - 当前 shell 是 Node 18 时，启动 proxy 会优先使用本机已有的 Node 22+/24。

## 验证结果

以下命令已验证通过：

```bash
node /home/cjl/.agents/skills/web-access/scripts/check-deps.mjs
```

输出要点：

```text
node: warn (v18.19.0, 建议升级到 22+)
browser: ok (port 9335, host 172.29.32.1) [通过手动调试端口连接]
proxy: ready (未知（通过手动调试端口连接）)
```

CDP Proxy 健康检查：

```bash
curl -s http://127.0.0.1:3456/health
```

成功返回：

```json
{
  "status": "ok",
  "connected": true,
  "chromePort": 9335
}
```

实际浏览器操作也已验证：通过 `http://127.0.0.1:3456/new` 创建 Baidu 搜索 tab，并通过 `/info`、`/eval` 读取页面标题和 URL。

## 常用排查命令

查看 WSL 默认网关：

```bash
ip route
```

查看 Windows 监听端口：

```bash
powershell.exe -NoProfile -Command 'Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -in 9222,9335 } | Select-Object LocalAddress,LocalPort,OwningProcess | Format-Table -AutoSize'
```

查看 Windows portproxy：

```bash
powershell.exe -NoProfile -Command 'netsh interface portproxy show v4tov4'
```

验证 WSL 直连 Windows DevTools，不走代理：

```bash
curl -v --noproxy '*' --connect-timeout 3 http://172.29.32.1:9335/json/version
```

查看 `web-access` proxy 状态：

```bash
curl -s http://127.0.0.1:3456/health
curl -s http://127.0.0.1:3456/targets
```

## 注意事项

- `9335` 当前用于 Windows Edge 调试实例。
- `9222` 上存在旧 portproxy 规则，但不要把 TCP 连通等同于 DevTools 可用，必须验证 `/json/version`。
- 如果 Windows 重启、WSL 网段变化或 Clash/TUN 改变网络行为，先重新获取 WSL 默认网关，再验证 `http://<gateway>:9335/json/version`。
- 如果 Edge 调试实例关闭，需要重新用上面的 Edge 启动命令打开。
- `web-access` Proxy 监听 WSL 本机 `127.0.0.1:3456`，浏览器 CDP 端口在 Windows 网关 `172.29.32.1:9335`。
