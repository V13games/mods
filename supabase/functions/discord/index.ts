// The Project Neutral Discord bot, run as a Supabase Edge Function.
// The website's Admin page calls it to list the server's channels and to post a message as the bot,
// with the banner at the end. Only accounts with the owner or admin role can use it.
//
// Secrets, set in Supabase (Edge Functions > Secrets), never in this file:
//   DISCORD_BOT_TOKEN   the bot's token, from the Discord Developer Portal (Bot > Reset Token)
//   DISCORD_GUILD_ID    optional: your server's ID; without it, the first server the bot is in is used
//   BANNER_URL          optional: the picture added at the end of every message
import { createClient } from 'npm:@supabase/supabase-js@2.49.4';

const API = 'https://discord.com/api/v10';
const BANNER = Deno.env.get('BANNER_URL') || 'https://v13games.github.io/mods/images/brand/banner.png';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Discord's error codes, said plainly.
const DISCORD_ERRORS: Record<number, string> = {
  10003: 'That channel does not exist any more.',
  50001: "The bot can't see that channel. Give it the View Channel permission there.",
  50013: "The bot isn't allowed to post there. Give it Send Messages and Embed Links in that channel.",
  50035: "Discord didn't accept that message. Check the length and try again.",
};

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

type Channel = { id: string; name: string; type: number; parent_id?: string | null; position: number };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply({ error: 'Use POST.' }, 405);

  try {
    // Who is asking, and are they allowed?
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: { user } } = await db.auth.getUser(jwt);
    if (!user) return reply({ error: 'Log in first.' }, 401);
    const { data: profile } = await db.from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (!profile || !['owner', 'admin'].includes(profile.role)) return reply({ error: 'Only admins can use this.' }, 403);

    const token = Deno.env.get('DISCORD_BOT_TOKEN');
    if (!token) return reply({ error: 'The bot token is not set up yet (DISCORD_BOT_TOKEN in Supabase).' }, 503);
    const discord = async (path: string, init: RequestInit = {}) => {
      const res = await fetch(API + path, {
        ...init,
        headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'DiscordBot (https://v13games.github.io/mods/, 1.0)' },
      });
      const data = res.status === 204 ? null : await res.json().catch(() => null);
      return { ok: res.ok, status: res.status, data };
    };

    // Which server: the one set in the secrets, or the first one the bot is in.
    let guildId = Deno.env.get('DISCORD_GUILD_ID') ?? '';
    if (!guildId) {
      const mine = await discord('/users/@me/guilds');
      if (!mine.ok) return reply({ error: mine.status === 401 ? 'The bot token is wrong. Make a new one in the Discord Developer Portal.' : 'Could not reach Discord.' }, 502);
      if (!mine.data?.length) return reply({ error: 'The bot is not in your server yet. Add it with the invite link first.' }, 409);
      guildId = mine.data[0].id;
    }

    const [guild, list] = await Promise.all([discord(`/guilds/${guildId}`), discord(`/guilds/${guildId}/channels`)]);
    if (!guild.ok || !list.ok) return reply({ error: "The bot can't see your server. Check that it has been added." }, 502);
    const all = list.data as Channel[];
    const categories = new Map(all.filter((c) => c.type === 4).map((c) => [c.id, c]));
    const channels = all
      .filter((c) => c.type === 0 || c.type === 5) // text and announcement channels
      .map((c) => {
        const cat = c.parent_id ? categories.get(c.parent_id) : undefined;
        return { id: c.id, name: c.name, announcement: c.type === 5, category: cat?.name ?? '', order: [cat?.position ?? -1, c.position] };
      })
      .sort((a, b) => a.order[0] - b.order[0] || a.order[1] - b.order[1])
      .map(({ order: _order, ...c }) => c);

    const body = await req.json().catch(() => ({}));

    if (body.action === 'channels') {
      const { data: recent } = await db
        .from('discord_posts')
        .select('channel_name, content, message_url, created_at')
        .order('created_at', { ascending: false })
        .limit(8);
      return reply({ server: guild.data.name, channels, recent: recent ?? [], banner: BANNER });
    }

    if (body.action === 'send') {
      let content = String(body.content ?? '').trim();
      if (!content) return reply({ error: 'Write a message first.' }, 400);
      if (body.ping && !content.includes('@everyone')) content = '@everyone ' + content;
      if (content.length > 2000) return reply({ error: 'Discord messages can be at most 2000 characters.' }, 400);
      const channel = channels.find((c) => c.id === String(body.channel ?? ''));
      if (!channel) return reply({ error: 'Pick a channel from the list.' }, 400);

      const sent = await discord(`/channels/${channel.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          content,
          embeds: body.banner === false ? [] : [{ color: 0xbfffa8, image: { url: BANNER } }],
          allowed_mentions: { parse: body.ping ? ['everyone', 'roles', 'users'] : ['users'] },
        }),
      });
      if (!sent.ok) return reply({ error: DISCORD_ERRORS[sent.data?.code] ?? `Discord said no: ${sent.data?.message ?? sent.status}` }, 502);

      const url = `https://discord.com/channels/${guildId}/${channel.id}/${sent.data.id}`;
      await db.from('discord_posts').insert({ user_id: user.id, channel_id: channel.id, channel_name: channel.name, content, message_url: url });
      return reply({ ok: true, url, channel: channel.name });
    }

    return reply({ error: 'Unknown action.' }, 400);
  } catch (e) {
    return reply({ error: 'Something went wrong: ' + (e instanceof Error ? e.message : String(e)) }, 500);
  }
});
