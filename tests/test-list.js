import assert from "node:assert/strict";
import {
  isEntryEmpty,
  listEntities,
  normalizeListArgs,
  withoutEntry,
  MAX_API_PAGES_PER_CALL,
  MAX_PER_PAGE,
} from "../list.js";

// A campaign of 168 characters, every third one with an empty entry, served by
// a fake Kanka API so the tests make no network calls.
const TOTAL = 168;
const collection = Array.from({ length: TOTAL }, (_, i) => {
  const id = i + 1;
  const empty = id % 3 === 0;
  return {
    id,
    name: `Character ${id}`,
    entry: empty ? (id % 6 === 0 ? "<p></p>" : null) : `<p>Story of ${id}</p>`,
    entry_parsed: empty ? null : `<p>Story of ${id}</p>`,
  };
});

// `honorsPerPage: false` reproduces the reported behaviour: the API keeps its
// own page size whatever the caller asks for.
function fakeApi({ apiPerPage = 15, honorsPerPage = false, total = TOTAL } = {}) {
  const calls = [];
  const items = collection.slice(0, total);
  const fetchPage = async (params) => {
    calls.push(params);
    const size = honorsPerPage && params.per_page ? params.per_page : apiPerPage;
    const page = params.page ?? 1;
    const lastPage = Math.max(1, Math.ceil(items.length / size));
    const data = items.slice((page - 1) * size, page * size);
    return {
      data,
      links: { next: page < lastPage ? `?page=${page + 1}` : null },
      meta: { current_page: page, per_page: size, last_page: lastPage, total: items.length },
    };
  };
  return { fetchPage, calls };
}

const ids = (result) => result.data.map((item) => item.id);
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test("empty entries are detected through null, '' and empty HTML", () => {
  assert.equal(isEntryEmpty({ entry: null }), true);
  assert.equal(isEntryEmpty({ entry: "" }), true);
  assert.equal(isEntryEmpty({ entry: "<p></p>" }), true);
  assert.equal(isEntryEmpty({ entry: "<p>&nbsp;</p>" }), true);
  assert.equal(isEntryEmpty({}), true);
  // Text in either field counts as an entry.
  assert.equal(isEntryEmpty({ entry: null, entry_parsed: "<p>text</p>" }), false);
  assert.equal(isEntryEmpty({ entry: "", entry_parsed: "<p>text</p>" }), false);
  assert.equal(isEntryEmpty({ entry: "<p>text</p>" }), false);
});

test("withoutEntry drops the long fields and reports has_entry", () => {
  assert.deepEqual(
    withoutEntry({ id: 1, name: "A", entry: "<p>x</p>", entry_parsed: "<p>x</p>" }),
    {
      id: 1,
      name: "A",
      has_entry: true,
    }
  );
  assert.deepEqual(withoutEntry({ id: 2, name: "B", entry: null }), {
    id: 2,
    name: "B",
    has_entry: false,
  });
});

test("per_page is clamped and defaults depend on entries", () => {
  assert.equal(normalizeListArgs({}).perPage, 25);
  assert.equal(normalizeListArgs({}).paginate, false);
  assert.equal(normalizeListArgs({ entries: false }).perPage, 100);
  assert.equal(normalizeListArgs({ per_page: 500 }).perPage, MAX_PER_PAGE);
  assert.equal(normalizeListArgs({ per_page: 0 }).perPage, 1);
  assert.equal(normalizeListArgs({ per_page: 10 }).paginate, true);
  assert.equal(normalizeListArgs({ entry_filter: "empty" }).paginate, true);
});

test("an invalid entry_filter is rejected", () => {
  assert.throws(() => normalizeListArgs({ entry_filter: "null_only" }), /Invalid entry_filter/);
});

test("without per_page or a filter the API response is passed through", async () => {
  const api = fakeApi();
  const result = await listEntities(api.fetchPage, { page: 2 });
  assert.deepEqual(api.calls, [{ page: 2 }]);
  assert.equal(result.data.length, 15);
  assert.equal(result.meta.per_page, 15);
  assert.equal(result.data[0].entry, collection[15].entry);
});

test("entries:false strips entry text from a passed-through page", async () => {
  const api = fakeApi();
  const result = await listEntities(api.fetchPage, { entries: false });
  assert.deepEqual(api.calls, [{ page: undefined }]);
  assert.equal(result.data.length, 15);
  assert.equal("entry" in result.data[0], false);
  assert.equal(result.data[0].has_entry, true);
  assert.equal(result.data[2].has_entry, false);
});

