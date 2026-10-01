import { CurrentUser, Router, SiteApi } from '../libs/nofbiz/nofbiz.base.js'
import {
  FACILITIES_EMPLOYEE_GROUP,
  FACILITIES_ADMIN_GROUP,
} from './constants.js'

/**
 * Access-control helpers.
 *
 * WHY NOT CurrentUser.accessLevel: the group hierarchy on CurrentUser resolves
 * membership from `getuserbyid(id)/groups`, which returns [] here because
 * ensureUser yields a stale duplicate-UIL principal (reproduced by the sandbox
 * interceptor, and a real on-prem condition). So `accessLevel` is always null.
 *
 * Instead we resolve the level ONCE at app startup via the EMAIL path
 * (`SiteApi.isUserInGroup(group, email)` -> `sitegroups/getbyname/users?$filter=Email`),
 * which is reliable in the sandbox AND on-prem. The resolved rank is cached, so the
 * route-time helpers below are SYNCHRONOUS -- no `await`, no email param, no REST
 * call per check. Bootstrap both the profile and this rank via the single
 * `initCurrentUser()` entry point below, awaited once in index.js before the
 * Router is constructed.
 */

// Ordered low -> high privilege. Drives the startup resolution order.
// Users in neither group resolve to rank -1 ("regular user"): blocked from all
// facilities routes, but the ungated send-mail / my-mail routes stay reachable.
const ACCESS_HIERARCHY = [
  { groupTitle: FACILITIES_EMPLOYEE_GROUP, groupLabel: 'EMPLOYEE' },
  { groupTitle: FACILITIES_ADMIN_GROUP, groupLabel: 'ADMIN' },
]

// Numeric privilege rank per access label. Used for ">= level" comparisons so a
// higher group (ADMIN) always satisfies a lower requirement (EMPLOYEE), even when
// the user is not literally a member of the lower SharePoint group.
const RANK = { EMPLOYEE: 1, ADMIN: 2 }

// Cached privilege rank of the current user. -1 until resolveAccess() resolves it,
// which also means "no access" if resolution fails.
let _rank = -1

/**
 * One-shot user bootstrap. Loads the CurrentUser profile, then resolves the access
 * rank. Call once in index.js, before constructing the Router -- this is the single
 * entry point; nothing else should call CurrentUser.initialize() or resolveAccess().
 *
 * Why two sequential REST passes and not one: `CurrentUser.initialize()` populates
 * the profile (including the picker-canonical email) but derives its own group
 * collection from `getuserbyid(id)/groups`, which returns [] here (stale principal)
 * -- so `accessLevel` is null. `resolveAccess()` then reuses the now-known email with
 * the reliable `sitegroups` member lookup. The second pass needs the email from the
 * first, so they cannot collapse into one call -- but callers only touch this function.
 *
 * @returns {Promise<CurrentUser>} the initialized singleton
 */
export async function initCurrentUser() {
  await new CurrentUser().initialize(ACCESS_HIERARCHY)
  await resolveAccess()
  return new CurrentUser()
}

/**
 * Resolve the current user's access rank via the email path and cache it.
 * Internal -- invoked by initCurrentUser(). Idempotent.
 * @returns {Promise<void>}
 */
async function resolveAccess() {
  _rank = -1
  const email = new CurrentUser().get('email')
  if (!email) {
    console.warn('[access] no current-user email; access defaults to none')
    return
  }
  const api = new SiteApi()
  // Check from highest privilege down; the first group the user belongs to wins.
  for (let i = ACCESS_HIERARCHY.length - 1; i >= 0; i--) {
    const { groupTitle, groupLabel } = ACCESS_HIERARCHY[i]
    try {
      if (await api.isUserInGroup(groupTitle, email)) {
        _rank = RANK[groupLabel]
        break
      }
    } catch (err) {
      console.error('[access] isUserInGroup failed for group ' + groupTitle, err)
    }
  }
}

/** Whether the current user is a Facilities employee or above (synchronous). */
export function isFacilitiesEmployee() {
  return _rank >= RANK.EMPLOYEE
}

/** Whether the current user is a Facilities admin / manager (synchronous). */
export function isFacilitiesAdmin() {
  return _rank >= RANK.ADMIN
}

/**
 * Route guard. Call at the very top of a gated route's `defineRoute` callback:
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
  const allowed = _rank >= RANK[minLevel]
  if (!allowed) {
    console.warn('[access] blocked route access; required level:', minLevel)
    Router.unauthorized()
  }
  return allowed
}
