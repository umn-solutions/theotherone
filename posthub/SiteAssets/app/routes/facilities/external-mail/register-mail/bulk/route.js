import {
  defineRoute,
  Container,
  Text,
  Button,
  LinkButton,
  ComboBox,
  TextInput,
  NumberInput,
  FormField,
  Loader,
  getIcon,
  Toast,
  SiteApi,
  CurrentUser,
} from '../../../../../libs/nofbiz/nofbiz.base.js'

import { createNavbar } from '../../../../../components/navbar.js'
import { LIST_EXTERNAL_BULK, BULK_TRACKING_PREFIX, BULK_BATCH_PREFIX } from '../../../../../utils/constants.js'
import { loadCategoryOptions, loadLocationOptions, makeSequentialId } from '../../utils/external-data.js'

export default defineRoute(async (config) => {
  config.setRouteTitle('Register Bulk Mail')

  const INITIAL_ROWS = 1

  const siteApi = new SiteApi()
  const user = new CurrentUser()

  const [categoryOptions, locationOptions] = await Promise.all([
    loadCategoryOptions(siteApi),
    loadLocationOptions(siteApi),
  ])

  const navbar = createNavbar()

  const comboVal = (raw) => (typeof raw === 'string' ? raw : (raw?.value ?? ''))

  // Each row keeps its own FormFields so values persist across re-renders.
  function createEmptyRow() {
    return {
      category: new FormField({ value: '' }),
      title: new FormField({ value: '' }),
      quantity: new FormField({ value: 1 }),
      description: new FormField({ value: '' }),
      from: new FormField({ value: '' }),
      where: new FormField({ value: '' }),
    }
  }

  function freshRows() {
    return Array.from({ length: INITIAL_ROWS }, createEmptyRow)
  }

  function isRowEmpty(row) {
    return !comboVal(row.category.value) &&
      !(row.title.value || '').trim() &&
      !(row.description.value || '').trim() &&
      !(row.from.value || '').trim() &&
      !comboVal(row.where.value)
  }

  let rows = freshRows()

  const gridHeader = new Container([
    new Text('Category', { type: 'span', class: 'external-mail-bulk__grid-label' }),
    new Text('Item', { type: 'span', class: 'external-mail-bulk__grid-label' }),
    new Text('Quantity', { type: 'span', class: 'external-mail-bulk__grid-label' }),
    new Text('Description', { type: 'span', class: 'external-mail-bulk__grid-label' }),
    new Text('From', { type: 'span', class: 'external-mail-bulk__grid-label' }),
    new Text('Where', { type: 'span', class: 'external-mail-bulk__grid-label' }),
    new Text('', { type: 'span', class: 'external-mail-bulk__grid-label' }),
  ], { class: 'external-mail-bulk__grid-header' })

  const gridBody = new Container([], { class: 'external-mail-bulk__grid-body' })

  function renderGrid() {
    gridBody.children = rows.map((row) => {
      const categoryCombo = new ComboBox(row.category, categoryOptions, {
        allowMultiple: false,
        allowFiltering: true,
        allowCreate: false,
        placeholder: 'Category...',
      })
      const titleInput = new TextInput(row.title, { placeholder: 'Item name' })
      const quantityInput = new NumberInput(row.quantity, { min: 1, max: 99999, step: 5, placeholder: 'Qty' })
      const descInput = new TextInput(row.description, { placeholder: 'Description' })
      const fromInput = new TextInput(row.from, { placeholder: 'From / sender' })
      const whereCombo = new ComboBox(row.where, locationOptions, {
        placeholder: 'Destination office...',
      })
      const removeBtn = new Button(getIcon('close-line'), {
        variant: 'secondary',
        class: 'external-mail-bulk__remove-btn',
        onClickHandler: () => {
          if (rows.length === 1) {
            Toast.info('At least one row is required')
            return
          }
          rows = rows.filter((r) => r !== row)
          renderGrid()
        },
      })

      return new Container([
        categoryCombo, titleInput, quantityInput, descInput, fromInput, whereCombo, removeBtn,
      ], { class: 'external-mail-bulk__grid-row' })
    })
  }

  const addRowBtn = new Button('Add Row', {
    variant: 'secondary',
    onClickHandler: () => {
      rows.push(createEmptyRow())
      renderGrid()
    },
  })

  const submitBtn = new Button('Submit All', {
    variant: 'primary',
    onClickHandler: async () => {
      const filled = rows.filter((r) => !isRowEmpty(r))
      if (filled.length === 0) {
        Toast.error('Add at least one item before submitting')
        return
      }
      const missingTitle = filled.some((r) => !(r.title.value || '').trim())
      if (missingTitle) {
        Toast.error('Every item needs a title')
        return
      }

      submitBtn.isLoading = true
      pageLoader.toggleLoader()
      const loading = Toast.loading(`Logging ${filled.length} item(s)...`)
      const registeredBy = user.get('email') || ''
      // One BatchId per "Submit All" groups every row of this submission so the
      // detail panel can list all items registered together.
      const batchId = makeSequentialId(BULK_BATCH_PREFIX)

      try {
        for (const row of filled) {
          // Title is a generated tracking number (BULK-YYYYMMDD-XXXXX), matching the
          // EXT/POSTHUB convention; the human-readable name lives in ItemName.
          await siteApi.list(LIST_EXTERNAL_BULK).createItem({
            Title: makeSequentialId(BULK_TRACKING_PREFIX),
            ItemName: (row.title.value || '').trim(),
            Category: comboVal(row.category.value),
            Quantity: String(row.quantity.value ?? 1),
            Description: (row.description.value || '').trim(),
            FromSource: (row.from.value || '').trim(),
            Destination: comboVal(row.where.value),
            RegisteredByEmail: registeredBy,
            BatchId: batchId,
          })
        }
        loading.success(`${filled.length} item(s) logged`)
        rows = freshRows()
        renderGrid()
      } catch (err) {
        console.error('[register-bulk] createItem failed', err)
        loading.error('Failed to log some items')
      } finally {
        submitBtn.isLoading = false
        pageLoader.toggleLoader()
      }
    },
  })

  renderGrid()

  const gridWrapper = new Container([gridHeader, gridBody], { class: 'external-mail-bulk__grid' })
  const toolbar = new Container([addRowBtn, submitBtn], { class: 'external-mail-bulk__toolbar' })

  const pageHeader = new Container([
    new Container([
      new LinkButton(getIcon('arrow-go-back-line'), 'facilities/external-mail/register-mail', {
        class: 'posthub__home-icon',
      }),
      new Text('Register Bulk Mail', { type: 'h1', class: 'posthub__page-title' }),
    ], { class: 'posthub__title-with-icon' }),
    new Text('Register low-importance mail items with quantities for reporting. Add a row per item type. These items are not tracked.', {
      type: 'p',
      class: 'posthub__page-subtitle',
    }),
  ], { class: 'posthub__page-header' })

  const panel = new Container([gridWrapper, toolbar], { class: 'external-mail-bulk__panel' })
  const bodyWrapper = new Container([panel], { class: 'external-mail-bulk__body' })
  const pageWrapper = new Container([pageHeader, bodyWrapper], { class: 'external-mail-bulk__wrapper' })

  const pageLoader = new Loader(new Text('Saving...'), {
    animation: 'pulse',
    containerSelector: '#root',
  })

  return [navbar, pageWrapper]
})
