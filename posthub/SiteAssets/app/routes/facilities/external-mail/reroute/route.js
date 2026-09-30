import { defineRoute } from '../../../../libs/nofbiz/nofbiz.base.js'
import { createRerouteRoute } from '../../utils/rerouteTemplate.js'
import { EXTERNAL_MAIL } from '../../../../utils/mail-context.js'

export default defineRoute(async (config) => {
  return createRerouteRoute(config, EXTERNAL_MAIL)
})
