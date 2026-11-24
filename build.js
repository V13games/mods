'use strict';
/*
  Builds the Project Neutral mods site into the _site folder. No packages needed, just Node.

    node build.js                      build it (GitHub does this by itself every time something changes)
    node build.js --serve              build it and open it on http://localhost:8080
    node build.js --serve --examples   the same, with the example files (_*.md) shown too

  Everything on the site comes from the content folder:
    content/settings.yml   the Discord invite, the site's name and a few other settings
    content/mods/*.md      one file per mod or plugin, and the "Other" links
    content/posts/*.md     one file per post
    content/images/        pictures; use them as   cover: images/my-picture.jpg
  Files whose name starts with _ are examples and templates, left off the real site.

  The pages it makes: the front page, one tab per game (FiveM, Minecraft...), Games (read live from the
  games site), Other, Posts, a page per mod and per post, and search-index.js for the search box.
*/
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = __dirname;
const CONTENT = path.join(ROOT, 'content');
const OUT = path.join(ROOT, '_site');
const SERVE = process.argv.includes('--serve');
const EXAMPLES = process.argv.includes('--examples');
const PORT = Number(process.env.PORT) || 8080;
const YEAR = new Date().getFullYear();

// Each game's colour (the little lit squares), unless settings.yml sets  fivem_color: #rrggbb  and so on.
const GAME_COLORS = { fivem: '#ff7a3d', minecraft: '#62c46a', other: '#bfffa8', games: '#5ab8ff', posts: '#bfffa8' };
const GAME_TEXT = {
  fivem: 'Scripts and resources for FiveM servers.',
  minecraft: 'Plugins and mods for Minecraft servers and worlds.',
  other: 'Everything else Project Neutral makes.',
};

/* ---------- the logo ---------- */

