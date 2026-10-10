/**
 * Pointer-driven project previews: hovering a title pulls a large image behind the pointer,
 * like a print dragged across a table. Desktop with a fine pointer only.
 */
const MAP: Record<string, string> = {};

function srcFor(id: string) {
  if (MAP[id]) return MAP[id];
  if (id.startsWith('video:')) return `/media/motion/${id.slice(6)}.webp`;
  return `/media/img/${id}-1280.webp`;
}

export function initPreview() {
  const box = document.querySelector<HTMLElement>('.preview');
  if (!box || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  const img = box.querySelector<HTMLImageElement>('[data-preview-img]')!;
  const cap = box.querySelector<HTMLElement>('[data-preview-cap]')!;
  const num = box.querySelector<HTMLElement>('[data-preview-n]')!;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let x = 0, y = 0, px = 0, py = 0, raf = 0, active: HTMLElement | null = null;

  const loop = () => {
    // delayed inertia: the image trails behind the pointer
    px += (x - px) * (reduce ? 1 : 0.12);
    py += (y - py) * (reduce ? 1 : 0.12);
    const w = box.offsetWidth;
    const left = Math.min(Math.max(px + 28, 12), innerWidth - w - 12);
    const top = Math.min(Math.max(py - box.offsetHeight * 0.5, 12), innerHeight - box.offsetHeight - 60);
    const tilt = reduce ? 0 : Math.max(-2.5, Math.min(2.5, (x - px) * 0.02));
    box.style.transform = `translate3d(${left}px, ${top}px, 0) rotate(${tilt}deg)`;
    raf = active ? requestAnimationFrame(loop) : 0;
  };

  const show = (el: HTMLElement) => {
    const id = el.dataset.preview!;
    const s = el.dataset.previewSrc || srcFor(id);
    if (img.getAttribute('src') !== s) img.src = s;
    cap.textContent = el.dataset.previewCap ?? '';
    num.textContent = el.dataset.previewN ?? '';
    active = el;
    box.classList.add('on');
    if (!raf) { px = x; py = y; raf = requestAnimationFrame(loop); }
  };
  const hide = () => { active = null; box.classList.remove('on'); };

  addEventListener('pointermove', (e) => { x = e.clientX; y = e.clientY; }, { passive: true });
  document.addEventListener('pointerover', (e) => {
    const el = (e.target as Element).closest<HTMLElement>('[data-preview]');
    if (el && el !== active) show(el);
    else if (!el && active) hide();
  });
  addEventListener('scroll', () => { if (active && !active.matches(':hover')) hide(); }, { passive: true });
  document.addEventListener('astro:after-swap', () => {
    hide();
    img.style.viewTransitionName = '';
  });
  // warm the cache for preview images once the page is idle
  const warm = () => {
    document.querySelectorAll<HTMLElement>('[data-preview]').forEach((el, i) => {
      setTimeout(() => { const i2 = new Image(); i2.decoding = 'async'; i2.src = el.dataset.previewSrc || srcFor(el.dataset.preview!); }, 400 + i * 120);
    });
  };
  document.addEventListener('astro:page-load', () => ('requestIdleCallback' in window ? requestIdleCallback(warm) : setTimeout(warm, 1500)));
}

/** Used by the shared-element transition: returns the visible preview image, if any. */
export function activePreviewImage(): HTMLImageElement | null {
  const box = document.querySelector<HTMLElement>('.preview.on');
  return box ? box.querySelector('img') : null;
}
