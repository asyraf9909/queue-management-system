alter table public.system_settings
  add column if not exists brand_name text not null default 'Queuewise',
  add column if not exists branch_name text not null default 'Downtown branch',
  add column if not exists logo_url text not null default '',
  add column if not exists display_logo_url text not null default '',
  add column if not exists primary_color text not null default '#263c4b',
  add column if not exists accent_color text not null default '#e67b58',
  add column if not exists display_background_color text not null default '#1c3438',
  add column if not exists welcome_title text not null default 'Take your place in the queue.',
  add column if not exists welcome_subtitle text not null default 'Tap below to receive a number and we will let you know when it is your turn.',
  add column if not exists kiosk_waiting_message text not null default 'Please take a seat. We will call you shortly.',
  add column if not exists kiosk_footnote text not null default 'No appointment? No problem.',
  add column if not exists display_now_serving_label text not null default 'NOW SERVING',
  add column if not exists display_next_label text not null default 'UP NEXT',
  add column if not exists display_footer_message text not null default 'Please wait for your number',
  add column if not exists display_voice_template text not null default 'Number {number}, please proceed to Counter {counter}.',
  add column if not exists help_title text not null default 'Need a hand?',
  add column if not exists help_subtitle text not null default 'Open help center',
  add column if not exists support_email text not null default 'support@example.com';

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
    display_now_serving_label = coalesce(nullif(p_settings->>'displayNowServingLabel', ''), display_now_serving_label),
    display_next_label = coalesce(nullif(p_settings->>'displayNextLabel', ''), display_next_label),
    display_footer_message = coalesce(nullif(p_settings->>'displayFooterMessage', ''), display_footer_message),
    display_voice_template = coalesce(nullif(p_settings->>'displayVoiceTemplate', ''), display_voice_template),
    help_title = coalesce(nullif(p_settings->>'helpTitle', ''), help_title),
    help_subtitle = coalesce(nullif(p_settings->>'helpSubtitle', ''), help_subtitle),
    support_email = coalesce(nullif(p_settings->>'supportEmail', ''), support_email),
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
    'displayNowServingLabel', display_now_serving_label,
    'displayNextLabel', display_next_label,
    'displayFooterMessage', display_footer_message,
    'displayVoiceTemplate', display_voice_template,
    'helpTitle', help_title,
    'helpSubtitle', help_subtitle,
    'supportEmail', support_email,
    'displayNextCount', display_next_count,
    'voiceEnabled', voice_enabled,
    'soundEnabled', sound_enabled
  ) from public.system_settings where id = true;
$$;

grant execute on function public.get_public_queue_settings() to anon, authenticated;

create or replace function public.get_public_queue_tickets()
returns table (id uuid, queue_number text, status public.queue_status, counter_id uuid, created_at timestamptz)
language sql stable security definer set search_path = public
as $$
  select id, queue_number, status, counter_id, created_at
  from public.queue_tickets
  where queue_date = current_date
  order by sequence;
$$;

grant execute on function public.get_public_queue_tickets() to anon, authenticated;

create policy "public display reads today's tickets" on public.queue_tickets
  for select to anon using (queue_date = current_date);
