import { sendEmail, __dayjs, SiteApi, CurrentUser, UserIdentity, escapeHtml, Toast } from '../../../libs/nofbiz/nofbiz.base.js'
import {
  LIST_PACKAGES, LIST_TIMELINE_ENTRIES, LIST_EXTERNAL_ITEMS, LIST_EXTERNAL_PACKAGES,
  TIMELINE_EVENT_CHASE, TIMELINE_EVENT_ARRIVAL_NOTICE, TIMELINE_EVENT_REPRINT,
} from '../../../utils/constants.js'
import { getUserEmail, getLocationValue } from '../../../utils/user-helpers.js'
import { printQrLabel } from './qrLabelPrint.js'

/**
 * Deletes a package and all of its TimelineEntries rows (FK = Title). Works for
 * internal packages and external tracked collections (`__listName` =
 * ExternalMailPackages), whose ExternalMailItems line items are removed too.
 * Child rows go first so no orphaned audit/item rows remain if the header
 * delete then fails.
 *
 * @param {import('../../../libs/nofbiz/nofbiz.base.js').SiteApi} siteApi
 * @param {{ Id: number, Title: string, __listName?: string, ['odata.etag']?: string }} pkg
 */
export async function deletePackageWithTimeline(siteApi, pkg) {
  const childLists = [LIST_TIMELINE_ENTRIES]
  if (pkg.__listName === LIST_EXTERNAL_PACKAGES) childLists.push(LIST_EXTERNAL_ITEMS)

  for (const listName of childLists) {
    const rows = await siteApi.list(listName).getItems({ Title: pkg.Title })
    for (const row of rows) {
      await siteApi.list(listName).deleteItem(row.Id, row['odata.etag'])
    }
  }
  await siteApi.list(pkg.__listName || LIST_PACKAGES).deleteItem(pkg.Id, pkg['odata.etag'])
}

/**
 * Records a non-status event (chase, reprint) on the shared timeline so it
 * surfaces in the detail-panel feed. The action it describes has already happened,
 * so a logging failure never throws: it is logged and the caller carries on.
 *
 * @param {{ Title: string, CurrentLocation?: any }} pkg
 * @param {string} event  One of the TIMELINE_EVENT_* constants
 * @param {string} [notes]
 * @returns {Promise<void>}
 */
export async function logTimelineEvent(pkg, event, notes = '') {
  try {
    await new SiteApi().list(LIST_TIMELINE_ENTRIES).createItem({
      Title: pkg.Title,
      Status: event,
      Location: getLocationValue(pkg.CurrentLocation) || '',
      ChangedBy: UserIdentity.fromCurrentUser(new CurrentUser()),
      Notes: notes,
    })
  } catch (err) {
    console.error('[logTimelineEvent] failed to log timeline entry', { title: pkg.Title, event, err })
  }
}

/**
 * Detail-panel action that reprints a package's QR label and records it on the
 * timeline. Shared by the internal and external search routes.
 *
 * @param {object} printContainer SPARC Container with class mail-labels__print-container
 * @returns {{ label: string, onClick: (pkg: object) => Promise<void> }}
 */
export function createReprintLabelAction(printContainer) {
  return {
    label: 'Reprint Label',
    onClick: (pkg) => {
      printQrLabel(pkg, printContainer)
      return logTimelineEvent(pkg, TIMELINE_EVENT_REPRINT, 'Standard format')
    },
  }
}

/**
 * Emails a package's recipient about their mail, listing a tracked collection's
 * line items, then records the event on the timeline. Uses SPARC's sendEmail
 * (SP.Utilities.Utility.SendEmail). Throws SystemError on bad/unresolved
 * recipients or send failure -- callers must catch + log.
 *
 * @param {{ Title: string, Recipient?: any, RecipientEmail?: string, Direction?: string }} pkg
 * @param {object} email
 * @param {string} email.subject
 * @param {string} email.message   Already-escaped HTML for the opening paragraph
 * @param {string} email.event     One of the TIMELINE_EVENT_* constants
 * @param {string} email.eventNote Timeline note; the recipient address is appended
 * @returns {Promise<import('../../../libs/nofbiz/nofbiz.base.js').SendEmailResult>}
 */
