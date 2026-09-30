import { createQrLabelCard } from './qrLabel.js'

/**
 * Populate a hidden print container with the package's QR label and trigger the
 * browser print dialog at the default label page size. Shared by the
 * Print/Reprint labels routes and the external-mail registration success flow.
 *
 * @param {object} pkg            Package record
 * @param {object} printContainer SPARC Container with class mail-labels__print-container
 */
export function printQrLabel(pkg, printContainer) {
  printContainer.children = [createQrLabelCard(pkg)]
  const originalTitle = document.title
  document.title = pkg.Title
  window.print()
  document.title = originalTitle
}

/**
 * Same as printQrLabel but forces an A4 page so the label prints large and
 * centered (useful when a small-label roll is not loaded).
 *
 * @param {object} pkg            Package record
 * @param {object} printContainer SPARC Container with class mail-labels__print-container
 */
export function printQrLabelA4(pkg, printContainer) {
  printContainer.children = [createQrLabelCard(pkg)]
  document.body.classList.add('posthub--print-a4')
  const styleEl = document.createElement('style')
  styleEl.textContent = '@page { size: A4; margin: 0 }'
  document.head.appendChild(styleEl)
  const originalTitle = document.title
  document.title = pkg.Title
  try {
    window.print()
  } finally {
    document.title = originalTitle
    styleEl.remove()
    document.body.classList.remove('posthub--print-a4')
  }
}
