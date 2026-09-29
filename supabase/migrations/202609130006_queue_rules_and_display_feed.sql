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
  if exists (
    select 1 from public.queue_tickets
    where counter_id = target_counter.id and queue_date = current_date and status in ('CALLED', 'SERVING')
  ) then
    raise exception 'Complete or skip the current ticket before calling the next one';
  end if;

  select * into next_ticket from public.queue_tickets
  where queue_date = current_date and status = 'WAITING'
  order by sequence for update skip locked limit 1;
  if next_ticket.id is null then raise exception 'There are no customers waiting'; end if;

  update public.queue_tickets
  set status = 'SERVING', counter_id = target_counter.id, called_at = now(), serving_at = now(), updated_at = now()
  where id = next_ticket.id
  returning * into next_ticket;
  update public.counters set status = 'SERVING', updated_at = now() where id = target_counter.id;
  insert into public.queue_events (queue_id, event_type, counter_id, user_id)
  values (next_ticket.id, 'CALLED', target_counter.id, auth.uid());
  insert into public.queue_events (queue_id, event_type, counter_id, user_id)
  values (next_ticket.id, 'SERVING', target_counter.id, auth.uid());

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
  allowed boolean;
begin
  select * into active_profile from public.profiles where id = auth.uid() and is_active;
  if active_profile.id is null then raise exception 'An active profile is required'; end if;
  select * into target_ticket from public.queue_tickets where id = p_queue_id for update;
  if target_ticket.id is null then raise exception 'Queue ticket not found'; end if;
  allowed := public.is_admin() or target_ticket.counter_id = active_profile.counter_id;
  if not allowed then raise exception 'You cannot operate this counter'; end if;
  select * into target_counter from public.counters where id = target_ticket.counter_id;

  if not (
    (p_event = 'CALLED' and p_status = 'CALLED') or
    (p_event = 'RECALLED' and p_status = 'CALLED') or
    (p_event = 'COMPLETED' and p_status = 'COMPLETED') or
    (p_event = 'SKIPPED' and p_status = 'SKIPPED') or
    (p_event = 'CANCELLED' and p_status = 'CANCELLED')
  ) then
    raise exception 'Queue event and status do not match';
  end if;

  if p_event = 'CALLED' and target_ticket.status <> 'WAITING' then
    raise exception 'Only waiting tickets can be called';
  end if;
  if p_event = 'RECALLED' and target_ticket.status not in ('CALLED', 'SERVING') then
    raise exception 'Only called or serving tickets can be recalled';
  end if;
  if p_event = 'COMPLETED' and target_ticket.status not in ('CALLED', 'SERVING') then
    raise exception 'Only called or serving tickets can be completed';
  end if;
  if p_event = 'SKIPPED' and target_ticket.status not in ('CALLED', 'SERVING') then
    raise exception 'Only called or serving tickets can be skipped';
  end if;
  if p_event = 'CANCELLED' and target_ticket.status not in ('WAITING', 'CALLED', 'SERVING') then
    raise exception 'This ticket cannot be cancelled';
  end if;

  update public.queue_tickets
  set status = p_status,
      called_at = case when p_event in ('CALLED', 'RECALLED') then now() else called_at end,
      completed_at = case when p_status = 'COMPLETED' then now() else completed_at end,
      updated_at = now()
  where id = target_ticket.id
  returning * into target_ticket;
  if p_status in ('COMPLETED', 'SKIPPED', 'CANCELLED') and target_counter.id is not null then
    update public.counters set status = 'AVAILABLE', updated_at = now() where id = target_counter.id;
  end if;
  insert into public.queue_events (queue_id, event_type, counter_id, user_id)
  values (target_ticket.id, p_event, target_ticket.counter_id, auth.uid());

  return query select target_ticket.id, target_ticket.queue_number, target_ticket.status, target_counter.counter_number;
end;
$$;

drop function if exists public.get_public_queue_tickets();

create or replace function public.get_public_queue_tickets()
returns table (id uuid, queue_number text, status public.queue_status, counter_id uuid, counter_number integer, created_at timestamptz, updated_at timestamptz)
language sql stable security definer set search_path = public
as $$
  select ticket.id, ticket.queue_number, ticket.status, ticket.counter_id,
    counter.counter_number, ticket.created_at, ticket.updated_at
  from public.queue_tickets ticket
  left join public.counters counter on counter.id = ticket.counter_id
  where ticket.queue_date = current_date
  order by ticket.sequence;
$$;

grant execute on function public.get_public_queue_tickets() to anon, authenticated;

create or replace function public.update_queue_settings(p_settings jsonb)
returns public.system_settings
language plpgsql security definer set search_path = public
as $$
declare
  updated_settings public.system_settings;
