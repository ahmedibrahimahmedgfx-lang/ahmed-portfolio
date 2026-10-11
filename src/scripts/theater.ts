/**
 * Full-film player. Films only load and play with sound after an intentional click.
 * The frame is sized from the film's own ratio (never stretched): at most 90vw × 82vh, centred, black around it.
 * Click the picture to pause or resume; drag the timeline to scrub; Esc closes.
 */
let theater: HTMLElement | null = null;
let video: HTMLVideoElement;
let opener: HTMLElement | null = null;
let ratio = 16 / 9;
let layout = () => {};

const fmt = (t: number) => {
  if (!isFinite(t) || t < 0) t = 0;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
};

export function openFilm(src: string, title: string, from?: HTMLElement) {
  if (!theater) return;
  opener = from ?? null;
  const w = Number(from?.dataset.filmW), h = Number(from?.dataset.filmH);
  ratio = w && h ? w / h : 16 / 9;
  theater.querySelector('[data-theater-title]')!.textContent = title;
  theater.hidden = false;
  document.documentElement.style.overflow = 'hidden';
  layout();
  video.src = src;
  video.muted = false;
  video.play().catch(() => {});
  theater.querySelector<HTMLButtonElement>('[data-theater-close]')!.focus();
  dispatchEvent(new CustomEvent('films:pause-previews'));
}

export function closeFilm() {
  if (!theater || theater.hidden) return;
  video.pause();
  video.removeAttribute('src');
  video.load();
  theater.hidden = true;
  document.documentElement.style.overflow = '';
  opener?.focus();
  dispatchEvent(new CustomEvent('films:resume-previews'));
}

