import {
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
} from '../../../libs/nofbiz/nofbiz.base.js'

import { createNavbar } from '../../../components/navbar.js'
import { createPackageDetailPanel } from '../../../components/packageDetailPanel.js'
import { createPackageTable } from '../../../utils/package-table.js'
import {
  trackingIdColumn,
  packageDetailsColumn,
  statusBadgeColumn,
  currentLocationColumn,
  destinationColumn,
  recipientColumn,
  dateColumn,
} from '../../../utils/package-table-columns.js'
import { fetchItemsAcrossLists } from '../../../utils/mail-context.js'
import { printQrLabel, printQrLabelA4 } from './qrLabelPrint.js'
import { printQrLabelPdf } from './qrLabelPdf.js'

/**
 * Shared Print / Reprint labels route, parameterized by mail context + variant.
 * Search finds a person's mail (by ctx.labelSearchField) across ctx.listNames and
 * offers per-row Print / Print A4 / Print PDF. Styling comes from the shared
 * global stylesheet css/mail-workflow.css (mail-labels__* classes).
 *
 * @param {object} config SPARC route config
 * @param {object} ctx    Mail context (INTERNAL_MAIL / EXTERNAL_MAIL)
 * @param {object} opts   { variant: 'print' | 'reprint' }
 * @returns {Promise<[object, object]>} [navbar, contentArea]
 */
