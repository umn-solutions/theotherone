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
import {
  LIST_PACKAGES, LIST_LOCATIONS, LIST_EXTERNAL_PACKAGES, LIST_EXTERNAL_LOG,
  STATUS_LABELS, MAIL_DIRECTIONS,
} from '../../utils/constants.js'
import { fetchTaggedItems } from '../../utils/mail-context.js'
import { getUserDisplayName, getUserEmail, getLocationValue } from '../../utils/user-helpers.js'
import { createPackageTable } from '../../utils/package-table.js'
import {
  trackingIdColumn, statusBadgeColumn, currentLocationColumn,
  destinationColumn, senderColumn, recipientColumn, dateColumn,
} from '../../utils/package-table-columns.js'
import { extractSelection } from '../../utils/filter-helpers.js'
import { createEmptyState } from '../../utils/empty-state.js'
import { parseFilterDate, defaultDateFrom, defaultDateTo, buildDateRangeCaml } from '../../utils/date-helpers.js'

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
    // User filter: SenderEmail=user OR RecipientEmail=user
    const userClause =
      `<Or>` +
        `<Eq><FieldRef Name='SenderEmail'/><Value Type='Text'>${currentUserEmail}</Value></Eq>` +
        `<Eq><FieldRef Name='RecipientEmail'/><Value Type='Text'>${currentUserEmail}</Value></Eq>` +
      `</Or>`

    // Date filter via shared helper (SubmissionDate range + empty clause for pending)
    const dateCaml = buildDateRangeCaml(from, to, 'SubmissionDate', true)

    // If buildDateRangeCaml returned a <View>, extract just the <Where> content
    // to combine with the user clause.
    let dateClause = ''
    if (dateCaml) {
      const whereMatch = dateCaml.match(/<Where>([\s\S]*)<\/Where>/)
      if (whereMatch) dateClause = whereMatch[1]
    }

    const where = dateClause
      ? `<And>${userClause}${dateClause}</And>`
      : userClause

    return `<View><Query><Where>${where}</Where></Query></View>`
  }

  // --- Data fetching ---

  // Maps an untracked log row onto the package shape used by the tabs, columns and
  // filters. Direction sets the internal contact's role: outgoing = sender (Sent
  // tab), incoming = recipient (Incoming tab). Original fields are kept for the
  // detail panel. Log rows have no Status or CurrentLocation (no workflow).
  function normalizeLogRow(row) {
    const isOutgoing = row.Direction === MAIL_DIRECTIONS.OUTGOING
    const contactEmail = getUserEmail(row.InternalContact)
    const externalParty = { email: '', displayName: row.ExternalParty || '' }
    return Object.assign(row, {
      Sender: isOutgoing ? row.InternalContact : externalParty,
      SenderEmail: isOutgoing ? contactEmail : '',
      Recipient: isOutgoing ? externalParty : row.InternalContact,
      RecipientEmail: isOutgoing ? '' : contactEmail,
      DestinationLocation: isOutgoing ? row.ExternalParty : row.InternalOffice,
      SubmissionDate: row.Created,
    })
  }

  async function fetchPackages(from, to) {
    const caml = buildMyMailCaml(from, to)
    const loading = Toast.loading('Loading mail...')
    // InternalContact is UserIdentity JSON, so match the email inside it. The date
    // range is applied client-side in applyFilters (log rows have no SubmissionDate).
    const logQuery = { InternalContact: { value: currentUserEmail, operator: 'Contains' } }
    const sources = [
      { list: LIST_PACKAGES, load: () => fetchTaggedItems(siteApi, LIST_PACKAGES, caml) },
      { list: LIST_EXTERNAL_PACKAGES, load: () => fetchTaggedItems(siteApi, LIST_EXTERNAL_PACKAGES, caml) },
      {
        list: LIST_EXTERNAL_LOG,
        load: async () => (await fetchTaggedItems(siteApi, LIST_EXTERNAL_LOG, logQuery)).map(normalizeLogRow),
      },
    ]
    // One failing list must not hide mail from the others.
    const results = await Promise.allSettled(sources.map(s => s.load()))
    const failures = []
    allMyPackages = results.flatMap((result, i) => {
      if (result.status === 'fulfilled') return result.value
      console.error(`[my-mail] load ${sources[i].list} failed`, result.reason)
      failures.push(sources[i].list)
      return []
    })
    // Interleave the lists chronologically (each one alone came back in Id order).
    const rowTime = (p) => __dayjs(p.SubmissionDate || p.Created).valueOf()
    allMyPackages.sort((a, b) => rowTime(a) - rowTime(b))
    if (failures.length === 0) loading.dismiss()
    else if (failures.length === sources.length) loading.error('Failed to load mail')
    else loading.error('Some mail could not be loaded')
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

  // Filter identity for a party. External parties have no email, so use their name.
  const senderKey = (p) => p.SenderEmail || getUserDisplayName(p.Sender)
  const recipientKey = (p) => p.RecipientEmail || getUserDisplayName(p.Recipient)

  function rebuildDatasets() {
    const base = getBasePackages()

    // Log rows have no Status.
    const statuses = [...new Set(base.map(p => p.Status).filter(Boolean))]
    statusComboBox.dataset = statuses.map(s => ({ label: STATUS_LABELS[s], value: s }))

    const partyMap = new Map()
    base.forEach(p => {
      ;[
        { key: senderKey(p), display: getUserDisplayName(p.Sender) },
        { key: recipientKey(p), display: getUserDisplayName(p.Recipient) },
      ].forEach(({ key, display }) => {
        if (key && key !== currentUserEmail && !partyMap.has(key)) {
          partyMap.set(key, display)
        }
      })
    })
    senderRecipientComboBox.dataset = [...partyMap].map(([key, name]) => ({
      label: name, value: key
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
        if (!filters.senderRecipient.includes(senderKey(pkg)) && !filters.senderRecipient.includes(recipientKey(pkg))) return false
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

  // Clear any pending date-debounce on teardown so it can't fire into a
  // torn-down view (fetchPackages writes to resultsContainer).
  config.onCleanup(() => clearTimeout(dateDebounceTimer))

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
    } catch (err) {
      console.error('[my-mail] load locations failed', err)
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
