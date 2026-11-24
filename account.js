// Accounts and the Admin page.
// Log in with GitHub or Google (Supabase does the logging in), see your account, and, for owners and admins,
// write a message and send it to a Discord channel as the Project Neutral bot, with the banner at the end.
const html = document.documentElement;
const SB_URL = html.dataset.sbUrl || '';
const SB_KEY = html.dataset.sbKey || '';
const PAGE = document.body.dataset.page; // "account" or "admin"
const CACHE = 'pn-account';
const ROLES = { owner: 'Owner', admin: 'Admin', member: 'Member' };
const PROVIDERS = { github: 'GitHub', google: 'Google' };

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch { /* fine */ } },
};
const state = (name) => $$('[data-state]').forEach((el) => { el.hidden = el.dataset.state !== name; });
const say = (el, text, bad) => { if (!el) return; el.innerHTML = text; el.classList.toggle('bad', !!bad); };
const remember = (account) => { store.set(CACHE, account); window.dispatchEvent(new Event('pn-account')); };

async function start() {
  if (!SB_URL || !SB_KEY) {
    if (PAGE === 'admin') { state('admin'); composer(null); } else state('off');
    return;
  }
  let createClient;
  try { ({ createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/+esm')); }
  catch { state('error'); return; }
  const sb = createClient(SB_URL, SB_KEY, { auth: { flowType: 'pkce', persistSession: true, detectSessionInUrl: true } });

  $$('[data-login]').forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true;
    const { error } = await sb.auth.signInWithOAuth({ provider: b.dataset.login, options: { redirectTo: location.origin + location.pathname } });
    if (error) { b.disabled = false; say($('[data-login-status]'), esc(error.message), true); }
  }));
  $$('[data-logout]').forEach((b) => b.addEventListener('click', async () => {
    await sb.auth.signOut();
    remember(null);
    location.reload();
  }));

  const { data: { session } } = await sb.auth.getSession();
  if (location.search.includes('code=')) history.replaceState(null, '', location.pathname); // tidy the address after logging in
  if (!session) { remember(null); state('out'); return; }

  const { data: p, error } = await sb.rpc('my_profile');
  if (error || !p) { state('error'); return; }
  remember({ name: p.display_name, avatar: p.avatar_url, role: p.role });

  const meta = session.user.app_metadata || {};
  const providers = (meta.providers || [meta.provider]).filter(Boolean).map((x) => PROVIDERS[x] || x);
  $$('[data-me-name]').forEach((el) => { el.textContent = p.display_name || 'Your account'; });
  $$('[data-me-role]').forEach((el) => { el.textContent = ROLES[p.role] || p.role; el.dataset.role = p.role; });
  $$('[data-me-provider]').forEach((el) => { el.textContent = providers.join(' and ') || 'an account'; });
  $$('[data-me-avatar]').forEach((img) => { if (p.avatar_url) { img.src = p.avatar_url; img.hidden = false; } });
  const isAdmin = p.role === 'owner' || p.role === 'admin';
  $$('[data-admin-only]').forEach((el) => { el.hidden = !isAdmin; });

  if (PAGE === 'admin') {
    if (!isAdmin) { state('denied'); return; }
    state('admin');
    composer(sb);
  } else {
    state('in');
  }
}

// The Admin page: pick a channel, write, preview, send.
async function composer(sb) {
  const form = $('#composer');
  if (!form) return;
  const status = $('[data-send-status]');
  const sendBtn = form.querySelector('button[type="submit"]');
  const preview = $('[data-preview-text]');
  const banner = $('[data-preview-banner]');
  const count = $('[data-count]');

  const call = async (body) => {
    const { data, error } = await sb.functions.invoke('discord', { body });
    if (error) {
      let msg = error.message;
      try { const j = await error.context.json(); if (j && j.error) msg = j.error; } catch { /* keep the first message */ }
      throw new Error(msg);
    }
    return data;
  };

  // A rough preview: line breaks, **bold**, *italics*, `code`, and @everyone when pinging.
  const render = () => {
    let text = form.content.value;
    if (form.ping.checked && !text.includes('@everyone')) text = '@everyone ' + text;
    count.textContent = `${text.length} / 2000`;
    count.classList.toggle('bad', text.length > 2000);
    preview.innerHTML = text.trim()
      ? esc(text)
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/(^|[\s(])\*(?!\s)(.+?)\*/g, '$1<em>$2</em>')
        .replace(/@everyone/g, '<span class="ping">@everyone</span>')
        .replace(/\n/g, '<br>')
      : '<span class="dim">Your message shows here.</span>';
    banner.hidden = !form.banner.checked;
  };
  form.addEventListener('input', render);
  form.addEventListener('change', render);
  form.content.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); form.requestSubmit(); } });
  render();

  const fillChannels = (channels) => {
    const groups = new Map();
    channels.forEach((c) => { if (!groups.has(c.category)) groups.set(c.category, []); groups.get(c.category).push(c); });
    form.channel.innerHTML = [...groups].map(([cat, list]) => {
      const opts = list.map((c) => `<option value="${esc(c.id)}">#${esc(c.name)}${c.announcement && !/announce/i.test(c.name) ? ' (announcement channel)' : ''}</option>`).join('');
      return cat ? `<optgroup label="${esc(cat)}">${opts}</optgroup>` : opts;
    }).join('');
    const last = store.get('pn-channel');
    if (last && channels.some((c) => c.id === last)) form.channel.value = last;
  };
  const fillRecent = (recent) => {
    const list = $('[data-recent]');
    list.innerHTML = recent.length
      ? recent.map((r) => `<li><a href="${esc(r.message_url)}" target="_blank" rel="noopener"><span class="label dim">#${esc(r.channel_name)} / ${esc(new Date(r.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))}</span><span>${esc(r.content.slice(0, 90))}${r.content.length > 90 ? '…' : ''}</span></a></li>`).join('')
      : '<li class="dim">Nothing sent yet.</li>';
  };
  form.channel.addEventListener('change', () => store.set('pn-channel', form.channel.value));

  if (!sb) { // accounts not switched on yet: show the page with example channels, and don't send anything
    $$('[data-demo]').forEach((el) => { el.hidden = false; });
    fillChannels([
      { id: '1', name: 'announcements', category: 'Info', announcement: true },
      { id: '2', name: 'releases', category: 'Info' },
      { id: '3', name: 'general', category: 'Chat' },
    ]);
    sendBtn.disabled = true;
    return;
  }

  const load = async () => {
    const d = await call({ action: 'channels' });
    fillChannels(d.channels);
    fillRecent(d.recent || []);
    if (d.banner) banner.src = d.banner;
    $$('[data-server]').forEach((el) => { el.textContent = d.server; });
  };
  try { await load(); }
  catch (e) { say(status, esc(e.message), true); sendBtn.disabled = true; return; }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!form.content.value.trim()) { say(status, 'Write a message first.', true); return; }
    sendBtn.disabled = true;
    say(status, 'Sending…');
    try {
      const r = await call({ action: 'send', channel: form.channel.value, content: form.content.value, ping: form.ping.checked, banner: form.banner.checked });
      say(status, `Sent to #${esc(r.channel)}. <a href="${esc(r.url)}" target="_blank" rel="noopener">Open it in Discord</a>`);
      form.content.value = '';
      form.ping.checked = false;
      render();
      load().catch(() => {});
    } catch (err) {
      say(status, esc(err.message), true);
    } finally {
      sendBtn.disabled = false;
    }
  });
}

start();
