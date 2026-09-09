import { Runner } from "@chainlink/cre-sdk";
import { configSchema, initWorkflow, type Config } from "./attention-oracle";

// WASM entry point (only parameterless export permitted by Javy)
export async function main() {
  const runner = await Runner.newRunner<Config>({ configSchema });
  await runner.run(initWorkflow);
}

await main();
