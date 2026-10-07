/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_REGISTRY_SEPOLIA?: string;
  readonly VITE_REGISTRY_BASE_SEPOLIA?: string;
  readonly VITE_REGISTRY_ARBITRUM_SEPOLIA?: string;
  readonly VITE_PAYROLL_SEPOLIA?: string;
  readonly VITE_WATCHLIST?: string;
  readonly VITE_SEPOLIA_RPC_URL?: string;
  readonly VITE_BASE_SEPOLIA_RPC_URL?: string;
  readonly VITE_ARBITRUM_SEPOLIA_RPC_URL?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
