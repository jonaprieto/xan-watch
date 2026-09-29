ADDRESS ?=

.PHONY: install uninstall test

test:
	bun test
	bunx tsc --noEmit

install:
	bin/xan-watch setup $(if $(ADDRESS),--address $(ADDRESS))

uninstall:
	bin/xan-watch uninstall
