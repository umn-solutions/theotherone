import {
  Container,
  Text,
  Button,
  LinkButton,
  ComboBox,
  CheckBox,
  FieldLabel,
  FormField,
  getIcon,
  Toast,
  SiteApi,
  __dayjs,
} from '../../../../libs/nofbiz/nofbiz.base.js'

import { createNavbar } from '../../../../components/navbar.js'
import { createPackageDetailPanel } from '../../../../components/packageDetailPanel.js'
import { printQrLabel } from '../../utils/qrLabelPrint.js'
import { printSignatureDoc } from '../../utils/qrSignatureDoc.js'
import { dataToXLSX, downloadFile } from '../../../../libs/nofbiz/nofbiz.excelparser.js'
import { createPackageTable } from '../../../../utils/package-table.js'
import {
  trackingIdColumn, statusBadgeColumn, currentLocationColumn, directionColumn,
} from '../../../../utils/package-table-columns.js'
import { createEmptyState } from '../../../../utils/empty-state.js'
import { createPackageFilters } from '../../../../utils/package-filters.js'
import { extractSelection } from '../../../../utils/filter-helpers.js'
import { defaultDateFrom, defaultDateTo, parseFilterDate } from '../../../../utils/date-helpers.js'
import { getLocationValue, getUserDisplayName } from '../../../../utils/user-helpers.js'
import { LIST_EXTERNAL_PACKAGES, LIST_EXTERNAL_LOG, MAIL_DIRECTIONS, DIRECTION_LABELS } from '../../../../utils/constants.js'
import { fetchItemsAcrossLists, loadCategoryOptions, loadLocationOptions } from './external-data.js'

// Field accessors that work for tracked headers AND untracked log rows. Log rows
// lack Recipient / DestinationLocation / SubmissionDate, so derive them from the
// log's direction-aware party + office + Created. Shared by the table columns and
// the XLSX export.
const isLogRow = (pkg) => pkg.__listName === LIST_EXTERNAL_LOG
const cell = (val) => new Text(val || '--', { type: 'span', class: 'posthub__table-cell' })

const categoriesText = (pkg) =>
  Array.isArray(pkg.Categories) ? pkg.Categories.join(', ') : (pkg.Category || '')

const recipientText = (pkg) => (isLogRow(pkg)
  ? (pkg.Direction === MAIL_DIRECTIONS.OUTGOING ? pkg.ExternalParty : getUserDisplayName(pkg.InternalContact))
  : getUserDisplayName(pkg.Recipient)) || ''

const destinationText = (pkg) => (isLogRow(pkg)
  ? (pkg.Direction === MAIL_DIRECTIONS.OUTGOING ? pkg.ExternalParty : getLocationValue(pkg.InternalOffice))
  : getLocationValue(pkg.DestinationLocation)) || ''

const receivedOnText = (pkg) => {
  const d = pkg.SubmissionDate || pkg.Created
  return d ? __dayjs(d).format('DD/MM/YYYY') : ''
}

const categoryColumn = () => ({ label: 'Category', render: (pkg) => cell(categoriesText(pkg)) })
const recipientColumn = () => ({ label: 'Recipient', render: (pkg) => cell(recipientText(pkg)) })
const destinationColumn = () => ({ label: 'Destination', render: (pkg) => cell(destinationText(pkg)) })
const receivedOnColumn = () => ({ label: 'Received On', render: (pkg) => cell(receivedOnText(pkg)) })

// Flattens tracked + log rows into one sheet shape for the XLSX export.
const toExportRows = (packages) => packages.map((pkg) => ({
  'Tracking ID': pkg.Title,
  'Type': isLogRow(pkg) ? 'Logged' : 'Tracked',
  'Status': pkg.Status || '',
  'Direction': pkg.Direction ? (DIRECTION_LABELS[pkg.Direction] || pkg.Direction) : '',
  'Category': categoriesText(pkg),
  'Destination': destinationText(pkg),
  'Recipient': recipientText(pkg),
  'Quantity': pkg.Quantity || '',
  'Details': pkg.PackageDetails || pkg.Description || '',
  'Received On': receivedOnText(pkg),
}))

/**
 * Shared list view for the two external tracked lists (tracked + registered),
 * reused by the Tracked Dashboard and Search routes. Reads live data from both
 * lists, filters client-side, and reuses the standard filter sidebar + table +
 * detail panel.
 *
 * @param {object} config SPARC route config
 * @param {object} opts { title, subtitle, emptyTitle, emptyBody, classPrefix, enableReprint }
 *   enableReprint adds a single Reprint Label button to the detail-panel footer.
 * @returns {Promise<[object, object]>} [navbar, contentArea]
 */
