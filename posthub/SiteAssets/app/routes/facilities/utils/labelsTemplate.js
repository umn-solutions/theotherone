import {
  Container,
  Text,
  Button,
  LinkButton,
  Loader,
  getIcon,
  Toast,
  SiteApi,
  FormField,
  TextInput,
  PeoplePicker,
  FieldLabel,
} from '../../../libs/nofbiz/nofbiz.base.js'

import { createNavbar } from '../../../components/navbar.js'
import { createPackageDetailPanel } from '../../../components/packageDetailPanel.js'
import { TIMELINE_EVENT_REPRINT, TRACKING_NUMBER_LABEL } from '../../../utils/constants.js'
import { PAGE_DESCRIPTIONS, TOOLTIPS, pluralize } from '../../../utils/copy.js'
import { createPackageTable } from '../../../utils/package-table.js'
import {
  trackingIdColumn,
  packageDetailsColumn,
  statusBadgeColumn,
  currentLocationColumn,
  destinationColumn,
  recipientColumn,
  dateColumn,
} from '../../../utils/package-table-columns.js'
import { fetchItemsAcrossLists } from '../../../utils/mail-context.js'
import { bindTrackingScanInput } from '../../../utils/filter-helpers.js'
import { createSegmentedToggle } from '../../../utils/segmented-toggle.js'
import { printQrLabel } from './qrLabelPrint.js'
import { logTimelineEvent } from './package-actions.js'

/**
 * Shared Print / Reprint labels route, parameterized by mail context + variant.
 * Print: finds a person's pending mail (by ctx.labelSearchField). Reprint: a
 * segmented toggle switches the search between that person (default) and a
 * tracking ID, typed or scanned from a label QR. Offers a per-row Print (A6
 * landscape label). Styling: css/mail-workflow.css (mail-labels__* classes).
 *
 * @param {object} config SPARC route config
 * @param {object} ctx    Mail context (INTERNAL_MAIL / EXTERNAL_MAIL)
 * @param {object} opts   { variant: 'print' | 'reprint' }
 * @returns {Promise<[object, object]>} [navbar, contentArea]
 */
