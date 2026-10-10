/**
 * Contextual editorial cursor: a small square that carries a label
 * (VIEW / 01, PLAY, SCRUB, EXPLORE, OPEN ↗, CONNECT →) taken from the nearest [data-cursor].
 * Fine pointers only; touch devices keep their native behaviour.
 */
const fine = () => document.documentElement.classList.contains('has-cursor');

export function initCursor() {
  const el = document.querySelector<HTMLElement>('.cursor');
  if (!el || !fine()) return;
  const label = el.querySelector<HTMLElement>('[data-cursor-label]')!;
  let x = innerWidth / 2, y = innerHeight / 2, cx = x, cy = y, raf = 0, visible = false;
  let magnet: HTMLElement | null = null;

  const loop = () => {
    // slight inertia, quick enough to never feel slow
    cx += (x - cx) * 0.32;
    cy += (y - cy) * 0.32;
    el.style.transform = `translate3d(${cx}px, ${cy}px, 0)`;
    if (magnet) {
      const r = magnet.getBoundingClientRect();
      const mx = (x - (r.left + r.width / 2)) * 0.18;
      const my = (y - (r.top + r.height / 2)) * 0.28;
      magnet.style.transform = `translate3d(${Math.max(-10, Math.min(10, mx))}px, ${Math.max(-6, Math.min(6, my))}px, 0)`;
    }
    raf = Math.abs(x - cx) + Math.abs(y - cy) > 0.1 || magnet ? requestAnimationFrame(loop) : 0;
  };
  const kick = () => { if (!raf) raf = requestAnimationFrame(loop); };

  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    x = e.clientX; y = e.clientY;
    if (!visible) { visible = true; el.style.opacity = '1'; cx = x; cy = y; }
    kick();
  }, { passive: true });
  document.addEventListener('pointerleave', () => { visible = false; el.style.opacity = '0'; });
  addEventListener('pointerdown', () => el.setAttribute('data-down', ''));
  addEventListener('pointerup', () => el.removeAttribute('data-down'));

  const set = (t: Element | null) => {
    const host = (t as HTMLElement | null)?.closest<HTMLElement>('[data-cursor]') ?? null;
    const text = host?.dataset.cursor ?? '';
    if (text) { label.textContent = text; el.setAttribute('data-on', ''); } else el.removeAttribute('data-on');
    const m = (t as HTMLElement | null)?.closest<HTMLElement>('[data-magnetic]') ?? null;
    if (m !== magnet) {
      if (magnet) { magnet.style.transition = 'transform .45s cubic-bezier(.22,1,.36,1)'; magnet.style.transform = ''; }
      magnet = m;
      if (magnet) magnet.style.transition = 'transform .12s linear';
      kick();
    }
  };
  document.addEventListener('pointerover', (e) => set(e.target as Element), { passive: true });
  document.addEventListener('astro:after-swap', () => { set(null); });
  // allow scripts (e.g. the film player) to override the label
  addEventListener('cursor:label', ((e: CustomEvent<string>) => {
    if (e.detail) { label.textContent = e.detail; el.setAttribute('data-on', ''); }
  }) as EventListener);
}
