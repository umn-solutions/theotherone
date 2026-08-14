import { defineRoute } from '../../../../libs/nofbiz/nofbiz.base.js'
import { createMailActionRoute } from '../../utils/mailActionTemplate.js'
import { getLocationValue } from '../../../../utils/user-helpers.js'

export default defineRoute(async (config) => {
  return createMailActionRoute(config, {
    title: 'Dispatch',
    subtitle: 'Dispatch mail for transport',
    backRoute: 'facilities/internal-mail',
    expectedStatuses: ['pending'],
    getTargetStatus: (pkg, selectedLocation) =>
      getLocationValue(selectedLocation) === getLocationValue(pkg.DestinationLocation)
        ? 'arrived'
        : 'in transit',
    extraUpdateFields: (_pkg, _status, now) => ({ SubmissionDate: now }),
  })
})
