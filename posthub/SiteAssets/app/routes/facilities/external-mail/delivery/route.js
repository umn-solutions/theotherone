import { defineRoute } from '../../../../libs/nofbiz/nofbiz.base.js'
import { createMailActionRoute } from '../../utils/mailActionTemplate.js'
import { printSignatureDoc } from '../../utils/qrSignatureDoc.js'
import { EXTERNAL_MAIL } from '../../../../utils/mail-context.js'
import { guardAccess } from '../../../../utils/access.js'

export default defineRoute(async (config) => {
  // Facilities route: employee+ access required
  if (!guardAccess('EMPLOYEE')) return []

  // Off-platform (subsidiary) recipients run an exception branch:
  //   arrived -> awaiting signature (courier handover, print signed proof doc)
  //   awaiting signature -> delivered (signed doc scanned back)
  // No smartcard for the exception; the signed paper is the proof.
  const isOffPlatform = (pkg) =>
    pkg.OffPlatformRecipient === true || pkg.OffPlatformRecipient === 'true'

  return createMailActionRoute(config, {
    title: 'Delivery',
    subtitle: 'Deliver external mail. Off-platform recipients route via courier handover + signed proof.',
    backRoute: 'facilities/external-mail',
    expectedStatuses: ['arrived', 'in transit', 'awaiting signature'],
    getTargetStatus: (pkg) => {
      if (isOffPlatform(pkg)) {
        // Signed proof returned -> delivered; otherwise (arrived OR in transit at
        // any location) hand off to the courier. Mirrors internal delivery, which
        // accepts in-transit items regardless of location.
        if (pkg.Status === 'awaiting signature') return 'delivered'
        return 'awaiting signature'
      }
      return 'delivered'  // regular: arrived | in transit -> delivered
    },
    // Smartcard only for regular deliveries; exception transitions use the signed doc.
    smartCardWhen: (pkg, target) => target === 'delivered' && !isOffPlatform(pkg),
    // At handover, print a signature document for each item now awaiting signature.
    afterUpdate: async (results, { printContainer }) => {
      const handed = results.filter((r) => r.newStatus === 'awaiting signature').map((r) => r.pkg)
      if (handed.length) await printSignatureDoc(handed, printContainer)
    },
    // The handover (off-platform, arrived/in transit -> awaiting signature) prints a
    // per-order document, so it can't be batched with other items.
    requiresIndividual: (pkg) => isOffPlatform(pkg) && pkg.Status !== 'awaiting signature',
    individualMessage: 'Off-platform deliveries generate a signature document and must be delivered one at a time. Scan them individually.',
    ctx: EXTERNAL_MAIL,
  })
})
