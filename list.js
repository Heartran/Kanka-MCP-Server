// Page sizing and entry filtering for the list_* tools.
//
// Kanka pages list endpoints itself and the page size it uses is not something
// a client can set reliably, so one request can come back with far more records
// than an MCP client will render — the middle of the list then disappears into a
// head/tail truncation. These helpers paginate the collection on our side:
// per_page is sent upstream as a hint and also enforced locally, stitching the
// API's own pages together when it ignores it.

export const MAX_PER_PAGE = 100;
export const DEFAULT_PER_PAGE_WITH_ENTRIES = 25;
export const DEFAULT_PER_PAGE_WITHOUT_ENTRIES = 100;
export const MAX_API_PAGES_PER_CALL = 50;
export const ENTRY_FILTERS = ["all", "empty", "filled"];

function stripHtml(value) {
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .trim();
}

// Kanka writes entries as HTML, so a "blank" entry can be null, "" or "<p></p>".
// Both fields are checked: a record counts as empty only when neither carries text.
export function isEntryEmpty(item) {
  return [item?.entry, item?.entry_parsed].every(
    (raw) => raw === null || raw === undefined || stripHtml(String(raw)) === ""
  );
}

export function withoutEntry(item) {
  const { entry: _entry, entry_parsed: _entryParsed, ...rest } = item;
  return { ...rest, has_entry: !isEntryEmpty(item) };
}

function matchesEntryFilter(item, entryFilter) {
  if (entryFilter === "empty") return isEntryEmpty(item);
  if (entryFilter === "filled") return !isEntryEmpty(item);
  return true;
}

function clampInt(value, min, max, fallback) {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function dataOf(body) {
  return Array.isArray(body?.data) ? body.data : [];
}

function isLastApiPage(body, apiPage, batch) {
  if (batch.length === 0) return true;
  const lastPage = Number(body?.meta?.last_page);
  if (Number.isFinite(lastPage) && lastPage > 0) return apiPage >= lastPage;
  if (body?.links && "next" in body.links) return !body.links.next;
  return false;
}

export function normalizeListArgs(args = {}) {
  const entryFilter = args.entry_filter ?? "all";
  if (!ENTRY_FILTERS.includes(entryFilter)) {
    throw new Error(
      `Invalid entry_filter '${entryFilter}'. Expected one of: ${ENTRY_FILTERS.join(", ")}.`
    );
  }

  const entries = args.entries !== false;
  const fallbackPerPage = entries
    ? DEFAULT_PER_PAGE_WITH_ENTRIES
    : DEFAULT_PER_PAGE_WITHOUT_ENTRIES;

  return {
    entries,
    entryFilter,
    page: clampInt(args.page, 1, Number.MAX_SAFE_INTEGER, 1),
    perPage: clampInt(args.per_page, 1, MAX_PER_PAGE, fallbackPerPage),
    // Without per_page and without a filter the API's own paging is returned
    // untouched, so existing callers keep the response they already parse.
    paginate: args.per_page !== undefined || entryFilter !== "all",
  };
}

// Walks the API's pages to fill one window of `perPage` records.
async function collectUnfiltered(fetchPage, page, perPage) {
  const start = (page - 1) * perPage;
  const items = [];
  let total = null;
  let requests = 0;
  let hasMore = false;
  let scanIncomplete = false;

  // Assume per_page is honored: the API's page N is then exactly our page N.
  let apiPage = page;
  let firstIndex = start;
  let aligned = false;

  for (;;) {
    const body = await fetchPage({ page: apiPage, per_page: perPage });
    requests += 1;
    const batch = dataOf(body);
    if (body?.meta?.total != null) total = Number(body.meta.total);

    if (!aligned) {
      aligned = true;
      // per_page was ignored: work out which of the API's pages the window spans.
      // With no reported page size, trust what we asked for rather than guess
      // from the batch length, which shrinks on the last page.
      const apiPerPage = Number(body?.meta?.per_page);
      if (Number.isFinite(apiPerPage) && apiPerPage > 0 && apiPerPage !== perPage) {
        const target = Math.floor(start / apiPerPage) + 1;
        firstIndex = (target - 1) * apiPerPage;
        if (target !== apiPage) {
          apiPage = target;
          continue;
        }
      }
    }

    for (let i = 0; i < batch.length; i += 1) {
      if (firstIndex + i < start) continue;
      if (items.length === perPage) {
        hasMore = true;
        break;
      }
      items.push(batch[i]);
    }

    const last = isLastApiPage(body, apiPage, batch);
    if (hasMore) break;
    if (items.length >= perPage) {
      hasMore = !last;
      break;
    }
    if (last) break;
    if (requests >= MAX_API_PAGES_PER_CALL) {
      hasMore = true;
      scanIncomplete = true;
      break;
    }
    firstIndex += batch.length;
    apiPage += 1;
  }

  return { items, hasMore, total, requests, scanIncomplete };
}

// Same, but the window is cut from the filtered collection, so every page has
// to be read from the start — the API cannot filter on entry itself.
async function collectFiltered(fetchPage, page, perPage, entryFilter) {
  const start = (page - 1) * perPage;
  const items = [];
  let matched = 0;
  let total = null;
  let requests = 0;
  let hasMore = false;
  let scanIncomplete = false;
  let apiPage = 1;

  for (;;) {
    const body = await fetchPage({ page: apiPage, per_page: perPage });
    requests += 1;
    const batch = dataOf(body);
    if (body?.meta?.total != null) total = Number(body.meta.total);

    for (const item of batch) {
      if (!matchesEntryFilter(item, entryFilter)) continue;
      matched += 1;
      if (matched <= start) continue;
      if (items.length === perPage) {
        hasMore = true;
        break;
      }
      items.push(item);
    }

    if (hasMore) break;
    if (isLastApiPage(body, apiPage, batch)) break;
    if (requests >= MAX_API_PAGES_PER_CALL) {
      hasMore = true;
      scanIncomplete = items.length < perPage;
      break;
    }
    apiPage += 1;
  }

  return { items, hasMore, total, requests, scanIncomplete };
}

/**
 * Resolve one page of a list_* tool call.
 *
 * `fetchPage(params)` must resolve to the API response body for the given query
 * params, e.g. `{ page: 2, per_page: 25 }`.
 */
export async function listEntities(fetchPage, args = {}) {
  const { entries, entryFilter, page, perPage, paginate } = normalizeListArgs(args);

  if (!paginate) {
    const body = await fetchPage({ page: args.page });
    if (entries || !Array.isArray(body?.data)) return body;
    return { ...body, data: body.data.map(withoutEntry) };
  }

  const pageWindow =
    entryFilter === "all"
      ? await collectUnfiltered(fetchPage, page, perPage)
      : await collectFiltered(fetchPage, page, perPage, entryFilter);

  return {
    data: entries ? pageWindow.items : pageWindow.items.map(withoutEntry),
    meta: {
      page,
      per_page: perPage,
      count: pageWindow.items.length,
      has_more: pageWindow.hasMore,
      entry_filter: entryFilter,
      entries_included: entries,
      // Kanka only reports the size of the whole collection, so this stays the
      // unfiltered count even when entry_filter drops records.
      total_unfiltered: pageWindow.total,
      api_pages_fetched: pageWindow.requests,
      ...(pageWindow.scanIncomplete
        ? {
            scan_incomplete: true,
            scan_hint: `Stopped after ${MAX_API_PAGES_PER_CALL} API pages; records past that point were not scanned.`,
          }
        : {}),
    },
  };
}
