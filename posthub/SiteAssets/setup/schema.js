/**
 * PostHub provisioning schema -- source of truth for setup.html / setup/index.js.
 *
 * Field shape: { title, indexed?, multiline?, builtIn? } -> nofbiz CreateFieldOptions.
 * - builtIn:true  -> field is NOT created (SharePoint provides it); only re-indexed if indexed:true.
 * - multiline:true -> Note field (richText:false); otherwise single-line Text.
 * Only Text and Note field types are supported by SPARC.
 */

const titleField = { title: 'Title', builtIn: true, indexed: true }

export const SCHEMA = {
  Locations: [
    titleField,
    { title: 'IsActive', indexed: true },
  ],

  Categories: [
    titleField,
    { title: 'IsActive', indexed: true },
  ],

  // Subcategories, each linked to a parent Category (managed on the config page).
  SubCategories: [
    titleField,
    { title: 'ParentCategory', indexed: true },
    { title: 'IsActive', indexed: true },
  ],

  // External Mail option lists (managed via the External Mail config page)
  ExternalSources: [
    titleField,
    { title: 'IsActive', indexed: true },
  ],

  Packages: [
    titleField,
    { title: 'Sender' },
    { title: 'Recipient' },
    { title: 'Status', indexed: true },
    { title: 'CurrentLocation' },
    { title: 'DestinationLocation' },
    { title: 'PackageDetails', multiline: true },
    { title: 'SenderEmail', indexed: true },
    { title: 'RecipientEmail', indexed: true },
    { title: 'SubmissionDate', indexed: true },
    { title: 'LastModifiedDate', indexed: true },
    { title: 'SmartCardId' },
  ],

  TimelineEntries: [
    titleField,
    { title: 'Status', indexed: true },
    { title: 'Location' },
    { title: 'ChangedBy' },
    { title: 'Notes' },
  ],

  // --- External Mail (fresh master-detail model) ---

  // Tracked collection HEADER -- one row per QR / tracking number. This is the
  // record the shared workflow engine advances (scan/dispatch/reception/delivery/
  // reroute); per-item details live in ExternalMailItems. Only incoming mail is tracked.
  ExternalMailPackages: [
    titleField,
    { title: 'Direction', indexed: true },
    { title: 'OffPlatformRecipient', indexed: true }, // 'true' => recipient not on platform (subsidiary exception)
    { title: 'Sender' },
    { title: 'Recipient' },
    { title: 'SenderEmail', indexed: true },
    { title: 'RecipientEmail', indexed: true },
    { title: 'Status', indexed: true },
    { title: 'CurrentLocation' },
    { title: 'DestinationLocation' },
    { title: 'PackageDetails', multiline: true },
    { title: 'Categories', multiline: true }, // JSON array: distinct item categories (display/filter summary)
    { title: 'ItemCount' },
    { title: 'SubmissionDate', indexed: true },
    { title: 'LastModifiedDate', indexed: true },
    { title: 'SmartCardId' },
  ],

  // Tracked collection LINE ITEMS (parts). Title = FK to ExternalMailPackages.Title.
  ExternalMailItems: [
    titleField,
    { title: 'ItemNumber', indexed: true }, // business-logic number, manually entered per item
    { title: 'Category', indexed: true },
    { title: 'SubCategory' },
    { title: 'Description', multiline: true },
    { title: 'FromParty' },
    { title: 'ExternalTrackingId', indexed: true },
  ],

  // Untracked reporting log (incoming + outgoing). One row per logged item; a single
  // "Submit" shares one BatchId across its rows. No QR, no workflow.
  ExternalMailLog: [
    titleField,
    { title: 'Direction', indexed: true },
    { title: 'Category', indexed: true },
    { title: 'SubCategory' },
    { title: 'Quantity' },
    { title: 'Description', multiline: true },
    { title: 'ExternalParty' },   // external org (sender for incoming / recipient for outgoing)
    { title: 'InternalContact' }, // internal person (UserIdentity JSON)
    { title: 'InternalOffice' },  // internal office (Locations title)
    { title: 'RegisteredByEmail', indexed: true },
    { title: 'BatchId', indexed: true },
    { title: 'CollectionNotes', multiline: true }, // collection-level notes, same on every batch row
  ],
}

// SharePoint built-in field internal names -- excluded from "EXTRA" diff noise
// when scanning live lists (on-prem lists return many system fields).
export const BUILTIN_FIELDS = new Set([
  'ID', 'Id', 'Title', 'ContentType', 'ContentTypeId', 'Created', 'Modified',
  'Author', 'Editor', 'Attachments', '_UIVersionString', 'GUID', 'FileLeafRef',
  'LinkTitle', 'LinkTitleNoMenu', 'DocIcon', 'ItemChildCount', 'FolderChildCount',
  'AppAuthor', 'AppEditor', 'ComplianceAssetId', '_ComplianceFlags', 'Order',
  'WorkflowVersion', 'InstanceID', 'owshiddenversion', 'FSObjType', 'Edit',
  '_HasCopyDestinations', '_CopySource', 'ContentVersion', '_ModerationStatus',
  '_ModerationComments', '_Level', '_IsCurrentVersion', 'MetaInfo', 'PermMask',
  '_UIVersion', 'UniqueId', 'SyncClientId', 'ProgId', 'ScopeId', 'File_x0020_Type',
])

// Target for DefaultNew/EditForm redirects (points list forms at the SPA).
export const APP_URL =
  (typeof _spPageContextInfo !== 'undefined' ? _spPageContextInfo.webAbsoluteUrl : '') +
  '/SitePages/index.html'
