// Compute the skeleton hash of a bytecode blob (or fetched delegate code).
import { skeletonHash } from "../src/classify";
const code = process.argv[2];
if (!code || !code.startsWith("0x")) {
  console.error("usage: bun run skeleton 0x<bytecode>");
  process.exit(1);
}
console.log(skeletonHash(code));
