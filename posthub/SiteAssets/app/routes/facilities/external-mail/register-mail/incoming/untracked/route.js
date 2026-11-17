import { defineRoute } from '../../../../../../libs/nofbiz/nofbiz.base.js'
import { MAIL_DIRECTIONS } from '../../../../../../utils/constants.js'
import { createLogForm } from '../../../utils/logForm.js'
import { guardAccess } from '../../../../../../utils/access.js'

export default defineRoute(async (config) => {
  config.setRouteTitle('Register Incoming Mail (Untracked)')

  // Facilities route: employee+ access required
  if (!guardAccess('EMPLOYEE')) return []

  return createLogForm(config, {
    direction: MAIL_DIRECTIONS.INCOMING,
    title: 'Log Incoming Mail',
    subtitle: 'Log incoming mail for reporting. Add one row per item type.',
    backPath: 'facilities/external-mail/register-mail/incoming',
  })
})
