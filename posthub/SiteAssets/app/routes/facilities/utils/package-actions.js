import { sendEmail, __dayjs } from '../../../libs/nofbiz/nofbiz.base.js'
import { LIST_PACKAGES, LIST_TIMELINE_ENTRIES } from '../../../utils/constants.js'
import { getUserEmail } from '../../../utils/user-helpers.js'

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
  const to = getUserEmail(pkg.Recipient) || pkg.RecipientEmail
  const since = pkg.LastModifiedDate
    ? __dayjs(pkg.LastModifiedDate).format('DD/MM/YYYY')
    : 'recently'

  return sendEmail({
    to,
    subject: `Mail ready for pickup: ${pkg.Title}`,
    body: `Your item ${pkg.Title} is ready for pickup since ${since}.`,
  })
}
