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
import { extractSelection } from './filter-helpers.js'
import { defaultDateFrom, defaultDateTo } from './date-helpers.js'

const DATE_FORMAT_INPUT = 'dd-mm-yyyy'
const MAX_RANGE_DAYS = 31
const DATE_DEBOUNCE_MS = 300
const TRACKING_DEBOUNCE_MS = 200

/**
 * Builds the filter sidebar shared by search-package and reports routes.
 *
 * @param {object} args
 * @param {object} args.filters    Mutable state object the route owns.
 * @param {string[]} args.locationOptions  Active location titles for ComboBoxes.
 * @param {object} [args.options]
 * @param {boolean} [args.options.includeTracking=true]  When false, omits the tracking input.
 * @param {() => void} args.onFilterChange  Fires after a non-date filter mutates `filters`.
 * @param {(from: string, to: string) => void} args.onDateChange  Fires (debounced) after valid date change.
 *
 * @returns {{
 *   filterGrid: Container,
 *   buttonRowSlot: Container,
 *   clearAll: () => void,
 *   attachTrackingListener: () => void,
 * }}
 */
export function createPackageFilters({
  filters,
  locationOptions,
  options = {},
  onFilterChange,
  onDateChange,
}) {
  const includeTracking = options.includeTracking !== false

  let dateDebounceTimer = null
  let trackingDebounce = null

  // Tracking number (optional)
  const trackingField = includeTracking ? new FormField({ value: filters.tracking || '' }) : null
  const trackingInput = includeTracking
    ? new TextInput(trackingField, { placeholder: 'e.g. POSTHUB-20260201-00001' })
    : null

  function attachTrackingListener() {
    if (!includeTracking) return
    setTimeout(() => {
      const el = trackingInput.instance?.[0]
      if (!el) return
      const input = el.tagName === 'INPUT' ? el : el.querySelector('input')
      if (!input) return
      input.addEventListener('input', () => {
        clearTimeout(trackingDebounce)
        trackingDebounce = setTimeout(() => {
          filters.tracking = (input.value || '').toLowerCase()
          onFilterChange()
        }, TRACKING_DEBOUNCE_MS)
      })
    }, 100)
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

  // Date range input — single component handles start + end + 31-day cap
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

  // Filter grid layout
  const refineChildren = []
  if (includeTracking) {
    refineChildren.push(
      new Container([
        new Text('Tracking Number', { type: 'label', class: 'posthub__filter-label' }),
        trackingInput,
      ], { class: 'posthub__filter-group' }),
    )
  }
  refineChildren.push(
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
  )

  const filterGrid = new Container([
    new Text('Date Range', { type: 'p', class: 'posthub__section-heading' }),
    new Container([
      new Text('Period', { type: 'label', class: 'posthub__filter-label' }),
      dateRangeInput,
    ], { class: 'posthub__filter-group' }),

    new Text('Refine Results', { type: 'p', class: 'posthub__section-heading posthub__section-heading--separator' }),
    ...refineChildren,
  ], { class: 'posthub__filter-grid' })

  const buttonRowSlot = new Container([], { class: 'posthub__button-row' })

  function clearAll() {
    if (includeTracking) {
      filters.tracking = ''
      trackingField.value = ''
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

    clearTimeout(dateDebounceTimer)
    onDateChange(filters.dateFrom, filters.dateTo)
  }

  return {
    filterGrid,
    buttonRowSlot,
    clearAll,
    attachTrackingListener,
  }
}
