import { Container, Text, Button, Dialog, Toast, SiteApi } from '../../../libs/nofbiz/nofbiz.base.js'
import { LIST_EXTERNAL_PACKAGES, TIMELINE_EVENT_REPRINT_DOCUMENT } from '../../../utils/constants.js'
import { isFacilitiesAdmin } from '../../../utils/access.js'
import { printSignatureDoc } from './qrSignatureDoc.js'
import {
  chaseFromPanel,
  createReprintLabelAction,
  deletePackageWithTimeline,
  hasChaseableRecipient,
  logTimelineEvent,
} from './package-actions.js'

/**
 * Detail-panel actions shared by every facilities search dashboard (internal +
 * external), so the same status always offers the same buttons:
 *   - arrived            -> Chase (recipient must be reachable by email)
 *   - awaiting signature -> Reprint Document (courier Mail Order sheet)
 *   - every status       -> Reprint Label
 *   - pending | delivered -> Delete (FacilitiesManager only)
 *
 * Also owns the delete confirmation Dialog -- include `dialog` in the route's
 * returned components.
 *
 * @param {object} opts
 * @param {object} opts.printContainer SPARC Container with class mail-labels__print-container
 * @param {(pkg: object) => void | Promise<void>} opts.onDeleted Called after a successful delete
 * @returns {{ actions: object[], dialog: Dialog }}
 */
export function createSearchPanelActions({ printContainer, onDeleted }) {
  const DELETABLE_STATUSES = ['pending', 'delivered']
  const siteApi = new SiteApi()
  let pendingDelete = null

  const confirmText = new Text('', { type: 'p' })
  const cancelBtn = new Button('Cancel', {
    variant: 'secondary',
    onClickHandler: () => dialog.close(),
  })
  const confirmBtn = new Button('Delete', {
    variant: 'danger',
    onClickHandler: () => confirmDelete(),
  })
  const dialog = new Dialog({
    title: 'Delete Mail',
    content: confirmText,
    footer: new Container([cancelBtn, confirmBtn], { class: 'posthub__dialog-footer' }),
    variant: 'error',
  })
  dialog.render()

  function requestDelete(pkg, { close }) {
    pendingDelete = { pkg, closePanel: close }
    const extra = pkg.__listName === LIST_EXTERNAL_PACKAGES ? ', its items' : ''
    confirmText.children = `Delete "${pkg.Title}"${extra} and its timeline history? This cannot be undone.`
    dialog.open()
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    const { pkg, closePanel } = pendingDelete
    confirmBtn.isLoading = true
    const loading = Toast.loading('Deleting...')
    try {
      await deletePackageWithTimeline(siteApi, pkg)
      loading.success('Mail deleted')
      dialog.close()
      closePanel?.()
      await onDeleted?.(pkg)
    } catch (err) {
      console.error('[searchPanelActions] delete failed', { title: pkg.Title, err })
      loading.error('Failed to delete mail')
    } finally {
      confirmBtn.isLoading = false
      pendingDelete = null
    }
  }

  const actions = [
    {
      label: 'Chase',
      variant: 'primary',
      isVisible: (pkg) => pkg.Status === 'arrived' && hasChaseableRecipient(pkg),
      onClick: chaseFromPanel,
    },
    {
      label: 'Reprint Document',
      isVisible: (pkg) => pkg.Status === 'awaiting signature',
      onClick: async (pkg) => {
        await printSignatureDoc(pkg, printContainer)
        await logTimelineEvent(pkg, TIMELINE_EVENT_REPRINT_DOCUMENT)
      },
    },
    createReprintLabelAction(printContainer),
    {
      label: 'Delete',
      variant: 'danger',
      isVisible: (pkg) => isFacilitiesAdmin() && DELETABLE_STATUSES.includes(pkg.Status),
      onClick: requestDelete,
    },
  ]

  return { actions, dialog }
}
