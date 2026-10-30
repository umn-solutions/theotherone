import { sendEmail, __dayjs, SiteApi, CurrentUser, UserIdentity, escapeHtml } from '../../../libs/nofbiz/nofbiz.base.js'
import { LIST_PACKAGES, LIST_TIMELINE_ENTRIES, LIST_EXTERNAL_ITEMS, TIMELINE_EVENT_CHASE } from '../../../utils/constants.js'
import { getUserEmail, getLocationValue } from '../../../utils/user-helpers.js'

/**
 * Deletes a package and all of its TimelineEntries rows (FK = Packages.Title).
 * Timeline rows are removed first so no orphaned audit entries remain if the
 * package delete then fails.
 *
 * @param {import('../../../libs/nofbiz/nofbiz.base.js').SiteApi} siteApi
 * @param {{ Id: number, Title: string, ['odata.etag']?: string }} pkg
 */
export async function deletePackageWithTimeline(siteApi, pkg) {
  const timeline = await siteApi.list(LIST_TIMELINE_ENTRIES).getItems({ Title: pkg.Title })
  for (const entry of timeline) {
    await siteApi.list(LIST_TIMELINE_ENTRIES).deleteItem(entry.Id, entry['odata.etag'])
  }
  await siteApi.list(LIST_PACKAGES).deleteItem(pkg.Id, pkg['odata.etag'])
}

/**
 * Emails a package's recipient that their (arrived) mail is ready for pickup.
 * Uses SPARC's sendEmail (SP.Utilities.Utility.SendEmail). Throws SystemError
 * on bad/unresolved recipients or send failure -- callers must catch + log.
 *
 * @param {{ Title: string, Recipient?: any, RecipientEmail?: string, LastModifiedDate?: string }} pkg
 * @returns {Promise<import('../../../libs/nofbiz/nofbiz.base.js').SendEmailResult>}
 */
export async function sendChaseEmail(pkg) {
  const siteApi = new SiteApi()
  const to = getUserEmail(pkg.Recipient) || pkg.RecipientEmail
  const since = pkg.LastModifiedDate
    ? __dayjs(pkg.LastModifiedDate).format('DD/MM/YYYY')
    : 'recently'

  // For external incoming tracked collections, fetch line items so the
  // pickup email lists the full contents. A fetch failure must never
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
      console.error('[sendChaseEmail] failed to load collection items', { title: pkg.Title, err })
    }
  }

  const body = `<p>Your item ${escapeHtml(pkg.Title)} is ready for pickup since ${escapeHtml(since)}.</p>${itemsHtml}`

  const result = await sendEmail({
    to,
    subject: `Mail ready for pickup: ${pkg.Title}`,
    body,
  })

  // Record the chase on the shared timeline (TimelineEntries, keyed by tracking
  // number) so it surfaces in the detail-panel events feed -- identical whether
  // the chase was triggered individually (side panel) or in bulk (maintenance).
  // The email already went out, so a logging failure must not fail the chase:
  // log it and return the send result regardless.
  try {
    const user = new CurrentUser()
    await siteApi.list(LIST_TIMELINE_ENTRIES).createItem({
      Title: pkg.Title,
      Status: TIMELINE_EVENT_CHASE,
      Location: getLocationValue(pkg.CurrentLocation) || '',
      ChangedBy: UserIdentity.fromCurrentUser(user),
      Notes: `Pickup reminder emailed to ${to}`,
    })
  } catch (err) {
    console.error('[sendChaseEmail] failed to log chase timeline entry', { title: pkg.Title, err })
  }

  return result
}
