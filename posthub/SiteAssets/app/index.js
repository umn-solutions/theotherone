import {
	pageReset,
	Router,
	StyleResource,
	resolvePath,
} from "./libs/nofbiz/nofbiz.base.js";
import "./utils/app-icons.js";
import { initCurrentUser } from "./utils/access.js";
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
new StyleResource(resolvePath("@/css/mail-workflow.css"));
new StyleResource(resolvePath("@/components/imageCard.css"));

// Initialize current user + resolve access rank in one bootstrap.
// See utils/access.js for why profile load and rank resolution are two REST passes.
try {
	await initCurrentUser();
} catch (err) {
	// Boot-fatal: without a resolved user the Router and access guards cannot run.
	// Surface a visible message (console alone is invisible to the end user) and
	// halt boot so we never mount routes against a half-initialized app.
	console.error("[boot] user initialization failed", err);
	const fatal = document.createElement("div");
	fatal.className = "posthub__boot-error";
	fatal.setAttribute("role", "alert");
	fatal.textContent =
		"PostHub could not start: failed to load your user profile. Please refresh the page, and contact Facilities if this keeps happening.";
	fatal.style.cssText =
		"margin:16px;padding:16px;border:2px solid #b00020;border-radius:6px;background:#fff;color:#b00020;font:600 14px/1.5 sans-serif;";
	document.body.prepend(fatal);
	throw err;
}

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
	"facilities/external-mail/register-mail", // Register hub (bulk / tracked / registered)
	"facilities/external-mail/register-mail/bulk",
	"facilities/external-mail/register-mail/tracked",
	"facilities/external-mail/register-mail/registered",
	"facilities/external-mail/dispatch",
	"facilities/external-mail/reception",
	"facilities/external-mail/delivery",
	"facilities/external-mail/reroute",
	"facilities/external-mail/search", // Route: /facilities/external-mail/search
	"facilities/external-mail/config", // Admin-only: manage categories/sources/carriers
	"facilities/manage-locations", // Route: /facilities/manage-locations
	"facilities/reports", // Route: /facilities/reports
	"facilities/maintenance", // Route: /facilities/maintenance
]);
