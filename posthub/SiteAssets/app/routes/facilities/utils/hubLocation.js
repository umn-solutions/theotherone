// Session-scoped: intentionally survives route navigations.
// Set once at internal-mail hub, consumed by dispatch/reception/delivery routes.
let _hubLocation = null

export function getHubLocation() { return _hubLocation }
export function setHubLocation(location) { _hubLocation = location }
export function isHubLocationSet() { return _hubLocation !== null }
