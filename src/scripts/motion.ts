import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { setTapeActive, refreshTape } from './tape';

gsap.registerPlugin(ScrollTrigger);

const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = () => matchMedia('(hover: hover) and (pointer: fine)').matches;

type Cleanup = () => void;

/* ------------------------------------------------------------------ reveals */
function reveals(): Cleanup {
  const els = document.querySelectorAll<HTMLElement>('[data-reveal], [data-mask]');
  if (reduce() || !('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('in')); return () => {}; }
  // masked elements have no visible area yet, so their parent is what we watch
  const owner = new Map<Element, HTMLElement[]>();
  els.forEach((e) => {
    const key = e.hasAttribute('data-mask') ? (e.parentElement ?? e) : e;
    owner.set(key, [...(owner.get(key) ?? []), e]);
  });
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) if (en.isIntersecting) { owner.get(en.target)?.forEach((x) => x.classList.add('in')); io.unobserve(en.target); }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.02 });
  owner.forEach((_, k) => io.observe(k));
  return () => io.disconnect();
}

/* ------------------------------------------------------------------ opening + PRESS PLAY
   Title sequence (about 1.9s, never blocks scrolling), same family as the closing statements:
   AHMED rises from its mask → IBRAHIM follows from a slight offset → SELECTED → RECORDINGS
   → metadata → PRESS PLAY: label, then the line draws, then the arrow. Large blocks, no per-letter motion. */
