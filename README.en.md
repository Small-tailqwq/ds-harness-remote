# dsh-lango

[简体中文](README.md)

Connect a phone straight to DeepSeek Harness on your computer over a private network: LAN, WireGuard, Tailscale or ZeroTier. No extra server or account.

- Phone: the LAN Direct branch of [dsh-Go](https://github.com/Small-tailqwq/dsh-Go/tree/feat/lan-direct) (`dshremote://local-pair` pairing links).
- Wire protocol: identical to ds-harness-remote Local Direct (Noise IK, one-time pairing code, paired devices only), plus approval on the computer before a new phone is paired.
- Serves the Harness session itself (the official Typert Remote carrier) and terminals. No account, server, WebRTC, relay, CodeX, ACP or file upload.

## Install

1. Select **Plugins** in the sidebar.
2. Select **Add plugin**.
3. Enter `https://github.com/Small-tailqwq/ds-harness-remote#lango` and select **Install**.
4. Choose **Enable now** when the install finishes.

If ds-harness-remote is installed on the same computer, turn off its `local.enabled`: both default to port 47821.

## Pair

Select **Plugins** in the sidebar, open dsh-lango's plugin page and choose **Pair a device** (the Lango entry stays hidden in the sidebar until **Show in sidebar** is switched on in the panel):

1. Scan the QR code with dsh-Go. It carries the Host identity, its private addresses and a one-time code, valid for 5 minutes.
2. The phone shows the computer's name and fingerprint; confirm there.
3. The computer shows the phone's name, address, fingerprint and a six-digit confirmation code. Allow only if the phone shows the same code. You have 2 minutes; denying, closing the panel or letting it run out ends the attempt and spends the code.

The same panel lists paired devices: connected or last seen, address, latency, rename and remove. Removing a device disconnects it at once.

The 0.1 `lango pair | devices | revoke` commands were removed: pairing windows now live only in the running Host's memory, so no other local process can open one. Phones need a dsh-Go build that supports the approval step (`local.pair.approval.v1`); older builds are refused with `UNSUPPORTED_VERSION`.

## Configuration

`config` of the `dsh-lango` entry in `cordis.patch.yml` (all optional):

| Field | Default | Notes |
| --- | --- | --- |
| `port` | `47821` | Listening port |
| `bind` | every private address | Private addresses only; a public address fails startup |
| `deviceName` | host name | Name shown on the phone |
| `terminal` | `true` | Allow remote terminals |
| `logLevel` | `info` | Log level |

Addresses are bound once at startup: connect WireGuard, Tailscale or ZeroTier before starting Desktop. On first listen Windows Firewall asks for permission; allow private networks.

Identity and pairings live in `<DSH_HOME>/lango/local/host`. The panel's control route (`/dsh-lango/*`) sits behind the Connection trust fence and answers loopback sockets only.

## Development

```bash
pnpm install
pnpm check
pnpm test
pnpm build
```

`dist/index.js` (Host) inlines every runtime dependency; `dist/client.js` (Desktop panel) inlines everything except React and React DOM, which Desktop provides. Both are committed, so Git installs load without a build.

## Origin

`src/crypto`, `src/protocol` and the Local Direct and Typert tunnel files come from [ds-harness-remote](https://github.com/liguobao/ds-harness-remote) (MIT, see `LICENSE.ds-harness-remote`).