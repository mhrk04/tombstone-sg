import { sepolia, baseSepolia, arbitrumSepolia } from "viem/chains";

export const NETS = {
  sepolia: {
    chain: sepolia,
    label: "Sepolia",
    explorer: "https://sepolia.etherscan.io",
    rpc: import.meta.env.VITE_SEPOLIA_RPC_URL as string | undefined,
    registry: import.meta.env.VITE_REGISTRY_SEPOLIA as string | undefined,
  },
  baseSepolia: {
    chain: baseSepolia,
    label: "Base Sepolia",
    explorer: "https://sepolia.basescan.org",
    rpc: import.meta.env.VITE_BASE_SEPOLIA_RPC_URL as string | undefined,
    registry: import.meta.env.VITE_REGISTRY_BASE_SEPOLIA as string | undefined,
  },
  arbitrumSepolia: {
    chain: arbitrumSepolia,
    label: "Arbitrum Sepolia",
    explorer: "https://sepolia.arbiscan.io",
    rpc: import.meta.env.VITE_ARBITRUM_SEPOLIA_RPC_URL as string | undefined,
    registry: import.meta.env.VITE_REGISTRY_ARBITRUM_SEPOLIA as string | undefined,
  },
} as const;

export type NetKey = keyof typeof NETS;
export const NET_KEYS = Object.keys(NETS) as NetKey[];

const UNSET = new Set(["", "0x0000000000000000000000000000000000000000", "0x0000000000000000000000000000000000000001"]);
export function isSet(addr?: string): addr is `0x${string}` {
  return !!addr && !UNSET.has(addr.toLowerCase());
}

export const PAYROLL = import.meta.env.VITE_PAYROLL_SEPOLIA as string | undefined;

export type WatchEntry = { label: string; address: `0x${string}` };
export function parseWatchlist(): WatchEntry[] {
  const raw = (import.meta.env.VITE_WATCHLIST as string | undefined) ?? "";
  return raw
    .split(",")
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const [label, address] = pair.split("=");
      return { label: label?.trim() ?? "?", address: (address?.trim() ?? "0x") as `0x${string}` };
    })
    .filter((e) => e.address.startsWith("0x"));
}
export const WATCHLIST = parseWatchlist();

// chainMask bit order (reads)
export const SCAN_CHAINS = [
  "Ethereum", "Base", "Arbitrum", "Optimism", "BSC", "Polygon", "Gnosis", "Unichain", "Sepolia",
];

export function decodeChainMask(mask: number): string[] {
  return SCAN_CHAINS.filter((_, i) => (mask & (1 << i)) !== 0);
}

export const LIVE = NET_KEYS.some((k) => isSet(NETS[k].registry));
