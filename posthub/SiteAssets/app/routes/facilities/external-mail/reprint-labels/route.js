import { defineRoute } from '../../../../libs/nofbiz/nofbiz.base.js'
import { createLabelsRoute } from '../../utils/labelsTemplate.js'
import { EXTERNAL_MAIL } from '../../../../utils/mail-context.js'
import { guardAccess } from '../../../../utils/access.js'

export default defineRoute(async (config) => {
  // Facilities route: employee+ access required
  if (!guardAccess('EMPLOYEE')) return []

  // Search by recipient (default) or tracking ID -- see createLabelsRoute.
  return createLabelsRoute(config, EXTERNAL_MAIL, { variant: 'reprint' })
})
