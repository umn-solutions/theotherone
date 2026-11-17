import { defineRoute } from '../../../../libs/nofbiz/nofbiz.base.js'
import { createExternalMailListView } from '../utils/mailListView.js'
import { guardAccess } from '../../../../utils/access.js'
import { PAGE_DESCRIPTIONS } from '../../../../utils/copy.js'

export default defineRoute(async (config) => {
  // Facilities route: employee+ access required
  if (!guardAccess('EMPLOYEE')) return []

  return createExternalMailListView(config, {
    title: 'Search External Mail',
    subtitle: PAGE_DESCRIPTIONS.externalSearch,
    emptyTitle: 'No Results',
    emptyBody: 'No external mail matches these filters. Widen the date range or clear filters.',
    classPrefix: 'external-mail-search',
  })
})
