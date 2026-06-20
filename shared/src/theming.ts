import {
  HERO_VARIANTS,
  DAY_STYLES,
  DENSITIES,
  CARD_SHAPES,
  DECOR_PATTERNS,
  SECTION_KEYS,
  CUSTOM_CSS_MAX_BYTES,
} from './schemas';

/**
 * The stable theming API — documented hooks Claude can target in custom_css,
 * plus the T2 layout-variant enums. Returned by the MCP `get_theming_api` tool
 * and documented in the README. These class names / data-attributes are a
 * first-class contract: components must keep rendering them.
 */
export const TP_CSS_HOOKS = {
  classes: [
    { selector: '#trip-root', desc: 'Scope wrapper. All custom_css is rescoped under this id.' },
    { selector: '.tp-hero', desc: 'The trip hero/header block.' },
    { selector: '.tp-hero-title', desc: 'Trip title inside the hero.' },
    { selector: '.tp-hero-sub', desc: 'Trip subtitle.' },
    { selector: '.tp-meta', desc: 'Hero meta-chip row (dates, party, base).' },
    { selector: '.tp-variant-switch', desc: 'Itinerary variant switcher (only when >1 itinerary).' },
    { selector: '.tp-section', desc: 'A top-level section wrapper.' },
    { selector: '.tp-day', desc: 'A single day card.' },
    { selector: '.tp-day-head', desc: 'Day header (dow, date, flag, drive).' },
    { selector: '.tp-day-flag', desc: 'Day flag pill.' },
    { selector: '.tp-activity', desc: 'An activity / day_item row.' },
    { selector: '.tp-activity-emoji', desc: 'Activity emoji tile.' },
    { selector: '.tp-activity-name', desc: 'Activity name.' },
    { selector: '.tp-activity-time', desc: 'Activity time / time-of-day pill.' },
    { selector: '.tp-region-pill', desc: 'Region pill (colored via --region-color).' },
    { selector: '.tp-detail', desc: 'The activity detail sheet/modal.' },
    { selector: '.tp-review', desc: 'A review block inside the detail sheet.' },
    { selector: '.tp-lodging', desc: 'A lodging card.' },
  ],
  dataAttributes: [
    { attr: 'data-region', desc: 'Region key on activities/pills, e.g. data-region="volcano".' },
    { attr: 'data-time-of-day', desc: 'Bucket on activities, e.g. data-time-of-day="morning".' },
    { attr: 'data-tag', desc: 'Activity tag, e.g. data-tag="booked".' },
    { attr: 'data-day-style', desc: 'Set on the itinerary root from layout.dayStyle.' },
    { attr: 'data-hero-variant', desc: 'Set on #trip-root from layout.heroVariant.' },
    { attr: 'data-density', desc: 'Set on #trip-root from layout.density.' },
  ],
  tokens: [
    '--coral', '--ocean', '--bg', '--ink', '--sunset',
    '--radius', '--font-display', '--font-body', '--font-mono', '--region-color',
  ],
} as const;

export const LAYOUT_VARIANTS = {
  heroVariant: [...HERO_VARIANTS],
  dayStyle: [...DAY_STYLES],
  density: [...DENSITIES],
  cardShape: [...CARD_SHAPES],
  decorPattern: [...DECOR_PATTERNS],
  sections: [...SECTION_KEYS],
} as const;

export function getThemingApi() {
  return {
    hooks: TP_CSS_HOOKS,
    layoutVariants: LAYOUT_VARIANTS,
    customCssMaxBytes: CUSTOM_CSS_MAX_BYTES,
    rules: [
      'custom_css is rescoped under #trip-root and cannot reach the editor or other trips.',
      '@import, </style> tag-breakouts, and selectors targeting the app chrome are stripped/rejected.',
      'No HTML or JS — CSS only. Target the documented .tp-* classes and data-* attributes.',
    ],
  };
}
