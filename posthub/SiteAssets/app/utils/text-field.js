import { Toast } from '../libs/nofbiz/nofbiz.base.js'

/**
 * Guards for user-entered text before it is written to SharePoint.
 *
 * SharePoint rejects a write with HTTP 500 "A text field contains invalid data"
 * when a value:
 *   - exceeds 255 characters in a single-line Text field, or
 *   - contains characters that are invalid in XML 1.0 (C0 control chars other
 *     than tab/LF/CR, U+FFFE/U+FFFF, lone surrogates). Barcode scanners emit
 *     GS (\x1D) inside GS1 carrier codes, and text pasted from Office/PDF can
 *     carry vertical tabs (\x0B) or form feeds (\x0C).
 */

export const SP_TEXT_MAX_LENGTH = 255

const INVALID_XML_CHARS =
  /[\x00-\x08\x0B\x0C\x0E-\x1F￾￿]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g

/**
 * Strips XML-invalid characters and trims. Line breaks are kept -- use for
 * multi-line (Note) fields.
 * @param {unknown} raw
 * @returns {string}
 */
export function cleanText(raw) {
  return String(raw ?? '').replace(INVALID_XML_CHARS, '').trim()
}

/**
 * Tells the user which fields had hidden characters removed by cleanText /
 * cleanLine, so they can double-check a scanned or pasted value. Non-blocking:
 * the cleaned values are still saved. Call with the RAW (uncleaned) values.
 * @param {Record<string, unknown>} rawFields  label -> raw value
 * @returns {string[]} labels that contained invalid characters
 */
export function notifyRemovedChars(rawFields) {
  const affected = Object.entries(rawFields)
    .filter(([, raw]) => String(raw ?? '').search(INVALID_XML_CHARS) !== -1)
    .map(([label]) => label)
  if (affected.length) {
    console.warn('[text-field] removed invalid characters', { fields: affected })
    Toast.warning(`Hidden characters (from a scanner or pasted text) were removed from: ${affected.join(', ')}. Please check these values.`)
  }
  return affected
}

/**
 * cleanText plus whitespace collapse (no line breaks) -- use for single-line
 * Text fields.
 * @param {unknown} raw
 * @returns {string}
 */
export function cleanLine(raw) {
  return cleanText(raw).replace(/\s+/g, ' ')
}

/**
 * First "<label> is too long" message for values over their limit, or '' when
 * all fit.
 * @param {Record<string, string>} fields  label -> cleaned value
 * @param {number} [max]
 * @returns {string}
 */
export function tooLongMessage(fields, max = SP_TEXT_MAX_LENGTH) {
  const hit = Object.entries(fields).find(([, value]) => value.length > max)
  return hit ? `${hit[0]} is too long (${hit[1].length}/${max} characters)` : ''
}

/**
 * Joins values with ", " while the result fits in `max`; the remainder is
 * summarised as " +N more". For denormalised summary fields that grow with the
 * number of items.
 * @param {string[]} values
 * @param {number} max
 * @returns {string}
 */
export function joinWithinLimit(values, max) {
  let out = ''
  for (let i = 0; i < values.length; i++) {
    const next = out ? `${out}, ${values[i]}` : values[i]
    const suffix = i < values.length - 1 ? ` +${values.length - i - 1} more` : ''
    if ((next + suffix).length > max) {
      const rest = ` +${values.length - i} more`
      return out ? `${out}${rest}` : `${values[i].slice(0, max - rest.length)}${rest}`
    }
    out = next
  }
  return out
}
