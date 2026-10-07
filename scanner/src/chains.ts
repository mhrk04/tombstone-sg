// Chain registry + endpoint selection. chainMask bit = index 0..8 for reads (mainnets 0..7 + sepolia 8).
// WRITE targets (testnets) are indices 8..10 and handled by the workflow, not here.

export type ScanChain = {
  name: string;
  index: number;
  chainId: number;
  nownodes?: string; // NOWNodes host (only eth + eth-sepolia work on the free plan)
  publicRpc: string;
  testnet?: boolean;
};

// Read chains in steering order. chainMask bit = index.
export const MAINNETS: ScanChain[] = [
  { name: "ethereum", index: 0, chainId: 1, nownodes: "https://eth.nownodes.io", publicRpc: "https://ethereum-rpc.publicnode.com" },
  { name: "base", index: 1, chainId: 8453, nownodes: "https://base.nownodes.io", publicRpc: "https://mainnet.base.org" },
  { name: "arbitrum", index: 2, chainId: 42161, publicRpc: "https://arbitrum-one-rpc.publicnode.com" },
  { name: "optimism", index: 3, chainId: 10, publicRpc: "https://optimism-rpc.publicnode.com" },
  { name: "bsc", index: 4, chainId: 56, publicRpc: "https://bsc-rpc.publicnode.com" },
  { name: "polygon", index: 5, chainId: 137, nownodes: "https://matic.nownodes.io", publicRpc: "https://polygon-bor-rpc.publicnode.com" },
  { name: "gnosis", index: 6, chainId: 100, publicRpc: "https://gnosis-rpc.publicnode.com" }, // NO nownodes
  { name: "unichain", index: 7, chainId: 130, publicRpc: "https://unichain-rpc.publicnode.com" },
];

export const TESTNETS: ScanChain[] = [
  { name: "sepolia", index: 8, chainId: 11155111, nownodes: "https://eth-sepolia.nownodes.io", publicRpc: "https://ethereum-sepolia-rpc.publicnode.com", testnet: true },
  { name: "base-sepolia", index: 9, chainId: 84532, publicRpc: "https://sepolia.base.org", testnet: true },
  { name: "arbitrum-sepolia", index: 10, chainId: 421614, publicRpc: "https://sepolia-rollup.arbitrum.io/rpc", testnet: true },
];

export const TESTNET_CHAIN_IDS = new Set(TESTNETS.map((c) => c.chainId));

/** Which chains may use the NOWNodes key, from NOWNODES_CHAINS (default 'ethereum,sepolia'). */
export function nownodesChains(v = process.env.NOWNODES_CHAINS): Set<string> {
  const raw = (v ?? "ethereum,sepolia").trim();
  return new Set(raw.split(",").map((s) => s.trim()).filter(Boolean));
}

export type Endpoint = { url: string; headers: Record<string, string>; via: "nownodes" | "public" };

/**
 * Pick the endpoint for a chain. NOWNodes (with the 'api-key' header) only when: the key is set and
 * not 'none', the chain has a nownodes host, and the chain is in the enabled set. Otherwise public.
 */
export function endpoint(c: ScanChain, key: string | undefined, enabled: Set<string>): Endpoint {
  const hasKey = !!key && key !== "none";
  if (hasKey && c.nownodes && enabled.has(c.name)) {
    return { url: c.nownodes, headers: { "api-key": key as string }, via: "nownodes" };
  }
  return publicEndpoint(c);
}

export function publicEndpoint(c: ScanChain): Endpoint {
  return { url: c.publicRpc, headers: {}, via: "public" };
}
