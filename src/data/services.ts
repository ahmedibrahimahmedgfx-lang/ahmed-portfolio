/**
 * Services and starting prices for the booking page (/services) and the home "Sessions" section.
 *
 * EDIT HERE: change a price, a delivery time, an included item, or add a new service by copying one block.
 * Nothing else in the code needs to change. Run `npm run build` afterwards.
 *
 * Brand Identity Design and Logo Design text is taken from the Behance services (November 2026).
 */

export const CURRENCY = 'US$';

export type Service = {
  /** used in links: /services?service=<id> */
  id: string;
  n: string;
  name: string;
  /** starting price, number only */
  from: number;
  delivery: string;
  rounds: string;
  summary: string;
  idealFor: string;
  /** optional small label next to the name, e.g. 'Recommended' */
  tag?: string;
  /** optional line under the summary */
  note?: string;
  /** shown as tick boxes the client can switch on or off */
  includes: string[];
};

export const SERVICES: Service[] = [
  {
    id: 'strategic-brand-design',
    n: '01',
    name: 'Strategic Brand Design',
    from: 500,
    tag: 'Recommended',
    note: 'Everything in Brand Identity Design, plus the strategy behind it.',
    delivery: 'Timeline agreed per project',
    rounds: '2 concepts, 3 revisions',
    summary: 'Strategy first. We define who the brand is for, what it stands for and where it sits in its market, then build the full identity on that foundation so every design decision has a reason.',
    idealFor: 'Founders and teams who want a brand built on a clear strategy',
    includes: [
      'Brand positioning',
      'Brand personality',
      'Visual research',
      'Creative direction',
      'Logo design',
      'Typography',
      'Visual identity system',
      'Brand guidelines',
    ],
  },
  {
    id: 'brand-identity',
    n: '02',
    name: 'Brand Identity Design',
    from: 350,
    delivery: 'Within 1 month',
    rounds: '2 concepts, 3 revisions',
    summary: 'Build a strategic and visually distinctive brand identity tailored to your business goals.',
    idealFor: 'Startups, personal brands and growing businesses',
    includes: [
      'Brand discovery and creative direction',
      'Logo design / refined logo system',
      'Color palette selection',
      'Typography system',
      'Visual style development',
      'Brand guidelines for consistent use',
      'Mockup presentations for real-world application',
    ],
  },
  {
    id: 'logo-design',
    n: '03',
    name: 'Logo Design',
    from: 200,
    delivery: 'Less than a week',
    rounds: '2 concepts, 3 revisions',
    summary: 'Custom logo design crafted to represent your brand with clarity and impact.',
    idealFor: 'Businesses, startups and personal brands',
    includes: [
      'Creative research and direction',
      'Custom logo concepts',
      'Typography and symbol exploration',
      'Refined final logo design',
      'Color variations',
      'Black & white version',
      'Presentation mockups',
    ],
  },
];

/** "When do you need it?" options on the booking page */
export const TIMELINES = ['As soon as possible', 'Within a month', 'Within 3 months', 'Flexible'];

/** The three steps of the process, shown under the booking form */
export const PROCESS = [
  { n: '01', head: 'Insight', text: 'Who the brand is for and what it needs to stand for.' },
  { n: '02', head: 'Identity', text: 'Positioning, personality, logo, typography, colour and guidelines.' },
  { n: '03', head: 'Application', text: 'A visual system your team can actually use.' },
];

export const price = (n: number) => `${CURRENCY}${n.toLocaleString('en-US')}`;
