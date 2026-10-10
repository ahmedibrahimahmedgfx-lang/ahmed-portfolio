/** Tracklist overlay: the persistent navigation. */
export function initNav() {
  const overlay = document.querySelector<HTMLElement>('.nav-overlay');
  if (!overlay) return;
  let lastFocus: HTMLElement | null = null;

  const open = () => {
    lastFocus = document.activeElement as HTMLElement;
    overlay.hidden = false;
    document.documentElement.classList.add('nav-open');
    document.documentElement.style.overflow = 'hidden';
    document.querySelectorAll('[data-nav-open]').forEach((b) => b.setAttribute('aria-expanded', 'true'));
    overlay.querySelector<HTMLElement>('[data-nav-link]')?.focus();
  };
  const close = (restore = true) => {
    if (overlay.hidden) return;
    overlay.hidden = true;
    document.documentElement.classList.remove('nav-open');
    document.documentElement.style.overflow = '';
    document.querySelectorAll('[data-nav-open]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
    if (restore) lastFocus?.focus();
  };

  document.addEventListener('click', (e) => {
    const t = e.target as Element;
    if (t.closest('[data-nav-open]')) { e.preventDefault(); overlay.hidden ? open() : close(); }
    else if (t.closest('[data-nav-close]')) close();
    else if (t.closest('[data-nav-link]')) close(false);
  });
  addEventListener('keydown', (e) => {
    if (overlay.hidden) return;
    if (e.key === 'Escape') close();
    if (e.key === 'Tab') {
      const f = [...overlay.querySelectorAll<HTMLElement>('a, button')].filter((x) => x.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  document.addEventListener('astro:before-swap', () => close(false));
}
