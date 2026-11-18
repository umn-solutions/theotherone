import {
  defineRoute,
  Container,
  Text,
  Button,
  LinkButton,
  getIcon,
  Toast,
  SiteApi,
  Loader,
  __dayjs,
} from '../../../../libs/nofbiz/nofbiz.base.js'
import { dataToXLSX, downloadFile } from '../../../../libs/nofbiz/nofbiz.excelparser.js'
import { createSearchPanelActions } from '../../utils/searchPanelActions.js'
import { internalMailRows, INTERNAL_MAIL_COLUMN_WIDTHS } from '../../utils/mail-export-rows.js'

import { createNavbar } from '../../../../components/navbar.js'
import { createPackageDetailPanel } from '../../../../components/packageDetailPanel.js'
import { LIST_PACKAGES, LIST_LOCATIONS } from '../../../../utils/constants.js'
import { getLocationValue } from '../../../../utils/user-helpers.js'
import { createPackageTable } from '../../../../utils/package-table.js'
import {
  trackingIdColumn, statusBadgeColumn, currentLocationColumn,
  destinationColumn, senderColumn, recipientColumn, dateColumn, packageDetailsColumn,
} from '../../../../utils/package-table-columns.js'
import { createEmptyState } from '../../../../utils/empty-state.js'
import { parseFilterDate, defaultDateFrom, defaultDateTo, buildDateRangeClause } from '../../../../utils/date-helpers.js'
import { readItemsInIdWindows } from '../../../../utils/list-read.js'
import { createPackageFilters } from '../../../../utils/package-filters.js'
import { guardAccess } from '../../../../utils/access.js'
import { PAGE_DESCRIPTIONS, pluralize } from '../../../../utils/copy.js'