async function sendRecipientEmail(pkg, { subject, message, event, eventNote }) {
  const siteApi = new SiteApi()
  const to = getUserEmail(pkg.Recipient) || pkg.RecipientEmail

  // For external incoming tracked collections, fetch line items so the
  // email lists the full contents. A fetch failure must never
  // block the email -- fall back to the simple message.
  let itemsHtml = ''
  if (pkg.Direction) {
    try {
      const items = await siteApi.list(LIST_EXTERNAL_ITEMS).getItems(
        { Title: pkg.Title },
        { orderBy: { field: 'Created', ascending: true } },
      )
      if (items.length) {
        const renderItemLi = (item, i) => {
          const parts = []
          if (item.Description) parts.push(escapeHtml(item.Description))
          if (item.Category) {
            let cat = escapeHtml(item.Category)
            if (item.SubCategory) cat += ` / ${escapeHtml(item.SubCategory)}`
            parts.push(`Category: ${cat}`)
          }
          if (item.FromParty) parts.push(`From: ${escapeHtml(item.FromParty)}`)
          if (item.ExternalTrackingId) parts.push(`External Tracking ID: ${escapeHtml(item.ExternalTrackingId)}`)
          return `<li><strong>Item ${i + 1}</strong>${parts.length ? ': ' + parts.join(' | ') : ''}</li>`
        }
        itemsHtml = '<p>This package contains the following item(s):</p>'
          + `<ul>${items.map(renderItemLi).join('')}</ul>`
      }
    } catch (err) {
      console.error('[sendRecipientEmail] failed to load collection items', { title: pkg.Title, err })
    }
  }

  const result = await sendEmail({ to, subject, body: `<p>${message}</p>${itemsHtml}` })

  await logTimelineEvent(pkg, event, `${eventNote} ${to}`)

  return result
}

/**
 * Emails a package's recipient that their (arrived) mail is ready for pickup.
 * Identical whether triggered individually (side panel) or in bulk (maintenance).
 *
 * @param {{ Title: string, LastModifiedDate?: string }} pkg
 * @returns {Promise<import('../../../libs/nofbiz/nofbiz.base.js').SendEmailResult>}
 */
export function sendChaseEmail(pkg) {
  const since = pkg.LastModifiedDate
    ? __dayjs(pkg.LastModifiedDate).format('DD/MM/YYYY')
    : 'recently'
  return sendRecipientEmail(pkg, {
    subject: `Mail ready for pickup: ${pkg.Title}`,
    message: `Your item ${escapeHtml(pkg.Title)} is ready for pickup since ${escapeHtml(since)}.`,
    event: TIMELINE_EVENT_CHASE,
    eventNote: 'Pickup reminder emailed to',
  })
}

/**
 * Mail-action `afterUpdate` hook: emails the recipient of each item that just
 * reached `arrived`. Off-platform recipients have no address and are skipped. The
 * status change has already saved, so a send failure only warns: Chase can resend.
 *
 * @param {{ pkg: object, newStatus: string }[]} results
 * @returns {Promise<void>}
 */
export async function notifyArrivals(results) {
  const arrived = results
    .filter(({ pkg, newStatus }) => newStatus === 'arrived' && hasChaseableRecipient(pkg))
    .map(({ pkg }) => pkg)

  const outcomes = await Promise.allSettled(arrived.map((pkg) => sendRecipientEmail(pkg, {
    subject: `Mail arrived: ${pkg.Title}`,
    message: `Your item ${escapeHtml(pkg.Title)} has arrived at ${escapeHtml(getLocationValue(pkg.CurrentLocation) || 'its destination office')} and is ready for pickup.`,
    event: TIMELINE_EVENT_ARRIVAL_NOTICE,
    eventNote: 'Arrival notification emailed to',
  })))

  const failed = arrived.filter((pkg, i) => {
    if (outcomes[i].status === 'fulfilled') return false
    console.error('[notifyArrivals] arrival email failed', { title: pkg.Title, err: outcomes[i].reason })
    return true
  })
  if (failed.length) {
    Toast.warning(`Mail updated, but the arrival email failed for: ${failed.map((p) => p.Title).join(', ')}. Use Chase to resend.`)
  }
}

/**
 * True when a tracked external item can be chased by email. Off-platform
 * (subsidiary) recipients have no account/email to chase, so they are excluded.
 *
 * @param {{ OffPlatformRecipient?: boolean|string, Recipient?: any, RecipientEmail?: string }} pkg
 * @returns {boolean}
 */
export function hasChaseableRecipient(pkg) {
  const isOffPlatform = pkg.OffPlatformRecipient === true || pkg.OffPlatformRecipient === 'true'
  return !isOffPlatform && Boolean(getUserEmail(pkg.Recipient) || pkg.RecipientEmail)
}

/**
 * Detail-panel "Chase" action: sends the chase email with Toast feedback and
 * closes the panel on success. Pass directly as a panel action's onClick.
 *
 * @param {object} pkg
 * @param {{ close: () => void }} ctx
 */
export async function chaseFromPanel(pkg, { close }) {
  const loading = Toast.loading('Sending chase email...')
  try {
    await sendChaseEmail(pkg)
    loading.success('Chase email sent')
    close()
  } catch (err) {
    console.error('[chaseFromPanel] chase email failed', { title: pkg.Title, err })
    loading.error('Failed to send chase email')
  }
}
