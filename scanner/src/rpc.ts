import { encodeAbiParameters, decodeAbiParameters, concatHex, type Hex } from "viem";
import { CODE_READER_INITCODE } from "./codeReader";

export type Endpoint = { url: string; headers: Record<string, string> };
export type Fetch = (url: string | URL, init?: any) => Promise<Response>;

/** One JSON-RPC call. Injectable fetch for tests. */
export async function rpc(
  ep: Endpoint,
  method: string,
  params: unknown[],
  fetchImpl: Fetch = fetch,
): Promise<any> {
  const res = await fetchImpl(ep.url, {
    method: "POST",
    headers: { "content-type": "application/json", ...ep.headers },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) {
    const err: any = new Error(`rpc ${method} failed: ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const json = await res.json();
  if (json.error) throw new Error(`rpc ${method}: ${JSON.stringify(json.error)}`);
  return json.result;
}

/** ONE JSON-RPC batch of eth_getCode for many addresses. Returns codes in input order. */
export async function getCodesBatch(
  ep: Endpoint,
  addrs: string[],
  blockTag: string = "latest",
  fetchImpl: Fetch = fetch,
): Promise<string[]> {
  const batch = addrs.map((a, i) => ({
    jsonrpc: "2.0",
    id: i,
    method: "eth_getCode",
    params: [a, blockTag],
  }));
  const res = await fetchImpl(ep.url, {
    method: "POST",
    headers: { "content-type": "application/json", ...ep.headers },
    body: JSON.stringify(batch),
  });
  if (!res.ok) {
    const err: any = new Error(`batch eth_getCode failed: ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const json = await res.json();
  const arr = Array.isArray(json) ? json : [json];
  const byId = new Map<number, string>();
  for (const r of arr) {
    if (r.error) throw new Error(`eth_getCode: ${JSON.stringify(r.error)}`);
    byId.set(r.id, r.result ?? "0x");
  }
  return addrs.map((_, i) => byId.get(i) ?? "0x");
}

/** ONE eth_call to the deployless CodeReader: data = initcode ++ abi.encode(address[]). */
export async function getCodesDeployless(
  ep: Endpoint,
  addrs: string[],
  blockTag: string = "latest",
  fetchImpl: Fetch = fetch,
): Promise<string[]> {
  const encoded = encodeAbiParameters([{ type: "address[]" }], [addrs as Hex[]]);
  const data = concatHex([CODE_READER_INITCODE, encoded]);
  const result = await rpc(ep, "eth_call", [{ data }, blockTag], fetchImpl);
  const [codes] = decodeAbiParameters([{ type: "bytes[]" }], result as Hex);
  return (codes as Hex[]).map((c) => c as string);
}
