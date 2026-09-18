import {
  defineRoute,
  Container,
  Text,
  Button,
  LinkButton,
  ComboBox,
  FormField,
  getIcon,
} from '../../../../libs/nofbiz/nofbiz.base.js'

import { createNavbar } from '../../../../components/navbar.js'
import { createPackageDetailPanel } from '../../../../components/packageDetailPanel.js'
import { createPackageTable } from '../../../../utils/package-table.js'
import {
  trackingIdColumn, statusBadgeColumn, currentLocationColumn,
  destinationColumn, senderColumn, recipientColumn, dateColumn,
} from '../../../../utils/package-table-columns.js'
import { createEmptyState } from '../../../../utils/empty-state.js'
import { createPackageFilters } from '../../../../utils/package-filters.js'
import { extractSelection } from '../../../../utils/filter-helpers.js'
import { defaultDateFrom, defaultDateTo } from '../../../../utils/date-helpers.js'

export default defineRoute((config) => {
  config.setRouteTitle('Tracked External Mail')

  // Location filter options (the 6 known offices). Option values, not data.
  const LOCATION_OPTIONS = [
    'PORTO | URBO',
    'LISBON | TOC',
    'LISBON | TOR',
    'LISBON | ECHO',
    'LISBON | AURA',
    'LISBON | LUMNIA',
  ]

  // No data in this prototype -- results render an empty state.
  const packages = []
  let filtered = []

  const filters = {
    tracking: '',
    senderEmail: '',
    recipientEmail: '',
    status: [],
    currentLocation: [],
    destination: [],
    category: [],
    dateFrom: defaultDateFrom(),
    dateTo: defaultDateTo(),
  }

  const { show: showDetailPanel } = createPackageDetailPanel()
  const navbar = createNavbar()

  // Columns are defined and ready for when data exists (Category is external-mail specific).
  const columns = [
    dateColumn('Received On', 'SubmissionDate'),
    statusBadgeColumn(),
    currentLocationColumn(),
    destinationColumn(),
    senderColumn(),
    recipientColumn(),
    trackingIdColumn(),
    {
      label: 'Category',
      render: (pkg) => new Text(pkg.Category || '--', { type: 'span', class: 'posthub__table-cell' }),
    },
  ]

  const resultsContainer = new Container([], { class: 'external-mail-tracked__results' })

  function applyFilters() {
    // Client-side filtering would run here; the dataset is empty for the prototype.
    filtered = packages.slice()
    updateTable()
  }

  function updateTable() {
    if (filtered.length === 0) {
      resultsContainer.children = [
        createEmptyState(
          'No tracked mail yet',
          'Register external mail or adjust your filters to see results here.',
        ),
      ]
      return
    }

    const resultCount = new Text(`${filtered.length} mail item(s)`, {
      type: 'p',
      class: 'external-mail-tracked__result-count',
    })
    const table = createPackageTable({
      columns,
      packages: filtered,
      onRowClick: showDetailPanel,
      tableClass: 'external-mail-tracked__table',
    })
    resultsContainer.children = [resultCount, table]
  }

  const { filterGrid, buttonRowSlot, clearAll, attachTrackingListener } = createPackageFilters({
    filters,
    locationOptions: LOCATION_OPTIONS,
    options: { includeTracking: true },
    onFilterChange: applyFilters,
    onDateChange: () => applyFilters(),
  })

  // Category filter is external-mail specific -- createPackageFilters has no Category concept.
  const categoryField = new FormField({ value: [] })
  const categoryComboBox = new ComboBox(categoryField, [], {
    allowMultiple: true,
    allowFiltering: true,
    allowCreate: true,
    placeholder: 'Select category...',
    onSelectHandler: (selection) => { filters.category = extractSelection(selection); applyFilters() },
  })
  const categoryGroup = new Container([
    new Text('Category', { type: 'label', class: 'posthub__filter-label' }),
    categoryComboBox,
  ], { class: 'posthub__filter-group' })

  const clearButton = new Button('Clear Filters', {
    variant: 'secondary',
    onClickHandler: () => {
      clearAll()
      filters.category = []
      categoryComboBox.clearSelection()
    },
  })
  buttonRowSlot.children = [clearButton]

  const filterSection = new Container([filterGrid, categoryGroup, buttonRowSlot], {
    class: 'posthub__filter-sidebar external-mail-tracked__sidebar',
  })

  const pageHeader = new Container([
    new Container([
      new LinkButton(getIcon('arrow-go-back-line'), 'facilities/external-mail', {
        class: 'posthub__home-icon',
      }),
      new Text('Tracked External Mail', { type: 'h1', class: 'posthub__page-title' }),
    ], { class: 'posthub__title-with-icon' }),
    new Text('View and filter all tracked external mail.', {
      type: 'p',
      class: 'posthub__page-subtitle',
    }),
  ], { class: 'posthub__page-header' })

  const bodyArea = new Container([filterSection, resultsContainer], { class: 'external-mail-tracked__body' })
  const contentArea = new Container([pageHeader, bodyArea], { class: 'posthub__page-content' })

  applyFilters()
  attachTrackingListener()

  return [navbar, contentArea]
})
