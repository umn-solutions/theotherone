import { defineRoute } from '../../../../libs/nofbiz/nofbiz.base.js'
import { createMailActionRoute } from '../../utils/mailActionTemplate.js'
import { getLocationValue } from '../../../../utils/user-helpers.js'
import { EXTERNAL_MAIL } from '../../../../utils/mail-context.js'
import { guardAccess } from '../../../../utils/access.js'

export default defineRoute(async (config) => {
  // Facilities route: employee+ access required
  if (!guardAccess('EMPLOYEE')) return []

  return createMailActionRoute(config, {
    title: 'Reception',
    subtitle: 'Register incoming external mail at your location',
    backRoute: 'facilities/external-mail',
    expectedStatuses: ['in transit'],
    getTargetStatus: (pkg, selectedLocation) =>
      getLocationValue(selectedLocation) === getLocationValue(pkg.DestinationLocation)
        ? 'arrived'
        : 'in transit',
    ctx: EXTERNAL_MAIL,
  })
})
