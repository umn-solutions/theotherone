/**
 * Extracts plain values from ComboBox selection(s).
 * ComboBox stores { label, value } objects; this returns an array of raw values.
 */
export function extractSelection(selection) {
  if (!selection) return []
  const arr = Array.isArray(selection) ? selection : [selection]
  return arr.map(s => s.value)
}
