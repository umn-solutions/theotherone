import {
  LIST_PACKAGES,
  LIST_TIMELINE_ENTRIES,
  LIST_EXTERNAL_TRACKED,
  LIST_EXTERNAL_REGISTERED,
  TRACKING_PREFIX,
  EXTERNAL_TRACKING_PREFIX,
} from './constants.js'

/**
 * Mail "context" objects parameterize the shared facilities workflow engine
 * (scan/dispatch/reception/delivery, print/reprint labels, reroute) so the same
 * logic serves both internal mail and external mail without duplication.
 *
 * - listNames: lists the workflow reads/matches scanned tracking numbers against.
 *   External mail spans two lists (tracked + registered); items are tagged with
 *   `__listName` on read so writes target the correct list.
 * - timelineList: shared audit list (TimelineEntries) keyed by tracking number.
 * - basePath: hub landing route; used for back links and the hub-location guard.
 * - labelSearchField/labelSearchNoun: which party the Print/Reprint search uses.
 *   Internal mail is searched by sender; external mail by recipient (the external
 *   sender has no internal identity).
 */
export const INTERNAL_MAIL = {
  key: 'internal',
  listNames: [LIST_PACKAGES],
  primaryList: LIST_PACKAGES,
  timelineList: LIST_TIMELINE_ENTRIES,
  trackingPrefix: TRACKING_PREFIX,
  basePath: 'facilities/internal-mail',
  labelSearchField: 'SenderEmail',
  labelSearchNoun: 'sender',
}

export const EXTERNAL_MAIL = {
  key: 'external',
  listNames: [LIST_EXTERNAL_TRACKED, LIST_EXTERNAL_REGISTERED],
  primaryList: LIST_EXTERNAL_TRACKED,
  timelineList: LIST_TIMELINE_ENTRIES,
  trackingPrefix: EXTERNAL_TRACKING_PREFIX,
  basePath: 'facilities/external-mail',
  labelSearchField: 'RecipientEmail',
  labelSearchNoun: 'recipient',
}

/**
 * Fetch items from several lists, tagging each with its source list on
 * `__listName` so callers can write back to the correct list. Errors on one
 * list are logged and skipped (best-effort merge).
 *
 * @param {object} siteApi
 * @param {string[]} listNames
 * @param {object|string} [query]  CAML query object/string (omit for all items)
 * @param {object} [options]       getItems options (orderBy, limit, viewFields)
 * @returns {Promise<object[]>}
 */
export async function fetchItemsAcrossLists(siteApi, listNames, query, options) {
  const out = []
  for (const name of listNames) {
    try {
      const items = await siteApi.list(name).getItems(query, options)
      for (const it of items) {
        it.__listName = name
        out.push(it)
      }
    } catch (err) {
      console.error('[mail-context] failed to load list ' + name, err)
    }
  }
  return out
}
