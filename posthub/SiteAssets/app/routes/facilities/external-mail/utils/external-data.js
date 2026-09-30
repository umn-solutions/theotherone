import {
  LIST_CATEGORIES,
  LIST_LOCATIONS,
  LIST_EXTERNAL_SOURCES,
  LIST_CARRIERS,
} from '../../../../utils/constants.js'
import { fetchItemsAcrossLists } from '../../../../utils/mail-context.js'

/**
 * Shared data-access helpers for the External Mail routes.
 * Keep list reads in one place so forms, dashboard, and search stay DRY.
 */

// Re-export the canonical multi-list fetch so external-mail modules have one import.
export { fetchItemsAcrossLists }

/**
 * Build a human-readable sequential id: `PREFIX-YYYYMMDD-XXXXX`.
 * Shared by tracking-number generation (registerForm) and bulk BatchId generation.
 *
 * @param {string} prefix
 * @param {Date} [date=new Date()]
 * @returns {string}
 */
export function makeSequentialId(prefix, date = new Date()) {
  const datePart = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`
  const sequence = String(Math.floor(Math.random() * 100000)).padStart(5, '0')
  return `${prefix}-${datePart}-${sequence}`
}

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

/** Active carrier titles (for Carrier dropdowns). */
export const loadCarrierOptions = (siteApi) => loadActiveTitles(siteApi, LIST_CARRIERS)

/** Active location titles (for destination/location dropdowns). */
export const loadLocationOptions = (siteApi) => loadActiveTitles(siteApi, LIST_LOCATIONS)
