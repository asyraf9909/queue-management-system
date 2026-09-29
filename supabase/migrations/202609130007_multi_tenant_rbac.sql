create extension if not exists pgcrypto;

do $$ begin
  create type public.tenant_status as enum ('TRIAL', 'ACTIVE', 'SUSPENDED', 'CANCELLED');
exception when duplicate_object then null; end $$;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  status public.tenant_status not null default 'TRIAL',
  plan text not null default 'ANNUAL',
  billing_email text,
  contract_started_on date,
  contract_ends_on date,
  maintenance_included boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  code text not null check (code ~ '^[A-Za-z0-9_-]+$'),
  timezone text not null default 'Asia/Kuala_Lumpur',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code),
  unique (organization_id, name)
);

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  name text not null,
  description text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table if not exists public.permissions (
  key text primary key,
  name text not null,
  description text not null default ''
);

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  slug text not null,
  description text not null default '',
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug),
  unique (organization_id, name)
);

create table if not exists public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_key text not null references public.permissions(key) on delete cascade,
  primary key (role_id, permission_key)
);

insert into public.permissions (key, name, description) values
  ('users.read', 'View users', 'View members in the organization'),
  ('users.manage', 'Manage users', 'Invite, edit, deactivate, and remove users'),
  ('roles.read', 'View roles', 'View roles and permissions'),
  ('roles.manage', 'Manage roles', 'Create and edit custom roles'),
  ('branches.manage', 'Manage branches', 'Create and configure branches'),
  ('groups.manage', 'Manage groups', 'Create and configure staff groups'),
  ('queue.operate', 'Operate queue', 'Call, recall, complete, and skip tickets'),
  ('reports.read', 'View reports', 'View queue performance reports'),
  ('settings.manage', 'Manage settings', 'Edit organization and queue settings')
on conflict (key) do update set name = excluded.name, description = excluded.description;

do $$
declare
  default_organization_id uuid;
  default_branch_id uuid;
  default_group_id uuid;
begin
  insert into public.organizations (name, slug, status, plan, maintenance_included)
  values ('Axis Driving School', 'axis-driving-school', 'ACTIVE', 'ANNUAL', true)
  on conflict (slug) do update set name = excluded.name
  returning id into default_organization_id;

  insert into public.branches (organization_id, name, code)
  values (default_organization_id, 'Downtown branch', 'DOWNTOWN')
  on conflict (organization_id, code) do update set name = excluded.name
  returning id into default_branch_id;

  insert into public.groups (organization_id, branch_id, name, description)
  values (default_organization_id, default_branch_id, 'Front desk', 'Default front-desk operators')
  on conflict (organization_id, name) do update set branch_id = excluded.branch_id
  returning id into default_group_id;

  alter table public.profiles add column if not exists organization_id uuid references public.organizations(id) on delete cascade;
  alter table public.profiles add column if not exists branch_id uuid references public.branches(id) on delete set null;
  alter table public.profiles add column if not exists group_id uuid references public.groups(id) on delete set null;
  alter table public.profiles add column if not exists role_id uuid references public.roles(id) on delete set null;
  alter table public.profiles add column if not exists email text;

  alter table public.counters add column if not exists organization_id uuid references public.organizations(id) on delete cascade;
  alter table public.counters add column if not exists branch_id uuid references public.branches(id) on delete cascade;
  alter table public.counters add column if not exists group_id uuid references public.groups(id) on delete set null;

  alter table public.queue_tickets add column if not exists organization_id uuid references public.organizations(id) on delete cascade;
  alter table public.queue_tickets add column if not exists branch_id uuid references public.branches(id) on delete cascade;
  alter table public.queue_tickets add column if not exists group_id uuid references public.groups(id) on delete set null;

  alter table public.queue_events add column if not exists organization_id uuid references public.organizations(id) on delete cascade;
  alter table public.queue_events add column if not exists branch_id uuid references public.branches(id) on delete cascade;

  update public.profiles set organization_id = default_organization_id, branch_id = coalesce(branch_id, default_branch_id), group_id = coalesce(group_id, default_group_id) where organization_id is null;
  update public.counters set organization_id = default_organization_id, branch_id = coalesce(branch_id, default_branch_id) where organization_id is null;
  update public.queue_tickets set organization_id = default_organization_id, branch_id = coalesce(branch_id, default_branch_id) where organization_id is null;
  update public.queue_events event set organization_id = ticket.organization_id, branch_id = ticket.branch_id
  from public.queue_tickets ticket where event.queue_id = ticket.id and event.organization_id is null;

  alter table public.profiles alter column organization_id set not null;
  alter table public.counters alter column organization_id set not null;
  alter table public.counters alter column branch_id set not null;
  alter table public.queue_tickets alter column organization_id set not null;
  alter table public.queue_tickets alter column branch_id set not null;
  alter table public.queue_events alter column organization_id set not null;
  alter table public.queue_events alter column branch_id set not null;
