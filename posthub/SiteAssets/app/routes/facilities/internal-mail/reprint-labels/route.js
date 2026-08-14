import {
  defineRoute,
  Container,
  Text,
  Button,
  LinkButton,
  Loader,
  getIcon,
  Toast,
  SiteApi,
  FormField,
  PeoplePicker,
  FieldLabel,
} from '../../../../libs/nofbiz/nofbiz.base.js'

import { createNavbar } from '../../../../components/navbar.js'
import { createPackageDetailPanel } from '../../../../components/packageDetailPanel.js'
import { LIST_PACKAGES } from '../../../../utils/constants.js'
import { createPackageTable } from '../../../../utils/package-table.js'
import {
  trackingIdColumn,
  packageDetailsColumn,
  statusBadgeColumn,
  currentLocationColumn,
  destinationColumn,
  recipientColumn,
  dateColumn,
} from '../../../../utils/package-table-columns.js'
import { createQrLabelCard } from '../../utils/qrLabel.js'
import { printQrLabelPdf } from '../../utils/qrLabelPdf.js'

export default defineRoute(async (config) => {
  config.setRouteTitle('Reprint Labels')

  const siteApi = new SiteApi()

  let senderSelected = false
  let packages = []

  const senderField = new FormField({ value: { value: '', label: '' } })
  const senderPicker = new PeoplePicker(senderField, {
    placeholder: 'Search by name or email...',
    onSelectHandler: (selection) => {
      const identity = selection?.value ?? null
      if (identity?.email) {
        handleSenderSelect(identity.email, identity.displayName || identity.email)
      }
    },
  })

  const pageLoader = new Loader(new Text('Loading...'), { animation: 'pulse' })
  pageLoader.toggleLoader()

  const { show: showDetailPanel } = createPackageDetailPanel({ showSmartCardId: true })

  const navbar = createNavbar()

  const pageHeader = new Container([
    new Container([
      new LinkButton(getIcon('arrow-go-back-line'), 'facilities/internal-mail', {
        class: 'posthub__home-icon'
      }),
      new Text('Reprint Labels', {
        type: 'h1',
        class: 'posthub__page-title'
      }),
    ], { class: 'posthub__title-with-icon' }),
    new Text('Find a sender and reprint QR labels for their active mail', {
      type: 'p',
      class: 'posthub__page-subtitle'
    }),
  ], { class: 'posthub__page-header' })

  const tableContainer = new Container([], { class: 'posthub__table-container' })

  const searchPrompt = new Container([
    new Container([
      new Text('Search for Sender', {
        type: 'h2',
        class: 'posthub__prompt-title'
      }),
      new Text('Type a name or email to find active mail', {
        type: 'p',
        class: 'posthub__prompt-subtitle'
      }),
      new FieldLabel('Sender', senderPicker, { class: 'reprint-labels__sender-field' }),
    ], { class: 'posthub__prompt-content' }),
  ], { class: 'posthub__prompt' })

  async function handleSenderSelect(email, displayName) {
    pageLoader.toggleLoader()
    try {
      packages = await siteApi.list(LIST_PACKAGES).getItems({
        SenderEmail: email,
        Status: { value: ['in transit', 'arrived'], operator: 'Or' },
      })
      senderSelected = true
      Toast.success(`Found ${packages.length} active mail item(s) for ${displayName}`)
      updateView()
    } catch {
      Toast.error('Failed to load mail')
    } finally {
      pageLoader.toggleLoader()
    }
  }

  function markRowPrinted(e) {
    e.stopPropagation()
    e.target.closest('.posthub__table-row')?.classList.add('reprint-labels__row--printed')
  }

  function actionColumn() {
    return {
      label: 'Action',
      render: (pkg) => new Container([
        new Button('Reprint', {
          onClickHandler: (e) => { markRowPrinted(e); handlePrintLabel(pkg) },
          class: 'reprint-labels__reprint-btn',
        }),
        new Button('Reprint A4', {
          onClickHandler: (e) => { markRowPrinted(e); handlePrintLabelA4(pkg) },
          class: 'reprint-labels__reprint-btn',
        }),
        new Button('Reprint PDF', {
          onClickHandler: (e) => { markRowPrinted(e); handlePrintLabelPdf(pkg) },
          class: 'reprint-labels__reprint-btn',
        }),
      ], { class: 'posthub__table-cell' }),
    }
  }

  function updateView() {
    if (!senderSelected) {
      tableContainer.children = [searchPrompt]
    } else if (packages.length === 0) {
      tableContainer.children = [
        new Container([
          new Container([
            new Text('No active mail found', {
              type: 'h2',
              class: 'posthub__prompt-title'
            }),
            new Text('This sender has no mail with "in transit" or "arrived" status.', {
              type: 'p',
              class: 'posthub__prompt-subtitle'
            }),
            new Button('Search Another User', {
              onClickHandler: () => {
                senderSelected = false
                packages = []
                senderField.value = { value: '', label: '' }
                senderPicker.clearSelection()
                updateView()
              },
              class: 'posthub__scan-btn'
            }),
          ], { class: 'posthub__prompt-content' }),
        ], { class: 'posthub__prompt' }),
      ]
    } else {
      const table = createPackageTable({
        columns: [
          trackingIdColumn(),
          packageDetailsColumn(),
          statusBadgeColumn(),
          currentLocationColumn(),
          destinationColumn(),
          recipientColumn(),
          dateColumn('Dispatched On', 'SubmissionDate'),
          actionColumn(),
        ],
        packages,
        onRowClick: showDetailPanel,
        tableClass: 'reprint-labels__table',
      })

      tableContainer.children = [table]
    }
  }

  const printContainer = new Container([], { class: 'reprint-labels__print-container' })

  function handlePrintLabel(pkg) {
    const qrContent = JSON.stringify({ TrackingNumber: pkg.Title })
    console.log('QR label contents:', qrContent)
    printContainer.children = [createQrLabelCard(pkg)]
    const originalTitle = document.title
    document.title = pkg.Title
    window.print()
    document.title = originalTitle
  }

  function handlePrintLabelA4(pkg) {
    printContainer.children = [createQrLabelCard(pkg)]
    document.body.classList.add('posthub--print-a4')
    const styleEl = document.createElement('style')
    styleEl.textContent = '@page { size: A4; margin: 0 }'
    document.head.appendChild(styleEl)
    const originalTitle = document.title
    document.title = pkg.Title
    try {
      window.print()
    } finally {
      document.title = originalTitle
      styleEl.remove()
      document.body.classList.remove('posthub--print-a4')
    }
  }

  async function handlePrintLabelPdf(pkg) {
    try {
      await printQrLabelPdf(pkg)
    } catch (err) {
      Toast.error(err?.message ?? 'PDF print failed')
    }
  }

  updateView()

  const contentArea = new Container([
    pageHeader,
    tableContainer,
    printContainer,
    pageLoader,
  ], { class: 'posthub__page-content' })

  return [navbar, contentArea]
})
