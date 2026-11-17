import { createQrLabelCard } from './qrLabel.js'
import { printInMode } from '../../../utils/print-mode.js'

// A6 landscape (148 x 105 mm) is the only label format.
// - Explicit size, NOT the `A6` keyword: Chromium/Edge do not support it, drop
//   the whole `size` declaration and silently fall back to the printer default.
// - 0.2 mm under A6 on purpose: Chromium quantizes the page box (~0.34 mm steps)
//   and rounds UP, so `148mm 105mm` becomes 148.17 x 105.16 mm. A page even a
//   fraction larger than the A6 sheet/label makes the printer feed a second,
//   blank sheet. 147.8 x 104.8 mm quantizes to 147.83 x 104.82 mm (fits).
// Page margin is 0 so the browser adds no header/footer; the printer-safe
// margin lives in the card's padding (see .qr-label__card in css/mail-workflow.css).
const LABEL_PAGE_CSS = '@page { size: 147.8mm 104.8mm; margin: 0 }'

/**
 * Populate a hidden print container with the package's QR label and trigger the
 * browser print dialog on an A6 landscape page. Shared by the Print/Reprint
 * labels routes, the search detail-panel reprint action and the external-mail
 * registration success flow.
 *
 * @param {object} pkg            Package record
 * @param {object} printContainer SPARC Container with class mail-labels__print-container
 */
export function printQrLabel(pkg, printContainer) {
  printContainer.children = [createQrLabelCard(pkg)]
  printInMode({ bodyClass: 'posthub--print-label', pageCss: LABEL_PAGE_CSS, title: pkg.Title })
}
