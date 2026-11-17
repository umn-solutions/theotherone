/**
 * Extracts plain values from ComboBox selection(s).
 * ComboBox stores { label, value } objects; this returns an array of raw values.
 */
export function extractSelection(selection) {
  if (!selection) return []
  const arr = Array.isArray(selection) ? selection : [selection]
  return arr.map(s => s.value)
}

/**
 * Extracts a tracking number from raw scanner input.
 *
 * Label QR codes encode a flat JSON object of package data, e.g.
 * `{"TrackingNumber":"POSTHUB-20260304-00001","SenderName":"...",...}` (built by
 * routes/facilities/utils/qrLabel.js). Only TrackingNumber is read here.
 * If `raw` parses as JSON with a TrackingNumber property, returns that id.
 * Otherwise returns the trimmed raw string (manual typed input).
 *
 * @param {string} raw  Raw value from paste or keyboard-wedge input.
 * @returns {string}  Extracted tracking id, or trimmed raw string.
 */
export function parseScannedTrackingId(raw) {
  if (!raw) return ''
  const trimmed = raw.trim()
  // Plain typed ids are the common case -- only QR payloads are JSON objects.
  // (Skipping the parse also keeps per-keystroke filter input from logging.)
  if (!trimmed.startsWith('{')) return trimmed
  try {
    const obj = JSON.parse(trimmed)
    if (obj && typeof obj === 'object' && obj.TrackingNumber != null) {
      return String(obj.TrackingNumber).trim()
    }
  } catch (err) {
    console.warn('[parseScannedTrackingId] not QR JSON, using raw', { raw, err })
  }
  return trimmed
}

/**
 * Makes a tracking-number TextInput accept both typing and scanning a label QR:
 * - keyboard-wedge scanner: types the QR JSON then presses Enter -> resolved on Enter
 *   (read from the DOM: the bound FormField may still be inside its debounce);
 * - pasted QR JSON -> intercepted and resolved immediately.
 * Plain typed ids also resolve on Enter. When the raw value was QR JSON, the field
 * and input are rewritten to show the clean id instead of the JSON.
 *
 * @param {object} field  FormField<string> bound to the input
 * @param {object} input  TextInput
 * @param {(id: string) => void} onResolved  Called with the clean id (Enter / QR paste).
 * @returns {(raw: string) => string} resolve(raw): normalize field + input, return the id.
 *   Use it for paths not covered here (e.g. a Search button or a field subscription).
 */
export function bindTrackingScanInput(field, input, onResolved) {
  function resolve(raw) {
    const id = parseScannedTrackingId(raw)
    if (id !== (raw ?? '').trim()) {
      field.value = id
      input.render()
    }
    return id
  }

  input.setEventHandler('paste', (ev) => {
    const raw = ev.clipboardData?.getData('text') || ''
    if (parseScannedTrackingId(raw) !== raw.trim()) {
      // QR JSON -- block the raw paste and apply the extracted id instead.
      ev.preventDefault()
      onResolved(resolve(raw))
    }
    // Plain text: default paste proceeds.
  })

  input.setEventHandler('keydown', (ev) => {
    if (ev.key !== 'Enter') return
    ev.preventDefault()
    onResolved(resolve(ev.target?.value ?? field.value ?? ''))
  })

  return resolve
}

/**
 * Normalize a value for case-insensitive, whitespace-agnostic text comparison.
 * Coerces non-strings to string first (guards against ListApi auto-parsing
 * converting numeric-looking or boolean-looking field values to non-string types).
 *
 * @param {unknown} val  Raw field value (may be string, number, boolean, object, null).
 * @returns {string}  Lowercased, trimmed, internal-whitespace-stripped string.
 */
export const normalizeSearchText = (val) =>
  String(val ?? '').trim().toLowerCase().replace(/\s+/g, '')
