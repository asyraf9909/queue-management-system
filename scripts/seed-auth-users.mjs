import { createClient } from "@supabase/supabase-js";

const required = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) throw new Error(`Missing environment variables: ${missing.join(", ")}`);

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: organization, error: organizationError } = await admin.from("organizations").select("id").eq("slug", "axis-driving-school").single();
if (organizationError) throw organizationError;
const { data: branch, error: branchError } = await admin.from("branches").select("id").eq("organization_id", organization.id).eq("code", "DOWNTOWN").single();
if (branchError) throw branchError;
const { data: roles, error: rolesError } = await admin.from("roles").select("id, slug").eq("organization_id", organization.id);
if (rolesError) throw rolesError;

const users = [
  { key: "SUPERADMIN", role: "SUPERADMIN", fullName: "Super Administrator", counterNumber: 1 },
  { key: "ADMIN", role: "ADMIN", fullName: "School Administrator", counterNumber: 2 },
  { key: "STAFF", role: "STAFF", fullName: "Counter Staff", counterNumber: 3 },
  { key: "USER", role: "USER", fullName: "School User", counterNumber: null },
];

async function findUser(email) {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const match = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (match) return match;
    if (data.users.length < 1000) break;
  }
  return null;
}

for (const definition of users) {
  const email = process.env[`SEED_${definition.key}_EMAIL`];
  const password = process.env[`SEED_${definition.key}_PASSWORD`];
  if (!email || !password) throw new Error(`Set SEED_${definition.key}_EMAIL and SEED_${definition.key}_PASSWORD`);
  if (password.length < 10) throw new Error(`${definition.key} password must be at least 10 characters`);

  const existing = await findUser(email);
  let user = existing;
  if (existing) {
    const { data, error } = await admin.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
      user_metadata: { full_name: definition.fullName, role: definition.role },
    });
    if (error) throw error;
    user = data.user;
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: definition.fullName, role: definition.role },
    });
    if (error) throw error;
    user = data.user;
  }

  let counterId = null;
  if (definition.counterNumber) {
    const { data: counter, error } = await admin.from("counters").select("id").eq("branch_id", branch.id).eq("counter_number", definition.counterNumber).single();
    if (error) throw error;
    counterId = counter.id;
  }
  const role = roles.find((item) => item.slug === definition.role);
  if (!role) throw new Error(`Role ${definition.role} is not configured for this organization`);

  const { error: profileError } = await admin.from("profiles").upsert({
    id: user.id,
    email,
    organization_id: organization.id,
    branch_id: branch.id,
    role_id: role.id,
    full_name: definition.fullName,
    role: definition.role,
    counter_id: counterId,
    is_active: true,
  });
  if (profileError) throw profileError;

  console.log(`${definition.role}: ${email}`);
}

console.log("Seeded Super Admin, Admin, Staff, and User accounts.");