end $$;

alter table public.counters drop constraint if exists counters_counter_number_key;
alter table public.queue_tickets drop constraint if exists queue_tickets_queue_date_sequence_key;
alter table public.queue_tickets drop constraint if exists queue_tickets_queue_date_queue_number_key;
create unique index if not exists counters_branch_number_key on public.counters (branch_id, counter_number);
create unique index if not exists queue_tickets_branch_date_sequence_key on public.queue_tickets (branch_id, queue_date, sequence);
create unique index if not exists queue_tickets_branch_date_number_key on public.queue_tickets (branch_id, queue_date, queue_number);

do $$
declare
  organization_record record;
  role_record record;
begin
  for organization_record in select id from public.organizations loop
    insert into public.roles (organization_id, name, slug, description, is_system)
    values
      (organization_record.id, 'Super administrator', 'SUPERADMIN', 'Full platform access', true),
      (organization_record.id, 'Administrator', 'ADMIN', 'Manage an organization', true),
      (organization_record.id, 'Staff', 'STAFF', 'Operate an assigned branch counter', true),
      (organization_record.id, 'User', 'USER', 'Basic authenticated access', true)
    on conflict (organization_id, slug) do nothing;
  end loop;

  update public.profiles profile
  set role_id = role.id,
      email = coalesce(profile.email, auth_user.email)
  from public.roles role
  left join auth.users auth_user on auth_user.id = profile.id
  where role.organization_id = profile.organization_id
    and role.slug = profile.role::text
    and profile.role_id is null;

  for role_record in select id, slug from public.roles loop
    if role_record.slug in ('SUPERADMIN', 'ADMIN') then
      insert into public.role_permissions (role_id, permission_key)
      select role_record.id, key from public.permissions on conflict do nothing;
    elsif role_record.slug = 'STAFF' then
      insert into public.role_permissions (role_id, permission_key)
      values (role_record.id, 'queue.operate'), (role_record.id, 'reports.read') on conflict do nothing;
    else
      insert into public.role_permissions (role_id, permission_key)
      values (role_record.id, 'users.read'), (role_record.id, 'roles.read') on conflict do nothing;
    end if;
  end loop;
end $$;

