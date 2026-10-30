import {
  Container,
  Text,
  TextInput,
  DateRangeInput,
  ComboBox,
  PeoplePicker,
  FormField,
} from '../libs/nofbiz/nofbiz.base.js'

import { PACKAGE_STATUSES, STATUS_LABELS } from './constants.js'
import { extractSelection, parseScannedTrackingId } from './filter-helpers.js'
import { defaultDateFrom, defaultDateTo } from './date-helpers.js'

const DATE_FORMAT_INPUT = 'dd-mm-yyyy'
const MAX_RANGE_DAYS = 31
const DATE_DEBOUNCE_MS = 300
const TRACKING_DEBOUNCE_MS = 200

/**
 * Builds the filter sidebar shared by search-package and external search routes.
 *
 * @param {object} args
 * @param {object} args.filters    Mutable state object the route owns.
 * @param {string[]} args.locationOptions  Active location titles for ComboBoxes.
 * @param {object} [args.options]
 * @param {boolean} [args.options.includeTracking=true]  When false, omits the tracking input.
 * @param {() => void} args.onFilterChange  Fires after a non-date filter mutates `filters`.
 * @param {(from: string, to: string) => void} args.onDateChange  Fires (debounced) after valid date change.
 * @param {(trackingValue: string) => void} [args.onTrackingChange]  Fires when the tracking
 *   input changes. When provided, tracking changes call this instead of onFilterChange,
 *   enabling the route to switch between global (tracking) and date-ranged fetch paths.
 * @param {Container[]} [args.extraGroups=[]]  Extra filter-group containers appended to the
 *   grid after the standard refine filters (e.g. external mail's Category/Direction/Type).
 *
 * @returns {{
 *   filterGrid: Container,
 *   buttonRowSlot: Container,
 *   clearAll: () => void,
 * }}
 */
