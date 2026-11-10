# dsh-lango

[English](README.en.md)

在私有网络里把手机直接连到电脑上的 DeepSeek Harness：局域网、WireGuard、Tailscale、ZeroTier 都可以。不经过任何服务器，也不需要账号。

- 手机端：dsh-Go 的局域网直连分支（`dshremote://local-pair` 配对链接）。
- 线协议：ds-harness-remote 的 Local Direct（Noise IK、一次性配对码、只接受已配对设备），并在新手机配对前增加电脑端同意。
- 只提供 Harness 会话本身（官方 Typert Remote carrier）和终端；不包含账号、服务器、WebRTC、中继、CodeX、ACP、文件上传。

## 安装

DeepSeek Harness Desktop 的 profile 由 Desktop 管理，用其自带的 pnpm 在 profile 目录里安装：

1. 在 `~/.dsh/profiles/desktop/package.json` 的 `dependencies` 加入 `"dsh-lango": "link:D:/code/lango"`，并把 `"dsh-lango"` 加入 `dsh.profile.bundles`。
2. 在该目录执行 Desktop 自带的 pnpm：`node "<Desktop 安装目录>/resources/runtime/primary-runtime/dependencies/pnpm/bin/pnpm.mjs" install`。
3. 重启 Desktop。

同一台电脑上如果也装了 ds-harness-remote，请关闭它的 `local.enabled`，两者默认都用 47821 端口。

## 配对

在 设置 → 插件 打开 Lango 插件页（侧栏入口默认隐藏，可在面板里打开 **在侧栏显示**），点 **配对新设备**：

1. 用 dsh-Go 扫二维码。码里是 Host 身份、私有地址和一次性配对码，5 分钟内有效。
2. 手机显示电脑名称与指纹，在手机上确认。
3. 电脑显示手机名称、地址、指纹和 6 位确认码。手机上显示的确认码一致时才点允许。限时 2 分钟；拒绝、关闭面板或超时都会结束这次配对，配对码作废。

配对码只能证明手机看到了二维码；只有电脑前的人点了允许才算配对成功。关闭面板即关闭配对窗口。

同一面板列出已配对设备：在线状态或上次连接时间、地址、延迟（加密链路上的 WebSocket ping/pong，点一下重新测量）、重命名和移除。移除后立即断开该设备。

0.1 的 `lango pair | devices | revoke` 命令已移除：配对窗口只存在于运行中 Host 的内存里，本机其他进程无法再打开。手机需使用支持电脑端同意（`local.pair.approval.v1`）的 dsh-Go；旧版本会收到 `UNSUPPORTED_VERSION`。

## 配置

`cordis.patch.yml` 中 `dsh-lango` 条目的 `config`（都可省略）：

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `port` | `47821` | 监听端口 |
| `bind` | 全部私有地址 | 只允许私有地址；公网地址会启动失败 |
| `deviceName` | 主机名 | 手机上显示的名称 |
| `terminal` | `true` | 是否允许远程终端 |
| `logLevel` | `info` | |

只在启动时绑定当时已有的私有地址：WireGuard、Tailscale 需要先连上再启动 Desktop。Windows 首次监听时防火墙会询问，需允许专用网络。

身份和配对保存在 `<DSH_HOME>/lango/local/host`。面板使用的控制路由（`/dsh-lango/*`）在 Connection 信任边界之后，且只接受回环连接。

## 开发

```bash
pnpm install
pnpm check
pnpm test
pnpm build
```

`dist/index.js`（Host）与 `dist/client.js`（Desktop 面板）内联了全部运行时依赖，需要随源码提交，link 和 GitHub 安装才能直接加载。

## 来源

`src/crypto`、`src/protocol` 以及 Local Direct、Typert 隧道相关文件取自 [ds-harness-remote](https://github.com/liguobao/ds-harness-remote)（MIT，见 `LICENSE.ds-harness-remote`）。