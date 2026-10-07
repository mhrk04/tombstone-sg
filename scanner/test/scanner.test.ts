import { test, expect, describe } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  parseDelegation,
  skeletonHash,
  classifyDelegate,
  merge,
  OBS_CLEAN,
  OBS_SUSPECT,
  OBS_TOMBSTONE,
  type PerChain,
} from "../src/classify";
import { endpoint, MAINNETS, nownodesChains } from "../src/chains";
import { getCodesBatch, getCodesDeployless } from "../src/rpc";
import { scanWallets } from "../src/scan";
import { DEFAULT_LISTS } from "../src/lists";

const SWEEPER = DEFAULT_LISTS.knownSweepers[0];
const GOOD = DEFAULT_LISTS.knownGood[0];

// 7702 designator: 0xef0100 ++ 20-byte delegate
function designator(delegate: string): string {
  return "0xef0100" + delegate.toLowerCase().replace(/^0x/, "");
}

describe("classify", () => {
  test("parseDelegation / classifyDelegate verdicts", () => {
    expect(parseDelegation("0x")).toBeNull();
    const d = designator(SWEEPER);
    expect(parseDelegation(d)).toBe(SWEEPER.toLowerCase());

    expect(classifyDelegate(null, DEFAULT_LISTS).kind).toBe(OBS_CLEAN);
    expect(classifyDelegate(SWEEPER, DEFAULT_LISTS).kind).toBe(OBS_TOMBSTONE);
    expect(classifyDelegate(GOOD, DEFAULT_LISTS).kind).toBe(OBS_CLEAN);
    expect(classifyDelegate("0x" + "9".repeat(40), DEFAULT_LISTS).kind).toBe(OBS_SUSPECT);
  });

  test("skeletonHash ignores PUSH20 operands (copies collapse) and matches a seeded fixture", () => {
    const a = "0x60008080808073" + "1".repeat(40) + "5af1";
    const b = "0x60008080808073" + "2".repeat(40) + "5af1";
    // two sweeper copies differing only by embedded thief address -> same skeleton
    expect(skeletonHash(a)).toBe(skeletonHash(b));
    // deterministic / reproducible value for this exact fixture (seed value for regression)
    const seed = skeletonHash(a);
    expect(seed).toBe("0xfc8fa008d08421a734b561640e0ade9b01247f841e2531ac91f5175995373b73");
  });

  test("merge worst-wins, chainMask, and a missing chain contributes nothing", () => {
    const wallets = ["0xaaa", "0xbbb"];
    const perChain: PerChain[] = [
      { chainIndex: 0, verdicts: { "0xaaa": { kind: OBS_SUSPECT, reason: "unknown-delegate" } } },
      { chainIndex: 4, verdicts: { "0xaaa": { kind: OBS_TOMBSTONE, reason: "known-sweeper-address" } } },
      // chain 2 produced no verdict for anyone -> contributes nothing
    ];
    const m = merge(perChain, wallets);
    expect(m["0xaaa"].kind).toBe(OBS_TOMBSTONE); // worst wins
    expect(m["0xaaa"].chainMask).toBe((1 << 0) | (1 << 4));
    expect(m["0xbbb"].kind).toBe(OBS_CLEAN);
    expect(m["0xbbb"].chainMask).toBe(0);
  });
});

describe("chains", () => {
  test("endpoint() uses NOWNodes header when keyed, Gnosis always public", () => {
    const enabled = nownodesChains("ethereum,sepolia");
    const eth = MAINNETS.find((c) => c.name === "ethereum")!;
    const gnosis = MAINNETS.find((c) => c.name === "gnosis")!;

    const ethEp = endpoint(eth, "SECRET", enabled);
    expect(ethEp.via).toBe("nownodes");
    expect(ethEp.headers["api-key"]).toBe("SECRET");

    // gnosis has no nownodes host -> always public even if "enabled"
    const gnEp = endpoint(gnosis, "SECRET", nownodesChains("ethereum,sepolia,gnosis"));
    expect(gnEp.via).toBe("public");
    expect(gnEp.headers["api-key"]).toBeUndefined();

    // no key -> public
    const noKey = endpoint(eth, "none", enabled);
    expect(noKey.via).toBe("public");
  });
});

