import { SystemError } from '../../../libs/nofbiz/nofbiz.base.js'
import { renderSVG } from '../../../libs/uqr.js'
import { getUserDisplayName, getLocationValue } from '../../../utils/user-helpers.js'

const LABEL_W = 50.8
const LABEL_H = 76.2
const QR_SIZE = 40
const QR_RASTER_PX = 600

async function svgToPngDataUrl(svgString, sizePx) {
  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = () => reject(new SystemError('SvgLoadFailed', 'Could not rasterize QR SVG.', { breaksFlow: false }))
      i.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = sizePx
    canvas.height = sizePx
    const ctx = canvas.getContext('2d')
    ctx.imageSmoothingEnabled = false
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, sizePx, sizePx)
    ctx.drawImage(img, 0, 0, sizePx, sizePx)
    return canvas.toDataURL('image/png')
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function printQrLabelPdf(pkg) {
  const jspdfGlobal = globalThis.jspdf
  if (!jspdfGlobal?.jsPDF) {
    throw new SystemError('JsPdfMissing', 'jsPDF library not loaded. Check script tag in index.html.', { breaksFlow: false })
  }
  const { jsPDF } = jspdfGlobal

  const svgString = renderSVG(
    JSON.stringify({ TrackingNumber: pkg.Title }),
    { ecc: 'H', border: 2 }
  )
  const pngDataUrl = await svgToPngDataUrl(svgString, QR_RASTER_PX)

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [LABEL_W, LABEL_H],
  })

  const qrX = (LABEL_W - QR_SIZE) / 2
  const qrY = 5
  doc.addImage(pngDataUrl, 'PNG', qrX, qrY, QR_SIZE, QR_SIZE)

  doc.setFontSize(7)
  let y = qrY + QR_SIZE + 4
  doc.text(`From: ${getUserDisplayName(pkg.Sender)}`, LABEL_W / 2, y, { align: 'center' })
  y += 3
  doc.text(`To: ${getUserDisplayName(pkg.Recipient)}`, LABEL_W / 2, y, { align: 'center' })
  y += 3
  doc.text('BNP Paribas', LABEL_W / 2, y, { align: 'center' })
  y += 4
  doc.setFont(undefined, 'bold')
  doc.text(`Dest: ${getLocationValue(pkg.DestinationLocation)}`, LABEL_W / 2, y, { align: 'center' })
  doc.setFont(undefined, 'normal')

  doc.setFontSize(6)
  doc.setTextColor(150, 150, 150)
  doc.text(pkg.Title, LABEL_W / 2, LABEL_H - 3, { align: 'center' })

  doc.autoPrint()
  const blobUrl = doc.output('bloburl')
  const win = window.open(blobUrl, '_blank')
  if (!win) {
    throw new SystemError('PrintBlocked', 'Pop-up blocked. Allow pop-ups to print labels as PDF.', { breaksFlow: false })
  }
}