// A ring with a small square in its gap, around a rounded N. Flat, one colour, nothing moves.
function mark({ size = 64, cls = 'mark', color = 'currentColor', badge = false, ring = 3, n = 5, light = 6 } = {}) {
  const l = (light - 6) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" class="${cls}" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true">`
    + (badge ? '<rect width="64" height="64" rx="16" fill="#111816"/>' : '')
    + `<circle cx="32" cy="32" r="22" fill="none" stroke="${color}" stroke-width="${ring}" stroke-linecap="round" stroke-dasharray="118.2 20" transform="rotate(-19 32 32)"/>`
    + `<rect x="${44.56 - l}" y="${13.44 - l}" width="${light}" height="${light}" rx="${light / 4}" fill="${color}"/>`
    + `<path d="M23 43V21l18 22V21" fill="none" stroke="${color}" stroke-width="${n}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
const ICON = 'data:image/svg+xml,' + encodeURIComponent(mark({ cls: '', color: '#bfffa8', badge: true, ring: 4.5, n: 6.5, light: 7.5 }));
const svg = (size, d) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="2.4"/></svg>`;
const DL = 'M12 3v12M6.5 9.5 12 15l5.5-5.5M4 20.5h16';
const OUTLINK = 'M7 17 17 7M8.5 7H17v8.5';
const SEARCH = 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13ZM15.5 15.5 21 21';
const PLAY = '<svg width="10" height="10" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3v18l16-9z" fill="currentColor"/></svg>';

/* ---------- reading the content files ---------- */

const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slugify = s => String(s).toLowerCase().replace(/æ/g, 'ae').replace(/ø/g, 'o').normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'item';
const list = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDate = d => { const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(d || ''); return m ? `${+m[3]} ${MONTHS[+m[2] - 1]} ${m[1]}` : ''; };

// "key: value" lines. Lines starting with # are notes and are skipped.
function fields(text) {
  const out = {};
  for (const line of String(text).split('\n')) {
    if (/^\s*(#|$)/.test(line)) continue;
    const i = line.indexOf(':');
    if (i < 1) continue;
    out[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim().replace(/^(["'])(.*)\1$/, '$2');
  }
  return out;
}
function readFile(file) {
  const raw = fs.readFileSync(file, 'utf8').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const m = /^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)([\s\S]*)$/.exec(raw);
  return m ? { meta: fields(m[1]), body: m[2].trim() } : { meta: {}, body: raw.trim() };
}
function readDir(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => /\.md$/i.test(f) && (EXAMPLES || !f.startsWith('_'))).sort()
    .map(f => Object.assign({ file: f, example: f.startsWith('_') }, readFile(path.join(dir, f))));
}

const S = fields(fs.readFileSync(path.join(CONTENT, 'settings.yml'), 'utf8').replace(/\r\n?/g, '\n'));
S.name = S.name || 'Project Neutral';
S.url = (S.url || 'https://v13games.github.io/mods/').replace(/\/?$/, '/');
S.games_site = S.games_site ? S.games_site.replace(/\/?$/, '/') : '';
S.inviteUrl = '';
S.inviteCode = '';
if (S.discord) {
  S.inviteUrl = /^https?:\/\//i.test(S.discord) ? S.discord : 'https://discord.gg/' + S.discord.replace(/^.*\//, '');
  S.inviteCode = S.inviteUrl.replace(/[?#].*$/, '').replace(/\/+$/, '').split('/').pop();
}

// A link from a content file: web addresses stay as they are, site files get the right ../ in front.
function href(u, root) {
  u = String(u || '').trim();
  if (!u) return '';
  if (/^(https?:|mailto:|#)/i.test(u)) return u;
  if (/^[a-z][a-z0-9+.-]*:/i.test(u) || u.startsWith('//')) return ''; // nothing like javascript:
  return root + u.replace(/^(\.\/|\/)+/, '');
}
const absolute = u => (/^https?:/i.test(u) ? u : S.url + String(u).replace(/^(\.\/|\/)+/, ''));
const DEFAULT_IMAGE = fs.existsSync(path.join(CONTENT, 'images/brand/banner.png')) ? 'images/brand/banner.png' : '';

/* ---------- the mods, and the games they are for ---------- */

const rawMods = readDir(path.join(CONTENT, 'mods'));
const categories = list(S.categories || 'FiveM, Minecraft, Other');
for (const { meta } of rawMods) { // a mod for a game that isn't listed yet adds it, before Other
  const g = meta.game || 'Other';
  if (categories.some(c => c.toLowerCase() === g.toLowerCase())) continue;
  if (categories.includes('Other')) categories.splice(categories.indexOf('Other'), 0, g); else categories.push(g);
}
const catSlug = c => slugify(c);
const RESERVED = new Set(['posts', 'images', 'games', 'site.css', 'site.js', 'search-index.js', 'index.html', '404.html', ...categories.map(catSlug)]);
const used = new Set();
const mods = rawMods.map(({ file, example, meta, body }) => {
  const base = file.replace(/\.md$/i, '').replace(/^_+/, '');
  let slug = slugify(meta.slug || base);
  if (RESERVED.has(slug)) slug += '-mod';
  while (used.has(slug)) slug += '-2';
  used.add(slug);
  const game = categories.find(c => c.toLowerCase() === (meta.game || 'Other').toLowerCase());
  return {
    slug, example, body, game,
    title: meta.title || base,
    type: meta.type || '',
    version: meta.version || '',
    released: meta.released || meta.date || '',
    updated: meta.updated || '',
    summary: meta.summary || '',
    download: meta.download || '',
    link: meta.link || '',
    cover: list(meta.cover),
    alt: meta.cover_text || '',
    color: meta.color || catColor(game),
    tags: list(meta.tags),
    requires: meta.requires || meta['works with'] || '',
    price: meta.price || '',
    hasPage: !!body.trim(),
  };
});
function catColor(c) { const s = catSlug(c); return S[`${s}_color`] || GAME_COLORS[s] || '#bfffa8'; }

// Newest first, the "Other" links last. Releases are numbered from the oldest: M01, M02...
const isOther = m => m.game === 'Other';
mods.sort((a, b) => (isOther(a) - isOther(b)) || (b.released || '').localeCompare(a.released || '') || a.title.localeCompare(b.title));
const releases = mods.filter(m => !isOther(m));
releases.forEach((m, i) => { m.no = 'M' + String(releases.length - i).padStart(2, '0'); });
mods.filter(isOther).forEach(m => { m.no = ''; });
const newest = releases[0];

const cats = categories.map(c => ({
  name: c, slug: catSlug(c), color: catColor(c), other: c === 'Other',
  text: S[`${catSlug(c)}_text`] || GAME_TEXT[catSlug(c)] || `Everything Project Neutral makes for ${c}.`,
  mods: mods.filter(m => m.game === c),
})).filter(c => !c.other || c.mods.length);
const gameCats = cats.filter(c => !c.other);
const otherCat = cats.find(c => c.other);

/* ---------- the posts ---------- */

const postSlugs = new Set();
const posts = readDir(path.join(CONTENT, 'posts')).map(({ file, example, meta, body }) => {
  const base = file.replace(/\.md$/i, '').replace(/^_+/, '');
  const dm = /^(\d{4}-\d{1,2}-\d{1,2})-?(.*)$/.exec(base);
  let slug = slugify(meta.slug || (dm && dm[2] ? dm[2] : base));
  while (postSlugs.has(slug) || slug === 'index') slug += '-2';
  postSlugs.add(slug);
  return {
    slug, example, body,
    title: meta.title || slug,
    date: meta.date || (dm ? dm[1] : ''),
    tag: meta.tag || 'News',
    image: meta.image || meta.cover || '',
    summary: meta.summary || excerpt(body),
  };
}).sort((a, b) => (b.date || '').localeCompare(a.date || ''));

function plain(text) {
  return String(text || '').replace(/```[\s\S]*?```/g, ' ').replace(/^#{1,6}\s+.*$/gm, ' ').replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/^\s*(\d+[.)]|[-*+>])\s+/gm, '').replace(/[*`~]|__/g, '').replace(/\s+/g, ' ').trim();
}
function excerpt(body, n = 170) {
  const first = String(body || '').split(/\n\s*\n/).map(plain).find(Boolean) || '';
  return first.length <= n ? first : first.slice(0, n).replace(/\s+\S*$/, '') + '…';
}

