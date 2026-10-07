# Demo script — Mdm Tan (≤ 2:30, with a 60s cut)

Mdm Tan, 62 (fictional), reads her seed phrase to a fake "MAS officer". Her employer pays her in USDC.
Every number is sourced in `sources.md`. Say plainly: the CRE run is a **single-node simulation** through
MockForwarders.

## Before you record
```bash
set -a; source .env; set +a    # load throwaway testnet keys
# deploy (see README "What you run after login"), then fill config.staging.json targets + app/.env.local
```

## Stage flow
1. **Hook (10s):** "Singaporeans lost S$182.2M to crypto scams last year. Police can now freeze a victim's bank transfers. Nobody stops her salary landing in a drained wallet."
2. **Compromise (15s):**
   ```bash
   cd scanner
   SWEEPER=$(jq -r .sweeper ../contracts/deployments/11155111.json) bun run phish-tan --chain sepolia --chain-id-zero
   ```
   (if chainId 0 is rejected, rerun without `--chain-id-zero`). Show `eth_getCode(tan)=0xef0100…`.
3. **Proof of harm (10s):** `bun run phish-tan --chain sepolia --prove-sweep` → 0.001 ETH swept in the same tx.
4. **CRE run (25s):**
   ```bash
   cd ../cre-workflow
   cre workflow simulate ./scan --target staging-settings --env ../.env --non-interactive --trigger-index 0 --broadcast
   ```
   Show the 3 tx hashes; the dashboard turns red. Say: single-node simulation via MockForwarders.
5. **Payroll (15s):**
   ```bash
   PAYROLL=$(jq -r .payroll contracts/deployments/11155111.json)
   cast send $PAYROLL "runPayroll()" --rpc-url $SEPOLIA_RPC_URL --private-key $PRIVATE_KEY
   ```
   → Bob & Carol **Paid**, Tan's 3,000 mUSDC **Escrowed**.
6. **Safe (10s):** a Safe tx signed by Tan reverts `SignerTombstoned(tan)` (the WazirX lesson).
   Backup: `cd contracts && forge test --mt test_safeGuardRejectsTombstonedSigner -vvvv`.
7. **Graduated release (15s):**
   ```bash
   cast send $PAYROLL "reattest(uint256,address)" 0 $TAN_NEW_ADDRESS --rpc-url $SEPOLIA_RPC_URL --private-key $PRIVATE_KEY
   cre workflow simulate ./scan --target staging-settings --env ../.env --non-interactive --trigger-index 1 \
     --http-payload "{\"wallets\":[\"$TAN_NEW_ADDRESS\"]}" --broadcast
   cast send $PAYROLL "release(uint256)" 0 --rpc-url $SEPOLIA_RPC_URL --private-key $PRIVATE_KEY
   ```
   → 3,000 mUSDC lands in the new wallet. "The old key alone can never do this."
8. **Close (10s):** "A graduated restriction order. Banks told MHA they can't build one yet. Here's one for wallets, readable by any contract on any chain."

## Backup
Recorded video of steps 2–7, static tx links, and the dashboard **demo** mode (`bun run dev` with no env).

## Judge Q&A
- **Why CRE, not a script?** A flag freezes money → needs neutral, verifiable writers: DON consensus, forwarder-gated writes.
- **False positives?** 3 graduated levels, escrow (not confiscation), an allowlist, and employer override.
- **Only 7702?** v1 yes; v2 adds sweep heuristics + Tron USDT.
