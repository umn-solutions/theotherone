import { Toast, Router } from '../../../libs/nofbiz/nofbiz.base.js'
import { SELECT_WORKING_OFFICE_FIRST } from '../../../utils/copy.js'

// Session-scoped: intentionally survives route navigations.
// Set once at internal-mail hub, consumed by dispatch/reception/delivery routes.
let _hubLocation = null

export function getHubLocation() { return _hubLocation }
export function setHubLocation(location) { _hubLocation = location }
export function isHubLocationSet() { return _hubLocation !== null }

/**
 * Guard for screens that record the working office (scan, reroute, register).
 * When none is chosen yet, warns and sends the user to `hubPath`, whose hub
 * opens the working-office dialog.
 *
 * @param {string} hubPath  Router path of the mail hub (ctx.basePath).
 * @returns {boolean} true when a working office is set and the screen may load.
 */
export function requireHubLocation(hubPath) {
  if (isHubLocationSet()) return true
  Toast.warning(SELECT_WORKING_OFFICE_FIRST)
  Router.navigateTo(hubPath)
  return false
}
