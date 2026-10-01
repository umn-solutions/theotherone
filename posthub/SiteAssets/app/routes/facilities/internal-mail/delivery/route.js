import { defineRoute } from '../../../../libs/nofbiz/nofbiz.base.js'
import { createMailActionRoute } from '../../utils/mailActionTemplate.js'
import { guardAccess } from '../../../../utils/access.js'

export default defineRoute(async (config) => {
  // Facilities route: employee+ access required
  if (!guardAccess('EMPLOYEE')) return []

  return createMailActionRoute(config, {
    title: 'Delivery',
    subtitle: 'Deliver mail to recipients',
    backRoute: 'facilities/internal-mail',
    expectedStatuses: ['arrived', 'in transit'],
    getTargetStatus: () => 'delivered',
    requireSmartCard: true,
  })
})
