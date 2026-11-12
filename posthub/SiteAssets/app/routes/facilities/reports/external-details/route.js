import { defineRoute, SiteApi, getIcon } from '../../../../libs/nofbiz/nofbiz.base.js'

import { createKpiCard } from '../../../../components/kpiCard.js'
import { createDataTable } from '../../../../components/dataTable.js'
import { createDonutChart } from '../../../../components/charts/donutChart.js'
import { createGroupedBarChart } from '../../../../components/charts/groupedBarChart.js'
import { createHorizontalBarChart } from '../../../../components/charts/horizontalBarChart.js'
import { createFlowMatrix } from '../../../../components/charts/flowMatrix.js'
import { createLineChart } from '../../../../components/charts/lineChart.js'

import { STATUS_LABELS, DIRECTION_LABELS } from '../../../../utils/constants.js'
import { guardAccess } from '../../../../utils/access.js'

import { createReportDashboard } from '../utils/reportDashboard.js'
import { fetchExternalMonth, monthStart } from '../utils/report-data.js'
import {
  COLOR_OUTGOING,
  COLOR_INCOMING,
  shortLabel,
  colorFor,
  sumBy,
  pct,
  fmtPctValue,
  formatDuration,
  statusSlices,
  packageDeliveryMs,
  avgTimeByGroup,
  crossMatrix,
  weeklySeries,
  deltaRel,
  deltaPp,
  deltaTime,
  externalKpis,
  externalOfficeStats,
  filterExternalByOffice,
} from '../utils/report-stats.js'
import {
  toHours,
  toPct,
  formatDateTime,
  kpiSheetRows,
  matrixSheetRows,
  weeklySheetRows,
  statusSheetRows,
} from '../utils/report-export.js'

