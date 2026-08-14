import { Container, Text } from '../libs/nofbiz/nofbiz.base.js'

let _chartIdCounter = 0

/**
 * Reusable titled chart container with a stable mount node.
 *
 * Returns an object exposing both a CSS-id selector (`#${mountId}`) and the raw
 * HTMLElement so analytics components and custom d3 code can both target it.
 * `clearMount()` is the documented escape hatch for re-rendering: BarChart has
 * no destroy() method, so we wipe the mount's innerHTML before re-instantiating.
 *
 * @param {object} args
 * @param {string} args.title
 * @param {string} [args.subtitle]
 * @returns {{
 *   card: Container,
 *   mountId: string,
 *   getMountElement: () => HTMLElement | null,
 *   clearMount: () => void,
 *   setBody: (children: any[]) => void,
 * }}
 */
export function createChartCard({ title, subtitle, class: extraClass }) {
  const mountId = `posthub-chart-${++_chartIdCounter}`
  const mount = new Container([], { id: mountId, class: 'posthub__chart-card__canvas' })

  const headerChildren = [
    new Text(title, { type: 'h3', class: 'posthub__chart-card__title' }),
  ]
  if (subtitle) {
    headerChildren.push(new Text(subtitle, { type: 'p', class: 'posthub__chart-card__subtitle' }))
  }

  const cardClass = extraClass
    ? `posthub__chart-card ${extraClass}`
    : 'posthub__chart-card'

  const card = new Container([
    new Container(headerChildren, { class: 'posthub__chart-card__header' }),
    mount,
  ], { class: cardClass })

  function getMountElement() {
    const el = mount.instance?.[0]
    return el || null
  }

  function clearMount() {
    const el = getMountElement()
    if (el) el.innerHTML = ''
  }

  function showEmpty(message) {
    const el = getMountElement()
    if (!el) return
    el.innerHTML = ''
    const wrap = document.createElement('div')
    wrap.className = 'posthub__chart-card__empty'
    wrap.textContent = message
    el.appendChild(wrap)
  }

  return { card, mountId, getMountElement, clearMount, showEmpty }
}
