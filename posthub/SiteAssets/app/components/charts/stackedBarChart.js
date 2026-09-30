import { d3 } from '../../libs/nofbiz/nofbiz.analytics.js'
import { tooltip } from './tooltip.js'

/**
 * Single horizontal stacked bar (parts of a whole).
 * Each segment hover shows label + count + percentage.
 *
 * @param {object} args
 * @param {HTMLElement} args.container
 * @param {Array<{label:string,value:number,color:string}>} args.data
 */
export function createStackedBarChart({ container, data }) {
  let _data = data
  let _ro = null
  let _svg = null

  function clear() {
    if (_svg) { _svg.remove(); _svg = null }
    container.innerHTML = ''
  }

  function draw() {
    clear()
    const w = container.clientWidth
    const h = container.clientHeight
    if (w <= 0 || h <= 0) return

    const total = _data.reduce((acc, d) => acc + (d.value || 0), 0)
    const padding = 4
    const barH = Math.min(h - padding * 2, 48)
    const y = (h - barH) / 2

    const svg = d3.select(container).append('svg')
      .attr('class', 'posthub__chart-svg')
      .attr('viewBox', `0 0 ${w} ${h}`)
      .attr('preserveAspectRatio', 'none')
    _svg = svg

    if (total <= 0) {
      svg.append('text')
        .attr('x', w / 2).attr('y', h / 2)
        .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
        .attr('class', 'posthub__chart-donut__center-sub')
        .text('No data')
      return
    }

    let cursor = 0
    const segs = _data.map(d => {
      const width = (d.value / total) * w
      const seg = { ...d, x: cursor, width, pct: Math.round((d.value / total) * 100) }
      cursor += width
      return seg
    })

    const g = svg.append('g')
    g.selectAll('rect')
      .data(segs)
      .enter()
      .append('rect')
      .attr('class', 'posthub__chart-stacked__seg')
      .attr('x', d => d.x)
      .attr('y', y)
      .attr('width', d => Math.max(0, d.width))
      .attr('height', barH)
      .attr('fill', d => d.color || '#ccc')
      .on('mouseenter', (event, d) => {
        tooltip.show(
          `<p class="posthub__chart-tooltip__title">${d.label}</p>
           <div class="posthub__chart-tooltip__row">
             <span class="posthub__chart-tooltip__swatch" style="background:${d.color}"></span>
             <span class="posthub__chart-tooltip__name">count</span>
             <span class="posthub__chart-tooltip__value">${d.value}</span>
           </div>
           <div class="posthub__chart-tooltip__row">
             <span class="posthub__chart-tooltip__swatch" style="visibility:hidden"></span>
             <span class="posthub__chart-tooltip__name">share</span>
             <span class="posthub__chart-tooltip__value">${d.pct}%</span>
           </div>`,
          event.clientX, event.clientY,
        )
      })
      .on('mousemove', (event) => tooltip.move(event.clientX, event.clientY))
      .on('mouseleave', () => tooltip.hide())

    // Inline labels only when segment is wide enough
    g.selectAll('text.posthub__chart-stacked__label')
      .data(segs.filter(s => s.width >= 60))
      .enter()
      .append('text')
      .attr('class', 'posthub__chart-stacked__label')
      .attr('x', d => d.x + d.width / 2)
      .attr('y', y + barH / 2)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .text(d => `${d.label} · ${d.value}`)
  }

  function render() {
    if (_ro) _ro.disconnect()
    _ro = new ResizeObserver(() => draw())
    _ro.observe(container)
    draw()
  }

  function update(nextData) { _data = nextData ?? _data; draw() }
  function destroy() { if (_ro) { _ro.disconnect(); _ro = null } clear(); tooltip.hide() }

  return { render, update, destroy }
}
