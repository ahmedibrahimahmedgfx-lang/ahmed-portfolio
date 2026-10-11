/** Site-wide content. Copy is verbatim from 01_REFERENCE.pdf and the website brief. */

export const SITE = {
  name: 'Ahmed Ibrahim',
  role: 'Strategic Brand Designer / Art Director',
  title: 'Ahmed Ibrahim — Strategic Brand Designer & Art Director',
  description:
    'Strategic brand designer and art director specializing in brand identity, visual systems, art direction, typography and AI-assisted visual production.',
  mixtape: 'A VISUAL MIXTAPE / 2019—2026',
  email: 'ahmed.ibrahim.ahmed.gfx@gmail.com',
  whatsappLabel: '+20 15 5394 4840',
  whatsapp: 'https://wa.me/201553944840',
  behance: 'https://www.behance.net/ahmed-ibrahim-gfx',
  behanceLabel: 'ahmed-ibrahim-gfx',
  linkedin: 'https://www.linkedin.com/in/ahmed-ibrahim-ahmed-gfx/',
  linkedinLabel: 'ahmed-ibrahim-ahmed-gfx',
};

export const TRACKS = [
  { n: '01', id: 'brand-identities', name: 'BRAND IDENTITIES', meta: 'STRATEGY / POSITIONING / VISUAL IDENTITY / SYSTEMS', side: 'SIDE A / SELECTED BRAND WORK', preview: 'shafaq-01' },
  { n: '02', id: 'logo-design', name: 'LOGO DESIGN', meta: 'MARKS / SYMBOLS / WORDMARKS / MONOGRAMS', side: 'SIDE A / SELECTED MARKS', preview: 'logo-kairos' },
  { n: '03', id: 'art-direction', name: 'ART DIRECTION', meta: 'CONCEPT / IMAGE / CAMPAIGN / MOTION', side: 'SIDE A / SELECTED VISUAL STORIES', preview: 'nescafe-kv' },
  { n: '04', id: 'typography-posters', name: 'TYPOGRAPHY & POSTERS', meta: 'ARABIC TYPE / LETTERING / EDITORIAL / CULTURAL POSTERS', side: 'SIDE A / SELECTED TYPE & POSTER WORK', preview: 'type-ayesh-a' },
  { n: '05', id: 'visual-rd', name: 'VISUAL R&D', meta: 'AI / MOTION / IMAGE-MAKING / EXPERIMENTAL STUDIES', side: 'SIDE A / SELECTED R&D', preview: 'video:the-question-poster' },
] as const;

export const CHAIN = ['STRATEGY', 'POSITIONING', 'IDENTITY', 'SYSTEM', 'EXPRESSION'];

export const PRACTICE = [
  { head: 'STRATEGY', items: ['Brand Positioning', 'Brand Personality', 'Creative Direction', 'Visual Research'] },
  { head: 'IDENTITY', items: ['Visual Identity Systems', 'Logo Design', 'Typography', 'Brand Guidelines'] },
  { head: 'EXPRESSION', items: ['Art Direction', 'Campaigns', 'Editorial & Posters', 'AI Visual Direction'] },
];

export const EXPERIENCE = [
  { years: '2026/PRESENT', role: 'Sr. Graphic Designer', where: 'HARF / IRAQ' },
  { years: '2023/PRESENT', role: 'Sr. Graphic Designer', where: 'FREELANCE' },
  { years: '2024/2025', role: 'Sr. Graphic Designer', where: 'ORKADZ / SPAIN' },
  { years: '2020/2023', role: 'Graphic Designer', where: 'SHEKO’S STUDIO' },
  { years: '2016/2020', role: 'Graphic Designer', where: 'KARTAJ AGENCY' },
  { years: '2013/2016', role: 'Graphic Designer', where: 'ELSHROUK AGENCY' },
];

export const LOGOS = [
  { id: 'logo-sada', name: 'صدى', rtl: true },
  { id: 'logo-zawaya', name: 'ZAWAYA' },
  { id: 'logo-waffarha', name: 'WAFFARHA' },
  { id: 'logo-kairos', name: 'KAIROS' },
  { id: 'logo-cafe', name: 'CAFE' },
  { id: 'logo-creative-space', name: 'CREATIVE SPACE' },
  { id: 'logo-dibaj', name: 'ديباج', rtl: true },
  { id: 'logo-omar-effendi', name: 'OMAR EFFENDI' },
  { id: 'logo-rashfa', name: 'رشفة', rtl: true },
];

export type TypeWork = {
  n: string;
  slug: string;
  title: string;
  kind: string;
  text: string;
  letter?: string;
  images: string[];
  layout: 'reveal' | 'pair' | 'triptych' | 'wide';
};

