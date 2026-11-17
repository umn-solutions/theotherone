import {
  Container,
  Text,
  TextInput,
  DateRangeInput,
  ComboBox,
  PeoplePicker,
  FormField,
} from '../libs/nofbiz/nofbiz.base.js'

import { PACKAGE_STATUSES, STATUS_LABELS, TRACKING_NUMBER_LABEL } from './constants.js'
import { TOOLTIPS } from './copy.js'
import { createTextWithTooltip } from './tooltip.js'
import { extractSelection, bindTrackingScanInput } from './filter-helpers.js'
import { defaultDateFrom, defaultDateTo } from './date-helpers.js'

const DATE_FORMAT_INPUT = 'dd-mm-yyyy'
const MAX_RANGE_DAYS = 31
const DATE_DEBOUNCE_MS = 300
const TRACKING_DEBOUNCE_MS = 200

/**
 * Hint under the "Find Mail" heading. `lookups` names the global lookups the
 * route offers (e.g. 'a tracking number or carrier tracking number').
 */
export const findMailHint = (lookups = 'a tracking number') =>
  `Enter ${lookups} to search all mail, whatever the period. Otherwise, mail from the selected period is shown.`
const NARROW_HINT = 'Narrow the mail already shown. These filters do not search outside the selected period.'

/** Status options for multi-select filters (all workflow statuses). */
export const STATUS_FILTER_OPTIONS = PACKAGE_STATUSES.map((s) => ({ label: STATUS_LABELS[s], value: s }))

/**
 * Label + control in the standard filter-group wrapper.
 *
 * @param {string} label
 * @param {object} control
 * @param {{ tooltip?: string, extraClass?: string }} [opts]  tooltip: hover help on the label.
 */
export const filterGroup = (label, control, { tooltip, extraClass = '' } = {}) => new Container([
  createTextWithTooltip(label, tooltip, { type: 'label', class: 'posthub__filter-label' }),
  control,
], { class: `posthub__filter-group ${extraClass}`.trim() })

/**
 * Section title + one-line hint. Block wrapper (not flex) so the inner heading
 * is not itself a flex item of the top filter bar.
 */
export const filterSectionHeader = (title, hint, modifier = '') => new Container([
  new Text(title, { type: 'p', class: 'posthub__section-heading' }),
  new Text(hint, { type: 'p', class: 'posthub__filter-hint' }),
], { class: `posthub__section-header ${modifier}`.trim() })

/**
 * Multi-select ComboBox filter in a labelled filter group.
 *
 * @param {object} args
 * @param {string} args.label
 * @param {Array<string|{label: string, value: string}>} args.options
 * @param {string} args.placeholder
 * @param {boolean} [args.allowFiltering=true]
 * @param {string} [args.tooltip]  Hover help on the label.
 * @param {(values: string[]) => void} args.onChange  Selected values after each change.
 * @returns {{ group: Container, comboBox: ComboBox }}
 */
export function createMultiSelectFilter({ label, options, placeholder, allowFiltering = true, tooltip, onChange }) {
  // ComboBox keeps object options by reference and writes `checked` onto them,
  // so shared option arrays (e.g. STATUS_FILTER_OPTIONS) must be copied or a
  // selection leaks into the next page that uses them.
  const dataset = options.map((o) => (typeof o === 'object' && o !== null ? { ...o } : o))
  const comboBox = new ComboBox(new FormField({ value: [] }), dataset, {
    allowMultiple: true,
    allowFiltering,
    allowCreate: false,
    placeholder,
    onSelectHandler: (selection) => onChange(extractSelection(selection)),
  })
  return { group: filterGroup(label, comboBox, { tooltip }), comboBox }
}

