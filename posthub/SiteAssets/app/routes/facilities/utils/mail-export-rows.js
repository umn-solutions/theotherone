import {
  LIST_EXTERNAL_LOG, MAIL_DIRECTIONS, DIRECTION_LABELS,
  EXTERNAL_TRACKING_ID_LABEL, EXTERNAL_TRACKING_ID_LABEL_PLURAL,
  TRACKING_NUMBER_LABEL,
  STATUS_LABELS, STATUS_DESCRIPTIONS, TIMELINE_EVENT_DESCRIPTIONS,
} from '../../../utils/constants.js'
import { getLocationValue, getUserDisplayName } from '../../../utils/user-helpers.js'
import { formatDisplayDate, formatDisplayDateTime } from '../../../utils/date-helpers.js'
import { normalizeSearchText } from '../../../utils/filter-helpers.js'

/**
 * Shared mail field accessors + XLSX row builders. Used by the internal search
 * export, the external search export/table, and the maintenance full export, so
 * every extraction of the same list has the same columns.
 *
 * Rows must carry `__listName` (see fetchTaggedItems) so external log rows can be
 * told apart from tracked collection headers.
 */

// --- External field accessors (tracked headers AND untracked log rows) ---
// Log rows lack Recipient / DestinationLocation / SubmissionDate, so derive them
// from the log's direction-aware party + office + Created.

export const isLogRow = (pkg) => pkg.__listName === LIST_EXTERNAL_LOG

export const categoriesText = (pkg) =>
  Array.isArray(pkg.Categories) ? pkg.Categories.join(', ') : (pkg.Category || '')

export const recipientText = (pkg) => (isLogRow(pkg)
  ? (pkg.Direction === MAIL_DIRECTIONS.OUTGOING ? pkg.ExternalParty : getUserDisplayName(pkg.InternalContact))
  : getUserDisplayName(pkg.Recipient)) || ''

export const destinationText = (pkg) => (isLogRow(pkg)
  ? (pkg.Direction === MAIL_DIRECTIONS.OUTGOING ? pkg.ExternalParty : getLocationValue(pkg.InternalOffice))
  : getLocationValue(pkg.DestinationLocation)) || ''

export const senderText = (pkg) => (isLogRow(pkg)
  ? (pkg.Direction === MAIL_DIRECTIONS.INCOMING ? (pkg.ExternalParty || '') : getUserDisplayName(pkg.InternalContact))
  : getUserDisplayName(pkg.Sender)) || ''

export const receivedOnText = (pkg) => formatDisplayDate(pkg.SubmissionDate || pkg.Created)

/** Non-empty text values of `field` across a tracked collection's items (log rows: none). */
const itemFieldValues = (pkg, groupedItems, field) => (isLogRow(pkg)
  ? []
  : (groupedItems.get(String(pkg.Title ?? '')) || [])
    .map((it) => String(it[field] ?? '').trim())
    .filter(Boolean))

// --- Row builders ---

/** Internal mail (Packages list) sheet rows. */
export const internalMailRows = (packages) => packages.map((pkg) => ({
  [TRACKING_NUMBER_LABEL]: pkg.Title,
  'Status': STATUS_LABELS[pkg.Status] || pkg.Status,
  'Current Location': getLocationValue(pkg.CurrentLocation),
  'Destination': getLocationValue(pkg.DestinationLocation),
  'Sender': getUserDisplayName(pkg.Sender),
  'Recipient': getUserDisplayName(pkg.Recipient),
  'Mail Details': pkg.PackageDetails || '',
  'Registered On': formatDisplayDate(pkg.Created),
  'Dispatched On': formatDisplayDate(pkg.SubmissionDate),
  'Last Modified': formatDisplayDate(pkg.LastModifiedDate),
  'Smart Card ID': pkg.SmartCardId || '',
}))

/** Column widths for the internal mail sheet (dataToXLSX columnWidths shape). */
export const INTERNAL_MAIL_COLUMN_WIDTHS = {
  [TRACKING_NUMBER_LABEL]: 28,
  'Status': 14,
  'Current Location': 22,
  'Destination': 22,
  'Sender': 28,
  'Recipient': 28,
  'Mail Details': 30,
  'Registered On': 16,
  'Dispatched On': 16,
  'Last Modified': 16,
  'Smart Card ID': 16,
}

/**
 * External mail sheet rows: tracked headers + log rows flattened into one shape.
 * `groupedItems` (Map<headerTitle, item[]>) supplies item-level SubCategory and
 * external tracking ids.
 */
