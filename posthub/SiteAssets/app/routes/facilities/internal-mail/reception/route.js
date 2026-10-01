import { defineRoute } from '../../../../libs/nofbiz/nofbiz.base.js'
import { createMailActionRoute } from '../../utils/mailActionTemplate.js'
import { getLocationValue } from '../../../../utils/user-helpers.js'
import { guardAccess } from '../../../../utils/access.js'

export default defineRoute(async (config) => {
  // Facilities route: employee+ access required
  if (!guardAccess('EMPLOYEE')) return []

  return createMailActionRoute(config, {
    title: 'Reception',
    subtitle: 'Register incoming mail at your location',
    backRoute: 'facilities/internal-mail',
    expectedStatuses: ['in transit'],
    getTargetStatus: (pkg, selectedLocation) =>
      getLocationValue(selectedLocation) === getLocationValue(pkg.DestinationLocation)
        ? 'arrived'
        : 'in transit',
  })
})
