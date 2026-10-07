# Spike log

## Skeleton hash (the catch-the-family trick)
EIP-7702 sweeper copies ("CrimeEnjoyor", >97% of delegations) are byte-identical except for the embedded
thief address (a PUSH20 operand). So their raw code hashes all differ and a naive denylist misses copies.

Fix: walk the opcodes; for PUSH1..PUSH32 copy the operand bytes, EXCEPT zero the operand when the opcode
is PUSH20 (0x73); strip the CBOR metadata tail (from the last `a264`); keccak256 the result. Two copies
that differ only by thief address collapse to ONE skeleton hash.

- Verified in `scanner`/`workflow` tests: `skeletonHash(copyA) === skeletonHash(copyB)` for copies that
  differ only in the PUSH20 operand.
- The production skeleton fingerprint shipped in `DEFAULT_LISTS.sweeperSkeletons`
  (`0x84593f69…036fc6d`) was computed by the original author from a real on-chain delegate during a live
  mainnet scan. It is used by `classifyDelegate` as a known-sweeper fingerprint (exact-match). We do NOT
  fabricate a test fixture that reproduces that exact literal; the reproducible test asserts the
  PUSH20-zeroing invariant instead (see `scanner/test/scanner.test.ts`).

## NOWNodes free plan
Batched JSON-RPC works ONLY on `eth.nownodes.io` and `eth-sepolia.nownodes.io` (key in the `api-key`
header). Every other host returns 404 "no access"; Gnosis isn't offered. keyed chains retry once on
`fallbackUrl` after a 404/429; all other chains use public RPC.

## Gotchas carried into the build
- via_ir must stay OFF (Safe v1.4.1 + solc 0.8.37 → stack too deep). evm_version=prague for 7702 cheatcodes.
- TombstoneGuard recomputes the Safe tx hash with `nonce()-1` (Safe increments nonce before the guard runs).
- Dry runs return no tx hash — print `dry-run (no tx hash; use --broadcast)`, never a zero hash.
- TxStatus.SUCCESS === 2 (not 1) in @chainlink/cre-sdk 1.23.0.
- Pin the block for live reads: a victim's delegation can change within seconds and flap identical consensus.