/* ---------- writing: a small Markdown, the kind Discord uses ---------- */

function inline(s, root) {
  const stash = [];
  const keep = h => '\u0000' + (stash.push(h) - 1) + '\u0000';
  let t = String(s);
  t = t.replace(/`([^`]+)`/g, (_, c) => keep(`<code>${esc(c)}</code>`));
  t = t.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, src) => { const u = href(src, root); return u ? keep(`<img src="${esc(u)}" alt="${esc(alt)}" loading="lazy">`) : ''; });
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, txt, u) => { const h = href(u, root); return h ? keep(`<a href="${esc(h)}">`) + txt + keep('</a>') : txt; });
  t = t.replace(/https?:\/\/[^\s<>()\u0000]*[^\s<>().,!?:;'"\u0000]/g, u => keep(`<a href="${esc(u)}">${esc(u)}</a>`));
  t = esc(t)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<u>$1</u>')
    .replace(/~~(.+?)~~/g, '<s>$1</s>')
    .replace(/(^|[\s(>])\*(?!\s)(.+?)\*(?=$|[\s).,!?:;<])/g, '$1<em>$2</em>');
  return t.replace(/\u0000(\d+)\u0000/g, (_, n) => stash[n]);
}

function youtube(line) {
  const m = /^\s*https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,})\S*\s*$/.exec(line);
  return m && m[1];
}

// opts.sections: wrap each "## Heading" and what follows in its own <section> (for mod pages)
function markdown(src, root, opts = {}) {
  const lines = String(src || '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  const ids = new Set();
  let open = false, i = 0;
  const uid = s => { let id = s || 'part'; while (ids.has(id)) id += '-2'; ids.add(id); return id; };
  const startSection = (title, id) => {
    if (open) out.push('</section>');
    id = uid(id || slugify(title));
    out.push(`<section id="${id}" aria-labelledby="${id}-title"><h2 id="${id}-title">${inline(title, root)}</h2>`);
    open = true;
  };
  const push = html => { if (opts.sections && !open) startSection(opts.firstHeading || 'About', 'about'); out.push(html); };
  const fence = /^\s*```/;
  const blockStart = l => fence.test(l) || /^(#{1,4}\s|\d+[.)]\s|[-*+]\s|>)/.test(l) || youtube(l) || /^!\[[^\]]*\]\([^)]*\)\s*$/.test(l);
  const code = () => { // at a ``` line: returns the code block and moves past it
    const buf = []; i++;
    while (i < lines.length && !fence.test(lines[i])) buf.push(lines[i++]);
    i++;
    const pad = Math.min(...buf.filter(l => l.trim()).map(l => l.match(/^\s*/)[0].length), 99);
    return `<pre><code>${esc(buf.map(l => l.slice(pad === 99 ? 0 : pad)).join('\n'))}</code></pre>`;
  };
  const items = re => { // list items, each with any lines indented under it and a code block right after it
    const got = [];
    while (i < lines.length && re.test(lines[i])) {
      let text = lines[i].replace(re, ''), extra = '';
      i++;
      while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !fence.test(lines[i])) text += '\n' + lines[i++].trim();
      let j = i; while (j < lines.length && !lines[j].trim()) j++;
      if (j < lines.length && fence.test(lines[j])) { i = j; extra = code(); j = i; while (j < lines.length && !lines[j].trim()) j++; }
      got.push(inline(text, root).replace(/\n/g, '<br>') + extra);
      if (j < lines.length && re.test(lines[j])) i = j;
    }
    return got;
  };

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (fence.test(line)) { push(code()); continue; }
    const h = /^(#{1,4})\s+(.*?)\s*#*\s*$/.exec(line);
    if (h) {
      i++;
      if (opts.sections && h[1].length <= 2) startSection(h[2], /install/i.test(h[2]) ? 'install' : '');
      else push(`<h3>${inline(h[2], root)}</h3>`);
      continue;
    }
    if (/^\d+[.)]\s/.test(line)) { push(`<ol class="steps">${items(/^\d+[.)]\s+/).map(t => `<li><div>${t}</div></li>`).join('')}</ol>`); continue; }
    if (/^[-*+]\s/.test(line)) { push(`<ul class="list">${items(/^[-*+]\s+/).map(t => `<li>${t}</li>`).join('')}</ul>`); continue; }
    if (/^>/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
      push(`<blockquote><p>${inline(buf.join('\n'), root).replace(/\n/g, '<br>')}</p></blockquote>`);
      continue;
    }
    const yt = youtube(line);
    if (yt) { i++; push(`<div class="video"><iframe src="https://www.youtube-nocookie.com/embed/${esc(yt)}" title="Video" loading="lazy" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen></iframe></div>`); continue; }
    const img = /^!\[([^\]]*)\]\(([^)\s]+)\)\s*$/.exec(line);
    if (img) { i++; const u = href(img[2], root); if (u) push(`<figure class="shot"><img src="${esc(u)}" alt="${esc(img[1])}" loading="lazy"></figure>`); continue; }
    const buf = [];
    while (i < lines.length && lines[i].trim() && !(buf.length && blockStart(lines[i]))) buf.push(lines[i++]);
    push(`<p>${inline(buf.join('\n'), root).replace(/\n/g, '<br>')}</p>`);
  }
  if (open) out.push('</section>');
  return out.join('\n');
}

