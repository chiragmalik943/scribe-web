/* ============================================================================
   data.js — the editable content of the site.
   ----------------------------------------------------------------------------
   Everything in this file is placeholder material. Swap the values here and the
   logo strip, the testimonial columns and the integrations grid all update; no
   HTML needs to change.

   Icon names refer to <symbol> ids in the inline SVG sprite at the top of each
   page (e.g. 'mark-1' -> <symbol id="mark-1">).
   ========================================================================== */

/* Customer names shown in the scrolling strip under the hero.
   These are illustrative, not real customers. */
const LOGOS = [
  { name: 'Acme',            icon: 'mark-1' },
  { name: 'Northwind',       icon: 'mark-2' },
  { name: 'Meridian Health', icon: 'mark-3' },
  { name: 'Volta',           icon: 'mark-4' },
  { name: 'Lawson Group',    icon: 'mark-5' },
  { name: 'Driftwave',       icon: 'mark-6' },
  { name: 'Halcyon',         icon: 'mark-7' },
  { name: 'Kestrel',         icon: 'mark-8' }
];

/* Testimonials. Laid out in three vertical columns that scroll slowly.
   Replace `quote`, `name`, `role` and `company` with real ones when you have
   them — and delete any you do not, rather than leaving invented people in. */
const TESTIMONIALS = [
  { quote: 'It flagged that we had quoted two different seat counts to the same client three weeks apart. That one catch paid for the year.',
    name: 'Sarah Mitchell', role: 'Head of Delivery', company: 'Acme', icon: 'mark-1' },
  { quote: 'I stopped keeping a running doc per project. The folder summary is already the running doc.',
    name: 'James Okafor', role: 'Programme Lead', company: 'Northwind', icon: 'mark-2' },
  { quote: 'Every decision links back to the second it was said. Arguments about what was agreed just ended.',
    name: 'Emma Larsson', role: 'Engineering Manager', company: 'Meridian Health', icon: 'mark-3' },
  { quote: 'The tasks come out of the call with owners and dates already on them. I barely edit them.',
    name: 'Daniel Park', role: 'Founder', company: 'Volta', icon: 'mark-4' },
  { quote: 'Nothing leaves the laptop unless I turn it on. That is what got it past our security review.',
    name: 'Priya Nair', role: 'IT Director', company: 'Lawson Group', icon: 'mark-5' },
  { quote: 'I dictate replies now instead of typing them. Same hotkey in every app, no window to open.',
    name: 'Tom Eriksson', role: 'Account Director', company: 'Driftwave', icon: 'mark-6' },
  { quote: 'It caught an open question from a call in July that nobody had ever answered. We answered it.',
    name: 'Aisha Kamara', role: 'Client Partner', company: 'Halcyon', icon: 'mark-7' },
  { quote: 'Onboarding someone onto a project is now: read the folder summary. That used to take a week.',
    name: 'Lucas Webb', role: 'Operations Lead', company: 'Kestrel', icon: 'mark-8' },
  { quote: 'The corrections it learns are the part I did not expect. It stopped mangling our product names.',
    name: 'Nina Hoffman', role: 'Co-founder', company: 'Acme', icon: 'mark-1' }
];

/* The platforms Scribe ships on, in the order the picker lists them.
   `url` is what the download button points at — swap these for real installer
   URLs when you have them. `req` is the line shown under the button once a
   platform is chosen, and `format` is the small print inside the picker. */
const PLATFORMS = [
  { id: 'mac',     name: 'macOS',   icon: 'i-laptop',
    req: 'macOS 13 Ventura or later, Apple silicon and Intel',
    format: 'Universal .dmg', url: 'pricing.html' },
  { id: 'windows', name: 'Windows', icon: 'i-window',
    req: 'Windows 11 and Windows 10, 64-bit',
    format: '.exe installer', url: 'pricing.html' },
  { id: 'linux',   name: 'Linux',   icon: 'i-terminal',
    req: 'Ubuntu 22.04+, Fedora 39+, or any distro that runs AppImage',
    format: '.deb, .rpm or AppImage', url: 'pricing.html' },
  { id: 'ios',     name: 'iOS',     icon: 'i-phone',
    req: 'iPhone and iPad on iOS 16 or later',
    format: 'App Store', url: 'pricing.html' },
  { id: 'android', name: 'Android', icon: 'i-tablet',
    req: 'Android 10 or later',
    format: 'Google Play', url: 'pricing.html' }
];

/* The integrations grid. `status` renders as the small line under the name. */
const INTEGRATIONS = [
  { name: 'Zoom',            status: 'Added Mar 2026',  icon: 'i-video',
    blurb: 'Scribe joins the call as a participant, records its own audio track and files the meeting under the right project.' },
  { name: 'Google Meet',     status: 'Added Mar 2026',  icon: 'i-video',
    blurb: 'Same recording and notes as a native call, including the speaker labels Meet already knows about.' },
  { name: 'Microsoft Teams', status: 'Added Feb 2026',  icon: 'i-video',
    blurb: 'Works with Teams calls on every desktop build, with the meeting title and attendee list carried through.' },
  { name: 'Google Calendar', status: 'Added Jan 2026',  icon: 'i-calendar',
    blurb: 'Reads your next meeting so a recording starts already titled, dated and matched to a project folder.' },
  { name: 'Slack',           status: 'Added Feb 2026',  icon: 'i-chat',
    blurb: 'Post a summary, a decision list, or a single watchout into a channel when a call ends.' },
  { name: 'Notion',          status: 'Added Apr 2026',  icon: 'i-doc',
    blurb: 'Push meeting notes into a database, keeping the timestamps as links back to the recording.' },
  { name: 'Linear',          status: 'Added Apr 2026',  icon: 'i-check-square',
    blurb: 'Turn extracted tasks into issues with the owner, due date and the line that created them.' },
  { name: 'Jira',            status: 'Added May 2026',  icon: 'i-check-square',
    blurb: 'The same task hand-off for teams on Jira, including project and issue-type mapping.' },
  { name: 'HubSpot',         status: 'Added May 2026',  icon: 'i-users',
    blurb: 'Log the call against the right contact and deal, with the summary written into the activity note.' },
  { name: 'Salesforce',      status: 'Added Jun 2026',  icon: 'i-users',
    blurb: 'Attach notes, decisions and next steps to the opportunity without leaving the meeting page.' },
  { name: 'Gmail',           status: 'Added Jun 2026',  icon: 'i-mail',
    blurb: 'Send the notes to the people who were in the room, in one click, from the meeting itself.' },
  { name: 'Zapier',          status: 'Coming soon',     icon: 'i-zap',
    blurb: 'Connect Scribe to anything else you run — 6,000+ apps, no code to write.' }
];
