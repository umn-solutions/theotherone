import {
  defineRoute,
  Container,
  Text,
  Button,
  ComboBox,
  LinkButton,
  DateRangeInput,
  getIcon,
  Toast,
  FormField,
  SiteApi,
  CurrentUser,
  Loader,
  __dayjs,
} from '../../libs/nofbiz/nofbiz.base.js'

import { createNavbar } from '../../components/navbar.js'
import { createPackageDetailPanel } from '../../components/packageDetailPanel.js'
import { LIST_PACKAGES, LIST_LOCATIONS, STATUS_LABELS } from '../../utils/constants.js'
import { getUserDisplayName, getLocationValue } from '../../utils/user-helpers.js'
import { createPackageTable } from '../../utils/package-table.js'
import {
  trackingIdColumn, statusBadgeColumn, currentLocationColumn,
  destinationColumn, senderColumn, recipientColumn, dateColumn,
} from '../../utils/package-table-columns.js'
import { extractSelection } from '../../utils/filter-helpers.js'
import { createEmptyState } from '../../utils/empty-state.js'
import { DAYJS_FORMAT, parseFilterDate, toISOStart, toISOEnd, defaultDateFrom, defaultDateTo } from '../../utils/date-helpers.js'

export default defineRoute((config) => {
  config.setRouteTitle('My Mail')

  const siteApi = new SiteApi()
  const user = new CurrentUser()
  const currentUserEmail = user.get('email')

  // --- State ---

  let allMyPackages = []
  let filteredPackages = []
  let viewMode = 'sent'
  let dateDebounceTimer = null
  const filters = {
    status: [],
    senderRecipient: [],
    trackingId: [],
    currentLocation: [],
    destination: [],
    dateFrom: defaultDateFrom(),
    dateTo: defaultDateTo(),
  }

  const { show: showDetailPanel } = createPackageDetailPanel()
  const navbar = createNavbar()

  // --- CAML query builder ---

  function buildMyMailCaml(from, to) {
    const fromISO = toISOStart(from)
    const toISO = toISOEnd(to)

    // User filter: SenderEmail=user OR RecipientEmail=user
    const userClause =
      `<Or>` +
        `<Eq><FieldRef Name='SenderEmail'/><Value Type='Text'>${currentUserEmail}</Value></Eq>` +
        `<Eq><FieldRef Name='RecipientEmail'/><Value Type='Text'>${currentUserEmail}</Value></Eq>` +
      `</Or>`

    // Date filter: (SubmissionDate>=start AND SubmissionDate<=end) OR SubmissionDate is empty (pending packages)
    let dateClause = ''
    if (fromISO && toISO) {
      const rangeClause =
        `<And>` +
          `<Geq><FieldRef Name='SubmissionDate'/><Value Type='Text'>${fromISO}</Value></Geq>` +
          `<Leq><FieldRef Name='SubmissionDate'/><Value Type='Text'>${toISO}</Value></Leq>` +
        `</And>`
      const emptyClause = `<Eq><FieldRef Name='SubmissionDate'/><Value Type='Text'></Value></Eq>`
      dateClause = `<Or>${rangeClause}${emptyClause}</Or>`
    }

    const where = dateClause
      ? `<And>${userClause}${dateClause}</And>`
      : userClause

    return `<View><Query><Where>${where}</Where></Query></View>`
  }

  // --- Data fetching ---

  async function fetchPackages(from, to) {
    const caml = buildMyMailCaml(from, to)
    const loading = Toast.loading('Loading mail...')
    try {
      allMyPackages = await siteApi.list(LIST_PACKAGES).getItems(caml)
      loading.dismiss()
    } catch {
      loading.error('Failed to load mail')
    }
    clearClientFilters()
    rebuildDatasets()
    applyFilters()
  }

  // --- View mode helpers ---

  function getBasePackages() {
    return allMyPackages.filter(pkg =>
      viewMode === 'sent' ? pkg.SenderEmail === currentUserEmail : pkg.RecipientEmail === currentUserEmail
    )
  }

  // --- ComboBox datasets ---

  function rebuildDatasets() {
    const base = getBasePackages()

    const statuses = [...new Set(base.map(p => p.Status))]
    statusComboBox.dataset = statuses.map(s => ({ label: STATUS_LABELS[s], value: s }))

    const emailMap = new Map()
    base.forEach(p => {
      ;[
        { email: p.SenderEmail, display: getUserDisplayName(p.Sender) },
        { email: p.RecipientEmail, display: getUserDisplayName(p.Recipient) },
      ].forEach(({ email, display }) => {
        if (email && email !== currentUserEmail && !emailMap.has(email)) {
          emailMap.set(email, display)
        }
      })
    })
    senderRecipientComboBox.dataset = [...emailMap].map(([email, name]) => ({
      label: name, value: email
    }))

    trackingIdComboBox.dataset = base.map(p => ({ label: p.Title, value: p.Title }))
  }

  // --- Filter logic ---

  function applyFilters() {
    const fromDate = parseFilterDate(filters.dateFrom)
    const toDate = parseFilterDate(filters.dateTo)

    filteredPackages = getBasePackages().filter(pkg => {
      // Dev-mode safeguard: spInterceptor ignores CAML, so double-check dates client-side
      // Pending packages have no SubmissionDate -- fall back to Created date
      const dateToCheck = pkg.SubmissionDate || pkg.Created
      if (dateToCheck) {
        if (fromDate && __dayjs(dateToCheck).isBefore(fromDate, 'day')) return false
        if (toDate && __dayjs(dateToCheck).isAfter(toDate, 'day')) return false
      }

      if (filters.status.length > 0 && !filters.status.includes(pkg.Status)) return false
      if (filters.senderRecipient.length > 0) {
        if (!filters.senderRecipient.includes(pkg.SenderEmail) && !filters.senderRecipient.includes(pkg.RecipientEmail)) return false
      }
      if (filters.trackingId.length > 0 && !filters.trackingId.includes(pkg.Title)) return false
      if (filters.currentLocation.length > 0 && !filters.currentLocation.includes(getLocationValue(pkg.CurrentLocation))) return false
      if (filters.destination.length > 0 && !filters.destination.includes(getLocationValue(pkg.DestinationLocation))) return false
      return true
    })

    updateTable()
  }

  function clearClientFilters() {
    filters.status = []
    filters.senderRecipient = []
    filters.trackingId = []
    filters.currentLocation = []
    filters.destination = []
    statusComboBox.clearSelection()
    senderRecipientComboBox.clearSelection()
    trackingIdComboBox.clearSelection()
    currentLocationComboBox.clearSelection()
    destinationComboBox.clearSelection()
  }

  function clearFilters() {
    filters.dateFrom = defaultDateFrom()
    filters.dateTo = defaultDateTo()
    dateStartField.value = filters.dateFrom
    dateEndField.value = filters.dateTo
    clearClientFilters()
    clearTimeout(dateDebounceTimer)
    fetchPackages(filters.dateFrom, filters.dateTo)
  }

  // --- Page header ---

  const pageHeader = new Container([
    new Container([
      new Container([
        new LinkButton(getIcon('arrow-go-back-line'), '/', {
          class: 'posthub__home-icon'
        }),
        new Text('My Mail', {
          type: 'h1',
          class: 'posthub__page-title'
        }),
      ], { class: 'posthub__title-with-icon' }),
      new Text('Check both mail you sent, and are waiting to receive', {
        type: 'p',
        class: 'posthub__page-subtitle'
      }),
    ], { class: 'my-mail__title-section' }),
  ], { class: 'posthub__page-header' })

  // --- View mode tabs ---

  const sentTab = new Button('Sent', {
    onClickHandler: () => switchViewMode('sent'),
    class: 'my-mail__tab my-mail__tab--active',
  })
  const incomingTab = new Button('Incoming', {
    onClickHandler: () => switchViewMode('incoming'),
    class: 'my-mail__tab',
  })
  const viewDescription = new Text('Showing mail addressed to you', {
    type: 'p',
    class: 'my-mail__view-description',
  })

  function switchViewMode(mode) {
    if (viewMode === mode) return
    viewMode = mode
    clearClientFilters()
    rebuildDatasets()
    applyFilters()

    const isIncoming = mode === 'incoming'
    incomingTab.instance?.toggleClass('my-mail__tab--active', isIncoming)
    sentTab.instance?.toggleClass('my-mail__tab--active', !isIncoming)
    viewDescription.children = isIncoming
      ? 'Showing mail addressed to you'
      : 'Showing mail you sent'
    personFilterLabel.children = isIncoming ? 'Sender' : 'Recipient'
  }

  // --- Date range filter ---

  const dateStartField = new FormField({ value: filters.dateFrom })
  const dateEndField = new FormField({ value: filters.dateTo })
  const dateRangeInput = new DateRangeInput(dateStartField, dateEndField, {
    format: 'dd-mm-yyyy',
    rules: { maxDays: 31 },
  })

  dateStartField.subscribe((val) => {
    if (val === filters.dateFrom) return
    filters.dateFrom = val
    clearTimeout(dateDebounceTimer)
    dateDebounceTimer = setTimeout(() => fetchPackages(filters.dateFrom, filters.dateTo), 300)
  })

  dateEndField.subscribe((val) => {
    if (val === filters.dateTo) return
    filters.dateTo = val
    clearTimeout(dateDebounceTimer)
    dateDebounceTimer = setTimeout(() => fetchPackages(filters.dateFrom, filters.dateTo), 300)
  })

  // --- ComboBox filters ---

  const statusField = new FormField({ value: [] })
  const statusComboBox = new ComboBox(statusField, [], {
    allowMultiple: true,
    allowFiltering: false,
    allowCreate: false,
    placeholder: 'Select status...',
    onSelectHandler: (selection) => { filters.status = extractSelection(selection); applyFilters() },
  })

  const senderRecipientField = new FormField({ value: [] })
  const senderRecipientComboBox = new ComboBox(senderRecipientField, [], {
    allowMultiple: true,
    allowFiltering: true,
    allowCreate: false,
    placeholder: 'Search sender/recipient...',
    onSelectHandler: (selection) => { filters.senderRecipient = extractSelection(selection); applyFilters() },
  })

  const trackingIdField = new FormField({ value: [] })
  const trackingIdComboBox = new ComboBox(trackingIdField, [], {
    allowMultiple: true,
    allowFiltering: true,
    allowCreate: false,
    placeholder: 'Search tracking ID...',
    onSelectHandler: (selection) => { filters.trackingId = extractSelection(selection); applyFilters() },
  })

  const currentLocationField = new FormField({ value: [] })
  const currentLocationComboBox = new ComboBox(currentLocationField, [], {
    allowMultiple: true,
    allowFiltering: true,
    allowCreate: false,
    placeholder: 'Select current location...',
    onSelectHandler: (selection) => { filters.currentLocation = extractSelection(selection); applyFilters() },
  })

  const destinationField = new FormField({ value: [] })
  const destinationComboBox = new ComboBox(destinationField, [], {
    allowMultiple: true,
    allowFiltering: true,
    allowCreate: false,
    placeholder: 'Select destination...',
    onSelectHandler: (selection) => { filters.destination = extractSelection(selection); applyFilters() },
  })

  // --- Results area ---

  const resultsContainer = new Container([], { class: 'my-mail__results' })

  function updateTable() {
    if (filteredPackages.length === 0) {
      resultsContainer.children = [createEmptyState('No mail found', 'No results match your current filters. Try adjusting the date range or clearing some filters.')]
      return
    }

    const resultCount = new Text(`${filteredPackages.length} mail item(s)`, {
      type: 'p',
      class: 'my-mail__result-count',
    })

    const columns = [
      dateColumn('Dispatched On', 'SubmissionDate'),
      statusBadgeColumn(),
      currentLocationColumn(),
      destinationColumn(),
      viewMode === 'incoming' ? senderColumn() : recipientColumn(),
      trackingIdColumn(),
    ]

    const table = createPackageTable({
      columns,
      packages: filteredPackages,
      onRowClick: showDetailPanel,
      tableClass: 'my-mail__table',
    })

    resultsContainer.children = [resultCount, table]
  }

  // --- Sidebar filter section ---

  const personFilterLabel = new Text('Sender', { type: 'label', class: 'my-mail__filter-label' })

  const filterSection = new Container([
    new Container([
      new Container([
        new Container([sentTab, incomingTab], { class: 'my-mail__tabs' }),
        viewDescription,
      ], { class: 'my-mail__view-toggle' }),

      new Container([
        new Text('Dispatched Date', { type: 'label', class: 'my-mail__filter-label' }),
        dateRangeInput,
      ], { class: 'my-mail__filter-group' }),

      new Container([
        new Text('Status', { type: 'label', class: 'my-mail__filter-label' }),
        statusComboBox,
      ], { class: 'my-mail__filter-group' }),

      new Container([
        new Text('Current Location', { type: 'label', class: 'my-mail__filter-label' }),
        currentLocationComboBox,
      ], { class: 'my-mail__filter-group' }),

      new Container([
        new Text('Destination', { type: 'label', class: 'my-mail__filter-label' }),
        destinationComboBox,
      ], { class: 'my-mail__filter-group' }),

      new Container([
        personFilterLabel,
        senderRecipientComboBox,
      ], { class: 'my-mail__filter-group' }),

      new Container([
        new Text('Tracking ID', { type: 'label', class: 'my-mail__filter-label' }),
        trackingIdComboBox,
      ], { class: 'my-mail__filter-group' }),
    ], { class: 'my-mail__filter-grid' }),

    new Container([
      new Button('Clear Filters', { onClickHandler: clearFilters, variant: 'secondary' }),
    ], { class: 'my-mail__button-row' }),
  ], { class: 'my-mail__filters' })

  // --- Loader overlay ---

  const pageLoader = new Loader(new Text('Loading...'), { animation: 'pulse' })

  // --- Page layout ---

  const bodyArea = new Container([
    filterSection,
    resultsContainer,
    pageLoader,
  ], { class: 'my-mail__body' })

  const contentArea = new Container([
    pageHeader,
    bodyArea,
  ], { class: 'posthub__page-content' })

  // --- Async data load (runs after route returns and DOM renders) ---

  loadData()

  async function loadData() {
    pageLoader.enable()
    let activeLocations = []
    try {
      activeLocations = await siteApi.list(LIST_LOCATIONS).getItems({ IsActive: 'true' })
    } catch {
      Toast.error('Failed to load locations')
    }

    const locationOptions = activeLocations.map(l => l.Title)
    currentLocationComboBox.dataset = locationOptions
    destinationComboBox.dataset = locationOptions

    await fetchPackages(filters.dateFrom, filters.dateTo)
    pageLoader.disable()
  }

  return [navbar, contentArea]
})
