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
  SiteApi,
  __dayjs,
} from '../../../../libs/nofbiz/nofbiz.base.js'

import { createNavbar } from '../../../../components/navbar.js'
import { createPackageDetailPanel } from '../../../../components/packageDetailPanel.js'
import { printQrLabel } from '../../utils/qrLabelPrint.js'
import { createPackageTable } from '../../../../utils/package-table.js'
import {
  trackingIdColumn, statusBadgeColumn, currentLocationColumn,
  destinationColumn, senderColumn, recipientColumn, dateColumn,
} from '../../../../utils/package-table-columns.js'
import { createEmptyState } from '../../../../utils/empty-state.js'
import { createPackageFilters } from '../../../../utils/package-filters.js'
import { extractSelection } from '../../../../utils/filter-helpers.js'
import { defaultDateFrom, defaultDateTo, parseFilterDate } from '../../../../utils/date-helpers.js'
import { getLocationValue } from '../../../../utils/user-helpers.js'
import { LIST_EXTERNAL_BULK, LIST_EXTERNAL_TRACKED, LIST_EXTERNAL_REGISTERED } from '../../../../utils/constants.js'
import { fetchItemsAcrossLists, loadCategoryOptions, loadLocationOptions } from './external-data.js'

const categoryColumn = () => ({
  label: 'Category',
  render: (pkg) => new Text(pkg.Category || '--', { type: 'span', class: 'posthub__table-cell' }),
})

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

  // Single reprint action in the detail-panel footer, available at every stage
  // (no isVisible gate) -- the QR only encodes the tracking number.
  const reprintActions = enableReprint
    ? [{ label: 'Reprint Label', onClick: (pkg) => printQrLabel(pkg, printContainer) }]
    : []

  // One list per external mail type; drives both the fetch and the type filter.
  // `checked` is the default filter state -- bulk (untracked) is hidden by default.
  const MAIL_TYPES = [
    { label: 'Bulk', list: LIST_EXTERNAL_BULK, checked: false },
    { label: 'Tracked', list: LIST_EXTERNAL_TRACKED, checked: true },
    { label: 'Registered', list: LIST_EXTERNAL_REGISTERED, checked: true },
  ]

  const filters = {
    tracking: '',
    senderEmail: '',
    recipientEmail: '',
    status: [],
    currentLocation: [],
    destination: [],
    category: [],
    mailTypes: MAIL_TYPES.filter((t) => t.checked).map((t) => t.list),
    dateFrom: defaultDateFrom(),
    dateTo: defaultDateTo(),
  }

  let allItems = []
  let filtered = []

  const { show: showDetailPanel } = createPackageDetailPanel({ actions: reprintActions })
  const navbar = createNavbar()

  const columns = [
    dateColumn('Received On', 'SubmissionDate'),
    statusBadgeColumn(),
    categoryColumn(),
    currentLocationColumn(),
    destinationColumn(),
    recipientColumn(),
    trackingIdColumn(),
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
      if (filters.category.length > 0 && !filters.category.includes(pkg.Category)) return false
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

  const { filterGrid, buttonRowSlot, clearAll, attachTrackingListener } = createPackageFilters({
    filters,
    locationOptions,
    options: { includeTracking: true },
    onFilterChange: applyFilters,
    onDateChange: () => applyFilters(),
  })

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

  // One checkbox per mail type -- toggling adds/removes the list from the fetched set.
  const typeCheckBoxes = MAIL_TYPES.map(({ label, list, checked }) => {
    const field = new FormField({ value: checked })
    field.subscribe((isChecked) => {
      filters.mailTypes = isChecked
        ? [...new Set([...filters.mailTypes, list])]
        : filters.mailTypes.filter((l) => l !== list)
      applyFilters()
    })
    const checkbox = new CheckBox(field)
    return { field, checkbox, checked, label: new FieldLabel(label, checkbox, { position: 'right' }) }
  })
  const typeGroup = new Container([
    new Text('Mail Type', { type: 'label', class: 'posthub__filter-label' }),
    new Container(typeCheckBoxes.map((t) => t.label), { class: `${classPrefix}__type-filter` }),
  ], { class: 'posthub__filter-group' })

  const clearButton = new Button('Clear Filters', {
    variant: 'secondary',
    onClickHandler: () => {
      clearAll()
      filters.category = []
      categoryComboBox.clearSelection()
      // Reset every type checkbox to its default (FormControl needs render() to
      // reflect a programmatic value change in the DOM).
      typeCheckBoxes.forEach(({ field, checkbox, checked }) => {
        field.value = checked
        checkbox.render()
      })
    },
  })
  buttonRowSlot.children = [clearButton]

  const refineSection = new Container([filterGrid, categoryGroup, typeGroup], {
    class: `${classPrefix}__refine`,
  })
  const filterSection = new Container([refineSection, buttonRowSlot], {
    class: 'posthub__filter-sidebar',
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

  allItems = await fetchItemsAcrossLists(siteApi, MAIL_TYPES.map((t) => t.list))
  applyFilters()
  attachTrackingListener()

  return [navbar, contentArea]
}
