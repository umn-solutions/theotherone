import { CurrentUser, Router } from '../libs/nofbiz/nofbiz.base.js'
import {
  FACILITIES_EMPLOYEE_GROUP,
  FACILITIES_ADMIN_GROUP,
} from './constants.js'

/**
 * Access-control helpers.
 *
 * CurrentUser already resolves the user's highest-privilege group label from the
 * ACCESS_HIERARCHY passed to `initialize()` (see initCurrentUser). We read that
 * label directly via `CurrentUser().accessLevel` -- no SiteApi.isUserInGroup, no
 * email lookup, no per-check REST call. The getter is synchronous, so the helpers
 * below are synchronous too.
 */

// Ordered low -> high privilege. Passed to CurrentUser.initialize(); the getter
// `accessLevel` returns the groupLabel of the highest-privilege group the user is
// in, or null. A user in neither group -> accessLevel null -> rank 0 ("regular
// user"): blocked from facilities routes, while the ungated send-mail / my-mail /
// home routes stay reachable.
export const ACCESS_HIERARCHY = [
  { groupTitle: FACILITIES_EMPLOYEE_GROUP, groupLabel: 'EMPLOYEE' },
  { groupTitle: FACILITIES_ADMIN_GROUP, groupLabel: 'ADMIN' },
]

// Numeric privilege rank per access label. Used for ">= level" comparisons so a
// higher group (ADMIN) always satisfies a lower requirement (EMPLOYEE).
const RANK = { EMPLOYEE: 1, ADMIN: 2 }

/**
 * Initialize the CurrentUser singleton with the access hierarchy. Call once in
 * index.js, before constructing the Router. `CurrentUser.accessLevel` is resolved
 * as part of this, so the helpers below work synchronously afterwards.
 * @returns {Promise<CurrentUser>} the initialized singleton
 */
export async function initCurrentUser() {
  return new CurrentUser().initialize(ACCESS_HIERARCHY)
}

// Current user's privilege rank from accessLevel (0 = none / not a facilities group).
function currentRank() {
  return RANK[new CurrentUser().accessLevel] ?? 0
}

/**
 * Whether the current user's access level is one of the facilities levels
 * (EMPLOYEE or ADMIN). Synchronous.
 */
export function isFacilitiesEmployee() {
  return currentRank() >= RANK.EMPLOYEE
}

/** Whether the current user's access level is ADMIN. Synchronous. */
export function isFacilitiesAdmin() {
  return currentRank() >= RANK.ADMIN
}

/**
 * Route guard. Call as the FIRST statement in a gated route's `defineRoute`
 * callback:
 *
 *   if (!guardAccess('EMPLOYEE')) return []
 *
 * On failure, renders the 403 page via `Router.unauthorized()` and returns false,
 * so direct-link / hash navigation to a route the user cannot access is blocked.
 * UI entry points (nav cards) should ALSO hide links the user cannot use -- this
 * guard is the enforcement layer, conditional rendering is the UX layer.
 *
 * @param {'EMPLOYEE'|'ADMIN'} minLevel - minimum access level required
 * @returns {boolean} true if the current user meets the level
 */
export function guardAccess(minLevel) {
  const allowed = currentRank() >= RANK[minLevel]
  if (!allowed) {
    console.warn('[access] blocked route access; required level:', minLevel)
    Router.unauthorized()
  }
  return allowed
}
