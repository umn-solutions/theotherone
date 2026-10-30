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
      wide: true,
    },
    {
      icon: 'printer-line',
      title: 'Reprint Labels',
      desc: 'Reprint a QR label by searching its tracking number.',
      route: 'reprint-labels',
    },
    {
      icon: 'inbox-line',
      title: 'Register Mail',
      desc: 'Register incoming or outgoing external mail -- tracked (QR label) or as a quick log.',
      route: 'register-mail',
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
      desc: 'Scan external mail to deliver it. Off-platform recipients route via courier handover + signed proof.',
      route: 'delivery',
    },
  ]

  const featureCards = new Container(
    cards.map(({ icon, title, desc, route, wide }) =>
      new Container([
        new Container([getIcon(icon)], { class: 'external-mail__card-step', as: 'span' }),
        new Text(title, { type: 'h2', class: 'external-mail__card-title' }),
        new Text(desc, { type: 'p', class: 'external-mail__card-description' }),
        new LinkButton('Open', `facilities/external-mail/${route}`, {
          class: 'external-mail__card-btn',
        }),
      ], { class: wide ? 'external-mail__card external-mail__card--wide' : 'external-mail__card' })
    ),
    { class: 'external-mail__cards' }
  )

  const bodyWrapper = new Container([featureCards], { class: 'external-mail__body' })

  const pageWrapper = new Container([pageHeader, bodyWrapper], { class: 'external-mail__wrapper' })

  // Location selector modal (mandatory on first visit) -- shared hub helper
  let locationModal = null
  if (!isHubLocationSet()) {
    locationModal = await createHubLocationModal()
    const openTimer = setTimeout(() => locationModal.open(), 0)
    config.onCleanup(() => clearTimeout(openTimer))
  }

  const result = [navbar, pageWrapper]
  if (locationModal) result.push(locationModal)
  return result
})
