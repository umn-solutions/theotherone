import {
  Container,
  Text,
  Button,
  LinkButton,
  ComboBox,
  TextInput,
  NumberInput,
  PeoplePicker,
  FormField,
  FieldLabel,
  Loader,
  getIcon,
  Toast,
  SiteApi,
  CurrentUser,
  UserIdentity,
} from '../../../../libs/nofbiz/nofbiz.base.js'

import { createNavbar } from '../../../../components/navbar.js'
import {
  LIST_EXTERNAL_LOG,
  BULK_TRACKING_PREFIX,
  BULK_BATCH_PREFIX,
  MAIL_DIRECTIONS,
} from '../../../../utils/constants.js'
import {
  loadCategoryOptions,
  loadPartyOptions,
  loadLocationOptions,
  loadSubcategoryMap,
  getSubcategoryOptions,
  makeSequentialId,
} from './external-data.js'

/**
 * Shared builder for the untracked external-mail LOG forms (ingoing-untracked and
 * outgoing). Same master-detail shape as the tracked collection form, minus every
 * tracking feature (no QR label, no external tracking id / carrier, no status or
 * workflow): the internal routing (contact + office) is entered ONCE at the header,
 * and each item is a grid row. Submit writes one ExternalMailLog row per item,
 * sharing one BatchId plus the header's contact/office/direction.
 *
 * Direction sets the internal/external roles:
 *   - ingoing:  external = Sender,    internal = Recipient
 *   - outgoing: external = Recipient, internal = Sender
 *
 * Header fields: Internal contact (PeoplePicker) + Office (Locations).
 * Per-item fields: Category, SubCategory (dependent on Category), Quantity,
 * Description, External party (ComboBox allowCreate).
 *
 * @param {object} config SPARC route config (from defineRoute)
 * @param {object} opts
 * @param {'ingoing'|'outgoing'} opts.direction
 * @param {string} opts.title
 * @param {string} opts.subtitle
 * @param {string} opts.backPath   Route path for the back arrow.
 * @returns {Promise<[object, object]>} [navbar, pageWrapper]
 */
