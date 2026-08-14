import {
	defineRoute,
	Container,
	Text,
	Button,
	LinkButton,
	getIcon,
	Toast,
	Router,
	FormField,
	ComboBox,
	FieldLabel,
	PeoplePicker,
	TextArea,
	UserIdentity,
	SiteApi,
	CurrentUser,
	Modal,
	Loader,
} from "../../libs/nofbiz/nofbiz.base.js";

import { createNavbar } from "../../components/navbar.js";
import {
	LIST_LOCATIONS,
	LIST_PACKAGES,
	LIST_TIMELINE_ENTRIES,
	TRACKING_PREFIX,
	USER_DB_LINK,
} from "../../utils/constants.js";

export default defineRoute(async (config) => {
	config.setRouteTitle("Send Mail");

	const siteApi = new SiteApi();
	const user = new CurrentUser();

	// Load active locations
	const activeLocations = await siteApi
		.list(LIST_LOCATIONS)
		.getItems({ IsActive: "true" });

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
					new Text("Send New Mail", {
						type: "h1",
						class: "posthub__page-title",
					}),
				],
				{ class: "posthub__title-with-icon" },
			),
			new Text(
				"Register your mail before delivering it to the nearest facilities desk",
				{
					type: "p",
					class: "posthub__page-subtitle",
				},
			),
		],
		{ class: "send-mail__header" },
	);

	// Left column - Step cards
	const stepCardPhonebook = new Container(
		[
			new Text(getIcon("contacts-book-line"), {
				type: "span",
				class: "send-mail__step-card-icon",
			}),
			new Container(
				[
					new Text("Find the Recipient", {
						type: "h3",
						class: "send-mail__step-card-title",
					}),
					new Text(
						"Click here to look up the recipient's name and office location using the user database",
						{
							type: "p",
							class: "send-mail__step-card-text",
						},
					),
				],
				{ class: "send-mail__step-card-body" },
			),
		],
		{
			class: "send-mail__step-card send-mail__step-card--link",
			onClickHandler: () => {
				console.warn("???");
				Router.navigateTo(USER_DB_LINK, { newTab: true });
			},
		},
	);

	const stepCardForm = new Container(
		[
			new Text(getIcon("edit-line"), {
				type: "span",
				class: "send-mail__step-card-icon",
			}),
			new Container(
				[
					new Text("Fill in the Form", {
						type: "h3",
						class: "send-mail__step-card-title",
					}),
					new Text(
						"Enter the recipient, destination office, and any details about your mail",
						{
							type: "p",
							class: "send-mail__step-card-text",
						},
					),
				],
				{ class: "send-mail__step-card-body" },
			),
		],
		{
			class: "send-mail__step-card send-mail__step-card--link",
			onClickHandler: () => {
				formSection.instance
					?.get(0)
					?.scrollIntoView({ behavior: "smooth", block: "center" });
				formSection.instance?.addClass(
					"send-mail__form-section--highlight",
				);
				setTimeout(() => {
					formSection.instance?.removeClass(
						"send-mail__form-section--highlight",
					);
				}, 1500);
			},
		},
	);

	// Locations modal for drop-off step card
	const locationsModal = new Modal(
		[
			new Container(
				[
					new Text("Drop-off Locations", {
						type: "h3",
						class: "send-mail__locations-title",
					}),
					new Button(getIcon("close-line"), {
						class: "send-mail__locations-close",
						onClickHandler: () => locationsModal.close(),
					}),
				],
				{ class: "send-mail__locations-header" },
			),
			new Text(
				"Bring your mail to any of the facilities access points listed below.",
				{
					type: "p",
					class: "send-mail__locations-intro",
				},
			),
			new Container(
				activeLocations.map(
					(loc) =>
						new Text(loc.Title, {
							type: "p",
							class: "send-mail__locations-item",
						}),
				),
				{ class: "send-mail__locations-list" },
			),
		],
		{
			backdrop: true,
			closeOnFocusLoss: true,
			class: "send-mail__locations-modal",
		},
	);
	const stepCardDropoff = new Container(
		[
			new Text(getIcon("download-line"), {
				type: "span",
				class: "send-mail__step-card-icon",
			}),
			new Container(
				[
					new Text("Drop it Off", {
						type: "h3",
						class: "send-mail__step-card-title",
					}),
					new Text(
						"Bring your physical mail to the nearest facilities desk. They'll generate a label and handle delivery from there",
						{
							type: "p",
							class: "send-mail__step-card-text",
						},
					),
				],
				{ class: "send-mail__step-card-body" },
			),
		],
		{
			class: "send-mail__step-card send-mail__step-card--link",
			onClickHandler: () => locationsModal.open(),
		},
	);

	const infoSection = new Container(
		[stepCardPhonebook, stepCardForm, stepCardDropoff],
		{ class: "send-mail__info-section" },
	);

	// Form fields
	const recipientField = new FormField({ value: { value: "", label: "" } });
	const recipientPicker = new PeoplePicker(recipientField, {});

	const locationField = new FormField({ value: "" });
	const locationOptions = activeLocations.map((loc) => loc.Title);
	const destinationComboBox = new ComboBox(locationField, locationOptions, {
		placeholder: "Select destination office...",
	});

	const detailsField = new FormField({ value: "" });
	const detailsTextArea = new TextArea(detailsField, {
		placeholder: "Type here...",
		rows: 3,
	});

	// Create button
	const createBtn = new Button("Create", {
		variant: "primary",
		onClickHandler: async () => {
			const rawRecipient = recipientField.value?.value ?? null;
			const recipientIdentity = rawRecipient
				? UserIdentity.fromField(rawRecipient)
				: null;
			const destinationRaw = locationField.value;
			const destination =
				typeof destinationRaw === "string"
					? destinationRaw
					: (destinationRaw?.value ?? null);
			const details = detailsField.value;

			if (!recipientIdentity) {
				Toast.error("Recipient is required");
				return;
			}

			if (!destination) {
				Toast.error("Destination office is required");
				return;
			}

			createBtn.isLoading = true;
			contentLoader.toggleLoader();
			const loading = Toast.loading("Creating mail...");

			try {
				// Generate tracking number
				const now = new Date();
				const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
				const sequence = String(
					Math.floor(Math.random() * 100000),
				).padStart(5, "0");
				const trackingNumber = `${TRACKING_PREFIX}-${date}-${sequence}`;

				const senderEmail = user.get("email");

				await siteApi.list(LIST_PACKAGES).createItem({
					Title: trackingNumber,
					Sender: UserIdentity.fromCurrentUser(user),
					Recipient: recipientIdentity,
					SenderEmail: senderEmail,
					RecipientEmail: recipientIdentity.email,
					Status: "pending",
					CurrentLocation: "",
					DestinationLocation: destination,
					PackageDetails: details,
					LastModifiedDate: new Date().toISOString(),
				});

				await siteApi.list(LIST_TIMELINE_ENTRIES).createItem({
					Title: trackingNumber,
					Status: "pending",
					Location: "",
					ChangedBy: UserIdentity.fromCurrentUser(user),
				});

				loading.success(`Mail ${trackingNumber} created`);
				contentLoader.toggleLoader();
				pageHeader.remove();

				mainContent.children = [
					new Container(
						[
							new Text(getIcon("checkbox-circle-line"), {
								type: "span",
								class: "send-mail__step-card-icon",
							}),
							new Container(
								[
									new Text("Mail Registered", {
										type: "h3",
										class: "send-mail__step-card-title",
									}),
									new Text(
										`Your mail ${trackingNumber} has been registered. Bring it to the nearest facilities desk -- they'll generate a label and handle delivery from there.`,
										{
											type: "p",
											class: "send-mail__step-card-text",
										},
									),
									new Container(
										[
											new LinkButton("Back to Home", "/"),
											new Button("Send Another", {
												variant: "primary",
												onClickHandler: () =>
													Router.navigateTo(
														"send-mail",
													),
											}),
										],
										{ class: "send-mail__success-actions" },
									),
								],
								{ class: "send-mail__step-card-body" },
							),
						],
						{ class: "send-mail__step-card" },
					),
				];
			} catch (e) {
				console.error("send-mail createItem error:", e);
				loading.error("Failed to create mail");
				contentLoader.toggleLoader();
				createBtn.isLoading = false;
			}
		},
	});

	// Right column - Form
	const formSection = new Container(
		[
			new Container(
				[
					new Container(
						[
							new Text("Mail Details", {
								type: "span",
								class: "send-mail__form-title",
							}),
						],
						{ class: "send-mail__form-header" },
					),

					// Recipient Name
					new FieldLabel("Recipient Name", recipientPicker, {
						class: "send-mail__form-group",
					}),

					// Destination Office
					new FieldLabel("Destination Office", destinationComboBox, {
						class: "send-mail__form-group",
					}),

					// Mail Details
					new FieldLabel("Mail Details (optional)", detailsTextArea, {
						class: "send-mail__form-group",
					}),

					createBtn,
				],
				{ class: "send-mail__form-content" },
			),
		],
		{ class: "send-mail__form-section" },
	);

	// Two-column layout
	const mainContent = new Container([infoSection, formSection], {
		class: "send-mail__content",
	});

	// Body wrapper centers content in remaining space below header
	const bodyWrapper = new Container([mainContent], {
		class: "send-mail__body",
	});

	// Page wrapper (position: relative for Loader overlay)
	const pageWrapper = new Container([pageHeader, bodyWrapper], {
		class: "send-mail__wrapper",
	});

	// Loader overlays the entire route -- rendered on demand via toggleLoader()
	const contentLoader = new Loader(new Text("Creating mail..."), {
		animation: "pulse",
		containerSelector: `#root`,
	});

	// Return page layout
	return [navbar, pageWrapper, locationsModal];
});
