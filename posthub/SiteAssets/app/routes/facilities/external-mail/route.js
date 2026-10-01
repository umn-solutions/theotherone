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
  config.setRouteTitle('External Mail')

  // Facilities route: employee+ access required
  if (!guardAccess('EMPLOYEE')) return []

  const navbar = createNavbar()

  const pageHeader = new Container([
    new Container([
      new LinkButton(getIcon('arrow-go-back-line'), 'facilities', {
        class: 'posthub__home-icon',
      }),
      new Text('External Mail', {
        type: 'h1',
        class: 'posthub__page-title',
      }),
    ], { class: 'posthub__title-with-icon' }),
    new Text('Register, process, and track mail from external sources', {
      type: 'p',
      class: 'posthub__page-subtitle',
    }),
  ], { class: 'posthub__page-header' })

  const cards = [
    {
      icon: 'search-line',
      title: 'Search',
      desc: 'Search external mail by tracking number, sender, recipient, status, or location.',
      route: 'search',
    },
    {
      icon: 'route-line',
      title: 'Reroute',
      desc: 'Redirect external mail to a different destination, with a mandatory reason.',
      route: 'reroute',
    },
    {
      icon: 'inbox-line',
      title: 'Register Mail',
      desc: 'Register incoming external mail: bulk, tracked, or registered / legal.',
      route: 'register-mail',
    },
    {
      icon: 'send-plane-line',
      title: 'Dispatch',
      desc: 'Scan printed QR labels to dispatch external mail for internal delivery.',
      route: 'dispatch',
    },
    {
      icon: 'download-line',
      title: 'Reception',
      desc: 'Scan incoming external mail to confirm arrival, or pass it through.',
      route: 'reception',
    },
    {
      icon: 'check-double-line',
      title: 'Delivery',
      desc: 'Scan arrived external mail to mark it delivered, completing the workflow.',
      route: 'delivery',
    },
  ]

  const featureCards = new Container(
    cards.map(({ icon, title, desc, route }) =>
      new Container([
        new Container([getIcon(icon)], { class: 'external-mail__card-step', as: 'span' }),
        new Text(title, { type: 'h2', class: 'external-mail__card-title' }),
        new Text(desc, { type: 'p', class: 'external-mail__card-description' }),
        new LinkButton('Open', `facilities/external-mail/${route}`, {
          class: 'external-mail__card-btn',
        }),
      ], { class: 'external-mail__card' })
    ),
    { class: 'external-mail__cards' }
  )

  const bodyWrapper = new Container([featureCards], { class: 'external-mail__body' })

  const pageWrapper = new Container([pageHeader, bodyWrapper], { class: 'external-mail__wrapper' })

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