export default defineRoute((config) => {
  config.setRouteTitle('Search Mail')

  // Facilities route: employee+ access required
  if (!guardAccess('EMPLOYEE')) return []

  const siteApi = new SiteApi()

  // --- State ---

  let allPackages = []
  let searchResults = []

  const filters = {
    tracking: '',
    senderEmail: '',
    recipientEmail: '',
    status: [],
    currentLocation: [],
    destination: [],
    dateFrom: defaultDateFrom(),
    dateTo: defaultDateTo(),
  }

  // Hidden container the print helpers populate before window.print().
  const printContainer = new Container([], { class: 'mail-labels__print-container' })

  // Detail-panel actions shared with the external search (same status -> same buttons).
  const { actions: detailActions, dialog: deleteDialog } = createSearchPanelActions({
    printContainer,
    onDeleted: () => fetchPackages(filters.dateFrom, filters.dateTo),
  })

  const { show: showDetailPanel } = createPackageDetailPanel({
    showSmartCardId: true,
    actions: detailActions,
  })
  const navbar = createNavbar()

  const pageHeader = new Container([
    new Container([
      new LinkButton(getIcon('arrow-go-back-line'), 'facilities/internal-mail', {
        class: 'posthub__home-icon'
      }),
      new Text('Search Mail', { type: 'h1', class: 'posthub__page-title' }),
    ], { class: 'posthub__title-with-icon' }),
    new Text(PAGE_DESCRIPTIONS.internalSearch, {
      type: 'p', class: 'posthub__page-subtitle'
    }),
  ], { class: 'posthub__page-header' })

  const filterSection = new Container([], { class: 'posthub__filter-sidebar posthub__filter-sidebar--top' })
  const resultsContainer = new Container([], { class: 'search-package__results' })
  const pageLoader = new Loader(new Text('Loading...'), { animation: 'pulse' })

  // --- Filter logic ---

  function applyFilters() {
    const fromDate = parseFilterDate(filters.dateFrom)
    const toDate = parseFilterDate(filters.dateTo)

    searchResults = allPackages.filter(pkg => {
      // When tracking is active, the fetch was global (no date CAML) --
      // skip the date-range client check so out-of-range matches remain visible.
      // Pending mail has no SubmissionDate and always shows, whatever the range.
      if (!filters.tracking && pkg.Status !== 'pending') {
        const dateToCheck = pkg.SubmissionDate || pkg.Created
        if (fromDate && dateToCheck) {
          if (__dayjs(dateToCheck).isBefore(fromDate, 'day')) return false
        }
        if (toDate && dateToCheck) {
          if (__dayjs(dateToCheck).isAfter(toDate, 'day')) return false
        }
      }

      if (filters.tracking && !pkg.Title.toLowerCase().includes(filters.tracking)) return false
      if (filters.senderEmail && pkg.SenderEmail !== filters.senderEmail) return false
      if (filters.recipientEmail && pkg.RecipientEmail !== filters.recipientEmail) return false
      if (filters.status.length > 0 && !filters.status.includes(pkg.Status)) return false
      if (filters.currentLocation.length > 0 && !filters.currentLocation.includes(getLocationValue(pkg.CurrentLocation))) return false
      if (filters.destination.length > 0 && !filters.destination.includes(getLocationValue(pkg.DestinationLocation))) return false
      return true
    })

    updateView()
  }

  function updateView() {
    if (searchResults.length === 0) {
      resultsContainer.children = [createEmptyState('No mail found', 'No results match your current filters. Try adjusting the date range or clearing some filters.')]
      return
    }

    const resultCount = new Text(`${pluralize(searchResults.length, 'mail item')} found`, {
      type: 'p',
      class: 'search-package__result-count',
    })

    const columns = [
      trackingIdColumn(),
      statusBadgeColumn(),
      currentLocationColumn(),
      destinationColumn(),
      senderColumn(),
      recipientColumn(),
      packageDetailsColumn(),
      dateColumn('Dispatched On', 'SubmissionDate'),
    ]

    const table = createPackageTable({
      columns,
      packages: searchResults,
      onRowClick: showDetailPanel,
      tableClass: 'search-package__table',
    })

    resultsContainer.children = [resultCount, table]
  }

  // Fetch packages: branches on whether a tracking id is present.
  // - tracking non-empty: global search via Contains on Title (no date clause)
  // - tracking empty: SubmissionDate range, plus all pending mail regardless of range
  // Contains and Or cannot use an index, so the condition is applied inside
  // threshold-safe ID windows (see utils/list-read.js).
  async function fetchPackages(from, to) {
    let where
    if (filters.tracking) {
      const escaped = filters.tracking.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      where = `<Contains><FieldRef Name='Title'/><Value Type='Text'>${escaped}</Value></Contains>`
    } else {
      const rangeClause = buildDateRangeClause(from, to, 'SubmissionDate')
      where = rangeClause
        ? `<Or>${rangeClause}<Eq><FieldRef Name='Status'/><Value Type='Text'>pending</Value></Eq></Or>`
        : undefined
    }

    const loading = Toast.loading('Loading mail...')
    try {
      allPackages = await readItemsInIdWindows(siteApi, LIST_PACKAGES, { where })
      loading.dismiss()
    } catch (err) {
      console.error('[search-package] load packages failed', err)
      loading.error('Could not load mail. Refresh to try again.')
    }
    applyFilters()
  }

  // Called by createPackageFilters when the tracking input changes. Triggers
  // a global fetch (non-empty id) or reverts to the date-ranged view (empty id).
  // fetchPackages reads filters.tracking internally to decide which CAML path to use.
  function handleTrackingChange() {
    fetchPackages(filters.dateFrom, filters.dateTo)
  }

  const bodyArea = new Container([
    filterSection,
    resultsContainer,
    pageLoader,
  ], { class: 'search-package__body' })

  const contentArea = new Container([pageHeader, bodyArea, printContainer], { class: 'posthub__page-content' })

  loadData()

  async function loadData() {
    pageLoader.enable()
    let activeLocations = []
    try {
      activeLocations = await siteApi.list(LIST_LOCATIONS).getItems({ IsActive: 'true' })
    } catch (err) {
      console.error('[search-package] load locations failed', err)
      Toast.error('Could not load offices. Refresh to try again.')
    }

    const locationOptions = activeLocations.map(l => l.Title)

    const { filterGrid, buttonRowSlot, clearAll } = createPackageFilters({
      filters,
      locationOptions,
      options: { includeTracking: true },
      onFilterChange: applyFilters,
      onDateChange: fetchPackages,
      onTrackingChange: handleTrackingChange,
    })

    const clearButton = new Button('Clear Filters', {
      onClickHandler: clearAll,
      variant: 'secondary',
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
          if (searchResults.length === 0) {
            Toast.warning('No data to export')
            return
          }
          exportButton.isLoading = true
          try {
            const rows = internalMailRows(searchResults)
            const buffer = await dataToXLSX(rows, {
              sheetName: 'Mail Search',
              columnWidths: INTERNAL_MAIL_COLUMN_WIDTHS,
            })
            downloadFile(buffer, `posthub-search-${__dayjs().format('YYYYMMDD-HHmmss')}.xlsx`)
          } catch (err) {
            console.error('[search-package] export failed', err)
            Toast.error('Could not export. Try again.')
          } finally {
            exportButton.isLoading = false
          }
        },
      },
    )

    buttonRowSlot.children = [clearButton, exportButton]

    filterSection.children = [filterGrid]

    await fetchPackages(filters.dateFrom, filters.dateTo)
    pageLoader.disable()
  }

  return [navbar, contentArea, deleteDialog]
})
