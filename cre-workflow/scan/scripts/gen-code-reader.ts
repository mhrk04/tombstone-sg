// Regenerate codeReader.ts from the forge artifact. Run after CodeReader.sol changes:
//   cd contracts && forge build && cd ../cre-workflow/scan && bun run gen:code-reader
// Keeps cre-workflow/scan/codeReader.ts and scanner/src/codeReader.ts byte-identical.

const artifact = new URL("../../../contracts/out/CodeReader.sol/CodeReader.json", import.meta.url);
const json = (await Bun.file(artifact).json()) as { bytecode: { object: string } };
const initcode = json.bytecode.object;

const content = `// BYTE-IDENTICAL to cre-workflow/scan/codeReader.ts.
// Generated from contracts/out/CodeReader.sol/CodeReader.json via scripts/gen (do not hand-edit).
// Deployless reader initcode: eth_call with data = CODE_READER_INITCODE ++ abi.encode(address[]), no \\\`to\\\`.
import type { Hex } from "viem";

export const CODE_READER_INITCODE =
  "${initcode}" as Hex;
`;

await Bun.write(new URL("../codeReader.ts", import.meta.url), content);
await Bun.write(new URL("../../../scanner/src/codeReader.ts", import.meta.url), content);
console.log("wrote codeReader.ts to workflow + scanner (byte-identical)");
