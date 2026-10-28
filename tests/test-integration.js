// Drives the real MCP server over stdio against a local stub of the Kanka API,
// so the list_* wiring (per_page, entries, entry_filter) is exercised end to end
// without touching kanka.io.
import assert from "node:assert/strict";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = join(__dirname, "..", "index.js");

const TOTAL = 168;
const STUB_PER_PAGE = 15; // The stub ignores per_page, like the API in issue #19.
const characters = Array.from({ length: TOTAL }, (_, i) => {
  const id = i + 1;
  const empty = id % 3 === 0;
  return {
    id,
    name: `Character ${id}`,
    entry: empty ? null : `<p>Story of ${id}</p>`,
    entry_parsed: empty ? null : `<p>Story of ${id}</p>`,
  };
});

function startStub() {
  const requests = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    requests.push(url.pathname + url.search);
    if (!url.pathname.endsWith("/characters")) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "Not found" }));
      return;
    }
    const page = Number(url.searchParams.get("page")) || 1;
    const lastPage = Math.ceil(TOTAL / STUB_PER_PAGE);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        data: characters.slice((page - 1) * STUB_PER_PAGE, page * STUB_PER_PAGE),
        links: { next: page < lastPage ? `?page=${page + 1}` : null },
        meta: { current_page: page, per_page: STUB_PER_PAGE, last_page: lastPage, total: TOTAL },
      })
    );
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server, requests, port: server.address().port }));
  });
}

async function run() {
  const stub = await startStub();
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
    cwd: join(__dirname, ".."),
    env: {
      ...process.env,
      KANKA_API_TOKEN: "test-token",
      KANKA_API_BASE: `http://127.0.0.1:${stub.port}/1.0`,
    },
    stderr: "pipe",
  });
  const client = new Client({ name: "integration-client", version: "1.0.0" }, { capabilities: {} });
  transport.stderr?.on("data", (chunk) => process.stderr.write(chunk));

  const timeout = setTimeout(() => {
    console.error("Integration test timed out after 20s");
    process.exit(1);
  }, 20000);

  const callList = async (args) => {
    const result = await client.callTool({
      name: "list_characters",
      arguments: { campaignId: 235025, ...args },
    });
    assert.ok(!result.isError, `list_characters failed: ${result.content?.[0]?.text}`);
    return JSON.parse(result.content[0].text);
  };

  try {
    await client.connect(transport);

    // Without per_page the API's own page comes back untouched.
    const passthrough = await callList({});
    assert.equal(passthrough.data.length, STUB_PER_PAGE);
    assert.equal(passthrough.meta.per_page, STUB_PER_PAGE);
    console.log("ok   default call returns the API page as-is");

    // per_page holds even though the stub ignores it.
    const capped = await callList({ per_page: 20 });
    assert.equal(capped.data.length, 20);
    assert.equal(capped.meta.per_page, 20);
    assert.equal(capped.meta.has_more, true);
    assert.equal(capped.meta.total_unfiltered, TOTAL);
    assert.deepEqual(
      capped.data.map((item) => item.id),
      Array.from({ length: 20 }, (_, i) => i + 1)
    );
    console.log("ok   per_page is enforced against an API that ignores it");

    // Every page of the collection is reachable, nothing lost in between.
    const seen = [];
    for (let page = 1; page <= 9; page += 1) {
      const result = await callList({ per_page: 20, page });
      seen.push(...result.data.map((item) => item.id));
    }
    assert.deepEqual(
      seen,
      characters.map((item) => item.id)
    );
    console.log("ok   paging through per_page=20 covers all 168 records");

    // The case from the issue: find the characters with no entry.
    const empties = [];
    for (let page = 1; ; page += 1) {
      const result = await callList({ entry_filter: "empty", entries: false, per_page: 100, page });
      empties.push(...result.data);
      assert.equal(result.meta.entry_filter, "empty");
      if (!result.meta.has_more) break;
      assert.ok(page < 5, "unexpected number of filtered pages");
    }
    assert.deepEqual(
      empties.map((item) => item.id),
      characters.filter((item) => item.entry === null).map((item) => item.id)
    );
    assert.ok(empties.every((item) => item.has_entry === false));
    assert.ok(empties.every((item) => !("entry" in item)));
    console.log(`ok   entry_filter=empty found all ${empties.length} entry-less characters`);

    const bad = await client.callTool({
      name: "list_characters",
      arguments: { campaignId: 235025, entry_filter: "null_only" },
    });
    assert.ok(bad.isError, "an unknown entry_filter should be reported as an error");
    assert.match(bad.content[0].text, /Invalid entry_filter/);
    console.log("ok   an unknown entry_filter is rejected with a clear message");

    await client.close();
    clearTimeout(timeout);
    stub.server.close();
    console.log("All integration tests passed");
  } catch (error) {
    clearTimeout(timeout);
    stub.server.close();
    console.error(
      `Integration test failed: ${error instanceof Error ? error.stack : String(error)}`
    );
    process.exit(1);
  }
}

run();
