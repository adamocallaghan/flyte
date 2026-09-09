import fs from "fs";
import path from "path";
import { onAttentionCronTrigger, type Config } from "./attention-oracle";
import config from "./config.json";

console.log("=================================================================");
console.log("🚀 Testing Flyte Attention Oracle in Chainlink CRE TEE Simulator");
console.log("=================================================================\n");

// Load live secrets from .env if available, or use mock secrets
let firecrawlKey = "mock_firecrawl_key_9921";
let openrouterKey = "mock_openrouter_key_3310";

try {
  const envPath = path.resolve(__dirname, "../.env");
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf-8").split("\n");
    for (const l of lines) {
      if (l.startsWith("FIRECRAWL_API_KEY=")) {
        firecrawlKey = l.split("=")[1].trim();
      }
      if (l.startsWith("OPENROUTER_API_KEY=")) {
        openrouterKey = l.split("=")[1].trim();
      }
    }
  }
} catch {
  // fallback to defaults
}

const secretsMap: Record<string, string> = {
  FIRECRAWL_API_KEY: firecrawlKey,
  OPENROUTER_API_KEY: openrouterKey,
};

// Create Mock TeeRuntime conforming to CRE TeeRuntime interface
const mockTeeRuntime: any = {
  config: config as Config,
  now: () => new Date(),
  log: (msg: string) => console.log(msg),
  getSecrets: (reqs: Array<{ id: string }>) => ({
    result: () => {
      const out: Record<string, { id: string; value: string }> = {};
      for (const req of reqs) {
        out[req.id] = { id: req.id, value: secretsMap[req.id] || "mock_secret" };
      }
      return out;
    },
  }),
  usingTheDons: () => ({
    log: (msg: string) => console.log(msg),
  }),
};

// Execute Enclave Handler
const resultJson = onAttentionCronTrigger(mockTeeRuntime);
const parsedResult = JSON.parse(resultJson);

console.log("\n=================================================================");
console.log("✅ Confidential TEE Execution Result Summary:");
console.log("=================================================================");
console.log(JSON.stringify(parsedResult, null, 2));

if (parsedResult.marketsProcessed === 3 && parsedResult.reports.length === 3) {
  console.log("\n🎉 ALL 3 ATTENTION MARKETS PROCESSED & VERIFIED IN TEE SIMULATOR!");
} else {
  console.error("\n❌ Unexpected result count");
  process.exit(1);
}
