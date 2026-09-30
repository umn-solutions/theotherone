import { defineRoute } from '../../../../libs/nofbiz/nofbiz.base.js'
import { createLabelsRoute } from '../../utils/labelsTemplate.js'
import { INTERNAL_MAIL } from '../../../../utils/mail-context.js'

export default defineRoute(async (config) => {
  return createLabelsRoute(config, INTERNAL_MAIL, { variant: 'reprint' })
})
