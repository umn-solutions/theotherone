import { spGET } from '../libs/nofbiz/nofbiz.base.js'
import { FACILITIES_ADMIN_GROUP } from './constants.js'

/**
 * Access-control helpers.
 *
 * Group membership is resolved by the email path
 * (`sitegroups/getbyname('<group>')/users?$filter=Email eq '<email>'`) rather than
 * the siteUserId path -- this matches how on-prem membership is reliably checked
 * (and the sandbox interceptor supports the same query).
 */

/**
 * Whether the given email belongs to the Facilities admin group.
 * @param {string} email
 * @returns {Promise<boolean>}
 */
export async function isFacilitiesAdmin(email) {
  if (!email) return false
  try {
    const base = _spPageContextInfo.webAbsoluteUrl
    const safeEmail = String(email).replace(/'/g, "''")
    const url = `${base}/_api/web/sitegroups/getbyname('${FACILITIES_ADMIN_GROUP}')/users?$filter=Email eq '${safeEmail}'`
    const res = await spGET(url)
    const members = res?.value || res?.d?.results || []
    return members.some((m) => (m.Email || '').toLowerCase() === email.toLowerCase())
  } catch (err) {
    console.error('[access] isFacilitiesAdmin check failed', err)
    return false
  }
}
