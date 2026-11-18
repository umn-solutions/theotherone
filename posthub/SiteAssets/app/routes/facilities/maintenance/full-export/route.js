import {
  defineRoute,
  Container,
  Text,
  Button,
  CheckBox,
  FieldLabel,
  FormField,
  DateRangeInput,
  Toast,
  SiteApi,
  CurrentUser,
  __dayjs,
} from '../../../../libs/nofbiz/nofbiz.base.js'

import { createNavbar } from '../../../../components/navbar.js'
import { createPageHeader } from '../../../../components/pageHeader.js'
import { guardAccess } from '../../../../utils/access.js'
import { PAGE_DESCRIPTIONS, TOOLTIPS } from '../../../../utils/copy.js'
import { createProgressBar } from '../../../../utils/progress-bar.js'
import { downloadWorkbook } from '../../../../utils/workbook-export.js'
import { fetchAllTaggedItems } from '../../../../utils/mail-context.js'
import { parseFilterDate, formatDisplayDate, formatDisplayDateTime } from '../../../../utils/date-helpers.js'
import {
  createMultiSelectFilter, filterGroup, filterSectionHeader, STATUS_FILTER_OPTIONS,
} from '../../../../utils/package-filters.js'
import { getLocationValue } from '../../../../utils/user-helpers.js'
import {
  LIST_PACKAGES,
  LIST_EXTERNAL_PACKAGES,
  LIST_EXTERNAL_ITEMS,
  LIST_EXTERNAL_LOG,
  LIST_TIMELINE_ENTRIES,
  STATUS_LABELS,
} from '../../../../utils/constants.js'
import { guardUnsaved } from '../../utils/unsavedGuard.js'
import { loadLocationOptions, groupItemsByTitle } from '../../external-mail/utils/external-data.js'
import {
  isLogRow, destinationText,
  internalMailRows, externalMailRows, collectionItemRows, timelineRows,
} from '../../utils/mail-export-rows.js'

