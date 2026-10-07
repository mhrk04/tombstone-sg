// DEMO mode: a stepped, simulated timeline (labelled "demo" on screen). No chain reads.
import { STATUS_LABELS } from "./registry";

export type DemoStatus = (typeof STATUS_LABELS)[number];

export type DemoRow = { label: string; address: string; status: DemoStatus; chainMask: number; note: string };

export type DemoStep = { title: string; caption: string; rows: DemoRow[]; escrow: string };

const TAN = "0x…a11c";
const BOB = "0x…b0b0";
const CAROL = "0x…ca401";
const TAN_NEW = "0x…7a2e";

function base(status: DemoStatus, mask = 0, note = ""): DemoRow[] {
  return [
    { label: "Mdm Tan", address: TAN, status, chainMask: mask, note },
    { label: "Bob", address: BOB, status: "NONE", chainMask: 0, note: "" },
    { label: "Carol", address: CAROL, status: "NONE", chainMask: 0, note: "" },
    { label: "Tan (new)", address: TAN_NEW, status: "NONE", chainMask: 0, note: "" },
  ];
}

export const DEMO_STEPS: DemoStep[] = [
  { title: "1 · Clean", caption: "Everyone unflagged. Payroll pays normally.", rows: base("NONE"), escrow: "0" },
  { title: "2 · Compromise", caption: "Tan reads her seed phrase to a fake MAS officer; her EOA is delegated to a sweeper (eip-7702).", rows: base("NONE"), escrow: "0" },
  { title: "3 · CRE scan", caption: "The CRE workflow scans 8 mainnets + Sepolia, reaches consensus, writes TOMBSTONED. (single-node simulation via MockForwarders)", rows: base("TOMBSTONED", 0x101, "sweeper-skeleton-match"), escrow: "0" },
  { title: "4 · Payroll run", caption: "Bob & Carol are Paid; Tan's 3,000 mUSDC is Escrowed, never confiscated.", rows: base("TOMBSTONED", 0x101, "escrowed"), escrow: "3,000" },
  { title: "5 · Safe guard", caption: "A Safe tx signed by Tan reverts SignerTombstoned(tan). The WazirX lesson.", rows: base("TOMBSTONED", 0x101, "safe signature rejected"), escrow: "3,000" },
  { title: "6 · Re-attest", caption: "Employer re-attests a fresh wallet for Tan. The old key alone can never do this.", rows: (() => { const r = base("TOMBSTONED", 0x101, "pending: Tan (new)"); return r; })(), escrow: "3,000" },
  { title: "7 · Graduated release", caption: "After a clean all-chain scan of the new wallet, the escrow is released to Tan (new).", rows: (() => { const r = base("TOMBSTONED", 0x101, "released"); r[3] = { label: "Tan (new)", address: TAN_NEW, status: "CLEARED", chainMask: 0, note: "scanned clean" }; return r; })(), escrow: "0" },
];
