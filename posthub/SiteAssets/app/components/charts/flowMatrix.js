/**
 * Cross-tab heatmap table: rows x columns with row/column totals.
 * Default use is the Origin -> Destination flow between buildings (square,
 * `buildings` on both axes); pass `rows`/`cols` for a rectangular cross-tab
 * (e.g. category x office). Cell intensity scales with count (brand-green tint).
 * The bottom-right grand-total cell is intentionally left blank.
 *
 * Builds a DOM <table> into the given mount element (the same chart-canvas
 * escape hatch the d3 charts use). Fully rebuilds on update().
 *
 * @param {object} args
 * @param {HTMLElement} args.container
 * @param {(b:string)=>string} [args.labelFormatter]  Short column label (and row label unless rowLabelFormatter given).
 * @param {(b:string)=>string} [args.rowLabelFormatter]
 * @param {{ corner?: string, rowTotal?: string, colTotal?: string, cell?: string }} [args.labels]
 *   Corner caption, row-total header, column-total row caption, tooltip connector.
 */
export function createFlowMatrix({ container, labelFormatter = (b) => b, rowLabelFormatter, labels = {} }) {
  const rowLabel = rowLabelFormatter || labelFormatter
  const text = { corner: 'From \\ To', rowTotal: 'Sent', colTotal: 'Received', cell: 'to', ...labels }
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

  function draw(rows, cols, matrix) {
    clear()
    if (!rows?.length || !cols?.length) {
      const empty = document.createElement('div')
      empty.className = 'posthub__chart-empty'
      empty.textContent = 'No data'
      container.appendChild(empty)
      return
    }

    let max = 0
    for (const row of matrix) for (const v of row) if (v > max) max = v
    const colTotals = cols.map((_, j) => rows.reduce((s, __, i) => s + matrix[i][j], 0))
    const rowTotals = rows.map((_, i) => matrix[i].reduce((s, v) => s + v, 0))
    const square = rows === cols

    const table = document.createElement('table')
    table.className = 'posthub__flow-matrix'

    // Header
    const thead = document.createElement('thead')
    const hr = document.createElement('tr')
    const corner = document.createElement('th')
    corner.className = 'posthub__flow-matrix__corner'
    corner.textContent = text.corner
    hr.appendChild(corner)
    cols.forEach(b => {
      const th = document.createElement('th')
      th.textContent = labelFormatter(b)
      th.title = b
      hr.appendChild(th)
    })
    const thTotal = document.createElement('th')
    thTotal.className = 'posthub__flow-matrix__total-head'
    thTotal.textContent = text.rowTotal
    hr.appendChild(thTotal)
    thead.appendChild(hr)
    table.appendChild(thead)

    // Body
    const tbody = document.createElement('tbody')
    rows.forEach((origin, i) => {
      const tr = document.createElement('tr')
      const rh = document.createElement('th')
      rh.className = 'posthub__flow-matrix__row-head'
      rh.textContent = rowLabel(origin)
      rh.title = origin
      tr.appendChild(rh)
      cols.forEach((dest, j) => {
        const td = document.createElement('td')
        const v = matrix[i][j]
        const { bg, fg } = cellStyle(v, max)
        td.style.background = bg
        td.style.color = fg
        if (square && i === j) td.classList.add('posthub__flow-matrix__diag')
        td.textContent = v ? String(v) : '-'
        td.title = `${origin} ${text.cell} ${dest}: ${v}`
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
    fh.textContent = text.colTotal
    ftr.appendChild(fh)
    colTotals.forEach(v => {
      const td = document.createElement('td')
      td.className = 'posthub__flow-matrix__total-cell'
      td.textContent = String(v)
      ftr.appendChild(td)
    })
    // Grand-total corner intentionally blank (keeps the grid aligned).
    const cornerCell = document.createElement('td')
    cornerCell.className = 'posthub__flow-matrix__total-cell'
    ftr.appendChild(cornerCell)
    tbody.appendChild(ftr)

    table.appendChild(tbody)
    container.appendChild(table)
  }

  return {
    render() { /* static: nothing until data arrives */ },
    update({ buildings, rows = buildings, cols = buildings, matrix }) { draw(rows, cols, matrix) },
    destroy() { clear() },
  }
}