function opening(home: boolean) {
  const open = document.querySelector<HTMLElement>('.opening');
  if (!open || !home) { setTapeActive(true); return; }
  open.classList.add('intro-live');
  const shaft = open.querySelector<HTMLElement>('[data-play-shaft]');
  const head = open.querySelector<HTMLElement>('[data-play-head]');
  const label = open.querySelector<HTMLElement>('.play .label');
  const l1 = open.querySelector<HTMLElement>('[data-name-line="1"]');
  const l2 = open.querySelector<HTMLElement>('[data-name-line="2"]');
  const i1 = l1?.querySelector<HTMLElement>('.li');
  const i2 = l2?.querySelector<HTMLElement>('.li');
  const name = open.querySelector<HTMLElement>('.name');

  if (reduce()) { open.classList.add('intro-done'); setTapeActive(true); return; }
  const small = innerWidth < 761;

  const intro = gsap.timeline({ defaults: { ease: 'expo.out' }, onComplete: () => open.classList.add('intro-done') });
  if (i1 && i2 && l2) {
    intro
      .fromTo(i1, { y: 0, yPercent: 115, letterSpacing: small ? '-0.004em' : '0.03em' }, { yPercent: 0, letterSpacing: '-0.004em', duration: 1.05, clearProps: 'letterSpacing' }, 0.05)
      .fromTo(i2, { y: 0, yPercent: 115, letterSpacing: small ? '-0.004em' : '0.03em' }, { yPercent: 0, letterSpacing: '-0.004em', duration: 1.1, clearProps: 'letterSpacing' }, 0.2)
      .fromTo(l2, { x: small ? 0 : innerWidth * 0.025 }, { x: 0, duration: 1.3, ease: 'power3.out', clearProps: 'transform' }, 0.2);
  }
  intro
    .fromTo(open.querySelectorAll('[data-intro-title]'), { y: 0, yPercent: 105 }, { yPercent: 0, duration: 0.7, ease: 'power3.out', stagger: 0.11 }, 0.62)
    .fromTo(open.querySelectorAll('[data-intro-meta]'), { y: 0, yPercent: 105 }, { yPercent: 0, duration: 0.6, ease: 'power3.out' }, 0.86)
    .fromTo(open.querySelectorAll('[data-intro]'), { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out', stagger: 0.05, clearProps: 'transform' }, 0.9);
  // PRESS PLAY only plays its entrance from the top; further down, the scroll state owns it
  if (scrollY < innerHeight * 0.05) intro
    .fromTo(label, { opacity: 0, x: -10 }, { opacity: 1, x: 0, duration: 0.45, ease: 'power3.out' }, 1.18)
    .fromTo(shaft, { scaleX: 0 }, { scaleX: 1, duration: 0.6, ease: 'expo.out' }, 1.28)
    .fromTo(head, { opacity: 0, x: -6 }, { opacity: 1, x: 0, duration: 0.35, ease: 'power2.out' }, 1.55);

  // scroll: the two words pass through depth at different rates (inner spans, viewport-relative).
  // AHMED drifts left, lifts a little, recedes; IBRAHIM drifts right and lifts faster. Most of both words stays on screen.
  const travel = () => (small ? 0 : 0.045 * innerWidth);
  if (i1 && i2 && name) gsap.timeline({ scrollTrigger: { trigger: open, start: 'top top', end: 'bottom top', scrub: 0.6, invalidateOnRefresh: true } })
    .fromTo(i1, { x: 0, y: 0, scale: 1, opacity: 1 }, { x: () => -travel(), y: () => -innerHeight * 0.025, scale: 0.97, transformOrigin: '0% 100%', ease: 'none', duration: 0.6, immediateRender: false }, 0)
    .fromTo(i1, { opacity: 1 }, { opacity: 0.55, ease: 'none', duration: 0.4, immediateRender: false }, 0.2)
    .fromTo(i2, { x: 0, y: 0 }, { x: () => travel() * 0.85, y: () => -innerHeight * 0.055, ease: 'none', duration: 0.6, immediateRender: false }, 0)
    .fromTo(name, { y: 0, opacity: 1 }, { y: () => -innerHeight * 0.05, opacity: 0.35, ease: 'power1.in', duration: 0.45, immediateRender: false }, 0.55);

  // the arrow's shaft stretches across the screen and becomes the tape
  const stretch = () => (innerWidth - (shaft!.getBoundingClientRect().left)) / shaft!.offsetWidth;
  gsap.timeline({
    scrollTrigger: {
      trigger: open, start: 'top top', end: '+=38%', scrub: 0.4, invalidateOnRefresh: true,
      onLeave: () => setTapeActive(true),
      onEnterBack: () => setTapeActive(false),
    },
  })
    .fromTo(label, { opacity: 1, x: 0 }, { opacity: 0, x: -20, ease: 'none', duration: 0.3, immediateRender: false }, 0)
    .fromTo(head, { opacity: 1 }, { opacity: 0, ease: 'none', duration: 0.2, immediateRender: false }, 0)
    .fromTo(shaft, { scaleX: 1 }, { scaleX: stretch, ease: 'power2.in', duration: 1, immediateRender: false }, 0)
    .fromTo(shaft, { opacity: 1 }, { opacity: 0, duration: 0.15, immediateRender: false }, 0.9);

  setTapeActive(scrollY > innerHeight * 0.38);
}

/* ------------------------------------------------------------------ tape draws under headings */
function tapeDraws() {
  document.querySelectorAll<HTMLElement>('[data-tape-draw]').forEach((el) => {
    if (reduce()) { el.style.transform = 'scaleX(1)'; return; }
    gsap.fromTo(el, { scaleX: 0 }, { scaleX: 1, ease: 'none', scrollTrigger: { trigger: el, start: 'top 92%', end: 'top 45%', scrub: 0.5 } });
  });
  document.querySelectorAll<HTMLElement>('.u-tape').forEach((el) => {
    el.style.position = 'relative';
    const line = document.createElement('span');
    line.setAttribute('aria-hidden', 'true');
    Object.assign(line.style, { position: 'absolute', left: '0', right: '-30vw', bottom: '0.04em', height: '3px', background: 'var(--acid)', transformOrigin: 'left', transform: 'scaleX(0)' });
    el.appendChild(line);
    if (reduce()) { line.style.transform = 'scaleX(1)'; line.style.right = '0'; return; }
    gsap.to(line, { scaleX: 1, ease: 'none', scrollTrigger: { trigger: el, start: 'top 85%', end: 'top 40%', scrub: 0.5 } });
  });
}

/* ------------------------------------------------------------------ STRATEGY → … → EXPRESSION */
function chain() {
  const c = document.querySelector<HTMLElement>('[data-chain]');
  if (!c) return;
  const words = [...c.querySelectorAll<HTMLElement>('.w')];
  if (reduce()) { words.forEach((w) => w.classList.add('on')); return; }
  ScrollTrigger.create({
    trigger: c, start: 'top 80%', end: 'bottom 40%', scrub: true,
    onUpdate: (st) => words.forEach((w, i) => w.classList.toggle('on', st.progress >= i / words.length)),
  });
}

/* ------------------------------------------------------------------ parallax */
function parallax() {
  if (reduce()) return;
  document.querySelectorAll<HTMLElement>('[data-parallax]').forEach((el) => {
    const amt = Number(el.dataset.parallax || -6);
    gsap.fromTo(el, { yPercent: -amt }, { yPercent: amt, ease: 'none', scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true } });
  });
  document.querySelectorAll<HTMLElement>('[data-parallax-img] img').forEach((el) => {
    gsap.fromTo(el, { scale: 1.12, yPercent: -4 }, { scale: 1, yPercent: 4, ease: 'none', scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true } });
  });
  // track names move a touch slower than the page
  document.querySelectorAll<HTMLElement>('.track-head h2').forEach((el) => {
    gsap.fromTo(el, { xPercent: 4 }, { xPercent: -2, ease: 'none', scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true } });
  });
}

