import {
  Container,
  Text,
  Button,
  LinkButton,
  ComboBox,
  TextInput,
  TextArea,
  NumberInput,
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
  LIST_EXTERNAL_PACKAGES,
  LIST_EXTERNAL_ITEMS,
  LIST_TIMELINE_ENTRIES,
  EXTERNAL_TRACKING_PREFIX,
  MAIL_DIRECTIONS,
  PARTY_LABELS,
} from '../../../../utils/constants.js'
import {
  loadCategoryOptions,
  loadLocationOptions,
  loadPartyOptions,
  loadSubcategoryMap,
  createCategoryCombos,
  comboVal,
  makeSequentialId,
} from './external-data.js'
import { createQrLabelCard } from '../../utils/qrLabel.js'
import { cleanText, cleanLine, tooLongMessage, joinWithinLimit, notifyRemovedChars } from '../../../../utils/text-field.js'
import { printQrLabel, printQrLabelA4 } from '../../utils/qrLabelPrint.js'
import { printQrLabelPdf } from '../../utils/qrLabelPdf.js'

/**
 * Builder for the tracked external-mail collection form (a multipart package).
 *
 * The user registers ONE collection = ONE QR / tracking number, with routing
 * (Recipient + Destination) defined once at the collection level and MANY item
 * rows (the parts). Submit writes:
 *   - 1 header row to ExternalMailPackages (the workflow anchor, Status `pending`),
 *   - N rows to ExternalMailItems (Title = header tracking number as FK),
 *   - 1 `pending` TimelineEntries row,
 * then shows a QR label for the collection to print.
 *
 * Per-item fields: Category, SubCategory (dependent on Category), Description,
 * From (party), External Tracking ID. No Quantity.
 *
 * @param {object} config SPARC route config (from defineRoute)
 * @param {object} opts
 * @param {'incoming'} opts.direction  Only incoming mail is tracked.
 * @param {string} opts.routePath     Path used by the "Register Another" button + back arrow base.
 * @returns {Promise<[object, object]>} [navbar, pageWrapper]
 */
