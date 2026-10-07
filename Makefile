.PHONY: install test contracts workflow scanner app wasm

install:
	git submodule update --init --recursive
	cd cre-workflow/scan && bun install
	cd scanner && bun install
	cd app && bun install

contracts:
	cd contracts && forge build && forge test

workflow:
	cd cre-workflow/scan && bun run typecheck && bun test

scanner:
	cd scanner && bun run typecheck && bun test

app:
	cd app && bun run build

wasm:
	cd cre-workflow && cre workflow build ./scan --target staging-settings

test: contracts workflow scanner app
