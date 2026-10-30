import {
  defineRoute,
  Container,
  Text,
  Button,
  LinkButton,
  Dialog,
  getIcon,
  Toast,
  SiteApi,
  Loader,
  __dayjs,
} from '../../../../libs/nofbiz/nofbiz.base.js'
import { dataToXLSX, downloadFile } from '../../../../libs/nofbiz/nofbiz.excelparser.js'
import { deletePackageWithTimeline, sendChaseEmail } from '../../utils/package-actions.js'

import { createNavbar } from '../../../../components/navbar.js'
import { createPackageDetailPanel } from '../../../../components/packageDetailPanel.js'
import { LIST_PACKAGES, LIST_LOCATIONS } from '../../../../utils/constants.js'
import { getLocationValue, getUserDisplayName } from '../../../../utils/user-helpers.js'
import { createPackageTable } from '../../../../utils/package-table.js'
import {
  trackingIdColumn, statusBadgeColumn, currentLocationColumn,
  destinationColumn, senderColumn, recipientColumn, dateColumn, packageDetailsColumn,
} from '../../../../utils/package-table-columns.js'
import { createEmptyState } from '../../../../utils/empty-state.js'
import { parseFilterDate, defaultDateFrom, defaultDateTo, buildDateRangeCaml } from '../../../../utils/date-helpers.js'
import { createPackageFilters } from '../../../../utils/package-filters.js'
import { guardAccess } from '../../../../utils/access.js'

export default defineRoute((config) => {
  config.setRouteTitle('Search Mail')

  // Facilities route: employee+ access required
  if (!guardAccess('EMPLOYEE')) return []

  const siteApi = new SiteApi()

  // --- Helpers ---

  function toExportRows(packages) {
    return packages.map(pkg => ({
      'Tracking ID': pkg.Title,
      'Status': pkg.Status,
      'Current Location': getLocationValue(pkg.CurrentLocation),
      'Destination': getLocationValue(pkg.DestinationLocation),
      'Sender': getUserDisplayName(pkg.Sender),
      'Recipient': getUserDisplayName(pkg.Recipient),
      'Mail Details': pkg.PackageDetails || '',
      'Submitted On': pkg.SubmissionDate ? __dayjs(pkg.SubmissionDate).format('DD/MM/YYYY') : '',
    }))
  }

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

  // Per-item actions in the detail panel -- search page only. Chase shows for
  // arrived mail, Delete for pending mail (no day constraint here).
  const detailActions = [
    {
      label: 'Chase',
      variant: 'primary',
      isVisible: (pkg) => pkg.Status === 'arrived',
      onClick: (pkg, ctx) => chaseItem(pkg, ctx),
    },
    {
      label: 'Delete',
      variant: 'danger',
      isVisible: (pkg) => pkg.Status === 'pending',
      onClick: (pkg, ctx) => requestDelete(pkg, ctx),
    },
  ]

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
    new Text('Track or look up any mail by tracking number, sender, or recipient', {
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
      if (!filters.tracking) {
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

    const resultCount = new Text(`${searchResults.length} mail item(s) found`, {
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
      dateColumn('Submitted On', 'SubmissionDate'),
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
  // - tracking non-empty: global search via Contains on indexed Title (no date clause)
  // - tracking empty: date-ranged fetch via SubmissionDate CAML
  async function fetchPackages(from, to) {
    let caml
    if (filters.tracking) {
      // Global search by tracking substring (Contains on indexed Title).
      const escaped = filters.tracking.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      caml = `<View><Query><Where><Contains><FieldRef Name='Title'/><Value Type='Text'>${escaped}</Value></Contains></Where></Query></View>`
    } else {
      caml = buildDateRangeCaml(from, to, 'SubmissionDate', true)
    }

    const loading = Toast.loading('Loading mail...')
    try {
      allPackages = await siteApi.list(LIST_PACKAGES).getItems(caml)
      loading.dismiss()
    } catch (err) {
      console.error('[search-package] load packages failed', err)
      loading.error('Failed to load mail')
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

  const contentArea = new Container([pageHeader, bodyArea], { class: 'posthub__page-content' })

  loadData()

  async function loadData() {
    pageLoader.enable()
    let activeLocations = []
    try {
      activeLocations = await siteApi.list(LIST_LOCATIONS).getItems({ IsActive: 'true' })
    } catch (err) {
      console.error('[search-package] load locations failed', err)
      Toast.error('Failed to load locations')
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
            const rows = toExportRows(searchResults)
            const buffer = await dataToXLSX(rows, {
              sheetName: 'Mail Search',
              columnWidths: {
                'Tracking ID': 28,
                'Status': 14,
                'Current Location': 22,
                'Destination': 22,
                'Sender': 28,
                'Recipient': 28,
                'Mail Details': 30,
                'Submitted On': 16,
              },
            })
            downloadFile(buffer, `posthub-search-${__dayjs().format('YYYYMMDD-HHmmss')}.xlsx`)
          } catch (err) {
            console.error('[search-package] export failed', err)
            Toast.error('Export failed')
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

  // --- Detail-panel actions: chase (arrived) / delete (pending) ---
  let pendingDelete = null

  async function chaseItem(pkg, { close }) {
    const loading = Toast.loading('Sending chase email...')
    try {
      await sendChaseEmail(pkg)
      loading.success('Chase email sent')
      close()
    } catch (err) {
      console.error('[search-package] chase email failed', err)
      loading.error('Failed to send chase email')
    }
  }

  function requestDelete(pkg, { close }) {
    pendingDelete = { pkg, closePanel: close }
    deleteConfirmText.children = `Delete "${pkg.Title}" and its timeline history? This cannot be undone.`
    deleteDialog.open()
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    const { pkg, closePanel } = pendingDelete
    confirmDeleteBtn.isLoading = true
    const loading = Toast.loading('Deleting...')
    try {
      await deletePackageWithTimeline(siteApi, pkg)
      loading.success('Package deleted')
      deleteDialog.close()
      closePanel?.()
      await fetchPackages(filters.dateFrom, filters.dateTo)
    } catch (err) {
      console.error('[search-package] delete failed', err)
      loading.error('Failed to delete package')
    } finally {
      confirmDeleteBtn.isLoading = false
      pendingDelete = null
    }
  }

  const deleteConfirmText = new Text('', { type: 'p' })
  const cancelDeleteBtn = new Button('Cancel', {
    variant: 'secondary',
    onClickHandler: () => deleteDialog.close(),
  })
  const confirmDeleteBtn = new Button('Delete', {
    variant: 'danger',
    onClickHandler: () => confirmDelete(),
  })
  const deleteDialog = new Dialog({
    title: 'Delete Package',
    content: deleteConfirmText,
    footer: new Container([cancelDeleteBtn, confirmDeleteBtn], {
      class: 'search-package__dialog-footer',
    }),
    variant: 'error',
  })
  deleteDialog.render()

  return [navbar, contentArea, deleteDialog]
})
