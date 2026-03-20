import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = join(__dirname, "..", "index.js");

/**
 * Spawns the MCP server via stdio and sends a JSON-RPC initialize request,
 * then a tools/list request. Validates that the server responds correctly.
 */
function run() {
  const child = spawn("node", [serverPath], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, KANKA_API_TOKEN: "test-token" },
  });

  let stdout = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
    // Check if we got a complete JSON-RPC response (newline-delimited)
    const lines = stdout.split("\n").filter(Boolean);
    for (const line of lines) {
      try {
        const msg = JSON.parse(line);
        handleMessage(msg);
      } catch {
        // partial line, wait for more data
      }
    }
  });

  child.stderr.on("data", (chunk) => {
    // Server logs go to stderr — just print them
    process.stderr.write(chunk);
  });

  let step = 0;
  const results = [];

  function handleMessage(msg) {
    if (step === 0 && msg.result) {
      // Initialize response
      console.log("✅ Initialize response received");
      console.log(`   Server: ${msg.result.serverInfo?.name} v${msg.result.serverInfo?.version}`);
      results.push("init");
      step = 1;
      // Send initialized notification, then tools/list
      sendRequest({ jsonrpc: "2.0", method: "notifications/initialized" });
      sendRequest({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    } else if (step === 1 && msg.id === 2) {
      // tools/list response
      const toolCount = msg.result?.tools?.length || 0;
      console.log(`✅ tools/list response: ${toolCount} tools`);
      if (msg.error) console.log(`   Error: ${JSON.stringify(msg.error)}`);
      if (toolCount > 0) {
        console.log(`   First tool: ${msg.result.tools[0].name}`);
        results.push("tools");
      }
      finish();
    }
  }

  function sendRequest(obj) {
    child.stdin.write(JSON.stringify(obj) + "\n");
  }

  function finish() {
    child.kill();
    if (results.includes("init") && results.includes("tools")) {
      console.log("✅ All tests passed");
      process.exit(0);
    } else {
      console.error("❌ Tests failed — missing responses");
      process.exit(1);
    }
  }

  // Start by sending initialize
  sendRequest({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "test-client", version: "1.0.0" },
    },
  });

  // Timeout safety
  setTimeout(() => {
    console.error("❌ Test timed out after 10s");
    child.kill();
    process.exit(1);
  }, 10000);
}

run();
