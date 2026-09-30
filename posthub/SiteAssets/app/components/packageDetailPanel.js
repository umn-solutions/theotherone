import {
	Container,
	Loader,
	Text,
	Button,
	SidePanel,
	SiteApi,
	getIcon,
} from "../libs/nofbiz/nofbiz.base.js";

import {
	getUserEmail,
	getUserDisplayName,
	getNameFromEmail,
	getLocationValue,
} from "../utils/user-helpers.js";
import {
	LIST_TIMELINE_ENTRIES,
	LIST_EXTERNAL_BULK,
	STATUS_DESCRIPTIONS,
} from "../utils/constants.js";

/**
 * Creates a shared package detail SidePanel.
 *
 * @param {object} [options]
 * @param {boolean} [options.showSmartCardId]
 * @param {{
 *   label: string,
 *   variant?: string,
 *   isVisible?: (pkg: object) => boolean,
 *   onClick: (pkg: object, ctx: { close: () => void }) => void | Promise<void>,
 * }[]} [options.actions] - Optional action buttons rendered at the top of the panel.
 *   A button shows only when its isVisible(pkg) is truthy (or omitted). The click
 *   wrapper manages the button's loading state; onClick owns its own error/Toast
 *   handling. Pass actions only where they belong -- other callers get no buttons.
 * @returns {{ panel: SidePanel, show: (pkg: object) => void }}
 */