/* ---------- the pieces every page shares ---------- */

// The tabs along the top: Home, one per game, Games, Other, Posts, Discord.
function tabs() {
  return [
    { id: 'home', label: 'Home', to: '' },
    ...gameCats.map(c => ({ id: c.slug, label: c.name, to: c.slug + '/', color: c.color, count: c.mods.length })),
    S.games_site && { id: 'games', label: 'Games', to: 'games/', color: GAME_COLORS.games, games: true },
    otherCat && { id: 'other', label: 'Other', to: 'other/', count: otherCat.mods.length },
    { id: 'posts', label: 'Posts', to: 'posts/', count: posts.length },
    S.inviteUrl && { id: 'discord', label: 'Discord', url: S.inviteUrl },
  ].filter(Boolean);
}
const tabHref = (t, root) => t.url || (root + t.to) || './';

function page({ root, title, description, at, image, body, tab, style = '' }) {
  const full = title ? `${title} · ${S.name}` : S.name;
  const desc = description || S.description || '';
  const img = absolute(image || DEFAULT_IMAGE || '');
  const attrs = [`data-root="${esc(root || './')}"`, S.inviteCode && `data-invite="${esc(S.inviteCode)}"`, S.games_site && `data-games="${esc(S.games_site)}"`, style && `style="${esc(style)}"`].filter(Boolean).join(' ');
  return `<!doctype html>
<html lang="en" ${attrs}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(full)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="theme-color" content="#111816">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(S.name)}">
<meta property="og:title" content="${esc(full)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(S.url + at)}">
${(image || DEFAULT_IMAGE) ? `<meta property="og:image" content="${esc(img)}">\n<meta name="twitter:card" content="summary_large_image">\n` : ''}<link rel="icon" href="${ICON}">
<link rel="apple-touch-icon" href="${root}images/brand/icon-512.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist+Mono:wght@200;400;500;700&family=Inter+Tight:wght@400;500;700&display=swap">
<link rel="stylesheet" href="${root}site.css">
</head>
<body>
  <!-- This page is made by build.js from the files in the content folder. Change those, not this. -->
${header(root, tab)}
${body}
${footer(root)}
  <script src="${root}search-index.js" defer></script>
  <script src="${root}site.js" defer></script>
</body>
</html>
`;
}

function header(root, active) {
  return `  <header class="wrap nav">
    <a class="brand" href="${root || './'}">${mark({ size: 28 })}<span>${esc(S.name)}</span></a>
    <div class="nav-links">
      <button type="button" class="search-btn" data-search aria-label="Search (press /)">${svg(14, SEARCH)}<span class="wide-only">Search</span></button>
      ${S.inviteUrl ? `<a href="${esc(S.inviteUrl)}">Discord</a>` : ''}
    </div>
  </header>
  <nav class="tabs-bar" aria-label="Sections">
    <div class="wrap tabs">
${tabs().map(t => `      <a class="tab${t.url ? ' ext' : ''}" href="${esc(tabHref(t, root))}"${t.id === active ? ' aria-current="page"' : ''}>${esc(t.label)}${t.count != null ? ` <span>${t.count}</span>` : ''}${t.games ? ' <span data-games-count hidden></span>' : ''}</a>`).join('\n')}
    </div>
  </nav>`;
}

function footer(root) {
  return `  <footer class="foot">
    <div class="wrap foot-top">
      <p class="foot-brand">${mark({ size: 22 })}${esc(S.name)}</p>
      <nav class="foot-links" aria-label="More">
${tabs().map(t => `        <a href="${esc(tabHref(t, root))}">${esc(t.label)}</a>`).join('\n')}
        ${S.games_site ? `<a href="${esc(S.games_site)}">Games site ↗</a>` : ''}
        <a href="#">Top ↑</a>
      </nav>
      <p>© ${YEAR}</p>
    </div>
  </footer>`;
}

