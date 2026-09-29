create or replace function public.is_superadmin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'SUPERADMIN' and is_active
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('SUPERADMIN', 'ADMIN') and is_active
  );
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
  if active_profile.id is null or active_profile.role not in ('SUPERADMIN', 'ADMIN', 'STAFF') or active_profile.counter_id is null then
    raise exception 'An active counter assignment is required';
  end if;
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

drop policy if exists "admins manage counters" on public.counters;
create policy "admins manage counters" on public.counters
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "admins manage profiles" on public.profiles;
create policy "admins manage profiles" on public.profiles
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "admins manage settings" on public.system_settings;
create policy "admins manage settings" on public.system_settings
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

insert into storage.buckets (id, name, public)
values ('branding', 'branding', true)
on conflict (id) do update set public = true;

create policy "admins upload branding images" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'branding' and public.is_admin());

create policy "public read branding images" on storage.objects
  for select to public
  using (bucket_id = 'branding');

create policy "admins delete branding images" on storage.objects
  for delete to authenticated
  using (bucket_id = 'branding' and public.is_admin());
