import {
	Container,
	Image,
	Text,
	Router,
} from '../libs/nofbiz/nofbiz.base.js'

/**
 * Creates a clickable image card with hover overlay.
 * @param {{ title: string, description: string, imageSrc: string, path: string }} options
 * @returns {Container}
 */
export function createImageCard({ title, description, imageSrc, path }) {
	const overlay = new Container([
		new Text(title, { type: 'h3', class: 'posthub__image-card__title' }),
		new Text(description, { type: 'p', class: 'posthub__image-card__description' }),
	], { class: 'posthub__image-card__overlay' })

	const card = new Container([
		new Image(imageSrc, { alt: title, class: 'posthub__image-card__image' }),
		overlay,
	], {
		class: 'posthub__image-card',
		onClickHandler: () => Router.navigateTo(path),
	})

	return card
}
