# xan-watch

[![test](https://github.com/jonaprieto/xan-watch/actions/workflows/test.yml/badge.svg)](https://github.com/jonaprieto/xan-watch/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![macOS](https://img.shields.io/badge/platform-macOS-lightgrey?logo=apple)
![Bun](https://img.shields.io/badge/Bun-1.3-f9f1e1?logo=bun)

XAN (Anoma) in the macOS menu bar: the price with its 24h change, market cap, FDV, volume, a 7-day
sparkline, and, if you give it your address, your vesting position in XAN and USD. A background
collector stores the history in SQLite every 5 minutes and notifies you about big price moves,
volume spikes, tokens ready to unlock, and a daily summary.

It is read-only. It never asks for a key and never sends a transaction; your address is only used
to read public balances from the XanV2 token contract.

## Requirements

- macOS (tested on macOS 26, Apple Silicon)
- [Homebrew](https://brew.sh) (used to install [SwiftBar](https://github.com/swiftbar/SwiftBar) if you
  don't have it)
- [Bun](https://bun.sh) 1.3 or later: `curl -fsSL https://bun.sh/install | bash`

## Install

Clone into a folder whose path has no spaces (the menu actions point into it), then run one command:

```sh
git clone https://github.com/jonaprieto/xan-watch.git ~/xan-watch
cd ~/xan-watch
make install                                  # market data only
make install ADDRESS=0xYourVestingAddress     # also show your vesting position
```

`make install` installs SwiftBar if needed, points it at a plugin folder (it keeps yours if you
already use SwiftBar), writes a settings file, starts the collector as a login item, and
opens SwiftBar. XAN shows up in the menu bar within a minute, with 30 days of history already loaded.

If SwiftBar was already running, quit and reopen it once so it picks up the plugin. The first
notification may ask you to allow notifications from Script Editor; allow them, or alerts stay silent.

Keep the folder where you cloned it. If you move it, run `make install` again from the new place.

## Use

- Click a value (price, market cap, volume, vesting amounts) to copy its raw number.
- Click the 7-day chart or the sentiment line to open CoinGecko; the unlock-supply line opens the
  vesting spec.
- "Refresh now" fetches fresh data immediately instead of waiting for the next 5-minute collection.
- "Settings" is a submenu: pick alert thresholds and the summary hour by clicking (the current
  choice is checked). To add your address, copy it and click "Set address from clipboard".
- "Open log" shows what the collector has been doing. Problems also appear in the menu itself,
  marked with ⚠.

## Settings

Everything is adjustable from the Settings submenu. The menu reads and writes
`~/.config/xan-watch/config.toml`, which you can also edit by hand; the collector re-reads it every
5 minutes. Every key is optional:

```toml
address = "0x..."          # your vesting address; omit to hide the vesting block
# rpc_url = "https://ethereum-rpc.publicnode.com"

[alerts]
price_move_pct = 5         # price moved this % within an hour
volume_spike_x = 3         # 24h volume this many times its 7-day average
unlock_ready_xan = 50000   # this much XAN is ready to unlock
daily_summary_hour = 9     # local hour for the daily summary (0-23)
```

## What it stores and where

| What                                   | Where                                                   |
| -------------------------------------- | ------------------------------------------------------- |
| History (SQLite, about 100 KB a month) | `~/Library/Application Support/xan-watch/xan.db`        |
| Settings                               | `~/.config/xan-watch/config.toml`                       |
| Log                                    | `~/Library/Logs/xan-watch.log`                          |
| Login item                             | `~/Library/LaunchAgents/com.jonaprieto.xan-watch.plist` |

Network use: one CoinGecko request every 5 minutes, plus five read-only calls to a public Ethereum
RPC when an address is set.

## Uninstall

```sh
make uninstall
```

This stops the collector and removes the login item and the menu plugin. It keeps SwiftBar, your
settings and your history; delete `~/Library/Application Support/xan-watch` and
`~/.config/xan-watch` to remove those too.

## Develop

```sh
bun install
make test        # bun test + tsc --noEmit, offline
```

## License

[MIT](LICENSE) © 2026 Jonathan Prieto-Cubides
