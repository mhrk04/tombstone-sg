# Tasks (build log)

Rebuilt from an empty repo following the 10-prompt plan. Status reflects the actual local build.

- [x] 1. Repo scaffold, .env.example (no secrets), Makefile, CI (5 jobs incl. gitleaks), steering files.
- [x] 2. TombstoneRegistry + ReceiverTemplate (exact storage layout, never-downgrade, forwarder-gated).
- [x] 3. SafePayroll, TombstoneGuard, CodeReader, SweeperMock, MockUSDC + 16 forge tests (real 7702 sweep, real Safe v1.4.1 guard revert).
- [x] 4. Deploy + DemoSetup scripts (3 testnets); local dry run succeeds.
- [x] 5. scanner: 7702 detection library (classify/chains/rpc/scan/find7702) + 8 bun tests; live keyless read verified.
- [x] 6. cre-workflow: tombstone-scan (cron+HTTP, consensus, 3-testnet write) + 20 bun tests; typecheck clean against @chainlink/cre-sdk 1.23.0.
- [x] 7. Dashboard app (read-only); typecheck + build pass in demo and live modes.
- [x] 10. README + docs (sources, design, spike-log, demo-script).
- [ ] 8. Deploy + --broadcast runbook — code + runbook written; execution needs a funded testnet key (human).
- [ ] 9. Demo video — script written; recording is a human step.

## Verified locally (this build)
- forge **16/16**; scanner **8/8**; workflow **20/20** + typecheck; app build (demo + live).
- scanner live read-only scan across 8 mainnets, keyless, deployless — classified 0x…01 CLEAN.

## Not runnable here (human steps)
- `cre workflow build/simulate` (CRE CLI not installed), `--broadcast`, `cre workflow deploy`
  (Deploy Access not enabled), faucets, the NOWNodes key, the demo recording, BuilderBase submit.