/* ------------------------------------------------------------------ logo sheet */
function logos() {
  const cells = document.querySelectorAll<HTMLElement>('[data-logo]');
  if (!cells.length || reduce()) return;
  ScrollTrigger.batch(cells, {
    start: 'top 90%', once: true,
    onEnter: (b) => gsap.fromTo(b.map((c) => c.querySelector('img')), { scale: 1.6, opacity: 0 }, { scale: 1.25, opacity: 1, duration: 1.4, ease: 'expo.out', stagger: 0.07, clearProps: 'transform' }),
  });
  if (!fine()) return;
  cells.forEach((cell) => {
    const im = cell.querySelector<HTMLElement>('img')!;
    cell.addEventListener('pointermove', (e) => {
      const r = cell.getBoundingClientRect();
      const dx = (e.clientX - r.left) / r.width - 0.5, dy = (e.clientY - r.top) / r.height - 0.5;
      im.style.translate = `${dx * -10}px ${dy * -10}px`;
    });
    cell.addEventListener('pointerleave', () => (im.style.translate = '0 0'));
  });
}

/* ------------------------------------------------------------------ valU: the shadow reveals itself */
function valu(): Cleanup {
  const offs: Cleanup[] = [];
  document.querySelectorAll<HTMLElement>('[data-valu]').forEach((stage) => {
    if (reduce()) { stage.style.setProperty('--r', '120vmax'); return; }
    let px = 0.5, py = 0.46, user = false, tx = 0.5, ty = 0.46, r = 10, raf = 0;
    const apply = () => {
      px += (tx - px) * 0.12; py += (ty - py) * 0.12;
      stage.style.setProperty('--x', `${px * 100}%`);
      stage.style.setProperty('--y', `${py * 100}%`);
      stage.style.setProperty('--r', `${r}vmax`);
      raf = Math.abs(tx - px) + Math.abs(ty - py) > 0.001 ? requestAnimationFrame(apply) : 0;
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(apply); };
    const st = ScrollTrigger.create({
      trigger: stage, start: 'top 85%', end: 'bottom 30%', scrub: true,
      onUpdate: (s) => {
        r = 7 + s.progress * 19; // limited information first, more of the threat as you stay
        if (!user) { tx = 0.28 + s.progress * 0.44; ty = 0.62 - s.progress * 0.2; }
        kick();
      },
    });
    const move = (e: PointerEvent) => {
      const b = stage.getBoundingClientRect();
      user = true; tx = (e.clientX - b.left) / b.width; ty = (e.clientY - b.top) / b.height; kick();
    };
    stage.addEventListener('pointermove', move);
    stage.addEventListener('pointerleave', () => { user = false; });
    offs.push(() => { st.kill(); stage.removeEventListener('pointermove', move); });
  });
  return () => offs.forEach((f) => f());
}

/* ------------------------------------------------------------------ NESCAFÉ: above → below */
function nescafe() {
  document.querySelectorAll<HTMLElement>('[data-nescafe]').forEach((wrap) => {
    if (reduce()) return;
    const img = wrap.querySelector<HTMLElement>('.nes-img')!;
    const above = wrap.querySelector<HTMLElement>('[data-nes-above]');
    const below = wrap.querySelector<HTMLElement>('[data-nes-below]');
    const axis = wrap.querySelector<HTMLElement>('.nes-axis i');
    // read the scene from above (the stands) to below (the workplace), then let the full composition land
    gsap.set(img, { transformOrigin: '50% 6%', scale: innerWidth < innerHeight ? 2.3 : 1.5 });
    gsap.timeline({ scrollTrigger: { trigger: wrap, start: 'top top', end: 'bottom bottom', scrub: 0.6,
      onUpdate: (s) => axis?.style.setProperty('--t', `${Math.min(1, s.progress / 0.72) * 100}%`) } })
      .to(img, { transformOrigin: '50% 94%', ease: 'power1.inOut', duration: 0.5 }, 0.12)
      .to(img, { scale: 1, ease: 'power2.inOut', duration: 0.3 }, 0.7)
      .to(above, { opacity: 0, y: -30, duration: 0.14, ease: 'none' }, 0.3)
      .fromTo(below, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.14, ease: 'none' }, 0.46)
      .to(below, { opacity: 0, duration: 0.1, ease: 'none' }, 0.78);
  });
}