export const TYPE_WORKS: TypeWork[] = [
  {
    n: '01', slug: 'ana-bakbar', title: 'ANA BAKBAR', kind: 'ARABIC TYPOGRAPHY / POSTER STUDY',
    text: 'Inspired by Cairokee’s “Ana Bakbar,” the piece translates an internal feeling into visible form. I reinterpreted Ruq’ah calligraphy through my own visual language, then extended the lettering into an expressive editorial poster composition.',
    letter: 'type-ana-bakbar-letter', images: ['type-ana-bakbar-a', 'type-ana-bakbar-b'], layout: 'reveal',
  },
  {
    n: '02', slug: 'wa-fi-al-khitam', title: 'WA FI AL-KHITAM', kind: 'PERSIAN CALLIGRAPHY / POSTER STUDY',
    text: 'A personal exploration of Persian calligraphy, using rhythm, flow and composition to translate the feeling of closure into a visual statement.',
    letter: 'type-wa-fi-al-khitam-letter', images: ['type-wa-fi-al-khitam-a', 'type-wa-fi-al-khitam-b'], layout: 'pair',
  },
  {
    n: '03', slug: 'ayesh', title: 'AYESH', kind: 'EGYPTIAN NASKH / TYPOGRAPHY / POSTER STUDY',
    text: 'A personal exploration of Egyptian Naskh, reshaping its traditional rhythm into a contemporary visual expression of living, movement, and continuity.',
    letter: 'type-ayesh-letter', images: ['type-ayesh-a', 'type-ayesh-b'], layout: 'reveal',
  },
  {
    n: '04', slug: 'howa-saheeh', title: 'HOWA SAHEEH EL HAWA GHALLAB', kind: 'MODERN KUFI / TYPOGRAPHY / POSTER STUDY',
    text: 'A modern Kufic exploration translating the tension between control and surrender into structured letterforms, rhythm, and visual contrast.',
    letter: 'type-howa-saheeh-letter', images: ['type-howa-saheeh-a', 'type-howa-saheeh-b'], layout: 'pair',
  },
  {
    n: '05', slug: 'saab-tekoon-nafsak', title: 'SAAB TEKOON NAFSAK', kind: 'CUSTOM ARABIC LETTERING / POSTER STUDY',
    text: 'An expressive lettering study translating the struggle of being yourself into tension, contrast, and fluid form.',
    letter: 'type-saab-tekoon-nafsak-letter', images: ['type-saab-tekoon-nafsak-a', 'type-saab-tekoon-nafsak-b', 'type-saab-tekoon-nafsak-c'], layout: 'triptych',
  },
  {
    n: '06', slug: 'el-erd', title: 'EL-ERD FI EIN OMMO GHAZAL', kind: 'CUSTOM ARABIC LETTERING / CONCEPTUAL POSTER STUDY',
    text: 'A visual exploration of perception, using Arabic lettering and surreal imagery to show how emotion can reshape the way we see reality.',
    images: ['type-el-erd-a'], layout: 'wide',
  },
  {
    n: '07', slug: 'kont-faker', title: 'KONT FAKER ENI TAYER', kind: 'CUSTOM ARABIC LETTERING / CONCEPTUAL POSTER STUDY',
    text: 'A visual exploration of illusion and escape, turning the feeling of flying into expressive lettering, scale, and surreal composition.',
    letter: 'type-kont-faker-letter', images: ['type-kont-faker-a', 'type-kont-faker-b'], layout: 'reveal',
  },
  {
    n: '08', slug: 'saraqat', title: 'SARAQAT MENAK ROOHAK', kind: 'PERSIAN CALLIGRAPHY / CONCEPTUAL POSTER STUDY',
    text: 'A Persian calligraphy exploration using the cigarette as a visual metaphor, expressing how smoking slowly consumes more than breath — it takes a piece of you.',
    letter: 'type-saraqat-letter', images: ['type-saraqat-a', 'type-saraqat-b'], layout: 'pair',
  },
];

export type Film = {
  n: string;
  id: string;
  title: string;
  kind: string;
  text: string;
  loop: string;
  loopSizes: number[];
  film: string;
  filmSize: number;
  poster: string;
  stills: string[];
  mood: 'quiet' | 'fast' | 'precise';
};

export const FILMS: Film[] = [
  {
    n: '01', id: 'the-question', title: 'THE QUESTION', kind: 'PERSONAL SHORT FILM / 2026',
    text: 'A personal film about questioning where I am, what I know, and how much further I still have to go.',
    loop: 'the-question-loop', loopSizes: [960, 1600], film: 'the-question-film', filmSize: 1920,
    poster: 'the-question-poster', stills: ['the-question-poster-stairs', 'the-question-poster-mirror'], mood: 'quiet',
  },
  {
    n: '02', id: 'mini-showreel', title: 'MINI SHOWREEL', kind: 'PERSONAL SHOWREEL / 2026',
    text: 'A fast-cut personal reel exploring motion, pacing, AI-assisted visuals, and experimental image-making.',
    loop: 'mini-showreel-loop', loopSizes: [720, 1280], film: 'mini-showreel-film', filmSize: 1920,
    poster: 'mini-showreel-poster', stills: ['mini-showreel-poster-cards'], mood: 'fast',
  },
  {
    n: '03', id: 'mac-app-film', title: 'MAC APP FILM', kind: 'ALMANSOUR AUTOMOTIVE / DIGITAL EXPERIENCE / 2026',
    text: 'A short automotive film transforming a functional app experience into a premium, cinematic aftersales story.',
    loop: 'mac-app-film-loop', loopSizes: [360, 540], film: 'mac-app-film-film', filmSize: 720,
    poster: 'mac-app-film-poster', stills: ['mac-app-film-poster-tech', 'mac-app-film-poster-cta'], mood: 'precise',
  },
];
