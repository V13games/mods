# Project Neutral: mods site

The site for the Project Neutral Discord: mods and plugins for FiveM, Minecraft and more, plus posts.
It lives at **https://v13games.github.io/mods/** and looks like the games site, https://v13games.github.io/.

You never touch the HTML. Everything comes from the `content` folder, and every time you commit a change
GitHub rebuilds the site by itself (takes about a minute, see the **Actions** tab).

## Add a mod or plugin

1. Open `content/mods` and click **Add file > Create new file**.
2. Name it after the mod, like `neutral-garage.md`. The name becomes its address: `v13games.github.io/mods/neutral-garage/`.
3. Copy the text of `_example-fivem.md` (or `_example-minecraft.md`) into it and fill it in. Leave out lines you don't need.
4. Click **Commit changes**.

For a picture: open `content/images`, **Add file > Upload files**, then write `cover: images/the-file-name.jpg` in the mod.
Wide pictures look best (16:9, like 1600×900). Without a picture, the mod's name is drawn as an outline instead.

`game:` decides which filter button it is under. A new game (like `game: Roblox`) gets its own button by itself.

## Write a post

1. Open `content/posts`, **Add file > Create new file**.
2. Name it with the date first: `2026-12-01-garage-update.md`.
3. Copy `_example.md` into it, write, and commit.

Posts are written like Discord messages: `**bold**`, `*italics*`, links, lists with `-`, headings with `##`.
A YouTube link on its own line becomes a video.

## Settings

`content/settings.yml` has the Discord invite link, the site's name, the banner text and the tabs.
With the invite filled in, the site gets **Join Discord** buttons and shows how many people are online.

## Tabs and getting around

- Every game gets its own tab (FiveM, Minecraft...). A mod with `game: Roblox` makes a Roblox tab by itself.
- **Games** shows every game from https://v13games.github.io/, read live, so new games appear here by themselves.
- **Other** only shows when something is in it.
- Press **/** (or Ctrl+K) anywhere to search everything: mods, posts, games and tabs.

## Logo and banner

In `brand/social`:

- `discord-icon.png` (512×512): Discord server icon, and the bot's picture.
- `discord-banner.png` (1920×1080): Discord server banner.
- `youtube-icon.png` (800×800): YouTube profile picture.
- `youtube-banner.png` (2560×1440): YouTube banner. The logo and name sit in the middle strip every device shows.

The website uses `content/images/brand/icon-512.png`, `banner.png` (the picture when the site is shared) and `logo.svg`.

They are all made from `brand/icon.html` and `brand/banner.html`. After changing one, run
`powershell -ExecutionPolicy Bypass -File brand\make-images.ps1` to make the pictures again.

## Files starting with `_`

They are examples and are never on the site. Keep them to copy from.

## Try it on your own computer (optional)

With Node installed: `node build.js --serve`, then open http://localhost:8080.
Add `--examples` to see the example mods and post too.

## Accounts and the Admin page

People can log in with GitHub or Google (top right, **Log in**). The owner and admins also get **Admin**: write a
message, pick a channel, and the Project Neutral bot posts it on the Discord with the banner at the end.

- Logins and accounts are run by Supabase. The website only needs `supabase_url` and `supabase_key` in `content/settings.yml`.
- `supabase/setup.sql` makes the accounts tables. The GitHub account **V13games** becomes owner the first time it logs in.
- `supabase/functions/discord` is the bot code. Its secrets (the bot token) live in Supabase, never in this project.
- To make someone an admin, run this in Supabase's SQL Editor:
  `update public.profiles set role = 'admin' where github_login = 'their-github-name';`
