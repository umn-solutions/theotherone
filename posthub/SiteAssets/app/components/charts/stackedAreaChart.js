import { d3 } from '../../libs/nofbiz/nofbiz.analytics.js'
import { tooltip } from './tooltip.js'

/**
 * Stacked area chart with hover crosshair + tooltip.
 *
 * @param {object} args
 * @param {HTMLElement} args.container
 * @param {object} args.data
 * @param {Array<Date|string>} args.data.dates
 * @param {Array<{name:string,color:string,values:number[]}>} args.data.series
 *   values must be the same length as dates and aligned by index
 * @param {object} [args.options]
 * @param {boolean} [args.options.showLegend=true]
 * @param {boolean} [args.options.showAxes=true]
 */
export function createStackedAreaChart({ container, data, options = {} }) {
  let _data = data
  let _opts = { showLegend: true, showAxes: true, ...options }
  let _ro = null
  let _svg = null

  function clear() { if (_svg) { _svg.remove(); _svg = null } container.innerHTML = '' }

  function toDate(v) { return v instanceof Date ? v : new Date(v) }

  function draw() {
    clear()
    const w = container.clientWidth
    const h = container.clientHeight
    if (w <= 0 || h <= 0) return

    const dates = (_data?.dates || []).map(toDate)
    const series = _data?.series || []

    const svg = d3.select(container).append('svg')
      .attr('class', 'posthub__chart-svg')
      .attr('viewBox', `0 0 ${w} ${h}`)
      .attr('preserveAspectRatio', 'none')
    _svg = svg

    if (dates.length === 0 || series.length === 0) {
      svg.append('text').attr('x', w / 2).attr('y', h / 2)
        .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
        .attr('class', 'posthub__chart-donut__center-sub')
        .text('No data')
      return
    }

    const legendH = _opts.showLegend ? 16 : 0
    const margin = _opts.showAxes
      ? { top: legendH + 6, right: 12, bottom: 22, left: 28 }
      : { top: legendH + 4, right: 4, bottom: 4, left: 4 }
    const innerW = w - margin.left - margin.right
    const innerH = h - margin.top - margin.bottom

    const rows = dates.map((d, i) => {
      const row = { _date: d }
      series.forEach(s => { row[s.name] = s.values[i] || 0 })
      return row
    })

    const keys = series.map(s => s.name)
    const colorByKey = Object.fromEntries(series.map(s => [s.name, s.color]))

    const stacked = d3.stack().keys(keys)(rows)
    const yMax = Math.max(1, d3.max(stacked, layer => d3.max(layer, p => p[1])) || 0)

    const xScale = d3.scaleTime().domain(d3.extent(dates)).range([0, innerW])
    const yScale = d3.scaleLinear().domain([0, yMax]).nice(3).range([innerH, 0])

    const g = svg.append('g').attr('transform', `translate(${margin.left}, ${margin.top})`)

    if (_opts.showAxes) {
      const yTicks = yScale.ticks(3)
      g.selectAll('line.grid')
        .data(yTicks)
        .enter()
        .append('line')
        .attr('class', 'axis-line')
        .attr('x1', 0).attr('x2', innerW)
        .attr('y1', d => yScale(d)).attr('y2', d => yScale(d))
      g.selectAll('text.y-tick')
        .data(yTicks)
        .enter()
        .append('text')
        .attr('class', 'y-tick')
        .attr('x', -6).attr('y', d => yScale(d))
        .attr('text-anchor', 'end').attr('dominant-baseline', 'middle')
        .text(d => d)

      const xTicks = xScale.ticks(Math.min(5, dates.length))
      g.selectAll('text.x-tick')
        .data(xTicks)
        .enter()
        .append('text')
        .attr('class', 'x-tick')
        .attr('x', d => xScale(d))
        .attr('y', innerH + 14)
        .attr('text-anchor', 'middle')
        .text(d => d3.timeFormat('%d %b')(d))
    }

    const area = d3.area()
      .x((_, i) => xScale(rows[i]._date))
      .y0(p => yScale(p[0]))
      .y1(p => yScale(p[1]))
      .curve(d3.curveMonotoneX)

    g.selectAll('path.layer')
      .data(stacked)
      .enter()
      .append('path')
      .attr('class', 'posthub__chart-area__layer')
      .attr('fill', layer => colorByKey[layer.key])
      .attr('d', area)

    if (_opts.showLegend) {
      const legend = svg.append('g')
        .attr('class', 'posthub__chart-line__legend')
        .attr('transform', `translate(${margin.left}, 0)`)
      let xOff = 0
      series.forEach((s) => {
        const item = legend.append('g').attr('transform', `translate(${xOff}, 0)`)
        item.append('rect').attr('width', 9).attr('height', 9).attr('rx', 2).attr('fill', s.color)
          .attr('y', 2)
        const text = item.append('text').attr('x', 13).attr('y', 9).attr('dominant-baseline', 'middle').text(s.name)
        const node = text.node()
        const tw = node && node.getComputedTextLength ? node.getComputedTextLength() : 50
        xOff += 13 + tw + 12
      })
    }

    const focusLine = g.append('line')
      .attr('class', 'focus-line')
      .attr('y1', 0).attr('y2', innerH)
      .style('display', 'none')

    g.append('rect')
      .attr('width', innerW).attr('height', innerH)
      .attr('fill', 'transparent')
      .on('mousemove', (event) => {
        const [mx] = d3.pointer(event)
        const xVal = xScale.invert(mx)

        let nearestIdx = 0
        let minDelta = Infinity
        for (let i = 0; i < dates.length; i++) {
          const delta = Math.abs(dates[i] - xVal)
          if (delta < minDelta) { minDelta = delta; nearestIdx = i }
        }
        const snapX = xScale(dates[nearestIdx])
        focusLine.attr('x1', snapX).attr('x2', snapX).style('display', null)

        const total = series.reduce((sum, s) => sum + (s.values[nearestIdx] || 0), 0)
        const title = d3.timeFormat('%d %b %Y')(dates[nearestIdx])
        const rowsHtml = series.map(s => `
          <div class="posthub__chart-tooltip__row">
            <span class="posthub__chart-tooltip__swatch" style="background:${s.color}"></span>
            <span class="posthub__chart-tooltip__name">${s.name}</span>
            <span class="posthub__chart-tooltip__value">${s.values[nearestIdx] || 0}</span>
          </div>`).join('')
        const html = `
          <p class="posthub__chart-tooltip__title">${title}</p>
          ${rowsHtml}
          <div class="posthub__chart-tooltip__row posthub__chart-tooltip__row--total">
            <span class="posthub__chart-tooltip__name">Total</span>
            <span class="posthub__chart-tooltip__value">${total}</span>
          </div>`
        tooltip.show(html, event.clientX, event.clientY)
      })
      .on('mouseleave', () => {
        focusLine.style('display', 'none')
        tooltip.hide()
      })
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