export const externalMailRows = (packages, groupedItems) => packages.map((pkg) => ({
  [TRACKING_NUMBER_LABEL]: pkg.Title,
  'Type': isLogRow(pkg) ? 'Logged' : 'Tracked',
  'Status': STATUS_LABELS[pkg.Status] || pkg.Status || '',
  'Direction': pkg.Direction ? (DIRECTION_LABELS[pkg.Direction] || pkg.Direction) : '',
  'Category': categoriesText(pkg),
  'Destination': destinationText(pkg),
  'Recipient': recipientText(pkg),
  'Quantity': pkg.Quantity || '',
  'Details': pkg.PackageDetails || pkg.Description || '',
  'Received On': receivedOnText(pkg),
  'Current Location': isLogRow(pkg) ? '' : getLocationValue(pkg.CurrentLocation),
  'External Party': senderText(pkg),
  'Subcategory': isLogRow(pkg)
    ? (pkg.SubCategory || '')
    : [...new Set(itemFieldValues(pkg, groupedItems, 'SubCategory'))].join(', '),
  'Item Count': isLogRow(pkg) ? '' : (pkg.ItemCount || ''),
  [EXTERNAL_TRACKING_ID_LABEL_PLURAL]: itemFieldValues(pkg, groupedItems, 'ExternalTrackingId').join(', '),
  'Subsidiary Recipient': isLogRow(pkg) ? '' : (pkg.OffPlatformRecipient ? 'Yes' : 'No'),
  'Smart Card ID': pkg.SmartCardId || '',
  'Last Modified': formatDisplayDate(pkg.LastModifiedDate),
  'Notes': isLogRow(pkg) ? (pkg.CollectionNotes || '') : '',
  'Registered By': isLogRow(pkg) ? getUserDisplayName(pkg.RegisteredByEmail) : '',
  'Log Batch': isLogRow(pkg) ? (pkg.BatchId || '') : '',
}))

/**
 * Item-level rows (one per ExternalMailItems row) for the given collections.
 * Optional item filters further restrict which items appear:
 * - category: string[] of item categories to keep
 * - itemTrackingId: normalized (normalizeSearchText) substring of the external id
 */
export const collectionItemRows = (packages, groupedItems, { category = [], itemTrackingId = '' } = {}) => {
  const rows = []
  for (const pkg of packages) {
    if (isLogRow(pkg)) continue
    const items = groupedItems.get(String(pkg.Title ?? ''))
    if (!items || items.length === 0) continue

    for (const item of items) {
      if (category.length > 0 && !category.includes(item.Category)) continue
      if (itemTrackingId) {
        const normalizedId = normalizeSearchText(item.ExternalTrackingId)
        if (!normalizedId || !normalizedId.includes(itemTrackingId)) continue
      }
      rows.push({
        'Collection Tracking Number': pkg.Title,
        'Item Number': item.ItemNumber || '',
        'Category': item.Category || '',
        'Subcategory': item.SubCategory || '',
        'Description': item.Description || '',
        'External Party': item.FromParty || '',
        [EXTERNAL_TRACKING_ID_LABEL]: String(item.ExternalTrackingId ?? '').trim() || '',
        'Status': STATUS_LABELS[pkg.Status] || pkg.Status || '',
        'Destination': destinationText(pkg),
        'Recipient': recipientText(pkg),
        'Received On': receivedOnText(pkg),
      })
    }
  }
  return rows
}

/**
 * Timeline (TimelineEntries) rows. `mailTypeByTitle` maps a tracking number to
 * the label of the mail it belongs to (e.g. 'Internal' / 'External'); entries
 * are emitted in the given order.
 */
export const timelineRows = (entries, mailTypeByTitle) => entries.map((entry) => ({
  [TRACKING_NUMBER_LABEL]: entry.Title,
  'Mail Type': mailTypeByTitle.get(String(entry.Title ?? '')) || '',
  'Event': STATUS_LABELS[entry.Status] || entry.Status || '',
  'Event Description': TIMELINE_EVENT_DESCRIPTIONS[entry.Status] || STATUS_DESCRIPTIONS[entry.Status] || '',
  'Location': entry.Location ? getLocationValue(entry.Location) : '',
  // Legacy rows store an email string; newer rows a UserIdentity object.
  'Changed By': getUserDisplayName(entry.ChangedBy),
  'Notes': entry.Notes || '',
  'Date & Time': formatDisplayDateTime(entry.Created),
}))
