import { Container, Text } from '../libs/nofbiz/nofbiz.base.js'

/**
 * Reusable KPI tile.
 *
 * @param {object} args
 * @param {string} args.label    Caption above the value (e.g. "Total Mail").
 * @param {string|number} args.value  Primary metric, large.
 * @param {string} [args.sublabel]    Optional smaller line below value (e.g. unit, comparison).
 * @param {string} [args.modifier]    Optional BEM modifier (adds posthub__kpi-card--{modifier}).
 * @param {string} [args.icon]        Optional icon SVG string (from getIcon).
 * @param {object} [args.delta]       Optional period-over-period delta chip.
 * @param {string} args.delta.text    Preformatted chip text (e.g. "+8.2%", "-1.4 pp").
 * @param {'positive'|'negative'|'neutral'} [args.delta.tone]  Colors the chip.
 * @param {string} [args.delta.title] Tooltip / accessible hint (e.g. "vs previous period").
 */
export function createKpiCard({ label, value, sublabel, modifier, icon, delta }) {
  const cls = modifier ? `posthub__kpi-card posthub__kpi-card--${modifier}` : 'posthub__kpi-card'

  const headerChildren = []
  if (icon) {
    headerChildren.push(new Container([icon], { class: 'posthub__kpi-card__icon', as: 'span' }))
  }
  headerChildren.push(new Text(label, { type: 'p', class: 'posthub__kpi-card__label' }))

  const children = [
    new Container(headerChildren, { class: 'posthub__kpi-card__header' }),
    new Text(String(value), { type: 'p', class: 'posthub__kpi-card__value' }),
  ]

  const footer = []
  if (delta && delta.text) {
    const tone = delta.tone || 'neutral'
    footer.push(new Text(delta.text, {
      type: 'span',
      class: `posthub__kpi-card__delta posthub__kpi-card__delta--${tone}`,
      ...(delta.title ? { title: delta.title } : {}),
    }))
  }
  if (sublabel) {
    footer.push(new Text(sublabel, { type: 'span', class: 'posthub__kpi-card__sublabel' }))
  }
  if (footer.length) {
    children.push(new Container(footer, { class: 'posthub__kpi-card__footer' }))
  }

  return new Container(children, { class: cls })
}
