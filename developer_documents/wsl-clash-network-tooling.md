# WSL + Clash Verge 网络访问工具配置经验

本文记录 2026-05-28 在 Windows + WSL2 + Clash Verge 常开环境下，解决 `git clone`、GitHub 下载、fetch、curl、npm/pnpm、pip 等工具网络不稳定的问题。

## 问题现象

常见失败包括：

- `git clone` 报 `gnutls_handshake() failed: The TLS connection was non-properly terminated`
- Python/urllib 下载 GitHub zip 报 `SSL: UNEXPECTED_EOF_WHILE_READING`
- GitHub archive、release、raw 文件下载不稳定
- 安装 skill、依赖或执行 fetch 时偶发 TLS EOF、连接重置、超时

这些问题在 Windows 浏览器可正常访问 GitHub 时仍可能发生，因为 WSL 命令行工具默认不一定走 Windows 上的 Clash Verge 代理。

## 根因

- Clash Verge 运行在 Windows 宿主机上。
- WSL2 是独立虚拟网络环境，不能默认继承 Windows 应用代理。
- Git/curl/Python/npm/pnpm/pip 等 CLI 工具需要显式配置代理，或通过环境变量读取代理。
- Clash Verge 的 TUN 模式对浏览器和部分 Windows 流量有效，但不要假设 WSL 内所有 CLI 流量都会透明接管。
- WSL 默认网关可能随 WSL/Windows 重启变化，所以不要把代理 IP 永久写死为某个固定地址。

## 已验证代理入口

当前环境中，Windows Clash Verge 暴露了 HTTP 代理端口：

```text
172.29.32.1:7890
172.29.32.1:7897
```

其中 `172.29.32.1` 是当时 WSL 默认网关。实际使用时应动态获取：

```bash
ip route | awk '/^default/ {print $3; exit}'
```

## 推荐全局方案

在 WSL 的 `~/.bashrc` 或 `~/.zshrc` 中加入：

```bash
export WIN_HOST="$(ip route | awk '/^default/ {print $3; exit}')"
export HTTP_PROXY="http://${WIN_HOST}:7890"
export HTTPS_PROXY="http://${WIN_HOST}:7890"
export ALL_PROXY="http://${WIN_HOST}:7890"
export http_proxy="$HTTP_PROXY"
export https_proxy="$HTTPS_PROXY"
export all_proxy="$ALL_PROXY"
export NO_PROXY="localhost,127.0.0.1,::1,172.16.0.0/12,192.168.0.0/16,10.0.0.0/8"
export no_proxy="$NO_PROXY"
```

生效：

```bash
source ~/.bashrc
```

或如果使用 zsh：

```bash
source ~/.zshrc
```

## 验证代理

验证 Windows Clash 代理端口是否监听：

```bash
powershell.exe -NoProfile -Command 'Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -in 7890,7897 } | Select-Object LocalAddress,LocalPort,OwningProcess | Format-Table -AutoSize'
```

验证 WSL 到 Windows 代理端口是否可达：

```bash
WIN_HOST="$(ip route | awk '/^default/ {print $3; exit}')"
curl -I -x "http://${WIN_HOST}:7890" https://github.com
curl -I -x "http://${WIN_HOST}:7890" https://api.github.com
```

验证当前 shell 环境变量：

```bash
env | grep -i proxy
```

## Git 配置建议

首选方案：不要写死 Git 全局代理，让 Git 自动读取 `HTTP_PROXY` / `HTTPS_PROXY` 环境变量。

如果已经写过旧代理，先清理：

```bash
git config --global --unset http.proxy
git config --global --unset https.proxy
```

临时指定代理执行一次 clone：

```bash
WIN_HOST="$(ip route | awk '/^default/ {print $3; exit}')"
git -c http.proxy="http://${WIN_HOST}:7890" \
    -c https.proxy="http://${WIN_HOST}:7890" \
    clone https://github.com/op7418/guizang-ppt-skill.git
```

