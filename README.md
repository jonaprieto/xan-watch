# xan-watch

XAN in the macOS menu bar: price with 24h arrow, market cap, FDV, volume, a 7-day sparkline, and your
vesting position in XAN and USD. A background collector stores the history in SQLite every 5 minutes
and sends notifications for big price moves, volume spikes, unlockable tokens, and a daily summary.
Read-only: no keys, no transactions.

## Install

```sh
make install                      # or: make install ADDRESS=0xYourVestingAddress
```

That installs SwiftBar if needed, configures it, starts the collector, and puts XAN in the menu bar.
Everything else is in the menu: "Edit settings…" (changes apply within 5 minutes), "Open log", "Run
collector now". `make uninstall` removes it and keeps your data.

## Develop

```sh
make test        # bun test + tsc --noEmit, offline
```
