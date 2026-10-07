// Pure classification logic. This file is BYTE-IDENTICAL to cre-workflow/scan/classify.ts.
// If you change one, copy it to the other (a test enforces the match).
import { keccak256, type Hex } from "viem";

export const OBS_CLEAN = 0;
export const OBS_SUSPECT = 1;
export const OBS_TOMBSTONE = 2;

export type Lists = {
  knownGood: string[];
  knownSweepers: string[];
  sweeperSkeletons: string[];
};

export type Verdict = { kind: number; reason: string };

/**
 * Parse an EIP-7702 delegation designator. On-chain code of a delegated EOA is
 * 0xef0100 ++ <20-byte implementation address> (23 bytes => '0x' + 46 hex = 48 chars).
 * Returns the lowercased delegate address, or null if not a 7702 designator.
 */
export function parseDelegation(code: string): string | null {
  const c = code.toLowerCase();
  if (c.length === 48 && c.startsWith("0xef0100")) {
    return "0x" + c.slice(8);
  }
  return null;
}

/**
 * Compute a structural "skeleton" hash of contract bytecode: copy PUSH operands as-is,
 * EXCEPT zero out PUSH20 operands (op 0x73) so copies that only differ by an embedded
 * thief address collapse to one hash. Strip the CBOR metadata tail (from the last 'a264').
 */
export function skeletonHash(code: string): Hex {
  let hex = code.toLowerCase();
  if (hex.startsWith("0x")) hex = hex.slice(2);

  // strip CBOR metadata from the last occurrence of 'a264'
  const cbor = hex.lastIndexOf("a264");
  if (cbor !== -1) hex = hex.slice(0, cbor);

  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.slice(i, i + 2), 16));
  }

  const out: number[] = [];
  for (let i = 0; i < bytes.length; i++) {
    const op = bytes[i];
    out.push(op);
    if (op >= 0x60 && op <= 0x7f) {
      const n = op - 0x5f; // PUSH1=0x60 => 1 byte
      for (let j = 1; j <= n; j++) {
        const operand = i + j < bytes.length ? bytes[i + j] : 0;
        // zero the operand bytes for PUSH20 (embedded addresses)
        out.push(op === 0x73 ? 0 : operand);
      }
      i += n;
    }
  }

  const skeleton = ("0x" + out.map((b) => b.toString(16).padStart(2, "0")).join("")) as Hex;
  return keccak256(skeleton);
}

/**
 * Classify a delegate address + optional delegate code into an observation verdict.
 */
export function classifyDelegate(
  delegate: string | null,
  lists: Lists,
  delegateCode?: string,
): Verdict {
  if (delegate === null) return { kind: OBS_CLEAN, reason: "no-delegation" };

  const d = delegate.toLowerCase();
  const good = new Set(lists.knownGood.map((x) => x.toLowerCase()));
  const sweepers = new Set(lists.knownSweepers.map((x) => x.toLowerCase()));
  const skeletons = new Set(lists.sweeperSkeletons.map((x) => x.toLowerCase()));

  if (sweepers.has(d)) return { kind: OBS_TOMBSTONE, reason: "known-sweeper-address" };
  if (good.has(d)) return { kind: OBS_CLEAN, reason: "allowlisted-delegate" };

  if (delegateCode && delegateCode !== "0x") {
    const h = skeletonHash(delegateCode).toLowerCase();
    if (skeletons.has(h)) return { kind: OBS_TOMBSTONE, reason: "sweeper-skeleton-match" };
  }

  return { kind: OBS_SUSPECT, reason: "unknown-delegate" };
}

export type PerChain = { chainIndex: number; verdicts: Record<string, Verdict> };

/**
 * Merge per-chain verdicts into one verdict per wallet: the WORST kind wins, chainMask
 * accumulates a bit per chain where kind>0, reasons are prefixed "idx:reason". A chain
 * that produced no verdict for a wallet contributes nothing.
 */
export function merge(
  perChain: PerChain[],
  wallets: string[],
): Record<string, { kind: number; chainMask: number; reasons: string[] }> {
  const result: Record<string, { kind: number; chainMask: number; reasons: string[] }> = {};
  for (const w of wallets) {
    result[w.toLowerCase()] = { kind: OBS_CLEAN, chainMask: 0, reasons: [] };
  }
  for (const pc of perChain) {
    for (const [walletRaw, v] of Object.entries(pc.verdicts)) {
      const w = walletRaw.toLowerCase();
      if (!(w in result)) result[w] = { kind: OBS_CLEAN, chainMask: 0, reasons: [] };
      const r = result[w];
      if (v.kind > r.kind) r.kind = v.kind;
      if (v.kind > 0) r.chainMask |= 1 << pc.chainIndex;
      r.reasons.push(`${pc.chainIndex}:${v.reason}`);
    }
  }
  return result;
}