/* ------------------------------------------------------------------ Spotify: sketch ↔ final */
function compare() {
  document.querySelectorAll<HTMLElement>('[data-compare]').forEach((box) => {
    const input = box.querySelector<HTMLInputElement>('input[type=range]')!;
    const set = (v: number) => box.style.setProperty('--split', `${v}%`);
    input.addEventListener('input', () => set(Number(input.value)));
    const fromPointer = (e: PointerEvent) => {
      const r = box.getBoundingClientRect();
      const v = Math.round(Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)));
      input.value = String(v); set(v);
    };
    box.addEventListener('pointerdown', (e) => { fromPointer(e); box.setPointerCapture(e.pointerId); });
    box.addEventListener('pointermove', (e) => { if (e.buttons || e.pointerType === 'mouse') fromPointer(e); });
    if (!reduce()) {
      // the system arrives as you scroll: sketch first, then the final type takes over
      ScrollTrigger.create({ trigger: box, start: 'top 75%', end: 'bottom 35%', scrub: true,
        onUpdate: (s) => { if (!box.matches(':hover')) { const v = Math.round(92 - s.progress * 70); input.value = String(v); set(v); } } });
    }
  });
}

/* ------------------------------------------------------------------ typography: letterform → poster
   ENTRY → LETTERFORM → TRANSFORMATION → FULL POSTER MOMENT → EXIT
   Boxes are measured, every image is fitted inside its box at its own aspect ratio (never stretched). */
type Box = { x: number; y: number; w: number; h: number };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpBox = (a: Box, b: Box, t: number): Box => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), w: lerp(a.w, b.w, t), h: lerp(a.h, b.h, t) });
const seg = (p: number, a: number, b: number) => Math.min(1, Math.max(0, (p - a) / (b - a)));
const io3 = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const fit = (box: Box, r: number): Box => {
  const w = Math.min(box.w, box.h * r), h = w / r;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
};
/** Lays out posters inside a box at equal height (row) or main + stacked column, whichever is larger. */
function arrange(box: Box, ratios: number[], gap: number): Box[] {
  const n = ratios.length;
  const sum = ratios.reduce((a, b) => a + b, 0);
  let H = Math.min(box.h, (box.w - gap * (n - 1)) / sum);
  let row: Box[] = [];
  let x = 0;
  ratios.forEach((r) => { row.push({ x, y: 0, w: r * H, h: H }); x += r * H + gap; });
  let best = row, bw = x - gap, bh = H, area = ratios.reduce((a, r) => a + r * H * H, 0);
  if (n >= 3) {
    // main + stack: first poster full height, the others stacked in one column beside it
    const rest = ratios.slice(1);
    const k = rest.length;
    // stack width = s; each item height = s / r_i; total = sum(s/r_i) + gap*(k-1) = H2
    const inv = rest.reduce((a, r) => a + 1 / r, 0);
    // solve H2 so that ratios[0]*H2 + gap + s <= box.w, with s = (H2 - gap*(k-1)) / inv
    let H2 = Math.min(box.h, (box.w - gap + (gap * (k - 1)) / inv) / (ratios[0] + 1 / inv));
    const s = (H2 - gap * (k - 1)) / inv;
    const out: Box[] = [{ x: 0, y: 0, w: ratios[0] * H2, h: H2 }];
    let y = 0;
    rest.forEach((r) => { out.push({ x: ratios[0] * H2 + gap, y, w: s, h: s / r }); y += s / r + gap; });
    const a2 = ratios[0] * H2 * H2 + rest.reduce((a, r) => a + s * (s / r), 0);
    if (a2 > area) { best = out; bw = ratios[0] * H2 + gap + s; bh = H2; area = a2; }
  }
  const ox = box.x + (box.w - bw) / 2, oy = box.y + (box.h - bh) / 2;
  return best.map((b) => ({ x: b.x + ox, y: b.y + oy, w: b.w, h: b.h }));
}

