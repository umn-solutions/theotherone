import {
  Container,
  Text,
  Button,
  ComboBox,
  Toast,
  Loader,
  FormField,
  extractComboBoxValue,
  __dayjs,
} from '../../../../libs/nofbiz/nofbiz.base.js'

import { createNavbar } from '../../../../components/navbar.js'
import { createChartCard } from '../../../../components/chartCard.js'
import { createPageHeader } from '../../../../components/pageHeader.js'
import { LIST_LOCATIONS, APP_NAME } from '../../../../utils/constants.js'
import { printInMode } from '../../../../utils/print-mode.js'
import { currentMonthKey, monthLabel, recentMonths } from './report-data.js'
import { downloadWorkbook } from './report-export.js'

export const REPORTS_PATH = 'facilities/reports'

/** Active location titles (empty on failure, logged + toasted). */
export async function loadActiveLocationTitles(siteApi) {
  try {
    const locations = await siteApi.list(LIST_LOCATIONS).getItems({ IsActive: 'true' })
    return locations.map(l => l.Title)
  } catch (err) {
    console.error('[Reports] failed to load locations', err)
    Toast.error('Failed to load locations')
    return []
  }
}

/**
 * Registers teardown for a reports route: sets the returned `isAborted()` flag
 * and destroys every chart from `getCharts()`. Charts own ResizeObservers that
 * leak if not destroyed, and post-await renders into a torn-down route throw
 * ResizeObserver.observe(null) -- guard every post-await DOM touch with
 * isAborted().
 *
 * @param {object} config        defineRoute config
 * @param {() => object[]} getCharts
 * @returns {() => boolean} isAborted
 */
export function registerReportCleanup(config, getCharts) {
  let aborted = false
  config.onCleanup(() => {
    aborted = true
    for (const chart of getCharts()) {
      try {
        chart?.destroy?.()
      } catch (err) {
        console.warn('[Reports.cleanup] chart destroy failed', err)
      }
    }
  })
  return () => aborted
}

/**
 * Shared shell for the month-scoped detail dashboards (internal + external):
 * navbar, header, filter sidebar (month picker + office filter), KPI row,
 * chart-card rows, loader, fetch sequencing, and chart lifecycle.
 *
 * The route supplies data + rendering. Sidebar actions:
 * - Summary Report: prints the dashboard (A4 landscape, print header + charts)
 * - Excel Report: downloads the route's `exportSheets` as one XLSX workbook
 *
 * @param {object} config  defineRoute config
 * @param {object} spec
 * @param {object} spec.siteApi
 * @param {string} spec.reportKey       Short id for file names (e.g. 'internal').
 * @param {string} spec.title
 * @param {string} spec.subtitle        Prefix; the selected month is appended.
 * @param {string} spec.filterLabel     Sidebar heading for the office filter (e.g. 'Building').
 * @param {string} spec.filterHint      Field label under the heading.
 * @param {Array<{ class: string, cards: Array<{ key: string, title: string, subtitle?: string, scroll?: boolean }> }>} spec.rows
 * @param {(mounts: Record<string, HTMLElement>) => Record<string, object>} spec.createCharts
 *   Called once after mount; returns chart instances keyed like the cards.
 * @param {(monthKey: string) => Promise<object>} spec.load  Data for a month (may reject).
 * @param {(ctx: { data: object, office: string|null, offices: string[], monthKey: string }) => object} spec.compute
 *   Derives the view model (all aggregates) once per data/filter change.
 * @param {(model: object, charts: object) => object[]} spec.render
 *   Updates the charts from the model and returns the KPI cards for the top row.
 * @param {(model: object, info: Array<[string, string]>) => Array<{ name: string, rows: object[] }>} spec.exportSheets
 *   Excel sheets from the model; `info` = report/month/filter/generated rows.
 * @returns {object[]} Route components.
 */
