import {
	pageReset,
	Router,
	CurrentUser,
	StyleResource,
	resolvePath,
} from "./libs/nofbiz/nofbiz.base.js";
import "./utils/app-icons.js";
// Initialize SPARC page settings
pageReset({
	themePath: resolvePath("@/styles/main.css"),
	clearConsole: false,
});

// Shared styles (always active, route CSS auto-loaded by Router)
new StyleResource(resolvePath("@/css/variables.css"));
new StyleResource(resolvePath("@/css/shared.css"));
new StyleResource(resolvePath("@/components/navbar.css"));
new StyleResource(resolvePath("@/components/packageDetailPanel.css"));
new StyleResource(resolvePath("@/components/kpiCard.css"));
new StyleResource(resolvePath("@/components/chartCard.css"));
new StyleResource(resolvePath("@/components/charts/charts.css"));
new StyleResource(resolvePath("@/css/mail-action.css"));
new StyleResource(resolvePath("@/components/imageCard.css"));

// Initialize current user context
const user = new CurrentUser();
await user.initialize();

// Initialize Router
// Note: 'routes/route.js' (home) is auto-loaded, don't register it
new Router([
	"my-mail", // Route: /my-mail
	"send-mail", // Route: /send-mail
	"facilities", // Route: /facilities
"facilities/internal-mail", // Route: /facilities/internal-mail
	"facilities/internal-mail/print-labels", // Route: /facilities/internal-mail/print-labels
	"facilities/internal-mail/dispatch", // Route: /facilities/internal-mail/dispatch
	"facilities/internal-mail/reception", // Route: /facilities/internal-mail/reception
	"facilities/internal-mail/reroute", // Route: /facilities/internal-mail/reroute
	"facilities/internal-mail/delivery", // Route: /facilities/internal-mail/delivery
	"facilities/internal-mail/search-package", // Route: /facilities/internal-mail/search-package
	"facilities/internal-mail/reprint-labels", // Route: /facilities/internal-mail/reprint-labels
	"facilities/external-mail", // Route: /facilities/external-mail
	"facilities/external-mail/register-bulk", // Route: /facilities/external-mail/register-bulk
	"facilities/external-mail/register-tracked", // Route: /facilities/external-mail/register-tracked
	"facilities/external-mail/register-registered", // Route: /facilities/external-mail/register-registered
	"facilities/external-mail/tracked", // Route: /facilities/external-mail/tracked
	"facilities/external-mail/search", // Route: /facilities/external-mail/search
	"facilities/manage-locations", // Route: /facilities/manage-locations
	"facilities/reports", // Route: /facilities/reports
	"facilities/maintenance", // Route: /facilities/maintenance
]);
