import { defineRoute } from '../../../../../libs/nofbiz/nofbiz.base.js'
import { LIST_EXTERNAL_REGISTERED } from '../../../../../utils/constants.js'
import { createRegisterForm } from '../../utils/registerForm.js'
import { guardAccess } from '../../../../../utils/access.js'

export default defineRoute(async (config) => {
  config.setRouteTitle('Register Registered / Legal Mail')

  // Facilities route: employee+ access required
  if (!guardAccess('EMPLOYEE')) return []
  return createRegisterForm(config, {
    title: 'Register Registered / Legal Mail',
    subtitle: 'Register externally-tracked mail such as registered legal letters, with an external tracking ID.',
    includeExternalId: true,
    routePath: 'facilities/external-mail/register-mail/registered',
    listName: LIST_EXTERNAL_REGISTERED,
  })
})