create table if not exists public.branch_settings (
  branch_id uuid primary key references public.branches(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.branch_settings (branch_id)
select id from public.branches on conflict (branch_id) do nothing;

create or replace function public.current_organization_id()
returns uuid language sql stable security definer set search_path = public
as $$ select organization_id from public.profiles where id = auth.uid() and is_active limit 1; $$;

create or replace function public.current_branch_id()
returns uuid language sql stable security definer set search_path = public
as $$ select branch_id from public.profiles where id = auth.uid() and is_active limit 1; $$;

create or replace function public.default_branch_id()
returns uuid language sql stable security definer set search_path = public
as $$ select id from public.branches where is_active order by created_at limit 1; $$;

create or replace function public.has_permission(p_permission_key text)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.profiles profile
    join public.roles role on role.id = profile.role_id
    join public.role_permissions permission on permission.role_id = role.id
    where profile.id = auth.uid() and profile.is_active and permission.permission_key = p_permission_key
  ) or public.is_superadmin();
$$;

drop function if exists public.take_queue_ticket(date);

create or replace function public.take_queue_ticket(p_queue_date date default null, p_branch_id uuid default null)
returns table (queue_id uuid, queue_number text, queue_status public.queue_status, counter_number integer)
language plpgsql security definer set search_path = public
as $$
declare
  settings public.system_settings%rowtype;
  next_sequence integer;
  target_branch uuid := coalesce(p_branch_id, public.current_branch_id(), public.default_branch_id());
  target_organization uuid;
  target_date date := coalesce(p_queue_date, current_date);
  new_ticket public.queue_tickets%rowtype;
begin
  select organization_id into target_organization from public.branches where id = target_branch and is_active;
  if target_organization is null then raise exception 'An active branch is required'; end if;
  select * into settings from public.system_settings where id = true for update;
  select coalesce(max(sequence), 0) + 1 into next_sequence from public.queue_tickets where branch_id = target_branch and queue_date = target_date;
  if next_sequence > settings.max_queue_number then raise exception 'The queue is full for %', target_date; end if;

  insert into public.queue_tickets (queue_number, queue_date, sequence, organization_id, branch_id)
  values (settings.queue_prefix || lpad(next_sequence::text, 3, '0'), target_date, next_sequence, target_organization, target_branch)
  returning * into new_ticket;

  insert into public.queue_events (queue_id, organization_id, branch_id, event_type, metadata)
  values (new_ticket.id, target_organization, target_branch, 'CREATED', jsonb_build_object('source', 'kiosk'));
  return query select new_ticket.id, new_ticket.queue_number, new_ticket.status, null::integer;
end;
$$;

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
  if active_profile.id is null or active_profile.role not in ('SUPERADMIN', 'ADMIN', 'STAFF') or active_profile.counter_id is null then raise exception 'An active counter assignment is required'; end if;
  select * into target_counter from public.counters where id = active_profile.counter_id and is_active for update;
  if target_counter.id is null then raise exception 'Assigned counter is unavailable'; end if;
  if exists (select 1 from public.queue_tickets where branch_id = target_counter.branch_id and counter_id = target_counter.id and queue_date = current_date and status in ('CALLED', 'SERVING')) then raise exception 'Complete or skip the current ticket before calling the next one'; end if;
  select * into next_ticket from public.queue_tickets where branch_id = target_counter.branch_id and queue_date = current_date and status = 'WAITING' order by sequence for update skip locked limit 1;
  if next_ticket.id is null then raise exception 'There are no customers waiting'; end if;

  update public.queue_tickets set status = 'SERVING', counter_id = target_counter.id, called_at = now(), serving_at = now(), updated_at = now() where id = next_ticket.id returning * into next_ticket;
  update public.counters set status = 'SERVING', updated_at = now() where id = target_counter.id;
  insert into public.queue_events (queue_id, organization_id, branch_id, event_type, counter_id, user_id) values (next_ticket.id, next_ticket.organization_id, next_ticket.branch_id, 'CALLED', target_counter.id, auth.uid()), (next_ticket.id, next_ticket.organization_id, next_ticket.branch_id, 'SERVING', target_counter.id, auth.uid());
  return query select next_ticket.id, next_ticket.queue_number, next_ticket.status, target_counter.counter_number;
end;
$$;

create or replace function public.transition_queue_ticket(p_queue_id uuid, p_event public.queue_event_type, p_status public.queue_status)
returns table (queue_id uuid, queue_number text, queue_status public.queue_status, counter_number integer)
language plpgsql security definer set search_path = public
as $$
declare
  active_profile public.profiles%rowtype;
  target_ticket public.queue_tickets%rowtype;
  target_counter public.counters%rowtype;
begin
  select * into active_profile from public.profiles where id = auth.uid() and is_active;
  if active_profile.id is null then raise exception 'An active profile is required'; end if;
  select * into target_ticket from public.queue_tickets where id = p_queue_id for update;
  if target_ticket.id is null then raise exception 'Queue ticket not found'; end if;
  if active_profile.organization_id <> target_ticket.organization_id then raise exception 'You cannot operate another organization''s queue'; end if;
  if not (public.is_admin() or target_ticket.counter_id = active_profile.counter_id) then raise exception 'You cannot operate this counter'; end if;
  select * into target_counter from public.counters where id = target_ticket.counter_id;

  if not ((p_event = 'CALLED' and p_status = 'CALLED') or (p_event = 'RECALLED' and p_status = 'CALLED') or (p_event = 'COMPLETED' and p_status = 'COMPLETED') or (p_event = 'SKIPPED' and p_status = 'SKIPPED') or (p_event = 'CANCELLED' and p_status = 'CANCELLED')) then raise exception 'Queue event and status do not match'; end if;
  if p_event = 'CALLED' and target_ticket.status <> 'WAITING' then raise exception 'Only waiting tickets can be called'; end if;
  if p_event = 'RECALLED' and target_ticket.status not in ('CALLED', 'SERVING') then raise exception 'Only called or serving tickets can be recalled'; end if;
  if p_event = 'COMPLETED' and target_ticket.status not in ('CALLED', 'SERVING') then raise exception 'Only called or serving tickets can be completed'; end if;
  if p_event = 'SKIPPED' and target_ticket.status not in ('CALLED', 'SERVING') then raise exception 'Only called or serving tickets can be skipped'; end if;
  if p_event = 'CANCELLED' and target_ticket.status not in ('WAITING', 'CALLED', 'SERVING') then raise exception 'This ticket cannot be cancelled'; end if;

  update public.queue_tickets
  set status = p_status,
      called_at = case when p_event in ('CALLED', 'RECALLED') then now() else called_at end,
      completed_at = case when p_status = 'COMPLETED' then now() else completed_at end,
      updated_at = now()
  where id = target_ticket.id
  returning * into target_ticket;
  if p_status in ('COMPLETED', 'SKIPPED', 'CANCELLED') and target_counter.id is not null then update public.counters set status = 'AVAILABLE', updated_at = now() where id = target_counter.id; end if;
  insert into public.queue_events (queue_id, organization_id, branch_id, event_type, counter_id, user_id)
  values (target_ticket.id, target_ticket.organization_id, target_ticket.branch_id, p_event, target_ticket.counter_id, auth.uid());
  return query select target_ticket.id, target_ticket.queue_number, target_ticket.status, target_counter.counter_number;
end;
$$;

drop function if exists public.get_public_queue_tickets();

create or replace function public.get_public_queue_tickets(p_branch_id uuid default null)
returns table (id uuid, queue_number text, status public.queue_status, counter_id uuid, counter_number integer, created_at timestamptz, updated_at timestamptz)
language sql stable security definer set search_path = public
as $$
  select ticket.id, ticket.queue_number, ticket.status, ticket.counter_id, counter.counter_number, ticket.created_at, ticket.updated_at
  from public.queue_tickets ticket
  left join public.counters counter on counter.id = ticket.counter_id
  where ticket.branch_id = coalesce(p_branch_id, public.current_branch_id(), public.default_branch_id()) and ticket.queue_date = current_date
  order by ticket.sequence;
$$;

grant execute on function public.get_public_queue_tickets(uuid) to anon, authenticated;
grant execute on function public.take_queue_ticket(date, uuid) to anon, authenticated;

create index if not exists profiles_organization_idx on public.profiles (organization_id, branch_id, is_active);
create index if not exists roles_organization_idx on public.roles (organization_id, is_active);
create index if not exists groups_organization_idx on public.groups (organization_id, branch_id, is_active);
create index if not exists queue_tickets_branch_date_status_idx on public.queue_tickets (branch_id, queue_date, status, sequence);

alter table public.organizations enable row level security;
alter table public.branches enable row level security;
alter table public.groups enable row level security;
alter table public.permissions enable row level security;
alter table public.roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.branch_settings enable row level security;

create policy "members read own organization" on public.organizations for select to authenticated using (id = public.current_organization_id());
create policy "members read own branches" on public.branches for select to authenticated using (organization_id = public.current_organization_id());
create policy "admins manage own branches" on public.branches for all to authenticated using (organization_id = public.current_organization_id() and public.has_permission('branches.manage')) with check (organization_id = public.current_organization_id() and public.has_permission('branches.manage'));
create policy "members read own groups" on public.groups for select to authenticated using (organization_id = public.current_organization_id());
create policy "admins manage own groups" on public.groups for all to authenticated using (organization_id = public.current_organization_id() and public.has_permission('groups.manage')) with check (organization_id = public.current_organization_id() and public.has_permission('groups.manage'));
create policy "members read permissions" on public.permissions for select to authenticated using (true);
create policy "members read own roles" on public.roles for select to authenticated using (organization_id = public.current_organization_id());
create policy "admins manage own roles" on public.roles for all to authenticated using (organization_id = public.current_organization_id() and public.has_permission('roles.manage')) with check (organization_id = public.current_organization_id() and public.has_permission('roles.manage'));
create policy "members read own role permissions" on public.role_permissions for select to authenticated using (exists (select 1 from public.roles role where role.id = role_id and role.organization_id = public.current_organization_id()));
create policy "admins manage own role permissions" on public.role_permissions for all to authenticated using (exists (select 1 from public.roles role where role.id = role_id and role.organization_id = public.current_organization_id() and public.has_permission('roles.manage'))) with check (exists (select 1 from public.roles role where role.id = role_id and role.organization_id = public.current_organization_id() and public.has_permission('roles.manage')));
create policy "members read own branch settings" on public.branch_settings for select to authenticated using (exists (select 1 from public.branches branch where branch.id = branch_id and branch.organization_id = public.current_organization_id()));
create policy "admins manage own branch settings" on public.branch_settings for all to authenticated using (exists (select 1 from public.branches branch where branch.id = branch_id and branch.organization_id = public.current_organization_id() and public.has_permission('settings.manage'))) with check (exists (select 1 from public.branches branch where branch.id = branch_id and branch.organization_id = public.current_organization_id() and public.has_permission('settings.manage')));

drop policy if exists "users read own profile" on public.profiles;
drop policy if exists "admins manage profiles" on public.profiles;
create policy "users read own organization profiles" on public.profiles for select to authenticated using (id = auth.uid() or (organization_id = public.current_organization_id() and public.has_permission('users.read')));
create policy "admins manage own organization profiles" on public.profiles for all to authenticated using (organization_id = public.current_organization_id() and public.has_permission('users.manage')) with check (organization_id = public.current_organization_id() and public.has_permission('users.manage'));

drop policy if exists "admins manage counters" on public.counters;
create policy "admins manage own organization counters" on public.counters for all to authenticated using (organization_id = public.current_organization_id() and public.is_admin()) with check (organization_id = public.current_organization_id() and public.is_admin());