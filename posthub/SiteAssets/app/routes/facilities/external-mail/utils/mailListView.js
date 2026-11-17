import {
  Container,
  Text,
  Button,
  LinkButton,
  CheckBox,
  TextInput,
  FieldLabel,
  FormField,
  getIcon,
  Toast,
  SiteApi,
  __dayjs,
} from '../../../../libs/nofbiz/nofbiz.base.js'

import { createNavbar } from '../../../../components/navbar.js'
import { createPackageDetailPanel } from '../../../../components/packageDetailPanel.js'
import { createSearchPanelActions } from '../../utils/searchPanelActions.js'
import { downloadWorkbook } from '../../../../utils/workbook-export.js'
import {
  categoriesText, recipientText, destinationText, receivedOnText,
  externalMailRows, collectionItemRows,
} from '../../utils/mail-export-rows.js'
import { createPackageTable } from '../../../../utils/package-table.js'
import {
  trackingIdColumn, statusBadgeColumn, currentLocationColumn, directionColumn,
} from '../../../../utils/package-table-columns.js'
import { createEmptyState } from '../../../../utils/empty-state.js'
import { createPackageFilters, createMultiSelectFilter, filterGroup, findMailHint } from '../../../../utils/package-filters.js'
import { normalizeSearchText } from '../../../../utils/filter-helpers.js'
import { defaultDateFrom, defaultDateTo, parseFilterDate } from '../../../../utils/date-helpers.js'
import { getLocationValue } from '../../../../utils/user-helpers.js'
import {
  LIST_EXTERNAL_PACKAGES, LIST_EXTERNAL_LOG, MAIL_DIRECTIONS, DIRECTION_LABELS, EXTERNAL_TRACKING_ID_LABEL,
} from '../../../../utils/constants.js'
import { fetchItemsAcrossLists, loadCategoryOptions, loadLocationOptions, loadGroupedExternalItems } from './external-data.js'
import { pluralize, TOOLTIPS } from '../../../../utils/copy.js'

// Field accessors (tracked headers AND log rows) are shared with the exports.
const cell = (val) => new Text(val || '--', { type: 'span', class: 'posthub__table-cell' })

const categoryColumn = () => ({ label: 'Category', render: (pkg) => cell(categoriesText(pkg)) })
const recipientColumn = () => ({ label: 'Recipient', render: (pkg) => cell(recipientText(pkg)) })
const destinationColumn = () => ({ label: 'Destination', render: (pkg) => cell(destinationText(pkg)) })
const receivedOnColumn = () => ({ label: 'Received On', render: (pkg) => cell(receivedOnText(pkg)) })

/** Build a text-search index from grouped items for the External Tracking ID filter. */
function buildItemTrackingIndex(groups) {
  const idx = new Map()
  for (const [title, items] of groups) {
    const ids = items
      .map((it) => normalizeSearchText(it.ExternalTrackingId))
      .filter(Boolean)
    if (ids.length) idx.set(title, ids)
  }
  return idx
}

/**
 * Shared list view for the two external tracked lists (tracked + registered),
 * reused by the Tracked Dashboard and Search routes. Reads live data from both
 * lists, filters client-side, and reuses the standard filter sidebar + table +
 * detail panel.
 *
 * @param {object} config SPARC route config
 * @param {object} opts { title, subtitle, emptyTitle, emptyBody, classPrefix }
 * @returns {Promise<[object, object]>} [navbar, contentArea]
 */
