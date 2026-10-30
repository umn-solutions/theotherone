import {
  defineRoute,
  Container,
  Text,
  Button,
  LinkButton,
  Modal,
  Loader,
  ComboBox,
  FormField,
  getIcon,
  Toast,
  SiteApi,
  __dayjs,
} from '../../../libs/nofbiz/nofbiz.base.js'

import { createNavbar } from '../../../components/navbar.js'
import { createPackageTable } from '../../../utils/package-table.js'
import {
  trackingIdColumn,
  senderColumn,
  recipientColumn,
  destinationColumn,
  dateColumn,
} from '../../../utils/package-table-columns.js'
import {
  LIST_PACKAGES,
  LIST_EXTERNAL_PACKAGES,
  MAIL_DIRECTIONS,
} from '../../../utils/constants.js'
import { sendChaseEmail, deletePackageWithTimeline } from '../utils/package-actions.js'
import { guardAccess } from '../../../utils/access.js'
import { getLocationValue, getUserEmail } from '../../../utils/user-helpers.js'

export default defineRoute((config) => {
  config.setRouteTitle('Maintenance')

  // Facilities route: admin access required
  if (!guardAccess('ADMIN')) return []

  const navbar = createNavbar()
  const siteApi = new SiteApi()

  // Staleness thresholds (days) that define which packages an action affects.
  const CHASE_STALE_DAYS = 11
  const CLEANUP_STALE_DAYS = 7

  function pluralize(n, word) {
    return `${n} ${word}${n === 1 ? '' : 's'}`
  }

  // Each action declares how to LOAD its affected packages (read-only), how to
  // present them, and how to PROCESS one item.
  const ACTIONS = [
    {
      key: 'chase-emails',
      title: 'Chase Emails',
      description: `Email recipients whose mail has been awaiting pickup for more than ${CHASE_STALE_DAYS} days.`,
      runLabel: 'Send Emails',
      noun: 'recipient',
      emptyText: 'No mail is overdue for pickup. Nothing to chase.',
      columns: () => [
        trackingIdColumn(),
        recipientColumn(),
        destinationColumn(),
        dateColumn('Waiting Since', 'LastModifiedDate'),
      ],
      // Arrived (reached destination, not picked up) and stale beyond threshold.
      // Chases internal mail PLUS external INCOMING mail addressed to an internal
      // (on-platform) recipient. Off-platform subsidiary recipients have no
      // account/email to chase, so they are excluded.
      load: async () => {
        const cutoff = __dayjs().subtract(CHASE_STALE_DAYS, 'day')
        const isStale = (p) => p.LastModifiedDate && __dayjs(p.LastModifiedDate).isBefore(cutoff)

        const internal = await siteApi.list(LIST_PACKAGES).getItems({ Status: 'arrived' })

        const external = await siteApi.list(LIST_EXTERNAL_PACKAGES).getItems({
          Status: 'arrived',
          Direction: MAIL_DIRECTIONS.INCOMING,
        })
        const externalToInternalUser = external.filter(
          (p) =>
            p.OffPlatformRecipient !== true &&
            p.OffPlatformRecipient !== 'true' &&
            (getUserEmail(p.Recipient) || p.RecipientEmail),
        )

        return [...internal, ...externalToInternalUser].filter(isStale)
      },
      locationFilter: true,
      // Sends "ready for pickup since <date>" to the recipient (SPARC sendEmail).
      process: (pkg) => sendChaseEmail(pkg),
    },
    {
      key: 'cleanup',
      title: 'Database Cleanup',
      description: `Remove stale pending mail registered over ${CLEANUP_STALE_DAYS} days ago that was never dropped off.`,
      runLabel: 'Run Cleanup',
      noun: 'stale pending item',
      emptyText: 'No stale pending mail found. Nothing to clean up.',
      columns: () => [
        trackingIdColumn(),
        senderColumn(),
        destinationColumn(),
        dateColumn('Registered', 'Created'),
      ],
      // Pending (registered but never physically dropped off) and stale beyond
      // threshold. Pending packages have no LastModifiedDate, so use Created.
      load: async () => {
        const cutoff = __dayjs().subtract(CLEANUP_STALE_DAYS, 'day')
        const items = await siteApi.list(LIST_PACKAGES).getItems({ Status: 'pending' })
        return items.filter((p) => p.Created && __dayjs(p.Created).isBefore(cutoff))
      },
      process: (pkg) => deletePackageWithTimeline(siteApi, pkg),
    },
  ]

  // --- Shared preview modal (reconfigured per action) ---
  let pendingAction = null
  let affectedItems = [] // everything the action matched
  let selectedItems = [] // subset the user kept enabled (what Run acts on)

  const previewTitle = new Text('', { type: 'h2', class: 'maintenance__modal-title' })
  const previewSummary = new Text('', { type: 'p', class: 'maintenance__modal-text' })
  const previewBody = new Container([], { class: 'maintenance__preview-body' })

  // --- Location filter (chase-emails only) ---
  const ALL_LOCATIONS = 'All locations'
  let filteredItems = [] // affectedItems narrowed by the location filter

  const locationFilterField = new FormField({ value: ALL_LOCATIONS })
  const locationFilterComboBox = new ComboBox(locationFilterField, [], {
    placeholder: 'Filter by destination...',
  })
  const locationFilterContainer = new Container([], {
    class: 'maintenance__location-filter',
  })

  const cancelBtn = new Button('Cancel', {
    variant: 'secondary',
    onClickHandler: () => previewModal.close(),
    class: 'maintenance__modal-cancel-btn',
  })

  const runBtn = new Button('Run', {
    onClickHandler: () => runAction(),
    class: 'maintenance__modal-run-btn',
  })

  const previewModal = new Modal(
    [
      previewTitle,
      new Container(
        [
          previewSummary,
          locationFilterContainer,
          previewBody,
          new Container([cancelBtn, runBtn], { class: 'maintenance__modal-actions' }),
        ],
        { class: 'maintenance__modal-form' },
      ),
    ],
    {
      backdrop: true,
      closeOnFocusLoss: false,
      class: 'maintenance__modal',
    },
  )
  previewModal.render()

  function showEmpty(message) {
    previewBody.children = [
      new Text(message, { type: 'p', class: 'maintenance__empty' }),
    ]
  }

  // Live count + Run state as the user toggles rows on/off.
  function updateSelection(selected) {
    selectedItems = selected
    const totalLabel = locationFilterActive()
      ? `${filteredItems.length} filtered`
      : pluralize(affectedItems.length, pendingAction.noun)
    previewSummary.children = `${selected.length} of ${totalLabel} selected`
    runBtn.isDisabled = selected.length === 0
  }

  locationFilterField.subscribe(() => {
    const raw = locationFilterField.value
    const selected = typeof raw === 'string' ? raw : (raw?.value ?? ALL_LOCATIONS)
    filterAndRenderTable(selected)
  })

  function locationFilterActive() {
    const raw = locationFilterField.value
    const val = typeof raw === 'string' ? raw : (raw?.value ?? ALL_LOCATIONS)
    return val !== ALL_LOCATIONS
  }

  /**
   * Filters affectedItems by destination location, re-renders the table, and
   * resets the selection to the full filtered set (all rows start selected).
   */
  function filterAndRenderTable(locationValue) {
    if (!pendingAction || affectedItems.length === 0) return

    filteredItems = locationValue === ALL_LOCATIONS
      ? affectedItems.slice()
      : affectedItems.filter(
          (pkg) => getLocationValue(pkg.DestinationLocation) === locationValue,
        )

    if (filteredItems.length === 0) {
      previewBody.children = [
        new Text('No items match this location.', { type: 'p', class: 'maintenance__empty' }),
      ]
      updateSelection([])
      return
    }

    selectedItems = filteredItems.slice()
    previewBody.children = [
      createPackageTable({
        columns: pendingAction.columns(),
        packages: filteredItems,
        tableClass: 'maintenance__preview-table',
        selectable: true,
        onSelectionChange: updateSelection,
      }),
    ]
    updateSelection(selectedItems)
  }

  async function openPreview(action) {
    pendingAction = action
    affectedItems = []
    selectedItems = []
    filteredItems = []
    previewTitle.children = action.title
    previewSummary.children = 'Loading affected items...'
    runBtn.children = action.runLabel
    runBtn.isDisabled = true

    // Reset location filter to "All" each time the modal opens.
    locationFilterField.value = ALL_LOCATIONS
    locationFilterContainer.children = []

    const loader = new Loader([], { animation: 'pulse' })
    previewBody.children = [loader]
    previewModal.open()
    loader.enable()

    try {
      affectedItems = await action.load()

      if (affectedItems.length === 0) {
        previewSummary.children = action.emptyText
        showEmpty(action.emptyText)
        return
      }

      // Populate location filter when the action opts in.
      if (action.locationFilter) {
        const distinctLocations = [
          ...new Set(affectedItems.map((p) => getLocationValue(p.DestinationLocation))),
        ].sort()
        locationFilterComboBox.dataset = [ALL_LOCATIONS, ...distinctLocations]
        locationFilterContainer.children = [
          new Text('Destination', { type: 'label', class: 'maintenance__filter-label' }),
          locationFilterComboBox,
        ]
      }

      // All rows start selected; Run acts on whatever stays toggled on.
      filteredItems = affectedItems.slice()
      selectedItems = affectedItems.slice()
      previewBody.children = [
        createPackageTable({
          columns: action.columns(),
          packages: affectedItems,
          tableClass: 'maintenance__preview-table',
          selectable: true,
          onSelectionChange: updateSelection,
        }),
      ]
      updateSelection(selectedItems)
    } catch (err) {
      console.error(`[maintenance] failed to load ${action.key} items`, err)
      previewSummary.children = 'Failed to load affected items'
      showEmpty('Could not load affected items. Close and try again.')
    }
  }

  async function runAction() {
    if (!pendingAction || selectedItems.length === 0) return
    const action = pendingAction
    const items = selectedItems.slice()
    const total = items.length

    runBtn.isLoading = true
    cancelBtn.isDisabled = true

    // Determinate progress bar -- we know the total up front.
    const fill = new Container([], { class: 'maintenance__progress-fill' })
    previewBody.children = [
      new Container([fill], { class: 'maintenance__progress-track' }),
    ]

    let done = 0
    let failed = 0
    const renderProgress = () => {
      previewSummary.children = `Processing ${done} of ${pluralize(total, 'item')}...`
      const pct = total > 0 ? Math.round((done / total) * 100) : 100
      fill.instance?.css('width', `${pct}%`)
    }
    renderProgress()

    try {
      // Process one item at a time so the bar advances. Per-item try/catch keeps
      // one failure from aborting the rest; failures are tallied and reported.
      for (const item of items) {
        try {
          await action.process(item)
        } catch (err) {
          console.error(`[maintenance] ${action.key} failed for ${item.Title}`, err)
          failed++
        }
        done++
        renderProgress()
      }

      if (failed > 0) {
        Toast.warning(`${action.title}: ${total - failed} done, ${failed} failed`)
      } else {
        Toast.success(`${action.title} complete -- ${pluralize(total, 'item')} processed`)
      }
      previewModal.close()
    } finally {
      runBtn.isLoading = false
      cancelBtn.isDisabled = false
      pendingAction = null
      affectedItems = []
      selectedItems = []
      filteredItems = []
    }
  }

  // --- Action cards ---
  const actionCards = ACTIONS.map(
    (action) =>
      new Container(
        [
          new Text(action.title, { type: 'h2', class: 'posthub__card-title' }),
          new Text(action.description, { type: 'p', class: 'posthub__card-description' }),
          new Button(action.runLabel, {
            onClickHandler: () => openPreview(action),
            class: 'posthub__card-btn',
          }),
        ],
        { class: 'posthub__card' },
      ),
  )

  const cardGrid = new Container(actionCards, { class: 'posthub__card-grid' })

  // --- Page header ---
  const pageHeader = new Container(
    [
      new Container(
        [
          new LinkButton(getIcon('arrow-go-back-line'), 'facilities', {
            class: 'posthub__home-icon',
          }),
          new Text('Maintenance', { type: 'h1', class: 'posthub__page-title' }),
        ],
        { class: 'posthub__title-with-icon' },
      ),
      new Text('Preview affected mail, then run admin workflows and cleanup actions', {
        type: 'p',
        class: 'posthub__page-subtitle',
      }),
    ],
    { class: 'posthub__page-header' },
  )

  const body = new Container([cardGrid], { class: 'maintenance__body' })

  const contentArea = new Container([pageHeader, body], { class: 'posthub__page-content' })

  return [navbar, contentArea, previewModal]
})
