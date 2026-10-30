import {
	Container,
	Image,
	Text,
	CurrentUser,
	Router,
} from "../libs/nofbiz/nofbiz.base.js";
import { APP_NAME } from "../utils/constants.js";

const LOGO_IMAGE_URL = "/SiteAssets/app/images/logo.png";

export function createNavbar() {
	const user = new CurrentUser();
	const userName = user.get("displayName");

	return new Container(
		[
			// Left section - Logo and branding (navigates home on click)
			new Container(
				[
					new Image(LOGO_IMAGE_URL, {
						alt: "Logo",
						class: "navbar__logo",
					}),
					new Text(APP_NAME, {
						type: "span",
						class: "navbar__brand",
					}),
				],
				{
					class: "navbar__left",
					onClickHandler: () => Router.navigateTo("/"),
				},
			),

			// Right section - User name
			new Container(
				[
					new Text(userName, {
						type: "span",
						class: "navbar__user",
					}),
				],
				{ class: "navbar__right" },
			),
		],
		{ class: "navbar" },
	);
}
