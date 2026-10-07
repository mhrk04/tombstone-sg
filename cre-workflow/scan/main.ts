import { Runner } from "@chainlink/cre-sdk";
import { configSchema, initWorkflow, type Config } from "./workflow";

export async function main() {
  console.log(`tombstone-scan workflow [${new Date().toISOString()}]`);
  const runner = await Runner.newRunner<Config>({
    configParser: (raw: unknown) => configSchema.parse(raw),
  });
  await runner.run(initWorkflow);
}

await main();
