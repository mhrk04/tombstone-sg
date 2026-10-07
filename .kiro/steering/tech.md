# Tech
- contracts/: Foundry, solc 0.8.37, evm_version prague (vm.signDelegation needs it), optimizer 200, via_ir OFF (Safe v1.4.1 gets "stack too deep" under via_ir). Libraries: forge-std, OpenZeppelin v5.1.0, safe-smart-account v1.4.1. Remappings: forge-std/=lib/forge-std/src/, @openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/, @safe/=lib/safe-smart-account/contracts/.
- cre-workflow/: Chainlink CRE TypeScript SDK @chainlink/cre-sdk 1.23.0 (compiled to WASM by CRE CLI v1.37.0), viem 2.34.0, zod 3.25.76. Tests use @chainlink/cre-sdk/test with bun test.
- scanner/: Bun + viem 2.34.0 library and scripts. app/: Vite 7 + React 19 + viem 2.34.0, read-only.
- Chains. WRITE targets are testnets only: ethereum-testnet-sepolia (11155111), ethereum-testnet-sepolia-base-1 (84532), ethereum-testnet-sepolia-arbitrum-1 (421614). READS: ethereum, base, arbitrum, optimism, bsc, polygon, gnosis, unichain (mainnet, read-only) + sepolia. chainMask bit = index 0..8 in that order.
- NOWNodes: the free key works ONLY on https://eth.nownodes.io and https://eth-sepolia.nownodes.io. The key goes in the api-key header, batched JSON-RPC works, and the rate limit is strict. Every other host returns 404 "no access" on this plan, and Gnosis isn't offered. Chains with keyed=true use NOWNodes and retry ONCE on fallbackUrl after a 404 or 429. All other chains use public RPC.
- CRE account: logged in, but Deploy Access is NOT enabled. Simulate only. --broadcast sends real testnet txs through CRE MockForwarders, signed with CRE_ETH_PRIVATE_KEY.
- MockForwarders: Sepolia 0x15fC6ae953E024d975e77382eEeC56A9101f9F88, Base Sepolia 0x82300bd7c3958625581cc2F77bC6464dcEcDF3e5, Arb Sepolia 0xD41263567DdfeAd91504199b8c6c87371e83ca5d (https://docs.chain.link/cre/guides/workflow/using-evm-client/forwarder-directory).

# Rules
1. Never commit secrets. .env and app/.env.local are gitignored, secrets.yaml only maps IDs to env-var names, and CI runs gitleaks. Use throwaway testnet keys only.
2. Testnets only for writes. Mainnet access is read-only. Nothing may need mainnet funds. phish-tan refuses non-testnet chains.
3. Never fabricate. No invented stats, tx hashes, addresses or test results. A dry-run must print "dry-run (no tx hash; use --broadcast)", never a zero hash. Unverified items are labelled unverified. Say that the demo is a single-node simulation.
4. Don't set gasLimit on writes or deploys.
5. Don't invent SDK APIs. Use only the cre-sdk exports listed in the specs (cre, consensusIdenticalAggregation, getNetwork, prepareReportRequest, ok, decodeJson, bytesToHex, TxStatus, CronPayload, HTTPPayload, NodeRuntime, Runtime).
