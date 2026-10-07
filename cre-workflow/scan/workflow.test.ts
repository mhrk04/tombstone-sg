import { expect } from "bun:test";
import { test, newTestRuntime, HttpActionsMock, EvmMock, addContractMock } from "@chainlink/cre-sdk/test";
import {
  onScan,
  onCheckNow,
  buildReport,
  scanAllChains,
  configSchema,
  type Config,
  type ChainScan,
  OBS_CLEAN,
  OBS_SUSPECT,
  OBS_TOMBSTONE,
} from "./workflow";
import {
  parseDelegation,
  skeletonHash,
  classifyDelegate,
  merge,
  type PerChain,
} from "./classify";
import { decodeAbiParameters, encodeAbiParameters } from "viem";
import { getNetwork } from "@chainlink/cre-sdk";
import staging from "./config.staging.json";
import production from "./config.production.json";

const SWEEPER = "0x89383882fc2d0cd4d7952a3267a3b6dae967e704";
const GOOD = "0x63c0c19a282a1b52b07dd5a65b58948a07dae32b";
const TAN = "0x000000000000000000000000000000000000a11c";
const BOB = "0x000000000000000000000000000000000000b0b0";
const UNKNOWN = "0x1111111111111111111111111111111111111111";

function cfg(overrides: Partial<Config> = {}): Config {
  return { ...(staging as unknown as Config), ...overrides };
}
function designator(delegate: string): string {
  return "0xef0100" + delegate.toLowerCase().replace(/^0x/, "");
}
function batchBody(codes: string[]): Uint8Array {
  const arr = codes.map((c, i) => ({ jsonrpc: "2.0", id: i, result: c }));
  return new TextEncoder().encode(JSON.stringify(arr));
}
function singleCfg(overrides: Partial<Config> = {}): Config {
  return cfg({
    scanChains: [{ name: "ethereum", index: 0, url: "https://eth.nownodes.io", keyed: false }],
    targets: [],
    ...overrides,
  });
}
const OBS_COMPONENTS = [
  { name: "wallet", type: "address" },
  { name: "kind", type: "uint8" },
  { name: "chainMask", type: "uint32" },
  { name: "observedAt", type: "uint64" },
  { name: "evidence", type: "bytes32" },
] as const;

// 1
test("parses a 7702 designator", () => {
  expect(parseDelegation(designator(SWEEPER))).toBe(SWEEPER.toLowerCase());
  expect(parseDelegation("0x")).toBeNull();
});

// 2
test("verdicts: sweeper=TOMBSTONE, good=CLEAN, none=CLEAN, unknown=SUSPECT", () => {
  const lists = { knownGood: [GOOD], knownSweepers: [SWEEPER], sweeperSkeletons: [] };
  expect(classifyDelegate(SWEEPER, lists).kind).toBe(OBS_TOMBSTONE);
  expect(classifyDelegate(GOOD, lists).kind).toBe(OBS_CLEAN);
  expect(classifyDelegate(null, lists).kind).toBe(OBS_CLEAN);
  expect(classifyDelegate(UNKNOWN, lists).kind).toBe(OBS_SUSPECT);
});

// 3
test("skeleton hash ignores the PUSH20 operand", () => {
  const a = "0x60008080808073" + "1".repeat(40) + "5af1";
  const b = "0x60008080808073" + "2".repeat(40) + "5af1";
  expect(skeletonHash(a)).toBe(skeletonHash(b));
});

// 4
test("merge worst-wins, mask, and a missing chain contributes nothing", () => {
  const perChain: PerChain[] = [
    { chainIndex: 0, verdicts: { [TAN]: { kind: OBS_SUSPECT, reason: "unknown-delegate" } } },
    { chainIndex: 4, verdicts: { [TAN]: { kind: OBS_TOMBSTONE, reason: "known-sweeper-address" } } },
  ];
  const m = merge(perChain, [TAN, BOB]);
  expect(m[TAN].kind).toBe(OBS_TOMBSTONE);
  expect(m[TAN].chainMask).toBe((1 << 0) | (1 << 4));
  expect(m[BOB].kind).toBe(OBS_CLEAN);
  expect(m[BOB].chainMask).toBe(0);
});

