export const APP_NAME = "Posthub";
export const USER_DB_LINK = "http://localhost:5500/posthub/SitePages/";

export const TRACKING_PREFIX = "POSTHUB";
export const LIST_PACKAGES = "Packages";
export const LIST_LOCATIONS = "Locations";
export const LIST_TIMELINE_ENTRIES = "TimelineEntries";
export const PACKAGE_STATUSES = [
	"pending",
	"in transit",
	"arrived",
	"delivered",
];

export const STATUS_LABELS = {
	"pending": "Pending",
	"in transit": "In Transit",
	"arrived": "Arrived",
	"delivered": "Delivered",
};

export const STATUS_DESCRIPTIONS = {
	"pending": "Mail registered on the platform",
	"in transit": "Mail dispatched, currently being transported",
	"arrived": "Mail arrived at destination office",
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