export async function createLogForm(config, { direction, title, subtitle, backPath }) {
  const siteApi = new SiteApi()
  const user = new CurrentUser()

  const isIngoing = direction === MAIL_DIRECTIONS.INGOING
  const externalRole = isIngoing ? 'Sender' : 'Recipient'
  const internalRole = isIngoing ? 'Recipient' : 'Sender'

  const [categoryOptions, partyOptions, locationOptions, subcategoryMap] = await Promise.all([
    loadCategoryOptions(siteApi),
    loadPartyOptions(siteApi),
    loadLocationOptions(siteApi),
    loadSubcategoryMap(siteApi),
  ])

  const navbar = createNavbar()

  const comboVal = (raw) => (typeof raw === 'string' ? raw : (raw?.value ?? ''))

  // --- Collection-level (header) fields: the internal side, entered once ---
  const contactField = new FormField({ value: { value: '', label: '' } })
  const contactPicker = new PeoplePicker(contactField, {})

  const officeField = new FormField({ value: '' })
  const officeComboBox = new ComboBox(officeField, locationOptions, {
    placeholder: 'Select office...',
  })

  // --- Per-item (parts) rows ---
  function createEmptyRow() {
    return {
      category: new FormField({ value: '' }),
      subcategory: new FormField({ value: '' }),
      quantity: new FormField({ value: 1 }),
      description: new FormField({ value: '' }),
      external: new FormField({ value: '' }),
    }
  }

  function freshRows() {
    return [createEmptyRow()]
  }

  function isRowEmpty(row) {
    return !comboVal(row.category.value) &&
      !comboVal(row.subcategory.value) &&
      !(row.description.value || '').trim() &&
      !comboVal(row.external.value)
  }

  let rows = freshRows()

  const gridHeader = new Container([
    new Text('Category', { type: 'span', class: 'external-mail-bulk__grid-label' }),
    new Text('Subcategory', { type: 'span', class: 'external-mail-bulk__grid-label' }),
    new Text('Quantity', { type: 'span', class: 'external-mail-bulk__grid-label' }),
    new Text('Description', { type: 'span', class: 'external-mail-bulk__grid-label' }),
    new Text(`${externalRole} (external)`, { type: 'span', class: 'external-mail-bulk__grid-label' }),
    new Text('', { type: 'span', class: 'external-mail-bulk__grid-label' }),
  ], { class: 'external-mail-bulk__grid-header' })

  const gridBody = new Container([], { class: 'external-mail-bulk__grid-body' })

  function renderGrid() {
    gridBody.children = rows.map((row) => {
      // Subcategory options depend on the row's current Category.
      const subCombo = new ComboBox(row.subcategory, getSubcategoryOptions(subcategoryMap, comboVal(row.category.value)), {
        allowMultiple: false,
        allowFiltering: true,
        allowCreate: false,
        placeholder: 'Subcategory...',
      })
      const categoryCombo = new ComboBox(row.category, categoryOptions, {
        allowMultiple: false,
        allowFiltering: true,
        allowCreate: false,
        placeholder: 'Category...',
        // Dependent dropdown: repopulate + reset Subcategory when Category changes.
        onSelectHandler: (sel) => {
          subCombo.dataset = getSubcategoryOptions(subcategoryMap, comboVal(sel))
          row.subcategory.value = ''
          subCombo.clearSelection()
          subCombo.render()
        },
      })
      const quantityInput = new NumberInput(row.quantity, { min: 1, max: 99999, step: 5, placeholder: 'Qty' })
      const descInput = new TextInput(row.description, { placeholder: 'Description' })
      // External party: free-create combo (external orgs are open-ended).
      const externalCombo = new ComboBox(row.external, partyOptions, {
        allowMultiple: false,
        allowFiltering: true,
        allowCreate: true,
        placeholder: `${externalRole}...`,
      })
      const removeBtn = new Button(getIcon('close-line'), {
        variant: 'secondary',
        class: 'external-mail-bulk__remove-btn',
        onClickHandler: () => {
          if (rows.length === 1) {
            Toast.info('At least one item is required')
            return
          }
          rows = rows.filter((r) => r !== row)
          renderGrid()
        },
      })

      return new Container([
        categoryCombo, subCombo, quantityInput, descInput, externalCombo, removeBtn,
      ], { class: 'external-mail-bulk__grid-row' })
    })
  }

  const addRowBtn = new Button('Add Item', {
    variant: 'secondary',
    onClickHandler: () => {
      rows.push(createEmptyRow())
      renderGrid()
    },
  })

  const submitBtn = new Button('Submit All', {
    variant: 'primary',
    onClickHandler: async () => {
      const rawContact = contactField.value?.value ?? null
      const contactIdentity = rawContact ? UserIdentity.fromField(rawContact) : null
      const office = comboVal(officeField.value)
      const filled = rows.filter((r) => !isRowEmpty(r))

      if (!contactIdentity) { Toast.error(`${internalRole} is required`); return }
      if (!office) { Toast.error('Office is required'); return }
      if (filled.length === 0) { Toast.error('Add at least one item before submitting'); return }
      if (filled.some((r) => !comboVal(r.category.value))) { Toast.error('Every item needs a category'); return }

      submitBtn.isLoading = true
      pageLoader.toggleLoader()
      const loading = Toast.loading(`Logging ${filled.length} item(s)...`)
      const registeredBy = user.get('email') || ''
      // One BatchId per "Submit All" groups every row of this submission so the
      // detail panel can list all items registered together (the "collection").
      const batchId = makeSequentialId(BULK_BATCH_PREFIX)

      try {
        for (const row of filled) {
          // Title is a generated tracking number (BULK-YYYYMMDD-XXXXX); the item's
          // human-readable content lives in Description.
          await siteApi.list(LIST_EXTERNAL_LOG).createItem({
            Title: makeSequentialId(BULK_TRACKING_PREFIX),
            Direction: direction,
            Category: comboVal(row.category.value),
            SubCategory: comboVal(row.subcategory.value),
            Quantity: String(row.quantity.value ?? 1),
            Description: (row.description.value || '').trim(),
            ExternalParty: comboVal(row.external.value),
            InternalContact: contactIdentity,
            InternalOffice: office,
            RegisteredByEmail: registeredBy,
            BatchId: batchId,
          })
        }
        loading.success(`${filled.length} item(s) logged`)
        rows = freshRows()
        renderGrid()
      } catch (err) {
        console.error('[register-log] createItem failed', err)
        loading.error('Failed to log some items')
      } finally {
        submitBtn.isLoading = false
        pageLoader.toggleLoader()
      }
    },
  })

  renderGrid()

  // Header (collection-level routing) card -- the internal side, entered once.
  const headerCard = new Container([
    new Container([
      new Text(`${isIngoing ? 'Incoming' : 'Outgoing'} Mail Details`, { type: 'span', class: 'external-mail-form__form-title' }),
    ], { class: 'external-mail-form__form-header' }),
    new FieldLabel(`${internalRole} (internal)`, contactPicker, { class: 'external-mail-form__form-group' }),
    new FieldLabel('Office', officeComboBox, { class: 'external-mail-form__form-group' }),
  ], { class: 'external-mail-form__form-content' })
  const headerSection = new Container([headerCard], { class: 'external-mail-form__form-section' })

  // Items grid
  const gridWrapper = new Container([gridHeader, gridBody], {
    class: 'external-mail-bulk__grid external-mail-bulk__grid--log',
  })
  const toolbar = new Container([addRowBtn, submitBtn], { class: 'external-mail-bulk__toolbar' })
  const itemsPanel = new Container([
    new Text('Items', { type: 'span', class: 'external-mail-form__form-title' }),
    gridWrapper,
    toolbar,
  ], { class: 'external-mail-bulk__panel' })

  const mainContent = new Container([headerSection, itemsPanel], { class: 'external-mail-form__content' })

  const pageHeader = new Container([
    new Container([
      new LinkButton(getIcon('arrow-go-back-line'), backPath, {
        class: 'posthub__home-icon',
      }),
      new Text(title, { type: 'h1', class: 'posthub__page-title' }),
    ], { class: 'posthub__title-with-icon' }),
    new Text(subtitle, { type: 'p', class: 'posthub__page-subtitle' }),
  ], { class: 'posthub__page-header' })

  const bodyWrapper = new Container([mainContent], { class: 'external-mail-bulk__body' })
  const pageWrapper = new Container([pageHeader, bodyWrapper], { class: 'external-mail-bulk__wrapper' })

  const pageLoader = new Loader(new Text('Saving...'), {
    animation: 'pulse',
    containerSelector: '#root',
  })

  return [navbar, pageWrapper]
}
