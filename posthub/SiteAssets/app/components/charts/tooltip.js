// Single shared tooltip for chart hover. Page-level singleton, lazily created.
// Pointer-events: none so it never intercepts hover from the chart itself.

let _el = null

function ensure() {
  if (_el) return _el
  _el = document.createElement('div')
  _el.className = 'posthub__chart-tooltip'
  _el.style.display = 'none'
  document.body.appendChild(_el)
  return _el
}

export const tooltip = {
  show(html, x, y) {
    const el = ensure()
    el.innerHTML = html
    el.style.display = 'block'
    this.move(x, y)
  },
  move(x, y) {
    if (!_el) return
    // Keep tooltip clear of cursor and within viewport.
    const offsetX = 12
    const offsetY = 12
    const w = _el.offsetWidth
    const h = _el.offsetHeight
    const left = (x + offsetX + w > window.innerWidth) ? x - offsetX - w : x + offsetX
    const top = (y + offsetY + h > window.innerHeight) ? y - offsetY - h : y + offsetY
    _el.style.left = `${Math.max(0, left)}px`
    _el.style.top = `${Math.max(0, top)}px`
  },
  hide() {
    if (!_el) return
    _el.style.display = 'none'
  },
}
