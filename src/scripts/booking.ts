/**
 * Booking page: builds a brief from the selected services and options, shows a starting
 * estimate, and hands the brief to the visitor's own email app or WhatsApp. No backend.
 */
export function mountBooking() {
  const form = document.querySelector<HTMLFormElement>('[data-booking]');
  if (!form || form.dataset.ready) return;
  form.dataset.ready = '1';

  const currency = form.dataset.currency ?? 'US$';
  const email = form.dataset.email ?? '';
  const whatsapp = form.dataset.whatsapp ?? '';
  const money = (n: number) => `${currency}${n.toLocaleString('en-US')}`;

  const services = [...form.querySelectorAll<HTMLInputElement>('input[name="service"]')];
  const lines = form.querySelector<HTMLElement>('[data-sheet-lines]');
  const total = form.querySelector<HTMLElement>('[data-sheet-total]');
  const empty = form.querySelector<HTMLElement>('[data-needs-empty]');
  const sendEmail = form.querySelector<HTMLAnchorElement>('[data-send="email"]');
  const sendWa = form.querySelector<HTMLAnchorElement>('[data-send="whatsapp"]');
  const copy = form.querySelector<HTMLButtonElement>('[data-copy]');
  const field = (name: string) => (form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | null)?.value.trim() ?? '';

  // /services?service=brand-identity arrives with that service already selected
  const wanted = new URLSearchParams(location.search).get('service');
  if (wanted) services.forEach((s) => { if (s.value === wanted) s.checked = true; });

  let brief = '';

  const update = () => {
    const picked = services.filter((s) => s.checked);
    let sum = 0;
    const text: string[] = ['Hi Ahmed, I would like to book a session.', ''];
    if (lines) lines.textContent = '';

    services.forEach((s) => {
      const block = form.querySelector<HTMLElement>(`[data-needs="${s.value}"]`);
      if (block) block.hidden = !s.checked;
    });
    if (empty) empty.hidden = picked.length > 0;

    picked.forEach((s) => {
      const from = Number(s.dataset.from) || 0;
      sum += from;
      const needs = [...form.querySelectorAll<HTMLInputElement>(`input[name="need-${s.value}"]:checked`)].map((n) => n.value);
      text.push(`${s.dataset.name} (from ${money(from)})`);
      needs.forEach((n) => text.push(`  - ${n}`));
      text.push('');
      if (lines) {
        const li = document.createElement('li');
        const name = document.createElement('span');
        name.className = 'meta';
        name.textContent = s.dataset.name ?? '';
        const amt = document.createElement('span');
        amt.className = 'mono';
        amt.textContent = money(from);
        const sub = document.createElement('span');
        sub.className = 'mono micro quiet sub';
        sub.textContent = `${needs.length} item${needs.length === 1 ? '' : 's'} selected`;
        li.append(name, amt, sub);
        lines.append(li);
      }
    });
    if (!picked.length && lines) {
      const li = document.createElement('li');
      li.className = 'meta quiet';
      li.textContent = 'No service selected yet.';
      lines.append(li);
    }

    const name = field('name');
    const brand = field('brand');
    const timeline = form.querySelector<HTMLInputElement>('input[name="timeline"]:checked')?.value ?? '';
    const notes = field('notes');
    if (name) text.push(`Name: ${name}`);
    if (brand) text.push(`Brand / company: ${brand}`);
    if (timeline) text.push(`Timeline: ${timeline}`);
    if (notes) text.push('', 'About the project:', notes);
    if (picked.length) text.push('', `Starting estimate: from ${money(sum)}`);

    brief = text.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    if (total) total.textContent = picked.length ? `From ${money(sum)}` : money(0);

    const ready = picked.length > 0;
    const subject = `Session request: ${picked.map((s) => s.dataset.name).join(' + ')}${brand ? ` / ${brand}` : ''}`;
    [sendEmail, sendWa, copy].forEach((el) => el?.setAttribute('aria-disabled', String(!ready)));
    if (sendEmail) {
      if (ready) sendEmail.href = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(brief)}`;
      else sendEmail.removeAttribute('href');
    }
    if (sendWa) {
      if (ready) sendWa.href = `${whatsapp}?text=${encodeURIComponent(brief)}`;
      else sendWa.removeAttribute('href');
    }
  };

  form.addEventListener('input', update);
  form.addEventListener('change', update);
  form.addEventListener('submit', (e) => e.preventDefault());
  copy?.addEventListener('click', async () => {
    if (copy.getAttribute('aria-disabled') === 'true') return;
    try {
      await navigator.clipboard.writeText(brief);
      copy.textContent = 'Copied';
    } catch {
      copy.textContent = 'Copy failed';
    }
    setTimeout(() => { copy.textContent = 'Copy brief'; }, 1800);
  });
  update();
}
