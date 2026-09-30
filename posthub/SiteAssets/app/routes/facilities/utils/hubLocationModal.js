import {
  Container,
  Text,
  Modal,
  SiteApi,
  Toast,
} from '../../../libs/nofbiz/nofbiz.base.js'

import { LIST_LOCATIONS } from '../../../utils/constants.js'
import { setHubLocation } from './hubLocation.js'

/**
 * Builds the mandatory "select your current location" modal shared by the mail
 * hub landings (internal + external). Loads active locations, and on selection
 * stores the session hub location. Returns a rendered Modal -- call .open().
 * Styling: mail-hub__* classes in the global css/mail-workflow.css.
 *
 * @param {() => void} [onSelect] Optional callback after a location is chosen.
 * @returns {Promise<object>} the rendered Modal instance
 */
export async function createHubLocationModal(onSelect) {
  const siteApi = new SiteApi()

  let activeLocations = []
  try {
    activeLocations = await siteApi.list(LIST_LOCATIONS).getItems({ IsActive: 'true' })
  } catch (err) {
    console.error('[hub-modal] failed to load locations', err)
    Toast.error('Failed to load locations')
  }

  let modal = null

  const badges = activeLocations.map((loc) =>
    new Container([
      new Text(loc.Title, { type: 'span', class: 'mail-hub__badge-label' }),
    ], {
      class: 'mail-hub__badge',
      onClickHandler: () => {
        setHubLocation(loc.Title)
        modal.close()
        Toast.success(`Operating from: ${loc.Title}`)
        if (typeof onSelect === 'function') onSelect(loc.Title)
      },
    }),
  )

  const modalContent = new Container([
    new Text('Select Your Current Location', { type: 'h2', class: 'mail-hub__modal-title' }),
    new Text(
      'Choose the office you are currently working from. This location will be used for all mail operations in this session.',
      { type: 'p', class: 'mail-hub__modal-intro' },
    ),
    new Container(badges, { class: 'mail-hub__badge-grid' }),
  ], { class: 'mail-hub__modal-card' })

  modal = new Modal([modalContent], {
    backdrop: true,
    closeOnFocusLoss: false,
    class: 'mail-hub__location-modal',
  })
  modal.render()

  return modal
}
