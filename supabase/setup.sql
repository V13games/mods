-- Project Neutral accounts. Paste all of this into Supabase: SQL Editor > New query > Run.
-- Safe to run again; it only adds what is missing.
--
-- profiles        one row per account: name, picture, GitHub username and role (member, admin or owner)
-- owner_logins    GitHub usernames that become owner the first time they log in
-- discord_posts   a log of what was posted to Discord from the Admin page
--
-- Nobody can change roles from the website. To make someone an admin, run:
--   update public.profiles set role = 'admin' where github_login = 'their-github-name';

create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url   text,
  github_login text,
  role         text not null default 'member' check (role in ('member', 'admin', 'owner')),
  created_at   timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists "Read your own profile" on public.profiles;
create policy "Read your own profile" on public.profiles for select to authenticated using ((select auth.uid()) = id);

create table if not exists public.owner_logins (
  github_login text primary key
);
alter table public.owner_logins enable row level security; -- no policies: the website can't read or change it
insert into public.owner_logins (github_login) values ('V13games') on conflict do nothing;

create table if not exists public.discord_posts (
  id           bigint generated always as identity primary key,
  user_id      uuid references auth.users (id) on delete set null,
  channel_id   text not null,
  channel_name text,
  content      text not null,
  message_url  text,
  created_at   timestamptz not null default now()
);
alter table public.discord_posts enable row level security; -- no policies: only the bot code reads and writes it

-- Called by the website after logging in. Makes the profile if it's missing, fills in the name and picture,
-- remembers the GitHub username, and makes the account owner if that username is in owner_logins.
create or replace function public.my_profile()
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  gh text;
  meta jsonb;
  mail text;
  p public.profiles;
begin
  if me is null then
    return null;
  end if;

  select i.identity_data ->> 'user_name' into gh
  from auth.identities i
  where i.user_id = me and i.provider = 'github'
  limit 1;

  select u.raw_user_meta_data, u.email into meta, mail from auth.users u where u.id = me;

  insert into public.profiles (id) values (me) on conflict (id) do nothing;

  update public.profiles set
    github_login = coalesce(gh, github_login),
    display_name = coalesce(display_name, meta ->> 'full_name', meta ->> 'name', meta ->> 'user_name', split_part(mail, '@', 1)),
    avatar_url   = coalesce(avatar_url, meta ->> 'avatar_url', meta ->> 'picture'),
    role = case
      when role = 'member' and gh is not null
        and exists (select 1 from public.owner_logins o where lower(o.github_login) = lower(gh))
      then 'owner'
      else role
    end
  where id = me
  returning * into p;

  return p;
end;
$$;

revoke all on function public.my_profile() from public, anon;
grant execute on function public.my_profile() to authenticated;

-- Who may touch what. Logged-in people can read their own profile (the policy above); the bot code
-- (service_role) reads profiles and writes the post log. Nobody else gets anything.
grant usage on schema public to authenticated, service_role;
grant select on public.profiles to authenticated;
grant select, insert, update on public.profiles to service_role;
grant select, insert on public.discord_posts to service_role;
grant select on public.owner_logins to service_role;
revoke all on public.owner_logins, public.discord_posts from anon, authenticated;
revoke insert, update, delete on public.profiles from anon, authenticated;