function typeSequences(): Cleanup {
  const seqs = [...document.querySelectorAll<HTMLElement>('[data-type-seq]')];
  const wide = matchMedia('(min-width: 761px) and (min-aspect-ratio: 1/1)');
  if (!seqs.length || reduce() || !wide.matches) return () => {};
  const offs: Cleanup[] = [];
  seqs.forEach((seq) => {
    seq.classList.add('is-pinned');
    const stage = seq.querySelector<HTMLElement>('.tw-stage')!;
    const letter = seq.querySelector<HTMLElement>('[data-tw-letter]')!;
    const group = seq.querySelector<HTMLElement>('[data-tw-posters]')!;
    const posters = [...seq.querySelectorAll<HTMLElement>('[data-tw-poster]')];
    const ratios = posters.map((p) => Number(p.dataset.ratio) || 0.8);
    const lr = Number(letter.dataset.ratio) || 1.4;
    const phase = seq.querySelector<HTMLElement>('[data-tw-phase]');
    const step = seq.querySelector<HTMLElement>('[data-tw-step]');
    const flip = seq.classList.contains('tw-seq--flip');
    let target = 0, cur = 0, raf = 0;

    const render = (p: number) => {
      const W = stage.clientWidth, H = stage.clientHeight;
      const m = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--m')) || 64;
      const top = Math.max(110, H * 0.15), bottom = Math.max(70, H * 0.09);
      const A: Box = { x: m, y: top, w: W - 2 * m, h: H - top - bottom };
      const gap = Math.max(16, A.w * 0.03);
      const colL = A.w * 0.37, colP = A.w - colL - gap;
      // letter: centred and large → its 37% column → leaves outward
      const L1: Box = { x: A.x + A.w * 0.19, y: A.y, w: A.w * 0.62, h: A.h * 0.78 };
      const L4: Box = flip ? { x: A.x + colP + gap, y: A.y + A.h * 0.1, w: colL, h: A.h * 0.8 } : { x: A.x, y: A.y + A.h * 0.1, w: colL, h: A.h * 0.8 };
      const L5: Box = { ...L4, x: L4.x + (flip ? 1 : -1) * A.w * 0.12 };
      const P4: Box = flip ? { x: A.x, y: A.y, w: colP, h: A.h } : { x: A.x + colL + gap, y: A.y, w: colP, h: A.h };
      const t1 = io3(seg(p, 0.05, 0.34));
      const tr = io3(seg(p, 0.16, 0.46));
      const t2 = io3(seg(p, 0.58, 0.82));
      const lb = fit(t2 > 0 ? lerpBox(L4, L5, t2) : lerpBox(L1, L4, t1), lr);
      Object.assign(letter.style, { left: `${lb.x}px`, top: `${lb.y}px`, width: `${lb.w}px`, height: `${lb.h}px`, opacity: String(1 - t2) });
      const pb = lerpBox(P4, A, t2);
      const boxes = arrange(pb, ratios, gap * 0.6);
      const gx = Math.min(...boxes.map((b) => b.x)), gy = Math.min(...boxes.map((b) => b.y));
      const gw = Math.max(...boxes.map((b) => b.x + b.w)) - gx, gh = Math.max(...boxes.map((b) => b.y + b.h)) - gy;
      Object.assign(group.style, { left: `${gx}px`, top: `${gy}px`, width: `${gw}px`, height: `${gh}px` });
      // the poster opens out of the lettering's side and widens until it is whole
      const hidden = (1 - tr) * 100;
      // letter on the left → poster grows rightward from its left edge; flipped → grows leftward
      group.style.clipPath = flip ? `inset(0 0 0 ${hidden}%)` : `inset(0 ${hidden}% 0 0)`;
      boxes.forEach((b, i) => Object.assign(posters[i].style, { left: `${b.x - gx}px`, top: `${b.y - gy}px`, width: `${b.w}px`, height: `${b.h}px` }));
      const ph = p < 0.16 ? 0 : p < 0.58 ? 1 : 2;
      if (phase) phase.textContent = ['Letterform', 'Transformation', 'Composition'][ph];
      if (step) step.textContent = `0${ph + 1} / 03`;
    };
    const tick = () => {
      cur += (target - cur) * 0.2;
      if (Math.abs(target - cur) < 0.0005) cur = target;
      render(cur);
      raf = cur !== target ? requestAnimationFrame(tick) : 0;
    };
    const st = ScrollTrigger.create({
      trigger: stage, pin: true, start: 'top top', end: '+=150%', anticipatePin: 1,
      onUpdate: (s) => { target = s.progress; if (!raf) raf = requestAnimationFrame(tick); },
      onRefresh: (s) => { target = cur = s.progress; render(cur); },
    });
    render(0);
    offs.push(() => { st.kill(); cancelAnimationFrame(raf); seq.classList.remove('is-pinned'); });
  });
  return () => offs.forEach((f) => f());
}

