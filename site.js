// Shared by every page: giant words that fit the width, the green code raining behind the banner, the tag filter,
// the games read live from the games site, the search box (press / or Ctrl+K), and the live Discord numbers.
(function () {
  var html = document.documentElement;
  var ROOT = html.getAttribute('data-root') || './';
  var GAMES = html.getAttribute('data-games') || '';
  var still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var escapeHtml = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var link = function (u) { return /^(https?:|mailto:)/.test(u) ? u : (ROOT === './' ? '' : ROOT) + u || './'; };

  // Giant words fill their box's width exactly, like a poster, whatever the screen and font.
  (function () {
    var words = [].slice.call(document.querySelectorAll('[data-fit]'));
    function fit() {
      words.forEach(function (w) {
        var box = w.parentNode, cs = getComputedStyle(box);
        var room = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        if (room <= 0 || room === w._room) return;
        w.style.fontSize = '100px';
        var width = w.getBoundingClientRect().width;
        if (width > 0) { w.style.fontSize = (100 * room / width).toFixed(2) + 'px'; w._room = room; }
      });
    }
    fit();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { words.forEach(function (w) { w._room = 0; }); fit(); });
    window.addEventListener('resize', fit);
  })();

  // Green code raining behind the banner. Calm, and it stops when the banner is off screen.
  (function () {
    var c = document.querySelector('canvas.rain');
    if (!c || !c.getContext) return;
    var ctx = c.getContext('2d');
    var glyphs = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789NEUTRAL<>/+=*';
    var size = 16, w = 0, h = 0, drops = [], last = 0, on = true;
    function resize() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = c.clientWidth; h = c.clientHeight;
      c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drops = [];
      for (var i = 0; i < Math.ceil(w / size); i++) drops.push({ y: Math.random() * -h / size * 1.5, v: 0.35 + Math.random() * 0.6 });
    }
    function step() {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0,0,0,.085)';
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
      ctx.font = '500 ' + (size - 3) + 'px "Geist Mono", ui-monospace, monospace';
      for (var i = 0; i < drops.length; i++) {
        var d = drops[i];
        if (d.y * size > h + 60 && Math.random() > 0.97) { d.y = -Math.random() * 12; d.v = 0.35 + Math.random() * 0.6; }
        ctx.fillStyle = Math.random() > 0.94 ? 'rgba(255,255,250,.9)' : 'rgba(191,255,168,' + (0.3 + Math.random() * 0.45).toFixed(2) + ')';
        ctx.fillText(glyphs.charAt((Math.random() * glyphs.length) | 0), i * size + 2, d.y * size);
        d.y += d.v;
      }
    }
    function loop(t) {
      if (!on) return;
      requestAnimationFrame(loop);
      if (t - last < 55) return;
      last = t;
      step();
    }
    resize();
    if (still) { for (var k = 0; k < 90; k++) step(); return; }
    for (var j = 0; j < 40; j++) step(); // start with some rain already falling
    var resizeTimer;
    window.addEventListener('resize', function () { clearTimeout(resizeTimer); resizeTimer = setTimeout(function () { resize(); for (var j = 0; j < 40; j++) step(); }, 150); });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (e) { var was = on; on = e[0].isIntersecting && !document.hidden; if (on && !was) requestAnimationFrame(loop); }).observe(c);
    }
    document.addEventListener('visibilitychange', function () { var was = on; on = !document.hidden; if (on && !was) requestAnimationFrame(loop); });
    requestAnimationFrame(loop);
  })();

  // The tag filter on the front page (from a mod page's #tag links). Kept in the address so it can be shared.
  (function () {
    var grid = document.querySelector('[data-filter-grid]');
    var tagChip = document.getElementById('tag-chip'), empty = document.getElementById('empty');
    if (!grid || !tagChip) return;
    var cards = [].slice.call(grid.querySelectorAll('.card'));
    var tagsOf = function (card) { return card.dataset.tags ? card.dataset.tags.split('|') : []; };
    var q = new URLSearchParams(location.search).get('tag') || '';
    var tag = cards.some(function (c) { return tagsOf(c).indexOf(q) >= 0; }) ? q : '';
    function apply(remember) {
      var shown = 0;
      cards.forEach(function (card) { var ok = !tag || tagsOf(card).indexOf(tag) >= 0; card.hidden = !ok; if (ok) shown++; });
      tagChip.hidden = !tag;
      tagChip.querySelector('b').textContent = tag;
      tagChip.setAttribute('aria-label', 'Remove the tag ' + tag);
      empty.hidden = shown > 0;
      grid.hidden = shown === 0;
      if (remember) { try { history.replaceState(null, '', location.pathname + (tag ? '?tag=' + encodeURIComponent(tag) : '') + '#releases'); } catch (e) { /* the filter still works */ } }
    }
    tagChip.addEventListener('click', function () { tag = ''; apply(true); });
    document.getElementById('show-all').addEventListener('click', function () { tag = ''; apply(true); });
    apply(false);
  })();

  // The games, read live from the games site's front page, so a new game shows up here by itself.
  var gamesPromise = null;
  function loadGames() {
    if (!GAMES || !window.fetch || !window.DOMParser) return Promise.resolve([]);
    if (!gamesPromise) {
      gamesPromise = fetch(GAMES, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); }).then(function (text) {
        var doc = new DOMParser().parseFromString(text, 'text/html');
        return [].slice.call(doc.querySelectorAll('article.card[data-slug]')).map(function (card) {
          var a = card.querySelector('.card-link'), img = card.querySelector('.frame img'), play = card.querySelector('a.play'), no = card.querySelector('.no');
          var color = /--game:\s*([^;"]+)/.exec(card.getAttribute('style') || '');
          return {
            title: a ? a.textContent.trim() : card.dataset.slug,
            url: new URL(a ? a.getAttribute('href') : card.dataset.slug + '/', GAMES).href,
            play: play ? new URL(play.getAttribute('href'), GAMES).href : '',
            img: img ? new URL(img.getAttribute('src'), GAMES).href : '',
            alt: img ? img.getAttribute('alt') || '' : '',
            genre: card.dataset.genre || 'Game',
            no: no ? no.textContent.trim() : '',
            color: color ? color[1].trim() : '#5ab8ff'
          };
        });
      });
    }
    return gamesPromise;
  }
  (function () {
    var lists = [].slice.call(document.querySelectorAll('[data-games-list]'));
    var counts = document.querySelectorAll('[data-games-count]');
    if (!GAMES || (!lists.length && !counts.length)) return;
    loadGames().then(function (games) {
      [].forEach.call(counts, function (el) { el.textContent = games.length; el.hidden = false; });
      lists.forEach(function (list) {
        var max = list.getAttribute('data-games-list');
        var shown = max === 'all' ? games : games.slice(0, +max || 8);
        list.innerHTML = shown.map(function (g) {
          return '<article class="card" style="--game:' + escapeHtml(g.color) + '">'
            + '<div class="frame"><img src="' + escapeHtml(g.img) + '" width="1600" height="900" alt="' + escapeHtml(g.alt) + '" loading="lazy"></div>'
            + '<div class="meta"><span class="no">' + escapeHtml(g.no || g.genre) + '</span>'
            + '<h3><a class="card-link" href="' + escapeHtml(g.url) + '">' + escapeHtml(g.title) + '</a></h3>'
            + (g.play ? '<a class="play" href="' + escapeHtml(g.play) + '" aria-label="Play ' + escapeHtml(g.title) + '"><svg width="10" height="10" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3v18l16-9z" fill="currentColor"/></svg>Play</a>' : '')
            + '</div></article>';
        }).join('');
        if (!shown.length) throw new Error('no games');
      });
    }).catch(function () {
      lists.forEach(function (list) { list.hidden = true; var fail = list.parentNode.querySelector('.games-fail'); if (fail) fail.hidden = false; });
      [].forEach.call(counts, function (el) { if (el.tagName === 'B') el.textContent = '↗'; });
    });
  })();

  // Search everything: press / or Ctrl+K, type, arrows to pick, Enter to go.
  (function () {
    var index = (window.NEUTRAL_INDEX || []).slice();
    var box, input, listEl, items = [], sel = 0, lastFocus = null, gamesAdded = false;
    function build() {
      box = document.createElement('div');
      box.className = 'palette';
      box.hidden = true;
      box.innerHTML = '<div class="palette-box" role="dialog" aria-modal="true" aria-label="Search">'
        + '<div class="palette-in"><span aria-hidden="true">&gt;</span><input type="search" placeholder="Search mods, games, posts…" aria-label="Search" aria-controls="palette-list" autocomplete="off" spellcheck="false"><kbd>Esc</kbd></div>'
        + '<ul class="palette-list" id="palette-list" role="listbox"></ul>'
        + '<p class="palette-foot"><span><kbd>↑</kbd> <kbd>↓</kbd> move</span><span><kbd>Enter</kbd> open</span><span><kbd>Esc</kbd> close</span></p></div>';
      document.body.appendChild(box);
      input = box.querySelector('input');
      listEl = box.querySelector('.palette-list');
      box.addEventListener('mousedown', function (e) { if (e.target === box) close(); });
      input.addEventListener('input', function () { sel = 0; render(); });
      input.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); move(e.key === 'ArrowDown' ? 1 : -1); }
        else if (e.key === 'Enter') { e.preventDefault(); var a = listEl.querySelector('[aria-selected="true"] a'); if (a) a.click(); }
        else if (e.key === 'Escape') { e.preventDefault(); close(); }
        else if (e.key === 'Tab') { e.preventDefault(); move(e.shiftKey ? -1 : 1); }
      });
      listEl.addEventListener('mousemove', function (e) { var li = e.target.closest('li[data-i]'); if (li && +li.dataset.i !== sel) { sel = +li.dataset.i; mark(); } });
    }
    function score(item, words) {
      var title = item.t.toLowerCase(), hay = (item.t + ' ' + item.k + ' ' + (item.d || '') + ' ' + (item.x || '')).toLowerCase(), s = 0;
      for (var i = 0; i < words.length; i++) {
        var w = words[i];
        if (hay.indexOf(w) < 0) return -1;
        s += title.indexOf(w) === 0 ? 6 : title.indexOf(w) > 0 ? 4 : 1;
      }
      return s + (item.k === 'Tab' ? 1 : 0);
    }
    function render() {
      var q = input.value.trim().toLowerCase(), words = q.split(/\s+/).filter(Boolean), groups = [];
      if (!words.length) {
        groups.push(['Jump to', index.filter(function (x) { return x.k === 'Tab' || x.k === 'Page' || x.k === 'Link'; })]);
        groups.push(['Newest', index.filter(function (x) { return x.k !== 'Tab' && x.k !== 'Page' && x.k !== 'Link'; }).slice(0, 6)]);
      } else {
        groups.push(['Results', index.map(function (x) { return { x: x, s: score(x, words) }; }).filter(function (r) { return r.s >= 0; })
          .sort(function (a, b) { return b.s - a.s; }).slice(0, 14).map(function (r) { return r.x; })]);
      }
      items = [];
      var out = '';
      groups.forEach(function (g) {
        if (!g[1].length) return;
        out += '<li class="palette-head" role="presentation">' + escapeHtml(g[0]) + '</li>';
        g[1].forEach(function (x) {
          var i = items.push(x) - 1, ext = /^https?:/.test(x.u) && x.k !== 'Game';
          out += '<li role="option" data-i="' + i + '" aria-selected="false"><a href="' + escapeHtml(link(x.u)) + '"' + (ext ? ' target="_blank" rel="noopener"' : '') + '>'
            + '<i style="--c:' + escapeHtml(x.c || '#bfffa8') + '" aria-hidden="true"></i>'
            + '<span><b>' + escapeHtml(x.t) + (ext ? ' ↗' : '') + '</b>' + (x.d ? '<small>' + escapeHtml(x.d) + '</small>' : '') + '</span>'
            + '<em>' + escapeHtml(x.k) + '</em></a></li>';
        });
      });
      listEl.innerHTML = out || '<li class="palette-none">Nothing found for “' + escapeHtml(input.value.trim()) + '”.</li>';
      if (sel >= items.length) sel = 0;
      mark();
    }
    function mark() {
      [].forEach.call(listEl.querySelectorAll('li[data-i]'), function (li) {
        var on = +li.dataset.i === sel;
        li.setAttribute('aria-selected', String(on));
        if (on) { li.scrollIntoView({ block: 'nearest' }); input.setAttribute('aria-activedescendant', ''); }
      });
    }
    function move(d) { if (!items.length) return; sel = (sel + d + items.length) % items.length; mark(); }
    function open() {
      if (!box) build();
      if (!box.hidden) return;
      lastFocus = document.activeElement;
      box.hidden = false;
      html.style.overflow = 'hidden';
      input.value = '';
      sel = 0;
      render();
      input.focus();
      if (!gamesAdded) {
        gamesAdded = true;
        loadGames().then(function (games) {
          games.forEach(function (g) { index.push({ t: g.title, k: 'Game', u: g.url, d: g.genre + (g.no ? ' · ' + g.no : ''), c: g.color }); });
          if (!box.hidden) render();
        }).catch(function () {});
      }
    }
    function close() {
      if (!box || box.hidden) return;
      box.hidden = true;
      html.style.overflow = '';
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }
    [].forEach.call(document.querySelectorAll('[data-search]'), function (b) { b.addEventListener('click', open); });
    document.addEventListener('keydown', function (e) {
      var t = e.target, typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
      if ((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); if (box && !box.hidden) close(); else open(); }
      else if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); open(); }
    });
  })();

  // Live Discord numbers: how many people are online and in the server, read from the invite link.
  // Anything marked data-online stays hidden until the numbers arrive, so nothing shows if Discord can't be reached.
  (function () {
    var code = html.getAttribute('data-invite');
    if (!code || !window.fetch || !document.querySelector('[data-n]')) return;
    fetch('https://discord.com/api/v10/invites/' + encodeURIComponent(code) + '?with_counts=true')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || typeof d.approximate_presence_count !== 'number') return;
        var n = { online: d.approximate_presence_count, members: d.approximate_member_count };
        [].forEach.call(document.querySelectorAll('[data-n]'), function (b) {
          var v = n[b.getAttribute('data-n')];
          if (typeof v === 'number') b.textContent = v.toLocaleString('en');
        });
        [].forEach.call(document.querySelectorAll('[data-online]'), function (el) { el.hidden = false; });
      })
      .catch(function () { /* no numbers, no problem */ });
  })();
})();
