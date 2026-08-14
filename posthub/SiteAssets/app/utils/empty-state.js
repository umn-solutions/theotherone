import { Container, Text } from '../libs/nofbiz/nofbiz.base.js'

/**
 * Creates the standard empty-state card (posthub__prompt + posthub__prompt-content).
 */
export function createEmptyState(title, subtitle) {
  return new Container([
    new Container([
      new Text(title, { type: 'h2', class: 'posthub__prompt-title' }),
      new Text(subtitle, { type: 'p', class: 'posthub__prompt-subtitle' }),
    ], { class: 'posthub__prompt-content' }),
  ], { class: 'posthub__prompt' })
}
