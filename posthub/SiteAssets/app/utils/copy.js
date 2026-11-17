// Shared UI copy (English only).
//
// - PAGE_DESCRIPTIONS: text that appears in more than one place. A hub card and
//   the page it opens show the same description, so the two cannot drift apart.
//   Text used in a single place stays inline in its route.
// - TOOLTIPS: hover help, shown through FieldLabel `tooltip`, Button `title` or
//   utils/tooltip.js. Native title tooltips are mouse-only, so nothing essential
//   may live only in a tooltip.
//
// Glossary (keep new copy consistent):
//   mail / mail item (not package, parcel, ticket); collection = external tracked
//   group; logged mail / log batch = untracked; Tracking Number = PostHub id;
//   Carrier Tracking Number = carrier id; office (not building); facilities desk
//   (drop-off point); "Working from: X"; Registered On / Dispatched On /
//   Received On; Proof of Delivery; Pickup reminder.
// Style: Title Case for titles, labels, buttons and column headers; sentence case
// for subtitles, help text, placeholders and toasts. No "--", "+", "->" or "(s)":
// use pluralize().

import { EXTERNAL_TRACKING_ID_LABEL } from './constants.js'

/** "1 item" / "3 items". Pass `plural` for irregular nouns. */
export function pluralize(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`
}

/** Badge / subtitle naming the office the facilities session works from. */
export const workingFromText = (office) => `Working from: ${office}`

/** Toast when a facilities screen opens before a working office is chosen. */
export const SELECT_WORKING_OFFICE_FIRST = 'Select your working office first.'

const CARRIER_NUMBER = EXTERNAL_TRACKING_ID_LABEL.toLowerCase()

export const PAGE_DESCRIPTIONS = {
  // User pages (home card + page subtitle)
  myMail: 'Track mail you sent and mail addressed to you.',

  // Facilities hub cards. Pages without their own landing subtitle reuse these.
  internalMail: 'Print labels, dispatch, receive and deliver mail between offices.',
  externalMail: 'Register, receive and deliver mail from outside the company, and log outgoing mail.',
  reports: 'Monthly volumes, delivery rates and delivery times per office.',
  manageLocations: 'Add offices and choose which are available for routing.',
  maintenance: 'Send pickup reminders, remove abandoned registrations and export all mail.',
  externalConfig: 'Edit the categories, subcategories and external parties offered on external mail forms.',
  fullExport: 'Download all internal and external mail to Excel. Optional filters, no date or size limit.',

  // Internal Mail steps (hub card = page subtitle)
  printLabels: 'Find a sender, select their pending mail and print QR labels to attach.',
  dispatch: 'Scan freshly labelled mail to send it on its way.',
  internalReception: 'Scan mail arriving at your office. Mail for this office is marked Arrived; mail for other offices stays In Transit.',
  internalDelivery: 'Scan mail being collected and confirm pickup with a smart card.',
  internalSearch: 'Find any mail by tracking number, person, status, office or date.',
  reprintLabels: 'Reprint a damaged or unreadable QR label.',
  reroute: 'Send mail to a different office or back to the sender. A reason is required.',

  // External Mail steps (hub card = page subtitle)
  externalSearch: `Find external mail by tracking number, ${CARRIER_NUMBER}, person, status or office.`,
  registerMail: 'Register incoming mail (tracked with a QR label, or logged) and log outgoing mail.',
  externalReception: 'Scan collections arriving at your office. Collections for other offices stay In Transit.',
  externalDelivery: 'Scan collections being collected. Subsidiary recipients go through a courier and a signed proof of delivery.',
}

export const TOOLTIPS = {
  workingOffice: 'Scans and status changes on this page are recorded at this office.',

  sendMail: {
    recipient: 'Search by name or email. Only people in the company directory can be selected.',
    destinationOffice: 'The office where the recipient will collect the mail.',
    mailDetails: 'Helps staff and the recipient recognise the item. Do not include confidential content.',
  },

  filters: {
    trackingNumber: 'Full or partial number, e.g. POSTHUB-20260201-00001. You can scan the label into this box.',
    myMailTrackingNumber: 'Pick one or more of your tracking numbers. Type to filter the list.',
    carrierTrackingNumber: "The carrier's own number, e.g. RR123456789PT. Matches any item in a collection.",
    dispatchedBetween: 'Filters by dispatch date. Pending mail (not yet dispatched) is always included.',
    receivedBetween: 'Filters by the date the mail was registered on PostHub.',
    myMailPeriod: 'Filters by dispatch date. Pending mail (not yet dispatched) is matched by its registration date.',
    currentLocation: 'The office where the mail was last scanned.',
    sentTab: 'Mail you registered.',
    incomingTab: 'Mail addressed to you.',
  },

  labels: {
    sender: 'The person who registered the mail. Only their Pending mail is listed.',
    printLabel: 'Prints an A6 label (148 x 105 mm) for the label printer.',
  },

  scan: {
    note: (max) => `Added to the history of every scanned item. Sender and recipient can see it. Max ${max} characters.`,
    confirmDispatch: 'Marks scanned mail In Transit from your office. Mail already at its destination office is marked Arrived.',
    confirmReception: 'Mail for your office becomes Arrived. Mail for other offices stays In Transit and the stop is recorded.',
    confirmDeliveryInternal: "Marks scanned mail Delivered. You will be asked for the collector's smart card.",
    confirmDeliveryExternal: 'Regular collections need a smart card. Subsidiary collections print a proof-of-delivery form for the courier.',
  },

  reroute: {
    reason: (max) => `Why it is being rerouted, e.g. "Recipient moved to TOR". Shown in the mail's history. Max ${max} characters.`,
    returnToSender: "Sets the destination to the sender's office.",
  },

  detailPanel: {
    sendReminder: "Email the recipient a pickup reminder. Recorded in the mail's history.",
    reprintDocument: 'Reprint the proof-of-delivery form for the courier.',
    deleteMail: 'Permanently deletes this mail and its history. Cannot be undone.',
  },

  externalForms: {
    recipientType: 'Use Subsidiary when the recipient has no company account. Delivery then goes through a courier with a signed proof of delivery.',
    externalParty: 'The external company or person. Pick from the list or type a new one.',
    category: 'Subcategories depend on the category. Lists are managed in External Mail Config.',
    carrierTrackingNumber: "The carrier's own tracking number, if any, e.g. RR123456789PT. Searchable later.",
    quantity: 'How many identical items this row represents.',
    logOffice: 'The office receiving (incoming) or sending (outgoing) the mail.',
    includeLogged: 'Logged mail has no label or status; it only counts in reports.',
  },

  config: {
    active: 'Inactive entries are hidden from forms. Existing mail keeps its value.',
    officeName: 'Short name used on labels, e.g. TOC. Saved in capitals as CITY | OFFICE.',
  },

  maintenance: {
    sendReminders: "One email per item. Each reminder is recorded in the mail's history.",
    cleanup: 'Deletes the mail record and its history. Cannot be undone.',
  },

  fullExport: {
    trackedMail: 'One row per collection, plus a Collection Items sheet listing every item.',
    loggedMail: 'Mail logged for reporting only. It has no status or history.',
    mailHistory: 'Every event for the exported internal and tracked mail: status changes, reminders, reprints and reroutes. The largest list; untick it for a faster export.',
    registrationPeriod: 'Date the mail was registered. Leave empty for all time.',
    exportToExcel: 'Reads every selected list in full, then applies the filters.',
    cancelExport: 'Stops after the current request. Nothing is downloaded.',
  },

  // Definitions mirror reports/utils/report-stats.js; update both together.
  reports: {
    sentInternal: 'Mail registered this month and dropped off at a facilities desk (Pending excluded).',
    received: 'Mail that reached its destination office (Arrived or Delivered).',
    deliveredInternal: 'Mail registered this month that has been collected (Delivered).',
    deliveredExternal: 'Tracked items collected so far. Logged mail has no status.',
    deliveredPctInternal: 'Delivered as a share of Sent.',
    deliveredPctExternal: 'Delivered items as a share of tracked items. Logged mail has no status.',
    avgDeliveryTime: 'Average time from first In Transit scan to delivery. Only delivered mail counts.',
    incomingExternal: 'Tracked collection items plus logged quantities received from outside.',
    outgoing: 'Logged items sent outside the company.',
    delta: 'Change vs previous month. pp = percentage points.',
    officeFilter: 'Includes mail sent from or delivered to this office.',
    flowMatrix: "Rows: origin office. Columns: destination office. Origin is the first office in the mail's history.",
  },
}
