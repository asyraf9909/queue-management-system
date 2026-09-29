-- Commit role values before functions and policies reference them.
alter type public.user_role add value if not exists 'SUPERADMIN';
alter type public.user_role add value if not exists 'USER';
