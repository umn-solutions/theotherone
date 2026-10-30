import { defineRoute } from '../../../../../../libs/nofbiz/nofbiz.base.js'
import { MAIL_DIRECTIONS } from '../../../../../../utils/constants.js'
import { createTrackedCollectionForm } from '../../../utils/trackedCollectionForm.js'
import { guardAccess } from '../../../../../../utils/access.js'

export default defineRoute(async (config) => {
  config.setRouteTitle('Register Tracked Mail')

  // Facilities route: employee+ access required
  if (!guardAccess('EMPLOYEE')) return []

  return createTrackedCollectionForm(config, {
    direction: MAIL_DIRECTIONS.INCOMING,
    routePath: 'facilities/external-mail/register-mail/incoming/tracked',
  })
})
