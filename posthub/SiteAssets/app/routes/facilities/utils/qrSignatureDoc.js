import { Container, Text, SiteApi } from '../../../libs/nofbiz/nofbiz.base.js'
import { renderSVG } from '../../../libs/uqr.js'
import { getUserDisplayName, getLocationValue } from '../../../utils/user-helpers.js'
import { LIST_EXTERNAL_ITEMS, APP_NAME } from '../../../utils/constants.js'
import { printInMode } from '../../../utils/print-mode.js'

/**
 * Printable "Mail Order" handover document for an off-platform (subsidiary)
 * delivery. Generated when a tracked collection moves `arrived`/`in transit` ->
 * `awaiting signature`: the middleman courier carries this with the parcel and
 * returns it signed; scanning its QR (which encodes the tracking number, same as
 * the parcel label) later drives the final `delivered` transition. The signed
 * paper is archived outside the platform.
 *
 * The document lists every item in the collection and is designed to paginate
 * across A4 pages (each item row avoids breaking; orders start on a fresh page).
 *
 * @param {object} pkg      Collection header record
 * @param {object[]} items  Line items (from ExternalMailItems) for this collection
 * @returns {Container}
 */
export function createSignatureDocCard(pkg, items) {
  const tracking = pkg.Title
  const svgString = renderSVG(JSON.stringify({ TrackingNumber: tracking }), { ecc: 'H', border: 2 })

  const categoryLabel = (it) =>
    it.Category ? (it.SubCategory ? `${it.Category} / ${it.SubCategory}` : it.Category) : '--'

  const header = new Container([
    new Container([
      new Text(`Facilities Services - ${APP_NAME}`, { type: 'p', class: 'sig-doc__brand' }),
      new Text(`Mail Order #${tracking}`, { type: 'h1', class: 'sig-doc__order-title' }),
      new Text(`Recipient: ${getUserDisplayName(pkg.Recipient)}`, { type: 'p', class: 'sig-doc__detail' }),
      new Text(`Destination: ${getLocationValue(pkg.DestinationLocation)}`, { type: 'p', class: 'sig-doc__detail' }),
      new Text(`Items: ${items.length}`, { type: 'p', class: 'sig-doc__detail' }),
    ], { class: 'sig-doc__header-info' }),
    new Container([svgString], { class: 'sig-doc__qr-target' }),
  ], { class: 'sig-doc__header' })

  const itemHead = new Container([
    new Text('#', { type: 'span' }),
    new Text('Category', { type: 'span' }),
    new Text('Description', { type: 'span' }),
    new Text('From', { type: 'span' }),
    new Text('Ext. Tracking ID', { type: 'span' }),
  ], { class: 'sig-doc__item-head' })

  const rows = items.map((it, i) => new Container([
    new Text(String(i + 1), { type: 'span' }),
    new Text(categoryLabel(it), { type: 'span' }),
    new Text(it.Description || '--', { type: 'span' }),
    new Text(it.FromParty || '--', { type: 'span' }),
    new Text(it.ExternalTrackingId || '--', { type: 'span' }),
  ], { class: 'sig-doc__item-row' }))

  const emptyNote = items.length === 0
    ? [new Text('No items recorded for this order.', { type: 'p', class: 'sig-doc__detail' })]
    : []

  const list = new Container([itemHead, ...rows, ...emptyNote], { class: 'sig-doc__items' })

  const signature = new Container([
    new Container([
      new Text('Received by (name):', { type: 'span', class: 'sig-doc__sign-label' }),
      new Container([], { class: 'sig-doc__sign-line' }),
    ], { class: 'sig-doc__sign-field' }),
    new Container([
      new Text('Signature:', { type: 'span', class: 'sig-doc__sign-label' }),
      new Container([], { class: 'sig-doc__sign-line' }),
      new Text('Date:', { type: 'span', class: 'sig-doc__sign-label' }),
      new Container([], { class: 'sig-doc__sign-line sig-doc__sign-line--short' }),
    ], { class: 'sig-doc__sign-field' }),
  ], { class: 'sig-doc__signature' })

  return new Container([header, list, signature], { class: 'sig-doc__order', as: 'section' })
}

/**
 * Load each collection's items, render one Mail Order document per collection into
 * the hidden print container, and trigger the browser print dialog at A4.
 *
 * @param {object|object[]} pkgs   One collection header or an array of them
 * @param {object} printContainer  SPARC Container with class mail-labels__print-container
 */
export async function printSignatureDoc(pkgs, printContainer) {
  const list = Array.isArray(pkgs) ? pkgs : [pkgs]
  if (list.length === 0) return

  const siteApi = new SiteApi()
  const cards = []
  for (const pkg of list) {
    let items = []
    try {
      items = await siteApi.list(LIST_EXTERNAL_ITEMS).getItems(
        { Title: pkg.Title },
        { orderBy: { field: 'Created', ascending: true } },
      )
    } catch (err) {
      console.error('[signature-doc] failed to load items for ' + pkg.Title, err)
    }
    cards.push(createSignatureDocCard(pkg, items))
  }
  printContainer.children = cards

  // Document (A4, paginating) print mode -- distinct from the small-label mode.
  await printInMode({
    bodyClass: 'posthub--print-doc',
    pageCss: '@page { size: A4; margin: 12mm }',
    title: `Mail Order -- ${list.map((p) => p.Title).join(', ')}`,
  })
}
