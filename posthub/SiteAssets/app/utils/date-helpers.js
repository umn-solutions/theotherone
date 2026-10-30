import { __dayjs } from '../libs/nofbiz/nofbiz.base.js'

export const DAYJS_FORMAT = 'DD-MM-YYYY'

export function parseFilterDate(str) {
  if (!str) return null
  const parsed = __dayjs(str, DAYJS_FORMAT, true)
  return parsed.isValid() ? parsed : null
}

export function toISOStart(str) {
  const parsed = parseFilterDate(str)
  return parsed ? parsed.format('YYYY-MM-DD') + 'T00:00:00Z' : null
}

export function toISOEnd(str) {
  const parsed = parseFilterDate(str)
  return parsed ? parsed.format('YYYY-MM-DD') + 'T23:59:59Z' : null
}

export function defaultDateFrom(daysBack = 30) {
  return __dayjs().subtract(daysBack, 'day').format(DAYJS_FORMAT)
}

export function defaultDateTo() {
  return __dayjs().format(DAYJS_FORMAT)
}

/**
 * Builds a CAML View query filtering by a date-range on the given field.
 *
 * @param {string} from  Start date in DD-MM-YYYY format.
 * @param {string} to    End date in DD-MM-YYYY format.
 * @param {string} fieldName  SharePoint internal field name (e.g. 'SubmissionDate', 'Created').
 * @param {boolean} includeEmpty  When true, adds an OR clause for empty values so
 *   items without the field set (e.g. pending packages with no SubmissionDate) are
 *   still returned.
 * @returns {string|undefined}  CAML `<View>` string, or undefined when no bounds.
 */
export function buildDateRangeCaml(from, to, fieldName, includeEmpty) {
  const fromISO = toISOStart(from)
  const toISO_ = toISOEnd(to)
  if (!fromISO && !toISO_) return undefined

  const fromClause = fromISO
    ? `<Geq><FieldRef Name='${fieldName}'/><Value Type='Text'>${fromISO}</Value></Geq>`
    : ''
  const toClause = toISO_
    ? `<Leq><FieldRef Name='${fieldName}'/><Value Type='Text'>${toISO_}</Value></Leq>`
    : ''

  const rangeClause = fromClause && toClause
    ? `<And>${fromClause}${toClause}</And>`
    : fromClause || toClause

  let where = rangeClause
  if (includeEmpty) {
    const emptyClause = `<Eq><FieldRef Name='${fieldName}'/><Value Type='Text'></Value></Eq>`
    where = `<Or>${rangeClause}${emptyClause}</Or>`
  }

  return `<View><Query><Where>${where}</Where></Query></View>`
}
