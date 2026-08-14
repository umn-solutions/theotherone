import { d3 } from '../../libs/nofbiz/nofbiz.analytics.js'
import { tooltip } from './tooltip.js'

/**
 * Single-series horizontal bar chart. Label sits to the left of each bar,
 * the formatted value at the bar's end. Bars sorted by caller.
 *
 * @param {object} args
 * @param {HTMLElement} args.container
 * @param {Array<{label:string,value:number,color:string,raw?:string}>} args.data
 * @param {object} [args.options]
 * @param {(v:number)=>string} [args.options.valueFormatter]  Formats the end label + tooltip.
 */
export function createHorizontalBarChart({ container, data, options = {} }) {
  let _data = data
  let _opts = { valueFormatter: (v) => String(v), ...options }
  let _ro = null
  let _svg = null

  function clear() { if (_svg) { _svg.remove(); _svg = null } container.innerHTML = '' }

  function draw() {
    clear()
    const w = container.clientWidth
    const h = container.clientHeight
    if (w <= 0 || h <= 0) return

    const rows = _data || []

    const svg = d3.select(container).append('svg')
      .attr('class', 'posthub__chart-svg')
      .attr('viewBox', `0 0 ${w} ${h}`)
      .attr('preserveAspectRatio', 'none')
    _svg = svg

    const hasData = rows.some(r => (r.value || 0) > 0)
    if (!hasData) {
      svg.append('text').attr('x', w / 2).attr('y', h / 2)
        .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
        .attr('class', 'posthub__chart-donut__center-sub')
        .text('No data')
      return
    }

    const margin = { top: 6, right: 52, bottom: 6, left: 88 }
    const innerW = w - margin.left - margin.right
    const innerH = h - margin.top - margin.bottom

    const y = d3.scaleBand().domain(rows.map(r => r.label)).range([0, innerH]).padding(0.28)
    const xMax = Math.max(1, d3.max(rows, r => r.value || 0) || 0)
    const x = d3.scaleLinear().domain([0, xMax]).range([0, innerW])

    const g = svg.append('g').attr('transform', `translate(${margin.left}, ${margin.top})`)

    const row = g.selectAll('g.hb-row').data(rows).enter().append('g')
      .attr('class', 'hb-row')
      .attr('transform', d => `translate(0, ${y(d.label)})`)

    // Label (left of bar)
    row.append('text')
      .attr('class', 'y-tick')
      .attr('x', -8).attr('y', y.bandwidth() / 2)
      .attr('text-anchor', 'end').attr('dominant-baseline', 'middle')
      .text(d => d.label)

    // Bar
    row.append('rect')
      .attr('class', 'posthub__chart-bar')
      .attr('x', 0).attr('y', 0)
      .attr('width', d => Math.max(0, x(d.value)))
      .attr('height', y.bandwidth())
      .attr('fill', d => d.color)
      .on('mouseenter', (event, d) => {
        tooltip.show(
          `<p class="posthub__chart-tooltip__title">${d.raw || d.label}</p>
           <div class="posthub__chart-tooltip__row">
             <span class="posthub__chart-tooltip__swatch" style="background:${d.color}"></span>
             <span class="posthub__chart-tooltip__name">value</span>
             <span class="posthub__chart-tooltip__value">${_opts.valueFormatter(d.value)}</span>
           </div>`,
          event.clientX, event.clientY,
        )
      })
      .on('mousemove', (event) => tooltip.move(event.clientX, event.clientY))
      .on('mouseleave', () => tooltip.hide())

    // Value (end of bar)
    row.append('text')
      .attr('class', 'posthub__chart-bar__value')
      .attr('x', d => x(d.value) + 6).attr('y', y.bandwidth() / 2)
      .attr('text-anchor', 'start').attr('dominant-baseline', 'middle')
      .text(d => _opts.valueFormatter(d.value))
  }

  function render() {
    if (_ro) _ro.disconnect()
    _ro = new ResizeObserver(() => draw())
    _ro.observe(container)
    draw()
  }
  function update(nextData, nextOptions) {
    _data = nextData ?? _data
    if (nextOptions) _opts = { ..._opts, ...nextOptions }
    draw()
  }
  function destroy() { if (_ro) { _ro.disconnect(); _ro = null } clear(); tooltip.hide() }

  return { render, update, destroy }
}