export async function createLabelsRoute(config, ctx, { variant }) {
  const isReprint = variant === 'reprint'
  const verb = isReprint ? 'Reprint' : 'Print'
  config.setRouteTitle(`${verb} Labels`)

  const siteApi = new SiteApi()
  const searchField = ctx.labelSearchField
  const searchNoun = ctx.labelSearchNoun
  const searchLabel = searchNoun.charAt(0).toUpperCase() + searchNoun.slice(1)

  let personSelected = false
  let packages = []

  const personField = new FormField({ value: { value: '', label: '' } })
  const personPicker = new PeoplePicker(personField, {
    placeholder: 'Search by name or email...',
    onSelectHandler: (selection) => {
      const identity = selection?.value ?? null
      if (identity?.email) {
        handlePersonSelect(identity.email, identity.displayName || identity.email)
      }
    },
  })

  const pageLoader = new Loader(new Text('Loading...'), { animation: 'pulse' })
  pageLoader.toggleLoader()

  const { show: showDetailPanel } = createPackageDetailPanel({ showSmartCardId: true })
  const navbar = createNavbar()

  const pageHeader = new Container([
    new Container([
      new LinkButton(getIcon('arrow-go-back-line'), ctx.basePath, {
        class: 'posthub__home-icon',
      }),
      new Text(`${verb} Labels`, { type: 'h1', class: 'posthub__page-title' }),
    ], { class: 'posthub__title-with-icon' }),
    new Text(`Search for a ${searchNoun} to ${verb.toLowerCase()} QR labels`, {
      type: 'p',
      class: 'posthub__page-subtitle',
    }),
  ], { class: 'posthub__page-header' })

  const tableContainer = new Container([], { class: 'posthub__table-container' })

  const searchPrompt = new Container([
    new Container([
      new Text(`Search for ${searchLabel}`, { type: 'h2', class: 'posthub__prompt-title' }),
      new Text(`Type a name or email to find ${isReprint ? 'active' : 'pending'} mail`, {
        type: 'p',
        class: 'posthub__prompt-subtitle',
      }),
      new FieldLabel(searchLabel, personPicker, { class: 'mail-labels__sender-field' }),
    ], { class: 'posthub__prompt-content' }),
  ], { class: 'posthub__prompt' })

  async function handlePersonSelect(email, displayName) {
    pageLoader.toggleLoader()
    try {
      const statusQuery = isReprint
        ? { value: ['in transit', 'arrived'], operator: 'Or' }
        : 'pending'
      packages = await fetchItemsAcrossLists(siteApi, ctx.listNames, {
        [searchField]: email,
        Status: statusQuery,
      })
      personSelected = true
      Toast.success(`Found ${packages.length} ${isReprint ? 'active' : 'pending'} mail item(s) for ${displayName}`)
      updateView()
    } catch (err) {
      console.error('[labels] failed to load mail', err)
      Toast.error('Failed to load mail')
    } finally {
      pageLoader.toggleLoader()
    }
  }

  function markRowPrinted(e) {
    e.stopPropagation()
    e.target.closest('.posthub__table-row')?.classList.add('mail-labels__row--printed')
  }

  function buildActionColumn() {
    return {
      label: 'Action',
      render: (pkg) => {
        // PDF generation is async (canvas raster) -- lock the button and show
        // progress so it can't be fired repeatedly while the PDF is building.
        const pdfBtn = new Button(`${verb} PDF`, {
          onClickHandler: async (e) => {
            markRowPrinted(e)
            pdfBtn.isLoading = true
            const loading = Toast.loading('Generating PDF...')
            try {
              await printQrLabelPdf(pkg)
              loading.success('PDF ready')
            } catch (err) {
              console.error('[labels] PDF print failed', err)
              loading.error(err?.message ?? 'PDF print failed')
            } finally {
              pdfBtn.isLoading = false
            }
          },
          class: 'mail-labels__print-btn',
        })
        return new Container([
          new Button(verb, {
            onClickHandler: (e) => { markRowPrinted(e); handlePrintLabel(pkg) },
            class: 'mail-labels__print-btn',
          }),
          new Button(`${verb} A4`, {
            onClickHandler: (e) => { markRowPrinted(e); handlePrintLabelA4(pkg) },
            class: 'mail-labels__print-btn',
          }),
          pdfBtn,
        ], { class: 'posthub__table-cell' })
      },
    }
  }

  function updateView() {
    if (!personSelected) {
      tableContainer.children = [searchPrompt]
      return
    }
    if (packages.length === 0) {
      tableContainer.children = [
        new Container([
          new Container([
            new Text(`No ${isReprint ? 'active' : 'pending'} mail found`, {
              type: 'h2',
              class: 'posthub__prompt-title',
            }),
            new Text(
              isReprint
                ? `This ${searchNoun} has no mail with "in transit" or "arrived" status.`
                : `This ${searchNoun} has no mail with "pending" status.`,
              { type: 'p', class: 'posthub__prompt-subtitle' },
            ),
            new Button(`Search Another ${searchLabel}`, {
              onClickHandler: () => {
                personSelected = false
                packages = []
                personField.value = { value: '', label: '' }
                personPicker.clearSelection()
                updateView()
              },
              class: 'posthub__scan-btn',
            }),
          ], { class: 'posthub__prompt-content' }),
        ], { class: 'posthub__prompt' }),
      ]
      return
    }

    const columns = isReprint
      ? [
          trackingIdColumn(),
          packageDetailsColumn(),
          statusBadgeColumn(),
          currentLocationColumn(),
          destinationColumn(),
          recipientColumn(),
          dateColumn('Dispatched On', 'SubmissionDate'),
          buildActionColumn(),
        ]
      : [
          packageDetailsColumn(),
          destinationColumn(),
          recipientColumn(),
          buildActionColumn(),
        ]

    const table = createPackageTable({
      columns,
      packages,
      onRowClick: showDetailPanel,
      tableClass: isReprint ? 'mail-labels__table--reprint' : 'mail-labels__table--print',
    })

    tableContainer.children = [table]
  }

  // Hidden container for print-only QR label
  const printContainer = new Container([], { class: 'mail-labels__print-container' })

  function handlePrintLabel(pkg) {
    printQrLabel(pkg, printContainer)
  }

  function handlePrintLabelA4(pkg) {
    printQrLabelA4(pkg, printContainer)
  }

  updateView()

  const contentArea = new Container([
    pageHeader,
    tableContainer,
    printContainer,
    pageLoader,
  ], { class: 'posthub__page-content' })

  return [navbar, contentArea]
}
