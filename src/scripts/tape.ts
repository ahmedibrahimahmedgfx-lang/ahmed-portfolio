/**
 * The tape bar: a persistent strip at the bottom of the viewport.
 * Left: current track. Middle: the magnetic tape (scroll progress, one tick per track).
 * Right: a running counter, as on a deck.
 */
type Sec = { el: HTMLElement; track: string; label: string };

let secs: Sec[] = [];
let bar: HTMLElement | null = null;
let prog: HTMLElement, ticks: HTMLElement, tc: HTMLElement, trackEl: HTMLElement, labelEl: HTMLElement;
let raf = 0;

const pad = (n: number, l = 2) => String(Math.floor(n)).padStart(l, '0');

export function counter(seconds: number) {
  const f = Math.floor((seconds % 1) * 30);
  return `${pad(seconds / 3600)}:${pad((seconds / 60) % 60)}:${pad(seconds % 60)}:${pad(f)}`;
}

function update() {
  raf = 0;
  if (!bar) return;
  const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
  const p = Math.min(1, Math.max(0, scrollY / max));
  prog.style.transform = `scaleX(${p})`;
  // one viewport of scrolling = four seconds of tape
  tc.textContent = counter((scrollY / innerHeight) * 4);
  let cur: Sec | undefined;
  for (const s of secs) if (s.el.getBoundingClientRect().top <= innerHeight * 0.45) cur = s;
  cur ??= secs[0];
  if (cur) {
    if (trackEl.textContent !== cur.track) trackEl.textContent = cur.track;
    const l = cur.label ? ` / ${cur.label}` : '';
    if (labelEl.textContent !== l) labelEl.textContent = l;
  }
  ticks.querySelectorAll<HTMLElement>('.tick').forEach((t) => t.classList.toggle('on', Number(t.dataset.p) <= p + 0.0005));
}
const req = () => { if (!raf) raf = requestAnimationFrame(update); };

export function initTape() {
  bar = document.querySelector<HTMLElement>('.tape-bar');
  if (!bar) return;
  prog = bar.querySelector('[data-tape-prog]')!;
  ticks = bar.querySelector('[data-tape-ticks]')!;
  tc = bar.querySelector('[data-tape-tc]')!;
  trackEl = bar.querySelector('[data-tape-track]')!;
  labelEl = bar.querySelector('[data-tape-label]')!;
  addEventListener('scroll', req, { passive: true });
  addEventListener('resize', () => { layoutTicks(); req(); }, { passive: true });
}

function layoutTicks() {
  if (!bar) return;
  const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
  ticks.innerHTML = '';
  let last = '';
  for (const s of secs) {
    if (s.track === last || !/TRACK|SIDE B/.test(s.track)) { last = s.track; continue; }
    last = s.track;
    const top = s.el.getBoundingClientRect().top + scrollY - innerHeight * 0.45;
    const p = Math.min(1, Math.max(0, top / max));
    const t = document.createElement('span');
    t.className = 'tick';
    t.dataset.p = String(p);
    t.style.left = `${p * 100}%`;
    ticks.appendChild(t);
  }
}

/** Called on every page load. */
export function mountTape(active: boolean) {
  if (!bar) return;
  secs = [...document.querySelectorAll<HTMLElement>('[data-section]')].map((el) => ({
    el, track: el.dataset.track ?? '', label: el.dataset.label ?? '',
  }));
  setTapeActive(active);
  layoutTicks();
  req();
  // late images change the document height
  setTimeout(() => { layoutTicks(); req(); }, 1200);
}

export function setTapeActive(on: boolean) {
  bar?.setAttribute('data-state', on ? 'on' : 'idle');
}
export function refreshTape() { layoutTicks(); req(); }
