import { defineRoute } from '../../../../../libs/nofbiz/nofbiz.base.js'
import { MAIL_DIRECTIONS } from '../../../../../utils/constants.js'
import { createLogForm } from '../../utils/logForm.js'
import { guardAccess } from '../../../../../utils/access.js'

export default defineRoute(async (config) => {
  config.setRouteTitle('Register Outgoing Mail')

  // Facilities route: employee+ access required
  if (!guardAccess('EMPLOYEE')) return []

  // Outgoing mail is never tracked -- it is always a reporting-log entry.
  return createLogForm(config, {
    direction: MAIL_DIRECTIONS.OUTGOING,
    title: 'Register Outgoing Mail',
    subtitle: 'Log outgoing external mail items for reporting. Add a row per item. Outgoing mail is never tracked.',
    backPath: 'facilities/external-mail/register-mail',
  })
})
