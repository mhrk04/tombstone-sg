// Check specific wallets: bun run check 0x… [0x… …] [--deployless] [--testnets]
import { MAINNETS, TESTNETS, nownodesChains } from "../src/chains";
import { scanWallets, merge, type ScanMode } from "../src/scan";
import { DEFAULT_LISTS } from "../src/lists";

async function main() {
  const args = process.argv.slice(2);
  const mode: ScanMode = args.includes("--deployless") ? "deployless" : "batch";
  const useTestnets = args.includes("--testnets");
  const wallets = args.filter((a) => a.startsWith("0x"));
  if (wallets.length === 0) {
    console.error("usage: bun run check 0x… [0x… …] [--deployless] [--testnets]");
    process.exit(1);
  }
  const chains = useTestnets ? [...MAINNETS, ...TESTNETS] : MAINNETS;
  const key = process.env.NOWNODES_API_KEY;
  const scans = await scanWallets(chains, wallets, { key, lists: DEFAULT_LISTS, mode });
  const merged = merge(scans.map((s) => ({ chainIndex: s.chainIndex, verdicts: s.verdicts })), wallets);
  for (const w of wallets) {
    const m = merged[w.toLowerCase()];
    console.log(`${w}  kind=${m.kind}  chainMask=0x${m.chainMask.toString(16)}  ${m.reasons.join(" ")}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
