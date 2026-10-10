/**
 * Full-film player. Films only load and play with sound after an intentional click.
 * Drag across the picture to scrub; click to pause or resume; Esc closes.
 */
let theater: HTMLElement | null = null;
let video: HTMLVideoElement;
let opener: HTMLElement | null = null;

const fmt = (t: number) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

export function openFilm(src: string, title: string, from?: HTMLElement) {
  if (!theater) return;
  opener = from ?? null;
  theater.querySelector('[data-theater-title]')!.textContent = title;
  video.src = src;
  theater.hidden = false;
  document.documentElement.style.overflow = 'hidden';
  video.currentTime = 0;
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
  video = theater.querySelector('[data-theater-video]')!;
  const fill = theater.querySelector<HTMLElement>('[data-theater-fill]')!;
  const line = theater.querySelector<HTMLElement>('[data-theater-line]')!;
  const time = theater.querySelector<HTMLElement>('[data-theater-time]')!;
  const toggle = theater.querySelector<HTMLButtonElement>('[data-theater-toggle]')!;
  const surface = theater.querySelector<HTMLElement>('[data-scrub-surface]')!;

  const sync = () => {
    const d = video.duration || 1;
    fill.style.width = `${(video.currentTime / d) * 100}%`;
    line.setAttribute('aria-valuenow', String(Math.round((video.currentTime / d) * 100)));
    time.textContent = `${fmt(video.currentTime)} / ${fmt(video.duration || 0)}`;
  };
  video.addEventListener('timeupdate', sync);
  video.addEventListener('loadedmetadata', sync);
  video.addEventListener('play', () => (toggle.textContent = 'Pause'));
  video.addEventListener('pause', () => (toggle.textContent = 'Play'));
  video.addEventListener('ended', () => (toggle.textContent = 'Replay'));
  toggle.addEventListener('click', () => (video.paused ? video.play() : video.pause()));
  theater.querySelector('[data-theater-close]')!.addEventListener('click', closeFilm);

  const seekTo = (clientX: number) => {
    const r = line.getBoundingClientRect();
    video.currentTime = Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * (video.duration || 0);
  };
  line.addEventListener('pointerdown', (e) => {
    seekTo(e.clientX);
    line.setPointerCapture(e.pointerId);
    const mv = (ev: PointerEvent) => seekTo(ev.clientX);
    line.addEventListener('pointermove', mv);
    line.addEventListener('pointerup', () => line.removeEventListener('pointermove', mv), { once: true });
  });
  line.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') video.currentTime = Math.min(video.duration, video.currentTime + 5);
    if (e.key === 'ArrowLeft') video.currentTime = Math.max(0, video.currentTime - 5);
  });

  // scrub by dragging across the picture; a plain click toggles playback
  let sx = 0, st = 0, moved = false, down = false, wasPlaying = false;
  surface.addEventListener('pointerdown', (e) => {
    if (e.target !== video && e.target !== surface) return;
    down = true; moved = false; sx = e.clientX; st = video.currentTime; wasPlaying = !video.paused;
    surface.setPointerCapture(e.pointerId);
  });
  surface.addEventListener('pointermove', (e) => {
    if (!down) return;
    const dx = e.clientX - sx;
    if (Math.abs(dx) > 6) {
      if (!moved) { moved = true; video.pause(); }
      const span = Math.max(8, (video.duration || 30) * 0.6);
      video.currentTime = Math.min(video.duration || 0, Math.max(0, st + (dx / surface.clientWidth) * span));
    }
  });
  surface.addEventListener('pointerup', () => {
    if (!down) return;
    down = false;
    if (!moved) video.paused ? video.play() : video.pause();
    else if (wasPlaying) video.play();
  });

  addEventListener('keydown', (e) => {
    if (theater!.hidden) return;
    if (e.key === 'Escape') closeFilm();
    if (e.key === ' ' && document.activeElement?.tagName !== 'BUTTON') { e.preventDefault(); video.paused ? video.play() : video.pause(); }
  });
  document.addEventListener('click', (e) => {
    const t = (e.target as Element).closest<HTMLElement>('[data-film]');
    if (!t) return;
    e.preventDefault();
    openFilm(t.dataset.film!, t.dataset.filmTitle ?? 'Film', t);
  });
  document.addEventListener('astro:before-swap', closeFilm);
}
