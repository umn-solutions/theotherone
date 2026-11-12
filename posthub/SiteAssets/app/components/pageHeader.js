import { Container, Text, LinkButton, getIcon } from '../libs/nofbiz/nofbiz.base.js'

/**
 * Standard page header: back-arrow link + h1 title, optional subtitle.
 * Returns the header Container plus the subtitle Text so callers can update
 * it later via `.children` (e.g. to show the selected period).
 *
 * @param {object} args
 * @param {string} args.title
 * @param {string} [args.subtitle]
 * @param {string} args.backPath  Router path for the back arrow (e.g. 'facilities').
 * @returns {{ header: Container, subtitle: Text }}
 */
export function createPageHeader({ title, subtitle = '', backPath }) {
  const subtitleText = new Text(subtitle, { type: 'p', class: 'posthub__page-subtitle' })
  const header = new Container([
    new Container([
      new LinkButton(getIcon('arrow-go-back-line'), backPath, { class: 'posthub__home-icon' }),
      new Text(title, { type: 'h1', class: 'posthub__page-title' }),
    ], { class: 'posthub__title-with-icon' }),
    subtitleText,
  ], { class: 'posthub__page-header' })
  return { header, subtitle: subtitleText }
}
