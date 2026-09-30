import { defineRoute } from '../../../../libs/nofbiz/nofbiz.base.js'
import { createMailActionRoute } from '../../utils/mailActionTemplate.js'

export default defineRoute(async (config) => {
  return createMailActionRoute(config, {
    title: 'Delivery',
    subtitle: 'Deliver mail to recipients',
    backRoute: 'facilities/internal-mail',
    expectedStatuses: ['arrived', 'in transit'],
    getTargetStatus: () => 'delivered',
    requireSmartCard: true,
  })
})
