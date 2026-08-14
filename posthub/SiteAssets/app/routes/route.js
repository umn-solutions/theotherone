import {
  defineRoute,
  Container,
  Text,
  Image,
  Button,
  Modal,
  AccordionItem,
  AccordionGroup,
} from '../libs/nofbiz/nofbiz.base.js'
import { createImageCard } from '../components/imageCard.js'
import { APP_NAME } from '../utils/constants.js'

export default defineRoute((config) => {
  config.setRouteTitle('Home')

  // Image paths - update these when real assets are provided
  const COMPANY_LOGO_URL = '../SiteAssets/app/images/logo-bnp.svg'
  const LOGO_IMAGE_URL = '../SiteAssets/app/images/posthub-logo.png'
  const SEND_MAIL_IMAGE_URL = '../SiteAssets/app/images/send-mail.png'
  const MY_MAIL_IMAGE_URL = '../SiteAssets/app/images/mailroom.png'
  const FACILITIES_IMAGE_URL = '../SiteAssets/app/images/facilities.jpg'

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
    new Text(APP_NAME, {
      type: 'h1',
      class: 'landing-page__title'
    }),
    new Text('Mail Management Platform', {
      type: 'p',
      class: 'landing-page__subtitle'
    }),
    new Button('How it works', {
      variant: 'secondary',
      onClickHandler: () => howItWorksModal.open(),
      class: 'landing-page__how-it-works-btn',
    }),
    new Text('by <a href="#">UMN Solutions</a> in partnership with <a href="#">NCIS</a>', {
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
      step(1, `Create a ticket on ${APP_NAME}`,
        `Open <strong>Send Mail</strong>, fill in recipient and package details. ${APP_NAME} issues a tracking number and a QR label. No ticket means no transport.`),
      step(2, 'Drop off at a facilities access point',
        'Bring the item with the QR label attached to the nearest facilities point. Staff scans the label and the package enters the logistics flow.'),
      step(3, 'Track in real time',
        'Open <strong>My Mail</strong> to see live status (pending / in transit / arrived / delivered) and the full timeline of every location and handler.'),
      step(4, 'Pickup with a verified digital signature',
        `The recipient (or anyone they authorise) collects the item at the destination office. Pickup is confirmed by a smart-card digital signature, cryptographically tied to whoever signed.`),
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
          `Yes. If it isn't in ${APP_NAME}, facilities won't transport it. The ticket is the chain of custody: without it there is no tracking number, no QR label, no audit trail.`,
          { type: 'p' })]
      ),
      new AccordionItem(
        'What if I forget to create the ticket and just bring the package?',
        [new Text(
          'Facilities will ask you to register it on the spot before accepting. It is faster to do it from your desk first.',
          { type: 'p' })]
      ),
      new AccordionItem(
        'Where does my package go between drop-off and pickup?',
        [new Text(
          'Every status change is location-stamped. Open the package in <strong>My Mail</strong> to see the timeline: which office it left, where it transited, when it arrived.',
          { type: 'p' })]
      ),
      new AccordionItem(
        'What if my package shows up at the wrong office?',
        [new Text(
          'It stays <em>in transit</em> and is re-routed. It is only marked <em>arrived</em> when it reaches the correct destination. Wrong-office stops are visible in the timeline.',
          { type: 'p' })]
      ),
      new AccordionItem(
        'Can I cancel or change the recipient after drop-off?',
        [new Text(
          'Contact facilities. Once a package is <em>in transit</em>, changes need staff intervention to keep the audit trail consistent.',
          { type: 'p' })]
      ),
      new AccordionItem(
        'Who can see my mail records?',
        [new Text(
          'You see your own (sent and received). Facilities staff see all packages for routing. Records are kept for audit.',
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
      new Text('A modern platform for secure internal mail transportation', {
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

  // Cards area with 3 image cards
  const cards = new Container([
    createImageCard({
      title: 'Send Mail',
      description: 'Register a new mail item and generate a tracking label for internal delivery',
      imageSrc: SEND_MAIL_IMAGE_URL,
      path: 'send-mail',
    }),
    createImageCard({
      title: 'My Mail',
      description: 'View and track all your sent and received mail items in one place',
      imageSrc: MY_MAIL_IMAGE_URL,
      path: 'my-mail',
    }),
    createImageCard({
      title: 'Facilities Hub',
      description: 'Process incoming mail, scan QR labels, and route items across offices',
      imageSrc: FACILITIES_IMAGE_URL,
      path: 'facilities',
    }),
  ], { class: 'landing-page__cards' })

  return [
    new Container([sidebar, cards], { class: 'landing-page' }),
    howItWorksModal,
  ]
})
