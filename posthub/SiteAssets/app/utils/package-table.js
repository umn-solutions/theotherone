import { Container, Text, CheckBox, FormField } from '../libs/nofbiz/nofbiz.base.js'

/**
 * Creates a SPARC Container-based table from column definitions and package data.
 *
 * @param {object} options
 * @param {{ label: string, render: (pkg: object) => object }[]} options.columns
 * @param {object[]} options.packages
 * @param {(pkg: object) => void} [options.onRowClick] - Row click handler. Takes
 *   precedence over selectable's row-toggle when both are set.
 * @param {string} [options.tableClass] - Extra CSS class appended to posthub__table
 * @param {boolean} [options.selectable] - Prepend an include/exclude checkbox column
 *   (plus a select-all checkbox in the header). All rows start selected. Clicking
 *   anywhere on a row toggles it (unless onRowClick is set).
 * @param {(selected: object[]) => void} [options.onSelectionChange] - Called with the
 *   currently selected packages whenever the selection changes (selectable mode only).
 * @returns {Container}
 */
export function createPackageTable({
  columns,
  packages,
  onRowClick,
  tableClass,
  selectable = false,
  onSelectionChange,
}) {
  const keyOf = (pkg) => pkg.Id
  const selected = new Set(packages.map(keyOf)) // default: all selected
  const rowFields = new Map()
  const rowChecks = new Map()
  let selectAllField = null
  let selectAllCheck = null
  let syncing = false

  const notify = () => {
    if (onSelectionChange) {
      onSelectionChange(packages.filter((p) => selected.has(keyOf(p))))
    }
  }

  // FormControl does not re-render itself when its FormField changes
  // programmatically, so reflect programmatic toggles in the DOM by hand.
  const syncCheck = (check) => {
    if (check?.isAlive) check.render()
  }

  // Keep the header checkbox in sync when individual rows change.
  const refreshSelectAll = () => {
    if (!selectAllField) return
    const allOn = packages.length > 0 && selected.size === packages.length
    if (selectAllField.value !== allOn) {
      syncing = true
      selectAllField.value = allOn
      syncing = false
      syncCheck(selectAllCheck)
    }
  }

  // --- Header ---
  const headerCells = []
  if (selectable) {
    selectAllField = new FormField({ value: true })
    selectAllField.subscribe(() => {
      if (syncing) return
      const on = selectAllField.value
      syncing = true
      for (const [key, field] of rowFields) {
        field.value = on
        if (on) selected.add(key)
        else selected.delete(key)
        syncCheck(rowChecks.get(key))
      }
      syncing = false
      notify()
    })
    selectAllCheck = new CheckBox(selectAllField, {})
    headerCells.push(
      new Container([selectAllCheck], {
        class: 'posthub__table-header posthub__table-checkbox-cell',
      }),
    )
  }
  headerCells.push(
    ...columns.map((col) => new Text(col.label, { type: 'span', class: 'posthub__table-header' })),
  )
  const tableHeader = new Container(headerCells, { class: 'posthub__table-head' })

  // --- Rows ---
  const rows = packages.map((pkg) => {
    const cells = []
    let field = null
    let check = null
    if (selectable) {
      const key = keyOf(pkg)
      field = new FormField({ value: true })
      rowFields.set(key, field)
      field.subscribe(() => {
        if (field.value) selected.add(key)
        else selected.delete(key)
        if (syncing) return
        refreshSelectAll()
        notify()
      })
      check = new CheckBox(field, {})
      rowChecks.set(key, check)
      const cell = new Container([check], {
        class: 'posthub__table-cell posthub__table-checkbox-cell',
      })
      // The checkbox toggles itself natively; stop the click here so it does
      // not also reach the row handler below (which would toggle it back).
      cell.setEventHandler('click', (e) => e.stopPropagation())
      cells.push(cell)
    }
    cells.push(...columns.map((col) => col.render(pkg)))
    const row = new Container(cells, { class: 'posthub__table-row' })
    if (onRowClick) {
      row.setEventHandler('click', () => onRowClick(pkg))
    } else if (selectable) {
      // Clicking anywhere on the row toggles its selection.
      row.setEventHandler('click', () => {
        field.value = !field.value
        syncCheck(check)
      })
    }
    return row
  })
  const tableBody = new Container(rows, { class: 'posthub__table-body' })

  const classes = ['posthub__table', tableClass].filter(Boolean).join(' ')
  return new Container([tableHeader, tableBody], { class: classes })
}
