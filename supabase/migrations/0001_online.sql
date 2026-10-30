-- ============================================================
-- 联机第一批：账号资料 + 邀请信令
-- 适用：Supabase Postgres（免费层）
-- 执行方式：Dashboard → SQL Editor 整段执行，或 supabase db push
-- ============================================================

/* ---------------- 1. 用户资料 ---------------- */

create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  nickname    text not null unique check (char_length(nickname) between 2 and 16),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.profiles is '联机昵称。在线状态走 Presence，不落库。';

alter table public.profiles enable row level security;

grant select, update on public.profiles to authenticated;

drop policy if exists "profiles read for authenticated" on public.profiles;
create policy "profiles read for authenticated"
  on public.profiles for select
  to authenticated
  using (true);

drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- 注册后自动建资料；昵称冲突时自动加随机后缀，不让用户卡在注册页
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base      text := coalesce(nullif(trim(new.raw_user_meta_data ->> 'nickname'), ''), '玩家');
  candidate text := left(base, 12);
  guard     int := 0;
begin
  while exists (select 1 from public.profiles where nickname = candidate) loop
    guard := guard + 1;
    candidate := left(base, 12) || '_' || lpad(floor(random() * 9000 + 1000)::text, 4, '0');
    exit when guard > 5;
  end loop;

  insert into public.profiles (id, nickname)
  values (new.id, candidate)
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 改名时自动刷新 updated_at
create or replace function public.touch_profile()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch
  before update on public.profiles
  for each row execute function public.touch_profile();

/* ---------------- 2. 邀请信令 ---------------- */

create table if not exists public.game_invites (
  id            uuid primary key default gen_random_uuid(),
  from_id       uuid not null references auth.users (id) on delete cascade,
  to_id         uuid not null references auth.users (id) on delete cascade,
  game_key      text not null check (char_length(game_key) between 1 and 32),
  -- 房间码实测 11–13 位且长度不固定，必须原样保存，只校验不裁剪
  room_code     text check (room_code is null or char_length(room_code) between 4 and 32),
  status        text not null default 'pending'
                check (status in ('pending', 'accepted', 'declined', 'expired', 'cancelled')),
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default now() + interval '30 seconds',
  responded_at  timestamptz,
  constraint no_self_invite check (from_id <> to_id)
);

comment on column public.game_invites.room_code is 'Netlib 房间码，长度不固定（实测 11–13 位），禁止截断';

create index if not exists game_invites_to_pending
  on public.game_invites (to_id, status, expires_at);
create index if not exists game_invites_from_pending
  on public.game_invites (from_id, status, expires_at);

alter table public.game_invites enable row level security;

grant select, insert, update on public.game_invites to authenticated;

drop policy if exists "invites read own" on public.game_invites;
create policy "invites read own"
  on public.game_invites for select
  to authenticated
  using (from_id = auth.uid() or to_id = auth.uid());

drop policy if exists "invites insert as self" on public.game_invites;
create policy "invites insert as self"
  on public.game_invites for insert
  to authenticated
  with check (from_id = auth.uid() and status = 'pending');

drop policy if exists "invites cancel own" on public.game_invites;
create policy "invites cancel own"
  on public.game_invites for update
  to authenticated
  using (from_id = auth.uid() and status = 'pending')
  with check (from_id = auth.uid() and status = 'cancelled');

/* 接收方响应：只允许 to_id 本人，且仅 pending 且未过期 */
create or replace function public.respond_invite(
  p_invite_id uuid,
  p_accept    boolean
) returns public.game_invites
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.game_invites;
begin
  update public.game_invites
     set status = case when p_accept then 'accepted' else 'declined' end,
         responded_at = now()
   where id = p_invite_id
     and to_id = auth.uid()
     and status = 'pending'
     and expires_at > now()
  returning * into v;

  if v.id is null then
    raise exception 'invite_unavailable' using errcode = 'P0001';
  end if;

  return v;
end;
$$;

revoke all on function public.respond_invite(uuid, boolean) from public;
grant execute on function public.respond_invite(uuid, boolean) to authenticated;

/* 发起方写入房间码：只允许 from_id 本人，且已 accepted、尚未写过 */
create or replace function public.attach_room_code(
  p_invite_id uuid,
  p_room_code text
) returns public.game_invites
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.game_invites;
begin
  if p_room_code is null or char_length(p_room_code) not between 4 and 32 then
    raise exception 'room_code_invalid' using errcode = 'P0001';
  end if;

  update public.game_invites
     set room_code = p_room_code          -- 原样写入，不 left()、不 trim
   where id = p_invite_id
     and from_id = auth.uid()
     and status = 'accepted'
     and room_code is null
     and expires_at > now() - interval '20 seconds'
  returning * into v;

  if v.id is null then
    raise exception 'room_code_rejected' using errcode = 'P0001';
  end if;

  return v;
end;
$$;

revoke all on function public.attach_room_code(uuid, text) from public;
grant execute on function public.attach_room_code(uuid, text) to authenticated;

/* 清理过期邀请：进入大厅时由前端调用一次即可，无需 pg_cron */
create or replace function public.expire_stale_invites()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  update public.game_invites
     set status = 'expired'
   where status = 'pending'
     and expires_at < now();
  get diagnostics n = row_count;
  return n;
end;
$$;

grant execute on function public.expire_stale_invites() to authenticated;

/* --------------- 3. Realtime ---------------- */

do $$
begin
  if not exists (
    select 1
      from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'game_invites'
  ) then
    alter publication supabase_realtime add table public.game_invites;
  end if;
end;
$$;

/* --------------- 4. 自检 ---------------- */

-- 期望：两张表 rowsecurity 均为 true
select relname, relrowsecurity
  from pg_class
 where relname in ('profiles', 'game_invites');
