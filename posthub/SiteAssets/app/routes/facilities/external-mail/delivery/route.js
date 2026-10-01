import { defineRoute } from '../../../../libs/nofbiz/nofbiz.base.js'
import { createMailActionRoute } from '../../utils/mailActionTemplate.js'
import { EXTERNAL_MAIL } from '../../../../utils/mail-context.js'
import { guardAccess } from '../../../../utils/access.js'

export default defineRoute(async (config) => {
  // Facilities route: employee+ access required
  if (!guardAccess('EMPLOYEE')) return []

  return createMailActionRoute(config, {
    title: 'Delivery',
    subtitle: 'Deliver external mail to recipients',
    backRoute: 'facilities/external-mail',
    expectedStatuses: ['arrived', 'in transit'],
    getTargetStatus: () => 'delivered',
    requireSmartCard: true,
    ctx: EXTERNAL_MAIL,
  })
})
