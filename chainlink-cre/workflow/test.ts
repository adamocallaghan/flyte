import { onAttentionCronTrigger, type Config } from "./attention-oracle";
import config from "./config.json";

console.log("=================================================================");
console.log("🚀 Testing Flyte Attention Oracle in Chainlink CRE TEE Simulator");
console.log("=================================================================\n");

// Mock Secrets returned from Vault DON inside hardware enclave
const mockSecrets: Record<string, string> = {
  TWITTER_API_BEARER: "mock_x_api_secret_bearer_9921",
  NEWS_API_KEY: "mock_newsapi_org_key_88172",
  PERPLEXITY_API_KEY: "mock_pplx_sonar_reasoning_key_3310",
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
        out[req.id] = { id: req.id, value: mockSecrets[req.id] || "secret_val" };
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
  console.log("\n🎉 ALL 3 ATTENTION MARKETS PROCESSED & VERIFIED SUCCESSFULLY!");
} else {
  console.error("\n❌ Unexpected result count");
  process.exit(1);
}
