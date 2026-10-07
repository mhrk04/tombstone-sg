import { z } from "zod";
import {
  cre,
  consensusIdenticalAggregation,
  getNetwork,
  prepareReportRequest,
  ok,
  decodeJson,
  bytesToHex,
  TxStatus,
  type Runtime,
  type NodeRuntime,
  type CronPayload,
  type HTTPPayload,
} from "@chainlink/cre-sdk";
import {
  encodeAbiParameters,
  encodeFunctionData,
  keccak256,
  toHex,
  type Hex,
} from "viem";
import {
  parseDelegation,
  classifyDelegate,
  merge,
  type Lists,
  type Verdict,
  type PerChain,
} from "./classify";
import { CODE_READER_INITCODE } from "./codeReader";

// --- config schema ---

const scanChainSchema = z.object({
  name: z.string(),
  index: z.number().int().min(0).max(31),
  url: z.string(),
  keyed: z.boolean().default(false),
  fallbackUrl: z.string().optional(),
});

export const configSchema = z.object({
  schedule: z.string(),
  scanChains: z.array(scanChainSchema),
  scanMode: z.enum(["batch", "deployless"]).default("batch"),
  blockTag: z.string().default("latest"),
  watchlist: z.array(z.string()).default([]),
  knownGood: z.array(z.string()).default([]),
  knownSweepers: z.array(z.string()).default([]),
  sweeperSkeletons: z.array(z.string()).default([]),
  maxHttpCalls: z.number().int().default(15),
  maxWalletsPerRun: z.number().int().default(50),
  httpAuthorizedKeys: z.array(z.string()).default([]),
  targets: z.array(z.object({ chainName: z.string(), registry: z.string() })),
});

export type Config = z.infer<typeof configSchema>;
type ScanChainCfg = z.infer<typeof scanChainSchema>;

export const OBS_CLEAN = 0;
export const OBS_SUSPECT = 1;
export const OBS_TOMBSTONE = 2;

export type ChainScan = { chainIndex: number; ok: boolean; verdicts: Record<string, Verdict> };

function listsFromConfig(c: Config): Lists {
  return {
    knownGood: c.knownGood,
    knownSweepers: c.knownSweepers,
    sweeperSkeletons: c.sweeperSkeletons,
  };
}

// --- node-mode scanning: one HTTP call per chain (plus one for unknown delegates) ---

export function scanAllChains(
  nodeRuntime: NodeRuntime<Config>,
  key: string,
  wallets: string[],
): ChainScan[] {
  const config = nodeRuntime.config;
  const lists = listsFromConfig(config);
  const http = new cre.capabilities.HTTPClient();

  let calls = 0;
  const budget = () => {
    if (calls >= config.maxHttpCalls) throw new Error("http budget exceeded");
    calls++;
  };

  const hasKey = !!key && key !== "none" && key !== "";

  const post = (chain: ScanChainCfg, url: string, headers: Record<string, string>, payload: unknown): any => {
    budget();
    const body = new TextEncoder().encode(JSON.stringify(payload));
    const resp = http.sendRequest(nodeRuntime, { url, method: "POST", headers, body }).result();
    return resp;
  };

  const parseBody = (resp: any): any => {
    // Response.body is bytes; decode to JSON
    const bytes: Uint8Array = resp.body ?? new Uint8Array();
    const text = new TextDecoder().decode(bytes);
    return text ? JSON.parse(text) : {};
  };

  const getCodes = (chain: ScanChainCfg, addrs: string[]): string[] => {
    const useNowNodes = chain.keyed && hasKey;
    const primaryUrl = chain.url;
    const primaryHeaders: Record<string, string> = useNowNodes ? { "api-key": key } : {};

    const buildPayload = () => {
      if (config.scanMode === "deployless") {
        const encoded = encodeAbiParameters([{ type: "address[]" }], [addrs as Hex[]]);
        const data = (CODE_READER_INITCODE + encoded.slice(2)) as Hex;
        return { jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ data }, config.blockTag] };
      }
      return addrs.map((a, i) => ({
        jsonrpc: "2.0",
        id: i,
        method: "eth_getCode",
        params: [a, config.blockTag],
      }));
    };

    const payload = buildPayload();
    let resp = post(chain, primaryUrl, primaryHeaders, payload);

    // 404/429 on NOWNodes -> retry once on fallbackUrl (public), without api-key
    if (!ok(resp) && chain.fallbackUrl) {
      nodeRuntime.log(`chain ${chain.name}: primary not ok, retrying on fallback`);
      resp = post(chain, chain.fallbackUrl, {}, payload);
    }

    const json = parseBody(resp);
    if (config.scanMode === "deployless") {
      // decode abi-encoded bytes[] from eth_call result
      const result: Hex = json.result;
      return decodeBytesArray(result);
    }
    const arr = Array.isArray(json) ? json : [json];
    const byId = new Map<number, string>();
    for (const r of arr) byId.set(r.id, r.result ?? "0x");
    return addrs.map((_, i) => byId.get(i) ?? "0x");
  };

  const results: ChainScan[] = [];
  const chains = config.scanChains;

  for (let ci = 0; ci < chains.length; ci++) {
    const chain = chains[ci];
    const remainingChains = chains.length - ci - 1;
    try {
      const codes = getCodes(chain, wallets);
      const verdicts: Record<string, Verdict> = {};
      const unknowns: { wallet: string; delegate: string }[] = [];

      for (let i = 0; i < wallets.length; i++) {
        const delegate = parseDelegation(codes[i] ?? "0x");
        const v = classifyDelegate(delegate, lists);
        if (delegate && v.reason === "unknown-delegate") {
          unknowns.push({ wallet: wallets[i], delegate });
        } else {
          verdicts[wallets[i].toLowerCase()] = v;
        }
      }

      // second read for unknown delegates, only if we still have budget headroom
      if (unknowns.length > 0 && calls < config.maxHttpCalls - remainingChains) {
        const delegateCodes = getCodes(chain, unknowns.map((u) => u.delegate));
        for (let i = 0; i < unknowns.length; i++) {
          verdicts[unknowns[i].wallet.toLowerCase()] = classifyDelegate(
            unknowns[i].delegate,
            lists,
            delegateCodes[i],
          );
        }
      } else {
        // not enough budget: leave unknowns as SUSPECT
        for (const u of unknowns) {
          verdicts[u.wallet.toLowerCase()] = classifyDelegate(u.delegate, lists);
        }
      }

      results.push({ chainIndex: chain.index, ok: true, verdicts });
    } catch (e) {
      nodeRuntime.log(`chain ${chain.name} failed: ${String(e)}`);
      results.push({ chainIndex: chain.index, ok: false, verdicts: {} });
    }
  }

  return results;
}

