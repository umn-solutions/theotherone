import { defineRoute } from '../../../../libs/nofbiz/nofbiz.base.js'
import { createRerouteRoute } from '../../utils/rerouteTemplate.js'
import { EXTERNAL_MAIL } from '../../../../utils/mail-context.js'
import { guardAccess } from '../../../../utils/access.js'

export default defineRoute(async (config) => {
  // Facilities route: employee+ access required
  if (!guardAccess('EMPLOYEE')) return []

  return createRerouteRoute(config, EXTERNAL_MAIL)
})