test("per_page is enforced even when the API ignores it", async () => {
  const api = fakeApi({ apiPerPage: 15, honorsPerPage: false });
  const result = await listEntities(api.fetchPage, { per_page: 20 });
  assert.deepEqual(
    ids(result),
    Array.from({ length: 20 }, (_, i) => i + 1)
  );
  assert.equal(result.meta.per_page, 20);
  assert.equal(result.meta.count, 20);
  assert.equal(result.meta.has_more, true);
  assert.equal(result.meta.total_unfiltered, TOTAL);
  assert.ok(api.calls.length >= 2, "needs more than one API page to fill 20 records");
});

test("pages stitched from the API line up end to end", async () => {
  const api = fakeApi({ apiPerPage: 15 });
  const seen = [];
  for (let page = 1; page <= 9; page += 1) {
    const result = await listEntities(api.fetchPage, { per_page: 20, page });
    seen.push(...ids(result));
    assert.equal(result.meta.has_more, page < 9);
  }
  assert.deepEqual(
    seen,
    collection.map((item) => item.id)
  );
});

test("a single request is enough when the API honors per_page", async () => {
  const api = fakeApi({ honorsPerPage: true });
  const result = await listEntities(api.fetchPage, { per_page: 20, page: 3 });
  assert.deepEqual(api.calls, [{ page: 3, per_page: 20 }]);
  assert.deepEqual(
    ids(result),
    Array.from({ length: 20 }, (_, i) => i + 41)
  );
});

test("the last page reports no more records", async () => {
  const api = fakeApi({ apiPerPage: 15 });
  const result = await listEntities(api.fetchPage, { per_page: 20, page: 9 });
  assert.deepEqual(ids(result), [161, 162, 163, 164, 165, 166, 167, 168]);
  assert.equal(result.meta.has_more, false);
});

test("a page past the end comes back empty rather than wrapping around", async () => {
  const api = fakeApi({ apiPerPage: 15 });
  const result = await listEntities(api.fetchPage, { per_page: 20, page: 20 });
  assert.deepEqual(ids(result), []);
  assert.equal(result.meta.has_more, false);
});

test("entry_filter:empty returns only records without an entry", async () => {
  const api = fakeApi({ apiPerPage: 15 });
  const expected = collection.filter((item) => isEntryEmpty(item)).map((item) => item.id);
  const first = await listEntities(api.fetchPage, { entry_filter: "empty", per_page: 40 });
  assert.deepEqual(ids(first), expected.slice(0, 40));
  assert.equal(first.meta.has_more, true);
  assert.equal(first.meta.entry_filter, "empty");

  const second = await listEntities(api.fetchPage, {
    entry_filter: "empty",
    per_page: 40,
    page: 2,
  });
  assert.deepEqual(ids(second), expected.slice(40));
  assert.equal(second.meta.has_more, false);
});

test("entry_filter:filled is the complement and can drop entry text too", async () => {
  const api = fakeApi({ apiPerPage: 15 });
  const result = await listEntities(api.fetchPage, {
    entry_filter: "filled",
    entries: false,
    per_page: 100,
  });
  assert.equal(result.data.length, 100);
  assert.ok(result.data.every((item) => item.has_entry === true));
  assert.ok(result.data.every((item) => !("entry" in item)));
});

test("a scan that outgrows the API page budget says so", async () => {
  const api = fakeApi({ apiPerPage: 1, total: 60 });
  const result = await listEntities(api.fetchPage, { entry_filter: "empty", per_page: 100 });
  assert.equal(api.calls.length, MAX_API_PAGES_PER_CALL);
  assert.equal(result.meta.scan_incomplete, true);
  assert.equal(result.meta.has_more, true);
  assert.ok(result.meta.scan_hint.includes(String(MAX_API_PAGES_PER_CALL)));
});

test("an empty campaign returns an empty page", async () => {
  const api = fakeApi({ total: 0 });
  const result = await listEntities(api.fetchPage, { per_page: 25 });
  assert.deepEqual(ids(result), []);
  assert.equal(result.meta.has_more, false);
  assert.equal(result.meta.total_unfiltered, 0);
});

let failures = 0;
for (const [name, fn] of tests) {
  try {
    await fn();
    console.log(`ok   ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${name}`);
    console.error(error instanceof Error ? error.message : String(error));
  }
}

if (failures > 0) {
  console.error(`${failures} of ${tests.length} list tests failed`);
  process.exit(1);
}
console.log(`All ${tests.length} list tests passed`);
