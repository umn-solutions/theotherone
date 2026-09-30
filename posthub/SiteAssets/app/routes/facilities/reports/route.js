import {
  defineRoute,
  Container,
  Text,
  LinkButton,
  Button,
  ComboBox,
  getIcon,
  Toast,
  SiteApi,
  Loader,
  FormField,
  DateRangeInput,
  __dayjs,
} from '../../../libs/nofbiz/nofbiz.base.js'

import { createNavbar } from '../../../components/navbar.js'
import { createKpiCard } from '../../../components/kpiCard.js'
import { createChartCard } from '../../../components/chartCard.js'
import { createDataTable } from '../../../components/dataTable.js'

import { createDonutChart } from '../../../components/charts/donutChart.js'
import { createGroupedBarChart } from '../../../components/charts/groupedBarChart.js'
import { createHorizontalBarChart } from '../../../components/charts/horizontalBarChart.js'
import { createFlowMatrix } from '../../../components/charts/flowMatrix.js'
import { createLineChart } from '../../../components/charts/lineChart.js'

import {
  LIST_PACKAGES,
  LIST_LOCATIONS,
  LIST_TIMELINE_ENTRIES,
  PACKAGE_STATUSES,
  STATUS_LABELS,
  BUILDING_PALETTE,
} from '../../../utils/constants.js'
import { getLocationValue } from '../../../utils/user-helpers.js'
import { parseFilterDate, toISOStart, toISOEnd, defaultDateFrom, defaultDateTo } from '../../../utils/date-helpers.js'

