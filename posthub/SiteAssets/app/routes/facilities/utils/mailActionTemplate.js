import {
  Container,
  Text,
  Button,
  LinkButton,
  Loader,
  Router,
  getIcon,
  Toast,
  SiteApi,
  CurrentUser,
  UserIdentity,
  TextArea,
  FormField,
  FieldLabel,
} from '../../../libs/nofbiz/nofbiz.base.js'

import { createNavbar } from '../../../components/navbar.js'
import { createPackageDetailPanel } from '../../../components/packageDetailPanel.js'
import { STATUS_LABELS } from '../../../utils/constants.js'
import { INTERNAL_MAIL, fetchItemsAcrossLists } from '../../../utils/mail-context.js'
import { createPackageTable } from '../../../utils/package-table.js'
import {
  trackingIdColumn, statusBadgeColumn, currentLocationColumn,
  destinationColumn, senderColumn, recipientColumn, packageDetailsColumn,
} from '../../../utils/package-table-columns.js'
import { getHubLocation, isHubLocationSet } from './hubLocation.js'
import { guardUnsaved } from './unsavedGuard.js'
import { cleanLine, notifyRemovedChars } from '../../../utils/text-field.js'

/**
 * Creates a mail action route with predefined status transition.
 *
 * @param {object} config - SPARC route config from defineRoute
 * @param {object} options
 * @param {string} options.title - Route title (e.g., "Registo")
 * @param {string} options.subtitle - Subtitle text
 * @param {string} options.backRoute - Back button destination
 * @param {string[]} options.expectedStatuses - Accepted input statuses
 * @param {(pkg: object, selectedLocation: string) => string | null} options.getTargetStatus - Returns new status, or null to skip
 * @param {(pkg: object, newStatus: string, now: string) => object} [options.extraUpdateFields] - Additional fields for updateItem
 * @param {boolean} [options.requireSmartCard=false] - When true, prompt for smart-card scan before bulk update; value is written to SmartCardId on each package
 * @param {(pkg: object, targetStatus: string) => boolean} [options.smartCardWhen] - Per-item smart-card predicate; when provided it replaces the blanket requireSmartCard. The card is prompted once if ANY scanned item needs it, and written only to items for which this returns true.
 * @param {(results: {pkg: object, newStatus: string}[], helpers: { printContainer: object }) => void | Promise<void>} [options.afterUpdate] - Called after the bulk update with the updated items + a hidden print container; used e.g. to print a document for a transition.
 * @param {(pkg: object) => boolean} [options.requiresIndividual] - Items matching this cannot be bulk-processed. If any is scanned alongside other items, only these are shown with a blocking message (no bulk update).
 * @param {string} [options.individualMessage] - Message shown when a bulk scan is blocked by requiresIndividual items.
 * @param {object} [options.ctx=INTERNAL_MAIL] - Mail context (which lists/timeline/hub path). Defaults to internal mail.
 * @returns {Promise<[object, object]>} [navbar, contentArea]
 */
