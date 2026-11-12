import { __dayjs } from '../../../../libs/nofbiz/nofbiz.base.js'
import { PACKAGE_STATUSES, STATUS_LABELS, BUILDING_PALETTE } from '../../../../utils/constants.js'
import { getLocationValue } from '../../../../utils/user-helpers.js'

/**
 * Pure aggregation helpers shared by the reports summary and both detail
 * dashboards (internal + external). No DOM, no fetching.
 *
 * Reporting convention: PENDING items are never relevant. Fetchers drop them
 * (see report-data.js) and status breakdowns exclude the status entirely.
 */

// Status palette (matches --posthub-status-* in variables.css; SVG fill
// attribute does not resolve CSS vars reliably so values are inlined here).
export const STATUS_COLORS = {
  'in transit': '#f1875a',
  'arrived': '#009fb1',
  'awaiting signature': '#7a5bd6',
  'delivered': '#0f7164',
}
// Statuses shown in reports (pending excluded by convention).
export const REPORT_STATUSES = PACKAGE_STATUSES.filter(s => s !== 'pending')

// Series colors (all from the token palette).
export const COLOR_OUTGOING = '#f1875a'
export const COLOR_INCOMING = '#009fb1'

export const shortLabel = (building) => {
  if (typeof building !== 'string') return String(building ?? '')
  const parts = building.split('|')
  return parts.length > 1 ? parts[parts.length - 1].trim() : building.trim()
}

export const colorFor = (index) => BUILDING_PALETTE[index % BUILDING_PALETTE.length]

export const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : NaN)

export const sumBy = (arr, fn) => arr.reduce((s, x) => s + fn(x), 0)

export const pct = (part, whole) => (whole > 0 ? (part / whole) * 100 : 0)

export const fmtPctValue = (p) => `${Math.round(p)}%`