不推荐长期执行下面这种写死 IP 的配置，因为 WSL 网关可能变化：

```bash
git config --global http.proxy "http://172.29.32.1:7890"
git config --global https.proxy "http://172.29.32.1:7890"
```

## curl / wget / fetch

`curl` 通常会读取环境变量。也可以显式指定：

```bash
WIN_HOST="$(ip route | awk '/^default/ {print $3; exit}')"
curl -L -x "http://${WIN_HOST}:7890" https://github.com
```

排查某个本地或 WSL 到 Windows 的直连服务时，不要走代理：

```bash
curl --noproxy '*' http://172.29.32.1:9335/json/version
```

这对区分“代理问题”和“服务本身问题”很重要。

## npm / pnpm

如果环境变量已设置，npm/pnpm 通常可用。需要持久配置时：

```bash
npm config set proxy "$HTTP_PROXY"
npm config set https-proxy "$HTTPS_PROXY"
pnpm config set proxy "$HTTP_PROXY"
pnpm config set https-proxy "$HTTPS_PROXY"
```

查看配置：

```bash
npm config get proxy
npm config get https-proxy
pnpm config get proxy
pnpm config get https-proxy
```

如需清理：

```bash
npm config delete proxy
npm config delete https-proxy
pnpm config delete proxy
pnpm config delete https-proxy
```

## pip / Python

建议优先使用环境变量。需要持久 pip 配置时：

```bash
mkdir -p ~/.config/pip
cat > ~/.config/pip/pip.conf <<EOF
[global]
proxy = ${HTTP_PROXY}
EOF
```

验证：

```bash
pip config list
```

## Python urllib / 安装脚本

部分 Python 安装脚本会使用 `urllib.request`，一般也会读取环境变量：

```bash
export HTTPS_PROXY="http://$(ip route | awk '/^default/ {print $3; exit}'):7890"
python3 script.py
```

如果脚本仍然出现 `SSL: UNEXPECTED_EOF_WHILE_READING`，优先确认：

```bash
curl -I -x "$HTTPS_PROXY" https://github.com
curl -I -x "$HTTPS_PROXY" https://codeload.github.com
```

## Clash Verge 侧设置

确认 Clash Verge：

- HTTP/Mixed Port 包含 `7890`。
- 开启 `Allow LAN` 或允许局域网连接。
- Windows 防火墙允许 Clash Verge 入站。
- TUN 模式可以继续开启，但 WSL CLI 工具仍建议显式配置 HTTP proxy。

查看端口监听：

```bash
powershell.exe -NoProfile -Command 'Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -in 7890,7897 }'
```

## 故障排查顺序

1. 确认 WSL 默认网关：

```bash
ip route | awk '/^default/ {print $3; exit}'
```

2. 确认 Clash 端口监听：

```bash
powershell.exe -NoProfile -Command 'Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -eq 7890 }'
```

3. 用代理访问 GitHub：

```bash
WIN_HOST="$(ip route | awk '/^default/ {print $3; exit}')"
curl -I -x "http://${WIN_HOST}:7890" https://github.com
```

4. 检查环境变量：

```bash
env | grep -i proxy
```

5. 对 Git 进行一次临时代理 clone：

```bash
git -c http.proxy="$HTTP_PROXY" -c https.proxy="$HTTPS_PROXY" ls-remote https://github.com/op7418/guizang-ppt-skill.git
```

## 实战结论

本环境中，GitHub 直连会出现 TLS EOF / GnuTLS handshake 问题；通过 Windows Clash 代理 `http://<WSL默认网关>:7890` 后，`git clone https://github.com/op7418/guizang-ppt-skill.git` 成功。

长期建议：

- WSL shell 启动时动态设置代理环境变量。
- Git 不写死代理 IP，依赖环境变量。
- npm/pnpm/pip 可根据需要持久化配置。
- 排查本地服务时使用 `--noproxy '*'`，避免代理干扰判断。
