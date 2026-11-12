import {
  defineRoute,
  Container,
  Text,
  Button,
  Router,
  getIcon,
  Toast,
  SiteApi,
  Loader,
} from '../../../libs/nofbiz/nofbiz.base.js'

import { createNavbar } from '../../../components/navbar.js'
import { createKpiCard } from '../../../components/kpiCard.js'
import { createChartCard } from '../../../components/chartCard.js'
import { createPageHeader } from '../../../components/pageHeader.js'
import { createGroupedBarChart } from '../../../components/charts/groupedBarChart.js'
import { createFlowMatrix } from '../../../components/charts/flowMatrix.js'

import { guardAccess } from '../../../utils/access.js'

import { REPORTS_PATH, loadActiveLocationTitles, registerReportCleanup } from './utils/reportDashboard.js'
import { currentMonthKey, monthLabel, fetchInternalMonth, fetchExternalMonth } from './utils/report-data.js'
import {
  COLOR_OUTGOING,
  COLOR_INCOMING,
  shortLabel,
  fmtPctValue,
  formatDuration,
  internalKpis,
  internalBuildingStats,
  internalFlowMatrix,
  externalKpis,
  externalOfficeStats,
} from './utils/report-stats.js'

/**
 * Reports landing: current-month summary, internal mail (left) vs external
 * mail (right). Each panel (or its "Detailed view" button) opens the
 * month-scoped detail dashboard.
 */
