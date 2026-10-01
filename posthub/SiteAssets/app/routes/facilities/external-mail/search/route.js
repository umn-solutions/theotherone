import { defineRoute } from '../../../../libs/nofbiz/nofbiz.base.js'
import { createExternalMailListView } from '../utils/mailListView.js'
import { guardAccess } from '../../../../utils/access.js'

export default defineRoute(async (config) => {
  // Facilities route: employee+ access required
  if (!guardAccess('EMPLOYEE')) return []

  return createExternalMailListView(config, {
    title: 'Search External Mail',
    subtitle: 'Search external mail by tracking number, sender, recipient, status, or location.',
    emptyTitle: 'No results',
    emptyBody: 'No external mail matches your search criteria. Try adjusting the filters.',
    classPrefix: 'external-mail-search',
    enableReprint: true,
  })
})
