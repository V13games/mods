// Shared by every page: giant words that fit the width, the filter buttons on the front page,
// and the live "online" numbers from the Discord invite.

// Giant words fill the page's width exactly, like a poster, whatever the screen and font.
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

// Filters: one game (the buttons), one tag (from a mod page's #tag links), or both.
// The choice is kept in the address, so a mod page can link to "everything tagged ESX".
(function () {
  var grid = document.querySelector('[data-filter-grid]');
  if (!grid) return;
  var cards = [].slice.call(grid.querySelectorAll('.card'));
  var chips = [].slice.call(document.querySelectorAll('.chip[data-genre]'));
  var tagChip = document.getElementById('tag-chip'), empty = document.getElementById('empty');
  var tagsOf = function (card) { return card.dataset.tags ? card.dataset.tags.split('|') : []; };
  var known = function (tag) { return cards.some(function (c) { return tagsOf(c).indexOf(tag) >= 0; }); };
  var state = { genre: 'all', tag: '' };
  var q = new URLSearchParams(location.search);
  if (chips.some(function (c) { return c.dataset.genre === q.get('genre'); })) state.genre = q.get('genre');
  if (q.get('tag') && known(q.get('tag'))) state.tag = q.get('tag');

  function apply(remember) {
    var shown = 0;
    chips.forEach(function (c) { c.setAttribute('aria-pressed', String(c.dataset.genre === state.genre)); });
    cards.forEach(function (card) {
      var ok = (state.genre === 'all' || card.dataset.genre === state.genre) && (!state.tag || tagsOf(card).indexOf(state.tag) >= 0);
      card.hidden = !ok;
      if (ok) shown++;
    });
    tagChip.hidden = !state.tag;
    tagChip.querySelector('b').textContent = state.tag;
    tagChip.setAttribute('aria-label', 'Remove the tag ' + state.tag);
    empty.hidden = shown > 0;
    grid.hidden = shown === 0;
    if (remember) {
      var p = new URLSearchParams();
      if (state.genre !== 'all') p.set('genre', state.genre);
      if (state.tag) p.set('tag', state.tag);
      var s = p.toString();
      try { history.replaceState(null, '', location.pathname + (s ? '?' + s : '') + '#mods'); } catch (e) { /* the filter still works */ }
    }
  }
  chips.forEach(function (c) { c.addEventListener('click', function () { state.genre = c.dataset.genre; apply(true); }); });
  tagChip.addEventListener('click', function () { state.tag = ''; apply(true); });
  document.getElementById('show-all').addEventListener('click', function () { state.genre = 'all'; state.tag = ''; apply(true); });
  apply(false);
})();

// Live Discord numbers: how many people are online and in the server, read from the invite link.
// Anything marked data-online stays hidden until the numbers arrive, so nothing shows if Discord can't be reached.
(function () {
  var code = document.documentElement.getAttribute('data-invite');
  var spots = document.querySelectorAll('[data-online]');
  if (!code || !spots.length || !window.fetch) return;
  fetch('https://discord.com/api/v10/invites/' + encodeURIComponent(code) + '?with_counts=true')
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      if (!d || typeof d.approximate_presence_count !== 'number') return;
      var n = { online: d.approximate_presence_count, members: d.approximate_member_count };
      [].forEach.call(spots, function (el) {
        [].forEach.call(el.querySelectorAll('[data-n]'), function (b) {
          var v = n[b.getAttribute('data-n')];
          if (typeof v === 'number') b.textContent = v.toLocaleString('en');
        });
        el.hidden = false;
      });
    })
    .catch(function () { /* no numbers, no problem */ });
})();
