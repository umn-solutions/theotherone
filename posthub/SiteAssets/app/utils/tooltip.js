import { Text, getIcon } from '../libs/nofbiz/nofbiz.base.js'

// Hover help for text that is not a FieldLabel (filter labels, KPI and chart
// titles, badges). Mirrors FieldLabel's tooltip: native `title` on the text plus
// the same info icon, reusing FieldLabel's icon class so both look identical.
// Form fields should use FieldLabel's own `tooltip` option instead.
// Tooltip copy lives in utils/copy.js (TOOLTIPS).

const TOOLTIP_ICON_CLASS = 'nofbiz__fieldlabel__tooltip-icon'

/** Info icon that shows `tooltip` on hover. */
export const createTooltipIcon = (tooltip) =>
  new Text(getIcon('information-line'), { type: 'span', class: TOOLTIP_ICON_CLASS, title: tooltip })

/**
 * Text with optional hover help. Without a tooltip it is a plain Text, so
 * callers can pass an optional tooltip straight through.
 *
 * @param {string} text
 * @param {string} [tooltip]
 * @param {object} [props]  Text props (type, class).
 * @returns {Text}
 */
export function createTextWithTooltip(text, tooltip, props = {}) {
  if (!tooltip) return new Text(text, props)
  const cls = props.class ? `${props.class} posthub__has-tooltip` : 'posthub__has-tooltip'
  return new Text([text, createTooltipIcon(tooltip)], { ...props, class: cls, title: tooltip })
}