// The biggest size (in % of the frame's width) at which a name fits the made-up cover on up to a few lines.
function fitSize(text) {
  const words = String(text).toUpperCase().split(/\s+/).filter(Boolean);
  for (let fs = 24; fs > 5; fs -= 0.5) {
    const cw = fs * 0.74, room = 82;
    let lines = 1, cur = 0, ok = true;
    for (const w of words) {
      const ww = w.length * cw;
      if (ww > room) { ok = false; break; }
      const need = cur ? cur + cw * 0.4 + ww : ww;
      if (need > room) { lines++; cur = ww; } else cur = need;
    }
    if (ok && lines * fs * 0.95 <= 42) return fs;
  }
  return 5;
}
function genCover(text, left, right) {
  return `<div class="frame gen" aria-hidden="true"><i>${esc(left)}</i>${right ? `<i>${esc(right)}</i>` : ''}<b style="font-size:${fitSize(text)}cqi">${esc(text)}</b></div>`;
}
function frame(m, root) {
  if (m.cover.length > 1) return `<div class="frame collage">${m.cover.slice(0, 4).map(c => `<img src="${esc(href(c, root))}" alt="" loading="lazy">`).join('')}</div>`;
  if (m.cover.length) return `<div class="frame"><img src="${esc(href(m.cover[0], root))}" width="1600" height="900" alt="${esc(m.alt || m.title)}" loading="lazy"></div>`;
  return genCover(m.title, m.game, m.no || m.type);
}

// What the main button on a mod does: download it, visit its link, or go to the Discord.
function action(m, root) {
  if (m.download) return { href: href(m.download, root), short: 'Download', long: 'Download', icon: DL };
  if (m.link) return { href: href(m.link, root), short: 'Visit', long: `Visit ${m.title}`, icon: OUTLINK };
  if (S.inviteUrl) return { href: S.inviteUrl, short: 'Discord', long: 'Get it on Discord', icon: OUTLINK };
  return null;
}

function card(m, root) {
  const a = action(m, root);
  const to = m.hasPage ? `${root}${m.slug}/` : (a ? a.href : '#');
  const label = [m.no, m.game, m.type].filter(Boolean).join(' / ');
  return `        <article class="card" data-genre="${esc(m.game)}" data-tags="${esc(m.tags.join('|'))}" style="--game:${esc(m.color)}">
          ${frame(m, root)}
          <div class="meta">
            <span class="no">${esc(label)}</span>
            <h3><a class="card-link" href="${esc(to)}">${esc(m.title)}</a></h3>
            ${a ? `<a class="play" href="${esc(a.href)}" aria-label="${esc(a.short + ': ' + m.title)}">${svg(10, a.icon)}${esc(a.short)}</a>` : ''}
            ${m.summary ? `<p class="sum">${esc(m.summary)}</p>` : ''}
          </div>
        </article>`;
}

// An empty slot for a game with nothing on the site yet, so it is clear more is coming.
function soonCard(c, root) {
  return `        <article class="card soon" data-genre="${esc(c.name)}" data-tags="" style="--game:${esc(c.color)}">
          ${genCover(c.name, c.name, 'Soon')}
          <div class="meta">
            <span class="no">Soon / ${esc(c.name)}</span>
            <h3><a class="card-link" href="${root}${c.slug}/">${esc(c.name)}</a></h3>
            <p class="sum">Coming soon.</p>
          </div>
        </article>`;
}

function soonBox(c, root) {
  return `      <div class="soon-box">
        <p class="big-lede">Nothing here yet.</p>
        <p class="note">The first ${esc(c.name)} release is coming soon.${S.inviteUrl ? ' It gets announced on the Discord first.' : ''}</p>
        <div class="play-row">
          ${S.inviteUrl ? `<a class="btn" href="${esc(S.inviteUrl)}">Discord</a>` : ''}
          ${S.games_site ? `<a class="btn ghost" href="${root}games/">Games</a>` : ''}
        </div>
      </div>`;
}

function skeletons(n) {
  return Array.from({ length: n }, () => `        <div class="card skel" aria-hidden="true"><div class="frame"></div><div class="meta"><span class="no">Loading</span><h3>&nbsp;</h3></div></div>`).join('\n');
}

function feed(items, root) {
  if (!items.length) return `      <p class="feed-empty">No posts yet.</p>`;
  return `      <ol class="feed">
${items.map(p => `        <li><a class="feed-row" href="${root}posts/${p.slug}/"><span class="feed-date">${esc(fmtDate(p.date))}</span><span class="feed-text"><b>${esc(p.title)}</b>${p.summary ? `<span>${esc(p.summary)}</span>` : ''}</span><span class="feed-tag">${esc(p.tag)}</span></a></li>`).join('\n')}
      </ol>`;
}

function joinBox() {
  if (!S.inviteUrl) return '';
  return `    <section class="wrap section" id="discord" aria-labelledby="discord-title">
      <div class="join-box">
        <div>
          <h2 class="label" id="discord-title">Discord</h2>
          <p>${esc(S.join_text || 'Releases, updates and help are posted on the Discord first.')}</p>
          <p class="stats" data-online hidden><span><b data-n="online">0</b> online</span><span><b data-n="members">0</b> members</span></p>
        </div>
        <a class="btn big" href="${esc(S.inviteUrl)}">Join the Discord</a>
      </div>
    </section>`;
}

function pageHero({ name, color, label, text, buttons = '' }) {
  return `    <section class="wrap page-head" style="--game:${esc(color)}">
      <p class="label"><i class="sq" aria-hidden="true"></i>${esc(name)} <span class="dim">/ ${esc(label)}</span></p>
      <h1 class="giant"><span data-fit style="--len:${Math.max(name.length, 4)}">${esc(name)}</span></h1>
      <p class="page-sub">${esc(text)}</p>
      ${buttons ? `<div class="play-row">${buttons}</div>` : ''}
    </section>`;
}