// decode a solidity abi-encoded bytes[] (hex) into string[] of 0x-codes
function decodeBytesArray(hex: Hex): string[] {
  // minimal decoder to avoid pulling viem decodeAbiParameters into node mode typing noise
  const data = hex.slice(2);
  const word = (i: number) => data.slice(i * 64, i * 64 + 64);
  const toNum = (w: string) => parseInt(w, 16);
  const base = toNum(word(0)) / 32; // offset to the array (usually 32 -> word 1)
  const len = toNum(word(base));
  const out: string[] = [];
  for (let k = 0; k < len; k++) {
    const elOff = toNum(word(base + 1 + k)) / 32 + base + 1;
    const elLen = toNum(word(elOff));
    const bytesHex = data.slice((elOff + 1) * 64, (elOff + 1) * 64 + elLen * 2);
    out.push("0x" + bytesHex);
  }
  return out;
}

// --- report building ---

export function buildReport(
  obs: { wallet: string; kind: number; chainMask: number; reasons: string[] }[],
  observedAt: number,
): Hex {
  const rows = obs.map((o) => ({
    wallet: o.wallet as Hex,
    kind: o.kind,
    chainMask: o.chainMask,
    observedAt: BigInt(observedAt),
    evidence: keccak256(toHex(o.reasons.join("|"))),
  }));
  return encodeAbiParameters(
    [
      {
        type: "tuple[]",
        components: [
          { name: "wallet", type: "address" },
          { name: "kind", type: "uint8" },
          { name: "chainMask", type: "uint32" },
          { name: "observedAt", type: "uint64" },
          { name: "evidence", type: "bytes32" },
        ],
      },
    ],
    [rows],
  );
}