export async function createTrackedCollectionForm(config, { direction = MAIL_DIRECTIONS.INCOMING, routePath }) {
  const siteApi = new SiteApi()
  const user = new CurrentUser()

  const partyLabel = PARTY_LABELS[direction] || 'From'

  const [categoryOptions, locationOptions, partyOptions, subcategoryMap] = await Promise.all([
    loadCategoryOptions(siteApi),
    loadLocationOptions(siteApi),
    loadPartyOptions(siteApi),
    loadSubcategoryMap(siteApi),
  ])

  const navbar = createNavbar()

  // --- Collection-level (header) fields ---
  // Recipient: normally a PeoplePicker; when the "off-platform" toggle is on it
  // becomes a plain text box (the recipient is an internal user at a subsidiary
  // office with no platform account, so they aren't in the directory).
  const recipientField = new FormField({ value: { value: '', label: '' } })
  const recipientPicker = new PeoplePicker(recipientField, {})
  const recipientTextField = new FormField({ value: '' })
  const recipientTextInput = new TextInput(recipientTextField, { placeholder: 'Recipient name (off-platform)' })

  let offPlatform = false

  // Slot holds whichever recipient control matches the selection; swapped on change.
  const recipientSlot = new Container([recipientPicker], { class: 'external-mail-form__form-group' })

  // Segmented "In directory / Off-platform" recipient toggle (SPARC has no native Switch).
  const recipientTypeToggle = new Container([], { class: 'external-mail-form__segmented' })
  function renderRecipientType() {
    const makeBtn = (label, value) => new Button(label, {
      variant: 'secondary',
      class: `external-mail-form__seg-btn${offPlatform === value ? ' external-mail-form__seg-btn--active' : ''}`,
      onClickHandler: () => {
        if (offPlatform === value) return
        offPlatform = value
        recipientSlot.children = [offPlatform ? recipientTextInput : recipientPicker]
        renderRecipientType()
      },
    })
    recipientTypeToggle.children = [
      makeBtn('In directory', false),
      makeBtn('Off-platform', true),
    ]
  }
  renderRecipientType()

  const destinationField = new FormField({ value: '' })
  const destinationComboBox = new ComboBox(destinationField, locationOptions, {
    placeholder: 'Select destination office...',
  })

  const notesField = new FormField({ value: '' })
  const notesTextArea = new TextArea(notesField, { placeholder: 'Optional notes for the whole collection...', rows: 2 })

  // --- Per-item (parts) rows ---
  function createEmptyRow() {
    return {
      // Business-logic field, manually entered per item -- never autofilled.
      itemNumber: new FormField({ value: '' }),
      category: new FormField({ value: '' }),
      subcategory: new FormField({ value: '' }),
      description: new FormField({ value: '' }),
      from: new FormField({ value: '' }),
      externalId: new FormField({ value: '' }),
    }
  }

  function freshRows() {
    return [createEmptyRow()]
  }

  function isRowEmpty(row) {
    return !comboVal(row.category.value) &&
      !comboVal(row.subcategory.value) &&
      !(row.description.value || '').trim() &&
      !comboVal(row.from.value) &&
      !(row.externalId.value || '').trim()
  }

  let rows = freshRows()

  const gridHeader = new Container([
    new Text('Item Number', { type: 'span', class: 'external-mail-bulk__grid-label' }),
    new Text('Category', { type: 'span', class: 'external-mail-bulk__grid-label' }),
    new Text('Subcategory', { type: 'span', class: 'external-mail-bulk__grid-label' }),
    new Text('Description', { type: 'span', class: 'external-mail-bulk__grid-label' }),
    new Text(partyLabel, { type: 'span', class: 'external-mail-bulk__grid-label' }),
    new Text('Ext. Tracking ID', { type: 'span', class: 'external-mail-bulk__grid-label' }),
    new Text('', { type: 'span', class: 'external-mail-bulk__grid-label' }),
  ], { class: 'external-mail-bulk__grid-header' })

  const gridBody = new Container([], { class: 'external-mail-bulk__grid-body' })

  function renderGrid() {
    gridBody.children = rows.map((row) => {
      const [categoryCombo, subCombo] = createCategoryCombos(row, categoryOptions, subcategoryMap)
      const itemNumberInput = new NumberInput(row.itemNumber, { min: 0, step: 1, placeholder: 'Item #' })
      const descInput = new TextInput(row.description, { placeholder: 'Description' })
      const fromCombo = new ComboBox(row.from, partyOptions, {
        allowMultiple: false,
        allowFiltering: true,
        allowCreate: true,
        placeholder: `${partyLabel}...`,
      })
      const externalIdInput = new TextInput(row.externalId, { placeholder: 'e.g. RR123456789PT' })
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
        itemNumberInput, categoryCombo, subCombo, descInput, fromCombo, externalIdInput, removeBtn,
      ], { class: 'external-mail-bulk__grid-row' })
    })
  }

  function createRowFromLast() {
    const newRow = createEmptyRow()
    const src = rows[rows.length - 1]
    newRow.category.value = src.category.value
    newRow.subcategory.value = src.subcategory.value
    newRow.from.value = src.from.value
    return newRow
  }

  const addRowBtn = new Button('Add Item', {
    variant: 'secondary',
    onClickHandler: () => {
      rows.push(createRowFromLast())
      renderGrid()
    },
  })

  // Hidden container the print helpers populate before window.print()
  const printContainer = new Container([], { class: 'mail-labels__print-container' })

  // --- Success state: confirmation + QR label ready to print ---
  function buildSuccessCard(pkg, itemCount) {
    const trackingNumber = pkg.Title
    return new Container([
      new Text(getIcon('checkbox-circle-line'), {
        type: 'span',
        class: 'external-mail-form__success-icon',
      }),
      new Container([
        new Text('Collection Registered', { type: 'h3', class: 'external-mail-form__success-title' }),
        new Text(`External mail ${trackingNumber} (${itemCount} item(s)) has been registered. Print its QR label to track the collection through the workflow.`, {
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
                console.error('[register-tracked] PDF print failed', err)
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

  const submitBtn = new Button('Register Collection', {
    variant: 'primary',
    onClickHandler: async () => {
      const destination = comboVal(destinationField.value)
      const filled = rows.filter((r) => !isRowEmpty(r))

      // Recipient: free text when off-platform, otherwise a resolved internal identity.
      let recipientIdentity = null
      const recipientText = cleanLine(recipientTextField.value)
      if (offPlatform) {
        if (!recipientText) { Toast.error('Recipient name is required'); return }
        // Stored inside the Recipient identity JSON, so leave room for its wrapper.
        const nameError = tooLongMessage({ 'Recipient name': recipientText }, 200)
        if (nameError) { Toast.error(nameError); return }
      } else {
        const rawRecipient = recipientField.value?.value ?? null
        recipientIdentity = rawRecipient ? UserIdentity.fromField(rawRecipient) : null
        if (!recipientIdentity) { Toast.error('Recipient is required'); return }
      }
      if (!destination) { Toast.error('Destination office is required'); return }
      if (filled.length === 0) { Toast.error('Add at least one item before registering'); return }
      if (filled.some((r) => !comboVal(r.category.value))) { Toast.error('Every item needs a category'); return }

      // Cleaned line-item payloads (Title added at write time). Scanned/pasted text
      // can carry control chars SharePoint rejects (see utils/text-field.js).
      const items = filled.map((row) => ({
        ItemNumber: row.itemNumber.value === '' || row.itemNumber.value == null ? '' : String(row.itemNumber.value),
        Category: comboVal(row.category.value),
        SubCategory: comboVal(row.subcategory.value),
        Description: cleanText(row.description.value),
        FromParty: cleanLine(comboVal(row.from.value)),
        ExternalTrackingId: cleanLine(row.externalId.value),
      }))
      const lengthError = items.map((item, i) => tooLongMessage({
        [`Item ${i + 1}: ${partyLabel}`]: item.FromParty,
        [`Item ${i + 1}: External Tracking ID`]: item.ExternalTrackingId,
      })).find(Boolean)
      if (lengthError) { Toast.error(lengthError); return }
      notifyRemovedChars({
        ...(offPlatform ? { 'Recipient name': recipientTextField.value } : {}),
        'Collection Notes': notesField.value,
        ...Object.assign({}, ...filled.map((row, i) => ({
          [`Item ${i + 1}: Description`]: row.description.value,
          [`Item ${i + 1}: ${partyLabel}`]: comboVal(row.from.value),
          [`Item ${i + 1}: External Tracking ID`]: row.externalId.value,
        }))),
      })

      submitBtn.isLoading = true
      contentLoader.toggleLoader()
      const loading = Toast.loading('Registering collection...')

      try {
        const now = new Date()
        const trackingNumber = makeSequentialId(EXTERNAL_TRACKING_PREFIX, now)

        // Denormalized summaries for the search list view (header carries no per-item data).
        const distinctCategories = [...new Set(items.map((item) => item.Category).filter(Boolean))]
        const distinctFroms = [...new Set(items.map((item) => item.FromParty).filter(Boolean))]

        const headerPayload = {
          Title: trackingNumber,
          Direction: direction,
          // External senders are organizations, not internal users -- store a
          // display-only identity so name helpers render it on the label/search.
          // Sender is a single-line field that grows with every distinct item
          // source, so cap the summary (full list lives on the items).
          Sender: { email: '', displayName: joinWithinLimit(distinctFroms, 200) || 'External' },
          OffPlatformRecipient: offPlatform ? 'true' : 'false',
          Recipient: offPlatform ? { email: '', displayName: recipientText } : recipientIdentity,
          SenderEmail: '',
          RecipientEmail: offPlatform ? '' : recipientIdentity.email,
          // Registration puts the collection straight into the logistics flow
          // (no dispatch step for external mail).
          Status: 'in transit',
          CurrentLocation: '',
          DestinationLocation: destination,
          PackageDetails: cleanText(notesField.value),
          Categories: distinctCategories,
          ItemCount: String(filled.length),
          SubmissionDate: now.toISOString(),
          LastModifiedDate: now.toISOString(),
        }

        await siteApi.list(LIST_EXTERNAL_PACKAGES).createItem(headerPayload)

        // Line items -- Title is the FK back to the header tracking number.
        for (const item of items) {
          await siteApi.list(LIST_EXTERNAL_ITEMS).createItem({ Title: trackingNumber, ...item })
        }

        await siteApi.list(LIST_TIMELINE_ENTRIES).createItem({
          Title: trackingNumber,
          Status: 'in transit',
          Location: '',
          ChangedBy: UserIdentity.fromCurrentUser(user),
          Notes: `External mail collection registered (${filled.length} item(s))`,
        })

        loading.success(`Collection ${trackingNumber} registered`)
        contentLoader.toggleLoader()
        mainContent.children = [buildSuccessCard(headerPayload, filled.length)]
      } catch (err) {
        console.error('[register-tracked] createItem failed', err)
        loading.error('Failed to register collection')
        contentLoader.toggleLoader()
      } finally {
        submitBtn.isLoading = false
      }
    },
  })

  renderGrid()

  // Header (collection-level routing) card
  const headerCard = new Container([
    new Container([
      new Text('Collection Details', { type: 'span', class: 'external-mail-form__form-title' }),
    ], { class: 'external-mail-form__form-header' }),
    new FieldLabel('Recipient', recipientTypeToggle, { position: 'left', class: 'external-mail-form__toggle-row' }),
    new FieldLabel('Recipient Name', recipientSlot, { class: 'external-mail-form__form-group' }),
    new FieldLabel('Destination Office', destinationComboBox, { class: 'external-mail-form__form-group' }),
    new FieldLabel('Collection Notes (optional)', notesTextArea, { class: 'external-mail-form__form-group' }),
  ], { class: 'external-mail-form__form-content' })
  const headerSection = new Container([headerCard], { class: 'external-mail-form__form-section' })

  // Items grid
  const gridWrapper = new Container([gridHeader, gridBody], {
    class: 'external-mail-bulk__grid external-mail-bulk__grid--tracked',
  })
  const toolbar = new Container([addRowBtn, submitBtn], { class: 'external-mail-bulk__toolbar' })
  const itemsPanel = new Container([
    new Text('Items in this collection', { type: 'span', class: 'external-mail-form__form-title' }),
    gridWrapper,
    toolbar,
  ], { class: 'external-mail-bulk__panel' })

  const mainContent = new Container([headerSection, itemsPanel], { class: 'external-mail-form__content' })

  const pageHeader = new Container([
    new Container([
      new LinkButton(getIcon('arrow-go-back-line'), 'facilities/external-mail/register-mail/incoming', {
        class: 'posthub__home-icon',
      }),
      new Text('Register Tracked Mail', { type: 'h1', class: 'posthub__page-title' }),
    ], { class: 'posthub__title-with-icon' }),
    new Text('Register a tracked collection: one QR label covers multiple items sharing the same recipient and destination.', {
      type: 'p',
      class: 'posthub__page-subtitle',
    }),
  ], { class: 'posthub__page-header' })

  // Use the wide (75rem) bulk wrapper so the multi-column items grid has room;
  // the header card + items panel stack inside via external-mail-form__content.
  const bodyWrapper = new Container([mainContent], { class: 'external-mail-bulk__body' })
  const pageWrapper = new Container([pageHeader, bodyWrapper, printContainer], { class: 'external-mail-bulk__wrapper' })

  // Loader overlays the whole route during submit (self-attaches to #root on toggle)
  const contentLoader = new Loader(new Text('Registering collection...'), {
    animation: 'pulse',
    containerSelector: '#root',
  })

  return [navbar, pageWrapper]
}
