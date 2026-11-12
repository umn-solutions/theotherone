import { ComboBox } from '../../../../libs/nofbiz/nofbiz.base.js'
import {
  LIST_CATEGORIES,
  LIST_SUBCATEGORIES,
  LIST_LOCATIONS,
  LIST_EXTERNAL_SOURCES,
  LIST_EXTERNAL_ITEMS,
} from '../../../../utils/constants.js'
import { fetchItemsAcrossLists } from '../../../../utils/mail-context.js'
import { makeTrackingId } from '../../../../utils/tracking-id.js'

/**
 * Shared data-access helpers for the External Mail routes.
 * Keep list reads in one place so forms, dashboard, and search stay DRY.
 */

// Re-export the canonical multi-list fetch so external-mail modules have one import.
export { fetchItemsAcrossLists }

/**
 * Collision-safe tracking id `PREFIX-YYYYMMDD-<unique>`. Kept as a named re-export
 * (callers: tracked/log forms + BatchId) -- real logic lives in utils/tracking-id.js.
 */
export const makeSequentialId = makeTrackingId

/**
 * Active Title values from a simple {Title, IsActive} option list, sorted A-Z.
 * Empty array on failure (logged).
 */
export async function loadActiveTitles(siteApi, listName) {
  try {
    const items = await siteApi.list(listName).getItems(
      { IsActive: 'true' },
      { orderBy: { field: 'Title', ascending: true } },
    )
    return items.map((i) => i.Title)
  } catch (err) {
    console.error('[external-mail] failed to load ' + listName, err)
    return []
  }
}

/** Active category titles (for Category dropdowns). */
export const loadCategoryOptions = (siteApi) => loadActiveTitles(siteApi, LIST_CATEGORIES)

/** Active external source titles (for Source dropdowns). */
export const loadSourceOptions = (siteApi) => loadActiveTitles(siteApi, LIST_EXTERNAL_SOURCES)

/** Active location titles (for destination/location dropdowns). */
export const loadLocationOptions = (siteApi) => loadActiveTitles(siteApi, LIST_LOCATIONS)

/**
 * Suggestion pool for the single "From / To" party field (incoming sender /
 * outgoing destination). Reuses the External Sources config list; the combo is
 * `allowCreate` so staff can type parties not in the list.
 */
export const loadPartyOptions = (siteApi) => loadSourceOptions(siteApi)

/**
 * Index of per-item external tracking IDs keyed by their parent collection's
 * header tracking number (ExternalMailItems.Title is the FK to
 * ExternalMailPackages.Title). Used by the search view to let staff find a
 * collection by any item's carrier tracking id. IDs are lowercased for
 * case-insensitive substring matching. Empty Map on failure (logged).
 *
 * Only tracked collections have item rows; logged/untracked mail is absent here
 * by design (it carries no per-item external tracking id).
 *
 * @param {object} siteApi
 * @returns {Promise<Map<string, string[]>>}
 */
export async function loadExternalItemIndex(siteApi) {
  const index = new Map()
  try {
    const items = await siteApi.list(LIST_EXTERNAL_ITEMS).getItems(
      undefined,
      { viewFields: ['Title', 'ExternalTrackingId'] },
    )
    for (const it of items) {
      const id = (it.ExternalTrackingId || '').trim().toLowerCase()
      if (!id) continue
      const existing = index.get(it.Title)
      if (existing) existing.push(id)
      else index.set(it.Title, [id])
    }
    return index
  } catch (err) {
    console.error('[external-mail] failed to load ' + LIST_EXTERNAL_ITEMS + ' index', err)
    return index
  }
}

/**
 * Load active subcategories grouped by their parent category, as
 * `{ [ParentCategory]: string[] }`. Call once per form; feed the result to
 * getSubcategoryOptions() for the dependent dropdown. Empty object on failure.
 * @param {object} siteApi
 * @returns {Promise<Record<string, string[]>>}
 */
export async function loadSubcategoryMap(siteApi) {
  try {
    const items = await siteApi.list(LIST_SUBCATEGORIES).getItems(
      { IsActive: 'true' },
      { orderBy: { field: 'Title', ascending: true } },
    )
    const map = {}
    for (const it of items) {
      const parent = it.ParentCategory
      if (!parent) continue
      if (!map[parent]) map[parent] = []
      map[parent].push(it.Title)
    }
    return map
  } catch (err) {
    console.error('[external-mail] failed to load ' + LIST_SUBCATEGORIES, err)
    return {}
  }
}

/**
 * SubCategory options for a given Category (dependent dropdown), read from a map
 * built by loadSubcategoryMap(). Unknown/empty category yields [].
 * @param {Record<string, string[]>} map
 * @param {string} category
 * @returns {string[]}
 */
export function getSubcategoryOptions(map, category) {
  return (map && category && map[category]) || []
}

/**
 * Plain string value of a ComboBox FormField (option object or raw string).
 * @param {unknown} raw
 * @returns {string}
 */
export const comboVal = (raw) => (typeof raw === 'string' ? raw : (raw?.value ?? ''))

/**
 * Category + dependent Subcategory ComboBoxes for one item row of the register
 * grids. Changing Category repopulates and resets Subcategory.
 *
 * GOTCHA: nofbiz ComboBox.render() fires onSelectHandler on its initial render
 * when a value is preselected. Grid rows are rebuilt on every Add/Remove Item, so
 * the reset only runs when the category actually differs from the last one seen --
 * otherwise every re-render would wipe each row's Subcategory.
 *
 * @param {{ category: object, subcategory: object }} row FormFields of the row
 * @param {object[]} categoryOptions
 * @param {Record<string, string[]>} subcategoryMap From loadSubcategoryMap()
 * @returns {[ComboBox, ComboBox]} [categoryCombo, subCombo]
 */
export function createCategoryCombos(row, categoryOptions, subcategoryMap) {
  let lastCategory = comboVal(row.category.value)

  const subCombo = new ComboBox(row.subcategory, getSubcategoryOptions(subcategoryMap, lastCategory), {
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
    onSelectHandler: (sel) => {
      const category = comboVal(sel)
      if (category === lastCategory) return
      lastCategory = category
      subCombo.dataset = getSubcategoryOptions(subcategoryMap, category)
      row.subcategory.value = ''
      subCombo.clearSelection()
      subCombo.render()
    },
  })

  return [categoryCombo, subCombo]
}