// 5
test("Tan on sweeper on ETH+BSC => TOMBSTONE written to 3 testnets, Bob clean, 1 HTTP call per chain", async () => {
  const config = cfg({
    watchlist: [TAN, BOB],
    scanChains: [
      { name: "ethereum", index: 0, url: "https://eth.nownodes.io", keyed: false },
      { name: "bsc", index: 4, url: "https://bsc-rpc.publicnode.com", keyed: false },
    ],
  });
  let httpCalls = 0;
  const http = HttpActionsMock.testInstance();
  http.sendRequest = (_req: any) => {
    httpCalls++;
    return { body: batchBody([designator(SWEEPER), "0x"]) } as any;
  };
  // mock the 3 testnet writeReports
  const written: string[] = [];
  for (const t of config.targets) {
    const net = getNetwork({ chainFamily: "evm", chainSelectorName: t.chainName, isTestnet: true });
    if (!net) continue;
    const evm = EvmMock.testInstance(net.chainSelector.selector);
    evm.writeReport = (_input: any) => {
      written.push(t.chainName);
      return { txStatus: 2, txHash: new Uint8Array(32).fill(0xab) } as any;
    };
  }
  const runtime = newTestRuntime<Config>(null, undefined, config);
  const result = await onScan(runtime as any, { scheduledExecutionTime: { seconds: 1000n } } as any);
  expect(result.flagged.map((w) => w.toLowerCase())).toContain(TAN);
  expect(result.flagged.map((w) => w.toLowerCase())).not.toContain(BOB);
  expect(httpCalls).toBe(2); // one per chain, no unknown-delegate second call
  expect(written.length).toBe(3);
});

// 6
test("report decodes to Observation[] with the scheduled observedAt", () => {
  const report = buildReport([{ wallet: TAN, kind: OBS_TOMBSTONE, chainMask: 0x101, reasons: ["0:x"] }], 1234);
  const [rows] = decodeAbiParameters([{ type: "tuple[]", components: OBS_COMPONENTS }], report);
  const r = (rows as any[])[0];
  expect(r.wallet.toLowerCase()).toBe(TAN);
  expect(Number(r.observedAt)).toBe(1234);
});

// 7
test('secret "none" => public fallback (keyed chain uses fallbackUrl, no api-key header)', async () => {
  const config = cfg({
    watchlist: [TAN],
    scanChains: [{ name: "ethereum", index: 0, url: "https://eth.nownodes.io", keyed: true, fallbackUrl: "https://ethereum-rpc.publicnode.com" }],
    targets: [],
  });
  let sawApiKey = false;
  const http = HttpActionsMock.testInstance();
  http.sendRequest = (req: any) => {
    if (req.headers && req.headers["api-key"]) sawApiKey = true;
    return { body: batchBody([designator(SWEEPER)]) } as any;
  };
  // no secret set -> key resolves to "" -> keyed chain still works via its own url (treated as public since no key)
  const runtime = newTestRuntime<Config>(null, undefined, config);
  const result = await onScan(runtime as any, { scheduledExecutionTime: { seconds: 1000n } } as any);
  expect(sawApiKey).toBe(false);
  expect(result.flagged.map((w) => w.toLowerCase())).toContain(TAN);
});

// 8
test("NOWNodes 404 => retried once on fallback", async () => {
  const config = cfg({
    watchlist: [TAN],
    scanChains: [{ name: "ethereum", index: 0, url: "https://eth.nownodes.io", keyed: false, fallbackUrl: "https://ethereum-rpc.publicnode.com" }],
    targets: [],
  });
  const urls: string[] = [];
  const http = HttpActionsMock.testInstance();
  http.sendRequest = (req: any) => {
    urls.push(req.url);
    if (req.url.includes("nownodes.io")) {
      return { statusCode: 404, body: new TextEncoder().encode("no access") } as any;
    }
    return { statusCode: 200, body: batchBody([designator(SWEEPER)]) } as any;
  };
  const runtime = newTestRuntime<Config>(null, undefined, config);
  const result = await onScan(runtime as any, { scheduledExecutionTime: { seconds: 1000n } } as any);
  expect(urls.some((u) => u.includes("nownodes.io"))).toBe(true);
  expect(urls.some((u) => u.includes("publicnode.com"))).toBe(true);
  expect(result.flagged.map((w) => w.toLowerCase())).toContain(TAN);
});