export function createPackageDetailPanel({ showSmartCardId = false, actions = [] } = {}) {
	const contentContainer = new Container([], {
		class: "posthub__detail-panel-inner",
	});
	const siteApi = new SiteApi();

	// Action buttons live in the panel footer. Only wire a footer when the caller
	// actually passes actions -- other callers get no empty footer bar.
	const hasActions = actions.length > 0;
	const footerContainer = hasActions
		? new Container([], { class: "posthub__detail-footer" })
		: null;

	const panel = new SidePanel({
		title: "Mail Details",
		content: contentContainer,
		...(footerContainer ? { footer: footerContainer } : {}),
		width: "650px",
		backdrop: true,
		closeOnFocusLoss: true,
	});
	panel.render();

	function resolveDisplayName(field) {
		const name = getUserDisplayName(field);
		const email = getUserEmail(field);
		if (name && name !== email) return `${name} (${email})`;
		return email || "N/A";
	}

	function buildTimelineHeader() {
		return new Container(
			[
				new Text("#", {
					type: "span",
					class: "posthub__timeline-number posthub__timeline-header-cell",
				}),
				new Text("Description", {
					type: "span",
					class: "posthub__timeline-description posthub__timeline-header-cell",
				}),
				new Text("Location", {
					type: "span",
					class: "posthub__timeline-location posthub__timeline-header-cell",
				}),
				new Text("Date", {
					type: "span",
					class: "posthub__timeline-date posthub__timeline-header-cell",
				}),
				new Text("Employee", {
					type: "span",
					class: "posthub__timeline-changed-by posthub__timeline-header-cell",
				}),
			],
			{
				class: "posthub__timeline-entry posthub__timeline-entry--header",
			},
		);
	}

	function buildBatchHeader() {
		return new Container(
			[
				new Text("#", {
					type: "span",
					class: "posthub__batch-number posthub__batch-header-cell",
				}),
				new Text("Item", {
					type: "span",
					class: "posthub__batch-item posthub__batch-header-cell",
				}),
				new Text("Category", {
					type: "span",
					class: "posthub__batch-category posthub__batch-header-cell",
				}),
				new Text("Qty", {
					type: "span",
					class: "posthub__batch-qty posthub__batch-header-cell",
				}),
				new Text("Destination", {
					type: "span",
					class: "posthub__batch-destination posthub__batch-header-cell",
				}),
			],
			{ class: "posthub__batch-entry posthub__batch-entry--header" },
		);
	}

	function createBatchItem(item, index, currentPkg) {
		const isCurrent = item.Id === currentPkg.Id;
		return new Container(
			[
				new Text(`${index + 1}.`, {
					type: "span",
					class: "posthub__batch-number",
				}),
				new Text(item.ItemName || item.Title || "", {
					type: "span",
					class: "posthub__batch-item",
				}),
				new Text(item.Category || "--", {
					type: "span",
					class: "posthub__batch-category",
				}),
				new Text(item.Quantity || "--", {
					type: "span",
					class: "posthub__batch-qty",
				}),
				new Text(getLocationValue(item.Destination) || "--", {
					type: "span",
					class: "posthub__batch-destination",
				}),
			],
			{
				class: `posthub__batch-entry${isCurrent ? " posthub__batch-entry--current" : ""}`,
			},
		);
	}

	function createField(label, value) {
		return new Container(
			[
				new Text(label, {
					type: "span",
					class: "posthub__detail-label",
				}),
				new Text(value, {
					type: "span",
					class: "posthub__detail-value",
				}),
			],
			{ class: "posthub__detail-field" },
		);
	}

	function createStatusField(status, statusClass) {
		return new Container(
			[
				new Text("Status", {
					type: "span",
					class: "posthub__detail-label",
				}),
				new Text(status, {
					type: "span",
					class: `posthub__status-badge posthub__status-badge--${statusClass}`,
				}),
			],
			{ class: "posthub__detail-field" },
		);
	}

	function createTimelineEntry(entry, index) {
		const date = entry.Created
			? new Date(entry.Created).toLocaleString()
			: "";

		const cells = [
			new Text(`${index + 1}.`, {
				type: "span",
				class: "posthub__timeline-number",
			}),
			new Text(STATUS_DESCRIPTIONS[entry.Status] || entry.Status, {
				type: "span",
				class: "posthub__timeline-description",
			}),
			new Text(entry.Location || "", {
				type: "span",
				class: "posthub__timeline-location",
			}),
			new Text(date, {
				type: "span",
				class: "posthub__timeline-date",
			}),
			new Text(
				entry.Status === "pending"
					? "-"
					: getNameFromEmail(
							getUserDisplayName(entry.ChangedBy),
						) || "",
				{ type: "span", class: "posthub__timeline-changed-by" },
			),
		];

		const note = (entry.Notes || "").trim();
		if (note) {
			cells.push(
				new Container(
					[
						new Text("Note:", {
							type: "span",
							class: "posthub__timeline-note-label",
						}),
						new Text(note, {
							type: "span",
							class: "posthub__timeline-note-text",
						}),
					],
					{ class: "posthub__timeline-note" },
				),
			);
		}

		return new Container(cells, { class: "posthub__timeline-entry" });
	}

	function buildActionButtons(pkg) {
		return actions
			.filter((a) => (a.isVisible ? a.isVisible(pkg) : true))
			.map((a) => {
				const btn = new Button(a.label, {
					variant: a.variant || "primary",
					class: "posthub__detail-action-btn",
					onClickHandler: async () => {
						btn.isLoading = true;
						try {
							await a.onClick(pkg, { close: () => panel.close() });
						} finally {
							btn.isLoading = false;
						}
					},
				});
				return btn;
			});
	}

	// Bulk mail is untracked (no Status/timeline). Render its own fields and, in
	// place of the timeline, list every item registered in the same batch.
	async function showBulk(pkg) {
		const fields = new Container(
			[
				createField("Tracking Number", pkg.Title),
				createField("Item", pkg.ItemName || "N/A"),
				...(pkg.Category ? [createField("Category", pkg.Category)] : []),
				createField("Quantity", pkg.Quantity || "N/A"),
				createField("Description", pkg.Description || "N/A"),
				createField("From", pkg.FromSource || "N/A"),
				createField(
					"Destination",
					getLocationValue(pkg.Destination) || "N/A",
				),
				createField("Registered By", resolveDisplayName(pkg.RegisteredByEmail)),
				...(pkg.BatchId ? [createField("Batch ID", pkg.BatchId)] : []),
				...(pkg.Created
					? [createField("Registered On", new Date(pkg.Created).toLocaleString())]
					: []),
			],
			{ class: "posthub__detail-fields" },
		);

		const itemsTitle = new Text("Batch Items", {
			type: "h3",
			class: "posthub__detail-section-title",
		});
		const itemsLoader = new Loader([], { animation: "pulse" });
		const itemsContainer = new Container([itemsLoader], {
			class: "posthub__batch-items",
		});

		// Bulk items carry no reprintable QR/tracking -- collapse any action footer.
		if (footerContainer) {
			footerContainer.children = [];
			footerContainer.instance?.parent().css("display", "none");
		}

		contentContainer.children = [fields, itemsTitle, itemsContainer];
		panel.open();
		itemsLoader.enable();

		if (!pkg.BatchId) {
			itemsContainer.children = [
				new Text("No batch information for this item", {
					type: "p",
					class: "posthub__detail-empty",
				}),
			];
			return;
		}

		try {
			const batchItems = await siteApi
				.list(LIST_EXTERNAL_BULK)
				.getItems(
					{ BatchId: pkg.BatchId },
					{ orderBy: { field: "Title", ascending: true } },
				);

			itemsContainer.children =
				batchItems.length > 0
					? [
							buildBatchHeader(),
							...batchItems.map((item, i) =>
								createBatchItem(item, i, pkg),
							),
						]
					: [
							new Text("No items in this batch", {
								type: "p",
								class: "posthub__detail-empty",
							}),
						];
		} catch (err) {
			console.error("[packageDetailPanel] failed to load batch items", err);
			itemsContainer.children = [
				new Text("Failed to load batch items", {
					type: "p",
					class: "posthub__detail-empty",
				}),
			];
		}
	}

	async function show(pkg) {
		if (pkg.__listName === LIST_EXTERNAL_BULK) {
			return showBulk(pkg);
		}

		const statusClass = (pkg.Status || "").replace(" ", "-");

		const extraFields = [];
		if (showSmartCardId && pkg.SmartCardId) {
			extraFields.push(createField("Smart Card ID", pkg.SmartCardId));
		} else if (
			!showSmartCardId &&
			pkg.Status === "delivered" &&
			pkg.SmartCardId
		) {
			extraFields.push(
				new Container(
					[
						new Text(
							[getIcon("checkbox-circle-line"), "Secure PickUp with Digital Signature"],
							{ type: "span", class: "posthub__detail-signature-note__title" },
						),
						new Text(
							"This package was collected with a verified digital signature, confirming the recipient's identity. The facilities team can use this record to identify the responsible individual, adding an additional layer of trust and accountability to the pickup process.",
							{ type: "p", class: "posthub__detail-signature-note__body" },
						),
					],
					{ class: "posthub__detail-field posthub__detail-field--note posthub__detail-signature-note" },
				),
			);
		}

		const fields = new Container(
			[
				createField("Tracking Number", pkg.Title),
				createField("Sender", resolveDisplayName(pkg.Sender)),
				createField("Recipient", resolveDisplayName(pkg.Recipient)),
				createStatusField(pkg.Status, statusClass),
				createField(
					"Current Location",
					getLocationValue(pkg.CurrentLocation) || "N/A",
				),
				createField(
					"Destination",
					getLocationValue(pkg.DestinationLocation) || "N/A",
				),
				createField("Mail Details", pkg.PackageDetails || "N/A"),
				...(pkg.Category ? [createField("Category", pkg.Category)] : []),
				...(pkg.Source ? [createField("Source", pkg.Source)] : []),
				...(pkg.ExternalTrackingId ? [createField("External Tracking ID", pkg.ExternalTrackingId)] : []),
				...(pkg.Carrier ? [createField("Carrier", pkg.Carrier)] : []),
				...extraFields,
			],
			{ class: "posthub__detail-fields" },
		);

		const timelineTitle = new Text("Timeline", {
			type: "h3",
			class: "posthub__detail-section-title",
		});

		const timelineLoader = new Loader([], { animation: "pulse" });
		const timelineContainer = new Container([timelineLoader], {
			class: "posthub__timeline",
		});

		if (footerContainer) {
			const buttons = buildActionButtons(pkg);
			footerContainer.children = buttons;
			// Collapse the footer bar when this item has no applicable action.
			footerContainer.instance
				?.parent()
				.css("display", buttons.length ? "" : "none");
		}

		contentContainer.children = [fields, timelineTitle, timelineContainer];
		panel.open();
		timelineLoader.enable();

		try {
			const timelineEntries = await siteApi
				.list(LIST_TIMELINE_ENTRIES)
				.getItems(
					{ Title: pkg.Title },
					{ orderBy: { field: "Created", ascending: true } },
				);

			timelineContainer.children =
				timelineEntries.length > 0
					? [
							buildTimelineHeader(),
							...timelineEntries.map((entry, i) =>
								createTimelineEntry(entry, i),
							),
						]
					: [
							new Text("No timeline entries recorded", {
								type: "p",
								class: "posthub__detail-empty",
							}),
						];
		} catch (err) {
			console.error("[packageDetailPanel] failed to load timeline", err);
			timelineContainer.children = [
				new Text("Failed to load timeline", {
					type: "p",
					class: "posthub__detail-empty",
				}),
			];
		}
	}

	return { panel, show };
}
