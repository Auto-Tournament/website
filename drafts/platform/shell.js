// Draft-only helpers: the ram logo, the theme switcher and the page switcher.
// The ram uses currentColor-free fills bound to CSS variables so it follows the theme.
const RAM = `<svg viewBox="12 -13 426 426" aria-hidden="true"><defs><clipPath id="ram"><rect x="12" y="-13" width="426" height="426" rx="96"/></clipPath></defs><g clip-path="url(#ram)"><rect x="12" y="-13" width="426" height="426" style="fill:var(--color-accent)"/></g></svg>`;

async function mountLogo() {
  try {
    const res = await fetch('../at-icon.svg');
    const text = await res.text();
    const recoloured = text
      .replace(/#ff6a3d/gi, 'var(--color-accent)')
      .replace(/#ff8f66/gi, 'var(--color-accent-2)')
      .replace(/#1d1d1f/gi, 'var(--color-paper)')
      .replace(/fill="(var\([^)]+\))"/g, 'style="fill:$1"')
      .replace(/<title>[^<]*<\/title>/, '');
    document.querySelectorAll('[data-logo]').forEach((el) => (el.innerHTML = recoloured));
  } catch {
    document.querySelectorAll('[data-logo]').forEach((el) => (el.innerHTML = RAM));
  }
}

const THEMES = [
  ['ember', '#ff6a3d', 'Ember'],
  ['ultraviolet', '#9d7bff', 'Ultraviolet'],
  ['mint', '#2dce89', 'Mint'],
  ['aurora', '#5eeab5', 'Aurora'],
  ['coral', '#ff5f7e', 'Coral'],
];

function mountThemes() {
  const saved = (() => { try { return localStorage.getItem('draft-theme'); } catch { return null; } })() || 'ember';
  document.documentElement.dataset.theme = saved;
  const bar = document.createElement('div');
  bar.className = 'themes';
  bar.setAttribute('role', 'group');
  bar.setAttribute('aria-label', 'Theme');
  for (const [id, hex, name] of THEMES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.title = name;
    b.setAttribute('aria-label', name);
    b.style.background = hex;
    b.setAttribute('aria-pressed', String(id === saved));
    b.onclick = () => {
      document.documentElement.dataset.theme = id;
      try { localStorage.setItem('draft-theme', id); } catch {}
      bar.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    };
    bar.appendChild(b);
  }
  document.body.appendChild(bar);

  const pages = [['index.html', 'Home'], ['browse.html', 'Browse'], ['tournament.html', 'Tournament'], ['manage.html', 'Manage'], ['team.html', 'Team'], ['profile.html', 'Profile'], ['connections.html', 'Settings']];
  const nav = document.createElement('nav');
  nav.className = 'draft-nav';
  nav.setAttribute('aria-label', 'Draft pages');
  const here = location.pathname.split('/').pop() || 'index.html';
  for (const [href, label] of pages) {
    const a = document.createElement('a');
    a.href = href;
    a.textContent = label;
    if (href === here) a.setAttribute('aria-current', 'page');
    nav.appendChild(a);
  }
  document.body.appendChild(nav);
}

mountLogo();
mountThemes();

// Filter chips: single-select toggles.
document.querySelectorAll('.filters').forEach((group) => {
  group.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    group.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  });
});