export function createPackageFilters({
  filters,
  locationOptions,
  options = {},
  onFilterChange,
  onDateChange,
  onTrackingChange,
  extraGroups = [],
}) {
  const includeTracking = options.includeTracking !== false

  let dateDebounceTimer = null

  // Tracking number (optional). TextInput already debounces value-sync into its bound
  // FormField (debounceMs); subscribing fires post-debounce.
  const trackingField = includeTracking ? new FormField({ value: filters.tracking || '' }) : null
  const trackingInput = includeTracking
    ? new TextInput(trackingField, {
        placeholder: 'e.g. POSTHUB-20260201-00001',
        debounceMs: TRACKING_DEBOUNCE_MS,
      })
    : null

  // Shared logic: resolve raw input through parseScannedTrackingId, update the
  // field + DOM if it extracted a different id (QR JSON), then fire the appropriate
  // callback. Reused by paste, keydown, and the normal subscribe path.
  function resolveAndApplyTracking(rawValue) {
    const parsed = parseScannedTrackingId(rawValue)
    const lowered = parsed.toLowerCase()

    // If the parse extracted a different id (was QR JSON), push the clean id
    // back into the field + DOM so the user sees the tracking number, not JSON.
    if (parsed !== rawValue?.trim()) {
      trackingField.value = parsed
      trackingInput.render()
    }

    filters.tracking = lowered
    if (onTrackingChange) {
      onTrackingChange(lowered)
    } else {
      onFilterChange()
    }
  }

  if (includeTracking) {
    // Normal value-change path (typing + keyboard-wedge final value).
    trackingField.subscribe(() => {
      resolveAndApplyTracking(trackingField.value || '')
    })

    // PASTE interception: extract tracking id from QR JSON before the value
    // reaches the field. If it was plain text, let the default paste proceed.
    trackingInput.setEventHandler('paste', (ev) => {
      const raw = ev.clipboardData?.getData('text') || ''
      const parsed = parseScannedTrackingId(raw)
      if (parsed !== raw.trim()) {
        // Was QR JSON -- prevent the raw paste and apply the extracted id.
        ev.preventDefault()
        resolveAndApplyTracking(raw)
      }
      // Plain text: let default paste proceed; subscribe will fire normally.
    })

    // KEYBOARD-WEDGE: scanner types JSON then presses Enter. Parse immediately
    // on Enter so the user doesn't have to wait for debounce to finish.
    trackingInput.setEventHandler('keydown', (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault()
        resolveAndApplyTracking(trackingField.value || '')
      }
    })
  }

  // People pickers
  const senderField = new FormField({ value: { value: '', label: '' } })
  const senderPicker = new PeoplePicker(senderField, {
    onSelectHandler: (selection) => {
      const identity = selection?.value ?? null
      filters.senderEmail = identity?.email || ''
      onFilterChange()
    },
  })

  const recipientField = new FormField({ value: { value: '', label: '' } })
  const recipientPicker = new PeoplePicker(recipientField, {
    onSelectHandler: (selection) => {
      const identity = selection?.value ?? null
      filters.recipientEmail = identity?.email || ''
      onFilterChange()
    },
  })

  // Status ComboBox
  const statusField = new FormField({ value: [] })
  const statusComboBox = new ComboBox(
    statusField,
    PACKAGE_STATUSES.map(s => ({ label: STATUS_LABELS[s], value: s })),
    {
      allowMultiple: true,
      allowFiltering: false,
      allowCreate: false,
      placeholder: 'Select status...',
      onSelectHandler: (selection) => {
        filters.status = extractSelection(selection)
        onFilterChange()
      },
    },
  )

  // Location ComboBoxes
  const currentLocationField = new FormField({ value: [] })
  const currentLocationComboBox = new ComboBox(currentLocationField, locationOptions, {
    allowMultiple: true,
    allowFiltering: true,
    allowCreate: false,
    placeholder: 'Select current location...',
    onSelectHandler: (selection) => {
      filters.currentLocation = extractSelection(selection)
      onFilterChange()
    },
  })

  const destinationField = new FormField({ value: [] })
  const destinationComboBox = new ComboBox(destinationField, locationOptions, {
    allowMultiple: true,
    allowFiltering: true,
    allowCreate: false,
    placeholder: 'Select destination...',
    onSelectHandler: (selection) => {
      filters.destination = extractSelection(selection)
      onFilterChange()
    },
  })

  // Date range input -- single component handles start + end + 31-day cap
  const dateFromField = new FormField({ value: filters.dateFrom })
  const dateToField = new FormField({ value: filters.dateTo })
  const dateRangeInput = new DateRangeInput(dateFromField, dateToField, {
    format: DATE_FORMAT_INPUT,
    placeholder: 'Select date range',
    rules: { maxDays: MAX_RANGE_DAYS },
  })

  const scheduleDateFetch = () => {
    if (!dateFromField.value || !dateToField.value) return
    if (dateFromField.value === filters.dateFrom && dateToField.value === filters.dateTo) return
    filters.dateFrom = dateFromField.value
    filters.dateTo = dateToField.value
    clearTimeout(dateDebounceTimer)
    dateDebounceTimer = setTimeout(() => onDateChange(filters.dateFrom, filters.dateTo), DATE_DEBOUNCE_MS)
  }
  dateFromField.subscribe(scheduleDateFetch)
  dateToField.subscribe(scheduleDateFetch)

  // Tracking input group lives in the Date Range section (adjacent to the
  // Period control) so that it is visually associated with the fetch-level
  // controls rather than the client-side refine filters.
  const trackingGroup = includeTracking
    ? new Container([
        new Text('Tracking Number', { type: 'label', class: 'posthub__filter-label' }),
        trackingInput,
      ], { class: 'posthub__filter-group' })
    : null

  // Refine Results section (client-side filters only -- no tracking here)
  const refineChildren = [
    new Container([
      new Text('Status', { type: 'label', class: 'posthub__filter-label' }),
      statusComboBox,
    ], { class: 'posthub__filter-group' }),
    new Container([
      new Text('Current Location', { type: 'label', class: 'posthub__filter-label' }),
      currentLocationComboBox,
    ], { class: 'posthub__filter-group' }),
    new Container([
      new Text('Destination', { type: 'label', class: 'posthub__filter-label' }),
      destinationComboBox,
    ], { class: 'posthub__filter-group' }),
    new Container([
      new Text('Sender', { type: 'label', class: 'posthub__filter-label' }),
      senderPicker,
    ], { class: 'posthub__filter-group' }),
    new Container([
      new Text('Recipient', { type: 'label', class: 'posthub__filter-label' }),
      recipientPicker,
    ], { class: 'posthub__filter-group' }),
  ]

  // Action buttons (Clear / Export) live on the Date Range line, pushed to the
  // far right of the top bar (see .posthub__filter-sidebar--top .posthub__button-row).
  const buttonRowSlot = new Container([], { class: 'posthub__button-row' })

  const dateRangeChildren = [
    new Text('Date Range', { type: 'p', class: 'posthub__section-heading' }),
    new Container([
      new Text('Period', { type: 'label', class: 'posthub__filter-label' }),
      dateRangeInput,
    ], { class: 'posthub__filter-group' }),
  ]
  if (trackingGroup) dateRangeChildren.push(trackingGroup)
  dateRangeChildren.push(buttonRowSlot)

  const filterGrid = new Container([
    ...dateRangeChildren,

    new Text('Refine Results', { type: 'p', class: 'posthub__section-heading posthub__section-heading--separator' }),
    ...refineChildren,
    ...extraGroups,
  ], { class: 'posthub__filter-grid' })

  function clearAll() {
    if (includeTracking) {
      filters.tracking = ''
      trackingField.value = ''
      // FormControl does not auto-reflect a programmatic field value change --
      // render() to actually clear the box.
      trackingInput.render()
    }
    filters.senderEmail = ''
    filters.recipientEmail = ''
    filters.status = []
    filters.currentLocation = []
    filters.destination = []

    senderField.value = { value: '', label: '' }
    recipientField.value = { value: '', label: '' }
    senderPicker.clearSelection()
    recipientPicker.clearSelection()
    statusComboBox.clearSelection()
    currentLocationComboBox.clearSelection()
    destinationComboBox.clearSelection()

    // Date range last: subscribers update filters.dateFrom/dateTo as fields settle.
    dateFromField.value = defaultDateFrom()
    dateToField.value = defaultDateTo()
    dateRangeInput.render() // reflect the reset range in the DOM (no auto-rerender)

    clearTimeout(dateDebounceTimer)

    // When tracking was active, route through onTrackingChange so the route
    // reverts from global search back to the date-ranged view.
    if (onTrackingChange) {
      onTrackingChange('')
    }
    onDateChange(filters.dateFrom, filters.dateTo)
  }

  return {
    filterGrid,
    buttonRowSlot,
    clearAll,
  }
}
