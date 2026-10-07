import { classifyDelegate, parseDelegation, merge, type Lists, type Verdict, type PerChain } from "./classify";
import { endpoint, publicEndpoint, nownodesChains, type ScanChain } from "./chains";
import { getCodesBatch, getCodesDeployless, type Fetch } from "./rpc";

export type ScanMode = "batch" | "deployless";

export type ChainScan = { chainIndex: number; ok: boolean; verdicts: Record<string, Verdict> };

export type ScanOptions = {
  key?: string;
  mode?: ScanMode;
  blockTag?: string;
  lists: Lists;
  fetchImpl?: Fetch;
};

/**
 * Scan a set of wallets across a set of chains. One read per chain to fetch wallet codes.
 * Unknown delegates get ONE extra read to fetch delegate code for the skeleton hash.
 * On a NOWNodes 404/429, retry once on the public endpoint. A chain that throws yields
 * ok:false and contributes NO verdicts.
 */
export async function scanWallets(
  chains: ScanChain[],
  wallets: string[],
  opts: ScanOptions,
): Promise<ChainScan[]> {
  const mode = opts.mode ?? "batch";
  const blockTag = opts.blockTag ?? "latest";
  const enabled = nownodesChains();
  const fetchImpl = opts.fetchImpl ?? fetch;

  const results: ChainScan[] = [];

  for (const c of chains) {
    try {
      const ep = endpoint(c, opts.key, enabled);
      const getCodes = (addrs: string[], _ep = ep) =>
        mode === "deployless"
          ? getCodesDeployless(_ep, addrs, blockTag, fetchImpl)
          : getCodesBatch(_ep, addrs, blockTag, fetchImpl);

      let codes: string[];
      try {
        codes = await getCodes(wallets);
      } catch (e: any) {
        // NOWNodes 404/429 -> retry once on public
        if ((e?.status === 404 || e?.status === 429) && ep.via === "nownodes") {
          const pub = publicEndpoint(c);
          codes = mode === "deployless"
            ? await getCodesDeployless(pub, wallets, blockTag, fetchImpl)
            : await getCodesBatch(pub, wallets, blockTag, fetchImpl);
        } else {
          throw e;
        }
      }

      const verdicts: Record<string, Verdict> = {};
      const unknowns: { wallet: string; delegate: string }[] = [];

      for (let i = 0; i < wallets.length; i++) {
        const delegate = parseDelegation(codes[i] ?? "0x");
        const v = classifyDelegate(delegate, opts.lists);
        if (delegate && v.reason === "unknown-delegate") {
          unknowns.push({ wallet: wallets[i], delegate });
        } else {
          verdicts[wallets[i].toLowerCase()] = v;
        }
      }

      // second read for unknown delegates -> compute skeleton
      if (unknowns.length > 0) {
        const ep2 = endpoint(c, opts.key, enabled);
        let delegateCodes: string[];
        try {
          delegateCodes = mode === "deployless"
            ? await getCodesDeployless(ep2, unknowns.map((u) => u.delegate), blockTag, fetchImpl)
            : await getCodesBatch(ep2, unknowns.map((u) => u.delegate), blockTag, fetchImpl);
        } catch (e: any) {
          if ((e?.status === 404 || e?.status === 429) && ep2.via === "nownodes") {
            const pub = publicEndpoint(c);
            delegateCodes = mode === "deployless"
              ? await getCodesDeployless(pub, unknowns.map((u) => u.delegate), blockTag, fetchImpl)
              : await getCodesBatch(pub, unknowns.map((u) => u.delegate), blockTag, fetchImpl);
          } else {
            throw e;
          }
        }
        for (let i = 0; i < unknowns.length; i++) {
          const u = unknowns[i];
          verdicts[u.wallet.toLowerCase()] = classifyDelegate(u.delegate, opts.lists, delegateCodes[i]);
        }
      }

      results.push({ chainIndex: c.index, ok: true, verdicts });
    } catch {
      results.push({ chainIndex: c.index, ok: false, verdicts: {} });
    }
  }

  return results;
}

export { merge };
