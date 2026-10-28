import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = join(__dirname, "..", "index.js");

async function run() {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
    cwd: join(__dirname, ".."),
    env: { ...process.env, KANKA_API_TOKEN: "test-token" },
    stderr: "pipe",
  });
  const client = new Client(
    { name: "test-client", version: "1.0.0" },
    { capabilities: {} }
  );

  transport.stderr?.on("data", (chunk) => {
    process.stderr.write(chunk);
  });

  const timeout = setTimeout(() => {
    console.error("Test timed out after 10s");
    process.exit(1);
  }, 10000);

  try {
    await client.connect(transport);
    const serverInfo = client.getServerVersion();
    console.log("Initialize response received");
    console.log(`   Server: ${serverInfo?.name} v${serverInfo?.version}`);

    const toolResult = await client.listTools();
    const toolCount = toolResult.tools?.length ?? 0;
    console.log(`tools/list response: ${toolCount} tools`);
    assert.ok(toolCount > 0, "Expected at least one tool");
    console.log(`   First tool: ${toolResult.tools[0].name}`);

    const listCharacters = toolResult.tools.find((tool) => tool.name === "list_characters");
    assert.ok(listCharacters, "Expected a list_characters tool");
    const props = listCharacters.inputSchema.properties;
    assert.ok(props.page, "list_characters should accept page");
    assert.ok(props.per_page, "list_characters should accept per_page");
    assert.ok(props.entries, "list_characters should accept entries");
    assert.deepEqual(props.entry_filter.enum, ["all", "empty", "filled"]);
    console.log("   list_characters exposes page, per_page, entries, entry_filter");

    await client.close();
    clearTimeout(timeout);
    console.log("All tests passed");
  } catch (error) {
    clearTimeout(timeout);
    console.error(`Test failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

run();