export async function createExternalMailListView(config, {
  title,
  subtitle,
  emptyTitle,
  emptyBody,
  classPrefix,
}) {
  config.setRouteTitle(title)

  const siteApi = new SiteApi()

  // Hidden container the print helpers populate before window.print().
  const printContainer = new Container([], { class: 'mail-labels__print-container' })

  // Detail-panel actions shared with the internal search (same status -> same
  // buttons). After a delete, drop the row locally instead of refetching every list.
  const { actions: detailActions, dialog: deleteDialog } = createSearchPanelActions({
    printContainer,
    onDeleted: (pkg) => {
      allItems = allItems.filter((p) => p !== pkg)
      applyFilters()
    },
  })

  // Both lists are always fetched; `mailTypes` controls which are shown. Tracked
  // mail is always visible; untracked (logged) mail is hidden by default and
  // revealed by a single toggle.
  const TRACKED_LISTS = [LIST_EXTERNAL_PACKAGES, LIST_EXTERNAL_LOG]

  const filters = {
    tracking: '',
    itemTrackingId: '',
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
  // Map<headerTrackingNumber, item[]> -- full item objects for search + export.
  let groupedItems = new Map()
  // Map<headerTrackingNumber, normalizedId[]> -- derived search index.
  let itemIndex = new Map()

  const { show: showDetailPanel } = createPackageDetailPanel({
    showSmartCardId: true,
    actions: detailActions,
  })
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
      // When a tracking-based search is active (header or item), the lookup is
      // global -- skip the date-range client check so out-of-range matches remain
      // visible. Without this, older collections are silently filtered out.
      if (!filters.tracking && !filters.itemTrackingId) {
        const dateToCheck = pkg.SubmissionDate || pkg.Created
        if (dateToCheck) {
          if (fromDate && __dayjs(dateToCheck).isBefore(fromDate, 'day')) return false
          if (toDate && __dayjs(dateToCheck).isAfter(toDate, 'day')) return false
        }
      }
      if (filters.tracking && !String(pkg.Title ?? '').toLowerCase().includes(filters.tracking)) return false
      if (filters.itemTrackingId) {
        // Match the collection if any of its line items' external carrier ids
        // contains the query. Only tracked collections are indexed; log rows
        // have no items so they never match (correct -- they carry no carrier id).
        // Also check header-level ExternalTrackingId (legacy headers may have it).
        const ids = itemIndex.get(String(pkg.Title ?? ''))
        const matchItems = ids && ids.some((id) => id.includes(filters.itemTrackingId))
        const matchHeader = normalizeSearchText(pkg.ExternalTrackingId).includes(filters.itemTrackingId)
        if (!matchItems && !matchHeader) return false
      }
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
    const resultCount = new Text(pluralize(filtered.length, 'result'), {
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

  const { group: categoryGroup, comboBox: categoryComboBox } = createMultiSelectFilter({
    label: 'Category',
    options: categoryOptions,
    placeholder: 'Select category...',
    onChange: (values) => { filters.category = values; applyFilters() },
  })

  const directionOptions = [
    { label: DIRECTION_LABELS[MAIL_DIRECTIONS.INCOMING], value: MAIL_DIRECTIONS.INCOMING },
    { label: DIRECTION_LABELS[MAIL_DIRECTIONS.OUTGOING], value: MAIL_DIRECTIONS.OUTGOING },
  ]
  const { group: directionGroup, comboBox: directionComboBox } = createMultiSelectFilter({
    label: 'Direction',
    options: directionOptions,
    placeholder: 'Select direction...',
    allowFiltering: false,
    onChange: (values) => { filters.direction = values; applyFilters() },
  })

  // Item (carrier) tracking id. TextInput debounces value-sync into its FormField;
  // subscribing fires post-debounce (same pattern as the header Tracking Number).
  const ITEM_ID_DEBOUNCE_MS = 200
  const itemIdField = new FormField({ value: '' })
  const itemIdInput = new TextInput(itemIdField, {
    placeholder: 'e.g. RR123456789PT',
    debounceMs: ITEM_ID_DEBOUNCE_MS,
  })
  itemIdField.subscribe(() => {
    filters.itemTrackingId = normalizeSearchText(itemIdField.value)
    applyFilters()
  })
  const itemIdGroup = filterGroup(EXTERNAL_TRACKING_ID_LABEL, itemIdInput, { tooltip: TOOLTIPS.filters.carrierTrackingNumber })

  // Single toggle: untracked (logged) mail is hidden by default; checking it adds
  // the log list to the shown set. Tracked mail is always shown.
  const showUntrackedField = new FormField({ value: false })
  showUntrackedField.subscribe((show) => {
    filters.mailTypes = show ? TRACKED_LISTS : [LIST_EXTERNAL_PACKAGES]
    applyFilters()
  })
  const showUntrackedCheck = new CheckBox(showUntrackedField)
  const typeGroup = new Container([
    new FieldLabel('Include logged (untracked) mail', showUntrackedCheck, { position: 'right', tooltip: TOOLTIPS.externalForms.includeLogged }),
  ], { class: `posthub__filter-group posthub__checkbox-option ${classPrefix}__type-filter` })

  // Build the shared filter grid, appending external-only groups so every filter
  // flows uniformly in the same top bar (internal + external share this structure).
  const { filterGrid, buttonRowSlot, clearAll } = createPackageFilters({
    filters,
    locationOptions,
    options: {
      includeTracking: true,
      searchHint: findMailHint(`a tracking number or ${EXTERNAL_TRACKING_ID_LABEL.toLowerCase()}`),
      periodLabel: 'Received Between',
      periodTooltip: TOOLTIPS.filters.receivedBetween,
    },
    onFilterChange: applyFilters,
    onDateChange: () => applyFilters(),
    searchGroups: [itemIdGroup],
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
      filters.itemTrackingId = ''
      itemIdField.value = ''
      itemIdInput.render()
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
          const headerRows = externalMailRows(filtered, groupedItems)
          const itemRows = collectionItemRows(filtered, groupedItems, filters)
          await downloadWorkbook([
            { name: 'External Mail', rows: headerRows },
            { name: 'Collection Items', rows: itemRows },
          ], `posthub-external-mail-${__dayjs().format('YYYYMMDD-HHmmss')}.xlsx`)
        } catch (err) {
          console.error('[external-search] export failed', err)
          Toast.error('Could not export. Please try again.')
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

  ;[allItems, groupedItems] = await Promise.all([
    fetchItemsAcrossLists(siteApi, TRACKED_LISTS),
    loadGroupedExternalItems(siteApi),
  ])
  itemIndex = buildItemTrackingIndex(groupedItems)
  applyFilters()

  return [navbar, contentArea, deleteDialog]
}
