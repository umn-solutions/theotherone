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
