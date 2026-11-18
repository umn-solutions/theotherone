import {
  LIST_PACKAGES,
  LIST_TIMELINE_ENTRIES,
  LIST_EXTERNAL_PACKAGES,
  TRACKING_PREFIX,
  EXTERNAL_TRACKING_PREFIX,
} from './constants.js'
import { readItemsInIdWindows } from './list-read.js'

/**
 * Mail "context" objects parameterize the shared facilities workflow engine
 * (scan/dispatch/reception/delivery, print/reprint labels, reroute) so the same
 * logic serves both internal mail and external mail without duplication.
 *
 * - listNames: lists the workflow reads/matches scanned tracking numbers against.
 *   External tracked mail lives in one header list (ExternalMailPackages); item
 *   details live in a separate lines list the workflow never touches. Items are
 *   tagged with `__listName` on read so writes target the correct list.
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
  listNames: [LIST_EXTERNAL_PACKAGES],
  primaryList: LIST_EXTERNAL_PACKAGES,
  timelineList: LIST_TIMELINE_ENTRIES,
  trackingPrefix: EXTERNAL_TRACKING_PREFIX,
  basePath: 'facilities/external-mail',
  labelSearchField: 'RecipientEmail',
  labelSearchNoun: 'recipient',
}

/**
 * Fetch items from one list, tagging each with its source list on `__listName`.
 * Rejects on failure so the caller decides how to surface it.
 *
 * @param {object} siteApi
 * @param {string} listName
 * @param {object|string} [query]  CAML query object/string (omit for all items)
 * @param {object} [options]       getItems options (orderBy, limit, viewFields)
 * @returns {Promise<object[]>}
 */
export async function fetchTaggedItems(siteApi, listName, query, options) {
  const items = await siteApi.list(listName).getItems(query, options)
  for (const it of items) it.__listName = listName
  return items
}

/**
 * Fetch every item of one list (optionally matching a bare CAML condition),
 * tagging each with `__listName`. Reads in ID windows so it never exceeds the
 * list view threshold, whatever the filter or list size (see list-read.js).
 * Rejects on failure.
 *
 * @param {object} siteApi
 * @param {string} listName
 * @param {object} [opts]  readItemsInIdWindows options (where, onBatch, shouldStop).
 * @returns {Promise<object[]>} Items read (all, unless stopped early).
 */
export async function fetchAllTaggedItems(siteApi, listName, opts) {
  const items = await readItemsInIdWindows(siteApi, listName, opts)
  for (const it of items) it.__listName = listName
  return items
}

/**
 * Fetch items from several lists, tagging each with its source list on
 * `__listName` so callers can write back to the correct list. Errors on one
 * list are logged and skipped (best-effort merge).
 *
 * @param {object} siteApi
 * @param {string[]} listNames
 * @param {object|string} [query]  CAML query object/string. Omit for all items
 *   (read threshold-safe via fetchAllTaggedItems). A query must narrow on an
 *   indexed column (e.g. Title) or it can exceed the list view threshold.
 * @param {object} [options]       getItems options (orderBy, limit, viewFields)
 * @returns {Promise<object[]>}
 */
export async function fetchItemsAcrossLists(siteApi, listNames, query, options) {
  const out = []
  for (const name of listNames) {
    try {
      out.push(...await (query === undefined
        ? fetchAllTaggedItems(siteApi, name)
        : fetchTaggedItems(siteApi, name, query, options)))
    } catch (err) {
      console.error('[mail-context] failed to load list ' + name, err)
    }
  }
  return out
}