export default defineRoute((config) => {
  config.setRouteTitle('Reports')

  const siteApi = new SiteApi()
  const ALL_BUILDINGS = 'All buildings'

  // Status palette (matches --posthub-status-* in variables.css; SVG fill
  // attribute does not resolve CSS vars reliably so values are inlined here).
  const STATUS_COLORS = {
    'pending':    '#939fa6',
    'in transit': '#f1875a',
    'arrived':    '#009fb1',
    'delivered':  '#0f7164',
  }
  // Series colors for the per-building grouped bar (all from the token palette).
  const COLOR_BRAND    = '#00965d'
  const COLOR_OUTGOING = '#f1875a'
  const COLOR_INCOMING = '#009fb1'

  const shortLabel = (building) => {
    if (typeof building !== 'string') return String(building ?? '')
    const parts = building.split('|')
    return parts.length > 1 ? parts[parts.length - 1].trim() : building.trim()
  }
  const colorFor = (index) => BUILDING_PALETTE[index % BUILDING_PALETTE.length]

  // --- Date CAML helpers ---

  function buildDateCaml(from, to, fieldName, includeEmpty) {
    const fromISO = toISOStart(from)
    const toISO_ = toISOEnd(to)
    if (!fromISO && !toISO_) return undefined

    const fromClause = fromISO
      ? `<Geq><FieldRef Name='${fieldName}'/><Value Type='Text'>${fromISO}</Value></Geq>`
      : ''
    const toClause = toISO_
      ? `<Leq><FieldRef Name='${fieldName}'/><Value Type='Text'>${toISO_}</Value></Leq>`
      : ''

    const rangeClause = fromClause && toClause
      ? `<And>${fromClause}${toClause}</And>`
      : fromClause || toClause

    let where = rangeClause
    if (includeEmpty) {
      const emptyClause = `<Eq><FieldRef Name='${fieldName}'/><Value Type='Text'></Value></Eq>`
      where = `<Or>${rangeClause}${emptyClause}</Or>`
    }

    return `<View><Query><Where>${where}</Where></Query></View>`
  }

  // Previous equal-length window immediately preceding [from, to].
  function previousWindow(from, to) {
    const start = parseFilterDate(from)
    const end = parseFilterDate(to)
    if (!start || !end) return { from: null, to: null }
    const lenDays = end.diff(start, 'day') + 1
    const prevEnd = start.subtract(1, 'day')
    const prevStart = prevEnd.subtract(lenDays - 1, 'day')
    return { from: prevStart.format('DD-MM-YYYY'), to: prevEnd.format('DD-MM-YYYY') }
  }

  // --- Stat helpers ---

  function statusCounts(packages) {
    const counts = Object.fromEntries(PACKAGE_STATUSES.map(s => [s, 0]))
    for (const pkg of packages) {
      if (pkg.Status in counts) counts[pkg.Status]++
    }
    return counts
  }

  function formatDuration(ms) {
    if (!isFinite(ms) || ms <= 0) return '--'
    const totalMin = Math.round(ms / 60000)
    const days = Math.floor(totalMin / (60 * 24))
    const hours = Math.floor((totalMin % (60 * 24)) / 60)
    const mins = totalMin % 60
    if (days > 0) return `${days}d ${hours}h`
    if (hours > 0) return `${hours}h ${mins}m`
    return `${mins}m`
  }

  const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : NaN)

  // Map of package title -> origin location, derived from the earliest timeline
  // entry; falls back to current location for packages without timeline.
  function buildOriginIndex(timeline) {
    const earliest = new Map()
    for (const entry of timeline) {
      const ts = __dayjs(entry.Created)
      if (!ts.isValid()) continue
      const cur = earliest.get(entry.Title)
      if (!cur || ts.isBefore(cur.ts)) {
        earliest.set(entry.Title, { ts, location: entry.Location })
      }
    }
    return earliest
  }

  function getOrigin(pkg, originIndex) {
    const fromTimeline = originIndex.get(pkg.Title)
    if (fromTimeline?.location) return getLocationValue(fromTimeline.location)
    return getLocationValue(pkg.CurrentLocation)
  }

  // Per-package delivery duration: earliest "in transit" -> earliest "delivered".
  // Returns Map<title, ms>.
  function packageDeliveryMs(timeline) {
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

  // Top-line metrics for a period.
  function computeKpis(packages, timeline) {
    const total = packages.length
    const sent = packages.filter(p => p.Status !== 'pending').length
    const received = packages.filter(p => p.Status === 'arrived' || p.Status === 'delivered').length
    const delivered = packages.filter(p => p.Status === 'delivered').length
    const pctDelivered = total > 0 ? (delivered / total) * 100 : 0
    const avgMs = avg([...packageDeliveryMs(timeline).values()])
    return { total, sent, received, delivered, pctDelivered, avgMs }
  }

  // Per-building sent (by origin), received (by destination), delivered, total.
  function buildingStats(packages, timeline, buildings) {
    const originIndex = buildOriginIndex(timeline)
    const stat = Object.fromEntries(buildings.map(b => [b, { sent: 0, received: 0, delivered: 0, total: 0 }]))
    for (const pkg of packages) {
      const origin = getOrigin(pkg, originIndex)
      const dest = getLocationValue(pkg.DestinationLocation)
      if (origin in stat) stat[origin].sent++
      if (dest in stat) {
        stat[dest].received++
        if (pkg.Status === 'delivered') stat[dest].delivered++
      }
    }
    for (const b of buildings) stat[b].total = stat[b].sent + stat[b].received
    return { stat, originIndex }
  }

  // origin x destination counts, aligned to `buildings` order.
  function flowMatrixData(packages, buildings, originIndex) {
    const idx = Object.fromEntries(buildings.map((b, i) => [b, i]))
    const m = buildings.map(() => buildings.map(() => 0))
    for (const pkg of packages) {
      const origin = getOrigin(pkg, originIndex)
      const dest = getLocationValue(pkg.DestinationLocation)
      if (origin in idx && dest in idx) m[idx[origin]][idx[dest]]++
    }
    return m
  }

  // Daily volume per building (counted at origin) as line-chart series.
  function dailyByBuilding(packages, buildings, from, to, originIndex) {
    const start = parseFilterDate(from)
    const end = parseFilterDate(to)
    if (!start || !end) return []

    const dates = []
    const idxByKey = new Map()
    let cursor = start.startOf('day')
    while (!cursor.isAfter(end, 'day')) {
      idxByKey.set(cursor.format('YYYY-MM-DD'), dates.length)
      dates.push(cursor.toDate())
      cursor = cursor.add(1, 'day')
    }
    const counts = Object.fromEntries(buildings.map(b => [b, new Array(dates.length).fill(0)]))
    for (const pkg of packages) {
      const ts = pkg.Created || pkg.LastModifiedDate
      if (!ts) continue
      const di = idxByKey.get(__dayjs(ts).format('YYYY-MM-DD'))
      if (di === undefined) continue
      const origin = getOrigin(pkg, originIndex)
      if (origin in counts) counts[origin][di]++
    }
    return buildings.map((b, i) => ({
      name: shortLabel(b),
      color: colorFor(i),
      points: dates.map((d, di) => ({ x: d, y: counts[b][di], label: __dayjs(d).format('DD MMM YYYY') })),
    }))
  }

  // Average delivery time per destination building. Returns rows for the
  // horizontal bar (sorted desc) plus a raw-building -> ms lookup.
  function avgTimeByBuilding(packages, timeline, buildings) {
    const dMap = packageDeliveryMs(timeline)
    const acc = Object.fromEntries(buildings.map(b => [b, []]))
    for (const pkg of packages) {
      const ms = dMap.get(pkg.Title)
      if (ms == null) continue
      const dest = getLocationValue(pkg.DestinationLocation)
      if (dest in acc) acc[dest].push(ms)
    }
    const byBuilding = {}
    const rows = buildings.map((b, i) => {
      const v = acc[b].length ? avg(acc[b]) : 0
      byBuilding[b] = v
      return { label: shortLabel(b), raw: b, color: colorFor(i), value: v }
    }).sort((a, b) => b.value - a.value)
    return { rows, byBuilding }
  }

  // --- Delta chips (vs previous period) ---

  const fmtPct = (p) => `${p > 0 ? '+' : ''}${p.toFixed(1)}%`

  function deltaRel(cur, prev, goodDir = 'up') {
    if (prev == null || prev === 0) return null
    const p = ((cur - prev) / prev) * 100
    if (!isFinite(p)) return null
    const tone = p === 0 ? 'neutral' : ((p > 0) === (goodDir === 'up') ? 'positive' : 'negative')
    return { text: fmtPct(p), tone, title: 'vs previous period' }
  }

  function deltaPp(cur, prev) {
    if (prev == null) return null
    const d = cur - prev
    const tone = d === 0 ? 'neutral' : (d > 0 ? 'positive' : 'negative')
    return { text: `${d > 0 ? '+' : ''}${d.toFixed(1)} pp`, tone, title: 'vs previous period' }
  }

  // Lower delivery time is better -> invert tone.
  function deltaTime(curMs, prevMs) {
    if (!isFinite(prevMs) || prevMs <= 0 || !isFinite(curMs)) return null
    const p = ((curMs - prevMs) / prevMs) * 100
    const tone = p === 0 ? 'neutral' : (p < 0 ? 'positive' : 'negative')
    return { text: fmtPct(p), tone, title: 'vs previous period' }
  }

  // --- State ---

  let curPackages = []
  let curTimeline = []
  let prevPackages = []
  let prevTimeline = []
  let filteredPackages = []
  let filteredTimeline = []
  let prevFilteredPackages = []
  let prevFilteredTimeline = []
  let activeLocationTitles = []

  const filters = {
    dateFrom: defaultDateFrom(),
    dateTo: defaultDateTo(),
    building: ALL_BUILDINGS,
  }

  function filterByBuilding(packages, timeline, building) {
    if (!building || building === ALL_BUILDINGS) return { packages, timeline }
    const originIndex = buildOriginIndex(timeline)
    const keep = new Set()
    const kept = packages.filter(pkg => {
      const origin = getOrigin(pkg, originIndex)
      const dest = getLocationValue(pkg.DestinationLocation)
      const match = origin === building || dest === building
      if (match) keep.add(pkg.Title)
      return match
    })
    return { packages: kept, timeline: timeline.filter(e => keep.has(e.Title)) }
  }

  // --- Layout primitives ---

  const navbar = createNavbar()

  const pageHeader = new Container([
    new Container([
      new LinkButton(getIcon('arrow-go-back-line'), 'facilities', { class: 'posthub__home-icon' }),
      new Text('Reports', { type: 'h1', class: 'posthub__page-title' }),
    ], { class: 'posthub__title-with-icon' }),
    new Text('Internal mail volumes and flow between buildings', {
      type: 'p',
      class: 'posthub__page-subtitle',
    }),
  ], { class: 'posthub__page-header' })

  const filterSection = new Container([], { class: 'posthub__filter-sidebar' })

  const kpiGrid = new Container([], { class: 'reports__kpi-grid' })

  // Row 1 — volume overview
  const cardVolumeByBuilding = createChartCard({ title: 'Volume by building', subtitle: 'Sent, received and total per building' })
  const cardVolumeDonut      = createChartCard({ title: 'Volume distribution', subtitle: 'Share of total volume by origin' })
  const cardFlowMatrix       = createChartCard({ title: 'Mail flow between buildings', subtitle: 'Origin (rows) to destination (columns)', class: 'reports__card--scroll' })

  const overviewRow = new Container([
    cardVolumeByBuilding.card,
    cardVolumeDonut.card,
    cardFlowMatrix.card,
  ], { class: 'reports__overview' })

  // Row 2 — trends
  const cardDaily   = createChartCard({ title: 'Daily volume by building', subtitle: 'Mail registered per day' })
  const cardAvgTime = createChartCard({ title: 'Avg delivery time by building', subtitle: 'In transit to delivered, per destination' })

  const trendsRow = new Container([
    cardDaily.card,
    cardAvgTime.card,
  ], { class: 'reports__detail-2col' })

  // Row 3 — summary
  const cardIndicators = createChartCard({ title: 'Indicators by building', subtitle: 'Volume and delivery summary', class: 'reports__card--scroll' })
  const cardStatusDonut = createChartCard({ title: 'Status of flow', subtitle: 'Distribution across statuses' })

  const summaryRow = new Container([
    cardIndicators.card,
    cardStatusDonut.card,
  ], { class: 'reports__summary' })

  const contentSection = new Container([
    kpiGrid,
    overviewRow,
    trendsRow,
    summaryRow,
  ], { class: 'reports__content' })

  const pageLoader = new Loader(new Text('Loading...'), { animation: 'pulse' })

  // --- Chart instances (lazy: created after DOM mounts on first render) ---

  let groupedBarInstance = null
  let volumeDonutInstance = null
  let flowMatrixInstance = null
  let lineInstance = null
  let horizontalBarInstance = null
  let indicatorTableInstance = null
  let statusDonutInstance = null

  function ensureCharts() {
    if (!groupedBarInstance) {
      groupedBarInstance = createGroupedBarChart({
        container: cardVolumeByBuilding.getMountElement(),
        data: { categories: [], series: [] },
        options: { labelFormatter: shortLabel },
      })
      groupedBarInstance.render()
    }
    if (!volumeDonutInstance) {
      volumeDonutInstance = createDonutChart({ container: cardVolumeDonut.getMountElement(), data: [] })
      volumeDonutInstance.render()
    }
    if (!flowMatrixInstance) {
      flowMatrixInstance = createFlowMatrix({ container: cardFlowMatrix.getMountElement(), labelFormatter: shortLabel })
      flowMatrixInstance.render()
    }
    if (!lineInstance) {
      lineInstance = createLineChart({ container: cardDaily.getMountElement(), data: { series: [] } })
      lineInstance.render()
    }
    if (!horizontalBarInstance) {
      horizontalBarInstance = createHorizontalBarChart({
        container: cardAvgTime.getMountElement(),
        data: [],
        options: { valueFormatter: formatDuration },
      })
      horizontalBarInstance.render()
    }
    if (!indicatorTableInstance) {
      indicatorTableInstance = createDataTable({ container: cardIndicators.getMountElement() })
      indicatorTableInstance.render()
    }
    if (!statusDonutInstance) {
      statusDonutInstance = createDonutChart({ container: cardStatusDonut.getMountElement(), data: [] })
      statusDonutInstance.render()
    }
  }

  function applyFilters() {
    const cur = filterByBuilding(curPackages, curTimeline, filters.building)
    filteredPackages = cur.packages
    filteredTimeline = cur.timeline
    const prev = filterByBuilding(prevPackages, prevTimeline, filters.building)
    prevFilteredPackages = prev.packages
    prevFilteredTimeline = prev.timeline
    renderStats()
  }

  function renderStats() {
    ensureCharts()
    const buildings = activeLocationTitles

    // KPIs with period-over-period deltas
    const cur = computeKpis(filteredPackages, filteredTimeline)
    const prev = computeKpis(prevFilteredPackages, prevFilteredTimeline)

    kpiGrid.children = [
      createKpiCard({ label: 'Total Mail', value: cur.total, icon: getIcon('mail-unread-line'), delta: deltaRel(cur.total, prev.total, 'up') }),
      createKpiCard({ label: 'Sent', value: cur.sent, icon: getIcon('send-plane-line'), delta: deltaRel(cur.sent, prev.sent, 'up') }),
      createKpiCard({ label: 'Received', value: cur.received, icon: getIcon('inbox-line'), delta: deltaRel(cur.received, prev.received, 'up') }),
      createKpiCard({ label: '% Delivered', value: `${Math.round(cur.pctDelivered)}%`, icon: getIcon('check-double-line'), modifier: 'delivered', delta: deltaPp(cur.pctDelivered, prev.pctDelivered) }),
      createKpiCard({ label: 'Avg Delivery Time', value: formatDuration(cur.avgMs), icon: getIcon('route-line'), sublabel: 'in transit to delivered', delta: deltaTime(cur.avgMs, prev.avgMs) }),
    ]

    // Per-building aggregates
    const { stat, originIndex } = buildingStats(filteredPackages, filteredTimeline, buildings)
    const { rows: avgRows, byBuilding: avgByBuilding } = avgTimeByBuilding(filteredPackages, filteredTimeline, buildings)

    // Grouped bar: sent / received / total per building
    groupedBarInstance.update({
      categories: buildings,
      series: [
        { name: 'Sent', color: COLOR_OUTGOING, values: buildings.map(b => stat[b].sent) },
        { name: 'Received', color: COLOR_INCOMING, values: buildings.map(b => stat[b].received) },
        { name: 'Total', color: COLOR_BRAND, values: buildings.map(b => stat[b].total) },
      ],
    })

    // Volume distribution donut (by origin)
    const totalSent = buildings.reduce((s, b) => s + stat[b].sent, 0)
    volumeDonutInstance.update(
      buildings.map((b, i) => ({ label: shortLabel(b), value: stat[b].sent, color: colorFor(i) })),
      { centerLabel: String(totalSent), centerSublabel: 'total sent' },
    )

    // Flow matrix
    flowMatrixInstance.update({ buildings, matrix: flowMatrixData(filteredPackages, buildings, originIndex) })

    // Daily volume per building
    lineInstance.update({ series: dailyByBuilding(filteredPackages, buildings, filters.dateFrom, filters.dateTo, originIndex) })

    // Avg delivery time per building
    horizontalBarInstance.update(avgRows)

    // Indicators table
    const columns = [
      { key: 'building', label: 'Building', align: 'left', isHeader: true },
      { key: 'sent', label: 'Sent', align: 'right' },
      { key: 'received', label: 'Received', align: 'right' },
      { key: 'total', label: 'Total', align: 'right' },
      { key: 'pctDelivered', label: '% Delivered', align: 'right', format: v => `${Math.round(v)}%` },
      { key: 'avg', label: 'Avg Time', align: 'right', format: v => formatDuration(v) },
    ]
    const tableRows = buildings.map(b => ({
      building: shortLabel(b),
      sent: stat[b].sent,
      received: stat[b].received,
      total: stat[b].total,
      pctDelivered: stat[b].received > 0 ? (stat[b].delivered / stat[b].received) * 100 : 0,
      avg: avgByBuilding[b] || 0,
    }))
    const sumSent = buildings.reduce((s, b) => s + stat[b].sent, 0)
    const sumReceived = buildings.reduce((s, b) => s + stat[b].received, 0)
    const sumDelivered = buildings.reduce((s, b) => s + stat[b].delivered, 0)
    indicatorTableInstance.update({
      columns,
      rows: tableRows,
      footer: {
        building: 'Total',
        sent: sumSent,
        received: sumReceived,
        total: sumSent + sumReceived,
        pctDelivered: sumReceived > 0 ? (sumDelivered / sumReceived) * 100 : 0,
        avg: cur.avgMs,
      },
    })

    // Status flow donut
    const counts = statusCounts(filteredPackages)
    statusDonutInstance.update(
      PACKAGE_STATUSES.map(s => ({ label: STATUS_LABELS[s], value: counts[s], color: STATUS_COLORS[s] })),
      { centerLabel: `${Math.round(cur.pctDelivered)}%`, centerSublabel: 'delivered' },
    )
  }

  async function fetchData(from, to) {
    const packagesCaml = buildDateCaml(from, to, 'LastModifiedDate', true)
    const timelineCaml = buildDateCaml(from, to, 'Created', false)

    const prev = previousWindow(from, to)
    const prevPackagesCaml = prev.from ? buildDateCaml(prev.from, prev.to, 'LastModifiedDate', true) : undefined
    const prevTimelineCaml = prev.from ? buildDateCaml(prev.from, prev.to, 'Created', false) : undefined

    const loading = Toast.loading('Loading reports...')
    try {
      const [packages, timeline, prevPkgs, prevTl] = await Promise.all([
        siteApi.list(LIST_PACKAGES).getItems(packagesCaml),
        siteApi.list(LIST_TIMELINE_ENTRIES).getItems(timelineCaml),
        prevPackagesCaml ? siteApi.list(LIST_PACKAGES).getItems(prevPackagesCaml) : Promise.resolve([]),
        prevTimelineCaml ? siteApi.list(LIST_TIMELINE_ENTRIES).getItems(prevTimelineCaml) : Promise.resolve([]),
      ])
      curPackages = packages
      curTimeline = timeline
      prevPackages = prevPkgs
      prevTimeline = prevTl
      loading.dismiss()
    } catch (err) {
      console.error('[Reports.fetchData] failed to load report data', { from, to, err })
      loading.error('Failed to load reports')
    }
    applyFilters()
  }

  const bodyArea = new Container([
    filterSection,
    contentSection,
    pageLoader,
  ], { class: 'reports__body' })

  const contentArea = new Container([pageHeader, bodyArea], { class: 'posthub__page-content' })

  loadData()

  async function loadData() {
    pageLoader.enable()
    let activeLocations = []
    try {
      activeLocations = await siteApi.list(LIST_LOCATIONS).getItems({ IsActive: 'true' })
    } catch (err) {
      console.error('[Reports.loadData] failed to load locations', err)
      Toast.error('Failed to load locations')
    }
    activeLocationTitles = activeLocations.map(l => l.Title)

    // Date range drives fetch (server-side CAML).
    const startField = new FormField({ value: filters.dateFrom })
    const endField = new FormField({ value: filters.dateTo })
    const dateRangeInput = new DateRangeInput(startField, endField, {
      format: 'dd-mm-yyyy',
      placeholder: 'Select date range',
      rules: { maxDays: 31 },
    })

    let dateDebounceTimer = null
    const scheduleFetch = () => {
      if (!startField.value || !endField.value) return
      clearTimeout(dateDebounceTimer)
      dateDebounceTimer = setTimeout(() => {
        filters.dateFrom = startField.value
        filters.dateTo = endField.value
        fetchData(filters.dateFrom, filters.dateTo)
      }, 300)
    }
    startField.subscribe(scheduleFetch)
    endField.subscribe(scheduleFetch)

    // Building filter (origin or destination) — client-side, no refetch.
    const buildingField = new FormField({ value: ALL_BUILDINGS })
    const buildingCombo = new ComboBox(buildingField, [ALL_BUILDINGS, ...activeLocationTitles], {
      placeholder: 'Filter by building...',
    })
    buildingField.subscribe(() => {
      const raw = buildingField.value
      filters.building = typeof raw === 'string' ? raw : (raw?.value ?? ALL_BUILDINGS)
      applyFilters()
    })

    const filterGrid = new Container([
      new Text('Date Range', { type: 'p', class: 'posthub__section-heading' }),
      new Container([
        new Text('Period', { type: 'label', class: 'posthub__filter-label' }),
        dateRangeInput,
      ], { class: 'posthub__filter-group' }),
      new Text('Building', { type: 'p', class: 'posthub__section-heading' }),
      new Container([
        new Text('Origin or destination', { type: 'label', class: 'posthub__filter-label' }),
        buildingCombo,
      ], { class: 'posthub__filter-group' }),
      new Text('Export', { type: 'p', class: 'posthub__section-heading' }),
      new Container([
        new Button('Summary Report', { onClickHandler: () => {}, isDisabled: true }),
        new Button('Excel Report', { onClickHandler: () => {}, isDisabled: true }),
      ], { class: 'posthub__filter-group' }),
    ], { class: 'posthub__filter-grid' })

    filterSection.children = [filterGrid]

    await fetchData(filters.dateFrom, filters.dateTo)
    pageLoader.disable()
  }

  return [navbar, contentArea]
})
