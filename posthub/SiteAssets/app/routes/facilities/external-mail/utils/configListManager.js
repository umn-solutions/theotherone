import {
  Container,
  View,
  Text,
  Button,
  ComboBox,
  TextInput,
  FormField,
  Modal,
  getIcon,
  Toast,
} from '../../../../libs/nofbiz/nofbiz.base.js'

/**
 * Builds a self-contained CRUD manager for a simple {Title, IsActive} option list
 * (Categories / Subcategories / External Sources), rendered as a tab: a new-item control
 * on top and a scrollable flex-column list of options below. Titles are unique
 * (case-insensitive). Mirrors the Manage Locations activate/deactivate + delete flow.
 *
 * Pass `parent: { options: string[], label }` to scope the list under a parent
 * (e.g. SubCategories under a Category): a parent selector renders on top, and all
 * ops are scoped to the selected parent via the ParentCategory field.
 *
 * @param {object} siteApi
 * @param {object} opts { listName, singular, plural, key, parent? }
 * @returns {{ tab: { key: string, label: string, view: object }, deleteModal: object, reload: () => Promise<void> }}
 */
export function createConfigListManager(siteApi, { listName, singular, plural, key, parent = null }) {
  let items = []

  const isActive = (it) => it.IsActive === true || it.IsActive === 'true'

  // Optional parent scoping. When `parent` is provided, a parent selector renders
  // above the add control and every op is scoped to the selected parent.
  let selectedParent = ''
  let parentSelector = null
  if (parent) {
    const parentField = new FormField({ value: '' })
    const parentCombo = new ComboBox(parentField, parent.options, {
      allowMultiple: false,
      allowFiltering: true,
      allowCreate: false,
      placeholder: `Select ${(parent.label || 'parent').toLowerCase()}...`,
      onSelectHandler: (sel) => {
        selectedParent = typeof sel === 'string' ? sel : (sel?.value ?? '')
        reload()
      },
    })
    parentSelector = new Container([
      new Text(parent.label || 'Parent', { type: 'label', class: 'external-mail-config__add-label' }),
      parentCombo,
    ], { class: 'external-mail-config__controls' })
  }

  // -- New-item control (top of the tab) --
  const newField = new FormField({ value: '' })
  const newInput = new TextInput(newField, {
    placeholder: `New ${singular.toLowerCase()}...`,
    class: 'external-mail-config__add-input',
  })
  const addBtn = new Button('Add', {
    onClickHandler: () => handleAdd(),
    class: 'external-mail-config__add-btn',
  })
  const controls = new Container([
    new Text(`Add ${singular}`, { type: 'label', class: 'external-mail-config__add-label' }),
    new Container([newInput, addBtn], { class: 'external-mail-config__add-row' }),
  ], { class: 'external-mail-config__controls' })

  // -- Delete confirm modal (scoped to this list) --
  let pendingDelete = null
  const confirmText = new Text('', { type: 'p', class: 'external-mail-config__confirm-text' })
  const confirmDeleteBtn = new Button('Delete', {
    variant: 'danger',
    onClickHandler: () => handleDelete(),
  })
  const cancelDeleteBtn = new Button('Cancel', {
    variant: 'secondary',
    onClickHandler: () => deleteModal.close(),
  })
  const deleteModal = new Modal([
    new Text(`Delete ${singular}`, { type: 'h2', class: 'external-mail-config__modal-title' }),
    new Container([
      confirmText,
      new Container([cancelDeleteBtn, confirmDeleteBtn], { class: 'external-mail-config__modal-actions' }),
    ], { class: 'external-mail-config__modal-form' }),
  ], { backdrop: true, closeOnFocusLoss: false, class: 'external-mail-config__modal' })
  deleteModal.render()

  // -- Scrollable options list --
  const list = new Container([], { class: 'external-mail-config__list' })

  function renderList() {
    if (items.length === 0) {
      const msg = parent && !selectedParent
        ? `Select a ${(parent.label || 'parent').toLowerCase()} to manage its ${plural.toLowerCase()}`
        : `No ${plural.toLowerCase()} yet`
      list.children = [new Text(msg, { type: 'p', class: 'external-mail-config__empty' })]
      return
    }
    list.children = items
      .slice()
      .sort((a, b) => a.Title.localeCompare(b.Title))
      .map((it) => {
        const active = isActive(it)
        const toggleBtn = new Button(active ? 'Active' : 'Inactive', {
          onClickHandler: () => handleToggle(it, toggleBtn),
          class: `external-mail-config__toggle-btn ${active ? 'external-mail-config__toggle-btn--active' : 'external-mail-config__toggle-btn--inactive'}`,
        })
        const deleteBtn = new Button(getIcon('delete-bin-line'), {
          onClickHandler: () => openDelete(it),
          class: 'external-mail-config__delete-btn',
        })
        return new Container([
          new Text(it.Title, { type: 'span', class: 'external-mail-config__row-title' }),
          new Container([toggleBtn, deleteBtn], { class: 'external-mail-config__row-actions' }),
        ], { class: `external-mail-config__row${active ? '' : ' external-mail-config__row--inactive'}` })
      })
  }

  async function reload() {
    if (parent && !selectedParent) {
      items = []
      renderList()
      return
    }
    try {
      items = parent
        ? await siteApi.list(listName).getItems({ ParentCategory: selectedParent })
        : await siteApi.list(listName).getItems()
    } catch (err) {
      console.error('[config] failed to load ' + listName, err)
      Toast.error(`Failed to load ${plural.toLowerCase()}`)
      items = []
    }
    renderList()
  }

  async function handleAdd() {
    const val = (newField.value || '').trim()
    if (!val) {
      Toast.error(`Enter a ${singular.toLowerCase()} name`)
      return
    }
    if (parent && !selectedParent) {
      Toast.error(`Select a ${(parent.label || 'parent').toLowerCase()} first`)
      return
    }
    // Unique (case-insensitive) titles only, within the current scope.
    if (items.some((i) => i.Title.trim().toLowerCase() === val.toLowerCase())) {
      Toast.error(`${singular} "${val}" already exists`)
      return
    }
    addBtn.isLoading = true
    const loading = Toast.loading('Adding...')
    try {
      await siteApi.list(listName).createItem(
        parent
          ? { Title: val, ParentCategory: selectedParent, IsActive: 'true' }
          : { Title: val, IsActive: 'true' },
      )
      newField.value = ''
      await reload()
      loading.success(`${singular} added`)
    } catch (err) {
      console.error('[config] add failed', err)
      loading.error(`Failed to add ${singular.toLowerCase()}`)
    } finally {
      addBtn.isLoading = false
    }
  }

  async function handleToggle(it, btn) {
    const wasActive = isActive(it)
    btn.isLoading = true
    const loading = Toast.loading('Updating...')
    try {
      await siteApi.list(listName).updateItem(it.Id, { IsActive: wasActive ? 'false' : 'true' }, it['odata.etag'])
      await reload()
      loading.success(`${singular} ${wasActive ? 'deactivated' : 'activated'}`)
    } catch (err) {
      console.error('[config] toggle failed', err)
      loading.error('Failed to update')
    } finally {
      btn.isLoading = false
    }
  }

  function openDelete(it) {
    if (isActive(it)) {
      Toast.warning(`Deactivate the ${singular.toLowerCase()} before deleting`)
      return
    }
    pendingDelete = it
    confirmText.children = `Delete "${it.Title}"? This cannot be undone.`
    deleteModal.open()
  }

  async function handleDelete() {
    if (!pendingDelete) return
    confirmDeleteBtn.isLoading = true
    const loading = Toast.loading('Deleting...')
    try {
      await siteApi.list(listName).deleteItem(pendingDelete.Id, pendingDelete['odata.etag'])
      await reload()
      loading.success(`${singular} deleted`)
      deleteModal.close()
    } catch (err) {
      console.error('[config] delete failed', err)
      loading.error('Failed to delete')
    } finally {
      confirmDeleteBtn.isLoading = false
      pendingDelete = null
    }
  }

  const view = new View(parentSelector ? [parentSelector, controls, list] : [controls, list], { class: 'external-mail-config__tab' })

  return { tab: { key, label: plural, view }, deleteModal, reload }
}
