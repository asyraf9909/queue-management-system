do $$
declare
  default_organization_id uuid;
  default_branch_id uuid;
begin
  select id into default_organization_id from public.organizations where slug = 'axis-driving-school';
  select id into default_branch_id from public.branches where organization_id = default_organization_id and code = 'DOWNTOWN';

  insert into public.counters (organization_id, branch_id, counter_number, name, status, is_active)
  values
    (default_organization_id, default_branch_id, 1, 'Counter 01', 'AVAILABLE', true),
    (default_organization_id, default_branch_id, 2, 'Counter 02', 'AVAILABLE', true),
    (default_organization_id, default_branch_id, 3, 'Counter 03', 'AVAILABLE', true),
    (default_organization_id, default_branch_id, 4, 'Counter 04', 'OFFLINE', true)
  on conflict (branch_id, counter_number) do update set
    name = excluded.name,
    is_active = excluded.is_active;
end $$;

-- Create the first Auth user in Supabase Dashboard, then link it as an administrator:
-- insert into public.profiles (id, organization_id, branch_id, role_id, full_name, role, is_active)
-- select 'AUTH_USER_UUID', organization.id, branch.id, role.id, 'Sam Lee', 'ADMIN', true
-- from public.organizations organization
-- join public.branches branch on branch.organization_id = organization.id and branch.code = 'DOWNTOWN'
-- join public.roles role on role.organization_id = organization.id and role.slug = 'ADMIN'
-- where organization.slug = 'axis-driving-school'
-- on conflict (id) do update set role = 'ADMIN', is_active = true;
