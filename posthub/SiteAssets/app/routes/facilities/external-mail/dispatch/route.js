import { defineRoute } from '../../../../libs/nofbiz/nofbiz.base.js'
import { createMailActionRoute } from '../../utils/mailActionTemplate.js'
import { getLocationValue } from '../../../../utils/user-helpers.js'
import { EXTERNAL_MAIL } from '../../../../utils/mail-context.js'
import { guardAccess } from '../../../../utils/access.js'

export default defineRoute(async (config) => {
  // Facilities route: employee+ access required
  if (!guardAccess('EMPLOYEE')) return []

  return createMailActionRoute(config, {
    title: 'Dispatch',
    subtitle: 'Dispatch external mail for internal delivery',
    backRoute: 'facilities/external-mail',
    expectedStatuses: ['pending'],
    getTargetStatus: (pkg, selectedLocation) =>
      getLocationValue(selectedLocation) === getLocationValue(pkg.DestinationLocation)
        ? 'arrived'
        : 'in transit',
    extraUpdateFields: (_pkg, _status, now) => ({ SubmissionDate: now }),
    ctx: EXTERNAL_MAIL,
  })
})
