BUN := $(shell command -v bun)
REPO := $(CURDIR)
LABEL := com.jonaprieto.xan-watch
PLIST := $(HOME)/Library/LaunchAgents/$(LABEL).plist
CONFIG := $(HOME)/.config/xan-watch/config.toml
DEFAULT_PLUGIN_DIR := $(HOME)/Library/Application Support/xan-watch/swiftbar-plugins
UID := $(shell id -u)
ADDRESS ?=

.PHONY: install uninstall test

test:
	bun test
	bunx tsc --noEmit

install:
	@test -n "$(BUN)" || { echo "bun not found: install it from https://bun.sh"; exit 1; }
	@test -d /Applications/SwiftBar.app || brew install --cask swiftbar
	bun install --frozen-lockfile
	printf "BUN='%s'\nREPO='%s'\n" "$(BUN)" "$(REPO)" > bin/env.sh
	@# Point SwiftBar at a plugin folder unless the user already chose one, so no folder picker appears.
	@dir="$$(defaults read com.ameba.SwiftBar PluginDirectory 2>/dev/null)"; \
	if [ -z "$$dir" ]; then dir="$(DEFAULT_PLUGIN_DIR)"; defaults write com.ameba.SwiftBar PluginDirectory "$$dir"; fi; \
	mkdir -p "$$dir"; \
	printf '#!/bin/sh\nexec "%s" "%s/plugin/xan.ts"\n' "$(BUN)" "$(REPO)" > "$$dir/xan.1m.sh"; \
	chmod +x "$$dir/xan.1m.sh"; \
	echo "plugin: $$dir/xan.1m.sh"
	@if [ ! -f "$(CONFIG)" ]; then mkdir -p "$$(dirname "$(CONFIG)")"; \
	  "$(BUN)" src/config.ts --template $(if $(ADDRESS),--address $(ADDRESS)) > "$(CONFIG)"; echo "config: $(CONFIG)"; \
	  elif [ -n "$(ADDRESS)" ]; then echo 'config exists, ADDRESS ignored: use Settings > Set address from clipboard in the menu'; fi
	mkdir -p "$(HOME)/Library/Logs" "$(HOME)/Library/LaunchAgents"
	sed -e 's|@BUN@|$(BUN)|g' -e 's|@REPO@|$(REPO)|g' -e 's|@HOME@|$(HOME)|g' launchd/$(LABEL).plist.in > "$(PLIST)"
	-launchctl bootout gui/$(UID)/$(LABEL) 2>/dev/null && sleep 1
	launchctl bootstrap gui/$(UID) "$(PLIST)"
	@echo "collector running; first collection in progress"
	open -a SwiftBar
	@echo "done: XAN should appear in the menu bar within a minute"

uninstall:
	-launchctl bootout gui/$(UID)/$(LABEL) 2>/dev/null
	rm -f "$(PLIST)" bin/env.sh
	@dir="$$(defaults read com.ameba.SwiftBar PluginDirectory 2>/dev/null)"; \
	if [ -n "$$dir" ]; then rm -f "$$dir/xan.1m.sh"; fi
	@echo "removed. Kept: SwiftBar, $(CONFIG), and the data in ~/Library/Application Support/xan-watch"