/* ------------------------------------------------------------------ films: real motion when relevant */
function films(): Cleanup {
  const players = [...document.querySelectorAll<HTMLElement>('.player[data-loop]')];
  if (!players.length) return () => {};
  const saveData = (navigator as any).connection?.saveData === true;
  const counters: Cleanup[] = [];

  const ensure = (p: HTMLElement) => {
    const v = p.querySelector('video')!;
    if (v.dataset.ready) return v;
    const loops = JSON.parse(p.dataset.loop!) as { size: number; mp4: string; webm?: string }[];
    const need = p.clientWidth * Math.min(devicePixelRatio || 1, 2);
    const pick = loops.find((l) => l.size >= need * 0.8) ?? loops[loops.length - 1];
    if (pick.webm) { const s = document.createElement('source'); s.src = pick.webm; s.type = 'video/webm'; v.appendChild(s); }
    const s2 = document.createElement('source'); s2.src = pick.mp4; s2.type = 'video/mp4'; v.appendChild(s2);
    v.dataset.ready = '1';
    v.addEventListener('playing', () => p.classList.add('playing'));
    v.load();
    return v;
  };
  let paused = false;
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      const p = en.target as HTMLElement;
      if (en.isIntersecting && !reduce() && !saveData && !paused) {
        const v = ensure(p);
        v.play().catch(() => {});
      } else {
        p.querySelector('video')?.pause();
      }
    }
  }, { threshold: 0.35 });
  players.forEach((p) => io.observe(p));

  // the mini showreel counts its frames
  document.querySelectorAll<HTMLElement>('[data-counter]').forEach((p) => {
    const out = p.closest('.film')?.querySelector<HTMLElement>('[data-frame-counter]');
    const v = p.querySelector('video');
    if (!out || !v) return;
    let raf = 0;
    const tick = () => { out.textContent = String(Math.floor(v.currentTime * 30)).padStart(4, '0'); raf = requestAnimationFrame(tick); };
    v.addEventListener('play', () => { if (!raf) raf = requestAnimationFrame(tick); });
    v.addEventListener('pause', () => { cancelAnimationFrame(raf); raf = 0; });
    counters.push(() => cancelAnimationFrame(raf));
  });

  const pauseAll = () => { paused = true; players.forEach((p) => p.querySelector('video')?.pause()); };
  const resume = () => { paused = false; players.forEach((p) => { const r = p.getBoundingClientRect(); if (r.top < innerHeight && r.bottom > 0 && p.querySelector('video')?.dataset.ready) p.querySelector('video')!.play().catch(() => {}); }); };
  addEventListener('films:pause-previews', pauseAll);
  addEventListener('films:resume-previews', resume);
  return () => {
    io.disconnect(); counters.forEach((c) => c());
    removeEventListener('films:pause-previews', pauseAll); removeEventListener('films:resume-previews', resume);
    players.forEach((p) => p.querySelector('video')?.pause());
  };
}

/* ------------------------------------------------------------------ contact: the tape follows the link */
function contact() {
  const box = document.querySelector<HTMLElement>('[data-contact]');
  if (!box) return;
  const follow = box.querySelector<HTMLElement>('[data-follow]')!;
  const links = [...box.querySelectorAll<HTMLElement>('[data-contact-link]')];
  const list = follow.parentElement!;
  const to = (a: HTMLElement) => {
    const y = a.getBoundingClientRect().bottom - list.getBoundingClientRect().top;
    const x = a.querySelector('.v')!.getBoundingClientRect().left - list.getBoundingClientRect().left;
    gsap.to(follow, { y, x: x * 0, duration: reduce() ? 0 : 0.55, ease: 'expo.out' });
  };
  requestAnimationFrame(() => to(links[0]));
  links.forEach((a) => { a.addEventListener('pointerenter', () => to(a)); a.addEventListener('focus', () => to(a)); });
  box.addEventListener('pointerleave', () => to(links[0]));
  if (!reduce()) gsap.fromTo(follow, { scaleX: 0 }, { scaleX: 1, ease: 'none', scrollTrigger: { trigger: box, start: 'top 85%', end: 'top 45%', scrub: 0.5 } });
}

/* ------------------------------------------------------------------ closing: the tools evolve / the thinking stays
   quiet black → THE TOOLS → EVOLVE. → pause → first statement recedes → THE THINKING → STAYS. */
