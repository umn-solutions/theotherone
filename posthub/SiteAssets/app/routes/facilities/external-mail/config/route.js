import {
  defineRoute,
  Container,
  Text,
  LinkButton,
  TabGroup,
  getIcon,
  SiteApi,
} from '../../../../libs/nofbiz/nofbiz.base.js'

import { createNavbar } from '../../../../components/navbar.js'
import { guardAccess } from '../../../../utils/access.js'
import {
  LIST_CATEGORIES,
  LIST_SUBCATEGORIES,
  LIST_EXTERNAL_SOURCES,
} from '../../../../utils/constants.js'
import { createConfigListManager } from '../utils/configListManager.js'
import { loadCategoryOptions } from '../utils/external-data.js'

export default defineRoute(async (config) => {
  config.setRouteTitle('External Mail Configuration')

  const navbar = createNavbar()

  // Admin-only: Facilities managers manage the External Mail option lists.
  if (!guardAccess('ADMIN')) return [navbar, new Container([])]

  const siteApi = new SiteApi()

  const pageHeader = new Container([
    new Container([
      new LinkButton(getIcon('arrow-go-back-line'), 'facilities', {
        class: 'posthub__home-icon',
      }),
      new Text('External Mail Configuration', { type: 'h1', class: 'posthub__page-title' }),
    ], { class: 'posthub__title-with-icon' }),
    new Text('Manage the categories, subcategories, and external sources offered on the external mail forms.', {
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

  // Subcategories are scoped under a parent Category -- the selector lists the
  // active categories (add a category first; it appears here on next page load).
  const categoryTitles = await loadCategoryOptions(siteApi)
  const subcategories = createConfigListManager(siteApi, {
    listName: LIST_SUBCATEGORIES, singular: 'Subcategory', plural: 'Subcategories', key: 'subcategories',
    parent: { options: categoryTitles, label: 'Category' },
  })

  await Promise.all([categories.reload(), subcategories.reload(), sources.reload()])

  const tabGroup = new TabGroup(
    [categories.tab, subcategories.tab, sources.tab],
    { selectedTabKey: 'categories', class: 'external-mail-config__tabs' },
  )

  const contentArea = new Container([pageHeader, tabGroup], { class: 'posthub__page-content external-mail-config__page' })

  return [navbar, contentArea, categories.deleteModal, subcategories.deleteModal, sources.deleteModal]
})
