import {
	defineRoute,
	Container,
	Text,
	LinkButton,
	getIcon,
} from "../../libs/nofbiz/nofbiz.base.js";

import { createNavbar } from "../../components/navbar.js";

export default defineRoute((config) => {
	config.setRouteTitle("Facilities");

	// Navbar component
	const navbar = createNavbar();

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
			new Text("Manage mail processing and tracking", {
				type: "p",
				class: "posthub__page-subtitle",
			}),
		],
		{ class: "facilities__header" },
	);

	// Feature cards
	const featureCards = new Container(
		[
			// Internal Mail Card
			new Container(
				[
					new Text("Internal Mail", {
						type: "h2",
						class: "posthub__card-title",
					}),
					new Text(
						"Register, dispatch, receive, and deliver mail with guided workflows",
						{
							type: "p",
							class: "posthub__card-description",
						},
					),
					new LinkButton("Open", "facilities/internal-mail", {
						class: "posthub__card-btn",
					}),
				],
				{ class: "posthub__card" },
			),

			// External Mail Card
			new Container(
				[
					new Text("External Mail", {
						type: "h2",
						class: "posthub__card-title",
					}),
					new Text("Manage external incoming and outgoing mail", {
						type: "p",
						class: "posthub__card-description",
					}),
					new LinkButton("Open", "facilities/external-mail", {
						class: "posthub__card-btn",
					}),
				],
				{ class: "posthub__card" },
			),

			// Reports Card (not yet implemented)
			new Container(
				[
					new Text("Reports", {
						type: "h2",
						class: "posthub__card-title",
					}),
					new Text("View mail analytics and reports", {
						type: "p",
						class: "posthub__card-description",
					}),
					new LinkButton("Open", "facilities/reports", {
						class: "posthub__card-btn",
					}),
				],
				{ class: "posthub__card" },
			),

			// Manage Locations Card
			new Container(
				[
					new Text("Manage Locations", {
						type: "h2",
						class: "posthub__card-title",
					}),
					new Text("Enable or disable delivery locations", {
						type: "p",
						class: "posthub__card-description",
					}),
					new LinkButton("Open", "facilities/manage-locations", {
						class: "posthub__card-btn",
					}),
				],
				{ class: "posthub__card" },
			),

			// Maintenance Card
			new Container(
				[
					new Text("Maintenance", {
						type: "h2",
						class: "posthub__card-title",
					}),
					new Text(
						"Run admin workflows and database cleanup actions",
						{
							type: "p",
							class: "posthub__card-description",
						},
					),
					new LinkButton("Open", "facilities/maintenance", {
						class: "posthub__card-btn",
					}),
				],
				{ class: "posthub__card" },
			),
		],
		{ class: "posthub__card-grid" },
	);

	// Body wrapper centers content in remaining space below header
	const bodyWrapper = new Container([featureCards], {
		class: "facilities__body",
	});

	// Page wrapper
	const pageWrapper = new Container([pageHeader, bodyWrapper], {
		class: "facilities__wrapper",
	});

	// Return page layout
	return [navbar, pageWrapper];
});
