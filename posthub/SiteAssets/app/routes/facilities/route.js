import {
	defineRoute,
	Container,
	Text,
	LinkButton,
	getIcon,
} from "../../libs/nofbiz/nofbiz.base.js";

import { createNavbar } from "../../components/navbar.js";
import { isFacilitiesAdmin, guardAccess } from "../../utils/access.js";
import { PAGE_DESCRIPTIONS } from "../../utils/copy.js";

export default defineRoute(async (config) => {
	config.setRouteTitle("Facilities");

	// Facilities hub is employee+; non-employees get the 403 page via the guard.
	if (!guardAccess("EMPLOYEE")) return [];

	const navbar = createNavbar();
	const admin = isFacilitiesAdmin();

	// Page header
	const pageHeader = new Container(
		[
			new Container(
				[
					new LinkButton(getIcon("arrow-go-back-line"), "/", {
						class: "posthub__home-icon",
					}),
					new Text("Facilities Dashboard", {
						type: "h1",
						class: "posthub__page-title",
					}),
				],
				{ class: "posthub__title-with-icon" },
			),
			new Text("Process, track and report on all mail.", {
				type: "p",
				class: "posthub__page-subtitle",
			}),
		],
		{ class: "facilities__header" },
	);

	// Card factory keeps the dashboard cards consistent
	const featureCard = (title, description, path) =>
		new Container(
			[
				new Text(title, { type: "h2", class: "posthub__card-title" }),
				new Text(description, { type: "p", class: "posthub__card-description" }),
				new LinkButton("Open", path, { class: "posthub__card-btn" }),
			],
			{ class: "posthub__card" },
		);

	const cards = [
		featureCard(
			"Internal Mail",
			PAGE_DESCRIPTIONS.internalMail,
			"facilities/internal-mail",
		),
		featureCard(
			"External Mail",
			PAGE_DESCRIPTIONS.externalMail,
			"facilities/external-mail",
		),
		featureCard(
			"Reports",
			PAGE_DESCRIPTIONS.reports,
			"facilities/reports",
		),
	];

	// Admin-only: location management, maintenance, and External Mail configuration
	if (admin) {
		cards.push(
			featureCard(
				"Manage Locations",
				PAGE_DESCRIPTIONS.manageLocations,
				"facilities/manage-locations",
			),
			featureCard(
				"Maintenance",
				PAGE_DESCRIPTIONS.maintenance,
				"facilities/maintenance",
			),
			featureCard(
				"External Mail Config",
				PAGE_DESCRIPTIONS.externalConfig,
				"facilities/external-mail/config",
			),
		);
	}

	const featureCards = new Container(cards, { class: "posthub__card-grid" });

	const bodyWrapper = new Container([featureCards], {
		class: "facilities__body",
	});

	const pageWrapper = new Container([pageHeader, bodyWrapper], {
		class: "facilities__wrapper",
	});

	return [navbar, pageWrapper];
});
