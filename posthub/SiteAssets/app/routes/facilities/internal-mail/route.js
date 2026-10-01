import {
  defineRoute,
  Container,
  Text,
  LinkButton,
  getIcon,
} from '../../../libs/nofbiz/nofbiz.base.js'

import { createNavbar } from '../../../components/navbar.js'
import { isHubLocationSet } from '../utils/hubLocation.js'
import { createHubLocationModal } from '../utils/hubLocationModal.js'
import { guardAccess } from '../../../utils/access.js'

export default defineRoute(async (config) => {
  config.setRouteTitle('Internal Mail')

  // Facilities route: employee+ access required
  if (!guardAccess('EMPLOYEE')) return []

  const navbar = createNavbar()

  const pageHeader = new Container([
    new Container([
      new LinkButton(getIcon('arrow-go-back-line'), 'facilities', {
        class: 'posthub__home-icon'
      }),
      new Text('Internal Mail', {
        type: 'h1',
        class: 'posthub__page-title'
      }),
    ], { class: 'posthub__title-with-icon' }),
    new Text('Select an action to process mail', {
      type: 'p',
      class: 'posthub__page-subtitle'
    }),
  ], { class: 'posthub__page-header' })

  const steps = [
    { icon: 'printer-line', title: 'Print Labels', desc: 'Search for a sender, select their pending mail, and generate QR code labels for physical attachment', route: 'print-labels' },
    { icon: 'send-plane-line', title: 'Dispatch', desc: 'Scan recently printed QR labels to dispatch the mail for transportation', route: 'dispatch' },
    { icon: 'inbox-line', title: 'Reception', desc: 'Scan incoming mail at your office to confirm arrival at the destination, or just a pass-through location', route: 'reception' },
    { icon: 'check-double-line', title: 'Delivery', desc: 'Scan arrived mail to mark them as delivered, completing the workflow', route: 'delivery' },
  ]

  const featureCards = new Container(
    steps.map(({ icon, title, desc, route }) =>
      new Container([
        new Container([getIcon(icon)], { class: 'internal-mail__card-step', as: 'span' }),
        new Text(title, { type: 'h2', class: 'internal-mail__card-title' }),
        new Text(desc, { type: 'p', class: 'internal-mail__card-description' }),
        new LinkButton('Open', `facilities/internal-mail/${route}`, {
          class: 'internal-mail__card-btn'
        }),
      ], { class: 'internal-mail__card' })
    ),
    { class: 'internal-mail__cards' }
  )

  const utilitySection = new Container([
    new Container([
      new Container([getIcon('search-line')], { class: 'internal-mail__card-step', as: 'span' }),
      new Text('Search Mail', { type: 'h2', class: 'internal-mail__card-title' }),
      new Text('Search all mail by date, tracking number, sender, recipient, status, or location', {
        type: 'p',
        class: 'internal-mail__card-description'
      }),
      new LinkButton('Open', 'facilities/internal-mail/search-package', {
        class: 'internal-mail__card-btn'
      }),
    ], { class: 'internal-mail__card' }),
    new Container([
      new Container([getIcon('printer-line')], { class: 'internal-mail__card-step', as: 'span' }),
      new Text('Reprint Labels', { type: 'h2', class: 'internal-mail__card-title' }),
      new Text('Reprint damaged or unreadable QR code labels for items already in the system', {
        type: 'p',
        class: 'internal-mail__card-description'
      }),
      new LinkButton('Open', 'facilities/internal-mail/reprint-labels', {
        class: 'internal-mail__card-btn'
      }),
    ], { class: 'internal-mail__card' }),
    new Container([
      new Container([getIcon('route-line')], { class: 'internal-mail__card-step', as: 'span' }),
      new Text('Reroute', { type: 'h2', class: 'internal-mail__card-title' }),
      new Text('Redirect mail back to the sender or to a different destination, with a mandatory explanation', {
        type: 'p',
        class: 'internal-mail__card-description'
      }),
      new LinkButton('Open', 'facilities/internal-mail/reroute', {
        class: 'internal-mail__card-btn'
      }),
    ], { class: 'internal-mail__card' }),
  ], { class: 'internal-mail__utility-section' })

  const bodyWrapper = new Container([featureCards], {
    class: 'internal-mail__body',
  })

  const pageWrapper = new Container([
    pageHeader,
    utilitySection,
    bodyWrapper,
  ], { class: 'internal-mail__wrapper' })

  // Location selector modal (mandatory on first visit) -- shared hub helper
  let locationModal = null
  if (!isHubLocationSet()) {
    locationModal = await createHubLocationModal()
    setTimeout(() => locationModal.open(), 0)
  }

  const result = [navbar, pageWrapper]
  if (locationModal) result.push(locationModal)
  return result
})
