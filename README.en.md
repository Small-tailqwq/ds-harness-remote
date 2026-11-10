# dsh-lango

[简体中文](README.md)

Connect a phone straight to DeepSeek Harness on your computer over a private network: LAN, WireGuard, Tailscale or ZeroTier. No server and no account.

- Phone: the LAN Direct branch of dsh-Go (`dshremote://local-pair` pairing links).
- Wire protocol: ds-harness-remote Local Direct (Noise IK, one-time pairing code, paired devices only), plus approval on the computer before a new phone is paired.
- Serves the Harness session itself (the official Typert Remote carrier) and terminals. No account, server, WebRTC, relay, CodeX, ACP or file upload.

## Install

The DeepSeek Harness Desktop profile is managed by Desktop; install with its bundled pnpm inside the profile directory:

1. In `~/.dsh/profiles/desktop/package.json`, add `"dsh-lango": "link:D:/code/lango"` to `dependencies` and add `"dsh-lango"` to `dsh.profile.bundles`.
2. In that directory run Desktop's pnpm: `node "<Desktop install>/resources/runtime/primary-runtime/dependencies/pnpm/bin/pnpm.mjs" install`.
3. Restart Desktop.

If ds-harness-remote is installed on the same computer, turn off its `local.enabled`: both default to port 47821.

## Pair

Open the plugin's page in Settings → Plugins (or the Lango entry in the sidebar, hidden until **Show in sidebar** is switched on in the panel) and choose **Pair a device**:

1. Scan the QR code with dsh-Go. It carries the Host identity, its private addresses and a one-time code, valid for 5 minutes.
2. The phone shows the computer's name and fingerprint; confirm there.
3. The computer shows the phone's name, address, fingerprint and a six-digit confirmation code. Allow only if the phone shows the same code. You have 2 minutes; denying, closing the panel or letting it run out ends the attempt and spends the code.

The code only proves that the phone saw the QR code; nothing is paired until someone at the computer allows it. Closing the panel closes the pairing window.

The same panel lists paired devices: connected or last seen, address, latency (WebSocket ping/pong on the encrypted link; click to measure again), rename and remove. Removing a device disconnects it at once.

The 0.1 `lango pair | devices | revoke` commands are gone: pairing windows now live only in the running Host's memory, so no other local process can open one. Phones need a dsh-Go build that supports the approval step (`local.pair.approval.v1`); older builds are refused with `UNSUPPORTED_VERSION`.

## Configuration

`config` of the `dsh-lango` entry in `cordis.patch.yml` (all optional):

| Field | Default | |
| --- | --- | --- |
| `port` | `47821` | Listening port |
| `bind` | every private address | Private addresses only; a public address fails startup |
| `deviceName` | host name | Name shown on the phone |
| `terminal` | `true` | Allow remote terminals |
| `logLevel` | `info` | |

Addresses are bound once at startup: connect WireGuard or Tailscale before starting Desktop. On first listen Windows Firewall asks for permission; allow private networks.

Identity and pairings live in `<DSH_HOME>/lango/local/host`. The panel's control route (`/dsh-lango/*`) sits behind the Connection trust fence and answers loopback sockets only.

## Development

```bash
pnpm install
pnpm check
pnpm test
pnpm build
```

`dist/index.js` (Host) and `dist/client.js` (Desktop panel) inline every runtime dependency and are committed, so link and GitHub installs load without a build.

## Origin

`src/crypto`, `src/protocol` and the Local Direct and Typert tunnel files come from [ds-harness-remote](https://github.com/liguobao/ds-harness-remote) (MIT, see `LICENSE.ds-harness-remote`).