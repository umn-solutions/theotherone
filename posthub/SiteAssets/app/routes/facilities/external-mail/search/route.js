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
  config.setRouteTitle('Search External Mail')

  // Location filter options (the 6 known offices). Option values, not data.
  const LOCATION_OPTIONS = [
    'PORTO | URBO',
    'LISBON | TOC',
    'LISBON | TOR',
    'LISBON | ECHO',
    'LISBON | AURA',
    'LISBON | LUMNIA',
  ]

  // No data in this prototype -- results render an empty/instructional state.
  const packages = []
  let results = []

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

  const resultsContainer = new Container([], { class: 'external-mail-search__results' })

  function runSearch() {
    // Client-side search would run here; the dataset is empty for the prototype.
    results = packages.slice()
    updateView()
  }

  function updateView() {
    if (results.length === 0) {
      resultsContainer.children = [
        createEmptyState(
          'No results',
          'Enter search criteria to find external mail. (No data in this prototype.)',
        ),
      ]
      return
    }

    const resultCount = new Text(`${results.length} item(s) found`, {
      type: 'p',
      class: 'external-mail-search__result-count',
    })
    const table = createPackageTable({
      columns,
      packages: results,
      onRowClick: showDetailPanel,
      tableClass: 'external-mail-search__table',
    })
    resultsContainer.children = [resultCount, table]
  }

  const { filterGrid, buttonRowSlot, clearAll, attachTrackingListener } = createPackageFilters({
    filters,
    locationOptions: LOCATION_OPTIONS,
    options: { includeTracking: true },
    onFilterChange: runSearch,
    onDateChange: () => runSearch(),
  })

  // Category filter is external-mail specific -- createPackageFilters has no Category concept.
  const categoryField = new FormField({ value: [] })
  const categoryComboBox = new ComboBox(categoryField, [], {
    allowMultiple: true,
    allowFiltering: true,
    allowCreate: true,
    placeholder: 'Select category...',
    onSelectHandler: (selection) => { filters.category = extractSelection(selection); runSearch() },
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
    class: 'posthub__filter-sidebar external-mail-search__sidebar',
  })

  const pageHeader = new Container([
    new Container([
      new LinkButton(getIcon('arrow-go-back-line'), 'facilities/external-mail', {
        class: 'posthub__home-icon',
      }),
      new Text('Search External Mail', { type: 'h1', class: 'posthub__page-title' }),
    ], { class: 'posthub__title-with-icon' }),
    new Text('Search external mail by tracking number, sender, recipient, status, or location.', {
      type: 'p',
      class: 'posthub__page-subtitle',
    }),
  ], { class: 'posthub__page-header' })

  const bodyArea = new Container([filterSection, resultsContainer], { class: 'external-mail-search__body' })
  const contentArea = new Container([pageHeader, bodyArea], { class: 'posthub__page-content' })

  runSearch()
  attachTrackingListener()

  return [navbar, contentArea]
})
