import { Router } from '../../../libs/nofbiz/nofbiz.base.js'

/**
 * Arms a navigation guard for the current route that warns the operator before
 * leaving while there is unsaved, in-memory work (e.g. scanned-but-not-yet-saved
 * mail). The guard covers in-app navigation (back button, navbar links, browser
 * back/forward) AND tab close/refresh (via the Router's `beforeunload` handler).
 *
 * The guard is automatically removed when the route is torn down, so it never
 * leaks into the next route.
 *
 * @param {object} config SPARC route config (provides `onCleanup`)
 * @param {() => boolean} isDirty Returns true while unsaved work exists. Evaluated
 *   at navigation time, so it must read live state (not a snapshot).
 * @param {string | (() => string)} message Warning shown in the "Unsaved Changes"
 *   dialog and that triggers the browser's close/refresh prompt. A function is
 *   called at navigation time so the message can reflect current counts.
 */
export function guardUnsaved(config, isDirty, message) {
  Router.setNavigationGuard(() => {
    if (!isDirty()) return true
    return typeof message === 'function' ? message() : message
  })
  config.onCleanup(() => Router.clearNavigationGuard())
}
