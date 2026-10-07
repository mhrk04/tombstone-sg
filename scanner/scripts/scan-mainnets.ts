// READ-ONLY sampler across the 8 mainnets. Prints an anonymised table; full rows -> out/ (gitignored).
import { mkdirSync, writeFileSync } from "node:fs";
import { MAINNETS, publicEndpoint, endpoint, nownodesChains } from "../src/chains";
import { findRecentAuthorities } from "../src/find7702";
import { scanWallets, merge } from "../src/scan";
import { DEFAULT_LISTS } from "../src/lists";

const MAX_BLOCKS = Number(process.env.MAX_BLOCKS ?? 20);

function anon(addr: string): string {
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

async function main() {
  const key = process.env.NOWNODES_API_KEY;
  const enabled = nownodesChains();
  const eth = MAINNETS[0];
  const ep = endpoint(eth, key, enabled);

  console.log(`discovering recent 7702 authorities on ethereum (<=${MAX_BLOCKS} blocks)…`);
  const wallets = await findRecentAuthorities(ep, MAX_BLOCKS, 10);
  if (wallets.length === 0) {
    console.log("no recent 7702 authorities found in the sampled window.");
    return;
  }

  const scans = await scanWallets(MAINNETS, wallets, { key, lists: DEFAULT_LISTS, mode: "batch" });
  const merged = merge(scans.map((s) => ({ chainIndex: s.chainIndex, verdicts: s.verdicts })), wallets);

  console.log("\nwallet            kind  chainMask  reasons");
  for (const w of wallets) {
    const m = merged[w.toLowerCase()];
    console.log(`${anon(w)}  ${m.kind}     0x${m.chainMask.toString(16)}       ${m.reasons.slice(0, 2).join(",")}`);
  }

  mkdirSync("out", { recursive: true });
  writeFileSync("out/scan-mainnets.json", JSON.stringify({ wallets, merged, scans }, null, 2));
  console.log("\nfull rows written to out/scan-mainnets.json (gitignored).");
}
main().catch((e) => { console.error(e); process.exit(1); });
