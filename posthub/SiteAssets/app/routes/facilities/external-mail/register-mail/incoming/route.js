import {
  defineRoute,
  Container,
  Text,
  LinkButton,
  getIcon,
} from '../../../../../libs/nofbiz/nofbiz.base.js'

import { createNavbar } from '../../../../../components/navbar.js'
import { guardAccess } from '../../../../../utils/access.js'

export default defineRoute((config) => {
  config.setRouteTitle('Register Incoming Mail')

  // Facilities route: employee+ access required
  if (!guardAccess('EMPLOYEE')) return []

  const navbar = createNavbar()

  const pageHeader = new Container([
    new Container([
      new LinkButton(getIcon('arrow-go-back-line'), 'facilities/external-mail/register-mail', {
        class: 'posthub__home-icon',
      }),
      new Text('Incoming Mail', { type: 'h1', class: 'posthub__page-title' }),
    ], { class: 'posthub__title-with-icon' }),
    new Text('Is this incoming mail tracked?', {
      type: 'p',
      class: 'posthub__page-subtitle',
    }),
  ], { class: 'posthub__page-header' })

  const cards = [
    { title: 'With Tracking', desc: 'Register a multipart collection under one QR label, then track it through dispatch, reception and delivery.', route: 'tracked' },
    { title: 'Without Tracking', desc: 'Quickly log incoming items for reporting. No QR label, no workflow.', route: 'untracked' },
  ]

  const grid = new Container(
    cards.map(({ title, desc, route }) =>
      new Container([
        new Text(title, { type: 'h2', class: 'posthub__card-title' }),
        new Text(desc, { type: 'p', class: 'posthub__card-description' }),
        new LinkButton('Open', `facilities/external-mail/register-mail/incoming/${route}`, {
          class: 'posthub__card-btn',
        }),
      ], { class: 'posthub__card' })
    ),
    { class: 'posthub__card-grid' }
  )

  const pageWrapper = new Container([pageHeader, grid], { class: 'external-mail-register__wrapper' })

  return [navbar, pageWrapper]
})