export async function createMailActionRoute(config, {
  title,
  subtitle,
  backRoute,
  expectedStatuses,
  getTargetStatus,
  extraUpdateFields,
  requireSmartCard = false,
  smartCardWhen = null,
  afterUpdate = null,
  requiresIndividual = null,
  individualMessage = 'Some scanned items must be processed one at a time and cannot be included in a bulk update. Scan them individually.',
  ctx = INTERNAL_MAIL,
}) {
  config.setRouteTitle(title)

  // Guard: redirect to hub if location not set
  if (!isHubLocationSet()) {
    Toast.warning('Please select your current location first')
    Router.navigateTo(ctx.basePath)
    return [new Container([]), new Container([])]
  }

  const siteApi = new SiteApi()
  const user = new CurrentUser()

  // State
  let scannedPackages = []
  let scanDebounceTimer = null
  let scanMode = 'qr'
  let smartCardValue = null
  let smartCardResolver = null

  // Unsaved-work guard: scanned items exist only in memory until the operator
  // presses "Update All". Warn before any navigation (and on tab close/refresh)
  // while items are scanned but unsaved, so a scan session is never lost silently.
  // Cleared automatically on route teardown (see guardUnsaved).
  guardUnsaved(
    config,
    () => scannedPackages.length > 0,
    () => `You have ${scannedPackages.length} scanned mail item(s) that have not been saved yet. Leave without saving?`,
  )

  // Page loader (full-page overlay during async operations).
  // Rendered via contentArea below -- enable()/disable() are no-ops until then,
  // so we never toggle at construction time (avoids a not-alive warning).
  const pageLoader = new Loader(new Text('Scanning...'), { animation: 'pulse' })
  let loaderVisible = false

  function showLoader() {
    if (loaderVisible) return
    loaderVisible = true
    pageLoader.enable()
  }

  function hideLoader() {
    if (!loaderVisible) return
    loaderVisible = false
    pageLoader.disable()
  }

  let updateAllBtn = null

  // Batch note: one input, written to every scanned item's timeline entry.
  // Bound to a persistent FormField so the typed value survives re-renders as
  // more items are scanned in (each scan re-runs updateView).
  const NOTE_MAX_LENGTH = 255
  const noteField = new FormField({ value: '' })

  // Package detail panel
  const { show: showDetailPanel } = createPackageDetailPanel({ showSmartCardId: true })

  // Navbar
  const navbar = createNavbar()

  // Page header
  const pageHeader = new Container([
    new Container([
      new LinkButton(getIcon('arrow-go-back-line'), backRoute, {
        class: 'posthub__home-icon'
      }),
      new Text(title, {
        type: 'h1',
        class: 'posthub__page-title'
      }),
    ], { class: 'posthub__title-with-icon' }),
    new Text(subtitle, {
      type: 'p',
      class: 'posthub__page-subtitle'
    }),
  ], { class: 'posthub__page-header' })

  // Table container
  const tableContainer = new Container([], { class: 'posthub__table-container' })

  // Hidden textarea for scanner input
  const hiddenTextareaContainer = new Container([], { class: 'posthub__hidden-textarea-wrapper' })
  hiddenTextareaContainer.children = '<textarea class="posthub__hidden-textarea" aria-label="Scanner input"></textarea>'

  function getTextarea() {
    return document.querySelector('.posthub__hidden-textarea')
  }

  function focusTextarea() {
    const ta = getTextarea()
    if (ta) ta.focus()
  }

  function attachScanListeners() {
    setTimeout(() => {
      const ta = getTextarea()
      if (!ta) return
      ta.addEventListener('paste', handlePaste)
      ta.addEventListener('input', handleScanInput)
      ta.focus()
    }, 100)
  }

  function handleScanInput() {
    clearTimeout(scanDebounceTimer)
    showLoader()
    scanDebounceTimer = setTimeout(() => {
      const ta = getTextarea()
      if (!ta || !ta.value.trim()) {
        hideLoader()
        return
      }
      const value = ta.value
      ta.value = ''
      if (scanMode === 'smartcard') {
        handleSmartCardInput(value.trim())
      } else {
        processScanData(value)
      }
    }, 1000)
  }

  function handleSmartCardInput(rawValue) {
    hideLoader()
    if (!rawValue) return
    if (smartCardResolver) {
      const resolve = smartCardResolver
      smartCardResolver = null
      scanMode = 'qr'
      resolve(rawValue)
    }
  }

  function processScanData(text) {
    if (!text || !text.trim()) return

    const chunks = text.trim().replace(/\}\s*\{/g, '}\n{').split('\n')
    const parsed = []
    let parseErrors = 0

    for (const chunk of chunks) {
      const trimmed = chunk.trim()
      if (!trimmed) continue
      try {
        const data = JSON.parse(trimmed)
        if (data.TrackingNumber) parsed.push(data)
        else parseErrors++
      } catch (err) {
        console.warn('[mailAction] scan chunk parse failed', { chunk: trimmed, err })
        parseErrors++
      }
    }

    if (parseErrors > 0) {
      Toast.warning(`${parseErrors} line(s) could not be parsed`)
    }

    if (parsed.length === 0) {
      Toast.warning('No valid mail found in scanned data')
      hideLoader()
      return
    }

    matchAndAddPackages(parsed)
  }

  function handleRefocusClick(e) {
    const target = e.target
    const isInteractive = target.closest('button, select, input, textarea:not(.posthub__hidden-textarea), a, .nofbiz__combobox')
    if (!isInteractive) focusTextarea()
  }

  function attachRefocusListener() {
    setTimeout(() => {
      document.addEventListener('click', handleRefocusClick)
    }, 100)
  }

  // Leak fix: this click listener lives on `document`, not on a SPARC component,
  // so Router teardown never removes it. Without explicit cleanup, every visit to
  // a mail-action route stacks another permanent handler pinning the whole route
  // closure. Also clear any pending scan debounce so it cannot fire into a dead view.
  config.onCleanup(() => {
    document.removeEventListener('click', handleRefocusClick)
    clearTimeout(scanDebounceTimer)
  })

  function handlePaste(e) {
    e.preventDefault()
    const text = e.clipboardData.getData('text')
    showLoader()
    const ta = getTextarea()
    if (ta) ta.value = ''
    if (scanMode === 'smartcard') {
      handleSmartCardInput(text.trim())
    } else {
      processScanData(text)
    }
  }

  async function matchAndAddPackages(parsedEntries) {
    const existingIds = new Set(scannedPackages.map(p => p.Title))
    let added = 0

    try {
      const allPackages = await fetchItemsAcrossLists(siteApi, ctx.listNames)

      for (const entry of parsedEntries) {
        if (existingIds.has(entry.TrackingNumber)) continue

        const match = allPackages.find(p => p.Title === entry.TrackingNumber)
        if (!match) continue

        // Validate status -- skip with warning instead of blocking
        if (!expectedStatuses.includes(match.Status)) {
          Toast.warning(
            `${match.Title} skipped -- status "${STATUS_LABELS[match.Status]}" ` +
            `not accepted by ${title}`
          )
          continue
        }

        scannedPackages.push({ ...match })
        existingIds.add(match.Title)
        added++
      }

      if (added === 0) {
        Toast.warning('No new matching mail found')
      } else {
        Toast.success(`${added} mail item(s) scanned`)
      }
    } catch (err) {
      console.error('[mailAction] failed to load/match scanned mail', err)
      Toast.error('Failed to load mail')
    } finally {
      hideLoader()
    }

    updateView()
  }

  function requestSmartCardScan() {
    return new Promise((resolve) => {
      scanMode = 'smartcard'
      smartCardResolver = resolve

      const cancelBtn = new Button('Cancel', {
        onClickHandler: () => {
          if (smartCardResolver) {
            const r = smartCardResolver
            smartCardResolver = null
            scanMode = 'qr'
            r(null)
          }
        },
        class: 'posthub__scan-btn'
      })

      const prompt = new Container([
        new Container([
          new Text('Digital Signature Required', {
            type: 'h2',
            class: 'posthub__prompt-title'
          }),
          new Text('Ask recipient to pass their smart card on the reader', {
            type: 'p',
            class: 'posthub__prompt-subtitle'
          }),
          cancelBtn,
        ], { class: 'posthub__prompt-content' }),
      ], { class: 'posthub__prompt posthub__prompt--signature' })

      tableContainer.children = [prompt, hiddenTextareaContainer]
      attachScanListeners()
    })
  }

  async function handleBulkUpdate() {
    const newLocation = getHubLocation()

    // Per-item target + smart-card decision, computed BEFORE any prompt so the
    // prompt only appears when a scanned item actually needs a card.
    const needsCard = (pkg, target) =>
      smartCardWhen ? !!smartCardWhen(pkg, target) : requireSmartCard
    const plan = scannedPackages.map((pkg) => ({ pkg, target: getTargetStatus(pkg, newLocation) }))
    const anyNeedsCard = plan.some(({ pkg, target }) => target !== null && needsCard(pkg, target))

    if (anyNeedsCard) {
      const card = await requestSmartCardScan()
      if (!card) {
        Toast.info('Delivery cancelled')
        updateView()
        return
      }
      smartCardValue = card
    }

    const comment = cleanLine(noteField.value)
    if (comment.length > NOTE_MAX_LENGTH) {
      Toast.error(`Note must be ${NOTE_MAX_LENGTH} characters or fewer`)
      return
    }
    notifyRemovedChars({ Note: noteField.value })

    if (updateAllBtn) updateAllBtn.isLoading = true
    const loading = Toast.loading('Updating mail...')

    try {
      const changedBy = UserIdentity.fromCurrentUser(user)
      const statusCounts = {}
      const updatedResults = []
      const failedItems = []
      let updatedCount = 0
      let skippedCount = 0

      // Update each item independently: one failure (e.g. a 412 concurrency
      // conflict) must NOT abort the whole batch and hide which items saved.
      // Failed items are collected and kept scanned so the operator can retry.
      for (const { pkg, target: newStatus } of plan) {
        if (newStatus === null) {
          skippedCount++
          continue
        }

        const now = new Date().toISOString()
        const updateFields = {
          Status: newStatus,
          CurrentLocation: newLocation,
          LastModifiedDate: now,
        }

        if (extraUpdateFields) {
          Object.assign(updateFields, extraUpdateFields(pkg, newStatus, now))
        }

        if (smartCardValue && needsCard(pkg, newStatus)) {
          updateFields.SmartCardId = smartCardValue
        }

        try {
          await siteApi.list(pkg.__listName || ctx.primaryList).updateItem(pkg.Id, updateFields, pkg['odata.etag'])

          const timelineEntry = {
            Title: pkg.Title,
            Status: newStatus,
            Location: newLocation,
            ChangedBy: changedBy,
          }
          if (comment) timelineEntry.Notes = comment

          await siteApi.list(ctx.timelineList).createItem(timelineEntry)

          // Reflect the new state locally only after the write actually succeeded.
          // Mirror every written field (incl. SmartCardId), so the detail panel
          // opened after the update shows the scanned card.
          Object.assign(pkg, updateFields)
          statusCounts[newStatus] = (statusCounts[newStatus] || 0) + 1
          updatedResults.push({ pkg, newStatus })
          updatedCount++
        } catch (err) {
          console.error('[mailAction] update failed for', pkg.Title, err)
          failedItems.push(pkg)
        }
      }

      // Post-update hook (e.g. print a signature document for handed-off items).
      // Isolated so a print failure never breaks the confirmed status change -- but
      // the failure MUST be visible: the physical courier document did not print.
      if (afterUpdate && updatedResults.length) {
        try {
          await afterUpdate(updatedResults, { printContainer })
        } catch (err) {
          console.error('[mailAction] afterUpdate hook failed', err)
          Toast.warning('Mail updated, but a follow-up document failed to print. Reprint it manually.')
        }
      }

      const summary = Object.entries(statusCounts)
        .map(([status, count]) => `${count} ${STATUS_LABELS[status].toLowerCase()}`)
        .join(', ')

      const skippedMsg = skippedCount > 0 ? `, ${skippedCount} skipped (wrong destination)` : ''

      if (failedItems.length === 0) {
        // Everything saved -- clear scanned items, disarming the unsaved guard.
        scannedPackages = []
        loading.success(`${updatedCount} mail item(s) updated${skippedMsg}`)

        tableContainer.children = [
          new Container([
            new Text('Update Confirmed', {
              type: 'h2',
              class: 'posthub__prompt-title'
            }),
            new Text(`${updatedCount} mail item(s) updated: ${summary}${skippedMsg}.`, {
              type: 'p',
              class: 'posthub__prompt-subtitle'
            }),
            new Button('Scan More', {
              onClickHandler: () => {
                scannedPackages = []
                smartCardValue = null
                hideLoader()
                noteField.value = ''
                updateView()
                attachScanListeners()
              },
              class: 'posthub__scan-btn'
            }),
          ], { class: 'posthub__confirmation' }),
        ]
      } else {
        // Partial (or total) failure. Re-fetch fresh copies of the failed items
        // so a retry carries the CURRENT etag + server state -- the stale etag
        // held on the original scan is what causes a 412 to repeat forever.
        // Falls back to the stale copies if the refresh itself fails (logged),
        // so the operator still sees what did not save.
        const failedList = failedItems.map((p) => p.Title).join(', ')
        try {
          const failedTitles = new Set(failedItems.map((p) => p.Title))
          const fresh = await fetchItemsAcrossLists(siteApi, ctx.listNames)
          const byTitle = new Map(
            fresh.filter((p) => failedTitles.has(p.Title)).map((p) => [p.Title, p])
          )
          // Preserve order; drop any that vanished server-side (nothing to retry).
          scannedPackages = failedItems.map((p) => byTitle.get(p.Title)).filter(Boolean)
        } catch (err) {
          console.error('[mailAction] failed to refresh failed items for retry', err)
          scannedPackages = failedItems
        }

        loading.error(
          updatedCount > 0
            ? `${updatedCount} updated${skippedMsg}, ${failedItems.length} failed: ${failedList}. Press Update All to retry.`
            : `Could not save: ${failedList}. Press Update All to retry.`
        )
        updateView()
      }
    } catch (err) {
      console.error('[mailAction] bulk update failed', err)
      loading.error('Failed to update mail')
    } finally {
      if (updateAllBtn) updateAllBtn.isLoading = false
      smartCardValue = null
    }
  }

  function updateView() {
    if (scannedPackages.length === 0) {
      const prompt = new Container([
        new Container([
          new Text('Waiting for QR Scan', {
            type: 'h2',
            class: 'posthub__prompt-title'
          }),
          new Text('Scan QR code labels or paste mail data to begin', {
            type: 'p',
            class: 'posthub__prompt-subtitle'
          }),
        ], { class: 'posthub__prompt-content' }),
      ], { class: 'posthub__prompt' })

      tableContainer.children = [prompt, hiddenTextareaContainer]
      attachScanListeners()
    } else {
      // Bulk guard: if any scanned item can't be bulk-processed (e.g. signature
      // flow) and it was scanned alongside others, show ONLY those items + a
      // message, and block the bulk update until they're handled individually.
      const individual = requiresIndividual ? scannedPackages.filter(requiresIndividual) : []
      if (individual.length > 0 && scannedPackages.length > 1) {
        const warn = new Container([
          new Container([
            new Text('Cannot process in bulk', { type: 'h2', class: 'posthub__prompt-title' }),
            new Text(individualMessage, { type: 'p', class: 'posthub__prompt-subtitle' }),
          ], { class: 'posthub__prompt-content' }),
        ], { class: 'posthub__prompt posthub__prompt--warning' })

        const warnTable = createPackageTable({
          columns: [
            trackingIdColumn(),
            statusBadgeColumn(),
            currentLocationColumn(),
            destinationColumn(),
            senderColumn(),
            recipientColumn(),
            packageDetailsColumn(),
          ],
          packages: individual,
          onRowClick: showDetailPanel,
          tableClass: 'mail-action__table',
        })

        const clearBtn = new Button('Clear & Scan Individually', {
          onClickHandler: () => {
            scannedPackages = []
            updateView()
            attachScanListeners()
          },
          class: 'posthub__scan-btn',
        })

        tableContainer.children = [warn, warnTable, clearBtn, hiddenTextareaContainer]
        focusTextarea()
        return
      }

      const locationLabel = new Container([
        new Text(`Operating from: ${getHubLocation()}`, {
          type: 'span',
          class: 'posthub__bulk-location-label'
        }),
      ], { class: 'posthub__bulk-location' })

      updateAllBtn = new Button('Update All', {
        onClickHandler: handleBulkUpdate,
        class: 'posthub__update-all-btn'
      })

      const pendingHint = new Container([
        new Text(
          `${scannedPackages.length} item(s) scanned -- not saved until you press Update All`,
          { type: 'span', class: 'posthub__bulk-pending-hint' }
        ),
      ], { class: 'posthub__bulk-pending' })

      const bulkBar = new Container([
        locationLabel,
        pendingHint,
        updateAllBtn,
      ], { class: 'posthub__bulk-bar' })

      const noteInput = new TextArea(noteField, {
        placeholder: `Optional note added to every scanned item's timeline (max ${NOTE_MAX_LENGTH} characters)...`,
        rows: 2,
        maxLength: NOTE_MAX_LENGTH,
      })
      const noteSection = new Container([
        new FieldLabel('Note for this batch', noteInput),
      ], { class: 'posthub__bulk-note' })

      const table = createPackageTable({
        columns: [
          trackingIdColumn(),
          statusBadgeColumn(),
          currentLocationColumn(),
          destinationColumn(),
          senderColumn(),
          recipientColumn(),
          packageDetailsColumn(),
        ],
        packages: scannedPackages,
        onRowClick: showDetailPanel,
        tableClass: 'mail-action__table',
      })

      tableContainer.children = [bulkBar, noteSection, table, hiddenTextareaContainer]
      focusTextarea()
    }
  }

  // Initial render
  updateView()
  attachRefocusListener()

  // Hidden container for any document the afterUpdate hook prints (empty otherwise).
  const printContainer = new Container([], { class: 'mail-labels__print-container' })

  const contentArea = new Container([
    pageHeader,
    tableContainer,
    pageLoader,
    printContainer,
  ], { class: 'posthub__page-content' })

  return [navbar, contentArea]
}
