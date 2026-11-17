import { hucre, downloadFile } from '../libs/nofbiz/nofbiz.excelparser.js'

/**
 * Multi-sheet XLSX writer. Accepts an array of { name, rows } sheet descriptors
 * and triggers a browser download. Each `rows` entry is a plain object whose
 * keys become column headers.
 *
 * Extracted from routes/facilities/reports/utils/report-export.js so it can be
 * shared across route groups (reports, external-mail search, etc.).
 */

const DEFAULT_COL_WIDTH = 14
const FIRST_COL_WIDTH = 26
// Excel caps a sheet at 1,048,576 rows; one is the header row.
const XLSX_MAX_DATA_ROWS = 1048575
const XLSX_MAX_SHEET_NAME = 31

/** Split sheets over Excel's row cap into "Name (1)", "Name (2)", ... */
function splitOversizedSheets(sheets) {
  return sheets.flatMap(({ name, rows }) => {
    if (rows.length <= XLSX_MAX_DATA_ROWS) return [{ name, rows }]
    const parts = []
    for (let i = 0; i < rows.length; i += XLSX_MAX_DATA_ROWS) {
      const suffix = ` (${parts.length + 1})`
      parts.push({
        name: name.slice(0, XLSX_MAX_SHEET_NAME - suffix.length) + suffix,
        rows: rows.slice(i, i + XLSX_MAX_DATA_ROWS),
      })
    }
    return parts
  })
}

/**
 * Write sheets to one XLSX and download it.
 * @param {Array<{ name: string, rows: object[] }>} sheets  Empty sheets get a "No data" row;
 *   sheets over Excel's row limit are split across numbered sheets.
 * @param {string} filename
 */
export async function downloadWorkbook(sheets, filename) {
  const workbook = {
    sheets: splitOversizedSheets(sheets).map(({ name, rows }) => {
      const data = rows.length ? rows : [{ Info: 'No rows match the selected filters.' }]
      const keys = Object.keys(data[0])
      return {
        name,
        columns: keys.map((key, i) => ({
          header: key,
          key,
          width: Math.max(i === 0 ? FIRST_COL_WIDTH : DEFAULT_COL_WIDTH, key.length + 2),
        })),
        data,
      }
    }),
  }
  const bytes = await hucre.writeXlsx(workbook)
  downloadFile(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), filename)
}
