import { defineRoute } from '../../../../libs/nofbiz/nofbiz.base.js'
import { createLabelsRoute } from '../../utils/labelsTemplate.js'
import { INTERNAL_MAIL } from '../../../../utils/mail-context.js'
import { guardAccess } from '../../../../utils/access.js'

export default defineRoute(async (config) => {
  // Facilities route: employee+ access required
  if (!guardAccess('EMPLOYEE')) return []

  return createLabelsRoute(config, INTERNAL_MAIL, { variant: 'print' })
})
