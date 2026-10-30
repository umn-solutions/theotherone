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
 * QR codes encode JSON like `{"TrackingNumber":"POSTHUB-20260304-00001"}`.
 * If `raw` parses as JSON with a TrackingNumber property, returns that id.
 * Otherwise returns the trimmed raw string (manual typed input).
 *
 * @param {string} raw  Raw value from paste or keyboard-wedge input.
 * @returns {string}  Extracted tracking id, or trimmed raw string.
 */
export function parseScannedTrackingId(raw) {
  if (!raw) return ''
  const trimmed = raw.trim()
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
