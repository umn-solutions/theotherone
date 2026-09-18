import {
  Container,
  Text,
  Button,
  LinkButton,
  ComboBox,
  TextInput,
  TextArea,
  PeoplePicker,
  FormField,
  FieldLabel,
  Router,
  getIcon,
  Toast,
} from '../../../../libs/nofbiz/nofbiz.base.js'

import { createNavbar } from '../../../../components/navbar.js'

// Destination dropdown options (the 6 known offices). These are option values,
// not sample data. Real locations come from the Locations list once wired.
const LOCATION_OPTIONS = [
  'PORTO | URBO',
  'LISBON | TOC',
  'LISBON | TOR',
  'LISBON | ECHO',
  'LISBON | AURA',
  'LISBON | LUMNIA',
]

/**
 * Shared builder for the two tracked external-mail registration forms.
 * UI-ONLY prototype: submit is inert (no persistence, no SiteApi).
 *
 * @param {object} config SPARC route config (from defineRoute)
 * @param {object} opts
 * @param {string} opts.title            Page title / header
 * @param {string} opts.subtitle         Header subtitle
 * @param {boolean} opts.includeExternalId  When true, adds External Tracking ID + Carrier fields
 * @param {string} opts.routePath        Route path used by the "Register Another" button
 * @returns {[object, object]} [navbar, pageWrapper]
 */
export function createRegisterForm(config, { title, subtitle, includeExternalId, routePath }) {
  const navbar = createNavbar()

  // --- Form fields ---
  const categoryField = new FormField({ value: '' })
  const categoryComboBox = new ComboBox(categoryField, [], {
    allowMultiple: false,
    allowFiltering: true,
    allowCreate: true,
    placeholder: 'Select category...',
  })

  const sourceField = new FormField({ value: '' })
  const sourceComboBox = new ComboBox(sourceField, [], {
    allowMultiple: false,
    allowFiltering: true,
    allowCreate: true,
    placeholder: 'e.g. CTT, DHL, Tribunal...',
  })

  const recipientField = new FormField({ value: { value: '', label: '' } })
  const recipientPicker = new PeoplePicker(recipientField, {})

  const destinationField = new FormField({ value: '' })
  const destinationComboBox = new ComboBox(destinationField, LOCATION_OPTIONS, {
    placeholder: 'Select destination office...',
  })

  const detailsField = new FormField({ value: '' })
  const detailsTextArea = new TextArea(detailsField, { placeholder: 'Type here...', rows: 3 })

  // --- Optional external-tracking fields (registered / legal type) ---
  const extraGroups = []
  if (includeExternalId) {
    const externalIdField = new FormField({ value: '' })
    const externalIdInput = new TextInput(externalIdField, { placeholder: 'e.g. RR123456789PT' })
    const validateBtn = new Button('Validate', {
      variant: 'secondary',
      onClickHandler: () => Toast.info('ID format looks valid (prototype)'),
    })
    const externalIdRow = new Container([externalIdInput, validateBtn], {
      class: 'external-mail-form__validate-row',
    })
    extraGroups.push(new FieldLabel('External Tracking ID', externalIdRow, {
      class: 'external-mail-form__form-group',
    }))

    const carrierField = new FormField({ value: '' })
    const carrierInput = new TextInput(carrierField, { placeholder: 'Carrier / issuing authority' })
    extraGroups.push(new FieldLabel('Carrier (optional)', carrierInput, {
      class: 'external-mail-form__form-group',
    }))
  }

  // --- Success state ---
  function buildSuccessCard() {
    return new Container([
      new Text(getIcon('checkbox-circle-line'), {
        type: 'span',
        class: 'external-mail-form__success-icon',
      }),
      new Container([
        new Text('Mail Registered', { type: 'h3', class: 'external-mail-form__success-title' }),
        new Text('The external mail item has been registered (prototype -- no data stored).', {
          type: 'p',
          class: 'external-mail-form__success-text',
        }),
        new Container([
          new LinkButton('Open Tracked Dashboard', 'facilities/external-mail/tracked'),
          new Button('Register Another', {
            variant: 'primary',
            onClickHandler: () => Router.navigateTo(routePath),
          }),
        ], { class: 'external-mail-form__success-actions' }),
      ], { class: 'external-mail-form__success-body' }),
    ], { class: 'external-mail-form__success-card' })
  }

  // --- Submit (inert) ---
  const registerBtn = new Button('Register', {
    variant: 'primary',
    onClickHandler: () => {
      const rawRecipient = recipientField.value?.value ?? null
      if (!rawRecipient) {
        Toast.error('Recipient is required')
        return
      }
      Toast.success('External mail registered (prototype)')
      mainContent.children = [buildSuccessCard()]
    },
  })

  const formContent = new Container([
    new Container([
      new Text('External Mail Details', { type: 'span', class: 'external-mail-form__form-title' }),
    ], { class: 'external-mail-form__form-header' }),

    new FieldLabel('Category', categoryComboBox, { class: 'external-mail-form__form-group' }),
    new FieldLabel('External Source', sourceComboBox, { class: 'external-mail-form__form-group' }),
    new FieldLabel('Recipient Name', recipientPicker, { class: 'external-mail-form__form-group' }),
    new FieldLabel('Destination Office', destinationComboBox, { class: 'external-mail-form__form-group' }),
    ...extraGroups,
    new FieldLabel('Mail Details (optional)', detailsTextArea, { class: 'external-mail-form__form-group' }),

    registerBtn,
  ], { class: 'external-mail-form__form-content' })

  const formSection = new Container([formContent], { class: 'external-mail-form__form-section' })

  const mainContent = new Container([formSection], { class: 'external-mail-form__content' })

  const pageHeader = new Container([
    new Container([
      new LinkButton(getIcon('arrow-go-back-line'), 'facilities/external-mail', {
        class: 'posthub__home-icon',
      }),
      new Text(title, { type: 'h1', class: 'posthub__page-title' }),
    ], { class: 'posthub__title-with-icon' }),
    new Text(subtitle, { type: 'p', class: 'posthub__page-subtitle' }),
  ], { class: 'posthub__page-header' })

  const bodyWrapper = new Container([mainContent], { class: 'external-mail-form__body' })
  const pageWrapper = new Container([pageHeader, bodyWrapper], { class: 'external-mail-form__wrapper' })

  return [navbar, pageWrapper]
}