function toolsThinking() {
  const tt = document.querySelector<HTMLElement>('[data-tt]');
  if (!tt || reduce()) return;
  const stage = tt.querySelector<HTMLElement>('.tt-stage')!;
  const A = tt.querySelector<HTMLElement>('[data-tt-a]')!;
  const B = tt.querySelector<HTMLElement>('[data-tt-b]')!;
  const [a1, a2] = [...A.querySelectorAll<HTMLElement>('[data-tt-w]')];
  const [b1, b2] = [...B.querySelectorAll<HTMLElement>('[data-tt-w]')];
  tt.classList.add('is-live');
  const css = getComputedStyle(document.documentElement);
  const bone = css.getPropertyValue('--bone').trim() || '#ece8df';
  const graphite = css.getPropertyValue('--graphite').trim() || '#494949';
  const acid = css.getPropertyValue('--acid').trim() || '#d7ff00';
  // A sits alone in the centre first, then makes room for B
  const centre = () => (B.offsetHeight + parseFloat(getComputedStyle(stage).rowGap || '0')) / 2;
  gsap.set(A, { color: bone });
  gsap.set(b2, { color: bone });
  const enter = { yPercent: 0, letterSpacing: '-0.004em', ease: 'expo.out', duration: 0.13 };
  // the section only releases once both statements have cleared: nothing from it is left on screen
  // when "Tape ends." and the contact follow. onLeave snaps to the end state if the scroll outruns the scrub.
  gsap.timeline({
    scrollTrigger: {
      trigger: stage, pin: true, pinSpacing: true, start: 'top top', end: '+=235%', scrub: 0.5,
      anticipatePin: 1, invalidateOnRefresh: true,
      onLeave: (self) => { self.animation?.progress(1); },
    },
  })
    .fromTo(A, { y: centre, opacity: 1 }, { y: centre, duration: 0.001 }, 0)
    .fromTo(B, { y: () => centre() * 0.5, scale: 1.03, transformOrigin: '0 0', opacity: 1 }, { y: 0, scale: 1, ease: 'power3.out', duration: 0.18 }, 0.56)
    .fromTo(a1, { yPercent: 108, letterSpacing: '0.09em' }, { ...enter }, 0.06)
    .fromTo(a2, { yPercent: 108, letterSpacing: '0.09em' }, { ...enter }, 0.22)
    // pause 0.35 → 0.46, then the first statement shifts up, recedes and turns graphite
    .to(A, { y: 0, scale: 0.9, color: graphite, ease: 'power2.inOut', duration: 0.16 }, 0.46)
    .fromTo(b1, { yPercent: 108, letterSpacing: '0.09em' }, { ...enter }, 0.6)
    .fromTo(b2, { yPercent: 108, letterSpacing: '0.09em' }, { ...enter }, 0.74)
    .to(b2, { color: acid, ease: 'none', duration: 0.06 }, 0.84)
    // STAYS. holds, then the section clears: the first statement disappears, the second lifts away
    .to(A, { opacity: 0, y: () => -innerHeight * 0.04, ease: 'power2.in', duration: 0.12 }, 0.96)
    .to(B, { opacity: 0, y: () => -innerHeight * 0.06, ease: 'power2.in', duration: 0.14 }, 1.04)
    .to({}, { duration: 0.06 }, 1.18);
}

/* ------------------------------------------------------------------ closing cassette: a physical object, softly
   Only .cassette-object moves; the slot holds its place in the grid, so the composition never shifts. */