const ON_REPORT_ABI = [
  {
    type: "function",
    name: "onReport",
    inputs: [
      { name: "metadata", type: "bytes" },
      { name: "report", type: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

// --- the scan + write pipeline ---

export async function runScan(runtime: Runtime<Config>, wallets: string[], observedAt: number) {
  const config = runtime.config;
  const lists = listsFromConfig(config);

  // optional NOWNodes secret
  let key = "";
  try {
    key = (runtime.getSecret({ id: "NOWNODES_API_KEY" }).result() as any).value ?? "";
  } catch {
    key = "";
  }

  const scans = runtime
    .runInNodeMode(scanAllChains, consensusIdenticalAggregation<ChainScan[]>())(key, wallets)
    .result();

  const okCount = scans.filter((s) => s.ok).length;
  const keyedNames = config.scanChains.filter((c) => c.keyed).map((c) => c.name);
  const publicNames = config.scanChains.filter((c) => !c.keyed).map((c) => c.name);
  runtime.log(
    `scanned ${scans.length} chains (${okCount} ok) via NOWNodes [${keyedNames.join(",")}] + public RPC [${publicNames.join(",")}] · mode=${config.scanMode} · ${wallets.length} wallets`,
  );

  if (okCount === 0) {
    runtime.log("all chains down — nothing written");
    return { flagged: [], txs: [] as string[] };
  }

  const merged = merge(scans.map((s) => ({ chainIndex: s.chainIndex, verdicts: s.verdicts })) as PerChain[], wallets);

  const anyFailed = scans.some((s) => !s.ok);
  const obs: { wallet: string; kind: number; chainMask: number; reasons: string[] }[] = [];
  for (const [wallet, m] of Object.entries(merged)) {
    runtime.log(`  ${wallet}: kind=${m.kind} mask=0x${m.chainMask.toString(16)} ${m.reasons.join(" ")}`);
    // PARTIAL OUTAGE: if any chain failed, only report kind>0 (never CLEAN)
    if (anyFailed && m.kind === OBS_CLEAN) continue;
    obs.push({ wallet, kind: m.kind, chainMask: m.chainMask, reasons: m.reasons });
  }

  if (obs.length === 0) {
    return { flagged: [], txs: [] as string[] };
  }

  const report = buildReport(obs, observedAt);
  const callData = encodeFunctionData({ abi: ON_REPORT_ABI, functionName: "onReport", args: ["0x", report] });
  const signed = runtime.report(prepareReportRequest(callData)).result();

  const txs: string[] = [];
  for (const target of config.targets) {
    const net = getNetwork({ chainFamily: "evm", chainSelectorName: target.chainName, isTestnet: true });
    if (!net) {
      runtime.log(`unknown target network ${target.chainName}`);
      continue;
    }
    const evm = new cre.capabilities.EVMClient(net.chainSelector.selector);
    const res: any = evm
      .writeReport(runtime, { receiver: target.registry as Hex, report: signed as any })
      .result();

    if (res?.txStatus !== undefined && res.txStatus !== TxStatus.SUCCESS) {
      throw new Error(`write to ${target.chainName} failed: txStatus=${res.txStatus}`);
    }
    const txHash = res?.txHash ? bytesToHex(res.txHash) : "dry-run (no tx hash; use --broadcast)";
    runtime.log(`report delivered to ${target.chainName} (${target.registry}) ${txHash}`);
    txs.push(txHash);
  }

  const flagged = obs.filter((o) => o.kind > 0).map((o) => o.wallet);
  return { flagged, txs };
}

// --- triggers ---

export async function onScan(runtime: Runtime<Config>, payload: CronPayload) {
  const config = runtime.config;
  const observedAt = payload?.scheduledExecutionTime?.seconds
    ? Number(payload.scheduledExecutionTime.seconds)
    : Math.floor(runtime.now().getTime() / 1000);
  const wallets = config.watchlist.slice(0, config.maxWalletsPerRun);
  return runScan(runtime, wallets, observedAt);
}

const checkNowSchema = z.object({ wallets: z.array(z.string()).min(1) });

export async function onCheckNow(runtime: Runtime<Config>, payload: HTTPPayload) {
  let parsed: unknown;
  try {
    parsed = decodeJson(payload.input);
  } catch (e) {
    throw new Error(`bad payload: ${String(e)}`);
  }
  const result = checkNowSchema.safeParse(parsed);
  if (!result.success) throw new Error(`bad payload: ${result.error.message}`);

  const seen = new Set<string>();
  const wallets: string[] = [];
  for (const w of result.data.wallets) {
    const lw = w.toLowerCase();
    if (!seen.has(lw)) {
      seen.add(lw);
      wallets.push(lw);
    }
  }
  const observedAt = Math.floor(runtime.now().getTime() / 1000);
  return runScan(runtime, wallets, observedAt);
}

// --- workflow init ---

export function initWorkflow(config: Config) {
  const cron = new cre.capabilities.CronCapability();
  const httpCap = new cre.capabilities.HTTPCapability();
  const httpTrigger =
    config.httpAuthorizedKeys.length > 0
      ? httpCap.trigger({
          authorizedKeys: config.httpAuthorizedKeys.map((publicKey) => ({
            type: "KEY_TYPE_ECDSA_EVM" as const,
            publicKey,
          })),
        })
      : httpCap.trigger({});

  return [
    cre.handler(cron.trigger({ schedule: config.schedule }), onScan),
    cre.handler(httpTrigger, onCheckNow),
  ];
}
