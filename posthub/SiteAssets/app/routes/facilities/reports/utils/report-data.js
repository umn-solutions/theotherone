import { __dayjs } from '../../../../libs/nofbiz/nofbiz.base.js'
import {
  LIST_PACKAGES,
  LIST_TIMELINE_ENTRIES,
  LIST_EXTERNAL_PACKAGES,
  LIST_EXTERNAL_ITEMS,
  LIST_EXTERNAL_LOG,
} from '../../../../utils/constants.js'
import { DAYJS_FORMAT, buildDateRangeCaml } from '../../../../utils/date-helpers.js'
import { externalRecords, externalCategoryRecords } from './report-stats.js'

/**
 * Month-scoped data loading for reports. Reports always cover exactly ONE
 * calendar month and include only items CREATED in that month. Pending items
 * are dropped here (never relevant for reporting).
 *
 * When the previous month is requested (for delta chips), both months are
 * loaded with a single query per list and split client-side.
 */

const MONTH_KEY_FORMAT = 'YYYY-MM'

export const currentMonthKey = () => __dayjs().format(MONTH_KEY_FORMAT)
export const monthStart = (key) => __dayjs(`${key}-01`).startOf('month')
export const monthLabel = (key) => monthStart(key).format('MMMM YYYY')
export const prevMonthKey = (key) => monthStart(key).subtract(1, 'month').format(MONTH_KEY_FORMAT)

/** Most recent `count` months (current first), as { key, label }. */
export function recentMonths(count = 24) {
  const now = monthStart(currentMonthKey())
  return Array.from({ length: count }, (_, i) => {
    const key = now.subtract(i, 'month').format(MONTH_KEY_FORMAT)
    return { key, label: monthLabel(key) }
  })
}

const inMonth = (key) => (item) => __dayjs(item.Created).format(MONTH_KEY_FORMAT) === key
const notPending = (item) => item.Status !== 'pending'

/** Items Created between the start of `fromKey` and the end of `toKey`. */
function getCreatedBetween(siteApi, listName, fromKey, toKey) {
  const from = monthStart(fromKey).format(DAYJS_FORMAT)
  const to = monthStart(toKey).endOf('month').format(DAYJS_FORMAT)
  return siteApi.list(listName).getItems(buildDateRangeCaml(from, to, 'Created', false))
}

// Status changes happen after creation, so the timeline window extends past the
// report month. Bounded to keep old-month reports from pulling the whole list;
// deliveries slower than this are not attributed a delivery time.
const TIMELINE_TAIL_MONTHS = 3
const timelineEndKey = (key) => monthStart(key).add(TIMELINE_TAIL_MONTHS, 'month').format(MONTH_KEY_FORMAT)

/** Timeline entries belonging to `records` (by tracking number). */
function timelineFor(timeline, records) {
  const titles = new Set(records.map(r => r.Title))
  return timeline.filter(e => titles.has(e.Title))
}

/**
 * Internal mail for one month (+ optionally the previous one).
 * @returns {Promise<{ cur: {packages, timeline}, prev: {packages, timeline}|null }>}
 */
export async function fetchInternalMonth(siteApi, key, { withPrevious = false } = {}) {
  const fromKey = withPrevious ? prevMonthKey(key) : key
  const [packages, timeline] = await Promise.all([
    getCreatedBetween(siteApi, LIST_PACKAGES, fromKey, key),
    getCreatedBetween(siteApi, LIST_TIMELINE_ENTRIES, fromKey, timelineEndKey(key)),
  ])
  const slice = (k) => {
    const pkgs = packages.filter(notPending).filter(inMonth(k))
    return { packages: pkgs, timeline: timelineFor(timeline, pkgs) }
  }
  return { cur: slice(key), prev: withPrevious ? slice(fromKey) : null }
}

/**
 * External mail for one month (+ optionally the previous one), normalized via
 * externalRecords(). Timeline + item rows are optional (the summary skips them).
 * @returns {Promise<{ cur: object, prev: object|null }>}
 */
export async function fetchExternalMonth(siteApi, key, {
  withPrevious = false,
  withTimeline = true,
  withItems = true,
} = {}) {
  const fromKey = withPrevious ? prevMonthKey(key) : key
  const [headers, logRows, items, timeline] = await Promise.all([
    getCreatedBetween(siteApi, LIST_EXTERNAL_PACKAGES, fromKey, key),
    getCreatedBetween(siteApi, LIST_EXTERNAL_LOG, fromKey, key),
    withItems ? getCreatedBetween(siteApi, LIST_EXTERNAL_ITEMS, fromKey, key) : Promise.resolve([]),
    withTimeline ? getCreatedBetween(siteApi, LIST_TIMELINE_ENTRIES, fromKey, timelineEndKey(key)) : Promise.resolve([]),
  ])
  const slice = (k) => {
    const recs = externalRecords(
      headers.filter(notPending).filter(inMonth(k)),
      logRows.filter(inMonth(k)),
    )
    return {
      ...recs,
      categories: externalCategoryRecords(items, recs.tracked, recs.logged),
      timeline: timelineFor(timeline, recs.tracked),
    }
  }
  return { cur: slice(key), prev: withPrevious ? slice(fromKey) : null }
}
