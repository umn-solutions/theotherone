/**
 * Run window.print() inside a temporary print mode: a body class that scopes
 * the print CSS, an injected @page rule, and a document title (used by the
 * browser as the default PDF file name). Everything is restored afterwards.
 *
 * With `settle: true` the print is deferred until the browser has laid out the
 * page in the new mode (two animation frames + a short delay), so components
 * that redraw on resize (d3 charts via ResizeObserver) re-render at the print
 * layout size first. Without it, print runs synchronously in the caller's tick.
 *
 * @param {object} args
 * @param {string} args.bodyClass   Class added to <body> for the duration.
 * @param {string} [args.pageCss]   @page rule(s), e.g. '@page { size: A4; margin: 0 }'.
 * @param {string} [args.title]     Temporary document.title.
 * @param {boolean} [args.settle]   Wait for re-layout before printing.
 * @returns {Promise<void>}
 */
export async function printInMode({ bodyClass, pageCss, title, settle = false }) {
  document.body.classList.add(bodyClass)
  const styleEl = pageCss ? document.createElement('style') : null
  if (styleEl) {
    styleEl.textContent = pageCss
    document.head.appendChild(styleEl)
  }
  const originalTitle = document.title
  if (title) document.title = title
  try {
    if (settle) await waitForLayout()
    window.print()
  } finally {
    document.title = originalTitle
    styleEl?.remove()
    document.body.classList.remove(bodyClass)
  }
}

const SETTLE_DELAY_MS = 150

function waitForLayout() {
  return new Promise(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, SETTLE_DELAY_MS)))
  })
}
