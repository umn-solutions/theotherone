import { defineRoute } from '../../../../libs/nofbiz/nofbiz.base.js'
import { createRegisterForm } from '../utils/registerForm.js'

export default defineRoute((config) => {
  config.setRouteTitle('Register Registered / Legal Mail')
  return createRegisterForm(config, {
    title: 'Register Registered / Legal Mail',
    subtitle: 'Register externally-tracked mail such as registered legal letters, with an external tracking ID.',
    includeExternalId: true,
    routePath: 'facilities/external-mail/register-registered',
  })
})
