import { __dayjs } from '../../../../libs/nofbiz/nofbiz.base.js'
import { shortLabel, sumBy } from './report-stats.js'

/**
 * Excel export helpers for the report dashboards. Row-shaping functions used by
 * the detail-report routes; the multi-sheet writer lives in utils/workbook-export.js.
 */

const MS_PER_HOUR = 3600000

const round1 = (n) => (isFinite(n) ? Math.round(n * 10) / 10 : '')

/** Duration in hours (1 decimal), '' when unknown -- numeric so Excel can aggregate. */
export const toHours = (ms) => (isFinite(ms) && ms > 0 ? round1(ms / MS_PER_HOUR) : '')

/** Percentage (1 decimal). */
export const toPct = (p) => round1(p)

export const formatDateTime = (iso) => {
  const d = __dayjs(iso)
  return d.isValid() ? d.format('YYYY-MM-DD HH:mm') : ''
}

/**
 * Report info + KPI comparison sheet.
 * @param {Array<[string, string]>} info  Leading [label, value] rows (report, month, filter...).
 * @param {Array<{ label: string, cur: number|string, prev: number|string }>} metrics
 */
export function kpiSheetRows(info, metrics) {
  const rows = info.map(([label, value]) => ({ Metric: label, 'Selected month': value, 'Previous month': '' }))
  rows.push({ Metric: '', 'Selected month': '', 'Previous month': '' })
  for (const m of metrics) rows.push({ Metric: m.label, 'Selected month': m.cur, 'Previous month': m.prev })
  return rows
}

/** Cross-tab matrix as rows: first column = row label, one column per col, plus a row total. */
export function matrixSheetRows(rows, cols, matrix, { corner, rowTotal, colTotal, rowLabel = (r) => r }) {
  const out = rows.map((r, i) => {
    const row = { [corner]: rowLabel(r) }
    cols.forEach((c, j) => { row[shortLabel(c)] = matrix[i][j] })
    row[rowTotal] = sumBy(matrix[i], v => v)
    return row
  })
  const totals = { [corner]: colTotal }
  cols.forEach((c, j) => { totals[shortLabel(c)] = sumBy(matrix, row => row[j]) })
  totals[rowTotal] = ''
  out.push(totals)
  return out
}

/** Weekly line-chart series as rows: Week + one column per series. */
export function weeklySheetRows(series) {
  const weeks = series[0]?.points || []
  return weeks.map((pt, wi) => {
    const row = { Week: pt.label }
    for (const s of series) row[s.name] = s.points[wi].y
    return row
  })
}

/** Status-donut slices as rows. */
export function statusSheetRows(slices, unit) {
  const total = sumBy(slices, s => s.value)
  return slices.map(s => ({ Status: s.label, [unit]: s.value, '% of total': toPct(total ? (s.value / total) * 100 : 0) }))
}

