import { defineRoute } from '../../../../libs/nofbiz/nofbiz.base.js'
import { createRegisterForm } from '../utils/registerForm.js'

export default defineRoute((config) => {
  config.setRouteTitle('Register Tracked Mail')
  return createRegisterForm(config, {
    title: 'Register Tracked Mail',
    subtitle: 'Register external mail and track it internally through the mail workflow.',
    includeExternalId: false,
    routePath: 'facilities/external-mail/register-tracked',
  })
})
