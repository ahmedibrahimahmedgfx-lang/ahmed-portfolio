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

/* ------------------------------------------------------------------ opening + PRESS PLAY */
function opening(home: boolean) {
  const open = document.querySelector<HTMLElement>('.opening');
  if (!open || !home) { setTapeActive(true); return; }
  const shaft = open.querySelector<HTMLElement>('[data-play-shaft]');
  const head = open.querySelector<HTMLElement>('[data-play-head]');
  const label = open.querySelector<HTMLElement>('.play .label');
  const l1 = open.querySelector<HTMLElement>('[data-name-line="1"]');
  const l2 = open.querySelector<HTMLElement>('[data-name-line="2"]');

  if (reduce()) { setTapeActive(true); return; }

  // first frame: the name slides in from opposite edges, metadata types on
  gsap.from([l1, l2], { xPercent: (i) => (i ? 14 : -14), opacity: 0, duration: 1.3, ease: 'expo.out', stagger: 0.08 });
  gsap.from(open.querySelectorAll('.meta-block > div, .side-note'), { opacity: 0, y: 10, duration: 0.8, ease: 'power3.out', stagger: 0.06, delay: 0.25 });
  gsap.from(shaft, { scaleX: 0, duration: 0.9, ease: 'expo.out', delay: 0.7 });

  // the name parts drift apart at a different speed from the page
  gsap.to(l1, { xPercent: -10, ease: 'none', scrollTrigger: { trigger: open, start: 'top top', end: 'bottom top', scrub: true } });
  gsap.to(l2, { xPercent: 8, ease: 'none', scrollTrigger: { trigger: open, start: 'top top', end: 'bottom top', scrub: true } });

  // the arrow's shaft stretches across the screen and becomes the tape
  const stretch = () => (innerWidth - (shaft!.getBoundingClientRect().left)) / shaft!.offsetWidth;
  gsap.timeline({
    scrollTrigger: {
      trigger: open, start: 'top top', end: '+=38%', scrub: 0.4, invalidateOnRefresh: true,
      onLeave: () => setTapeActive(true),
      onEnterBack: () => setTapeActive(false),
    },
  })
    .to(label, { opacity: 0, x: -20, ease: 'none', duration: 0.3 }, 0)
    .to(head, { opacity: 0, ease: 'none', duration: 0.2 }, 0)
    .to(shaft, { scaleX: stretch, ease: 'power2.in', duration: 1 }, 0)
    .to(shaft, { opacity: 0, duration: 0.15 }, 0.9);

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

/* ------------------------------------------------------------------ typography: letterform → poster */
function typeReveals() {
  document.querySelectorAll<HTMLElement>('[data-type-reveal]').forEach((sec) => {
    if (reduce()) return;
    const letter = sec.querySelector<HTMLElement>('[data-tr-letter]');
    const posters = sec.querySelector<HTMLElement>('[data-tr-posters]');
    const phase = sec.querySelector<HTMLElement>('[data-tr-phase]');
    gsap.timeline({ scrollTrigger: { trigger: sec, start: 'top top', end: 'bottom bottom', scrub: 0.5,
      onUpdate: (s) => { if (phase) phase.textContent = s.progress < 0.25 ? 'Feeling' : s.progress < 0.55 ? 'Letterform' : 'Composition'; } } })
      .fromTo(letter, { scale: 1.06, opacity: 1 }, { scale: 0.7, opacity: 0, ease: 'power2.in', duration: 0.38 }, 0.08)
      .fromTo(posters, { clipPath: 'inset(50% 50% 50% 50%)' }, { clipPath: 'inset(0% 0% 0% 0%)', ease: 'power3.inOut', duration: 0.5 }, 0.36);
  });
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
  ctx = gsap.context(() => {
    opening(home);
    tapeDraws();
    chain();
    parallax();
    logos();
    cleanups.push(valu());
    nescafe();
    compare();
    typeReveals();
    contact();
    caseTone();
  });
  cleanups.push(films());
  // replay → rewind to the start
  document.querySelectorAll<HTMLElement>('[data-replay]').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault(); scrollTo({ top: 0, behavior: reduce() ? 'auto' : 'smooth' });
  }));
  const refresh = () => { ScrollTrigger.refresh(); refreshTape(); };
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
