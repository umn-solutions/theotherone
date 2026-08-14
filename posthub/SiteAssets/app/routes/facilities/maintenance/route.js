import {
  defineRoute,
  Container,
  Text,
  Button,
  LinkButton,
  Modal,
  Loader,
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
import { LIST_PACKAGES } from '../../../utils/constants.js'
import { sendChaseEmail } from '../utils/package-actions.js'

export default defineRoute((config) => {
  config.setRouteTitle('Maintenance')

  const navbar = createNavbar()
  const siteApi = new SiteApi()

  // Staleness thresholds (days) that define which packages an action affects.
  const CHASE_STALE_DAYS = 11
  const CLEANUP_STALE_DAYS = 7

  function pluralize(n, word) {
    return `${n} ${word}${n === 1 ? '' : 's'}`
  }

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

  // STUB: stands in for the real per-item workflow step (send one email, delete
  // one record). The simulated latency makes the progress bar observable.
  // Replace each action's `process` with the real ListApi call (already async).
  const simulateWork = () => wait(180)

  // Each action declares how to LOAD its affected packages (read-only), how to
  // present them, and how to PROCESS one item. load() is real; process() is a
  // stub until the workflows are built -- but the preview + progress are real.
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
      load: async () => {
        const cutoff = __dayjs().subtract(CHASE_STALE_DAYS, 'day')
        const items = await siteApi.list(LIST_PACKAGES).getItems({ Status: 'arrived' })
        return items.filter(
          (p) => p.LastModifiedDate && __dayjs(p.LastModifiedDate).isBefore(cutoff),
        )
      },
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
      // TODO: delete `pkg` and its TimelineEntries rows (FK = pkg.Title).
      process: simulateWork,
    },
  ]

  // --- Shared preview modal (reconfigured per action) ---
  let pendingAction = null
  let affectedItems = [] // everything the action matched
  let selectedItems = [] // subset the user kept enabled (what Run acts on)

  const previewTitle = new Text('', { type: 'h2', class: 'maintenance__modal-title' })
  const previewSummary = new Text('', { type: 'p', class: 'maintenance__modal-text' })
  const previewBody = new Container([], { class: 'maintenance__preview-body' })

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
    previewSummary.children = `${selected.length} of ${pluralize(affectedItems.length, pendingAction.noun)} selected`
    runBtn.isDisabled = selected.length === 0
  }

  async function openPreview(action) {
    pendingAction = action
    affectedItems = []
    selectedItems = []
    previewTitle.children = action.title
    previewSummary.children = 'Loading affected items...'
    runBtn.children = action.runLabel
    runBtn.isDisabled = true

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

      // All rows start selected; Run acts on whatever stays toggled on.
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
