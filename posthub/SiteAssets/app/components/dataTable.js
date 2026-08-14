/**
 * Generic read-only data table rendered into a mount element (chart-canvas
 * escape hatch, same host the charts use). Fully rebuilds on update().
 *
 * @param {object} args
 * @param {HTMLElement} args.container
 */
export function createDataTable({ container }) {
  function clear() { container.innerHTML = '' }

  /**
   * @param {object} spec
   * @param {Array<{key:string,label:string,align?:'left'|'right'|'center',format?:(v:any,row:object)=>string}>} spec.columns
   * @param {Array<object>} spec.rows
   * @param {object} [spec.footer]  Optional totals row (same keyed shape as a row).
   */
  function draw({ columns, rows, footer }) {
    clear()
    if (!rows || rows.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'posthub__chart-empty'
      empty.textContent = 'No data'
      container.appendChild(empty)
      return
    }

    const table = document.createElement('table')
    table.className = 'posthub__data-table'

    const thead = document.createElement('thead')
    const hr = document.createElement('tr')
    columns.forEach(c => {
      const th = document.createElement('th')
      th.textContent = c.label
      th.style.textAlign = c.align || 'left'
      hr.appendChild(th)
    })
    thead.appendChild(hr)
    table.appendChild(thead)

    const tbody = document.createElement('tbody')
    const renderRow = (r, cls) => {
      const tr = document.createElement('tr')
      if (cls) tr.className = cls
      columns.forEach(c => {
        const cell = document.createElement(c.isHeader ? 'th' : 'td')
        cell.style.textAlign = c.align || 'left'
        cell.textContent = c.format ? c.format(r[c.key], r) : (r[c.key] ?? '')
        tr.appendChild(cell)
      })
      tbody.appendChild(tr)
    }
    rows.forEach(r => renderRow(r, null))
    if (footer) renderRow(footer, 'posthub__data-table__footer')
    table.appendChild(tbody)

    container.appendChild(table)
  }

  return {
    render() { /* static until data arrives */ },
    update(spec) { draw(spec) },
    destroy() { clear() },
  }
}