begin
  if not public.is_admin() then raise exception 'Administrator access is required'; end if;

  update public.system_settings set
    brand_name = coalesce(nullif(p_settings->>'brandName', ''), brand_name),
    school_name = coalesce(nullif(p_settings->>'schoolName', ''), school_name),
    branch_name = coalesce(nullif(p_settings->>'branchName', ''), branch_name),
    logo_url = coalesce(p_settings->>'logoUrl', logo_url),
    display_logo_url = coalesce(p_settings->>'displayLogoUrl', display_logo_url),
    primary_color = coalesce(p_settings->>'primaryColor', primary_color),
    accent_color = coalesce(p_settings->>'accentColor', accent_color),
    display_background_color = coalesce(p_settings->>'displayBackgroundColor', display_background_color),
    welcome_title = coalesce(nullif(p_settings->>'welcomeTitle', ''), welcome_title),
    welcome_subtitle = coalesce(nullif(p_settings->>'welcomeSubtitle', ''), welcome_subtitle),
    kiosk_waiting_message = coalesce(nullif(p_settings->>'kioskWaitingMessage', ''), kiosk_waiting_message),
    kiosk_footnote = coalesce(nullif(p_settings->>'kioskFootnote', ''), kiosk_footnote),
    kiosk_welcome_label = coalesce(nullif(p_settings->>'kioskWelcomeLabel', ''), kiosk_welcome_label),
    kiosk_your_number_label = coalesce(nullif(p_settings->>'kioskYourNumberLabel', ''), kiosk_your_number_label),
    kiosk_get_number_label = coalesce(nullif(p_settings->>'kioskGetNumberLabel', ''), kiosk_get_number_label),
    kiosk_take_another_label = coalesce(nullif(p_settings->>'kioskTakeAnotherLabel', ''), kiosk_take_another_label),
    kiosk_print_label = coalesce(nullif(p_settings->>'kioskPrintLabel', ''), kiosk_print_label),
    display_now_serving_label = coalesce(nullif(p_settings->>'displayNowServingLabel', ''), display_now_serving_label),
    display_next_label = coalesce(nullif(p_settings->>'displayNextLabel', ''), display_next_label),
    display_footer_message = coalesce(nullif(p_settings->>'displayFooterMessage', ''), display_footer_message),
    display_proceed_label = coalesce(nullif(p_settings->>'displayProceedLabel', ''), display_proceed_label),
    display_voice_template = coalesce(nullif(p_settings->>'displayVoiceTemplate', ''), display_voice_template),
    display_voice_enabled_label = coalesce(nullif(p_settings->>'displayVoiceEnabledLabel', ''), display_voice_enabled_label),
    display_voice_disabled_label = coalesce(nullif(p_settings->>'displayVoiceDisabledLabel', ''), display_voice_disabled_label),
    help_title = coalesce(nullif(p_settings->>'helpTitle', ''), help_title),
    help_subtitle = coalesce(nullif(p_settings->>'helpSubtitle', ''), help_subtitle),
    support_email = coalesce(nullif(p_settings->>'supportEmail', ''), support_email),
    queue_prefix = coalesce(nullif(p_settings->>'queuePrefix', ''), queue_prefix),
    max_queue_number = greatest(1, least(9999, coalesce((p_settings->>'maxQueueNumber')::integer, max_queue_number))),
    display_next_count = greatest(1, least(10, coalesce((p_settings->>'displayNextCount')::integer, display_next_count))),
    voice_enabled = coalesce((p_settings->>'voiceEnabled')::boolean, voice_enabled),
    sound_enabled = coalesce((p_settings->>'soundEnabled')::boolean, sound_enabled),
    updated_at = now()
  where id = true
  returning * into updated_settings;
  return updated_settings;
end;
$$;

grant execute on function public.update_queue_settings(jsonb) to authenticated;

create or replace function public.get_public_queue_settings()
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'brandName', brand_name,
    'schoolName', school_name,
    'branchName', branch_name,
    'logoUrl', logo_url,
    'displayLogoUrl', display_logo_url,
    'primaryColor', primary_color,
    'accentColor', accent_color,
    'displayBackgroundColor', display_background_color,
    'welcomeTitle', welcome_title,
    'welcomeSubtitle', welcome_subtitle,
    'kioskWaitingMessage', kiosk_waiting_message,
    'kioskFootnote', kiosk_footnote,
    'kioskWelcomeLabel', kiosk_welcome_label,
    'kioskYourNumberLabel', kiosk_your_number_label,
    'kioskGetNumberLabel', kiosk_get_number_label,
    'kioskTakeAnotherLabel', kiosk_take_another_label,
    'kioskPrintLabel', kiosk_print_label,
    'displayNowServingLabel', display_now_serving_label,
    'displayNextLabel', display_next_label,
    'displayFooterMessage', display_footer_message,
    'displayProceedLabel', display_proceed_label,
    'displayVoiceTemplate', display_voice_template,
    'displayVoiceEnabledLabel', display_voice_enabled_label,
    'displayVoiceDisabledLabel', display_voice_disabled_label,
    'helpTitle', help_title,
    'helpSubtitle', help_subtitle,
    'supportEmail', support_email,
    'queuePrefix', queue_prefix,
    'maxQueueNumber', max_queue_number,
    'displayNextCount', display_next_count,
    'voiceEnabled', voice_enabled,
    'soundEnabled', sound_enabled
  ) from public.system_settings where id = true;
$$;

grant execute on function public.get_public_queue_settings() to anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'system_settings'
  ) then
    alter publication supabase_realtime add table public.system_settings;
  end if;
end;
$$;