export async function createExternalMailListView(config, {
  title,
  subtitle,
  emptyTitle,
  emptyBody,
  classPrefix,
  enableReprint = false,
}) {
  config.setRouteTitle(title)

  const siteApi = new SiteApi()

  // Hidden container the print helpers populate before window.print().
  const printContainer = new Container([], { class: 'mail-labels__print-container' })

  // Detail-panel footer actions: reprint the QR label (any stage), plus -- only for
  // off-platform items awaiting signature -- reprint the courier Mail Order document.
  const reprintActions = enableReprint
    ? [
        { label: 'Reprint Label', onClick: (pkg) => printQrLabel(pkg, printContainer) },
        {
          label: 'Reprint Document',
          isVisible: (pkg) => pkg.Status === 'awaiting signature',
          onClick: (pkg) => printSignatureDoc(pkg, printContainer),
        },
      ]
    : []

  // Both lists are always fetched; `mailTypes` controls which are shown. Tracked
  // mail is always visible; untracked (logged) mail is hidden by default and
  // revealed by a single toggle.
  const TRACKED_LISTS = [LIST_EXTERNAL_PACKAGES, LIST_EXTERNAL_LOG]

  const filters = {
    tracking: '',
    senderEmail: '',
    recipientEmail: '',
    status: [],
    currentLocation: [],
    destination: [],
    category: [],
    direction: [],
    mailTypes: [LIST_EXTERNAL_PACKAGES],
    dateFrom: defaultDateFrom(),
    dateTo: defaultDateTo(),
  }

  let allItems = []
  let filtered = []

  const { show: showDetailPanel } = createPackageDetailPanel({ actions: reprintActions })
  const navbar = createNavbar()

  const columns = [
    trackingIdColumn(),
    statusBadgeColumn(),
    categoryColumn(),
    directionColumn(),
    currentLocationColumn(),
    destinationColumn(),
    recipientColumn(),
    receivedOnColumn(),
  ]

  const resultsContainer = new Container([], { class: `${classPrefix}__results` })

  function applyFilters() {
    const fromDate = parseFilterDate(filters.dateFrom)
    const toDate = parseFilterDate(filters.dateTo)

    filtered = allItems.filter((pkg) => {
      if (!filters.mailTypes.includes(pkg.__listName)) return false
      const dateToCheck = pkg.SubmissionDate || pkg.Created
      if (dateToCheck) {
        if (fromDate && __dayjs(dateToCheck).isBefore(fromDate, 'day')) return false
        if (toDate && __dayjs(dateToCheck).isAfter(toDate, 'day')) return false
      }
      if (filters.tracking && !pkg.Title.toLowerCase().includes(filters.tracking)) return false
      if (filters.senderEmail && pkg.SenderEmail !== filters.senderEmail) return false
      if (filters.recipientEmail && pkg.RecipientEmail !== filters.recipientEmail) return false
      if (filters.status.length > 0 && !filters.status.includes(pkg.Status)) return false
      if (filters.currentLocation.length > 0 && !filters.currentLocation.includes(getLocationValue(pkg.CurrentLocation))) return false
      if (filters.destination.length > 0 && !filters.destination.includes(getLocationValue(pkg.DestinationLocation))) return false
      if (filters.direction.length > 0 && !filters.direction.includes(pkg.Direction)) return false
      if (filters.category.length > 0) {
        // Tracked headers carry a denormalized `Categories` array; log rows a single `Category`.
        const pkgCats = Array.isArray(pkg.Categories) ? pkg.Categories : (pkg.Category ? [pkg.Category] : [])
        if (!pkgCats.some((c) => filters.category.includes(c))) return false
      }
      return true
    })

    updateTable()
  }

  function updateTable() {
    if (filtered.length === 0) {
      resultsContainer.children = [createEmptyState(emptyTitle, emptyBody)]
      return
    }
    const resultCount = new Text(`${filtered.length} mail item(s)`, {
      type: 'p',
      class: `${classPrefix}__result-count`,
    })
    const table = createPackageTable({
      columns,
      packages: filtered,
      onRowClick: showDetailPanel,
      tableClass: `${classPrefix}__table`,
    })
    resultsContainer.children = [resultCount, table]
  }

  // Load option datasets + build filter sidebar
  const [categoryOptions, locationOptions] = await Promise.all([
    loadCategoryOptions(siteApi),
    loadLocationOptions(siteApi),
  ])

  const categoryField = new FormField({ value: [] })
  const categoryComboBox = new ComboBox(categoryField, categoryOptions, {
    allowMultiple: true,
    allowFiltering: true,
    allowCreate: false,
    placeholder: 'Select category...',
    onSelectHandler: (selection) => { filters.category = extractSelection(selection); applyFilters() },
  })
  const categoryGroup = new Container([
    new Text('Category', { type: 'label', class: 'posthub__filter-label' }),
    categoryComboBox,
  ], { class: 'posthub__filter-group' })

  const directionOptions = [
    { label: DIRECTION_LABELS[MAIL_DIRECTIONS.INGOING], value: MAIL_DIRECTIONS.INGOING },
    { label: DIRECTION_LABELS[MAIL_DIRECTIONS.OUTGOING], value: MAIL_DIRECTIONS.OUTGOING },
  ]
  const directionField = new FormField({ value: [] })
  const directionComboBox = new ComboBox(directionField, directionOptions, {
    allowMultiple: true,
    allowFiltering: false,
    allowCreate: false,
    placeholder: 'Select direction...',
    onSelectHandler: (selection) => { filters.direction = extractSelection(selection); applyFilters() },
  })
  const directionGroup = new Container([
    new Text('Direction', { type: 'label', class: 'posthub__filter-label' }),
    directionComboBox,
  ], { class: 'posthub__filter-group' })

  // Single toggle: untracked (logged) mail is hidden by default; checking it adds
  // the log list to the shown set. Tracked mail is always shown.
  const showUntrackedField = new FormField({ value: false })
  showUntrackedField.subscribe((show) => {
    filters.mailTypes = show ? TRACKED_LISTS : [LIST_EXTERNAL_PACKAGES]
    applyFilters()
  })
  const showUntrackedCheck = new CheckBox(showUntrackedField)
  const typeGroup = new Container([
    new FieldLabel('Show items without tracking', showUntrackedCheck, { position: 'right' }),
  ], { class: `posthub__filter-group ${classPrefix}__type-filter` })

  // Build the shared filter grid, appending external-only groups so every filter
  // flows uniformly in the same top bar (internal + external share this structure).
  const { filterGrid, buttonRowSlot, clearAll } = createPackageFilters({
    filters,
    locationOptions,
    options: { includeTracking: true },
    onFilterChange: applyFilters,
    onDateChange: () => applyFilters(),
    extraGroups: [categoryGroup, directionGroup, typeGroup],
  })

  const clearButton = new Button('Clear Filters', {
    variant: 'secondary',
    onClickHandler: () => {
      clearAll()
      filters.category = []
      categoryComboBox.clearSelection()
      filters.direction = []
      directionComboBox.clearSelection()
      // Reset the untracked toggle to its default (hidden). FormControl needs
      // render() to reflect a programmatic value change in the DOM.
      filters.mailTypes = [LIST_EXTERNAL_PACKAGES]
      showUntrackedField.value = false
      showUntrackedCheck.render()
    },
  })
  const exportButton = new Button(
    [
      new Text(getIcon('download-line'), { type: 'span', class: 'posthub__btn-icon' }),
      new Text('Export', { type: 'span' }),
    ],
    {
      variant: 'secondary',
      class: 'posthub__btn--with-icon',
      onClickHandler: async () => {
        if (filtered.length === 0) {
          Toast.warning('No data to export')
          return
        }
        exportButton.isLoading = true
        try {
          const buffer = await dataToXLSX(toExportRows(filtered), {
            sheetName: 'External Mail',
            columnWidths: {
              'Tracking ID': 24, 'Type': 10, 'Status': 16, 'Direction': 12,
              'Category': 22, 'Destination': 22, 'Recipient': 24, 'Quantity': 10,
              'Details': 30, 'Received On': 14,
            },
          })
          downloadFile(buffer, `posthub-external-mail-${__dayjs().format('YYYYMMDD-HHmmss')}.xlsx`)
        } catch (err) {
          console.error('[external-search] export failed', err)
          Toast.error('Export failed')
        } finally {
          exportButton.isLoading = false
        }
      },
    },
  )
  buttonRowSlot.children = [clearButton, exportButton]

  const filterSection = new Container([filterGrid], {
    class: 'posthub__filter-sidebar posthub__filter-sidebar--top',
  })

  const pageHeader = new Container([
    new Container([
      new LinkButton(getIcon('arrow-go-back-line'), 'facilities/external-mail', {
        class: 'posthub__home-icon',
      }),
      new Text(title, { type: 'h1', class: 'posthub__page-title' }),
    ], { class: 'posthub__title-with-icon' }),
    new Text(subtitle, { type: 'p', class: 'posthub__page-subtitle' }),
  ], { class: 'posthub__page-header' })

  const bodyArea = new Container([filterSection, resultsContainer], { class: `${classPrefix}__body` })
  const contentArea = new Container([pageHeader, bodyArea, printContainer], { class: 'posthub__page-content' })

  // Initial state: loading, then fetch all three lists and render
  resultsContainer.children = [createEmptyState('Loading...', 'Fetching external mail.')]

  allItems = await fetchItemsAcrossLists(siteApi, TRACKED_LISTS)
  applyFilters()

  return [navbar, contentArea]
}
