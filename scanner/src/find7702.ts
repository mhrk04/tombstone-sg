import { createPublicClient, http, type Hex } from "viem";
import type { Endpoint } from "./rpc";

/**
 * Recover recent EIP-7702 authorities by scanning type-0x4 transactions in the last `maxBlocks`.
 * Read-only discovery helper for finding wallets to watch.
 */
export async function findRecentAuthorities(
  ep: Endpoint,
  maxBlocks = 40,
  maxAuthorities = 20,
): Promise<string[]> {
  const client = createPublicClient({
    transport: http(ep.url, { fetchOptions: { headers: ep.headers } }),
  });

  const latest = await client.getBlockNumber();
  const authorities = new Set<string>();

  for (let i = 0; i < maxBlocks && authorities.size < maxAuthorities; i++) {
    const bn = latest - BigInt(i);
    if (bn < 0n) break;
    const block = await client.getBlock({ blockNumber: bn, includeTransactions: true });
    for (const tx of block.transactions) {
      if (typeof tx === "string") continue;
      const anyTx = tx as any;
      // EIP-7702 transactions are type 0x4 and carry an authorizationList
      if (anyTx.type === "eip7702" || anyTx.type === "0x4") {
        const list = anyTx.authorizationList ?? [];
        for (const auth of list) {
          const a = (auth.address ?? auth.contractAddress ?? "") as Hex;
          if (auth.r && auth.s && a) {
            // the authority is the signer; viem exposes it when decoded
            if (anyTx.from) authorities.add((anyTx.from as string).toLowerCase());
          }
        }
      }
    }
  }
  return [...authorities].slice(0, maxAuthorities);
}
