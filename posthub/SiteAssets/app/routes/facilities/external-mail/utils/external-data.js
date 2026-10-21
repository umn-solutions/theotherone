import {
  LIST_CATEGORIES,
  LIST_SUBCATEGORIES,
  LIST_LOCATIONS,
  LIST_EXTERNAL_SOURCES,
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
 * Suggestion pool for the single "From / To" party field (ingoing sender /
 * outgoing destination). Reuses the External Sources config list; the combo is
 * `allowCreate` so staff can type parties not in the list.
 */
export const loadPartyOptions = (siteApi) => loadSourceOptions(siteApi)

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
