# dsh-lango

在私有网络里把手机直接连到电脑上的 DeepSeek Harness：局域网、WireGuard、Tailscale、ZeroTier 都可以。不经过任何服务器，也不需要账号。

- 手机端：dsh-Go 的局域网直连分支（`dshremote://local-pair` 配对链接）。
- 线协议：与 ds-harness-remote 的 Local Direct 相同（Noise IK、一次性配对码、只接受已配对设备）。
- 只提供 Harness 会话本身（官方 Typert Remote carrier）和终端；不包含账号、服务器、WebRTC、中继、CodeX、ACP、文件上传。

## 安装

DeepSeek Harness Desktop 的 profile 由 Desktop 管理，用其自带的 pnpm 在 profile 目录里安装：

1. 在 `~/.dsh/profiles/desktop/package.json` 的 `dependencies` 加入 `"dsh-lango": "link:D:/code/lango"`，并把 `"dsh-lango"` 加入 `dsh.profile.bundles`。
2. 在该目录执行 Desktop 自带的 pnpm：`node "<Desktop 安装目录>/resources/runtime/primary-runtime/dependencies/pnpm/bin/pnpm.mjs" install`。
3. 重启 Desktop。

同一台电脑上如果也装了 ds-harness-remote，请关闭它的 `local.enabled`，两者默认都用 47821 端口。

## 配对

```bash
node D:/code/lango/bin/lango.js pair
```

把打印出的 `dshremote://local-pair?...` 链接发到手机上打开，核对 App 显示的指纹与终端一致后再配对。链接 5 分钟内有效，只能用一次。

```bash
node D:/code/lango/bin/lango.js devices
node D:/code/lango/bin/lango.js revoke <device-id>
```

撤销后，运行中的 Host 会在 3 秒内断开该设备。

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

身份和配对保存在 `<DSH_HOME>/lango/local/host`。

## 开发

```bash
pnpm install
pnpm check
pnpm test
pnpm build
```

`dist/index.js` 内联了全部运行时依赖，需要随源码提交，link 和 GitHub 安装才能直接加载。

## 来源

`src/crypto`、`src/protocol` 以及 Local Direct、Typert 隧道相关文件取自 [ds-harness-remote](https://github.com/liguobao/ds-harness-remote)（MIT，见 `LICENSE.ds-harness-remote`）。