export default defineRoute((config) => {
  config.setRouteTitle('Reports')

  // Facilities route: employee+ access required
  if (!guardAccess('EMPLOYEE')) return []

  const siteApi = new SiteApi()
  const monthKey = currentMonthKey()

  const { header } = createPageHeader({
    title: 'Reports',
    subtitle: `Mail activity for ${monthLabel(monthKey)} (items created this month)`,
    backPath: 'facilities',
  })

  /**
   * One clickable summary panel + its "Detailed view" button.
   * @returns {{ column: Container, kpiRow: Container, chartCard: object }}
   */
  function createSummaryPanel({ title, description, icon, detailPath, chartTitle, chartSubtitle }) {
    const open = () => Router.navigateTo(`${REPORTS_PATH}/${detailPath}`)
    const kpiRow = new Container([], { class: 'reports-summary__kpis' })
    const chartCard = createChartCard({ title: chartTitle, subtitle: chartSubtitle, class: 'reports__card--scroll' })

    const panel = new Container([
      new Container([
        new Container([getIcon(icon)], { class: 'reports-summary__icon', as: 'span' }),
        new Container([
          new Text(title, { type: 'h2', class: 'reports-summary__title' }),
          new Text(description, { type: 'p', class: 'reports-summary__description' }),
        ]),
      ], { class: 'reports-summary__header' }),
      kpiRow,
      chartCard.card,
    ], {
      class: 'reports-summary__panel',
      onClickHandler: open,
    })

    const column = new Container([
      panel,
      new Button('Detailed view', { onClickHandler: open, class: 'reports-summary__button' }),
    ], { class: 'reports-summary__column' })

    return { column, kpiRow, chartCard }
  }

  const internal = createSummaryPanel({
    title: 'Internal Mail',
    description: 'Mail sent between company offices',
    icon: 'mail-send-line',
    detailPath: 'internal-details',
    chartTitle: 'Flow between buildings',
    chartSubtitle: 'Origin (rows) to destination (columns)',
  })

  const external = createSummaryPanel({
    title: 'External Mail',
    description: 'Mail received from and sent to external parties',
    icon: 'mail-unread-line',
    detailPath: 'external-details',
    chartTitle: 'Volume by office',
    chartSubtitle: 'Incoming and outgoing items per office',
  })

  // --- Charts ---

  let flowMatrix = null
  let volumeByOffice = null
  const isAborted = registerReportCleanup(config, () => [flowMatrix, volumeByOffice])

  function renderInternal({ packages, timeline }, buildings) {
    const k = internalKpis(packages, timeline)
    internal.kpiRow.children = [
      createKpiCard({ label: 'Sent', value: k.sent, icon: getIcon('send-plane-line') }),
      createKpiCard({ label: 'Delivered', value: k.delivered, icon: getIcon('checkbox-circle-line') }),
      createKpiCard({ label: '% Delivered', value: fmtPctValue(k.pctDelivered), icon: getIcon('check-double-line'), modifier: 'delivered' }),
      createKpiCard({ label: 'Avg Delivery', value: formatDuration(k.avgMs), icon: getIcon('route-line') }),
    ]
    flowMatrix = createFlowMatrix({ container: internal.chartCard.getMountElement(), labelFormatter: shortLabel })
    flowMatrix.render()
    const { originIndex } = internalBuildingStats(packages, timeline, buildings)
    flowMatrix.update({ buildings, matrix: internalFlowMatrix(packages, buildings, originIndex) })
  }

  function renderExternal(data, offices) {
    const k = externalKpis(data, data.timeline)
    external.kpiRow.children = [
      createKpiCard({ label: 'Incoming', value: k.incoming, icon: getIcon('inbox-line') }),
      createKpiCard({ label: 'Outgoing', value: k.outgoing, icon: getIcon('send-plane-line') }),
      createKpiCard({ label: 'Delivered', value: k.delivered, icon: getIcon('checkbox-circle-line'), sublabel: 'tracked items' }),
      createKpiCard({ label: '% Delivered', value: fmtPctValue(k.pctDelivered), icon: getIcon('check-double-line'), modifier: 'delivered', sublabel: 'of tracked items' }),
    ]
    const stat = externalOfficeStats(data.all, offices)
    volumeByOffice = createGroupedBarChart({
      container: external.chartCard.getMountElement(),
      data: {
        categories: offices,
        series: [
          { name: 'Incoming', color: COLOR_INCOMING, values: offices.map(o => stat[o].incoming) },
          { name: 'Outgoing', color: COLOR_OUTGOING, values: offices.map(o => stat[o].outgoing) },
        ],
      },
      options: { labelFormatter: shortLabel },
    })
    volumeByOffice.render()
  }

  // --- Data ---

  const pageLoader = new Loader(new Text('Loading...'), { animation: 'pulse' })

  async function loadSummary() {
    if (isAborted()) return
    pageLoader.enable()
    const loading = Toast.loading('Loading reports...')
    const offices = await loadActiveLocationTitles(siteApi)
    const [internalRes, externalRes] = await Promise.allSettled([
      fetchInternalMonth(siteApi, monthKey),
      // Summary needs no item rows (categories) or timeline (no external avg time here).
      fetchExternalMonth(siteApi, monthKey, { withTimeline: false, withItems: false }),
    ])
    if (isAborted()) {
      loading.dismiss()
      return
    }

    if (internalRes.status === 'fulfilled') renderInternal(internalRes.value.cur, offices)
    else console.error('[Reports.summary] internal mail load failed', internalRes.reason)
    if (externalRes.status === 'fulfilled') renderExternal(externalRes.value.cur, offices)
    else console.error('[Reports.summary] external mail load failed', externalRes.reason)

    const failed = [internalRes, externalRes].filter(r => r.status === 'rejected').length
    if (failed) loading.error(failed === 2 ? 'Failed to load reports' : 'Some report data failed to load')
    else loading.dismiss()
    pageLoader.disable()
  }

  // Defer to after the route mounts: Loader.enable() is a no-op on an unmounted loader.
  setTimeout(loadSummary, 0)

  const grid = new Container([internal.column, external.column], { class: 'reports-summary__grid' })
  const bodyArea = new Container([grid, pageLoader], { class: 'reports-summary__body' })
  const contentArea = new Container([header, bodyArea], { class: 'posthub__page-content' })

  return [createNavbar(), contentArea]
})
