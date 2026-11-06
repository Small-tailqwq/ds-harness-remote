# dsh-lango

Connect a phone straight to DeepSeek Harness on your computer over a private network: LAN, WireGuard, Tailscale or ZeroTier. No server and no account.

- Phone: the LAN Direct branch of dsh-Go (`dshremote://local-pair` pairing links).
- Wire protocol: identical to ds-harness-remote Local Direct (Noise IK, one-time pairing code, paired devices only).
- Serves the Harness session itself (the official Typert Remote carrier) and terminals. No account, server, WebRTC, relay, CodeX, ACP or file upload.

## Install

The DeepSeek Harness Desktop profile is managed by Desktop; install with its bundled pnpm inside the profile directory:

1. In `~/.dsh/profiles/desktop/package.json`, add `"dsh-lango": "link:D:/code/lango"` to `dependencies` and add `"dsh-lango"` to `dsh.profile.bundles`.
2. In that directory run Desktop's pnpm: `node "<Desktop install>/resources/runtime/primary-runtime/dependencies/pnpm/bin/pnpm.mjs" install`.
3. Restart Desktop.

If ds-harness-remote is installed on the same computer, turn off its `local.enabled`: both default to port 47821.

## Pair

```bash
node D:/code/lango/bin/lango.js pair
```

Open the printed `dshremote://local-pair?...` link on the phone, check that the fingerprint shown in the app matches the terminal, then pair. The link is valid once, for 5 minutes.

```bash
node D:/code/lango/bin/lango.js devices
node D:/code/lango/bin/lango.js revoke <device-id>
```

A running Host disconnects a revoked device within 3 seconds.

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

Identity and pairings live in `<DSH_HOME>/lango/local/host`.

## Development

```bash
pnpm install
pnpm check
pnpm test
pnpm build
```

`dist/index.js` inlines every runtime dependency and is committed, so link and GitHub installs load without a build.

## Origin

`src/crypto`, `src/protocol` and the Local Direct and Typert tunnel files come from [ds-harness-remote](https://github.com/liguobao/ds-harness-remote) (MIT, see `LICENSE.ds-harness-remote`).