export default defineRoute((config) => {
  config.setRouteTitle('External Mail Report')

  // Facilities route: employee+ access required
  if (!guardAccess('EMPLOYEE')) return []

  const siteApi = new SiteApi()
  // Donut slices beyond this are folded into "Other" (palette has 6 colors).
  const MAX_CATEGORY_SLICES = 5
  const officeOf = (r) => r.office
  const qtyOf = (r) => r.qty

  /** Categories ordered by volume desc, as [{ category, qty }]. */
  function categoryTotals(records) {
    const totals = new Map()
    for (const r of records) totals.set(r.category, (totals.get(r.category) || 0) + r.qty)
    return [...totals].map(([category, qty]) => ({ category, qty })).sort((a, b) => b.qty - a.qty)
  }

  function categorySlices(totals) {
    const top = totals.slice(0, MAX_CATEGORY_SLICES)
    const otherQty = sumBy(totals.slice(MAX_CATEGORY_SLICES), t => t.qty)
    const slices = top.map((t, i) => ({ label: t.category, value: t.qty, color: colorFor(i) }))
    if (otherQty > 0) slices.push({ label: 'Other', value: otherQty, color: colorFor(MAX_CATEGORY_SLICES) })
    return slices
  }

  /** All aggregates for the selected month + office filter. */
  function compute({ data, office, offices, monthKey }) {
    const cur = filterExternalByOffice(data.cur, office)
    const prev = filterExternalByOffice(data.prev, office)
    const k = externalKpis(cur, cur.timeline)
    const stat = externalOfficeStats(cur.all, offices)
    const { rows: avgRows, byGroup: avgByOffice } = avgTimeByGroup(cur.tracked, cur.timeline, offices, officeOf)

    const indicatorRows = offices.map(o => ({
      office: o,
      ...stat[o],
      pctDelivered: pct(stat[o].delivered, stat[o].tracked),
      avg: avgByOffice[o] || 0,
    }))
    const sumOf = (key) => sumBy(indicatorRows, r => r[key])

    const totals = categoryTotals(cur.categories)
    const categories = totals.map(t => t.category)

    return {
      offices,
      cur,
      k,
      p: externalKpis(prev, prev.timeline),
      avgRows,
      indicatorRows,
      indicatorTotals: {
        office: 'Total',
        incoming: sumOf('incoming'),
        outgoing: sumOf('outgoing'),
        tracked: sumOf('tracked'),
        delivered: sumOf('delivered'),
        pctDelivered: pct(sumOf('delivered'), sumOf('tracked')),
        avg: k.avgMs,
      },
      categoryTotal: sumBy(totals, t => t.qty),
      categorySlices: categorySlices(totals),
      categories,
      categoryMatrix: crossMatrix(cur.categories, categories, offices, r => r.category, officeOf, qtyOf),
      weekly: weeklySeries(cur.all, monthStart(monthKey), offices, { groupOf: officeOf, weightOf: qtyOf }),
      statuses: statusSlices(cur.tracked, qtyOf),
    }
  }

  function render(m, charts) {
    const { offices, k, p } = m

    charts.volumeByOffice.update({
      categories: offices,
      series: [
        { name: 'Incoming', color: COLOR_INCOMING, values: m.indicatorRows.map(r => r.incoming) },
        { name: 'Outgoing', color: COLOR_OUTGOING, values: m.indicatorRows.map(r => r.outgoing) },
      ],
    })
    charts.categoryDonut.update(m.categorySlices, { centerLabel: String(m.categoryTotal), centerSublabel: 'items' })
    charts.categoryMatrix.update({ rows: m.categories, cols: offices, matrix: m.categoryMatrix })
    charts.weekly.update({ series: m.weekly })
    charts.avgTime.update(m.avgRows)
    charts.indicators.update({
      columns: [
        { key: 'office', label: 'Office', align: 'left', isHeader: true },
        { key: 'incoming', label: 'Incoming', align: 'right' },
        { key: 'outgoing', label: 'Outgoing', align: 'right' },
        { key: 'tracked', label: 'Tracked', align: 'right' },
        { key: 'delivered', label: 'Delivered', align: 'right' },
        { key: 'pctDelivered', label: '% Delivered', align: 'right', format: fmtPctValue },
        { key: 'avg', label: 'Avg Time', align: 'right', format: formatDuration },
      ],
      rows: m.indicatorRows.map(r => ({ ...r, office: shortLabel(r.office) })),
      footer: m.indicatorTotals,
    })
    charts.statusDonut.update(m.statuses, { centerLabel: fmtPctValue(k.pctDelivered), centerSublabel: 'delivered' })

    return [
      createKpiCard({ label: 'Incoming', value: k.incoming, icon: getIcon('inbox-line'), sublabel: `${k.trackedQty} tracked, ${k.loggedQty} logged`, delta: deltaRel(k.incoming, p.incoming) }),
      createKpiCard({ label: 'Outgoing', value: k.outgoing, icon: getIcon('send-plane-line'), delta: deltaRel(k.outgoing, p.outgoing) }),
      createKpiCard({ label: 'Delivered', value: k.delivered, icon: getIcon('checkbox-circle-line'), sublabel: 'tracked items', delta: deltaRel(k.delivered, p.delivered) }),
      createKpiCard({ label: '% Delivered', value: fmtPctValue(k.pctDelivered), icon: getIcon('check-double-line'), modifier: 'delivered', sublabel: 'of tracked items', delta: deltaPp(k.pctDelivered, p.pctDelivered) }),
      createKpiCard({ label: 'Avg Delivery Time', value: formatDuration(k.avgMs), icon: getIcon('route-line'), sublabel: 'in transit to delivered', delta: deltaTime(k.avgMs, p.avgMs) }),
    ]
  }

  function exportSheets(m, info) {
    const { k, p } = m
    const deliveryMs = packageDeliveryMs(m.cur.timeline)
    return [
      {
        name: 'Summary',
        rows: kpiSheetRows(info, [
          { label: 'Incoming items', cur: k.incoming, prev: p.incoming },
          { label: 'Outgoing items', cur: k.outgoing, prev: p.outgoing },
          { label: 'Tracked items', cur: k.trackedQty, prev: p.trackedQty },
          { label: 'Logged items', cur: k.loggedQty, prev: p.loggedQty },
          { label: 'Delivered (tracked items)', cur: k.delivered, prev: p.delivered },
          { label: '% Delivered (of tracked)', cur: toPct(k.pctDelivered), prev: toPct(p.pctDelivered) },
          { label: 'Avg delivery time (h)', cur: toHours(k.avgMs), prev: toHours(p.avgMs) },
        ]),
      },
      {
        name: 'By office',
        rows: [...m.indicatorRows, m.indicatorTotals].map(r => ({
          Office: r.office,
          Incoming: r.incoming,
          Outgoing: r.outgoing,
          Tracked: r.tracked,
          Delivered: r.delivered,
          '% Delivered': toPct(r.pctDelivered),
          'Avg delivery time (h)': toHours(r.avg),
        })),
      },
      {
        name: 'Categories by office',
        rows: matrixSheetRows(m.categories, m.offices, m.categoryMatrix, { corner: 'Category', rowTotal: 'Total', colTotal: 'Total' }),
      },
      { name: 'Weekly volume', rows: weeklySheetRows(m.weekly) },
      { name: 'Status', rows: statusSheetRows(m.statuses, 'Items') },
      {
        name: 'Tracked',
        rows: m.cur.tracked.map(r => ({
          'Tracking ID': r.Title,
          Status: STATUS_LABELS[r.Status] || r.Status,
          Office: r.office,
          Items: r.qty,
          Created: formatDateTime(r.Created),
          'Delivery time (h)': toHours(deliveryMs.get(r.Title)),
        })),
      },
      {
        name: 'Logged',
        rows: m.cur.logged.map(r => ({
          'Log ID': r.Title,
          Direction: DIRECTION_LABELS[r.direction] || r.direction,
          Office: r.office,
          Category: r.category,
          Quantity: r.qty,
          Created: formatDateTime(r.Created),
        })),
      },
    ]
  }

  return createReportDashboard(config, {
    siteApi,
    reportKey: 'external',
    title: 'External Mail Report',
    subtitle: 'External mail volumes per office (tracked + logged items)',
    filterLabel: 'Office',
    filterHint: 'Receiving or sending office',
    rows: [
      {
        class: 'reports__overview',
        cards: [
          { key: 'volumeByOffice', title: 'Volume by office', subtitle: 'Incoming and outgoing items per office' },
          { key: 'categoryDonut', title: 'Volume by category', subtitle: 'Share of items by category' },
          { key: 'categoryMatrix', title: 'Categories by office', subtitle: 'Category (rows) per office (columns)', scroll: true },
        ],
      },
      {
        class: 'reports__detail-2col',
        cards: [
          { key: 'weekly', title: 'Weekly volume by office', subtitle: 'Items created per week of the month' },
          { key: 'avgTime', title: 'Avg delivery time by office', subtitle: 'Tracked mail, in transit to delivered' },
        ],
      },
      {
        class: 'reports__summary',
        cards: [
          { key: 'indicators', title: 'Indicators by office', subtitle: 'Volume and delivery summary', scroll: true },
          { key: 'statusDonut', title: 'Status of flow', subtitle: 'Tracked items across statuses' },
        ],
      },
    ],
    createCharts: (m) => ({
      volumeByOffice: createGroupedBarChart({ container: m.volumeByOffice, data: { categories: [], series: [] }, options: { labelFormatter: shortLabel } }),
      categoryDonut: createDonutChart({ container: m.categoryDonut, data: [] }),
      categoryMatrix: createFlowMatrix({
        container: m.categoryMatrix,
        labelFormatter: shortLabel,
        rowLabelFormatter: (c) => c,
        labels: { corner: 'Category \\ Office', rowTotal: 'Total', colTotal: 'Total', cell: 'at' },
      }),
      weekly: createLineChart({ container: m.weekly, data: { series: [] }, options: { ticksAtPoints: true } }),
      avgTime: createHorizontalBarChart({ container: m.avgTime, data: [], options: { valueFormatter: formatDuration } }),
      indicators: createDataTable({ container: m.indicators }),
      statusDonut: createDonutChart({ container: m.statusDonut, data: [] }),
    }),
    load: (monthKey) => fetchExternalMonth(siteApi, monthKey, { withPrevious: true }),
    compute,
    render,
    exportSheets,
  })
})
