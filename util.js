const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const msg = e => String((e && e.message) || e);
const IC = {
  home: '<path d="M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/><path d="M3 17l9 5 9-5"/>',
  box: '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
  sliders: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  play: '<path d="M7 4l13 8-13 8z"/>', plus: '<path d="M12 5v14M5 12h14"/>', check: '<path d="M5 12l5 5 9-10"/>'
};
const ic = (n, s = 18) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n] || ''}</svg>`;
function toast(text, kind = 'ok', ms = 4800) {
  const t = document.createElement('div'); t.className = 'toast ' + kind; t.textContent = text; t.title = 'Clic para cerrar'; t.onclick = () => t.remove(); const box = $('#toasts'); box.appendChild(t); while (box.children.length > 3) box.firstChild.remove(); setTimeout(() => t.remove(), ms);
}
const when = ts => ts ? new Date(ts).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
const mb = n => (n / 1024) + ' GB';
function debounce(fn, ms = 320) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
