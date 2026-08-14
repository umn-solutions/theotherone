import { d3 } from '../../libs/nofbiz/nofbiz.analytics.js'
import { tooltip } from './tooltip.js'

/**
 * Vertical grouped bar chart (multiple series per category).
 *
 * @param {object} args
 * @param {HTMLElement} args.container
 * @param {object} args.data
 * @param {string[]} args.data.categories  X-axis groups (e.g. building names).
 * @param {Array<{name:string,color:string,values:number[]}>} args.data.series
 *   Each series.values is aligned by index to categories.
 * @param {object} [args.options]
 * @param {(c:string)=>string} [args.options.labelFormatter]  Short axis label per category.
 */
export function createGroupedBarChart({ container, data, options = {} }) {
  let _data = data
  let _opts = { labelFormatter: (c) => c, ...options }
  let _ro = null
  let _svg = null

  function clear() { if (_svg) { _svg.remove(); _svg = null } container.innerHTML = '' }

  function draw() {
    clear()
    const w = container.clientWidth
    const h = container.clientHeight
    if (w <= 0 || h <= 0) return

    const categories = _data?.categories || []
    const series = _data?.series || []

    const svg = d3.select(container).append('svg')
      .attr('class', 'posthub__chart-svg')
      .attr('viewBox', `0 0 ${w} ${h}`)
      .attr('preserveAspectRatio', 'none')
    _svg = svg

    const hasData = categories.length > 0 && series.some(s => (s.values || []).some(v => v > 0))
    if (!hasData) {
      svg.append('text').attr('x', w / 2).attr('y', h / 2)
        .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
        .attr('class', 'posthub__chart-donut__center-sub')
        .text('No data')
      return
    }

    const legendH = 16
    const margin = { top: legendH + 8, right: 12, bottom: 28, left: 34 }
    const innerW = w - margin.left - margin.right
    const innerH = h - margin.top - margin.bottom

    const x0 = d3.scaleBand().domain(categories).range([0, innerW]).paddingInner(0.28).paddingOuter(0.12)
    const x1 = d3.scaleBand().domain(series.map(s => s.name)).range([0, x0.bandwidth()]).padding(0.12)
    const yMax = Math.max(1, d3.max(series, s => d3.max(s.values || [], v => v || 0)) || 0)
    const y = d3.scaleLinear().domain([0, yMax]).nice(3).range([innerH, 0])

    const g = svg.append('g').attr('transform', `translate(${margin.left}, ${margin.top})`)

    // Y grid + ticks
    const yTicks = y.ticks(3)
    g.selectAll('line.grid').data(yTicks).enter().append('line')
      .attr('class', 'axis-line')
      .attr('x1', 0).attr('x2', innerW)
      .attr('y1', d => y(d)).attr('y2', d => y(d))
    g.selectAll('text.y-tick').data(yTicks).enter().append('text')
      .attr('class', 'y-tick')
      .attr('x', -6).attr('y', d => y(d))
      .attr('text-anchor', 'end').attr('dominant-baseline', 'middle')
      .text(d => d)

    // Groups
    const group = g.selectAll('g.grp').data(categories).enter().append('g')
      .attr('class', 'grp')
      .attr('transform', c => `translate(${x0(c)}, 0)`)

    group.each(function (category, ci) {
      const gg = d3.select(this)
      gg.selectAll('rect').data(series.map(s => ({
        name: s.name, color: s.color, value: (s.values || [])[ci] || 0, category,
      }))).enter().append('rect')
        .attr('class', 'posthub__chart-bar')
        .attr('x', d => x1(d.name))
        .attr('y', d => y(d.value))
        .attr('width', x1.bandwidth())
        .attr('height', d => innerH - y(d.value))
        .attr('fill', d => d.color)
        .on('mouseenter', (event, d) => {
          tooltip.show(
            `<p class="posthub__chart-tooltip__title">${category}</p>
             <div class="posthub__chart-tooltip__row">
               <span class="posthub__chart-tooltip__swatch" style="background:${d.color}"></span>
               <span class="posthub__chart-tooltip__name">${d.name}</span>
               <span class="posthub__chart-tooltip__value">${d.value}</span>
             </div>`,
            event.clientX, event.clientY,
          )
        })
        .on('mousemove', (event) => tooltip.move(event.clientX, event.clientY))
        .on('mouseleave', () => tooltip.hide())
    })

    // X labels (short)
    g.selectAll('text.x-tick').data(categories).enter().append('text')
      .attr('class', 'x-tick')
      .attr('x', c => x0(c) + x0.bandwidth() / 2)
      .attr('y', innerH + 16)
      .attr('text-anchor', 'middle')
      .text(c => _opts.labelFormatter(c))

    // Legend (top-left)
    const legend = svg.append('g')
      .attr('class', 'posthub__chart-line__legend')
      .attr('transform', `translate(${margin.left}, 0)`)
    let xOff = 0
    series.forEach((s) => {
      const item = legend.append('g').attr('transform', `translate(${xOff}, 0)`)
      item.append('rect').attr('width', 9).attr('height', 9).attr('rx', 2).attr('fill', s.color).attr('y', 2)
      const text = item.append('text').attr('x', 13).attr('y', 9).attr('dominant-baseline', 'middle').text(s.name)
      const node = text.node()
      const tw = node && node.getComputedTextLength ? node.getComputedTextLength() : 50
      xOff += 13 + tw + 12
    })
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