export function initTheater() {
  theater = document.querySelector<HTMLElement>('.theater');
  if (!theater) return;
  const th = theater;
  video = th.querySelector('[data-theater-video]')!;
  const screen = th.querySelector<HTMLElement>('[data-theater-screen]')!;
  const frame = th.querySelector<HTMLElement>('[data-theater-frame]')!;
  const surface = th.querySelector<HTMLElement>('[data-scrub-surface]')!;
  const controls = th.querySelector<HTMLElement>('.scrub')!;
  const fill = th.querySelector<HTMLElement>('[data-theater-fill]')!;
  const buf = th.querySelector<HTMLElement>('[data-theater-buf]')!;
  const knob = th.querySelector<HTMLElement>('[data-theater-knob]')!;
  const line = th.querySelector<HTMLElement>('[data-theater-line]')!;
  const cur = th.querySelector<HTMLElement>('[data-theater-cur]')!;
  const dur = th.querySelector<HTMLElement>('[data-theater-dur]')!;
  const toggle = th.querySelector<HTMLButtonElement>('[data-theater-toggle]')!;
  const mute = th.querySelector<HTMLButtonElement>('[data-theater-mute]')!;

  // fit the picture inside min(90vw, screen) × min(82vh, screen minus controls) at its true ratio
  layout = () => {
    if (th.hidden) return;
    const sw = screen.clientWidth, sh = screen.clientHeight - controls.offsetHeight - 14;
    const maxW = Math.min(sw, innerWidth * (innerWidth < 761 ? 1 : 0.9));
    const maxH = Math.max(120, Math.min(sh, innerHeight * 0.82));
    let w = maxW, h = w / ratio;
    if (h > maxH) { h = maxH; w = h * ratio; }
    surface.style.width = `${Math.round(w)}px`;
    surface.style.height = `${Math.round(h)}px`;
    frame.style.width = `${Math.max(Math.round(w), Math.min(sw, 340))}px`;
  };
  addEventListener('resize', layout);
  addEventListener('orientationchange', layout);

  let dragging = false;
  const sync = () => {
    const d = video.duration;
    const p = d && isFinite(d) ? video.currentTime / d : 0;
    fill.style.transform = `scaleX(${p})`;
    knob.style.left = `${p * 100}%`;
    line.setAttribute('aria-valuenow', String(Math.round(p * 100)));
    line.setAttribute('aria-valuetext', `${fmt(video.currentTime)} of ${fmt(d)}`);
    cur.textContent = fmt(video.currentTime);
    dur.textContent = fmt(d);
  };
  const buffered = () => {
    const d = video.duration;
    if (!d || !isFinite(d) || !video.buffered.length) return;
    buf.style.transform = `scaleX(${video.buffered.end(video.buffered.length - 1) / d})`;
  };
  const setToggle = (label: string) => { toggle.textContent = label; toggle.setAttribute('aria-label', label); };
  video.addEventListener('timeupdate', sync);
  video.addEventListener('durationchange', sync);
  video.addEventListener('progress', buffered);
  video.addEventListener('loadedmetadata', () => {
    if (video.videoWidth && video.videoHeight) ratio = video.videoWidth / video.videoHeight;
    layout(); sync(); buffered();
  });
  video.addEventListener('emptied', () => { fill.style.transform = 'scaleX(0)'; buf.style.transform = 'scaleX(0)'; knob.style.left = '0%'; cur.textContent = dur.textContent = '00:00'; });
  video.addEventListener('play', () => { setToggle('Pause'); th.classList.remove('is-paused'); });
  video.addEventListener('pause', () => { if (!dragging) { setToggle('Play'); th.classList.add('is-paused'); } });
  video.addEventListener('ended', () => setToggle('Replay'));
  video.addEventListener('volumechange', () => {
    mute.textContent = video.muted ? 'Sound off' : 'Sound on';
    mute.setAttribute('aria-pressed', String(video.muted));
  });

  const playPause = () => (video.paused || video.ended ? video.play().catch(() => {}) : video.pause());
  toggle.addEventListener('click', playPause);
  mute.addEventListener('click', () => { video.muted = !video.muted; });
  th.querySelector('[data-theater-close]')!.addEventListener('click', closeFilm);

  // timeline: click or drag to scrub (pointer events work for mouse, pen and touch in Safari and Chrome)
  const seekTo = (clientX: number) => {
    const r = line.getBoundingClientRect();
    const d = video.duration;
    if (!d || !isFinite(d)) return;
    video.currentTime = Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * d;
    sync();
  };
  let wasPlaying = false;
  line.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    dragging = true; wasPlaying = !video.paused;
    th.classList.add('is-scrubbing');
    line.setPointerCapture(e.pointerId);
    video.pause();
    seekTo(e.clientX);
  });
  line.addEventListener('pointermove', (e) => { if (dragging) seekTo(e.clientX); });
  const end = () => {
    if (!dragging) return;
    dragging = false;
    th.classList.remove('is-scrubbing');
    if (wasPlaying) video.play().catch(() => {}); else { setToggle('Play'); th.classList.add('is-paused'); }
  };
  line.addEventListener('pointerup', end);
  line.addEventListener('pointercancel', end);
  line.addEventListener('lostpointercapture', end);
  line.addEventListener('keydown', (e) => {
    const d = video.duration || 0;
    if (e.key === 'ArrowRight') { e.preventDefault(); video.currentTime = Math.min(d, video.currentTime + 5); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); video.currentTime = Math.max(0, video.currentTime - 5); }
    if (e.key === 'Home') { e.preventDefault(); video.currentTime = 0; }
    if (e.key === 'End') { e.preventDefault(); video.currentTime = Math.max(0, d - 0.1); }
  });

  // a click on the picture toggles playback
  surface.addEventListener('click', playPause);

  addEventListener('keydown', (e) => {
    if (th.hidden) return;
    if (e.key === 'Escape') closeFilm();
    const tag = document.activeElement?.tagName;
    if (e.key === ' ' && tag !== 'BUTTON' && document.activeElement !== line) { e.preventDefault(); playPause(); }
    if ((e.key === 'm' || e.key === 'M') && !e.metaKey && !e.ctrlKey) video.muted = !video.muted;
    if (e.key === 'Tab') {
      const f = [...th.querySelectorAll<HTMLElement>('button, [tabindex="0"]')].filter((x) => x.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  document.addEventListener('click', (e) => {
    const t = (e.target as Element).closest<HTMLElement>('[data-film]');
    if (!t) return;
    e.preventDefault();
    openFilm(t.dataset.film!, t.dataset.filmTitle ?? 'Film', t);
  });
  document.addEventListener('astro:before-swap', closeFilm);
}