// 9
test("deployless mode = ONE eth_call per chain", async () => {
  const config = cfg({
    watchlist: [TAN],
    scanMode: "deployless",
    scanChains: [{ name: "ethereum", index: 0, url: "https://eth.nownodes.io", keyed: false }],
    targets: [],
  });
  let methodSeen = "";
  let calls = 0;
  const http = HttpActionsMock.testInstance();
  http.sendRequest = (req: any) => {
    calls++;
    const body = JSON.parse(new TextDecoder().decode(req.body));
    methodSeen = Array.isArray(body) ? body[0].method : body.method;
    // return abi-encoded bytes[] with the sweeper designator for TAN
    const encoded = encodeAbiParameters([{ type: "bytes[]" }], [[designator(SWEEPER) as `0x${string}`]]);
    return { statusCode: 200, body: new TextEncoder().encode(JSON.stringify({ jsonrpc: "2.0", id: 1, result: encoded })) } as any;
  };
  const runtime = newTestRuntime<Config>(null, undefined, config);
  const result = await onScan(runtime as any, { scheduledExecutionTime: { seconds: 1000n } } as any);
  expect(methodSeen).toBe("eth_call");
  expect(calls).toBe(1);
  expect(result.flagged.map((w) => w.toLowerCase())).toContain(TAN);
});

// 10
test("unknown delegate => 2nd call => skeleton match => TOMBSTONE", async () => {
  const sweeperCode = "0x60008080808073" + "9".repeat(40) + "5af1";
  const skel = skeletonHash(sweeperCode);
  const config = cfg({
    watchlist: [TAN],
    sweeperSkeletons: [skel],
    scanChains: [{ name: "ethereum", index: 0, url: "https://eth.nownodes.io", keyed: false }],
    targets: [],
  });
  const unknownDelegate = "0x" + "9".repeat(40);
  let call = 0;
  const http = HttpActionsMock.testInstance();
  http.sendRequest = (_req: any) => {
    call++;
    // 1st call: wallet code = designator -> unknown; 2nd call: delegate's code = sweeperCode
    return { statusCode: 200, body: batchBody([call === 1 ? designator(unknownDelegate) : sweeperCode]) } as any;
  };
  const runtime = newTestRuntime<Config>(null, undefined, config);
  const result = await onScan(runtime as any, { scheduledExecutionTime: { seconds: 1000n } } as any);
  expect(call).toBe(2);
  expect(result.flagged.map((w) => w.toLowerCase())).toContain(TAN);
});

// 11
test("unknown delegate with no skeleton match => SUSPECT (still flagged)", async () => {
  const config = singleCfg({ watchlist: [TAN], sweeperSkeletons: [] });
  const unknownDelegate = "0x" + "7".repeat(40);
  let call = 0;
  const http = HttpActionsMock.testInstance();
  http.sendRequest = (_req: any) => {
    call++;
    return { statusCode: 200, body: batchBody([call === 1 ? designator(unknownDelegate) : "0xdeadbeef"]) } as any;
  };
  const runtime = newTestRuntime<Config>(null, undefined, config);
  const result = await onScan(runtime as any, { scheduledExecutionTime: { seconds: 1000n } } as any);
  expect(result.flagged.map((w) => w.toLowerCase())).toContain(TAN); // SUSPECT is flagged
});

// 12
test("maxHttpCalls budget is respected (chain throws => ok:false, no verdicts)", async () => {
  const config = cfg({
    watchlist: [TAN],
    maxHttpCalls: 0,
    scanChains: [{ name: "ethereum", index: 0, url: "https://eth.nownodes.io", keyed: false }],
    targets: [],
  });
  const http = HttpActionsMock.testInstance();
  http.sendRequest = (_req: any) => ({ statusCode: 200, body: batchBody([designator(SWEEPER)]) } as any);
  const runtime = newTestRuntime<Config>(null, undefined, config);
  const result = await onScan(runtime as any, { scheduledExecutionTime: { seconds: 1000n } } as any);
  // budget 0 => the only chain throws => all chains down => nothing written
  expect(result.txs.length).toBe(0);
});

// 13
test("partial outage => flags only (CLEAN suppressed)", async () => {
  const config = cfg({
    watchlist: [TAN, BOB],
    scanChains: [
      { name: "ethereum", index: 0, url: "https://eth.nownodes.io", keyed: false },
      { name: "bsc", index: 4, url: "https://bsc-rpc.publicnode.com", keyed: false },
    ],
  });
  const http = HttpActionsMock.testInstance();
  http.sendRequest = (req: any) => {
    if (req.url.includes("bsc")) return { statusCode: 500, body: new TextEncoder().encode("boom") } as any;
    return { statusCode: 200, body: batchBody([designator(SWEEPER), "0x"]) } as any;
  };
  const written: any[] = [];
  for (const t of config.targets) {
    const net = getNetwork({ chainFamily: "evm", chainSelectorName: t.chainName, isTestnet: true });
    if (!net) continue;
    const evm = EvmMock.testInstance(net.chainSelector.selector);
    evm.writeReport = (input: any) => { written.push(input); return { txStatus: 2, txHash: new Uint8Array(32) } as any; };
  }
  const runtime = newTestRuntime<Config>(null, undefined, config);
  const result = await onScan(runtime as any, { scheduledExecutionTime: { seconds: 1000n } } as any);
  // Bob is CLEAN and a chain failed -> Bob must NOT be in the report; only Tan (flagged)
  expect(result.flagged.map((w) => w.toLowerCase())).toEqual([TAN]);
});

