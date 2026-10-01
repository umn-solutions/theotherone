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
  Loader,
  getIcon,
  Toast,
  SiteApi,
  CurrentUser,
  UserIdentity,
} from '../../../../libs/nofbiz/nofbiz.base.js'

import { createNavbar } from '../../../../components/navbar.js'
import {
  LIST_TIMELINE_ENTRIES,
  EXTERNAL_TRACKING_PREFIX,
} from '../../../../utils/constants.js'
import { loadCategoryOptions, loadLocationOptions, loadSourceOptions, loadCarrierOptions, makeSequentialId } from './external-data.js'
import { createQrLabelCard } from '../../utils/qrLabel.js'
import { printQrLabel, printQrLabelA4 } from '../../utils/qrLabelPrint.js'
import { printQrLabelPdf } from '../../utils/qrLabelPdf.js'

/**
 * Shared builder for the two tracked external-mail registration forms
 * (register-tracked and register-registered). Persists to `listName` and
 * writes a "pending" TimelineEntries row keyed by the generated tracking number.
 *
 * @param {object} config SPARC route config (from defineRoute)
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} opts.subtitle
 * @param {boolean} opts.includeExternalId  Adds External Tracking ID + Carrier fields (required ID)
 * @param {string} opts.routePath           Path used by the "Register Another" button
 * @param {string} opts.listName            Target SP list for createItem
 * @returns {Promise<[object, object]>} [navbar, pageWrapper]
 */
