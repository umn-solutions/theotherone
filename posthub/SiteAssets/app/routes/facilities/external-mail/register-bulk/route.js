import {
  defineRoute,
  Container,
  Text,
  Button,
  LinkButton,
  ComboBox,
  TextInput,
  FormField,
  getIcon,
  Toast,
} from '../../../../libs/nofbiz/nofbiz.base.js'

import { createNavbar } from '../../../../components/navbar.js'

export default defineRoute((config) => {
  config.setRouteTitle('Register Bulk Mail')

  // Destination dropdown options (the 6 known offices). Option values, not data.
  const LOCATION_OPTIONS = [
    'PORTO | URBO',
    'LISBON | TOC',
    'LISBON | TOR',
    'LISBON | ECHO',
    'LISBON | AURA',
    'LISBON | LUMNIA',
  ]

  const INITIAL_ROWS = 3

  const navbar = createNavbar()

  // Each row keeps its own FormFields so values persist across re-renders.
  function createEmptyRow() {
    return {
      category: new FormField({ value: '' }),
      title: new FormField({ value: '' }),
      description: new FormField({ value: '' }),
      from: new FormField({ value: '' }),
      where: new FormField({ value: '' }),
    }
  }

  function freshRows() {
    return Array.from({ length: INITIAL_ROWS }, createEmptyRow)
  }

  let rows = freshRows()

  const gridHeader = new Container([
    new Text('Category', { type: 'span', class: 'external-mail-bulk__grid-label' }),
    new Text('Title', { type: 'span', class: 'external-mail-bulk__grid-label' }),
    new Text('Description', { type: 'span', class: 'external-mail-bulk__grid-label' }),
    new Text('From', { type: 'span', class: 'external-mail-bulk__grid-label' }),
    new Text('Where', { type: 'span', class: 'external-mail-bulk__grid-label' }),
    new Text('', { type: 'span', class: 'external-mail-bulk__grid-label' }),
  ], { class: 'external-mail-bulk__grid-header' })

  const gridBody = new Container([], { class: 'external-mail-bulk__grid-body' })

  function renderGrid() {
    gridBody.children = rows.map((row) => {
      const categoryCombo = new ComboBox(row.category, [], {
        allowMultiple: false,
        allowFiltering: true,
        allowCreate: true,
        placeholder: 'Category...',
      })
      const titleInput = new TextInput(row.title, { placeholder: 'Title' })
      const descInput = new TextInput(row.description, { placeholder: 'Description' })
      const fromInput = new TextInput(row.from, { placeholder: 'From / sender' })
      const whereCombo = new ComboBox(row.where, LOCATION_OPTIONS, {
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
        categoryCombo, titleInput, descInput, fromInput, whereCombo, removeBtn,
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
    onClickHandler: () => {
      const count = rows.length
      Toast.success(`${count} item(s) logged (prototype)`)
      rows = freshRows()
      renderGrid()
    },
  })

  renderGrid()

  const gridWrapper = new Container([gridHeader, gridBody], { class: 'external-mail-bulk__grid' })

  const toolbar = new Container([addRowBtn, submitBtn], { class: 'external-mail-bulk__toolbar' })

  const pageHeader = new Container([
    new Container([
      new LinkButton(getIcon('arrow-go-back-line'), 'facilities/external-mail', {
        class: 'posthub__home-icon',
      }),
      new Text('Register Bulk Mail', { type: 'h1', class: 'posthub__page-title' }),
    ], { class: 'posthub__title-with-icon' }),
    new Text('Log multiple external mail items at once for reporting. These items are not tracked.', {
      type: 'p',
      class: 'posthub__page-subtitle',
    }),
  ], { class: 'posthub__page-header' })

  const panel = new Container([gridWrapper, toolbar], { class: 'external-mail-bulk__panel' })
  const bodyWrapper = new Container([panel], { class: 'external-mail-bulk__body' })
  const pageWrapper = new Container([pageHeader, bodyWrapper], { class: 'external-mail-bulk__wrapper' })

  return [navbar, pageWrapper]
})