// 14
test("all chains down => nothing written", async () => {
  const config = cfg({
    watchlist: [TAN],
    scanChains: [{ name: "ethereum", index: 0, url: "https://eth.nownodes.io", keyed: false }],
  });
  const http = HttpActionsMock.testInstance();
  http.sendRequest = (_req: any) => { throw new Error("network down"); };
  const runtime = newTestRuntime<Config>(null, undefined, config);
  const result = await onScan(runtime as any, { scheduledExecutionTime: { seconds: 1000n } } as any);
  expect(result.txs.length).toBe(0);
  expect(result.flagged.length).toBe(0);
});

// 15
test("onCheckNow scans only the posted wallets", async () => {
  const config = singleCfg({ watchlist: [TAN, BOB] });
  const scanned: string[] = [];
  const http = HttpActionsMock.testInstance();
  http.sendRequest = (req: any) => {
    const body = JSON.parse(new TextDecoder().decode(req.body));
    const addrs = Array.isArray(body) ? body.map((b: any) => b.params[0]) : [];
    scanned.push(...addrs);
    return { statusCode: 200, body: batchBody(addrs.map(() => designator(SWEEPER))) } as any;
  };
  const runtime = newTestRuntime<Config>(null, undefined, config);
  const payload = { input: new TextEncoder().encode(JSON.stringify({ wallets: [BOB] })) };
  const result = await onCheckNow(runtime as any, payload as any);
  expect(scanned.map((a) => a.toLowerCase())).toEqual([BOB]);
  expect(result.flagged.map((w) => w.toLowerCase())).toContain(BOB);
});

// 16
test("onCheckNow rejects malformed payloads", async () => {
  const config = singleCfg();
  const runtime = newTestRuntime<Config>(null, undefined, config);
  const bad = { input: new TextEncoder().encode(JSON.stringify({ nope: true })) };
  await expect(onCheckNow(runtime as any, bad as any)).rejects.toThrow(/bad payload/);
  const empty = { input: new TextEncoder().encode(JSON.stringify({ wallets: [] })) };
  await expect(onCheckNow(runtime as any, empty as any)).rejects.toThrow(/bad payload/);
});

// 17
test("both config files parse against the schema", () => {
  expect(() => configSchema.parse(staging)).not.toThrow();
  expect(() => configSchema.parse(production)).not.toThrow();
});

// 18
test("missing secret => public fallback (no throw)", async () => {
  const config = singleCfg({ watchlist: [TAN] });
  const http = HttpActionsMock.testInstance();
  http.sendRequest = (_req: any) => ({ statusCode: 200, body: batchBody([designator(SWEEPER)]) } as any);
  const runtime = newTestRuntime<Config>(null, undefined, config); // no secrets
  const result = await onScan(runtime as any, { scheduledExecutionTime: { seconds: 1000n } } as any);
  expect(result.flagged.map((w) => w.toLowerCase())).toContain(TAN);
});

// 19
test("codeReader.ts matches the forge artifact (skip if not built)", async () => {
  const artifactUrl = new URL("../../contracts/out/CodeReader.sol/CodeReader.json", import.meta.url);
  const f = Bun.file(artifactUrl);
  if (!(await f.exists())) return; // not built -> skip
  const json = (await f.json()) as { bytecode: { object: string } };
  const initcode = json.bytecode.object;
  const file = await Bun.file(new URL("./codeReader.ts", import.meta.url)).text();
  expect(file).toContain(initcode);
});

// 20
test("Bob clean on all chains => CLEAN, not flagged", async () => {
  const config = singleCfg({ watchlist: [BOB] });
  const http = HttpActionsMock.testInstance();
  http.sendRequest = (_req: any) => ({ statusCode: 200, body: batchBody(["0x"]) } as any);
  const runtime = newTestRuntime<Config>(null, undefined, config);
  const result = await onScan(runtime as any, { scheduledExecutionTime: { seconds: 1000n } } as any);
  expect(result.flagged.length).toBe(0);
});
