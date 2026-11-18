import { ComboBox } from '../../../../libs/nofbiz/nofbiz.base.js'
import {
  LIST_CATEGORIES,
  LIST_SUBCATEGORIES,
  LIST_LOCATIONS,
  LIST_EXTERNAL_SOURCES,
  LIST_EXTERNAL_ITEMS,
} from '../../../../utils/constants.js'
import { fetchItemsAcrossLists } from '../../../../utils/mail-context.js'
import { readItemsInIdWindows } from '../../../../utils/list-read.js'
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
 * All ExternalMailItems grouped by their parent collection's header tracking
 * number (ExternalMailItems.Title is the FK to ExternalMailPackages.Title).
 *
 * Returns the full item objects so callers can:
 * - build a text-search index for the External Tracking ID filter,
 * - export item-level detail rows without a second fetch.
 *
 * Uses String() on field values to guard against ListApi auto-parsing converting
 * boolean-looking or JSON-looking strings to non-string types (e.g. 'true' -> boolean).
 *
 * Only tracked collections have item rows; logged/untracked mail is absent here
 * by design (it carries no per-item external tracking id).
 *
 * @param {object} siteApi
 * @returns {Promise<Map<string, object[]>>}  Map<headerTrackingNumber, items[]>
 */
export async function loadGroupedExternalItems(siteApi) {
  try {
    // Whole list: read in threshold-safe ID windows (see utils/list-read.js).
    return groupItemsByTitle(await readItemsInIdWindows(siteApi, LIST_EXTERNAL_ITEMS))
  } catch (err) {
    console.error('[external-mail] failed to load ' + LIST_EXTERNAL_ITEMS, err)
    return new Map()
  }
}

/**
 * Group ExternalMailItems rows by their header tracking number (Title FK).
 * @param {object[]} items
 * @returns {Map<string, object[]>}
 */
export function groupItemsByTitle(items) {
  const groups = new Map()
  for (const it of items) {
    const key = String(it.Title ?? '')
    if (!key) continue
    const existing = groups.get(key)
    if (existing) existing.push(it)
    else groups.set(key, [it])
  }
  return groups
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

/**
 * Party ComboBox (allowCreate) backed by a mutable session pool.
 *
 * Problem: when renderGrid() rebuilds every row, a brand-new ComboBox is created
 * with the original partyOptions array. Any user-created option exists only in the
 * previous ComboBox instance's internal dataset (now garbage-collected), so the new
 * ComboBox cannot match the FormField value and the display goes blank.
 *
 * Fix: on every select, if the value is not already in the shared pool, push it.
 * On next renderGrid(), the pool includes the custom option, the ComboBox finds
 * the match via _syncDatasetFromField, and the display is correct. As a bonus,
 * the custom option also appears in other rows' dropdowns.
 *
 * @param {FormField} field       The row's party FormField.
 * @param {string[]}  partyPool   Mutable array -- custom options are pushed here.
 * @param {object}    [props]     Extra ComboBox props (placeholder, etc.).
 * @returns {ComboBox}
 */
export function createPartyCombo(field, partyPool, props = {}) {
  const { onSelectHandler: callerHandler, ...rest } = props
  return new ComboBox(field, partyPool, {
    allowMultiple: false,
    allowFiltering: true,
    allowCreate: true,
    ...rest,
    onSelectHandler: (sel) => {
      const val = comboVal(sel)
      if (val && !partyPool.includes(val)) {
        partyPool.push(val)
      }
      callerHandler?.(sel)
    },
  })
}