export function createReportDashboard(config, spec) {
  // "All buildings" / "All offices" -- matches the route's filter noun.
  const ALL_OFFICES = `All ${spec.filterLabel.toLowerCase()}s`
  const months = recentMonths()

  const state = {
    monthKey: currentMonthKey(),
    office: null,
    offices: [],
    data: null,
    model: null,
  }

  const { header, subtitle } = createPageHeader({
    title: spec.title,
    subtitle: `${spec.subtitle} -- ${monthLabel(state.monthKey)}`,
    backPath: REPORTS_PATH,
  })

  const filterSection = new Container([], { class: 'posthub__filter-sidebar reports__filters' })
  const kpiGrid = new Container([], { class: 'reports__kpi-grid' })
  // Shown only when printing (Summary Report): brand, title, period, filter.
  const printHeader = new Container([], { class: 'reports__print-header' })

  const cards = {}
  const rows = spec.rows.map(row => new Container(
    row.cards.map(c => {
      cards[c.key] = createChartCard({
        title: c.title,
        subtitle: c.subtitle,
        ...(c.scroll ? { class: 'reports__card--scroll' } : {}),
      })
      return cards[c.key].card
    }),
    { class: row.class },
  ))

  const contentSection = new Container([printHeader, kpiGrid, ...rows], { class: 'reports__content' })
  const pageLoader = new Loader(new Text('Loading...'), { animation: 'pulse' })

  // --- Chart lifecycle ---

  let charts = null
  const isAborted = registerReportCleanup(config, () => Object.values(charts || {}))

  function ensureCharts() {
    if (charts) return
    const mounts = Object.fromEntries(Object.entries(cards).map(([k, c]) => [k, c.getMountElement()]))
    charts = spec.createCharts(mounts)
    for (const chart of Object.values(charts)) chart.render()
  }

  function renderAll() {
    if (isAborted() || !state.data) return
    ensureCharts()
    state.model = spec.compute({
      data: state.data,
      office: state.office,
      offices: state.offices,
      monthKey: state.monthKey,
    })
    kpiGrid.children = spec.render(state.model, charts)
  }

  // --- Actions (Summary Report / Excel Report) ---

  const officeLabel = () => state.office || ALL_OFFICES
  const reportInfo = () => [
    ['Report', spec.title],
    ['Month', monthLabel(state.monthKey)],
    [spec.filterLabel, officeLabel()],
    ['Generated', __dayjs().format('YYYY-MM-DD HH:mm')],
  ]
  const fileStem = () => [
    'posthub', spec.reportKey, state.monthKey,
    ...(state.office ? [state.office.replace(/[^a-z0-9]+/gi, '-').toLowerCase()] : []),
  ].join('-')

  function requireModel() {
    if (state.model) return true
    Toast.error('Report data is not loaded yet')
    return false
  }

  async function printSummary() {
    if (!requireModel()) return
    printHeader.children = [
      new Text(`${APP_NAME} Facilities`, { type: 'p', class: 'reports__print-brand' }),
      new Text(spec.title, { type: 'h1', class: 'reports__print-title' }),
      new Text(reportInfo().slice(1).map(([k, v]) => `${k}: ${v}`).join('   |   '), { type: 'p', class: 'reports__print-meta' }),
    ]
    summaryButton.isLoading = true
    try {
      // settle: charts redraw at the print layout width before the dialog opens.
      await printInMode({
        bodyClass: 'posthub--print-report',
        pageCss: '@page { size: A4 landscape; margin: 10mm }',
        title: fileStem(),
        settle: true,
      })
    } catch (err) {
      console.error('[Reports.printSummary] print failed', err)
      Toast.error('Could not open the print dialog')
    } finally {
      summaryButton.isLoading = false
    }
  }

  async function exportExcel() {
    if (!requireModel()) return
    excelButton.isLoading = true
    const loading = Toast.loading('Building Excel report...')
    try {
      await downloadWorkbook(spec.exportSheets(state.model, reportInfo()), `${fileStem()}.xlsx`)
      loading.success('Excel report downloaded')
    } catch (err) {
      console.error('[Reports.exportExcel] export failed', err)
      loading.error('Excel export failed')
    } finally {
      excelButton.isLoading = false
    }
  }

  const summaryButton = new Button('Summary Report', { onClickHandler: printSummary })
  const excelButton = new Button('Excel Report', { onClickHandler: exportExcel, variant: 'secondary', isOutlined: true })

  // --- Data ---

  // Monotonic request id: a slow response for a previously selected month must
  // never overwrite the currently selected one.
  let requestSeq = 0

  async function fetchMonth(monthKey) {
    const seq = ++requestSeq
    const loading = Toast.loading(`Loading ${monthLabel(monthKey)}...`)
    try {
      const data = await spec.load(monthKey)
      if (isAborted() || seq !== requestSeq) {
        loading.dismiss()
        return
      }
      state.data = data
      state.monthKey = monthKey
      subtitle.children = `${spec.subtitle} -- ${monthLabel(monthKey)}`
      loading.dismiss()
    } catch (err) {
      console.error('[Reports.fetchMonth] failed to load report data', { monthKey, err })
      loading.error('Failed to load reports')
      return
    }
    renderAll()
  }

  // --- Filters ---

  function buildFilters() {
    const monthField = new FormField({ value: monthLabel(state.monthKey) })
    const monthCombo = new ComboBox(monthField, months.map(m => m.label), {
      placeholder: 'Select month...',
    })
    monthField.subscribe(() => {
      const label = extractComboBoxValue(monthField.value)
      const month = months.find(m => m.label === label)
      if (month && month.key !== state.monthKey) fetchMonth(month.key)
    })

    const officeField = new FormField({ value: ALL_OFFICES })
    const officeCombo = new ComboBox(officeField, [ALL_OFFICES, ...state.offices], {
      placeholder: `Filter by ${spec.filterLabel.toLowerCase()}...`,
    })
    officeField.subscribe(() => {
      const value = extractComboBoxValue(officeField.value)
      state.office = !value || value === ALL_OFFICES ? null : value
      renderAll()
    })

    const section = (heading, children) => new Container([
      new Text(heading, { type: 'p', class: 'posthub__section-heading' }),
      ...children,
    ], { class: 'reports__filter-section' })
    const field = (label, control) => new Container([
      new Text(label, { type: 'label', class: 'posthub__filter-label' }),
      control,
    ], { class: 'posthub__filter-group' })

    filterSection.children = [
      section('Filters', [
        field('Month', monthCombo),
        field(`${spec.filterLabel} (${spec.filterHint.toLowerCase()})`, officeCombo),
      ]),
      section('Export', [
        new Text('Uses the selected month and filter', { type: 'p', class: 'reports__filter-hint' }),
        new Container([summaryButton, excelButton], { class: 'reports__filter-actions' }),
      ]),
    ]
  }

  async function init() {
    if (isAborted()) return
    pageLoader.enable()
    state.offices = await loadActiveLocationTitles(spec.siteApi)
    if (isAborted()) return
    buildFilters()
    await fetchMonth(state.monthKey)
    if (!isAborted()) pageLoader.disable()
  }

  // Defer to after the route mounts: Loader.enable() is a no-op on an unmounted loader.
  setTimeout(init, 0)

  const bodyArea = new Container([filterSection, contentSection, pageLoader], { class: 'reports__body' })
  const contentArea = new Container([header, bodyArea], { class: 'posthub__page-content' })

  return [createNavbar(), contentArea]
}
