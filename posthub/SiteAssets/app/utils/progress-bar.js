import { Container } from '../libs/nofbiz/nofbiz.base.js'

/**
 * Determinate progress bar (track + fill). Styles: .posthub__progress-* in shared.css.
 *
 * `set(pct)` writes the fill width and ARIA value through `.instance` -- an
 * attribute/style-only escape hatch (no DOM structure changes). Calls made before
 * the bar is rendered are no-ops; call `set` again after rendering.
 *
 * @param {string} [label]  Accessible name announced by screen readers.
 * @returns {{ bar: Container, set: (pct: number) => void }}
 */
export function createProgressBar(label = 'Progress') {
  const fill = new Container([], { class: 'posthub__progress-fill' })
  const bar = new Container([fill], { class: 'posthub__progress-track' })

  function set(pct) {
    const value = Math.max(0, Math.min(100, Math.round(pct)))
    fill.instance?.css('width', `${value}%`)
    bar.instance?.attr({
      role: 'progressbar',
      'aria-label': label,
      'aria-valuemin': 0,
      'aria-valuemax': 100,
      'aria-valuenow': value,
    })
  }

  return { bar, set }
}
