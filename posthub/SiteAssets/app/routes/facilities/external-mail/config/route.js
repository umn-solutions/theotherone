import {
  defineRoute,
  Container,
  Text,
  LinkButton,
  TabGroup,
  getIcon,
  Toast,
  Router,
  SiteApi,
  CurrentUser,
} from '../../../../libs/nofbiz/nofbiz.base.js'

import { createNavbar } from '../../../../components/navbar.js'
import { isFacilitiesAdmin } from '../../../../utils/access.js'
import {
  LIST_CATEGORIES,
  LIST_EXTERNAL_SOURCES,
  LIST_CARRIERS,
} from '../../../../utils/constants.js'
import { createConfigListManager } from '../utils/configListManager.js'

export default defineRoute(async (config) => {
  config.setRouteTitle('External Mail Configuration')

  const navbar = createNavbar()
  const user = new CurrentUser()

  // Admin-only: Facilities managers manage the External Mail option lists.
  const admin = await isFacilitiesAdmin(user.get('email'))
  if (!admin) {
    Toast.error('Facilities admin access required')
    Router.navigateTo('facilities')
    return [navbar, new Container([])]
  }

  const siteApi = new SiteApi()

  const pageHeader = new Container([
    new Container([
      new LinkButton(getIcon('arrow-go-back-line'), 'facilities', {
        class: 'posthub__home-icon',
      }),
      new Text('External Mail Configuration', { type: 'h1', class: 'posthub__page-title' }),
    ], { class: 'posthub__title-with-icon' }),
    new Text('Manage the categories, external sources, and carriers offered on the external mail forms.', {
      type: 'p',
      class: 'posthub__page-subtitle',
    }),
  ], { class: 'posthub__page-header' })

  const categories = createConfigListManager(siteApi, {
    listName: LIST_CATEGORIES, singular: 'Category', plural: 'Categories', key: 'categories',
  })
  const sources = createConfigListManager(siteApi, {
    listName: LIST_EXTERNAL_SOURCES, singular: 'External Source', plural: 'External Sources', key: 'sources',
  })
  const carriers = createConfigListManager(siteApi, {
    listName: LIST_CARRIERS, singular: 'Carrier', plural: 'Carriers', key: 'carriers',
  })

  await Promise.all([categories.reload(), sources.reload(), carriers.reload()])

  const tabGroup = new TabGroup(
    [categories.tab, sources.tab, carriers.tab],
    { selectedTabKey: 'categories', class: 'external-mail-config__tabs' },
  )

  const contentArea = new Container([pageHeader, tabGroup], { class: 'posthub__page-content external-mail-config__page' })

  return [navbar, contentArea, categories.deleteModal, sources.deleteModal, carriers.deleteModal]
})
