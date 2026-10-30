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
    title: 'Register Incoming Mail',
    subtitle: 'Log incoming external mail items for reporting. Add a row per item. These items are not tracked.',
    backPath: 'facilities/external-mail/register-mail/incoming',
  })
})
