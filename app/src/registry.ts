import { createPublicClient, http } from "viem";
import { NETS, type NetKey, isSet } from "./config";

export const STATUS_LABELS = ["NONE", "SUSPECT", "TOMBSTONED", "CLEARED"] as const;
export type StatusLabel = (typeof STATUS_LABELS)[number];

export type RegistryRecord = {
  status: number;
  cleanStreak: number;
  chainMask: number;
  since: bigint;
  lastObservedAt: bigint;
  evidence: `0x${string}`;
};

const RECORD_ABI = [
  {
    type: "function",
    name: "recordOf",
    stateMutability: "view",
    inputs: [{ name: "wallet", type: "address" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "status", type: "uint8" },
          { name: "cleanStreak", type: "uint8" },
          { name: "chainMask", type: "uint32" },
          { name: "since", type: "uint64" },
          { name: "lastObservedAt", type: "uint64" },
          { name: "evidence", type: "bytes32" },
        ],
      },
    ],
  },
] as const;

const PAYROLL_ABI = [
  { type: "function", name: "escrowed", stateMutability: "view", inputs: [{ name: "id", type: "uint256" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "pendingWallet", stateMutability: "view", inputs: [{ name: "id", type: "uint256" }], outputs: [{ type: "address" }] },
] as const;

function client(net: NetKey) {
  const n = NETS[net];
  return createPublicClient({ chain: n.chain, transport: http(n.rpc) });
}

export async function recordOf(net: NetKey, wallet: `0x${string}`): Promise<RegistryRecord | null> {
  const n = NETS[net];
  if (!isSet(n.registry)) return null;
  const r = (await client(net).readContract({
    address: n.registry,
    abi: RECORD_ABI,
    functionName: "recordOf",
    args: [wallet],
  })) as RegistryRecord;
  return r;
}

export async function payrollEscrow(payroll: `0x${string}`, id: bigint) {
  const c = client("sepolia");
  const [escrowed, pending] = await Promise.all([
    c.readContract({ address: payroll, abi: PAYROLL_ABI, functionName: "escrowed", args: [id] }),
    c.readContract({ address: payroll, abi: PAYROLL_ABI, functionName: "pendingWallet", args: [id] }),
  ]);
  return { escrowed: escrowed as bigint, pending: pending as `0x${string}` };
}
