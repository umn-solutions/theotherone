import { d3 } from '../../libs/nofbiz/nofbiz.analytics.js'
import { tooltip } from './tooltip.js'

/**
 * Donut chart with center label and hover tooltips.
 *
 * @param {object} args
 * @param {HTMLElement} args.container
 * @param {Array<{label:string,value:number,color:string}>} args.data
 * @param {object} [args.options]
 * @param {string} [args.options.centerLabel]    Big center text (e.g. "73%").
 * @param {string} [args.options.centerSublabel] Small text below center (e.g. "Delivered").
 */
export function createDonutChart({ container, data, options = {} }) {
  let _data = data
  let _opts = options
  let _ro = null
  let _svg = null

  function clear() {
    if (_svg) {
      _svg.remove()
      _svg = null
    }
    container.innerHTML = ''
  }

  function draw() {
    clear()
    const w = container.clientWidth
    const h = container.clientHeight
    if (w <= 0 || h <= 0) return

    const total = _data.reduce((acc, d) => acc + (d.value || 0), 0)
    const size = Math.min(w, h)
    const outerR = size / 2 - 4
    const innerR = outerR * 0.62

    const svg = d3.select(container).append('svg')
      .attr('class', 'posthub__chart-svg')
      .attr('viewBox', `${-w / 2} ${-h / 2} ${w} ${h}`)
      .attr('preserveAspectRatio', 'xMidYMid meet')
    _svg = svg

    if (total <= 0) {
      svg.append('text')
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .attr('class', 'posthub__chart-donut__center-sub')
        .text('No data')
      return
    }

    const pie = d3.pie().value(d => d.value || 0).sort(null)
    const arc = d3.arc().innerRadius(innerR).outerRadius(outerR).padAngle(0.012).cornerRadius(2)
    const arcLift = d3.arc().innerRadius(innerR).outerRadius(outerR + 6).padAngle(0.012).cornerRadius(2)

    const arcs = pie(_data.map((d, i) => ({ ...d, _i: i })))

    svg.selectAll('path.posthub__chart-donut__arc')
      .data(arcs)
      .enter()
      .append('path')
      .attr('class', 'posthub__chart-donut__arc')
      .attr('fill', d => d.data.color || '#ccc')
      .attr('d', arc)
      .on('mouseenter', function (event, d) {
        d3.select(this).transition().duration(120).attr('d', arcLift)
        const pct = total > 0 ? Math.round((d.data.value / total) * 100) : 0
        tooltip.show(
          `<p class="posthub__chart-tooltip__title">${d.data.label}</p>
           <div class="posthub__chart-tooltip__row">
             <span class="posthub__chart-tooltip__swatch" style="background:${d.data.color}"></span>
             <span class="posthub__chart-tooltip__name">count</span>
             <span class="posthub__chart-tooltip__value">${d.data.value}</span>
           </div>
           <div class="posthub__chart-tooltip__row">
             <span class="posthub__chart-tooltip__swatch" style="visibility:hidden"></span>
             <span class="posthub__chart-tooltip__name">share</span>
             <span class="posthub__chart-tooltip__value">${pct}%</span>
           </div>`,
          event.clientX, event.clientY,
        )
      })
      .on('mousemove', (event) => tooltip.move(event.clientX, event.clientY))
      .on('mouseleave', function () {
        d3.select(this).transition().duration(120).attr('d', arc)
        tooltip.hide()
      })

    if (_opts.centerLabel) {
      svg.append('text')
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .attr('class', 'posthub__chart-donut__center')
        .attr('y', _opts.centerSublabel ? -6 : 0)
        .text(_opts.centerLabel)
    }
    if (_opts.centerSublabel) {
      svg.append('text')
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .attr('class', 'posthub__chart-donut__center-sub')
        .attr('y', 14)
        .text(_opts.centerSublabel)
    }
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

  function destroy() {
    if (_ro) { _ro.disconnect(); _ro = null }
    clear()
    tooltip.hide()
  }

  return { render, update, destroy }
}