/* ---------- the pages ---------- */

function home() {
  const root = '';
  const missing = gameCats.filter(c => !c.mods.length);
  const body = `  <main>
    <section class="wrap intro" aria-label="${esc(S.name)}">
      <p class="label">Project</p>
      <h1 class="giant"><span class="sr-only">${esc(S.name)}</span><span data-fit aria-hidden="true" style="--len:7">Neutral</span></h1>
      <div class="intro-row">
        <p>${esc(S.tagline || 'Mods and plugins for FiveM and Minecraft, and free games you play in your browser.')}</p>
        <div class="play-row">
          <a class="btn" href="#releases">Releases</a>
          ${S.games_site ? `<a class="btn ghost" href="games/">Games</a>` : ''}
          ${S.inviteUrl ? `<a class="btn ghost" href="${esc(S.inviteUrl)}">Discord</a>` : ''}
        </div>
      </div>
    </section>

    <section class="wrap section" id="releases" aria-labelledby="releases-title">
      <div class="title-row">
        <h2 id="releases-title"><span>//</span>Releases</h2>
        <div class="chips" role="group" aria-label="Filter">
          <button type="button" class="chip tag-chip" id="tag-chip" hidden>#<b></b> <i aria-hidden="true">×</i></button>
        </div>
      </div>
      <div class="grid" data-filter-grid>
${[...releases.map(m => card(m, root)), ...missing.map(c => soonCard(c, root))].join('\n')}
      </div>
      <div class="empty" id="empty" hidden>
        <p class="label">Nothing has that tag yet.</p>
        <button type="button" class="btn ghost" id="show-all">Show everything</button>
      </div>
    </section>

${S.games_site ? `    <section class="wrap section" aria-labelledby="games-title">
      <div class="title-row">
        <h2 id="games-title"><span>//</span>Games</h2>
        <a class="see-all label" href="games/">All games &rarr;</a>
      </div>
      <div class="strip" data-games-list="8">
${skeletons(4)}
      </div>
      <p class="games-fail" hidden>The games couldn't load right now. <a href="${esc(S.games_site)}">Open the games site</a></p>
    </section>
` : ''}
    <section class="wrap section" id="posts" aria-labelledby="posts-title">
      <div class="title-row">
        <h2 id="posts-title"><span>//</span>Posts</h2>
        <a class="see-all label" href="posts/">All posts &rarr;</a>
      </div>
${feed(posts.slice(0, 4), root)}
    </section>

${joinBox()}
  </main>
`;
  return page({ root, at: '', tab: 'home', body, description: S.description });
}

function categoryPage(c) {
  const root = '../';
  const n = c.mods.length;
  const label = c.other ? plural(n, 'link', 'links') : n ? plural(n, 'release', 'releases') : 'coming soon';
  const body = `  <main>
${pageHero({ name: c.name, color: c.color, label, text: c.text })}
    <section class="wrap section" aria-label="${esc(c.name)}">
${n ? `      <div class="grid">\n${c.mods.map(m => card(m, root)).join('\n')}\n      </div>` : soonBox(c, root)}
    </section>
${joinBox()}
  </main>
`;
  return page({ root, at: c.slug + '/', tab: c.other ? 'other' : c.slug, title: c.name, description: `${c.text} ${n ? label : 'Coming soon'} from ${S.name}.`, body });
}

function gamesPage() {
  const root = '../';
  const body = `  <main>
${pageHero({ name: 'Games', color: GAME_COLORS.games, label: 'free in your browser', text: S.games_text || 'Free games you play in your browser. Nothing to install. Tap one to play.', buttons: `<a class="btn" href="${esc(S.games_site)}">${svg(14, OUTLINK)}Open the games site</a>` })}
    <section class="wrap section" aria-label="All games">
      <div class="grid" data-games-list="all">
${skeletons(6)}
      </div>
      <p class="games-fail" hidden>The games couldn't load right now. <a href="${esc(S.games_site)}">Open the games site</a></p>
    </section>
  </main>
`;
  return page({ root, at: 'games/', tab: 'games', title: 'Games', description: 'Free games from Project Neutral, played right in your browser.', body });
}

