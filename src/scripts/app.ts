import { initCursor } from './cursor';
import { initPreview, activePreviewImage } from './preview';
import { initTape, mountTape } from './tape';
import { initTheater } from './theater';
import { initNav } from './nav';
import { mountPage, unmountPage } from './motion';

let booted = false;

/**
 * Shared-element transition: the image you were looking at (the pointer preview,
 * or the image inside the link) carries its view-transition-name to the next page,
 * where the case-study cover has the same name. The browser then morphs one into the other.
 */
function connectTransition(link: HTMLElement | null) {
  if (!link?.dataset.vt) return;
  const name = link.dataset.vt;
  document.querySelectorAll<HTMLElement>('[style*="view-transition-name"]').forEach((el) => {
    if (el.style.viewTransitionName === name) el.style.viewTransitionName = '';
  });
  const target = activePreviewImage() ?? link.querySelector<HTMLElement>('picture, img');
  if (target) target.style.viewTransitionName = name;
}

export function boot() {
  if (booted) return;
  booted = true;
  initCursor();
  initPreview();
  initTape();
  initTheater();
  initNav();

  document.addEventListener('astro:before-preparation', (e: any) => {
    const src = e.sourceElement as HTMLElement | undefined;
    connectTransition(src?.closest?.('[data-vt]') ?? null);
  });
  document.addEventListener('astro:before-swap', () => unmountPage());
  document.addEventListener('astro:page-load', () => {
    const home = document.body.classList.contains('home');
    mountTape(!home);
    mountPage();
  });
}
