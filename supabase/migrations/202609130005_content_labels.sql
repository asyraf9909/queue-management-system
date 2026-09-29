alter table public.system_settings
  add column if not exists kiosk_welcome_label text not null default 'WELCOME IN',
  add column if not exists kiosk_your_number_label text not null default 'YOUR QUEUE NUMBER',
  add column if not exists kiosk_get_number_label text not null default 'Get a number',
  add column if not exists kiosk_take_another_label text not null default 'Take another number',
  add column if not exists kiosk_print_label text not null default 'Print ticket',
  add column if not exists display_proceed_label text not null default 'Please proceed to',
  add column if not exists display_voice_enabled_label text not null default 'Voice announcements enabled',
  add column if not exists display_voice_disabled_label text not null default 'Voice announcements disabled';

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
    'displayNextCount', display_next_count,
    'voiceEnabled', voice_enabled,
    'soundEnabled', sound_enabled
  ) from public.system_settings where id = true;
$$;

grant execute on function public.get_public_queue_settings() to anon, authenticated;