function modPage(m) {
  const root = '../';
  const a = action(m, root);
  const hasInstall = /^#{1,2}\s+.*install/im.test(m.body);
  const withPages = mods.filter(x => x.hasPage);
  const at = withPages.indexOf(m);
  const prev = withPages[at + 1], next = withPages[at - 1];
  const more = mods.filter(x => x !== m && !isOther(x)).sort((x, y) => (y.game === m.game) - (x.game === m.game)).slice(0, 3);
  const c = cats.find(x => x.name === m.game);
  const catHref = `../${c.other ? 'other' : c.slug}/`;
  const spec = [
    ['Game', `<a href="${catHref}">${esc(m.game)}</a>`],
    m.type && ['Type', esc(m.type)],
    m.version && ['Version', esc(m.version)],
    m.released && ['Released', esc(fmtDate(m.released) || m.released)],
    m.updated && ['Updated', esc(fmtDate(m.updated) || m.updated)],
    m.requires && ['Works with', esc(m.requires)],
    m.price && ['Price', esc(m.price)],
  ].filter(Boolean);
  const facts = [m.version && `Version ${m.version}`, m.updated && `updated ${fmtDate(m.updated) || m.updated}`].filter(Boolean).join(', ');
  const body = `  <main>
    <div class="wrap">
      <section class="ghero${m.cover.length ? '' : ' plain'}">
        ${m.cover.length ? `<img class="ghero-img" src="${esc(href(m.cover[0], root))}" width="1600" height="900" alt="${esc(m.alt || m.title)}" fetchpriority="high">` : ''}
        <nav class="wrap crumbs label" aria-label="You are here">
          <ol><li><a href="../">Home</a></li><li><a href="${catHref}">${esc(m.game)}</a></li><li aria-current="page">${esc(m.title)}</li></ol>
        </nav>
        <div class="wrap ghero-in">
          <div class="play-row">
            ${a ? `<a class="btn big" href="${esc(a.href)}">${svg(14, a.icon)}${esc(a.long)}</a>` : ''}
            ${hasInstall ? `<a class="btn ghost big" href="#install">How to install</a>` : ''}
          </div>
        </div>
        <h1 class="giant"><span data-fit style="--len:${Math.max(m.title.length, 4)}">${esc(m.title)}</span></h1>
      </section>
    </div>

    <section class="wrap gintro" aria-label="About ${esc(m.title)}">
      <div class="spec">
        <p class="spec-head">${esc([m.no, m.title].filter(Boolean).join(' / '))}</p>
        <dl>
          ${spec.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}
        </dl>
      </div>
      <div>
        ${m === newest ? '<span class="new">Newest release</span>' : ''}
        ${m.summary ? `<p class="big-lede">${esc(m.summary)}</p>` : ''}
        ${m.tags.length ? `<ul class="tags" aria-label="Tags">${m.tags.map(t => `<li><a href="../?tag=${encodeURIComponent(t)}#releases">${esc(t)}</a></li>`).join('')}</ul>` : ''}
      </div>
    </section>

    <div class="wrap details">
      <div class="col-main prose">
${markdown(m.body, root, { sections: true, firstHeading: `About ${m.title}` })}
      </div>
      <aside class="col-side">
        ${a ? `<section class="panel" aria-labelledby="get-title">
          <h2 id="get-title">Get it</h2>
          ${facts ? `<p>${esc(facts)}.</p>` : ''}
          <a class="btn wide" href="${esc(a.href)}">${svg(14, a.icon)}${esc(a.long)}</a>
        </section>` : ''}
        ${S.inviteUrl ? `<section class="panel" aria-labelledby="help-title">
          <h2 id="help-title">Need help?</h2>
          <p>Questions, bugs and ideas for ${esc(m.title)} go in the Discord.</p>
          <a class="btn ghost wide" href="${esc(S.inviteUrl)}">Join the Discord</a>
        </section>` : ''}
      </aside>
    </div>

    <section class="wrap" aria-labelledby="more-title">
      ${prev || next ? `<nav class="pager" aria-label="Previous and next">
        ${prev ? `<a class="pg" href="../${prev.slug}/" rel="prev"><span class="label">&lsaquo; Previous${prev.no ? ' / ' + esc(prev.no) : ''}</span><b>${esc(prev.title)}</b></a>` : ''}
        ${next ? `<a class="pg next" href="../${next.slug}/" rel="next"><span class="label">${next.no ? esc(next.no) + ' / ' : ''}Next &rsaquo;</span><b>${esc(next.title)}</b></a>` : ''}
      </nav>` : ''}
      ${more.length ? `<div class="title-row">
        <h2 id="more-title"><span>//</span>More releases</h2>
        <a class="see-all label" href="../#releases">See all &rarr;</a>
      </div>
      <div class="grid">
${more.map(x => card(x, root)).join('\n')}
      </div>` : `<h2 class="sr-only" id="more-title">More</h2>`}
    </section>
  </main>
`;
  return page({ root, at: m.slug + '/', tab: c.other ? 'other' : c.slug, title: m.title, description: m.summary || excerpt(m.body), image: m.cover[0] || '', body, style: `--game:${m.color}` });
}

