-- supabase/migrations/0015_instagram.sql
--
-- Instagram account figures, read with the Instagram API (Business Login for
-- Instagram). Instagram only returns today's follower count and keeps daily
-- insights for 90 days, so the sync stores a row per day to build up history.

-- The connected account. One row: connecting again replaces it. The access
-- token is a secret, so like the financial tables this has RLS with no
-- policies and no grants to anon or authenticated.
create table instagram_account (
  id boolean primary key default true,
  ig_user_id text not null,
  username text not null,
  access_token text not null,
  token_expires_at timestamptz not null,
  token_refreshed_at timestamptz not null default now(),
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  last_sync_error text,
  constraint instagram_account_single_row check (id)
);

-- One row per Nepal calendar day. Follower figures are snapshots taken on that
-- day, so they exist only from the day the account was connected. The other
-- figures are Instagram's daily totals, filled in for up to 90 days back.
-- A null means Instagram returned nothing, which it does for some figures on
-- accounts under 100 followers.
create table instagram_daily (
  ig_user_id text not null,
  day date not null,
  followers_count integer,
  follows_count integer,
  media_count integer,
  reach integer,
  views integer,
  accounts_engaged integer,
  total_interactions integer,
  likes integer,
  comments integer,
  shares integer,
  saves integer,
  profile_links_taps integer,
  metrics_synced_at timestamptz,
  primary key (ig_user_id, day)
);

-- Posts and reels, with their lifetime figures. Stories aren't listed by the
-- media endpoint and expire after a day, so they aren't kept.
create table instagram_media (
  id text primary key,
  ig_user_id text not null,
  caption text,
  media_type text not null,
  media_product_type text,
  permalink text,
  posted_at timestamptz not null,
  like_count integer,
  comments_count integer,
  reach integer,
  views integer,
  saved integer,
  shares integer,
  total_interactions integer,
  insights_updated_at timestamptz,
  updated_at timestamptz not null default now()
);
create index instagram_media_account_posted_idx on instagram_media (ig_user_id, posted_at);

alter table instagram_account enable row level security;
alter table instagram_daily enable row level security;
alter table instagram_media enable row level security;

grant select, insert, update, delete on instagram_account to service_role;
grant select, insert, update, delete on instagram_daily to service_role;
grant select, insert, update, delete on instagram_media to service_role;
