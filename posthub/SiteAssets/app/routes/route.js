import {
  defineRoute,
  Container,
  Text,
  Image,
  Button,
  Modal,
  AccordionItem,
  AccordionGroup,
  escapeAttr,
} from '../libs/nofbiz/nofbiz.base.js'
import { createImageCard } from '../components/imageCard.js'
import { APP_NAME, CLEANUP_STALE_DAYS, UMN_LINK, NCIS_LINK } from '../utils/constants.js'
import { PAGE_DESCRIPTIONS } from '../utils/copy.js'
import { isFacilitiesEmployee } from '../utils/access.js'

export default defineRoute((config) => {
  config.setRouteTitle('Home')

  // Image paths - update these when real assets are provided
  const COMPANY_LOGO_URL = '../SiteAssets/app/images/logo-bnp.svg'
  const LOGO_IMAGE_URL = '../SiteAssets/app/images/posthub-logo.png'
  const SEND_MAIL_IMAGE_URL = '../SiteAssets/app/images/send-mail.png'
  const MY_MAIL_IMAGE_URL = '../SiteAssets/app/images/mailroom.png'
  const FACILITIES_IMAGE_URL = '../SiteAssets/app/images/facilities.jpg'

  // Inline credit link (external partner site, opens in a new tab)
  const creditLink = (href, label) =>
    `<a href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`

  // Sidebar with branding
  const sidebar = new Container([
    new Container([
      new Image(COMPANY_LOGO_URL, {
        alt: 'Company Logo',
        class: 'landing-page__company-logo'
      }),
      new Text('The Bank for a Changing World', {
        type: 'p',
        class: 'landing-page__company-tagline'
      }),
    ], { class: 'landing-page__company-brand' }),
    new Image(LOGO_IMAGE_URL, {
      alt: `${APP_NAME} Logo`,
      class: 'landing-page__logo'
    }),
    new Text('Secure, traceable mail between company offices.', {
      type: 'p',
      class: 'landing-page__subtitle'
    }),
    new Button('How it works', {
      variant: 'secondary',
      onClickHandler: () => howItWorksModal.open(),
      class: 'landing-page__how-it-works-btn',
    }),
    new Text(`Powered by ${creditLink(UMN_LINK, 'UMN Solutions')} in partnership with ${creditLink(NCIS_LINK, 'NCIS')}`, {
      type: 'p',
      class: 'landing-page__credits',
    }),
  ], { class: 'landing-page__sidebar' })

  // How it works modal
  const step = (n, title, body) => new Container([
    new Container([new Text(String(n), { type: 'span', class: 'how-it-works__step-num' })], {
      class: 'how-it-works__step-badge',
    }),
    new Container([
      new Text(title, { type: 'h3', class: 'how-it-works__step-title' }),
      new Text(body, { type: 'p', class: 'how-it-works__step-body' }),
    ], { class: 'how-it-works__step-text' }),
  ], { class: 'how-it-works__step' })

  const stepsSection = new Container([
    new Text('How it works', { type: 'h2', class: 'how-it-works__section-title' }),
    new Container([
      step(1, `Register your mail on ${APP_NAME}`,
        `Open <strong>Send Mail</strong> and enter the recipient, destination office and a short description. ${APP_NAME} gives you a tracking number. Mail that isn't registered isn't transported.`),
      step(2, 'Bring it to a facilities desk',
        'Take the item to any facilities desk. Staff print and attach the QR label, then send it on its way.'),
      step(3, 'Track in real time',
        'Open <strong>My Mail</strong> to see the current status (Pending, In Transit, Arrived, Delivered) and every office it passed through.'),
      step(4, 'Collect at the destination office',
        'Collect it at the destination office. You, or a colleague you send, confirm pickup with a corporate smart card, so there is a record of who collected it.'),
    ], { class: 'how-it-works__steps' }),
  ], { class: 'how-it-works__section' })

  const securityCallout = new Container([
    new Text('Why this exists', { type: 'h2', class: 'how-it-works__section-title' }),
    new Text(
      `Internal mail used to rely entirely on human memory and goodwill: no record of who handed off what, who received it, or where it sat in between. ${APP_NAME} adds a verifiable audit trail at every step. It does not replace people, it backs them up with proof.`,
      { type: 'p', class: 'how-it-works__callout-body' }
    ),
  ], { class: 'how-it-works__section how-it-works__callout' })

  const faqSection = new Container([
    new Text('FAQ', { type: 'h2', class: 'how-it-works__section-title' }),
    new AccordionGroup([
      new AccordionItem(
        'What does "verified digital signature" mean at pickup?',
        [new Text(
          'Pickup is signed with the collector\'s corporate smart card. The signature is cryptographic, non-repudiable, timestamped, and tied to a named identity. It replaces a scribble on a clipboard with proof.',
          { type: 'p' })]
      ),
      new AccordionItem(
        'Can someone else pick up my mail for me?',
        [new Text(
          'Yes. Any colleague with a valid smart card can collect on your behalf. The signature records exactly who picked it up, so accountability stays clear even when you delegate.',
          { type: 'p' })]
      ),
      new AccordionItem(
        'Do I have to register every item, even small envelopes?',
        [new Text(
          `Yes. If it isn't in ${APP_NAME}, facilities won't transport it. The registration is the chain of custody: without it there is no tracking number, no QR label, no audit trail.`,
          { type: 'p' })]
      ),
      new AccordionItem(
        'What if I forget to register and just bring the mail?',
        [new Text(
          'Facilities will ask you to register it on the spot before accepting. It is faster to do it from your desk first.',
          { type: 'p' })]
      ),
      new AccordionItem(
        'Where does my mail go between drop-off and pickup?',
        [new Text(
          'Every status change is location-stamped. Open the item in <strong>My Mail</strong> to see the timeline: which office it left, where it transited, when it arrived.',
          { type: 'p' })]
      ),
      new AccordionItem(
        'What if my mail shows up at the wrong office?',
        [new Text(
          'It stays <em>In Transit</em> and is rerouted. It is only marked <em>Arrived</em> when it reaches the correct destination. Wrong-office stops are visible in the timeline.',
          { type: 'p' })]
      ),
      new AccordionItem(
        'Who can see my mail records?',
        [new Text(
          `<strong>My Mail</strong> shows what you sent and received. Facilities staff see all mail for routing. Records of dispatched mail are kept for audit. Registrations never dropped off may be removed after ${CLEANUP_STALE_DAYS} days.`,
          { type: 'p' })]
      ),
      new AccordionItem(
        'Is this for personal mail too?',
        [new Text(
          `No. ${APP_NAME} is for internal company mail between offices.`,
          { type: 'p' })]
      ),
    ], { class: 'how-it-works__faq' }),
  ], { class: 'how-it-works__section' })

  const howItWorksModal = new Modal([
    new Container([
      new Text(`How ${APP_NAME} works`, { type: 'h1', class: 'how-it-works__title' }),
      new Text('Secure, traceable mail between company offices.', {
        type: 'p',
        class: 'how-it-works__subtitle',
      }),
    ], { class: 'how-it-works__header' }),
    new Container([
      stepsSection,
      securityCallout,
      faqSection,
    ], { class: 'how-it-works__body' }),
  ], {
    backdrop: true,
    closeOnFocusLoss: true,
    class: 'how-it-works__modal',
  })
  howItWorksModal.render()

  // Cards area. Send Mail + My Mail are open to everyone; the Facilities Hub
  // entry point is shown only to facilities employees/admins.
  const cardItems = [
    createImageCard({
      title: 'Send Mail',
      description: 'Register mail you want to send to a colleague in another office.',
      imageSrc: SEND_MAIL_IMAGE_URL,
      path: 'send-mail',
    }),
    createImageCard({
      title: 'My Mail',
      description: PAGE_DESCRIPTIONS.myMail,
      imageSrc: MY_MAIL_IMAGE_URL,
      path: 'my-mail',
    }),
  ]

  if (isFacilitiesEmployee()) {
    cardItems.push(
      createImageCard({
        title: 'Facilities Hub',
        description: 'Print labels, scan mail and manage deliveries across offices.',
        imageSrc: FACILITIES_IMAGE_URL,
        path: 'facilities',
      }),
    )
  }

  const cards = new Container(cardItems, { class: 'landing-page__cards' })

  return [
    new Container([sidebar, cards], { class: 'landing-page' }),
    howItWorksModal,
  ]
})