function cassette(): Cleanup {
  const slot = document.querySelector<HTMLElement>('[data-cassette]');
  const obj = slot?.querySelector<HTMLElement>('[data-cas-tilt]');
  if (!slot || !obj || reduce()) return () => {};
  const glare = obj.querySelector<HTMLElement>('.cas-glare')!;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (!fine) {
    // touch: an extremely small tilt as it scrolls past; no pointer, no gyroscope
    const tw = gsap.fromTo(obj, { rotationX: 3, rotationY: -1.5 }, { rotationX: -2, rotationY: 1, ease: 'none',
      scrollTrigger: { trigger: slot, start: 'top bottom', end: 'bottom top', scrub: 0.8 } });
    return () => { tw.scrollTrigger?.kill(); tw.kill(); gsap.set(obj, { clearProps: 'transform' }); };
  }
  const opts = { duration: 1.2, ease: 'power3.out' };
  const rx = gsap.quickTo(obj, 'rotationX', opts);
  const ry = gsap.quickTo(obj, 'rotationY', opts);
  const tx = gsap.quickTo(obj, 'x', opts);
  const ty = gsap.quickTo(obj, 'y', opts);
  const go = gsap.quickTo(glare, 'opacity', { duration: 0.9, ease: 'power2.out' });
  const zone = slot.closest<HTMLElement>('.closing') ?? slot;
  const move = (e: PointerEvent) => {
    const r = slot.getBoundingClientRect();
    const reach = Math.max(r.width, 240) * 1.6;
    const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy);
    // full response near the cassette, fading back to neutral as the pointer moves away (no influence beyond 2 × reach)
    const fade = d <= reach ? 1 : Math.max(0, 1 - (d - reach) / reach);
    const nx = Math.max(-1, Math.min(1, dx / reach)) * fade;
    const ny = Math.max(-1, Math.min(1, dy / reach)) * fade;
    ry(nx * 7); rx(-ny * 4);      // rotateY -7 → +7, rotateX +4 → -4
    tx(nx * 3); ty(ny * 2);       // anchored: at most ±3px / ±2px
    go(fade * (0.8 - Math.min(0.55, Math.hypot(nx, ny) * 0.5)));
    glare.style.setProperty('--gx', `${50 + nx * 40}%`);
    glare.style.setProperty('--gy', `${40 + ny * 40}%`);
  };
  const leave = () => { rx(0); ry(0); tx(0); ty(0); go(0); };
  zone.addEventListener('pointermove', move);
  zone.addEventListener('pointerleave', leave);
  return () => { zone.removeEventListener('pointermove', move); zone.removeEventListener('pointerleave', leave); gsap.killTweensOf([obj, glare]); gsap.set(obj, { clearProps: 'transform' }); };
}

/* ------------------------------------------------------------------ case pages: project tone */
function caseTone() {
  const body = document.querySelector<HTMLElement>('[data-case-body]');
  const art = document.querySelector<HTMLElement>('.case[data-tone]');
  if (!body || !art) return;
  ScrollTrigger.create({
    trigger: body, start: 'top 60%', end: 'bottom 40%',
    onToggle: (s) => document.documentElement.style.setProperty('background', s.isActive ? art.dataset.tone! : ''),
  });
  if (!reduce()) {
    const cover = document.querySelector<HTMLElement>('[data-hero-cover] img');
    if (cover) gsap.to(cover, { yPercent: 12, scale: 1.06, ease: 'none', scrollTrigger: { trigger: '.case-hero', start: 'top top', end: 'bottom top', scrub: true } });
  }
}

/* ------------------------------------------------------------------ mount / unmount per page */
let ctx: gsap.Context | null = null;
let cleanups: Cleanup[] = [];

export function mountPage() {
  const home = document.body.classList.contains('home');
  cleanups.push(reveals());
  // pinned sections first, in page order: every trigger created afterwards is measured with their pin spacing
  cleanups.push(typeSequences());
  ctx = gsap.context(() => {
    toolsThinking();
    opening(home);
    tapeDraws();
    chain();
    parallax();
    logos();
    cleanups.push(valu());
    nescafe();
    compare();
    contact();
    caseTone();
  });
  cleanups.push(cassette());
  cleanups.push(films());
  // replay → rewind to the start
  document.querySelectorAll<HTMLElement>('[data-replay]').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault(); scrollTo({ top: 0, behavior: reduce() ? 'auto' : 'smooth' });
  }));
  const refresh = () => { ScrollTrigger.refresh(); refreshTape(); };
  // if anything above a pin changes height after load (late media, fonts), re-measure once it settles
  let lastH = document.body.scrollHeight, rt = 0;
  const ro = new ResizeObserver(() => {
    const h = document.body.scrollHeight;
    if (Math.abs(h - lastH) < 4) return;
    lastH = h; clearTimeout(rt); rt = window.setTimeout(() => { refresh(); lastH = document.body.scrollHeight; }, 250);
  });
  ro.observe(document.body);
  cleanups.push(() => { ro.disconnect(); clearTimeout(rt); });
  document.fonts?.ready.then(refresh);
  addEventListener('load', refresh, { once: true });
  setTimeout(refresh, 800);
}

export function unmountPage() {
  cleanups.forEach((c) => c());
  cleanups = [];
  ctx?.revert();
  ctx = null;
  ScrollTrigger.getAll().forEach((t) => t.kill());
  document.documentElement.style.removeProperty('background');
}
