import {
  defineRoute,
  Container,
  Text,
  Button,
  LinkButton,
  ComboBox,
  TextArea,
  FormField,
  FieldLabel,
  Loader,
  Router,
  getIcon,
  Toast,
  SiteApi,
  CurrentUser,
  UserIdentity,
} from '../../../../libs/nofbiz/nofbiz.base.js'

import { createNavbar } from '../../../../components/navbar.js'
import { createPackageDetailPanel } from '../../../../components/packageDetailPanel.js'
import {
  LIST_PACKAGES,
  LIST_LOCATIONS,
  LIST_TIMELINE_ENTRIES,
  STATUS_LABELS,
} from '../../../../utils/constants.js'
import { getLocationValue, getUserDisplayName, getUserEmail } from '../../../../utils/user-helpers.js'
import { getHubLocation, isHubLocationSet } from '../../utils/hubLocation.js'

export default defineRoute(async (config) => {
  config.setRouteTitle('Reroute')

  const REROUTABLE_STATUSES = ['in transit', 'arrived']
  const REASON_MAX_LENGTH = 255

  if (!isHubLocationSet()) {
    Toast.warning('Please select your current location first')
    Router.navigateTo('facilities/internal-mail')
    return [new Container([])]
  }

  const siteApi = new SiteApi()
  const user = new CurrentUser()

  // Load active locations for destination ComboBox
  let activeLocations = []
  try {
    activeLocations = await siteApi.list(LIST_LOCATIONS).getItems({ IsActive: 'true' })
  } catch {
    Toast.error('Failed to load locations')
  }
  const locationOptions = activeLocations.map(loc => loc.Title)

  // Detail panel (for click-to-view on the matched package summary)
  const { show: showDetailPanel } = createPackageDetailPanel({ showSmartCardId: true })

  // State
  let currentPackage = null
  let currentOrigin = null
  let scanDebounceTimer = null

  // Page loader
  const pageLoader = new Loader(new Text('Scanning...'), { animation: 'pulse' })
  pageLoader.toggleLoader()
  let loaderVisible = false

  // Navbar
  const navbar = createNavbar()

  // Page header
  const pageHeader = new Container([
    new Container([
      new LinkButton(getIcon('arrow-go-back-line'), 'facilities/internal-mail', {
        class: 'posthub__home-icon',
      }),
      new Text('Reroute', {
        type: 'h1',
        class: 'posthub__page-title',
      }),
    ], { class: 'posthub__title-with-icon' }),
    new Text('Redirect mail to a different destination with a mandatory explanation', {
      type: 'p',
      class: 'posthub__page-subtitle',
    }),
  ], { class: 'posthub__page-header' })

  // Container for the active workspace (waiting / form / confirmation)
  const workspaceContainer = new Container([], { class: 'posthub__table-container' })

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

  function attachRefocusListener() {
    setTimeout(() => {
      document.addEventListener('click', (e) => {
        if (currentPackage) return
        const target = e.target
        const isInteractive = target.closest('button, select, input, textarea:not(.posthub__hidden-textarea), a, .nofbiz__combobox')
        if (!isInteractive) focusTextarea()
      })
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
      processScanData(value)
    }, 1000)
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
    processScanData(text)
  }

  function processScanData(text) {
    if (!text || !text.trim()) {
      hideLoader()
      return
    }

    // Reroute is per-item: take only the first valid scan
    const chunks = text.trim().replace(/\}\s*\{/g, '}\n{').split('\n')
    let parsed = null
    for (const chunk of chunks) {
      const trimmed = chunk.trim()
      if (!trimmed) continue
      try {
        const data = JSON.parse(trimmed)
        if (data.TrackingNumber) { parsed = data; break }
      } catch { /* ignore parse errors per chunk */ }
    }

    if (!parsed) {
      Toast.warning('No valid mail found in scanned data')
      hideLoader()
      return
    }

    matchPackage(parsed.TrackingNumber)
  }

  async function matchPackage(trackingNumber) {
    try {
      const allPackages = await siteApi.list(LIST_PACKAGES).getItems()
      const match = allPackages.find(p => p.Title === trackingNumber)

      if (!match) {
        Toast.warning(`Mail ${trackingNumber} not found`)
        return
      }

      if (!REROUTABLE_STATUSES.includes(match.Status)) {
        Toast.warning(
          `${match.Title} skipped -- status "${STATUS_LABELS[match.Status]}" cannot be rerouted`
        )
        return
      }

      // Fetch the first timeline entry to determine the origin office (sender's drop-off location)
      currentOrigin = null
      try {
        const timeline = await siteApi.list(LIST_TIMELINE_ENTRIES).getItems(
          { Title: match.Title },
          { orderBy: { field: 'Created', ascending: true }, limit: 1 }
        )
        const firstEntry = timeline[0]
        const originLocation = getLocationValue(firstEntry?.Location)
        if (originLocation && originLocation !== '--' && locationOptions.includes(originLocation)) {
          currentOrigin = originLocation
        }
      } catch {
        // Origin lookup is best-effort; reroute still works without it
      }

      currentPackage = match
      renderForm()
    } catch {
      Toast.error('Failed to load mail')
    } finally {
      hideLoader()
    }
  }

  function hideLoader() {
    if (loaderVisible) {
      loaderVisible = false
      pageLoader.toggleLoader()
    }
  }

  function renderWaiting() {
    const prompt = new Container([
      new Container([
        new Text('Waiting for QR Scan', {
          type: 'h2',
          class: 'posthub__prompt-title',
        }),
        new Text('Scan a QR code label to start a reroute. Only mail with status "In Transit" or "Arrived" can be rerouted.', {
          type: 'p',
          class: 'posthub__prompt-subtitle',
        }),
      ], { class: 'posthub__prompt-content' }),
    ], { class: 'posthub__prompt' })

    workspaceContainer.children = [prompt, hiddenTextareaContainer]
    attachScanListeners()
  }

  function renderForm() {
    const pkg = currentPackage
    const senderName = getUserDisplayName(pkg.Sender) || getUserEmail(pkg.Sender) || 'N/A'
    const recipientName = getUserDisplayName(pkg.Recipient) || getUserEmail(pkg.Recipient) || 'N/A'
    const currentDest = getLocationValue(pkg.DestinationLocation) || 'N/A'
    const currentLoc = getLocationValue(pkg.CurrentLocation) || 'N/A'

    const summaryHeader = new Container([
      new Text(pkg.Title, { type: 'h2', class: 'posthub__prompt-title' }),
      new Text(
        `Status: ${STATUS_LABELS[pkg.Status]} - From: ${senderName} - To: ${recipientName}`,
        { type: 'p', class: 'posthub__prompt-subtitle' }
      ),
      new Text(
        `Currently at: ${currentLoc} - Heading to: ${currentDest}`,
        { type: 'p', class: 'posthub__prompt-subtitle' }
      ),
      new Button('View full details', {
        class: 'posthub__bulk-location-label',
        onClickHandler: () => showDetailPanel(pkg),
      }),
    ], { class: 'posthub__prompt-content' })

    const destinationField = new FormField({ value: '' })
    const destinationComboBox = new ComboBox(destinationField, locationOptions, {
      placeholder: 'Select new destination office...',
    })

    const reasonField = new FormField({ value: '' })
    const reasonTextArea = new TextArea(reasonField, {
      placeholder: `Explain why this mail is being rerouted (max ${REASON_MAX_LENGTH} characters)...`,
      rows: 3,
    })

    // Quick-action: return to sender (pre-fills destination with origin office)
    const quickActions = []
    if (currentOrigin) {
      const returnToSenderBtn = new Button(`Return to sender (${currentOrigin})`, {
        onClickHandler: () => {
          destinationField.value = { value: currentOrigin, label: currentOrigin }
          if (!reasonField.value || !reasonField.value.trim()) {
            reasonField.value = 'Returning to sender'
          }
          Toast.info(`Destination set to ${currentOrigin}. Adjust the reason if needed.`)
        },
        class: 'posthub__scan-btn',
      })
      quickActions.push(returnToSenderBtn)
    }

    let confirmBtn = null

    const cancelBtn = new Button('Cancel', {
      onClickHandler: () => {
        currentPackage = null
        currentOrigin = null
        renderWaiting()
      },
      class: 'posthub__scan-btn',
    })

    confirmBtn = new Button('Confirm Reroute', {
      variant: 'primary',
      onClickHandler: async () => {
        const destRaw = destinationField.value
        const destination = typeof destRaw === 'string' ? destRaw : (destRaw?.value ?? null)
        const reason = (reasonField.value || '').trim()

        if (!destination) {
          Toast.error('New destination is required')
          return
        }
        if (!reason) {
          Toast.error('Reason is required to reroute')
          return
        }
        if (reason.length > REASON_MAX_LENGTH) {
          Toast.error(`Reason must be ${REASON_MAX_LENGTH} characters or fewer`)
          return
        }

        if (destination === getLocationValue(pkg.DestinationLocation)) {
          Toast.warning('New destination is the same as the current one')
        }

        confirmBtn.isLoading = true
        const loading = Toast.loading('Rerouting mail...')
        const hubLocation = getHubLocation()
        const now = new Date().toISOString()

        try {
          const changedBy = UserIdentity.fromCurrentUser(user)
          const newStatus = 'in transit'

          await siteApi.list(LIST_PACKAGES).updateItem(pkg.Id, {
            Status: newStatus,
            CurrentLocation: hubLocation,
            DestinationLocation: destination,
            LastModifiedDate: now,
          }, pkg['odata.etag'])

          await siteApi.list(LIST_TIMELINE_ENTRIES).createItem({
            Title: pkg.Title,
            Status: newStatus,
            Location: hubLocation,
            ChangedBy: changedBy,
            Notes: reason,
          })

          loading.success(`${pkg.Title} rerouted to ${destination}`)
          currentPackage = null
          currentOrigin = null
          renderConfirmation(pkg.Title, destination)
        } catch {
          loading.error('Failed to reroute mail')
        } finally {
          if (confirmBtn) confirmBtn.isLoading = false
        }
      },
      class: 'posthub__update-all-btn',
    })

    const formChildren = [summaryHeader]
    if (quickActions.length > 0) {
      formChildren.push(
        new Container(quickActions, { class: 'posthub__bulk-bar posthub__reroute-quick-actions' }),
      )
    }
    formChildren.push(
      new FieldLabel('New Destination Office *', destinationComboBox),
      new FieldLabel('Reason for Reroute *', reasonTextArea),
      new Container([cancelBtn, confirmBtn], { class: 'posthub__bulk-bar' }),
    )

    const formBody = new Container(formChildren, { class: 'posthub__confirmation' })

    workspaceContainer.children = [formBody]
  }

  function renderConfirmation(trackingNumber, destination) {
    const scanMoreBtn = new Button('Reroute Another', {
      onClickHandler: () => {
        renderWaiting()
      },
      class: 'posthub__scan-btn',
    })

    workspaceContainer.children = [
      new Container([
        new Text('Reroute Confirmed', {
          type: 'h2',
          class: 'posthub__prompt-title',
        }),
        new Text(`${trackingNumber} is now in transit toward ${destination}.`, {
          type: 'p',
          class: 'posthub__prompt-subtitle',
        }),
        scanMoreBtn,
      ], { class: 'posthub__confirmation' }),
    ]
  }

  // Initial render
  renderWaiting()
  attachRefocusListener()

  const contentArea = new Container([
    pageHeader,
    workspaceContainer,
    pageLoader,
  ], { class: 'posthub__page-content' })

  return [navbar, contentArea]
})
