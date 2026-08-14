import {
  defineRoute,
  Container,
  Text,
  Button,
  LinkButton,
  TextInput,
  ComboBox,
  FormField,
  FieldLabel,
  Modal,
  getIcon,
  Toast,
  SiteApi,
} from '../../../libs/nofbiz/nofbiz.base.js'

import { createNavbar } from '../../../components/navbar.js'
import { LIST_LOCATIONS } from '../../../utils/constants.js'

export default defineRoute(async (config) => {
  config.setRouteTitle('Manage Locations')

  const siteApi = new SiteApi()

  // Load all locations (active and inactive)
  let locations = await siteApi.list(LIST_LOCATIONS).getItems()

  // Navbar
  const navbar = createNavbar()

  // Page header
  const pageHeader = new Container([
    new Container([
      new LinkButton(getIcon('arrow-go-back-line'), 'facilities', {
        class: 'posthub__home-icon'
      }),
      new Text('Manage Locations', {
        type: 'h1',
        class: 'posthub__page-title'
      }),
    ], { class: 'posthub__title-with-icon' }),
    new Text('Enable or disable delivery locations', {
      type: 'p',
      class: 'posthub__page-subtitle'
    }),
  ], { class: 'posthub__page-header' })

  // -- Search bar + New Location button --
  const searchField = new FormField({ value: '' })
  const searchInput = new TextInput(searchField, {
    placeholder: 'Search locations...',
    class: 'manage-locations__search-input',
  })

  searchField.subscribe(() => renderFilteredCards())

  const newLocationBtn = new Button('New Location', {
    onClickHandler: () => openCreateModal(),
    class: 'manage-locations__new-btn',
  })

  const toolbar = new Container([
    searchInput,
    newLocationBtn,
  ], { class: 'manage-locations__toolbar' })

  // -- Create Location Modal --
  const cityField = new FormField({ value: '' })
  const cityDataset = ['LISBON', 'PORTO']
  const cityCombo = new ComboBox(cityField, cityDataset, {
    placeholder: 'Select city...',
    allowCreate: true,
    class: 'manage-locations__modal-combo',
  })

  const officeField = new FormField({
    value: '',
    validatorCallback: (v) => v.trim().length > 0,
  })
  const officeInput = new TextInput(officeField, { placeholder: 'e.g. TOC' })

  const createBtn = new Button('Create', {
    onClickHandler: () => handleCreate(),
    class: 'manage-locations__modal-create-btn',
  })

  const cancelBtn = new Button('Cancel', {
    variant: 'secondary',
    onClickHandler: () => createModal.close(),
    class: 'manage-locations__modal-cancel-btn',
  })

  const modalContent = new Container([
    new FieldLabel('City', cityCombo, { class: 'manage-locations__modal-field' }),
    new FieldLabel('Office Name', officeInput, { class: 'manage-locations__modal-field' }),
    new Container([cancelBtn, createBtn], { class: 'manage-locations__modal-actions' }),
  ], { class: 'manage-locations__modal-form' })

  const createModal = new Modal([
    new Text('New Location', { type: 'h2', class: 'manage-locations__modal-title' }),
    modalContent,
  ], {
    backdrop: true,
    closeOnFocusLoss: false,
    class: 'manage-locations__modal',
  })
  createModal.render()

  function openCreateModal() {
    cityCombo.dataset = cityDataset
    officeField.value = ''
    createModal.open()
  }

  async function handleCreate() {
    const city = cityField.value?.label?.trim() || ''
    const office = officeField.value.trim()

    if (!city || !office) {
      Toast.error('Both city and office name are required')
      return
    }

    const title = `${city.toUpperCase()} | ${office.toUpperCase()}`

    // Check for duplicates
    const duplicate = locations.find(l => l.Title === title)
    if (duplicate) {
      Toast.error('This location already exists')
      return
    }

    createBtn.isLoading = true
    const loading = Toast.loading('Creating location...')

    try {
      await siteApi.list(LIST_LOCATIONS).createItem({
        Title: title,
        IsActive: 'true',
      })

      locations = await siteApi.list(LIST_LOCATIONS).getItems()
      cityCombo.dataset = cityDataset
      officeField.value = ''
      loading.success('Location created')
      createModal.close()
      renderFilteredCards()
    } catch {
      loading.error('Failed to create location')
    } finally {
      createBtn.isLoading = false
    }
  }

  // -- Delete Confirmation Modal --
  let pendingDeleteLoc = null

  const confirmDeleteBtn = new Button('Delete', {
    variant: 'danger',
    onClickHandler: () => handleDelete(),
    class: 'manage-locations__confirm-delete-btn',
  })

  const cancelDeleteBtn = new Button('Cancel', {
    variant: 'secondary',
    onClickHandler: () => deleteModal.close(),
    class: 'manage-locations__modal-cancel-btn',
  })

  const confirmText = new Text('', { type: 'p', class: 'manage-locations__confirm-text' })

  const deleteModal = new Modal([
    new Text('Delete Location', { type: 'h2', class: 'manage-locations__modal-title' }),
    new Container([
      confirmText,
      new Container([cancelDeleteBtn, confirmDeleteBtn], { class: 'manage-locations__modal-actions' }),
    ], { class: 'manage-locations__modal-form' }),
  ], {
    backdrop: true,
    closeOnFocusLoss: false,
    class: 'manage-locations__modal manage-locations__confirm-modal',
  })
  deleteModal.render()

  function openDeleteModal(loc) {
    if (isActive(loc)) {
      Toast.warning('Deactivate the location before deleting')
      return
    }
    pendingDeleteLoc = loc
    confirmText.text = `Delete "${loc.Title}"? This cannot be undone.`
    deleteModal.open()
  }

  async function handleDelete() {
    if (!pendingDeleteLoc) return

    confirmDeleteBtn.isLoading = true
    const loading = Toast.loading('Deleting...')

    try {
      await siteApi.list(LIST_LOCATIONS).deleteItem(pendingDeleteLoc.Id, pendingDeleteLoc['odata.etag'])
      locations = await siteApi.list(LIST_LOCATIONS).getItems()
      loading.success('Location deleted')
      deleteModal.close()
      renderFilteredCards()
    } catch {
      loading.error('Failed to delete location')
    } finally {
      confirmDeleteBtn.isLoading = false
      pendingDeleteLoc = null
    }
  }

  // -- Card grid --
  const cardGrid = new Container([], { class: 'manage-locations__cards' })

  function isActive(location) {
    return location.IsActive === true || location.IsActive === 'true'
  }

  function getFilteredLocations() {
    const query = (searchField.value || '').toLowerCase().trim()
    if (!query) return locations
    return locations.filter(loc => loc.Title.toLowerCase().includes(query))
  }

  function buildCards(list) {
    if (list.length === 0) {
      return [new Text('No locations match your search', {
        type: 'p',
        class: 'manage-locations__empty',
      })]
    }

    return list.map((loc) => {
      const active = isActive(loc)
      const statusClass = active ? 'manage-locations__badge--active' : 'manage-locations__badge--inactive'
      const cardClass = active ? 'manage-locations__card' : 'manage-locations__card manage-locations__card--inactive'

      const toggleBtn = new Button(active ? 'Active' : 'Inactive', {
        onClickHandler: () => handleToggle(loc, toggleBtn),
        class: `manage-locations__toggle-btn ${statusClass}`,
      })

      const deleteBtn = new Button(getIcon('delete-bin-line'), {
        onClickHandler: () => openDeleteModal(loc),
        class: 'manage-locations__delete-btn',
      })

      return new Container([
        new Container([
          new Text(loc.Title, { type: 'h2', class: 'manage-locations__card-office' }),
          new Container([toggleBtn, deleteBtn], { class: 'manage-locations__card-actions' }),
        ], { class: 'manage-locations__card-row' }),
      ], { class: cardClass })
    })
  }

  function renderFilteredCards() {
    cardGrid.children = buildCards(getFilteredLocations())
  }

  async function handleToggle(loc, toggleBtn) {
    const wasActive = isActive(loc)

    // Guard: at least one location must remain active
    if (wasActive && locations.filter(isActive).length <= 1) {
      Toast.warning('At least one location must remain active')
      return
    }

    const newValue = wasActive ? 'false' : 'true'
    const action = wasActive ? 'Deactivating' : 'Activating'

    toggleBtn.isLoading = true
    const loading = Toast.loading(`${action}...`)

    try {
      await siteApi.list(LIST_LOCATIONS).updateItem(loc.Id, { IsActive: newValue }, loc['odata.etag'])

      locations = await siteApi.list(LIST_LOCATIONS).getItems()

      loading.success(`Location ${wasActive ? 'deactivated' : 'activated'}`)
      renderFilteredCards()
    } catch {
      loading.error('Failed to update location')
    } finally {
      toggleBtn.isLoading = false
    }
  }

  // Initial render
  renderFilteredCards()

  // Scrollable body
  const body = new Container([cardGrid], { class: 'manage-locations__body' })

  // Content area
  const contentArea = new Container([
    pageHeader,
    toolbar,
    body,
  ], { class: 'posthub__page-content' })

  return [navbar, contentArea, createModal, deleteModal]
})
