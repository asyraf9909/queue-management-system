create extension if not exists pgcrypto;

do $$ begin
  create type public.user_role as enum ('ADMIN', 'STAFF');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.counter_status as enum ('AVAILABLE', 'SERVING', 'OFFLINE');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.queue_status as enum ('WAITING', 'CALLED', 'SERVING', 'COMPLETED', 'SKIPPED', 'CANCELLED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.queue_event_type as enum ('CREATED', 'CALLED', 'RECALLED', 'SERVING', 'COMPLETED', 'SKIPPED', 'CANCELLED');
exception when duplicate_object then null; end $$;

create table if not exists public.counters (
  id uuid primary key default gen_random_uuid(),
  counter_number integer not null unique check (counter_number > 0),
  name text not null,
  status public.counter_status not null default 'AVAILABLE',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role public.user_role not null default 'STAFF',
  counter_id uuid references public.counters(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.queue_tickets (
  id uuid primary key default gen_random_uuid(),
  queue_number text not null,
  queue_date date not null default current_date,
  sequence integer not null check (sequence > 0),
  status public.queue_status not null default 'WAITING',
  counter_id uuid references public.counters(id) on delete set null,
  created_at timestamptz not null default now(),
  called_at timestamptz,
  serving_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (queue_date, sequence),
  unique (queue_date, queue_number)
);

create table if not exists public.queue_events (
  id uuid primary key default gen_random_uuid(),
  queue_id uuid not null references public.queue_tickets(id) on delete cascade,
  event_type public.queue_event_type not null,
  counter_id uuid references public.counters(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.system_settings (
  id boolean primary key default true check (id),
  school_name text not null default 'Axis Driving School',
  queue_prefix text not null default 'A' check (length(queue_prefix) between 1 and 3),
  max_queue_number integer not null default 999 check (max_queue_number between 1 and 9999),
  display_next_count integer not null default 4 check (display_next_count between 1 and 10),
  voice_enabled boolean not null default true,
  sound_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.system_settings (id) values (true) on conflict (id) do nothing;

create index if not exists queue_tickets_date_status_idx on public.queue_tickets (queue_date, status, sequence);
create index if not exists queue_events_queue_id_idx on public.queue_events (queue_id, created_at desc);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.profiles where id = auth.uid() and role = 'ADMIN' and is_active); $$;

create or replace function public.take_queue_ticket(p_queue_date date default null)
returns table (queue_id uuid, queue_number text, queue_status public.queue_status, counter_number integer)
language plpgsql security definer set search_path = public
as $$
declare
  settings public.system_settings%rowtype;
  next_sequence integer;
  target_date date := coalesce(p_queue_date, current_date);
  new_ticket public.queue_tickets%rowtype;
begin
  select * into settings from public.system_settings where id = true for update;
  select coalesce(max(sequence), 0) + 1 into next_sequence from public.queue_tickets where queue_date = target_date;
  if next_sequence > settings.max_queue_number then raise exception 'The queue is full for %', target_date; end if;

  insert into public.queue_tickets (queue_number, queue_date, sequence)
  values (settings.queue_prefix || lpad(next_sequence::text, 3, '0'), target_date, next_sequence)
  returning * into new_ticket;

  insert into public.queue_events (queue_id, event_type, metadata)
  values (new_ticket.id, 'CREATED', jsonb_build_object('source', 'kiosk'));

  return query select new_ticket.id, new_ticket.queue_number, new_ticket.status, null::integer;
end;
$$;

grant execute on function public.take_queue_ticket(date) to anon, authenticated;

create or replace function public.next_queue_ticket()
returns table (queue_id uuid, queue_number text, queue_status public.queue_status, counter_number integer)
language plpgsql security definer set search_path = public
as $$
declare
  active_profile public.profiles%rowtype;
  next_ticket public.queue_tickets%rowtype;
  target_counter public.counters%rowtype;
begin
  select * into active_profile from public.profiles where id = auth.uid() and is_active for update;
  if active_profile.id is null or (active_profile.role <> 'ADMIN' and active_profile.counter_id is null) then raise exception 'An active counter assignment is required'; end if;
  select * into target_counter from public.counters where id = active_profile.counter_id and is_active for update;
  if target_counter.id is null then raise exception 'Assigned counter is unavailable'; end if;

  select * into next_ticket from public.queue_tickets where queue_date = current_date and status = 'WAITING' order by sequence for update skip locked limit 1;
  if next_ticket.id is null then raise exception 'There are no customers waiting'; end if;

  update public.queue_tickets set status = 'SERVING', counter_id = target_counter.id, called_at = now(), serving_at = now(), updated_at = now() where id = next_ticket.id returning * into next_ticket;
  update public.counters set status = 'SERVING', updated_at = now() where id = target_counter.id;
  insert into public.queue_events (queue_id, event_type, counter_id, user_id) values (next_ticket.id, 'CALLED', target_counter.id, auth.uid());
  insert into public.queue_events (queue_id, event_type, counter_id, user_id) values (next_ticket.id, 'SERVING', target_counter.id, auth.uid());

  return query select next_ticket.id, next_ticket.queue_number, next_ticket.status, target_counter.counter_number;
end;
$$;

grant execute on function public.next_queue_ticket() to authenticated;

create or replace function public.transition_queue_ticket(p_queue_id uuid, p_event public.queue_event_type, p_status public.queue_status)
returns table (queue_id uuid, queue_number text, queue_status public.queue_status, counter_number integer)
language plpgsql security definer set search_path = public
as $$
declare
  active_profile public.profiles%rowtype;
  target_ticket public.queue_tickets%rowtype;
  target_counter public.counters%rowtype;
  allowed boolean;
begin
  select * into active_profile from public.profiles where id = auth.uid() and is_active;
  if active_profile.id is null then raise exception 'An active profile is required'; end if;
  select * into target_ticket from public.queue_tickets where id = p_queue_id for update;
  if target_ticket.id is null then raise exception 'Queue ticket not found'; end if;
  allowed := public.is_admin() or target_ticket.counter_id = active_profile.counter_id;
  if not allowed then raise exception 'You cannot operate this counter'; end if;
  select * into target_counter from public.counters where id = target_ticket.counter_id;

  update public.queue_tickets set status = p_status, called_at = case when p_event in ('CALLED', 'RECALLED') then now() else called_at end, completed_at = case when p_status = 'COMPLETED' then now() else completed_at end, updated_at = now() where id = target_ticket.id returning * into target_ticket;
  if p_status in ('COMPLETED', 'SKIPPED', 'CANCELLED') and target_counter.id is not null then update public.counters set status = 'AVAILABLE', updated_at = now() where id = target_counter.id; end if;
  insert into public.queue_events (queue_id, event_type, counter_id, user_id) values (target_ticket.id, p_event, target_ticket.counter_id, auth.uid());

  return query select target_ticket.id, target_ticket.queue_number, target_ticket.status, target_counter.counter_number;
end;
$$;

grant execute on function public.transition_queue_ticket(uuid, public.queue_event_type, public.queue_status) to authenticated;

create or replace function public.call_queue_ticket(p_queue_id uuid) returns table (queue_id uuid, queue_number text, queue_status public.queue_status, counter_number integer) language sql security definer set search_path = public as $$ select * from public.transition_queue_ticket(p_queue_id, 'CALLED', 'CALLED'); $$;
create or replace function public.recall_queue_ticket(p_queue_id uuid) returns table (queue_id uuid, queue_number text, queue_status public.queue_status, counter_number integer) language sql security definer set search_path = public as $$ select * from public.transition_queue_ticket(p_queue_id, 'RECALLED', 'CALLED'); $$;
create or replace function public.skip_queue_ticket(p_queue_id uuid) returns table (queue_id uuid, queue_number text, queue_status public.queue_status, counter_number integer) language sql security definer set search_path = public as $$ select * from public.transition_queue_ticket(p_queue_id, 'SKIPPED', 'SKIPPED'); $$;
create or replace function public.complete_queue_ticket(p_queue_id uuid) returns table (queue_id uuid, queue_number text, queue_status public.queue_status, counter_number integer) language sql security definer set search_path = public as $$ select * from public.transition_queue_ticket(p_queue_id, 'COMPLETED', 'COMPLETED'); $$;
create or replace function public.cancel_queue_ticket(p_queue_id uuid) returns table (queue_id uuid, queue_number text, queue_status public.queue_status, counter_number integer) language sql security definer set search_path = public as $$ select * from public.transition_queue_ticket(p_queue_id, 'CANCELLED', 'CANCELLED'); $$;

drop view if exists public.queue_display;
create view public.queue_display as
select queue_number, status, counter_id, called_at, updated_at from public.queue_tickets where queue_date = current_date and status in ('CALLED', 'SERVING');
grant select on public.queue_display to anon, authenticated;

alter table public.counters enable row level security;
alter table public.profiles enable row level security;
alter table public.queue_tickets enable row level security;
alter table public.queue_events enable row level security;
alter table public.system_settings enable row level security;

create policy "authenticated users can read active counters" on public.counters for select to authenticated using (is_active or public.is_admin());
create policy "admins manage counters" on public.counters for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "users read own profile" on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
create policy "admins manage profiles" on public.profiles for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "authenticated users read tickets" on public.queue_tickets for select to authenticated using (true);
create policy "authenticated users read events" on public.queue_events for select to authenticated using (true);
create policy "authenticated users read settings" on public.system_settings for select to authenticated using (true);
create policy "admins manage settings" on public.system_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());

alter publication supabase_realtime add table public.queue_tickets;
