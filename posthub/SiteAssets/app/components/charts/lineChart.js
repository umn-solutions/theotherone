import { d3 } from '../../libs/nofbiz/nofbiz.analytics.js'
import { tooltip } from './tooltip.js'

/**
 * Multi-series line chart with hover crosshair + tooltip.
 *
 * @param {object} args
 * @param {HTMLElement} args.container
 * @param {object} args.data
 * @param {Array<{name:string,color:string,points:Array<{x:Date|string,y:number,label?:string}>}>} args.data.series
 */
export function createLineChart({ container, data, options = {} }) {
  let _data = data
  let _opts = options
  let _ro = null
  let _svg = null

  function clear() { if (_svg) { _svg.remove(); _svg = null } container.innerHTML = '' }

  function toDate(v) { return v instanceof Date ? v : new Date(v) }

  function draw() {
    clear()
    const w = container.clientWidth
    const h = container.clientHeight
    if (w <= 0 || h <= 0) return

    const series = (_data?.series || []).map(s => ({
      ...s,
      points: (s.points || []).map(p => ({ ...p, _x: toDate(p.x) })),
    }))

    const svg = d3.select(container).append('svg')
      .attr('class', 'posthub__chart-svg')
      .attr('viewBox', `0 0 ${w} ${h}`)
      .attr('preserveAspectRatio', 'none')
    _svg = svg

    if (series.length === 0 || series.every(s => s.points.length === 0)) {
      svg.append('text').attr('x', w / 2).attr('y', h / 2)
        .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
        .attr('class', 'posthub__chart-donut__center-sub')
        .text('No data')
      return
    }

    const margin = { top: 14, right: 12, bottom: 24, left: 32 }
    const innerW = w - margin.left - margin.right
    const innerH = h - margin.top - margin.bottom

    const allPoints = series.flatMap(s => s.points)
    const xExtent = d3.extent(allPoints, p => p._x)
    const yMax = Math.max(1, d3.max(allPoints, p => p.y) || 0)

    const xScale = d3.scaleTime().domain(xExtent).range([0, innerW])
    const yScale = d3.scaleLinear().domain([0, yMax]).nice(3).range([innerH, 0])

    const g = svg.append('g').attr('transform', `translate(${margin.left}, ${margin.top})`)

    // Grid lines (y-axis ticks only)
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

    // X axis ticks: about 6 evenly spaced
    const xTicks = xScale.ticks(Math.min(6, allPoints.length))
    g.selectAll('text.x-tick')
      .data(xTicks)
      .enter()
      .append('text')
      .attr('class', 'x-tick')
      .attr('x', d => xScale(d))
      .attr('y', innerH + 14)
      .attr('text-anchor', 'middle')
      .text(d => d3.timeFormat('%d %b')(d))

    // Series paths
    const line = d3.line()
      .x(p => xScale(p._x))
      .y(p => yScale(p.y))
      .curve(d3.curveMonotoneX)

    series.forEach(s => {
      g.append('path')
        .attr('class', 'posthub__chart-line__path')
        .attr('stroke', s.color)
        .attr('d', line(s.points))
    })

    // Hover crosshair
    const focusLine = g.append('line')
      .attr('class', 'focus-line')
      .attr('y1', 0).attr('y2', innerH)
      .style('display', 'none')

    const focusDots = series.map(s =>
      g.append('circle')
        .attr('class', 'posthub__chart-line__dot')
        .attr('r', 4)
        .attr('fill', s.color)
        .attr('stroke', '#fff').attr('stroke-width', 1.5)
        .style('display', 'none'),
    )

    // Legend (top-right inside g)
    if (series.length > 1) {
      const legend = svg.append('g')
        .attr('class', 'posthub__chart-line__legend')
        .attr('transform', `translate(${margin.left}, 0)`)
      let xOff = 0
      series.forEach((s) => {
        const item = legend.append('g').attr('transform', `translate(${xOff}, 0)`)
        item.append('rect').attr('width', 10).attr('height', 10).attr('rx', 2).attr('fill', s.color)
          .attr('y', 2)
        const text = item.append('text').attr('x', 14).attr('y', 10).attr('dominant-baseline', 'middle').text(s.name)
        const node = text.node()
        const tw = node && node.getComputedTextLength ? node.getComputedTextLength() : 60
        xOff += 14 + tw + 16
      })
    }

    g.append('rect')
      .attr('width', innerW).attr('height', innerH)
      .attr('fill', 'transparent')
      .on('mousemove', (event) => {
        const [mx] = d3.pointer(event)
        const xVal = xScale.invert(mx)
        focusLine.attr('x1', mx).attr('x2', mx).style('display', null)

        const rows = []
        series.forEach((s, i) => {
          if (s.points.length === 0) return
          let nearest = s.points[0]
          let minDelta = Infinity
          for (const p of s.points) {
            const delta = Math.abs(p._x - xVal)
            if (delta < minDelta) { minDelta = delta; nearest = p }
          }
          const px = xScale(nearest._x)
          const py = yScale(nearest.y)
          focusDots[i].attr('cx', px).attr('cy', py).style('display', null)
          rows.push({ s, value: nearest.y, label: nearest.label || d3.timeFormat('%d %b')(nearest._x) })
        })

        const title = rows[0]?.label || ''
        const html = `<p class="posthub__chart-tooltip__title">${title}</p>` + rows.map(r => `
          <div class="posthub__chart-tooltip__row">
            <span class="posthub__chart-tooltip__swatch" style="background:${r.s.color}"></span>
            <span class="posthub__chart-tooltip__name">${r.s.name}</span>
            <span class="posthub__chart-tooltip__value">${r.value}</span>
          </div>`).join('')
        tooltip.show(html, event.clientX, event.clientY)
      })
      .on('mouseleave', () => {
        focusLine.style('display', 'none')
        focusDots.forEach(d => d.style('display', 'none'))
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
