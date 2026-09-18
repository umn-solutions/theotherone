import {
  defineRoute,
  Container,
  Text,
  LinkButton,
  getIcon,
} from '../../../libs/nofbiz/nofbiz.base.js'

import { createNavbar } from '../../../components/navbar.js'

export default defineRoute((config) => {
  config.setRouteTitle('External Mail')

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
    new Text('Register and track mail from external sources', {
      type: 'p',
      class: 'posthub__page-subtitle',
    }),
  ], { class: 'posthub__page-header' })

  const cards = [
    {
      icon: 'inbox-line',
      title: 'Register Bulk',
      desc: 'Log external mail items in bulk for reporting. These items are not tracked.',
      route: 'register-bulk',
    },
    {
      icon: 'send-plane-line',
      title: 'Register Tracked',
      desc: 'Register a single external mail item and track it internally through the mail workflow.',
      route: 'register-tracked',
    },
    {
      icon: 'mail-settings-line',
      title: 'Register Registered / Legal',
      desc: 'Register externally-tracked mail such as registered legal letters, with an external tracking ID.',
      route: 'register-registered',
    },
    {
      icon: 'dashboard-line',
      title: 'Tracked Dashboard',
      desc: 'View and filter all tracked external mail.',
      route: 'tracked',
    },
    {
      icon: 'search-line',
      title: 'Search',
      desc: 'Search external mail by tracking number, sender, recipient, status, or location.',
      route: 'search',
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

  return [navbar, pageWrapper]
})
