import { Container, Text } from '../../../libs/nofbiz/nofbiz.base.js'
import { renderSVG } from '../../../libs/uqr.js'
import { getUserDisplayName, getLocationValue } from '../../../utils/user-helpers.js'

/**
 * Creates a printable QR label card for a package.
 *
 * @param {object} pkg - Package record from SharePoint
 * @returns {Container} SPARC Container with QR code and package info
 */
export function createQrLabelCard(pkg) {
  const svgString = renderSVG(JSON.stringify({ TrackingNumber: pkg.Title }), { ecc: 'H', border: 2 })

  return new Container([
    new Container([svgString], { class: 'qr-label__qr-target' }),
    new Text(`From: ${getUserDisplayName(pkg.Sender)}`, { type: 'p', class: 'qr-label__detail' }),
    new Text(`To: ${getUserDisplayName(pkg.Recipient)}`, { type: 'p', class: 'qr-label__detail' }),
    new Text('BNP Paribas', { type: 'p', class: 'qr-label__detail' }),
    new Text(`Dest: ${getLocationValue(pkg.DestinationLocation)}`, { type: 'p', class: 'qr-label__route' }),
    new Text(pkg.Title, { type: 'p', class: 'qr-label__label-id' }),
  ], { class: 'qr-label__card' })
}