export async function createLabelsRoute(config, ctx, { variant }) {
  const isReprint = variant === 'reprint'
  const verb = isReprint ? 'Reprint' : 'Print'
  // Print covers pending mail only; reprint covers every item, whatever its status.
  const mailNoun = isReprint ? 'mail' : 'pending mail'
  config.setRouteTitle(`${verb} Labels`)

  const siteApi = new SiteApi()
  const personNoun = ctx.labelSearchNoun // 'sender' (internal) | 'recipient' (external)
  const personLabel = personNoun.charAt(0).toUpperCase() + personNoun.slice(1)

  const SEARCH_PERSON = 'person'
  const SEARCH_TRACKING = 'tracking'
  let searchMode = SEARCH_PERSON
  let hasSearched = false
  let packages = []
  let lastQueryLabel = ''

  // --- Person search ---
  const personField = new FormField({ value: { value: '', label: '' } })
  const personPicker = new PeoplePicker(personField, {
    placeholder: 'Search by name or email...',
    onSelectHandler: (selection) => {
      const identity = selection?.value ?? null
      if (identity?.email) {
        handlePersonSelect(identity.email, identity.displayName || identity.email)
      }
    },
  })
  const personLabelOpts = { class: 'mail-labels__sender-field' }
  if (ctx.labelSearchNoun === 'sender' && !isReprint) personLabelOpts.tooltip = TOOLTIPS.labels.sender
  const personControl = new FieldLabel(personLabel, personPicker, personLabelOpts)

  // --- Tracking ID search (reprint only): typed + Search/Enter, or scanned ---
  const trackingField = new FormField({ value: '' })
  const trackingInput = new TextInput(trackingField, { placeholder: 'e.g. POSTHUB-20260201-00001' })
  const resolveTracking = bindTrackingScanInput(trackingField, trackingInput, handleTrackingSearch)
  const trackingSearchBtn = new Button('Search', {
    onClickHandler: () => handleTrackingSearch(resolveTracking(trackingField.value || '')),
    class: 'mail-labels__print-btn',
  })
  const trackingControl = new Container([
    new FieldLabel(TRACKING_NUMBER_LABEL, trackingInput, { class: 'mail-labels__sender-field' }),
    trackingSearchBtn,
  ], { class: 'mail-labels__tracking-search' })

  const SEARCH_MODES = {
    [SEARCH_PERSON]: {
      title: `Search by ${personLabel}`,
      hint: `Type the ${personNoun}'s name or email to find their ${mailNoun}`,
      control: personControl,
    },
    [SEARCH_TRACKING]: {
      title: `Search by ${TRACKING_NUMBER_LABEL}`,
      hint: 'Type a tracking number and press Enter, or scan the QR label',
      control: trackingControl,
    },
  }

  const promptTitle = new Text(SEARCH_MODES[searchMode].title, { type: 'h2', class: 'posthub__prompt-title' })
  const promptHint = new Text(SEARCH_MODES[searchMode].hint, { type: 'p', class: 'posthub__prompt-subtitle' })
  const searchSlot = new Container([SEARCH_MODES[searchMode].control], { class: 'mail-labels__search-slot' })

  // Ready for the scanner: a keyboard-wedge scanner types into the focused field.
  // (.instance escape hatch for focus only -- FormField.focusOnInput() is a no-op
  // on fields without a validator.)
  function focusTrackingInput() {
    trackingInput.instance?.trigger('focus')
  }

  function setSearchMode(mode) {
    searchMode = mode
    const { title, hint, control } = SEARCH_MODES[mode]
    promptTitle.children = title
    promptHint.children = hint
    searchSlot.children = [control]
    if (mode === SEARCH_TRACKING) focusTrackingInput()
  }

  const modeToggleRow = isReprint
    ? new FieldLabel('Search by', createSegmentedToggle([
        { label: personLabel, value: SEARCH_PERSON },
        { label: TRACKING_NUMBER_LABEL, value: SEARCH_TRACKING },
      ], { value: searchMode, onChange: setSearchMode }), {
        position: 'left',
        class: 'posthub__toggle-row mail-labels__mode-toggle',
      })
    : null

  const pageLoader = new Loader(new Text('Loading...'), { animation: 'pulse' })
  pageLoader.toggleLoader()

  const { show: showDetailPanel } = createPackageDetailPanel({ showSmartCardId: true })
  const navbar = createNavbar()

  const pageHeader = new Container([
    new Container([
      new LinkButton(getIcon('arrow-go-back-line'), ctx.basePath, {
        class: 'posthub__home-icon',
      }),
      new Text(`${verb} Labels`, { type: 'h1', class: 'posthub__page-title' }),
    ], { class: 'posthub__title-with-icon' }),
    new Text(isReprint
      ? PAGE_DESCRIPTIONS.reprintLabels
      : ctx.labelSearchNoun === 'sender'
        ? PAGE_DESCRIPTIONS.printLabels
        : `Find a ${personNoun}, select their pending mail and print QR labels to attach.`, {
      type: 'p',
      class: 'posthub__page-subtitle',
    }),
  ], { class: 'posthub__page-header' })

  const tableContainer = new Container([], { class: 'posthub__table-container' })

  const searchPrompt = new Container([
    new Container([
      promptTitle,
      promptHint,
      ...(modeToggleRow ? [modeToggleRow] : []),
      searchSlot,
    ], { class: 'posthub__prompt-content' }),
  ], { class: 'posthub__prompt' })

  async function handlePersonSelect(email, displayName) {
    pageLoader.toggleLoader()
    try {
      packages = await fetchItemsAcrossLists(siteApi, ctx.listNames, {
        [ctx.labelSearchField]: email,
        ...(isReprint ? {} : { Status: 'pending' }),
      })
      hasSearched = true
      lastQueryLabel = `${personLabel}: ${displayName}`
      Toast.success(`Found ${pluralize(packages.length, `${mailNoun} item`)} for ${displayName}`)
      updateView()
    } catch (err) {
      console.error('[labels] failed to load mail', err)
      Toast.error('Could not load mail. Try again.')
    } finally {
      pageLoader.toggleLoader()
    }
  }

  async function handleTrackingSearch(tracking) {
    if (!tracking) { Toast.error('Enter a tracking number or scan a QR label.'); return }
    if (trackingSearchBtn.isLoading) return
    trackingSearchBtn.isLoading = true
    pageLoader.toggleLoader()
    let loaded = false
    try {
      // Exact tracking-number lookup across the context's lists (header record).
      packages = await fetchItemsAcrossLists(siteApi, ctx.listNames, { Title: tracking })
      hasSearched = true
      lastQueryLabel = `${TRACKING_NUMBER_LABEL}: ${tracking}`
      loaded = true
      Toast.success(`Found ${pluralize(packages.length, 'mail item')} for ${tracking}`)
    } catch (err) {
      console.error('[labels] failed to load mail by tracking', { tracking, err })
      Toast.error('Could not load mail. Try again.')
    } finally {
      // Reset BEFORE updateView swaps the search card out: isLoading set on a
      // detached button does not stick, so it would come back disabled.
      trackingSearchBtn.isLoading = false
      pageLoader.toggleLoader()
    }
    if (loaded) updateView()
  }

  // Back to the search card, keeping the selected mode.
  function resetSearch() {
    hasSearched = false
    packages = []
    trackingField.value = ''
    trackingInput.render()
    personField.value = { value: '', label: '' }
    personPicker.clearSelection()
    updateView()
    if (searchMode === SEARCH_TRACKING) focusTrackingInput()
  }

  const newSearchBtn = () => new Button('New Search', {
    onClickHandler: resetSearch,
    class: 'posthub__scan-btn',
  })

  function markRowPrinted(e) {
    e.stopPropagation()
    e.target.closest('.posthub__table-row')?.classList.add('mail-labels__row--printed')
  }

  function buildActionColumn() {
    return {
      label: 'Action',
      render: (pkg) => new Container([
        new Button(verb, {
          title: TOOLTIPS.labels.printLabel,
          onClickHandler: (e) => { markRowPrinted(e); handlePrintLabel(pkg) },
          class: 'mail-labels__print-btn',
        }),
      ], { class: 'posthub__table-cell' }),
    }
  }

  function updateView() {
    if (!hasSearched) {
      tableContainer.children = [searchPrompt]
      return
    }
    if (packages.length === 0) {
      tableContainer.children = [
        new Container([
          new Container([
            new Text(`No ${mailNoun} found`, {
              type: 'h2',
              class: 'posthub__prompt-title',
            }),
            new Text(
              searchMode === SEARCH_TRACKING
                ? 'No mail matches that tracking number.'
                : ctx.labelSearchNoun === 'sender' && !isReprint
                  ? 'This sender has no pending mail. They may need to register it in Send Mail first.'
                  : `This ${personNoun} has no ${mailNoun}.`,
              { type: 'p', class: 'posthub__prompt-subtitle' },
            ),
            newSearchBtn(),
          ], { class: 'posthub__prompt-content' }),
        ], { class: 'posthub__prompt' }),
      ]
      return
    }

    const columns = isReprint
      ? [
          trackingIdColumn(),
          packageDetailsColumn(),
          statusBadgeColumn(),
          currentLocationColumn(),
          destinationColumn(),
          recipientColumn(),
          dateColumn('Dispatched On', 'SubmissionDate'),
          buildActionColumn(),
        ]
      : [
          packageDetailsColumn(),
          destinationColumn(),
          recipientColumn(),
          buildActionColumn(),
        ]

    const table = createPackageTable({
      columns,
      packages,
      onRowClick: showDetailPanel,
      tableClass: isReprint ? 'mail-labels__table--reprint' : 'mail-labels__table--print',
    })

    // Results bar: what was searched + a way back to the search card (and toggle).
    const resultsBar = new Container([
      new Text(`${lastQueryLabel}, ${pluralize(packages.length, 'item')}`, { type: 'p', class: 'mail-labels__results-summary' }),
      newSearchBtn(),
    ], { class: 'posthub__bulk-bar mail-labels__results-bar' })

    tableContainer.children = [resultsBar, table]
  }

  // Hidden container for print-only QR label
  const printContainer = new Container([], { class: 'mail-labels__print-container' })

  // Record a reprint on the shared timeline so it surfaces in the detail-panel
  // events feed. Only reprints are tracked -- the initial print happens as part
  // of registration/dispatch, already represented by those status entries.
  function handlePrintLabel(pkg) {
    printQrLabel(pkg, printContainer)
    if (isReprint) logTimelineEvent(pkg, TIMELINE_EVENT_REPRINT)
  }

  updateView()

  const contentArea = new Container([
    pageHeader,
    tableContainer,
    printContainer,
    pageLoader,
  ], { class: 'posthub__page-content' })

  return [navbar, contentArea]
}