export async function createRegisterForm(config, { title, subtitle, includeExternalId, routePath, listName }) {
  const siteApi = new SiteApi()
  const user = new CurrentUser()

  const [categoryOptions, sourceOptions, carrierOptions, locationOptions] = await Promise.all([
    loadCategoryOptions(siteApi),
    loadSourceOptions(siteApi),
    loadCarrierOptions(siteApi),
    loadLocationOptions(siteApi),
  ])

  const navbar = createNavbar()

  const comboVal = (raw) => (typeof raw === 'string' ? raw : (raw?.value ?? ''))

  // --- Form fields ---
  const categoryField = new FormField({ value: '' })
  const categoryComboBox = new ComboBox(categoryField, categoryOptions, {
    allowMultiple: false,
    allowFiltering: true,
    allowCreate: false,
    placeholder: 'Select category...',
  })

  const sourceField = new FormField({ value: '' })
  const sourceComboBox = new ComboBox(sourceField, sourceOptions, {
    allowMultiple: false,
    allowFiltering: true,
    allowCreate: false,
    placeholder: 'Select external source...',
  })

  const recipientField = new FormField({ value: { value: '', label: '' } })
  const recipientPicker = new PeoplePicker(recipientField, {})

  const destinationField = new FormField({ value: '' })
  const destinationComboBox = new ComboBox(destinationField, locationOptions, {
    placeholder: 'Select destination office...',
  })

  const detailsField = new FormField({ value: '' })
  const detailsTextArea = new TextArea(detailsField, { placeholder: 'Type here...', rows: 3 })

  // --- Optional external-tracking fields (registered / legal type) ---
  const extraGroups = []
  let externalIdField = null
  let carrierField = null
  if (includeExternalId) {
    externalIdField = new FormField({ value: '' })
    const externalIdInput = new TextInput(externalIdField, { placeholder: 'e.g. RR123456789PT' })
    extraGroups.push(new FieldLabel('External Tracking ID', externalIdInput, {
      class: 'external-mail-form__form-group',
    }))

    carrierField = new FormField({ value: '' })
    const carrierComboBox = new ComboBox(carrierField, carrierOptions, {
      allowMultiple: false,
      allowFiltering: true,
      allowCreate: false,
      placeholder: 'Select carrier...',
    })
    extraGroups.push(new FieldLabel('Carrier (optional)', carrierComboBox, {
      class: 'external-mail-form__form-group',
    }))
  }

  // Hidden container the print helpers populate before window.print()
  const printContainer = new Container([], { class: 'mail-labels__print-container' })

  // --- Success state: confirmation + QR label ready to print ---
  function buildSuccessCard(pkg) {
    const trackingNumber = pkg.Title
    return new Container([
      new Text(getIcon('checkbox-circle-line'), {
        type: 'span',
        class: 'external-mail-form__success-icon',
      }),
      new Container([
        new Text('Mail Registered', { type: 'h3', class: 'external-mail-form__success-title' }),
        new Text(`External mail ${trackingNumber} has been registered. Print its QR label to track it through the workflow.`, {
          type: 'p',
          class: 'external-mail-form__success-text',
        }),
        createQrLabelCard(pkg),
        new Container([
          new Button('Print', {
            onClickHandler: () => printQrLabel(pkg, printContainer),
            class: 'mail-labels__print-btn',
          }),
          new Button('Print A4', {
            onClickHandler: () => printQrLabelA4(pkg, printContainer),
            class: 'mail-labels__print-btn',
          }),
          new Button('Print PDF', {
            onClickHandler: async () => {
              try {
                await printQrLabelPdf(pkg)
              } catch (err) {
                console.error('[register-external] PDF print failed', err)
                Toast.error(err?.message ?? 'PDF print failed')
              }
            },
            class: 'mail-labels__print-btn',
          }),
        ], { class: 'external-mail-form__success-actions' }),
        new Container([
          new LinkButton('Open Search', 'facilities/external-mail/search'),
          new Button('Register Another', {
            variant: 'primary',
            onClickHandler: () => Router.navigateTo(routePath),
          }),
        ], { class: 'external-mail-form__success-actions' }),
      ], { class: 'external-mail-form__success-body' }),
    ], { class: 'external-mail-form__success-card' })
  }

  // --- Submit ---
  const registerBtn = new Button('Register', {
    variant: 'primary',
    onClickHandler: async () => {
      const rawRecipient = recipientField.value?.value ?? null
      const recipientIdentity = rawRecipient ? UserIdentity.fromField(rawRecipient) : null
      const category = comboVal(categoryField.value)
      const source = comboVal(sourceField.value)
      const destination = comboVal(destinationField.value)
      const details = detailsField.value
      const externalId = externalIdField ? (externalIdField.value || '').trim() : ''
      const carrier = carrierField ? comboVal(carrierField.value) : ''

      if (!category) { Toast.error('Category is required'); return }
      if (!source) { Toast.error('External source is required'); return }
      if (!recipientIdentity) { Toast.error('Recipient is required'); return }
      if (!destination) { Toast.error('Destination office is required'); return }
      if (includeExternalId && !externalId) { Toast.error('External tracking ID is required'); return }

      registerBtn.isLoading = true
      contentLoader.toggleLoader()
      const loading = Toast.loading('Registering mail...')

      try {
        const now = new Date()
        const trackingNumber = makeSequentialId(EXTERNAL_TRACKING_PREFIX, now)

        const payload = {
          Title: trackingNumber,
          Category: category,
          Source: source,
          // External sender is an organization, not an internal user -- store a
          // display-only identity ({email,displayName}) so name helpers render it.
          Sender: { email: '', displayName: source },
          Recipient: recipientIdentity,
          SenderEmail: '',
          RecipientEmail: recipientIdentity.email,
          Status: 'pending',
          CurrentLocation: '',
          DestinationLocation: destination,
          PackageDetails: details,
          SubmissionDate: '',
          LastModifiedDate: now.toISOString(),
        }
        if (includeExternalId) {
          payload.ExternalTrackingId = externalId
          payload.Carrier = carrier
        }

        await siteApi.list(listName).createItem(payload)

        await siteApi.list(LIST_TIMELINE_ENTRIES).createItem({
          Title: trackingNumber,
          Status: 'pending',
          Location: '',
          ChangedBy: UserIdentity.fromCurrentUser(user),
          Notes: `External mail registered (source: ${source})`,
        })

        loading.success(`Mail ${trackingNumber} registered`)
        contentLoader.toggleLoader()
        mainContent.children = [buildSuccessCard(payload)]
      } catch (err) {
        console.error('[register-external] createItem failed', err)
        loading.error('Failed to register mail')
        contentLoader.toggleLoader()
      } finally {
        registerBtn.isLoading = false
      }
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
      new LinkButton(getIcon('arrow-go-back-line'), 'facilities/external-mail/register-mail', {
        class: 'posthub__home-icon',
      }),
      new Text(title, { type: 'h1', class: 'posthub__page-title' }),
    ], { class: 'posthub__title-with-icon' }),
    new Text(subtitle, { type: 'p', class: 'posthub__page-subtitle' }),
  ], { class: 'posthub__page-header' })

  const bodyWrapper = new Container([mainContent], { class: 'external-mail-form__body' })
  const pageWrapper = new Container([pageHeader, bodyWrapper, printContainer], { class: 'external-mail-form__wrapper' })

  // Loader overlays the whole route during submit (self-attaches to #root on toggle)
  const contentLoader = new Loader(new Text('Registering mail...'), {
    animation: 'pulse',
    containerSelector: '#root',
  })

  return [navbar, pageWrapper]
}
