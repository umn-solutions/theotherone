/**
 * Threshold-safe SharePoint list reads.
 *
 * SharePoint on-prem rejects (list view threshold, 5,000 rows) any query that has
 * to scan more rows than the threshold on a large list: a Where on a non-indexed
 * column (e.g. Created), a Contains, an Or over several columns, or a request
 * whose result set is simply too big. A filter that matches only a few rows does
 * not help when the column is not indexed: the scan itself is what is throttled.
 *
 * These helpers walk the list in ID windows instead. ID is the primary key
 * (always indexed), so every request scans at most ID_WINDOW_SIZE rows, whatever
 * extra filter is applied inside the window and however large the list grows.
 * The windows go through SPARC's ListApi.getItems() as raw CAML, with RowLimit
 * as a direct <View> child (where the CAML schema puts it).
 */

// Rows per request. Kept below the 5,000 threshold for margin.
const ID_WINDOW_SIZE = 4000
// Window requests in flight per list.
const WINDOW_CONCURRENCY = 3

const idValue = (id) => `<Value Type='Counter'>${id}</Value>`

/**
 * Highest item ID in the list (0 when empty). Reads one row ordered by the
 * primary key, so it is cheap on any list size. Rejects on failure.
 *
 * @param {object} siteApi
 * @param {string} listName
 * @returns {Promise<number>}
 */
export async function getMaxItemId(siteApi, listName) {
  const caml = '<View>'
    + "<ViewFields><FieldRef Name='ID'/></ViewFields>"
    + "<Query><OrderBy><FieldRef Name='ID' Ascending='FALSE'/></OrderBy></Query>"
    + '<RowLimit>1</RowLimit>'
    + '</View>'
  const [last] = await siteApi.list(listName).getItems(caml)
  return Number(last?.Id ?? last?.ID) || 0
}

/** CAML view for the ID window (fromId, fromId + ID_WINDOW_SIZE], AND-ed with `where`. */
function windowViewXml(fromId, where) {
  const toId = fromId + ID_WINDOW_SIZE
  // The ID range comes first so SharePoint narrows on the primary key before
  // evaluating any other condition.
  const range = `<And><Gt><FieldRef Name='ID'/>${idValue(fromId)}</Gt>`
    + `<Leq><FieldRef Name='ID'/>${idValue(toId)}</Leq></And>`
  const condition = where ? `<And>${range}${where}</And>` : range
  return `<View><Query><Where>${condition}</Where><OrderBy><FieldRef Name='ID'/></OrderBy></Query>`
    + `<RowLimit>${ID_WINDOW_SIZE}</RowLimit></View>`
}

/**
 * Every item of `listName` matching the optional bare CAML condition `where`
 * (no `<Where>` wrapper, e.g. from buildDateRangeClause), in ID order. Never
 * exceeds the list view threshold, whatever the filter or list size. Rejects on
 * the first failed request.
 *
 * Items created after the read starts may be missed (the ID range is fixed
 * up front).
 *
 * @param {object} siteApi
 * @param {string} listName
 * @param {object} [opts]
 * @param {string} [opts.where]  Bare CAML condition applied inside each window.
 * @param {(count: number) => void} [opts.onBatch]  Called with each window's item count.
 * @param {() => boolean} [opts.shouldStop]  Checked before each window (e.g. user cancelled).
 * @returns {Promise<object[]>} Matching items (only the windows read, when stopped early).
 */
export async function readItemsInIdWindows(siteApi, listName, { where, onBatch, shouldStop } = {}) {
  const maxId = await getMaxItemId(siteApi, listName)
  const list = siteApi.list(listName)
  const windowStarts = []
  for (let fromId = 0; fromId < maxId; fromId += ID_WINDOW_SIZE) windowStarts.push(fromId)

  const results = new Array(windowStarts.length)
  let nextWindow = 0
  let failed = false

  const worker = async () => {
    while (nextWindow < windowStarts.length && !failed && !shouldStop?.()) {
      const index = nextWindow++
      const fromId = windowStarts[index]
      try {
        results[index] = await list.getItems(windowViewXml(fromId, where))
      } catch (err) {
        failed = true // stop the other workers; the caller surfaces the error
        console.error('[list-read] window read failed', { listName, fromId, err })
        throw err
      }
      onBatch?.(results[index].length)
    }
  }

  const workers = Math.min(WINDOW_CONCURRENCY, windowStarts.length)
  await Promise.all(Array.from({ length: workers }, worker))
  return results.filter(Boolean).flat()
}