/**
 * Builds the filter sidebar shared by search-package and external search routes.
 *
 * @param {object} args
 * @param {object} args.filters    Mutable state object the route owns.
 * @param {string[]} args.locationOptions  Active location titles for ComboBoxes.
 * @param {object} [args.options]
 * @param {boolean} [args.options.includeTracking=true]  When false, omits the tracking input.
 * @param {string} [args.options.searchHint]  Hint under the Find Mail heading
 *   (defaults to findMailHint(): tracking number only).
 * @param {string} [args.options.periodLabel='Dispatched Between']  Date range label;
 *   name the date the route filters on.
 * @param {string} [args.options.periodTooltip]  Hover help for the date range
 *   (defaults to the dispatch-date wording).
 * @param {() => void} args.onFilterChange  Fires after a non-date filter mutates `filters`.
 * @param {(from: string, to: string) => void} args.onDateChange  Fires (debounced) after valid date change.
 * @param {(trackingValue: string) => void} [args.onTrackingChange]  Fires when the tracking
 *   input changes. When provided, tracking changes call this instead of onFilterChange,
 *   enabling the route to switch between global (tracking) and date-ranged fetch paths.
 * @param {Container[]} [args.searchGroups=[]]  Extra global-search groups placed in the
 *   Find Mail section, after the tracking input (e.g. carrier tracking number).
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
  searchGroups = [],
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

  // Typing + scanning (QR JSON via keyboard wedge / paste) handled by the shared
  // binder; every resolved id goes through applyTracking.
  function applyTracking(id) {
    const lowered = id.toLowerCase()
    filters.tracking = lowered
    if (onTrackingChange) {
      onTrackingChange(lowered)
    } else {
      onFilterChange()
    }
  }

  if (includeTracking) {
    const resolveTracking = bindTrackingScanInput(trackingField, trackingInput, applyTracking)
    // Normal value-change path (typing + keyboard-wedge final value).
    trackingField.subscribe(() => {
      applyTracking(resolveTracking(trackingField.value || ''))
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

  // Status + location multi-selects
  const { group: statusGroup, comboBox: statusComboBox } = createMultiSelectFilter({
    label: 'Status',
    options: STATUS_FILTER_OPTIONS,
    placeholder: 'All statuses',
    allowFiltering: false,
    onChange: (values) => { filters.status = values; onFilterChange() },
  })
  const { group: currentLocationGroup, comboBox: currentLocationComboBox } = createMultiSelectFilter({
    label: 'Current Location',
    options: locationOptions,
    placeholder: 'All offices',
    tooltip: TOOLTIPS.filters.currentLocation,
    onChange: (values) => { filters.currentLocation = values; onFilterChange() },
  })
  const { group: destinationGroup, comboBox: destinationComboBox } = createMultiSelectFilter({
    label: 'Destination',
    options: locationOptions,
    placeholder: 'All offices',
    onChange: (values) => { filters.destination = values; onFilterChange() },
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

  // Tracking input group lives in the Find Mail section (adjacent to the
  // date range) so that it is visually associated with the fetch-level
  // controls rather than the client-side narrowing filters.
  const trackingGroup = includeTracking
    ? filterGroup(TRACKING_NUMBER_LABEL, trackingInput, { tooltip: TOOLTIPS.filters.trackingNumber })
    : null

  // Narrow Results section (client-side filters only -- no tracking here)
  const refineChildren = [
    statusGroup,
    currentLocationGroup,
    destinationGroup,
    filterGroup('Sender', senderPicker),
    filterGroup('Recipient', recipientPicker),
  ]

  // Action buttons (Clear / Export) live on the Date Range line, pushed to the
  // far right of the top bar (see .posthub__filter-sidebar--top .posthub__button-row).
  const buttonRowSlot = new Container([], { class: 'posthub__button-row' })

  const dateRangeChildren = [
    filterSectionHeader('Find Mail', options.searchHint || findMailHint()),
    filterGroup(options.periodLabel || 'Dispatched Between', dateRangeInput, {
      tooltip: options.periodTooltip || TOOLTIPS.filters.dispatchedBetween,
    }),
  ]
  if (trackingGroup) dateRangeChildren.push(trackingGroup)
  dateRangeChildren.push(...searchGroups, buttonRowSlot)

  const filterGrid = new Container([
    ...dateRangeChildren,

    filterSectionHeader('Narrow Results', NARROW_HINT, 'posthub__section-heading--separator'),
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
