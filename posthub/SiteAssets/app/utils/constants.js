export const APP_NAME = "Posthub";
export const USER_DB_LINK = "http://localhost:5500/posthub/SitePages/";

export const TRACKING_PREFIX = "POSTHUB";
export const EXTERNAL_TRACKING_PREFIX = "EXT";
export const BULK_TRACKING_PREFIX = "BULK";
export const BULK_BATCH_PREFIX = "BATCH";
export const LIST_PACKAGES = "Packages";
export const LIST_LOCATIONS = "Locations";
export const LIST_TIMELINE_ENTRIES = "TimelineEntries";
export const LIST_CATEGORIES = "Categories";
export const LIST_SUBCATEGORIES = "SubCategories";
export const LIST_EXTERNAL_SOURCES = "ExternalSources";
// External Mail lists (fresh master-detail model):
// - Packages: tracked collection headers (one per QR / tracking number) -- the workflow anchor
// - Items:    line items (parts) of a tracked collection; FK via Title = header tracking number
// - Log:      untracked reporting log (ingoing + outgoing); one row per logged item
export const LIST_EXTERNAL_PACKAGES = "ExternalMailPackages";
export const LIST_EXTERNAL_ITEMS = "ExternalMailItems";
export const LIST_EXTERNAL_LOG = "ExternalMailLog";

// SharePoint groups backing the access hierarchy (low -> high privilege).
// Users in neither group are "regular users": no facilities access, but the
// ungated send-mail / my-mail routes remain reachable.
export const FACILITIES_EMPLOYEE_GROUP = "FacilitiesEmployee";
// Members may manage External Mail configuration and other admin-only screens.
export const FACILITIES_ADMIN_GROUP = "FacilitiesManager";
export const PACKAGE_STATUSES = [
	"pending",
	"in transit",
	"arrived",
	"awaiting signature",
	"delivered",
];

export const STATUS_LABELS = {
	"pending": "Pending",
	"in transit": "In Transit",
	"arrived": "Arrived",
	"awaiting signature": "Awaiting Signature",
	"delivered": "Delivered",
};

export const STATUS_DESCRIPTIONS = {
	"pending": "Mail registered on the platform",
	"in transit": "Mail dispatched, currently being transported",
	"arrived": "Mail arrived at destination office",
	"awaiting signature": "Handed to courier for subsidiary delivery; awaiting signed proof",
	"delivered": "Mail picked up by recipient",
};

// Categorical palette for per-building series (grouped bars, donut, lines,
// matrix). All values are drawn from the existing PostHub token palette
// (variables.css) so building charts stay on-brand. Cycles if buildings > 6.
export const BUILDING_PALETTE = [
	"#00965d", // brand primary green
	"#009fb1", // teal (status: arrived)
	"#f1875a", // orange (status: in transit)
	"#0f6cbd", // info blue
	"#0f7164", // dark teal (status: delivered)
	"#939fa6", // gray (status: pending)
];

// Mail direction (external mail only). Ingoing mail may be tracked (QR + workflow)
// or logged; outgoing mail is never tracked -- it is always a reporting-log entry.
export const MAIL_DIRECTIONS = {
	INGOING: "ingoing",
	OUTGOING: "outgoing",
};

export const DIRECTION_LABELS = {
	ingoing: "Ingoing",
	outgoing: "Outgoing",
};

// Label for the single "From / To" field, flipped by direction:
// ingoing mail comes FROM an external party; outgoing mail goes TO one.
export const PARTY_LABELS = {
	ingoing: "From",
	outgoing: "To",
};
