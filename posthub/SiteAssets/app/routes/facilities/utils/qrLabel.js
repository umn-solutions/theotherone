import { Container, Text } from '../../../libs/nofbiz/nofbiz.base.js'
import { renderSVG } from '../../../libs/uqr.js'
import { getUserDisplayName, getUserEmail, getLocationValue } from '../../../utils/user-helpers.js'
import { formatDisplayDate } from '../../../utils/date-helpers.js'

// Per-value cap for the QR payload. Free-text fields (external Sender summary,
// PackageDetails) can run to hundreds of chars; capping keeps the code at a
// module size any handheld imager reads reliably at A6 label size.
const QR_VALUE_MAX = 150

/**
 * Package data encoded in the label QR. Flat object of strings, keyed by the
 * SharePoint field names. Only data fixed at registration is included -- Status
 * and CurrentLocation change after printing, so encoding them would go stale.
 * Scanners only rely on TrackingNumber (see parseScannedTrackingId and the scan
 * parsers in mailActionTemplate / rerouteTemplate).
 *
 * @param {object} pkg  Package record (internal Packages or ExternalMailPackages)
 * @returns {Record<string, string>}
 */
function buildQrPayload(pkg) {
  const fields = {
    TrackingNumber: pkg.Title,
    Direction: pkg.Direction,
    SenderName: getUserDisplayName(pkg.Sender),
    SenderEmail: getUserEmail(pkg.Sender),
    RecipientName: getUserDisplayName(pkg.Recipient),
    RecipientEmail: getUserEmail(pkg.Recipient),
    OffPlatformRecipient: String(pkg.OffPlatformRecipient) === 'true' ? 'true' : '',
    DestinationLocation: getLocationValue(pkg.DestinationLocation),
    ItemCount: pkg.ItemCount,
    PackageDetails: pkg.PackageDetails,
    RegisteredOn: formatDisplayDate(pkg.Created || pkg.SubmissionDate),
  }
  return Object.fromEntries(
    Object.entries(fields)
      .map(([key, value]) => [key, value == null ? '' : String(value).trim()])
      .filter(([, value]) => value !== '')
      .map(([key, value]) => [key, value.length > QR_VALUE_MAX ? `${value.slice(0, QR_VALUE_MAX - 3)}...` : value]),
  )
}

/**
 * Serialize the flat payload as scanner-safe JSON:
 * - Non-ASCII chars (accented names) are \u-escaped. Keyboard-wedge scanners type
 *   the QR content as keystrokes and routinely drop or garble non-ASCII keys;
 *   JSON.parse restores the original text.
 * - Braces inside values are \u-escaped too. The scan parsers split concatenated
 *   scans on `}{`, so a literal brace in e.g. PackageDetails would break a label.
 * The payload is flat, so the only structural braces are the outer pair.
 *
 * @param {Record<string, string>} payload
 * @returns {string}
 */
function encodeQrPayload(payload) {
  const inner = JSON.stringify(payload).slice(1, -1)
  const escaped = inner.replace(/[{}\u007f-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)
  return `{${escaped}}`
}

// Length tiers for label values: each step past a threshold selects a smaller
// font that allows more lines (qr-label__value--size-N in css/mail-workflow.css),
// so long entity / office names print in full instead of being cut off.
// Thresholds are sized for ALL-CAPS text (the widest case) in the ~78 mm text
// column, with headroom; the worst case of every tier together still fits the
// label height.
// Decided by length, not by DOM measurement: the print container is
// display:none on screen, so the label cannot be measured before printing.
const NAME_TIERS = [50, 80, 130]        // From / To (up to the 200-char field cap)
const DESTINATION_TIERS = [16, 32, 60]  // Destination Office (bold; full text up to ~160 chars)

function sizeTier(text, tiers) {
  const index = tiers.findIndex((max) => text.length <= max)
  return index === -1 ? tiers.length : index
}

function labelField(caption, value, { modifier = '', tiers = NAME_TIERS } = {}) {
  const text = value || '--'
  return new Container([
    new Text(caption, { type: 'span', class: 'qr-label__caption' }),
    new Text(text, { type: 'p', class: `qr-label__value qr-label__value--size-${sizeTier(text, tiers)}` }),
  ], { class: `qr-label__field${modifier ? ` qr-label__field--${modifier}` : ''}` })
}

/**
 * Creates a printable QR label card for a package: A6 landscape, QR on the left,
 * routing data on the right (destination office emphasized). The same card is
 * used for the on-screen preview and the print container.
 *
 * @param {object} pkg - Package record from SharePoint
 * @returns {Container} SPARC Container with QR code and package info
 */
export function createQrLabelCard(pkg) {
  const svgString = renderSVG(encodeQrPayload(buildQrPayload(pkg)), { ecc: 'H', border: 2 })

  return new Container([
    new Container([svgString], { class: 'qr-label__qr' }),
    new Container([
      labelField('From', getUserDisplayName(pkg.Sender)),
      labelField('To', getUserDisplayName(pkg.Recipient)),
      labelField('Destination Office', getLocationValue(pkg.DestinationLocation), { modifier: 'destination', tiers: DESTINATION_TIERS }),
      labelField('Tracking ID', pkg.Title, { modifier: 'tracking', tiers: [] }),
    ], { class: 'qr-label__info' }),
  ], { class: 'qr-label__card' })
}
