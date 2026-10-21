// Collision-safe tracking-number generator, shared by internal (Packages) and
// external (tracked / log / batch) mail.
//
// Format: `PREFIX-YYYYMMDD-<suffix>` where <suffix> is SUFFIX_RANDOM_LEN + 2 chars:
//   - a 2-char per-session monotonic counter, so rapid same-session generation
//     (e.g. a batch loop registering N items in one submit) can never collide
//     in-process regardless of timing;
//   - SUFFIX_RANDOM_LEN crypto-random base36 chars, guarding against collisions
//     across tabs / clients on the same day.
//
// Replaces the old 5-digit `Math.random() * 100000` suffix, whose ~100k space hit
// birthday-bound collisions after only a few hundred ids in the same day. Tune the
// length via SUFFIX_RANDOM_LEN (higher = longer id, lower collision odds).

const SUFFIX_RANDOM_LEN = 6

// Seed the counter randomly so two freshly-loaded tabs don't start in lockstep.
let _counter = Math.floor(Math.random() * 1296)

function randomBase36(len) {
  const arr = new Uint8Array(len)
  const c = globalThis.crypto
  if (c && typeof c.getRandomValues === 'function') {
    c.getRandomValues(arr)
  } else {
    // Fallback for any context without Web Crypto (should not happen in Edge).
    for (let i = 0; i < len; i++) arr[i] = Math.floor(Math.random() * 256)
  }
  let out = ''
  for (let i = 0; i < len; i++) out += (arr[i] % 36).toString(36)
  return out
}

/**
 * Build a unique tracking id `PREFIX-YYYYMMDD-<suffix>`.
 *
 * @param {string} prefix  e.g. POSTHUB / EXT / BULK / BATCH
 * @param {Date} [date=new Date()]  date used for the human-readable YYYYMMDD part
 * @returns {string}
 */
export function makeTrackingId(prefix, date = new Date()) {
  const datePart = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`
  const seq = (_counter = (_counter + 1) % 1296).toString(36).padStart(2, '0')
  const suffix = `${seq}${randomBase36(SUFFIX_RANDOM_LEN)}`.toUpperCase()
  return `${prefix}-${datePart}-${suffix}`
}