export default defineRoute(async (config) => {
  config.setRouteTitle('Full Mail Export')

  // Facilities route: admin access required (same as Maintenance)
  if (!guardAccess('ADMIN')) return []

  const siteApi = new SiteApi()
  const navbar = createNavbar()

  // Share of the bar used by the read phase; filtering + building the file
  // take the rest.
  const READ_PHASE_PCT = 90
  const BUILD_PHASE_PCT = 95
  const DATE_FORMAT_INPUT = 'dd-mm-yyyy'

  // Friendly names for progress messages.
  const LIST_LABELS = {
    [LIST_PACKAGES]: 'internal mail',
    [LIST_EXTERNAL_PACKAGES]: 'external tracked mail',
    [LIST_EXTERNAL_ITEMS]: 'collection items',
    [LIST_EXTERNAL_LOG]: 'external logged mail',
    [LIST_TIMELINE_ENTRIES]: 'mail history',
  }

  // What can be exported. Each source reads one or more lists in full.
  const SOURCES = [
    { key: 'internal', label: 'Internal Mail', lists: [LIST_PACKAGES] },
    { key: 'tracked', label: 'External Tracked Mail', lists: [LIST_EXTERNAL_PACKAGES, LIST_EXTERNAL_ITEMS], tooltip: TOOLTIPS.fullExport.trackedMail },
    { key: 'logged', label: 'External Logged Mail', lists: [LIST_EXTERNAL_LOG], tooltip: TOOLTIPS.fullExport.loggedMail },
    { key: 'timeline', label: 'Mail History', lists: [LIST_TIMELINE_ENTRIES], tooltip: TOOLTIPS.fullExport.mailHistory },
  ]

  const formatCount = (n) => Number(n).toLocaleString('en-GB')
  const formatElapsed = (ms) => {
    const total = Math.floor(ms / 1000)
    const m = Math.floor(total / 60)
    const s = total % 60
    return m > 0 ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`
  }
  // Let the browser paint progress before a long synchronous step.
  const nextPaint = () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)))

  // --- State ---
  const filters = { status: [], currentLocation: [], destination: [] }
  let isExporting = false
  let cancelRequested = false
  let elapsedTimer = null

  guardUnsaved(
    config,
    () => isExporting,
    'An export is still running. Leaving this page cancels it and nothing will be downloaded.',
  )
  config.onCleanup(() => {
    cancelRequested = true
    clearInterval(elapsedTimer)
  })

  // --- What to export (all on by default: this is the full extraction) ---
  const sourceFields = Object.fromEntries(SOURCES.map((s) => [s.key, new FormField({ value: true })]))
  const sourceBoxes = SOURCES.map((s) => new CheckBox(sourceFields[s.key]))
  const sourceList = new Container(
    SOURCES.map((s, i) => new FieldLabel(s.label, sourceBoxes[i], {
      position: 'right',
      ...(s.tooltip ? { tooltip: s.tooltip } : {}),
    })),
    { class: 'full-export__sources posthub__checkbox-option' },
  )

  // --- Filters (all optional; empty = everything) ---
  const dateFromField = new FormField({ value: '' })
  const dateToField = new FormField({ value: '' })
  // No maxDays rule: unlike the search pages, this export has no range limit.
  const dateRangeInput = new DateRangeInput(dateFromField, dateToField, {
    format: DATE_FORMAT_INPUT,
    placeholder: 'All time',
  })

  const locationOptions = await loadLocationOptions(siteApi)

  const statusFilter = createMultiSelectFilter({
    label: 'Status',
    options: STATUS_FILTER_OPTIONS,
    placeholder: 'All statuses',
    allowFiltering: false,
    onChange: (values) => { filters.status = values },
  })
  const currentLocationFilter = createMultiSelectFilter({
    label: 'Current Location',
    options: locationOptions,
    placeholder: 'All offices',
    onChange: (values) => { filters.currentLocation = values },
  })
  const destinationFilter = createMultiSelectFilter({
    label: 'Destination',
    options: locationOptions,
    placeholder: 'All destinations',
    onChange: (values) => { filters.destination = values },
  })

  const filterRow = new Container([
    filterGroup('Registration Period', dateRangeInput, { tooltip: TOOLTIPS.fullExport.registrationPeriod }),
    statusFilter.group,
    currentLocationFilter.group,
    destinationFilter.group,
  ], { class: 'full-export__filters' })

  function clearFilters() {
    dateFromField.value = ''
    dateToField.value = ''
    dateRangeInput.render() // no auto-rerender on programmatic change
    filters.status = []
    filters.currentLocation = []
    filters.destination = []
    statusFilter.comboBox.clearSelection()
    currentLocationFilter.comboBox.clearSelection()
    destinationFilter.comboBox.clearSelection()
    for (const s of SOURCES) sourceFields[s.key].value = true
    sourceBoxes.forEach((box) => box.render()) // FormControl: reflect programmatic value
  }

  const clearButton = new Button('Reset Options', {
    variant: 'secondary',
    onClickHandler: clearFilters,
  })
  const exportButton = new Button('Export to Excel', {
    onClickHandler: () => runExport(),
    title: TOOLTIPS.fullExport.exportToExcel,
  })
  const cancelButton = new Button('Cancel Export', {
    title: TOOLTIPS.fullExport.cancelExport,
    variant: 'secondary',
    onClickHandler: () => {
      cancelRequested = true
      cancelButton.isDisabled = true
      progressStatus.children = 'Cancelling after the current request finishes...'
    },
  })

  // --- Progress panel (shown once an export starts) ---
  const progress = createProgressBar('Export progress')
  const progressStatus = new Text('', { type: 'p', class: 'full-export__progress-status' })
  const progressDetail = new Text('', { type: 'p', class: 'posthub__filter-hint' })
  const cancelSlot = new Container([], { class: 'posthub__button-row' })
  const progressPanel = new Container([
    progressStatus,
    progress.bar,
    progressDetail,
    cancelSlot,
  ], { class: 'full-export__panel full-export__progress', as: 'section' })
  const progressSlot = new Container([], { class: 'full-export__progress-slot' })

  // --- Export pipeline ---

  /** ItemCount per list for a determinate bar. Empty map if unavailable. */
  async function loadItemCounts() {
    try {
      const lists = await siteApi.getLists()
      return new Map(lists.map((l) => [l.Title, Number(l.ItemCount)]))
    } catch (err) {
      console.warn('[full-export] list item counts unavailable; progress advances per list', err)
      return new Map()
    }
  }

  function snapshotCriteria() {
    const from = parseFilterDate(dateFromField.value)
    const to = parseFilterDate(dateToField.value)
    const selected = new Set(SOURCES.filter((s) => sourceFields[s.key].value).map((s) => s.key))
    // Timeline rows belong to internal / tracked mail only; skip reading the
    // (largest) list when neither is selected.
    if (!selected.has('internal') && !selected.has('tracked')) selected.delete('timeline')
    return {
      from,
      to,
      status: filters.status.slice(),
      currentLocation: filters.currentLocation.slice(),
      destination: filters.destination.slice(),
      selected,
    }
  }

  /**
   * Client-side match. The lists are read whole (in threshold-safe ID windows,
   * see utils/list-read.js) and filtered here: locations are stored as JSON,
   * log-row destinations are derived and the date falls back to SubmissionDate,
   * none of which a CAML Where can express.
   */
  function matches(pkg, c) {
    if (c.from || c.to) {
      const raw = pkg.Created || pkg.SubmissionDate
      if (!raw) return false
      const day = __dayjs(raw)
      if (c.from && day.isBefore(c.from, 'day')) return false
      if (c.to && day.isAfter(c.to, 'day')) return false
    }
    if (c.status.length > 0 && !c.status.includes(pkg.Status)) return false
    if (c.currentLocation.length > 0
      && (isLogRow(pkg) || !c.currentLocation.includes(getLocationValue(pkg.CurrentLocation)))) return false
    if (c.destination.length > 0 && !c.destination.includes(destinationText(pkg))) return false
    return true
  }

  const describeValues = (values, labels) => (values.length
    ? values.map((v) => labels?.[v] || v).join(', ')
    : 'All')

  function buildInfoRows(c, counts, startedAt) {
    let generatedBy = ''
    try {
      const user = new CurrentUser()
      generatedBy = user.get('displayName') || user.get('email') || ''
    } catch (err) {
      console.warn('[full-export] current user unavailable for export info', err)
    }
    const period = c.from || c.to
      ? `${c.from ? formatDisplayDate(c.from) : 'Start'} to ${c.to ? formatDisplayDate(c.to) : 'today'}`
      : 'All time'
    return [
      { Field: 'Generated On', Value: formatDisplayDateTime(startedAt) },
      { Field: 'Generated By', Value: generatedBy },
      { Field: 'Registration Period', Value: period },
      { Field: 'Status', Value: describeValues(c.status, STATUS_LABELS) },
      { Field: 'Current Location', Value: describeValues(c.currentLocation) },
      { Field: 'Destination', Value: describeValues(c.destination) },
      { Field: 'Included', Value: SOURCES.filter((s) => c.selected.has(s.key)).map((s) => s.label).join('; ') },
      ...counts.map(([sheet, n]) => ({ Field: `${sheet} rows`, Value: n })),
    ]
  }

  function setRunning(running) {
    isExporting = running
    exportButton.isLoading = running
    clearButton.isDisabled = running
    cancelButton.isDisabled = false
    cancelSlot.children = running ? [cancelButton] : []
  }

  function startElapsedTimer(startedAt) {
    clearInterval(elapsedTimer)
    const tick = () => {
      progressDetail.children = `Elapsed ${formatElapsed(Date.now() - startedAt)}. Keep this page open.`
    }
    tick()
    elapsedTimer = setInterval(tick, 1000)
  }

  async function runExport() {
    if (isExporting) return
    const c = snapshotCriteria()
    const hasMail = c.selected.has('internal') || c.selected.has('tracked') || c.selected.has('logged')
    if (!hasMail) {
      Toast.warning('Select at least one type of mail to export')
      return
    }

    cancelRequested = false
    setRunning(true)
    const startedAt = Date.now()
    progressSlot.children = [progressPanel]
    progress.set(0)
    progressStatus.children = 'Preparing export...'
    startElapsedTimer(startedAt)

    try {
      // Lists to read, in order. Timeline last: it is the largest.
      const lists = SOURCES.filter((s) => c.selected.has(s.key)).flatMap((s) => s.lists)
      const itemCounts = await loadItemCounts()
      const knownTotal = lists.every((l) => Number.isFinite(itemCounts.get(l)))
        ? lists.reduce((sum, l) => sum + itemCounts.get(l), 0)
        : null

      const data = {}
      let readSoFar = 0
      for (const [index, listName] of lists.entries()) {
        if (cancelRequested) break
        const expected = itemCounts.get(listName)
        let readFromList = 0
        const report = () => {
          const ofList = Number.isFinite(expected) ? ` of ${formatCount(expected)}` : ''
          progressStatus.children = `Reading ${LIST_LABELS[listName]}: ${formatCount(readFromList)}${ofList} records (step ${index + 1} of ${lists.length})`
          const fraction = knownTotal
            ? (knownTotal > 0 ? readSoFar / knownTotal : 1)
            : index / lists.length
          progress.set(Math.min(fraction, 1) * READ_PHASE_PCT)
        }
        report()
        data[listName] = await fetchAllTaggedItems(siteApi, listName, {
          onBatch: (n) => { readFromList += n; readSoFar += n; report() },
          shouldStop: () => cancelRequested,
        })
      }

      if (cancelRequested) {
        progressStatus.children = 'Export cancelled. Nothing was downloaded.'
        Toast.info('Export cancelled')
        return
      }

      progressStatus.children = 'Applying filters...'
      progress.set(READ_PHASE_PCT)
      await nextPaint()

      const internal = (data[LIST_PACKAGES] || []).filter((p) => matches(p, c))
      const tracked = (data[LIST_EXTERNAL_PACKAGES] || []).filter((p) => matches(p, c))
      const logged = (data[LIST_EXTERNAL_LOG] || []).filter((p) => matches(p, c))
      const groupedItems = groupItemsByTitle(data[LIST_EXTERNAL_ITEMS] || [])

      const sheets = []
      if (c.selected.has('internal')) sheets.push({ name: 'Internal Mail', rows: internalMailRows(internal) })
      if (c.selected.has('tracked') || c.selected.has('logged')) {
        sheets.push({ name: 'External Mail', rows: externalMailRows([...tracked, ...logged], groupedItems) })
      }
      if (c.selected.has('tracked')) sheets.push({ name: 'Collection Items', rows: collectionItemRows(tracked, groupedItems) })
      if (c.selected.has('timeline')) {
        // Timeline only for the exported tracked mail (logged mail has none).
        const mailTypeByTitle = new Map([
          ...internal.map((p) => [String(p.Title), 'Internal']),
          ...tracked.map((p) => [String(p.Title), 'External']),
        ])
        const entries = (data[LIST_TIMELINE_ENTRIES] || [])
          .filter((e) => mailTypeByTitle.has(String(e.Title ?? '')))
          .sort((a, b) => String(a.Title).localeCompare(String(b.Title))
            || String(a.Created ?? '').localeCompare(String(b.Created ?? '')))
        sheets.push({ name: 'Mail History', rows: timelineRows(entries, mailTypeByTitle) })
      }

      const mailCount = internal.length + tracked.length + logged.length
      if (mailCount === 0) {
        progress.set(100)
        progressStatus.children = 'No mail matches these filters. Nothing was downloaded.'
        Toast.warning('No mail matches these filters')
        return
      }

      const rowCount = sheets.reduce((sum, s) => sum + s.rows.length, 0)
      sheets.push({
        name: 'Export Info',
        rows: buildInfoRows(c, sheets.map((s) => [s.name, s.rows.length]), startedAt),
      })

      progressStatus.children = `Building the Excel file (${formatCount(rowCount)} rows). The page may pause briefly...`
      progress.set(BUILD_PHASE_PCT)
      await nextPaint()

      await downloadWorkbook(sheets, `posthub-full-export-${__dayjs().format('YYYYMMDD-HHmmss')}.xlsx`)

      progress.set(100)
      progressStatus.children = `Export complete: ${formatCount(mailCount)} mail records (${formatCount(rowCount)} rows) in ${formatElapsed(Date.now() - startedAt)}. Check your downloads.`
      Toast.success('Full export downloaded')
    } catch (err) {
      console.error('[full-export] export failed', err)
      progressStatus.children = 'Export failed. Nothing was downloaded. Try again. If it keeps failing, untick Mail History, the largest list.'
      Toast.error('Export failed. Try again.')
    } finally {
      clearInterval(elapsedTimer)
      setRunning(false)
    }
  }

  // --- Layout ---
  const { header } = createPageHeader({
    title: 'Full Mail Export',
    subtitle: PAGE_DESCRIPTIONS.fullExport,
    backPath: 'facilities/maintenance',
  })

  const notice = new Container([
    new Text('Large exports can take several minutes', { type: 'p', class: 'posthub__notice-title' }),
    new Text(
      'PostHub reads every record in the selected lists before applying your filters, so this can take several minutes. '
      + 'Keep this page open until the download starts. Leaving, refreshing or closing the page cancels the export.',
      { type: 'p', class: 'posthub__notice-text' },
    ),
  ], { class: 'posthub__notice posthub__notice--warning', as: 'section' })

  const formPanel = new Container([
    filterSectionHeader('What to Export', 'Each type of mail goes to its own sheet in the Excel file.'),
    sourceList,
    filterSectionHeader(
      'Filters',
      'Optional. Empty filters include everything. The Status and Current Location filters exclude logged mail, which has neither.',
      'posthub__section-heading--separator',
    ),
    filterRow,
    new Container([clearButton, exportButton], { class: 'posthub__button-row full-export__actions' }),
  ], { class: 'full-export__panel', as: 'section' })

  const body = new Container([notice, formPanel, progressSlot], { class: 'full-export__body' })
  const contentArea = new Container([header, body], { class: 'posthub__page-content' })

  return [navbar, contentArea]
})
