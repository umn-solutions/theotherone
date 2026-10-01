import {
  defineRoute,
  Container,
  Text,
  LinkButton,
  getIcon,
} from '../../../../libs/nofbiz/nofbiz.base.js'

import { createNavbar } from '../../../../components/navbar.js'
import { guardAccess } from '../../../../utils/access.js'

export default defineRoute((config) => {
  config.setRouteTitle('Register External Mail')

  // Facilities route: employee+ access required
  if (!guardAccess('EMPLOYEE')) return []

  const navbar = createNavbar()

  const pageHeader = new Container([
    new Container([
      new LinkButton(getIcon('arrow-go-back-line'), 'facilities/external-mail', {
        class: 'posthub__home-icon',
      }),
      new Text('Register Mail', { type: 'h1', class: 'posthub__page-title' }),
    ], { class: 'posthub__title-with-icon' }),
    new Text('Choose how to register incoming external mail', {
      type: 'p',
      class: 'posthub__page-subtitle',
    }),
  ], { class: 'posthub__page-header' })

  const cards = [
    { title: 'Register Bulk', desc: 'Log external mail items in bulk for reporting. These items are not tracked.', route: 'bulk' },
    { title: 'Register Tracked', desc: 'Register a single external mail item, then print its QR label to track it internally.', route: 'tracked' },
    { title: 'Register Registered / Legal', desc: 'Register externally-tracked mail (registered legal letters) with an external tracking ID, then print its QR label.', route: 'registered' },
  ]

  const grid = new Container(
    cards.map(({ title, desc, route }) =>
      new Container([
        new Text(title, { type: 'h2', class: 'posthub__card-title' }),
        new Text(desc, { type: 'p', class: 'posthub__card-description' }),
        new LinkButton('Open', `facilities/external-mail/register-mail/${route}`, {
          class: 'posthub__card-btn',
        }),
      ], { class: 'posthub__card' })
    ),
    { class: 'posthub__card-grid' }
  )

  const pageWrapper = new Container([pageHeader, grid], { class: 'external-mail-register__wrapper' })

  return [navbar, pageWrapper]
})
