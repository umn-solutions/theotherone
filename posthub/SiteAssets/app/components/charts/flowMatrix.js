/**
 * Origin -> Destination flow matrix rendered as a heatmap table.
 * Cell intensity scales with count (brand-green tint). Row/column totals
 * mirror the "Total enviados / Total recebidos" summary from the reference.
 *
 * Builds a DOM <table> into the given mount element (the same chart-canvas
 * escape hatch the d3 charts use). Fully rebuilds on update().
 *
 * @param {object} args
 * @param {HTMLElement} args.container
 * @param {(b:string)=>string} [args.labelFormatter]  Short header/row label.
 */
export function createFlowMatrix({ container, labelFormatter = (b) => b }) {
  function clear() { container.innerHTML = '' }

  // rgba tint from the brand green (#00965d) scaled by intensity 0..1
  function cellStyle(value, max) {
    if (!value) return { bg: 'transparent', fg: 'var(--color-fg-disabled)' }
    const t = max > 0 ? value / max : 0
    const alpha = 0.12 + 0.78 * t
    return {
      bg: `rgba(0, 150, 93, ${alpha.toFixed(3)})`,
      fg: alpha > 0.55 ? '#fff' : 'var(--color-fg-primary)',
    }
  }

  function draw(buildings, matrix) {
    clear()
    if (!buildings || buildings.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'posthub__chart-empty'
      empty.textContent = 'No data'
      container.appendChild(empty)
      return
    }

    let max = 0
    for (let i = 0; i < buildings.length; i++) {
      for (let j = 0; j < buildings.length; j++) {
        if (matrix[i][j] > max) max = matrix[i][j]
      }
    }
    const colTotals = buildings.map((_, j) => buildings.reduce((s, __, i) => s + matrix[i][j], 0))
    const rowTotals = buildings.map((_, i) => matrix[i].reduce((s, v) => s + v, 0))
    const grand = rowTotals.reduce((s, v) => s + v, 0)

    const table = document.createElement('table')
    table.className = 'posthub__flow-matrix'

    // Header
    const thead = document.createElement('thead')
    const hr = document.createElement('tr')
    const corner = document.createElement('th')
    corner.className = 'posthub__flow-matrix__corner'
    corner.textContent = 'From \\ To'
    hr.appendChild(corner)
    buildings.forEach(b => {
      const th = document.createElement('th')
      th.textContent = labelFormatter(b)
      th.title = b
      hr.appendChild(th)
    })
    const thTotal = document.createElement('th')
    thTotal.className = 'posthub__flow-matrix__total-head'
    thTotal.textContent = 'Sent'
    hr.appendChild(thTotal)
    thead.appendChild(hr)
    table.appendChild(thead)

    // Body
    const tbody = document.createElement('tbody')
    buildings.forEach((origin, i) => {
      const tr = document.createElement('tr')
      const rh = document.createElement('th')
      rh.className = 'posthub__flow-matrix__row-head'
      rh.textContent = labelFormatter(origin)
      rh.title = origin
      tr.appendChild(rh)
      buildings.forEach((dest, j) => {
        const td = document.createElement('td')
        const v = matrix[i][j]
        const { bg, fg } = cellStyle(v, max)
        td.style.background = bg
        td.style.color = fg
        if (i === j) td.classList.add('posthub__flow-matrix__diag')
        td.textContent = v ? String(v) : '-'
        td.title = `${origin} to ${dest}: ${v}`
        tr.appendChild(td)
      })
      const rt = document.createElement('td')
      rt.className = 'posthub__flow-matrix__total-cell'
      rt.textContent = String(rowTotals[i])
      tr.appendChild(rt)
      tbody.appendChild(tr)
    })

    // Column totals row
    const ftr = document.createElement('tr')
    ftr.className = 'posthub__flow-matrix__total-row'
    const fh = document.createElement('th')
    fh.className = 'posthub__flow-matrix__row-head'
    fh.textContent = 'Received'
    ftr.appendChild(fh)
    colTotals.forEach(v => {
      const td = document.createElement('td')
      td.className = 'posthub__flow-matrix__total-cell'
      td.textContent = String(v)
      ftr.appendChild(td)
    })
    const grandCell = document.createElement('td')
    grandCell.className = 'posthub__flow-matrix__total-cell posthub__flow-matrix__grand'
    grandCell.textContent = String(grand)
    ftr.appendChild(grandCell)
    tbody.appendChild(ftr)

    table.appendChild(tbody)
    container.appendChild(table)
  }

  return {
    render() { /* static: nothing until data arrives */ },
    update({ buildings, matrix }) { draw(buildings, matrix) },
    destroy() { clear() },
  }
}
