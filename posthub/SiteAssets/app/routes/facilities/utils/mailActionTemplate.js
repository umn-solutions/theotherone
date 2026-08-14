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
} from '../../../libs/nofbiz/nofbiz.base.js'

import { createNavbar } from '../../../components/navbar.js'
import { createPackageDetailPanel } from '../../../components/packageDetailPanel.js'
import { LIST_PACKAGES, LIST_TIMELINE_ENTRIES, STATUS_LABELS, STATUS_DESCRIPTIONS } from '../../../utils/constants.js'
import { createPackageTable } from '../../../utils/package-table.js'
import {
  trackingIdColumn, statusBadgeColumn, currentLocationColumn,
  destinationColumn, senderColumn, recipientColumn,
} from '../../../utils/package-table-columns.js'
import { getHubLocation, isHubLocationSet } from './hubLocation.js'

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
}) {
  config.setRouteTitle(title)

  // Guard: redirect to hub if location not set
  if (!isHubLocationSet()) {
    Toast.warning('Please select your current location first')
    Router.navigateTo('facilities/internal-mail')
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

  // Page loader (full-page overlay during async operations)
  const pageLoader = new Loader(new Text('Scanning...'), { animation: 'pulse' })
  pageLoader.toggleLoader()
  let loaderVisible = false

  let updateAllBtn = null

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
    if (!loaderVisible) {
      loaderVisible = true
      pageLoader.toggleLoader()
    }
    scanDebounceTimer = setTimeout(() => {
      const ta = getTextarea()
      if (!ta || !ta.value.trim()) {
        if (loaderVisible) {
          loaderVisible = false
          pageLoader.toggleLoader()
        }
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
    if (loaderVisible) {
      loaderVisible = false
      pageLoader.toggleLoader()
    }
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
      } catch {
        parseErrors++
      }
    }

    if (parseErrors > 0) {
      Toast.warning(`${parseErrors} line(s) could not be parsed`)
    }

    if (parsed.length === 0) {
      Toast.warning('No valid mail found in scanned data')
      if (loaderVisible) {
        loaderVisible = false
        pageLoader.toggleLoader()
      }
      return
    }

    matchAndAddPackages(parsed)
  }

  function attachRefocusListener() {
    setTimeout(() => {
      document.addEventListener('click', (e) => {
        const target = e.target
        const isInteractive = target.closest('button, select, input, textarea:not(.posthub__hidden-textarea), a, .nofbiz__combobox')
        if (!isInteractive) focusTextarea()
      })
    }, 100)
  }

  function handlePaste(e) {
    e.preventDefault()
    const text = e.clipboardData.getData('text')
    if (!loaderVisible) {
      loaderVisible = true
      pageLoader.toggleLoader()
    }
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
      const allPackages = await siteApi.list(LIST_PACKAGES).getItems()

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
    } catch {
      Toast.error('Failed to load mail')
    } finally {
      if (loaderVisible) {
        loaderVisible = false
        pageLoader.toggleLoader()
      }
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
    if (requireSmartCard) {
      const card = await requestSmartCardScan()
      if (!card) {
        Toast.info('Delivery cancelled')
        updateView()
        return
      }
      smartCardValue = card
    }

    const newLocation = getHubLocation()

    if (updateAllBtn) updateAllBtn.isLoading = true
    const loading = Toast.loading('Updating mail...')

    try {
      const changedBy = UserIdentity.fromCurrentUser(user)
      const statusCounts = {}
      let updatedCount = 0
      let skippedCount = 0

      for (const pkg of scannedPackages) {
        const now = new Date().toISOString()
        const newStatus = getTargetStatus(pkg, newLocation)

        if (newStatus === null) {
          skippedCount++
          continue
        }

        const updateFields = {
          Status: newStatus,
          CurrentLocation: newLocation,
          LastModifiedDate: now,
        }

        if (extraUpdateFields) {
          Object.assign(updateFields, extraUpdateFields(pkg, newStatus, now))
        }

        if (requireSmartCard && smartCardValue) {
          updateFields.SmartCardId = smartCardValue
        }

        pkg.Status = newStatus
        pkg.CurrentLocation = newLocation

        await siteApi.list(LIST_PACKAGES).updateItem(pkg.Id, updateFields, pkg['odata.etag'])

        await siteApi.list(LIST_TIMELINE_ENTRIES).createItem({
          Title: pkg.Title,
          Status: newStatus,
          Location: newLocation,
          ChangedBy: changedBy,
        })

        statusCounts[newStatus] = (statusCounts[newStatus] || 0) + 1
        updatedCount++
      }

      const summary = Object.entries(statusCounts)
        .map(([status, count]) => `${count} ${STATUS_LABELS[status].toLowerCase()}`)
        .join(', ')

      const skippedMsg = skippedCount > 0 ? `, ${skippedCount} skipped (wrong destination)` : ''
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
              loaderVisible = false
              updateView()
              attachScanListeners()
            },
            class: 'posthub__scan-btn'
          }),
        ], { class: 'posthub__confirmation' }),
      ]
    } catch {
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

      const bulkBar = new Container([
        locationLabel,
        updateAllBtn,
      ], { class: 'posthub__bulk-bar' })

      const table = createPackageTable({
        columns: [
          trackingIdColumn(),
          statusBadgeColumn(),
          currentLocationColumn(),
          destinationColumn(),
          senderColumn(),
          recipientColumn(),
        ],
        packages: scannedPackages,
        onRowClick: showDetailPanel,
        tableClass: 'mail-action__table',
      })

      tableContainer.children = [bulkBar, table, hiddenTextareaContainer]
      focusTextarea()
    }
  }

  // Initial render
  updateView()
  attachRefocusListener()

  const contentArea = new Container([
    pageHeader,
    tableContainer,
    pageLoader,
  ], { class: 'posthub__page-content' })

  return [navbar, contentArea]
}
