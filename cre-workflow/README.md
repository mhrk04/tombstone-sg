# tombstone-scan (Chainlink CRE workflow)

Scans watched wallets across 8 EVM mainnets + Sepolia for EIP-7702 sweeper delegations, reaches DON
consensus, and writes SUSPECT/TOMBSTONE/CLEAN observations to the TombstoneRegistry on 3 testnets.

## Triggers
- **cron** (`onScan`): every 10 min, scans `watchlist[0:maxWalletsPerRun]`.
- **HTTP** (`onCheckNow`): on-demand `{ "wallets": ["0x…"] }`, scans only those wallets.

## Flow
cron/HTTP → `runInNodeMode(scanAllChains, consensusIdenticalAggregation)` → one HTTP call per chain
(NOWNodes where keyed + key present, else public RPC; 404/429 → fallbackUrl once) → classify
(parse 7702 designator → known-sweeper / allowlist / skeleton-hash match / unknown=SUSPECT) → merge
(worst-wins + chainMask) → `runtime.report(prepareReportRequest(...))` → `EVMClient.writeReport` to the
3 testnet registries. Partial outage → report flags only (never CLEAN). Dry run prints
`dry-run (no tx hash; use --broadcast)`.

## Commands
```bash
bun install
bun run typecheck
bun test                         # 20 mocked tests
bun run gen:code-reader          # regenerate codeReader.ts from the forge artifact

# requires the CRE CLI (v1.37.0) and login — human steps:
cd ..
cre workflow build ./scan --target staging-settings
cre whoami
cre workflow simulate ./scan --target staging-settings --env ../.env --non-interactive --trigger-index 0
cre workflow simulate ./scan --target staging-settings --env ../.env --non-interactive --trigger-index 1 \
  --http-payload '{"wallets":["0x0000000000000000000000000000000000007a2e"]}'
```

Secret id `NOWNODES_API_KEY` ← env var `CRE_NOWNODES_API_KEY` (see `../secrets.yaml`). `none` = public only.
Deploy Access is not enabled; simulate only. `--broadcast` sends real testnet txs via MockForwarders.
