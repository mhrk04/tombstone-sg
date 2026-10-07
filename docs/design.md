# Design

## Problem
Singapore can freeze a scam victim's **bank** transfers (Protection from Scams Act 2025, Restriction
Orders), but nothing stops money flowing into a self-custody wallet the scammer already controls — our
reading of the RO scope. See `sources.md` for every figure.

## Approach: a graduated, on-chain restriction order
A Chainlink CRE workflow scans watched wallets across 8 EVM mainnets + Sepolia for EIP-7702 sweeper
delegations, reaches DON consensus, and writes graduated flags (SUSPECT → TOMBSTONED → CLEARED) to a
`TombstoneRegistry` on 3 testnets. Consumers read the registry:
- **SafePayroll** escrows (never confiscates) salary bound for a flagged wallet; releases only after the
  employer re-attests a new wallet AND the registry reports it scanned-clean.
- **TombstoneGuard** (a Safe v1.4.1 guard) rejects a Safe transaction signed or executed by a flagged owner.

## State machine
```
NONE ──SUSPECT──▶ SUSPECT ──TOMBSTONE──▶ TOMBSTONED
  │                 │  ▲                     │
  │                 │  └── SUSPECT (no-op if TOMBSTONED: never downgrade)
  └──TOMBSTONE──────┼──────────────────────▶ TOMBSTONED
                    │
          CLEAR (cleanStreak ≥ minCleanScans) ──▶ CLEARED
          CLEAR (cleanStreak <  minCleanScans) ──▶ ClearRejected (no change)
```
No function lets a wallet's own key clear its status. Stale observations (observedAt ≤ last) are ignored.

## Key finding
Sweeper copies embed different thief addresses, so their code hashes differ. Zeroing the PUSH20 operands
yields ONE skeleton hash that catches the whole family (see `spike-log.md`). Stored in
`sweeperSkeletons` and matched by `classifyDelegate`.

## Why CRE, not a script
A flag freezes money, so the writer must be neutral and verifiable: DON consensus +
forwarder-gated `onReport`, not a single key. The registry is contract-readable on every chain.

## Components
- `contracts/` — Foundry (solc 0.8.37, evm_version prague, via_ir OFF). Registry, SafePayroll,
  TombstoneGuard, CodeReader, MockUSDC, SweeperMock + Deploy/DemoSetup scripts.
- `cre-workflow/scan/` — CRE TS workflow (cron + HTTP triggers, node-mode scan, consensus, 3-testnet write).
- `scanner/` — Bun+viem library + CLI (shares `classify.ts`/`codeReader.ts` byte-for-byte with the workflow).
- `app/` — read-only Vite/React dashboard.
