import media from '../data/media.json';

type ImgMeta = { w: number; h: number; ratio: number; widths: number[]; color: string; blur: string };
type VidMeta = Record<string, { w: number; h: number; duration: number; webm: boolean }>;

const IMAGES = (media as any).images as Record<string, ImgMeta>;
const VIDEO = (media as any).video as Record<string, any>;

export function img(id: string) {
  const m = IMAGES[id];
  if (!m) throw new Error(`Unknown image id "${id}". Add it to scripts/media/images.json and run npm run media.`);
  const set = (ext: string) => m.widths.map((w) => `/media/img/${id}-${w}.${ext} ${w}w`).join(', ');
  const largest = m.widths[m.widths.length - 1];
  return {
    id,
    width: m.w,
    height: m.h,
    ratio: m.ratio,
    color: m.color,
    blur: m.blur,
    avif: set('avif'),
    webp: set('webp'),
    fallback: `/media/img/${id}-${largest}.webp`,
    small: `/media/img/${id}-${m.widths[0]}.webp`,
    mid: `/media/img/${id}-${m.widths[Math.min(1, m.widths.length - 1)]}.webp`,
  };
}

export function poster(id: string) {
  const m = VIDEO[id];
  return { avif: `/media/motion/${id}.avif`, webp: `/media/motion/${id}.webp`, width: m?.w ?? 1600, height: m?.h ?? 900 };
}

export function video(id: string) {
  const m = VIDEO[id] as VidMeta;
  if (!m) throw new Error(`Unknown video id "${id}"`);
  return Object.entries(m).map(([size, v]) => ({
    size: Number(size),
    ...v,
    mp4: `/media/motion/${id}-${size}.mp4`,
    webm: v.webm ? `/media/motion/${id}-${size}.webm` : undefined,
  }));
}

/** Small preview source used by the pointer-follow preview (webp, ~1280px). */
export function previewSrc(id: string) {
  if (id.startsWith('video:')) return `/media/motion/${id.slice(6)}.webp`;
  return img(id).mid;
}