export function formatDuration(ms) {
  if (!isFinite(ms) || ms <= 0) return '--'
  const totalMin = Math.round(ms / 60000)
  const days = Math.floor(totalMin / (60 * 24))
  const hours = Math.floor((totalMin % (60 * 24)) / 60)
  const mins = totalMin % 60
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${mins}m`
  return `${mins}m`
}

/** Positive integer quantity from a SharePoint string field; defaults to 1. */
export function toQty(raw) {
  const n = parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 ? n : 1
}

/** Counts per reportable status, optionally weighted (e.g. by item count). */
export function statusCounts(records, weightOf = () => 1) {
  const counts = Object.fromEntries(REPORT_STATUSES.map(s => [s, 0]))
  for (const r of records) {
    if (r.Status in counts) counts[r.Status] += weightOf(r)
  }
  return counts
}

/** Status-donut slices (pending excluded), optionally weighted. */
export function statusSlices(records, weightOf) {
  const counts = statusCounts(records, weightOf)
  return REPORT_STATUSES.map(s => ({ label: STATUS_LABELS[s], value: counts[s], color: STATUS_COLORS[s] }))
}

// --- Timeline-derived metrics ---

/**
 * Map of tracking number -> { ts, location } of the earliest STATUS timeline
 * entry. Non-status events (chase, reprint, ...) are skipped so a late event
 * never becomes the "earliest" and mis-attributes origin.
 */
export function buildOriginIndex(timeline) {
  const earliest = new Map()
  for (const entry of timeline) {
    if (!PACKAGE_STATUSES.includes(entry.Status)) continue
    const ts = __dayjs(entry.Created)
    if (!ts.isValid()) continue
    const cur = earliest.get(entry.Title)
    if (!cur || ts.isBefore(cur.ts)) earliest.set(entry.Title, { ts, location: entry.Location })
  }
  return earliest
}

/** Origin office of a package: earliest timeline location, else current location. */
export function getOrigin(pkg, originIndex) {
  const fromTimeline = originIndex.get(pkg.Title)
  if (fromTimeline?.location) return getLocationValue(fromTimeline.location)
  return getLocationValue(pkg.CurrentLocation)
}

/** Per-package delivery duration (earliest "in transit" -> earliest "delivered"). Map<title, ms>. */
export function packageDeliveryMs(timeline) {
  const byPkg = new Map()
  for (const entry of timeline) {
    const ts = __dayjs(entry.Created)
    if (!ts.isValid()) continue
    let slot = byPkg.get(entry.Title)
    if (!slot) { slot = { inTransit: null, delivered: null }; byPkg.set(entry.Title, slot) }
    if (entry.Status === 'in transit' && (!slot.inTransit || ts.isBefore(slot.inTransit))) slot.inTransit = ts
    if (entry.Status === 'delivered' && (!slot.delivered || ts.isBefore(slot.delivered))) slot.delivered = ts
  }
  const out = new Map()
  for (const [title, { inTransit, delivered }] of byPkg) {
    if (!inTransit || !delivered) continue
    const diff = delivered.diff(inTransit)
    if (diff > 0) out.set(title, diff)
  }
  return out
}

/**
 * Average delivery time per group (e.g. destination office). Returns rows for
 * the horizontal bar (sorted desc) plus a group -> ms lookup.
 */
export function avgTimeByGroup(records, timeline, groups, groupOf) {
  const dMap = packageDeliveryMs(timeline)
  const acc = Object.fromEntries(groups.map(g => [g, []]))
  for (const r of records) {
    const ms = dMap.get(r.Title)
    if (ms == null) continue
    const g = groupOf(r)
    if (g in acc) acc[g].push(ms)
  }
  const byGroup = {}
  const rows = groups.map((g, i) => {
    const v = acc[g].length ? avg(acc[g]) : 0
    byGroup[g] = v
    return { label: shortLabel(g), raw: g, color: colorFor(i), value: v }
  }).sort((a, b) => b.value - a.value)
  return { rows, byGroup }
}

// --- Matrix + weekly series ---

/** rows x cols count matrix; `rowOf`/`colOf` map a record to its keys. */
export function crossMatrix(records, rows, cols, rowOf, colOf, weightOf = () => 1) {
  const ri = Object.fromEntries(rows.map((r, i) => [r, i]))
  const ci = Object.fromEntries(cols.map((c, i) => [c, i]))
  const m = rows.map(() => cols.map(() => 0))
  for (const rec of records) {
    const r = ri[rowOf(rec)]
    const c = ci[colOf(rec)]
    if (r !== undefined && c !== undefined) m[r][c] += weightOf(rec)
  }
  return m
}

/**
 * Weekly volume per group within one month, as line-chart series. Weeks are
 * fixed 7-day blocks of the month (1-7, 8-14, 15-21, 22-28, 29-end) so every
 * month has comparable buckets and no 1-day partial week. Buckets that start
 * after today are omitted (current month shows no future zeros).
 *
 * @param {object[]} records
 * @param {import('dayjs').Dayjs} monthStart
 * @param {string[]} groups
 * @param {{ groupOf: (r)=>string, weightOf?: (r)=>number, nameOf?: (g)=>string }} opts
 */
export function weeklySeries(records, monthStart, groups, { groupOf, weightOf = () => 1, nameOf = shortLabel }) {
  const DAYS_PER_WEEK = 7
  const start = monthStart.startOf('month')
  const daysInMonth = start.daysInMonth()
  const today = __dayjs().endOf('day')

  const weeks = []
  for (let first = 1; first <= daysInMonth; first += DAYS_PER_WEEK) {
    const from = start.date(first)
    if (from.isAfter(today)) break
    const last = Math.min(first + DAYS_PER_WEEK - 1, daysInMonth)
    weeks.push({ from, label: `${first}-${last} ${start.format('MMM YYYY')}` })
  }

  const counts = Object.fromEntries(groups.map(g => [g, new Array(weeks.length).fill(0)]))
  for (const r of records) {
    const ts = __dayjs(r.Created)
    if (!ts.isValid() || !ts.isSame(start, 'month')) continue
    const wi = Math.floor((ts.date() - 1) / DAYS_PER_WEEK)
    const g = groupOf(r)
    if (wi < weeks.length && g in counts) counts[g][wi] += weightOf(r)
  }

  return groups.map((g, i) => ({
    name: nameOf(g),
    color: colorFor(i),
    points: weeks.map((w, wi) => ({ x: w.from.toDate(), y: counts[g][wi], label: w.label })),
  }))
}

// --- Delta chips (vs previous month) ---

const DELTA_TITLE = 'vs previous month'
const fmtSignedPct = (p) => `${p > 0 ? '+' : ''}${p.toFixed(1)}%`

/** Relative change chip; `goodDir` says which direction is positive. */
export function deltaRel(cur, prev, goodDir = 'up') {
  if (prev == null || prev === 0) return null
  const p = ((cur - prev) / prev) * 100
  if (!isFinite(p)) return null
  const tone = p === 0 ? 'neutral' : ((p > 0) === (goodDir === 'up') ? 'positive' : 'negative')
  return { text: fmtSignedPct(p), tone, title: DELTA_TITLE }
}

/** Percentage-point change chip. */
export function deltaPp(cur, prev) {
  if (prev == null) return null
  const d = cur - prev
  const tone = d === 0 ? 'neutral' : (d > 0 ? 'positive' : 'negative')
  return { text: `${d > 0 ? '+' : ''}${d.toFixed(1)} pp`, tone, title: DELTA_TITLE }
}

/** Duration change chip (lower is better). */
export function deltaTime(curMs, prevMs) {
  if (!isFinite(prevMs) || prevMs <= 0 || !isFinite(curMs)) return null
  return deltaRel(curMs, prevMs, 'down')
}

// --- Internal mail ---

/** Top-line internal metrics (pending already excluded upstream). */
export function internalKpis(packages, timeline) {
  const sent = packages.length
  const received = packages.filter(p => p.Status === 'arrived' || p.Status === 'delivered').length
  const delivered = packages.filter(p => p.Status === 'delivered').length
  return {
    sent,
    received,
    delivered,
    pctDelivered: pct(delivered, sent),
    avgMs: avg([...packageDeliveryMs(timeline).values()]),
  }
}

/** Per-building sent (by origin), received + delivered (by destination). */
export function internalBuildingStats(packages, timeline, buildings) {
  const originIndex = buildOriginIndex(timeline)
  const stat = Object.fromEntries(buildings.map(b => [b, { sent: 0, received: 0, delivered: 0 }]))
  for (const pkg of packages) {
    const origin = getOrigin(pkg, originIndex)
    const dest = getLocationValue(pkg.DestinationLocation)
    if (origin in stat) stat[origin].sent++
    if (dest in stat) {
      stat[dest].received++
      if (pkg.Status === 'delivered') stat[dest].delivered++
    }
  }
  return { stat, originIndex }
}

/** Origin x destination matrix for internal mail. */
export function internalFlowMatrix(packages, buildings, originIndex) {
  return crossMatrix(
    packages, buildings, buildings,
    pkg => getOrigin(pkg, originIndex),
    pkg => getLocationValue(pkg.DestinationLocation),
  )
}

/** Keep packages whose origin or destination is `building` (+ their timeline). */
export function filterInternalByBuilding(packages, timeline, building) {
  if (!building) return { packages, timeline }
  const originIndex = buildOriginIndex(timeline)
  const kept = packages.filter(pkg =>
    getOrigin(pkg, originIndex) === building || getLocationValue(pkg.DestinationLocation) === building)
  const keep = new Set(kept.map(p => p.Title))
  return { packages: kept, timeline: timeline.filter(e => keep.has(e.Title)) }
}

// --- External mail ---

/**
 * Flatten external mail into uniform volume records:
 * - tracked collection headers -> one record weighted by ItemCount (incoming, has Status)
 * - log rows -> one record weighted by Quantity (incoming or outgoing, no Status)
 * Every record: { Title, Created, office, direction, qty, tracked, Status? }.
 */
export function externalRecords(headers, logRows) {
  const tracked = headers.map(h => ({
    Title: h.Title,
    Created: h.Created,
    office: getLocationValue(h.DestinationLocation),
    direction: h.Direction || 'incoming',
    qty: toQty(h.ItemCount),
    tracked: true,
    Status: h.Status,
  }))
  const logged = logRows.map(l => ({
    Title: l.Title,
    Created: l.Created,
    office: getLocationValue(l.InternalOffice),
    direction: l.Direction || 'incoming',
    qty: toQty(l.Quantity),
    tracked: false,
    category: l.Category || 'Uncategorized',
  }))
  return { tracked, logged, all: [...tracked, ...logged] }
}

/**
 * Category volume records: one per tracked item (qty 1, office from its header)
 * plus each log row (weighted by Quantity).
 */
export function externalCategoryRecords(items, trackedRecords, loggedRecords) {
  const officeByTitle = new Map(trackedRecords.map(r => [r.Title, r.office]))
  const fromItems = items
    .filter(it => officeByTitle.has(it.Title))
    .map(it => ({ category: it.Category || 'Uncategorized', office: officeByTitle.get(it.Title), qty: 1 }))
  return [...fromItems, ...loggedRecords.map(r => ({ category: r.category, office: r.office, qty: r.qty }))]
}

const isIncoming = r => r.direction === 'incoming'
const isOutgoing = r => r.direction === 'outgoing'
const isDelivered = r => r.Status === 'delivered'
const qtyOf = r => r.qty

/** Top-line external metrics (in items). */
export function externalKpis({ tracked, all }, timeline) {
  const trackedQty = sumBy(tracked, qtyOf)
  const delivered = sumBy(tracked.filter(isDelivered), qtyOf)
  return {
    incoming: sumBy(all.filter(isIncoming), qtyOf),
    outgoing: sumBy(all.filter(isOutgoing), qtyOf),
    trackedQty,
    loggedQty: sumBy(all.filter(r => !r.tracked), qtyOf),
    delivered,
    pctDelivered: pct(delivered, trackedQty),
    avgMs: avg([...packageDeliveryMs(timeline).values()]),
  }
}

/** Per-office incoming / outgoing / tracked / delivered (in items). */
export function externalOfficeStats(records, offices) {
  const stat = Object.fromEntries(offices.map(o => [o, { incoming: 0, outgoing: 0, tracked: 0, delivered: 0 }]))
  for (const r of records) {
    const s = stat[r.office]
    if (!s) continue
    if (isIncoming(r)) s.incoming += r.qty
    if (isOutgoing(r)) s.outgoing += r.qty
    if (r.tracked) {
      s.tracked += r.qty
      if (isDelivered(r)) s.delivered += r.qty
    }
  }
  return stat
}

/** Keep external records (and tracked timeline) for one office. */
export function filterExternalByOffice(data, office) {
  if (!office) return data
  const byOffice = r => r.office === office
  const tracked = data.tracked.filter(byOffice)
  const keep = new Set(tracked.map(r => r.Title))
  return {
    tracked,
    logged: data.logged.filter(byOffice),
    all: data.all.filter(byOffice),
    categories: data.categories.filter(byOffice),
    timeline: data.timeline.filter(e => keep.has(e.Title)),
  }
}
