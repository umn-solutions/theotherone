import { defineRoute, SiteApi, getIcon } from '../../../../libs/nofbiz/nofbiz.base.js'

import { createKpiCard } from '../../../../components/kpiCard.js'
import { createDataTable } from '../../../../components/dataTable.js'
import { createDonutChart } from '../../../../components/charts/donutChart.js'
import { createGroupedBarChart } from '../../../../components/charts/groupedBarChart.js'
import { createHorizontalBarChart } from '../../../../components/charts/horizontalBarChart.js'
import { createFlowMatrix } from '../../../../components/charts/flowMatrix.js'
import { createLineChart } from '../../../../components/charts/lineChart.js'

import { STATUS_LABELS, TRACKING_NUMBER_LABEL } from '../../../../utils/constants.js'
import { getLocationValue, getUserDisplayName } from '../../../../utils/user-helpers.js'
import { guardAccess } from '../../../../utils/access.js'
import { TOOLTIPS } from '../../../../utils/copy.js'

import { createReportDashboard } from '../utils/reportDashboard.js'
import { fetchInternalMonth, monthStart } from '../utils/report-data.js'
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
  getOrigin,
  packageDeliveryMs,
  avgTimeByGroup,
  weeklySeries,
  deltaRel,
  deltaPp,
  deltaTime,
  internalKpis,
  internalBuildingStats,
  internalFlowMatrix,
  filterInternalByBuilding,
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
  config.setRouteTitle('Internal Mail Report')

  // Facilities route: employee+ access required
  if (!guardAccess('EMPLOYEE')) return []

  const siteApi = new SiteApi()
  const destinationOf = (pkg) => getLocationValue(pkg.DestinationLocation)

  /** All aggregates for the selected month + building filter. */
  function compute({ data, office, offices: buildings, monthKey }) {
    const cur = filterInternalByBuilding(data.cur.packages, data.cur.timeline, office)
    const prev = filterInternalByBuilding(data.prev.packages, data.prev.timeline, office)
    const k = internalKpis(cur.packages, cur.timeline)
    const { stat, originIndex } = internalBuildingStats(cur.packages, cur.timeline, buildings)
    const { rows: avgRows, byGroup: avgByBuilding } = avgTimeByGroup(cur.packages, cur.timeline, buildings, destinationOf)

    const indicatorRows = buildings.map(b => ({
      building: b,
      sent: stat[b].sent,
      received: stat[b].received,
      delivered: stat[b].delivered,
      pctDelivered: pct(stat[b].delivered, stat[b].received),
      avg: avgByBuilding[b] || 0,
    }))
    const sumOf = (key) => sumBy(indicatorRows, r => r[key])

    return {
      buildings,
      cur,
      originIndex,
      k,
      p: internalKpis(prev.packages, prev.timeline),
      avgRows,
      indicatorRows,
      indicatorTotals: {
        building: 'Total',
        sent: sumOf('sent'),
        received: sumOf('received'),
        delivered: sumOf('delivered'),
        pctDelivered: pct(sumOf('delivered'), sumOf('received')),
        avg: k.avgMs,
      },
      flow: internalFlowMatrix(cur.packages, buildings, originIndex),
      weekly: weeklySeries(cur.packages, monthStart(monthKey), buildings, { groupOf: pkg => getOrigin(pkg, originIndex) }),
      statuses: statusSlices(cur.packages),
    }
  }

  function render(m, charts) {
    const { buildings, k, p } = m

    charts.volumeByBuilding.update({
      categories: buildings,
      series: [
        { name: 'Sent', color: COLOR_OUTGOING, values: m.indicatorRows.map(r => r.sent) },
        { name: 'Received', color: COLOR_INCOMING, values: m.indicatorRows.map(r => r.received) },
      ],
    })
    charts.volumeDonut.update(
      m.indicatorRows.map((r, i) => ({ label: shortLabel(r.building), value: r.sent, color: colorFor(i) })),
      { centerLabel: String(m.indicatorTotals.sent), centerSublabel: 'total sent' },
    )
    charts.flowMatrix.update({ buildings, matrix: m.flow })
    charts.weekly.update({ series: m.weekly })
    charts.avgTime.update(m.avgRows)
    charts.indicators.update({
      columns: [
        { key: 'building', label: 'Office', align: 'left', isHeader: true },
        { key: 'sent', label: 'Sent', align: 'right' },
        { key: 'received', label: 'Received', align: 'right' },
        { key: 'delivered', label: 'Delivered', align: 'right' },
        { key: 'pctDelivered', label: '% Delivered', align: 'right', format: fmtPctValue },
        { key: 'avg', label: 'Avg Time', align: 'right', format: formatDuration },
      ],
      rows: m.indicatorRows.map(r => ({ ...r, building: shortLabel(r.building) })),
      footer: m.indicatorTotals,
    })
    charts.statusDonut.update(m.statuses, { centerLabel: fmtPctValue(k.pctDelivered), centerSublabel: 'delivered' })

    return [
      createKpiCard({ label: 'Sent', value: k.sent, icon: getIcon('send-plane-line'), delta: deltaRel(k.sent, p.sent), tooltip: TOOLTIPS.reports.sentInternal }),
      createKpiCard({ label: 'Received', value: k.received, icon: getIcon('inbox-line'), delta: deltaRel(k.received, p.received), tooltip: TOOLTIPS.reports.received }),
      createKpiCard({ label: 'Delivered', value: k.delivered, icon: getIcon('checkbox-circle-line'), delta: deltaRel(k.delivered, p.delivered), tooltip: TOOLTIPS.reports.deliveredInternal }),
      createKpiCard({ label: '% Delivered', value: fmtPctValue(k.pctDelivered), icon: getIcon('check-double-line'), modifier: 'delivered', delta: deltaPp(k.pctDelivered, p.pctDelivered), tooltip: TOOLTIPS.reports.deliveredPctInternal }),
      createKpiCard({ label: 'Avg Delivery Time', value: formatDuration(k.avgMs), icon: getIcon('route-line'), sublabel: 'in transit to delivered', delta: deltaTime(k.avgMs, p.avgMs), tooltip: TOOLTIPS.reports.avgDeliveryTime }),
    ]
  }

  function exportSheets(m, info) {
    const { k, p } = m
    const deliveryMs = packageDeliveryMs(m.cur.timeline)
    return [
      {
        name: 'Summary',
        rows: kpiSheetRows(info, [
          { label: 'Sent', cur: k.sent, prev: p.sent },
          { label: 'Received', cur: k.received, prev: p.received },
          { label: 'Delivered', cur: k.delivered, prev: p.delivered },
          { label: '% Delivered', cur: toPct(k.pctDelivered), prev: toPct(p.pctDelivered) },
          { label: 'Avg delivery time (h)', cur: toHours(k.avgMs), prev: toHours(p.avgMs) },
        ]),
      },
      {
        name: 'By office',
        rows: [...m.indicatorRows, m.indicatorTotals].map(r => ({
          Office: r.building,
          Sent: r.sent,
          Received: r.received,
          Delivered: r.delivered,
          '% Delivered': toPct(r.pctDelivered),
          'Avg delivery time (h)': toHours(r.avg),
        })),
      },
      {
        name: 'Flow between offices',
        rows: matrixSheetRows(m.buildings, m.buildings, m.flow, { corner: 'From \\ To', rowTotal: 'Sent', colTotal: 'Received', rowLabel: shortLabel }),
      },
      { name: 'Weekly volume', rows: weeklySheetRows(m.weekly) },
      { name: 'Status', rows: statusSheetRows(m.statuses, 'Items') },
      {
        name: 'Items',
        rows: m.cur.packages.map(pkg => ({
          [TRACKING_NUMBER_LABEL]: pkg.Title,
          Status: STATUS_LABELS[pkg.Status] || pkg.Status,
          Origin: getOrigin(pkg, m.originIndex),
          Destination: destinationOf(pkg),
          Sender: getUserDisplayName(pkg.Sender),
          Recipient: getUserDisplayName(pkg.Recipient),
          Created: formatDateTime(pkg.Created),
          'Delivery time (h)': toHours(deliveryMs.get(pkg.Title)),
        })),
      },
    ]
  }

  return createReportDashboard(config, {
    siteApi,
    reportKey: 'internal',
    title: 'Internal Mail Report',
    subtitle: 'internal mail volumes and flow between offices.',
    filterLabel: 'Office',
    filterHint: 'Origin or destination',
    rows: [
      {
        class: 'reports__overview',
        cards: [
          { key: 'volumeByBuilding', title: 'Volume by Office', subtitle: 'Sent and received per office' },
          { key: 'volumeDonut', title: 'Share by Origin Office', subtitle: 'Share of volume by origin' },
          { key: 'flowMatrix', title: 'Mail Flow Between Offices', subtitle: 'Origin (rows) to destination (columns)', scroll: true, tooltip: TOOLTIPS.reports.flowMatrix },
        ],
      },
      {
        class: 'reports__detail-2col',
        cards: [
          { key: 'weekly', title: 'Weekly Volume by Office', subtitle: 'Mail created per week of the month, by origin' },
          { key: 'avgTime', title: 'Avg Delivery Time by Office', subtitle: 'In transit to delivered, per destination' },
        ],
      },
      {
        class: 'reports__summary',
        cards: [
          { key: 'indicators', title: 'Indicators by Office', subtitle: 'Volume and delivery summary', scroll: true },
          { key: 'statusDonut', title: 'Status Breakdown', subtitle: 'Distribution across statuses' },
        ],
      },
    ],
    createCharts: (m) => ({
      volumeByBuilding: createGroupedBarChart({ container: m.volumeByBuilding, data: { categories: [], series: [] }, options: { labelFormatter: shortLabel } }),
      volumeDonut: createDonutChart({ container: m.volumeDonut, data: [] }),
      flowMatrix: createFlowMatrix({ container: m.flowMatrix, labelFormatter: shortLabel }),
      weekly: createLineChart({ container: m.weekly, data: { series: [] }, options: { ticksAtPoints: true } }),
      avgTime: createHorizontalBarChart({ container: m.avgTime, data: [], options: { valueFormatter: formatDuration } }),
      indicators: createDataTable({ container: m.indicators }),
      statusDonut: createDonutChart({ container: m.statusDonut, data: [] }),
    }),
    load: (monthKey) => fetchInternalMonth(siteApi, monthKey, { withPrevious: true }),
    compute,
    render,
    exportSheets,
  })
})