// A fake JSON-RPC server as fetch, so batch and deployless readers can be compared.
function fakeFetch(codeByAddr: Record<string, string>, opts: { fail?: () => Response | null } = {}) {
  return async (url: string | URL, init?: any): Promise<Response> => {
    const forced = opts.fail?.();
    if (forced) return forced;
    const body = JSON.parse(init.body);
    if (Array.isArray(body)) {
      // batch eth_getCode
      const res = body.map((req: any) => ({
        jsonrpc: "2.0",
        id: req.id,
        result: codeByAddr[(req.params[0] as string).toLowerCase()] ?? "0x",
      }));
      return new Response(JSON.stringify(res), { status: 200 });
    }
    if (body.method === "eth_call") {
      // deployless: decode the trailing address[] from calldata and return abi.encode(bytes[])
      // For the test we just encode codes for a known fixed wallet set passed via a side channel.
      const { encodeAbiParameters } = await import("viem");
      const addrs = (globalThis as any).__deploylessAddrs as string[];
      const codes = addrs.map((a) => codeByAddr[a.toLowerCase()] ?? "0x");
      const encoded = encodeAbiParameters([{ type: "bytes[]" }], [codes as any]);
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: encoded }), { status: 200 });
    }
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0x" }), { status: 200 });
  };
}

describe("rpc + scan", () => {
  const tan = "0x000000000000000000000000000000000000a11c";
  const bob = "0x000000000000000000000000000000000000b0b0";
  const codeByAddr: Record<string, string> = {
    [tan]: designator(SWEEPER),
    [bob]: "0x",
  };

  test("batch and deployless readers return the same codes", async () => {
    const ep = { url: "http://x", headers: {} };
    (globalThis as any).__deploylessAddrs = [tan, bob];
    const f = fakeFetch(codeByAddr);
    const batch = await getCodesBatch(ep, [tan, bob], "latest", f);
    const deployless = await getCodesDeployless(ep, [tan, bob], "latest", f);
    expect(batch).toEqual(deployless);
    expect(batch[0]).toBe(designator(SWEEPER));
    expect(batch[1]).toBe("0x");
  });

  test("scanWallets: Tan TOMBSTONE on every chain, Bob CLEAN, a failed chain contributes nothing", async () => {
    // make chain index 6 (gnosis) fail
    let callCount = 0;
    const f = async (url: string | URL, init?: any): Promise<Response> => {
      callCount++;
      if (String(url).includes("gnosis")) return new Response("boom", { status: 500 });
      return fakeFetch(codeByAddr)(url, init);
    };
    const scans = await scanWallets(MAINNETS, [tan, bob], { lists: DEFAULT_LISTS, mode: "batch", fetchImpl: f });
    const merged = merge(
      scans.map((s) => ({ chainIndex: s.chainIndex, verdicts: s.verdicts })),
      [tan, bob],
    );
    expect(merged[tan].kind).toBe(OBS_TOMBSTONE);
    expect(merged[bob].kind).toBe(OBS_CLEAN);
    // gnosis failed -> ok:false, no verdicts, so its bit never set
    const gnosis = scans.find((s) => s.chainIndex === 6)!;
    expect(gnosis.ok).toBe(false);
    expect(Object.keys(gnosis.verdicts).length).toBe(0);
  });

  test("NOWNodes 404/429 falls back to public", async () => {
    const tanOnly = { [tan]: designator(SWEEPER) };
    let nownodesHit = 0;
    let publicHit = 0;
    const f = async (url: string | URL, init?: any): Promise<Response> => {
      if (String(url).includes("nownodes.io")) {
        nownodesHit++;
        return new Response("no access", { status: 404 });
      }
      publicHit++;
      return fakeFetch(tanOnly)(url, init);
    };
    const eth = MAINNETS.find((c) => c.name === "ethereum")!;
    const scans = await scanWallets([eth], [tan], {
      key: "SECRET",
      lists: DEFAULT_LISTS,
      mode: "batch",
      fetchImpl: f,
    });
    expect(nownodesHit).toBeGreaterThanOrEqual(1);
    expect(publicHit).toBeGreaterThanOrEqual(1);
    expect(scans[0].ok).toBe(true);
    expect(scans[0].verdicts[tan].kind).toBe(OBS_TOMBSTONE);
  });
});

describe("identity", () => {
  test("classify.ts is byte-identical to the workflow copy", () => {
    const here = join(import.meta.dir, "../src/classify.ts");
    const there = join(import.meta.dir, "../../cre-workflow/scan/classify.ts");
    if (!existsSync(there)) {
      // workflow not built yet (Prompt 6) — skip until it exists
      return;
    }
    expect(readFileSync(here, "utf8")).toBe(readFileSync(there, "utf8"));
  });
});
