/**
 * PostHub provisioning schema -- source of truth for setup.html / setup/index.js.
 *
 * Field shape: { title, indexed?, multiline?, builtIn? } -> nofbiz CreateFieldOptions.
 * - builtIn:true  -> field is NOT created (SharePoint provides it); only re-indexed if indexed:true.
 * - multiline:true -> Note field (richText:false); otherwise single-line Text.
 * Only Text and Note field types are supported by SPARC.
 */

const titleField = { title: 'Title', builtIn: true, indexed: true }

// Common columns shared by the tracked mail lists (Packages + external tracked lists).
const trackedMailFields = [
  { title: 'Category', indexed: true },
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
]

export const SCHEMA = {
  Locations: [
    titleField,
    { title: 'IsActive', indexed: true },
  ],

  Categories: [
    titleField,
    { title: 'IsActive', indexed: true },
  ],

  // External Mail option lists (managed via the External Mail config page)
  ExternalSources: [
    titleField,
    { title: 'IsActive', indexed: true },
  ],

  Carriers: [
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

  // Untracked bulk external mail (reporting log only)
  ExternalMailBulk: [
    titleField,
    { title: 'ItemName' },
    { title: 'Category', indexed: true },
    { title: 'Quantity' },
    { title: 'Description', multiline: true },
    { title: 'FromSource' },
    { title: 'Destination' },
    { title: 'RegisteredByEmail', indexed: true },
    { title: 'BatchId', indexed: true },
  ],

  // Internally-tracked external mail (mirrors Packages + Source)
  ExternalMailTracked: [
    titleField,
    { title: 'Source' },
    ...trackedMailFields,
  ],

  // Externally-tracked / registered mail (adds External Tracking ID + Carrier)
  ExternalMailRegistered: [
    titleField,
    { title: 'Source' },
    { title: 'ExternalTrackingId', indexed: true },
    { title: 'Carrier' },
    ...trackedMailFields,
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
