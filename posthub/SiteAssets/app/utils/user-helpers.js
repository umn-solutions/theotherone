/**
 * Backward-compatible helpers for reading Sender/Recipient fields.
 * Old packages store plain email strings; new packages store UserIdentity objects
 * (auto-parsed from JSON by ListApi: { email, displayName }).
 */

export function getUserEmail(field) {
  if (typeof field === 'string') return field
  return field?.email || ''
}

export function getUserDisplayName(field) {
  if (typeof field === 'string') return field
  return field?.displayName || field?.email || ''
}

export function getNameFromEmail(email) {
  if (!email || typeof email !== 'string') return ''
  const local = email.split('@')[0]
  return local
    .split(/[._-]/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export function getLocationValue(field) {
  if (typeof field === 'string') return field || '--'
  return field?.value || field?.label || '--'
}