function postPage(p, i) {
  const root = '../../';
  const prev = posts[i + 1], next = posts[i - 1];
  const body = `  <main>
    <nav class="wrap crumbs label page-crumbs" aria-label="You are here">
      <ol><li><a href="../../">Home</a></li><li><a href="../">Posts</a></li><li aria-current="page">${esc(p.title)}</li></ol>
    </nav>
    <article class="wrap post">
      <header class="post-head">
        <p class="label"><span class="dim">${esc(fmtDate(p.date))} /</span> ${esc(p.tag)}</p>
        <h1 class="post-title">${esc(p.title)}</h1>
      </header>
      ${p.image ? `<div class="frame"><img src="${esc(href(p.image, root))}" width="1600" height="900" alt=""></div>` : ''}
      <div class="prose">
${markdown(p.body, root)}
      </div>
    </article>
    ${prev || next ? `<nav class="wrap" aria-label="Older and newer posts"><div class="pager">
      ${prev ? `<a class="pg" href="../${prev.slug}/" rel="prev"><span class="label">&lsaquo; Older post</span><b>${esc(prev.title)}</b></a>` : ''}
      ${next ? `<a class="pg next" href="../${next.slug}/" rel="next"><span class="label">Newer post &rsaquo;</span><b>${esc(next.title)}</b></a>` : ''}
    </div></nav>` : ''}
  </main>
`;
  return page({ root, at: `posts/${p.slug}/`, tab: 'posts', title: p.title, description: p.summary, image: p.image, body });
}

function postsPage() {
  const root = '../';
  const body = `  <main>
${pageHero({ name: 'Posts', color: GAME_COLORS.posts, label: plural(posts.length, 'post', 'posts'), text: `News, updates and behind-the-scenes from ${S.name}.` })}
    <section class="wrap section" aria-label="All posts">
${feed(posts, root)}
    </section>
  </main>
`;
  return page({ root, at: 'posts/', tab: 'posts', title: 'Posts', description: `News and updates from ${S.name}.`, body });
}

// Everything the search box can find (games are added in the browser, read live from the games site).
function searchIndex() {
  const items = [
    { t: 'Home', k: 'Page', u: '', d: 'The front page' },
    ...gameCats.map(c => ({ t: c.name, k: 'Tab', u: c.slug + '/', d: c.text, c: c.color })),
    S.games_site && { t: 'Games', k: 'Tab', u: 'games/', d: 'Every game, free in your browser', c: GAME_COLORS.games },
    otherCat && { t: 'Other', k: 'Tab', u: 'other/', d: otherCat.text },
    { t: 'Posts', k: 'Tab', u: 'posts/', d: 'News and updates' },
    S.inviteUrl && { t: 'Discord', k: 'Link', u: S.inviteUrl, d: 'Join the Discord server', c: '#8c9eff' },
    S.games_site && { t: 'Games site', k: 'Link', u: S.games_site, d: S.games_site.replace(/^https?:\/\//, '') },
    ...mods.map(m => ({ t: m.title, k: m.game, u: m.hasPage ? m.slug + '/' : (m.link || m.download || ''), d: [m.type, m.summary].filter(Boolean).join(' · '), c: m.color, x: m.tags.join(' ') })),
    ...posts.map(p => ({ t: p.title, k: 'Post', u: `posts/${p.slug}/`, d: `${fmtDate(p.date)} · ${p.summary}` })),
  ].filter(x => x && x.u !== undefined);
  return `// Made by build.js: everything the search box (press /) can find.\nwindow.NEUTRAL_INDEX = ${JSON.stringify(items)};\n`;
}

/* ---------- build ---------- */

function write(rel, text) {
  const f = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, text);
}
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
write('index.html', home());
cats.forEach(c => write(`${c.other ? 'other' : c.slug}/index.html`, categoryPage(c)));
if (S.games_site) write('games/index.html', gamesPage());
mods.filter(m => m.hasPage).forEach(m => write(`${m.slug}/index.html`, modPage(m)));
write('posts/index.html', postsPage());
posts.forEach((p, i) => write(`posts/${p.slug}/index.html`, postPage(p, i)));
write('search-index.js', searchIndex());
for (const f of ['site.css', 'site.js']) fs.copyFileSync(path.join(ROOT, f), path.join(OUT, f));
if (fs.existsSync(path.join(CONTENT, 'images'))) fs.cpSync(path.join(CONTENT, 'images'), path.join(OUT, 'images'), { recursive: true });
console.log(`Built ${releases.length} release(s), ${mods.length - releases.length} other link(s), ${posts.length} post(s) and ${cats.length + (S.games_site ? 1 : 0)} tab(s) into _site${EXAMPLES ? ' (examples included)' : ''}.`);
if (!S.inviteUrl) console.log('Tip: put your Discord invite in content/settings.yml (discord: ...) to show the Join buttons.');

/* ---------- a small local server for --serve ---------- */

if (SERVE) {
  const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.mp4': 'video/mp4' };
  http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]);
    let f = path.join(OUT, p);
    if (!f.startsWith(OUT)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) {
      if (!p.endsWith('/')) { res.writeHead(301, { Location: p + '/' }); return res.end(); }
      f = path.join(f, 'index.html');
    }
    fs.readFile(f, (err, data) => {
      if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
      res.writeHead(200, { 'Content-Type': types[path.extname(f).toLowerCase()] || 'application/octet-stream' });
      res.end(data);
    });
  }).listen(PORT, () => console.log(`Open http://localhost:${PORT}/`));
}
