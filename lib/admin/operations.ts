"use server";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const userUpdateSchema = z.object({
  userId: z.string().uuid(),
  fullName: z.string().trim().min(2).max(120),
  roleId: z.string().uuid(),
  branchId: z.string().uuid().nullable(),
  groupId: z.string().uuid().nullable(),
  counterId: z.string().uuid().nullable(),
  isActive: z.boolean(),
});

const roleSchema = z.object({
  roleId: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(80),
  slug: z.string().trim().min(2).max(40).regex(/^[a-z0-9-]+$/),
  description: z.string().trim().max(180),
  permissionKeys: z.array(z.string().min(3).max(80)).max(50),
});

const branchSchema = z.object({
  branchId: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(100),
  code: z.string().trim().min(2).max(20).regex(/^[A-Za-z0-9_-]+$/),
  timezone: z.string().trim().min(2).max(80),
  isActive: z.boolean(),
});

const groupSchema = z.object({
  groupId: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(180),
  branchId: z.string().uuid().nullable(),
  isActive: z.boolean(),
});

const counterSchema = z.object({
  counterId: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(100),
  counterNumber: z.number().int().positive(),
  branchId: z.string().uuid(),
  status: z.enum(["AVAILABLE", "SERVING", "OFFLINE"]),
  isActive: z.boolean(),
});

async function requireAdministrator() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Sign in is required.");

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role, organization_id")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!profile || !["ADMIN", "SUPERADMIN"].includes(profile.role)) {
    throw new Error("Administrator access is required.");
  }
  return { supabase, admin: createAdminClient(), userId: auth.user.id, organizationId: profile.organization_id as string };
}

export type ManagementUser = {
  id: string;
  full_name: string;
  email: string | null;
  role: string;
  role_id: string | null;
  branch_id: string | null;
  group_id: string | null;
  counter_id: string | null;
  is_active: boolean;
  updated_at: string;
  branch_name: string | null;
  group_name: string | null;
  counter_number: number | null;
  counter_name: string | null;
};

export type ManagementRole = {
  id: string;
  name: string;
  slug: string;
  description: string;
  is_system: boolean;
  is_active: boolean;
  permissions: string[];
  member_count: number;
  updated_at: string;
};

export type ManagementBranch = {
  id: string;
  name: string;
  code: string;
  timezone: string;
  is_active: boolean;
  member_count: number;
  counter_count: number;
  updated_at: string;
};

export type ManagementGroup = {
  id: string;
  name: string;
  description: string;
  branch_id: string | null;
  branch_name: string | null;
  member_count: number;
  is_active: boolean;
  updated_at: string;
};

export type ManagementCounter = {
  id: string;
  name: string;
  counter_number: number;
  branch_id: string;
  branch_name: string | null;
  status: "AVAILABLE" | "SERVING" | "OFFLINE";
  assigned_count: number;
  is_active: boolean;
  updated_at: string;
};

export async function listManagementUsers(): Promise<ManagementUser[]> {
  const { supabase } = await requireAdministrator();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, role_id, branch_id, group_id, counter_id, is_active, updated_at, branches(name), groups(name), counters(counter_number, name)")
    .order("full_name");
  if (error) throw new Error(error.message);

  return (data ?? []).map((user) => {
    const branch = user.branches as unknown as { name: string } | null;
    const group = user.groups as unknown as { name: string } | null;
    const counter = user.counters as unknown as { counter_number: number; name: string } | null;
    return {
      id: user.id,
      full_name: user.full_name,
      email: user.email,
      role: user.role,
      role_id: user.role_id,
      branch_id: user.branch_id,
      group_id: user.group_id,
      counter_id: user.counter_id,
      is_active: user.is_active,
      updated_at: user.updated_at,
      branch_name: branch?.name ?? null,
      group_name: group?.name ?? null,
      counter_number: counter?.counter_number ?? null,
      counter_name: counter?.name ?? null,
    };
  });
}

export async function listManagementRoles(): Promise<ManagementRole[]> {
  const { supabase } = await requireAdministrator();
  const [{ data: roles, error: rolesError }, { data: memberships, error: membershipsError }] = await Promise.all([
    supabase.from("roles").select("id, name, slug, description, is_system, is_active, updated_at, role_permissions(permission_key)").order("name"),
    supabase.from("profiles").select("role_id").not("role_id", "is", null),
  ]);
  if (rolesError) throw new Error(rolesError.message);
  if (membershipsError) throw new Error(membershipsError.message);

  const counts = new Map<string, number>();
  for (const membership of memberships ?? []) {
    if (membership.role_id) counts.set(membership.role_id, (counts.get(membership.role_id) ?? 0) + 1);
  }
  return (roles ?? []).map((role) => ({
    id: role.id,
    name: role.name,
    slug: role.slug,
    description: role.description,
    is_system: role.is_system,
    is_active: role.is_active,
    permissions: ((role.role_permissions ?? []) as unknown as Array<{ permission_key: string }>).map((permission) => permission.permission_key),
    member_count: counts.get(role.id) ?? 0,
    updated_at: role.updated_at,
  }));
}

export async function listManagementBranches(): Promise<ManagementBranch[]> {
  const { supabase } = await requireAdministrator();
  const [{ data: branches, error: branchError }, { data: profiles, error: profileError }, { data: counters, error: counterError }] = await Promise.all([
    supabase.from("branches").select("id, name, code, timezone, is_active, updated_at").order("name"),
    supabase.from("profiles").select("branch_id").not("branch_id", "is", null),
    supabase.from("counters").select("branch_id"),
  ]);
  if (branchError || profileError || counterError) throw new Error(branchError?.message ?? profileError?.message ?? counterError?.message ?? "Unable to load branches.");
  const memberCounts = countById(profiles ?? [], "branch_id");
  const counterCounts = countById(counters ?? [], "branch_id");
  return (branches ?? []).map((branch) => ({ ...branch, member_count: memberCounts.get(branch.id) ?? 0, counter_count: counterCounts.get(branch.id) ?? 0 }));
}

export async function listManagementGroups(): Promise<ManagementGroup[]> {
  const { supabase } = await requireAdministrator();
  const [{ data: groups, error: groupError }, { data: profiles, error: profileError }] = await Promise.all([
    supabase.from("groups").select("id, name, description, branch_id, is_active, updated_at, branches(name)").order("name"),
    supabase.from("profiles").select("group_id").not("group_id", "is", null),
  ]);
  if (groupError || profileError) throw new Error(groupError?.message ?? profileError?.message ?? "Unable to load groups.");
  const memberCounts = countById(profiles ?? [], "group_id");
  return (groups ?? []).map((group) => ({
    id: group.id,
    name: group.name,
    description: group.description,
    branch_id: group.branch_id,
    branch_name: (group.branches as unknown as { name: string } | null)?.name ?? null,
    member_count: memberCounts.get(group.id) ?? 0,
    is_active: group.is_active,
    updated_at: group.updated_at,
  }));
}

export async function listManagementCounters(): Promise<ManagementCounter[]> {
  const { supabase } = await requireAdministrator();
  const [{ data: counters, error: counterError }, { data: profiles, error: profileError }] = await Promise.all([
    supabase.from("counters").select("id, name, counter_number, branch_id, status, is_active, updated_at, branches(name)").order("counter_number"),
    supabase.from("profiles").select("counter_id").not("counter_id", "is", null),
  ]);
  if (counterError || profileError) throw new Error(counterError?.message ?? profileError?.message ?? "Unable to load counters.");
  const assignedCounts = countById(profiles ?? [], "counter_id");
  return (counters ?? []).map((counter) => ({
    id: counter.id,
    name: counter.name,
    counter_number: counter.counter_number,
    branch_id: counter.branch_id,
    branch_name: (counter.branches as unknown as { name: string } | null)?.name ?? null,
    status: counter.status,
    assigned_count: assignedCounts.get(counter.id) ?? 0,
    is_active: counter.is_active,
    updated_at: counter.updated_at,
  }));
}

function countById(rows: Array<Record<string, string | null>>, key: string) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const id = row[key];
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

export async function listManagementReferenceData() {
  const { supabase } = await requireAdministrator();
  const [{ data: branches, error: branchError }, { data: groups, error: groupError }, { data: roles, error: roleError }, { data: permissions, error: permissionError }, { data: counters, error: counterError }] = await Promise.all([
    supabase.from("branches").select("id, name, code").eq("is_active", true).order("name"),
    supabase.from("groups").select("id, name, branch_id").eq("is_active", true).order("name"),
    supabase.from("roles").select("id, name, slug").eq("is_active", true).order("name"),
    supabase.from("permissions").select("key, name, description").order("key"),
    supabase.from("counters").select("id, name, counter_number, branch_id, status").eq("is_active", true).order("counter_number"),
  ]);
  if (branchError || groupError || roleError || permissionError || counterError) {
    throw new Error(branchError?.message ?? groupError?.message ?? roleError?.message ?? permissionError?.message ?? counterError?.message ?? "Unable to load management options.");
  }
  return { branches: branches ?? [], groups: groups ?? [], roles: roles ?? [], permissions: permissions ?? [], counters: counters ?? [] };
}

export async function updateManagementUser(input: unknown) {
  const values = userUpdateSchema.parse(input);
  const { supabase, userId, organizationId } = await requireAdministrator();
  if (values.userId === userId && !values.isActive) throw new Error("You cannot deactivate your own account.");

  const [{ data: role }, { data: branch }, { data: group }, { data: counter }] = await Promise.all([
    supabase.from("roles").select("id").eq("id", values.roleId).eq("organization_id", organizationId).maybeSingle(),
    values.branchId ? supabase.from("branches").select("id").eq("id", values.branchId).eq("organization_id", organizationId).maybeSingle() : Promise.resolve({ data: null }),
    values.groupId ? supabase.from("groups").select("id, branch_id").eq("id", values.groupId).eq("organization_id", organizationId).maybeSingle() : Promise.resolve({ data: null }),
    values.counterId ? supabase.from("counters").select("id, branch_id").eq("id", values.counterId).eq("organization_id", organizationId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (!role) throw new Error("The selected role is not available in this organization.");
  if (values.branchId && !branch) throw new Error("The selected branch is not available in this organization.");
  if (values.groupId && (!group || (group.branch_id && group.branch_id !== values.branchId))) throw new Error("The selected group does not belong to this branch.");
  if (values.counterId && (!counter || counter.branch_id !== values.branchId)) throw new Error("The selected counter does not belong to this branch.");

  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: values.fullName,
      role_id: values.roleId,
      branch_id: values.branchId,
      group_id: values.groupId,
      counter_id: values.counterId,
      is_active: values.isActive,
      updated_at: new Date().toISOString(),
    })
    .eq("id", values.userId);
  if (error) throw new Error(error.message);
  return { userId: values.userId };
}

export async function deleteManagementUser(userId: string) {
  const targetId = z.string().uuid().parse(userId);
  const { admin, userId: actorId } = await requireAdministrator();
  if (targetId === actorId) throw new Error("You cannot delete your own account.");
  const { error } = await admin.auth.admin.deleteUser(targetId);
  if (error) throw new Error(error.message);
  return { userId: targetId };
}

export async function saveManagementRole(input: unknown) {
  const values = roleSchema.parse(input);
  const { supabase, organizationId } = await requireAdministrator();
  let persistedSlug = values.slug;
  if (values.roleId) {
    const { data: existingRole, error: existingRoleError } = await supabase
      .from("roles")
      .select("slug, is_system")
      .eq("id", values.roleId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (existingRoleError) throw new Error(existingRoleError.message);
    if (!existingRole) throw new Error("Role not found.");
    if (existingRole.is_system) persistedSlug = existingRole.slug;
  }
  const payload = {
    organization_id: organizationId,
    name: values.name,
    slug: persistedSlug,
    description: values.description,
    updated_at: new Date().toISOString(),
  };

  let roleId = values.roleId;
  if (roleId) {
    const { error } = await supabase.from("roles").update(payload).eq("id", roleId).eq("organization_id", organizationId);
    if (error) throw new Error(error.message);
  } else {
    const { data, error } = await supabase.from("roles").insert(payload).select("id").single();
    if (error || !data) throw new Error(error?.message ?? "Unable to create role.");
    roleId = data.id;
  }

  if (!roleId) throw new Error("Role id is missing.");
  const { error: deletePermissionsError } = await supabase.from("role_permissions").delete().eq("role_id", roleId);
  if (deletePermissionsError) throw new Error(deletePermissionsError.message);
  if (values.permissionKeys.length > 0) {
    const { error: permissionError } = await supabase.from("role_permissions").insert(values.permissionKeys.map((permissionKey) => ({ role_id: roleId, permission_key: permissionKey })));
    if (permissionError) throw new Error(permissionError.message);
  }
  return { roleId };
}

export async function deleteManagementRole(roleId: string) {
  const targetId = z.string().uuid().parse(roleId);
  const { supabase, organizationId } = await requireAdministrator();
  const { data: role, error: roleError } = await supabase.from("roles").select("is_system").eq("id", targetId).eq("organization_id", organizationId).maybeSingle();
  if (roleError) throw new Error(roleError.message);
  if (!role) throw new Error("Role not found.");
  if (role.is_system) throw new Error("System roles cannot be deleted.");

  const { count, error: memberError } = await supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role_id", targetId);
  if (memberError) throw new Error(memberError.message);
  if (count) throw new Error("Reassign this role's members before deleting it.");
  const { error } = await supabase.from("roles").delete().eq("id", targetId).eq("organization_id", organizationId);
  if (error) throw new Error(error.message);
  return { roleId: targetId };
}

export async function saveManagementBranch(input: unknown) {
  const values = branchSchema.parse(input);
  const { supabase, organizationId } = await requireAdministrator();
  const payload = { organization_id: organizationId, name: values.name, code: values.code.toUpperCase(), timezone: values.timezone, is_active: values.isActive, updated_at: new Date().toISOString() };
  if (values.branchId) {
    const { error } = await supabase.from("branches").update(payload).eq("id", values.branchId).eq("organization_id", organizationId);
    if (error) throw new Error(error.message);
    return { branchId: values.branchId };
  }
  const { data, error } = await supabase.from("branches").insert(payload).select("id").single();
  if (error || !data) throw new Error(error?.message ?? "Unable to create branch.");
  return { branchId: data.id };
}

export async function deleteManagementBranch(branchId: string) {
  const targetId = z.string().uuid().parse(branchId);
  const { supabase, organizationId } = await requireAdministrator();
  const [{ count: memberCount }, { count: counterCount }, { count: ticketCount }] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("branch_id", targetId),
    supabase.from("counters").select("id", { count: "exact", head: true }).eq("branch_id", targetId),
    supabase.from("queue_tickets").select("id", { count: "exact", head: true }).eq("branch_id", targetId),
  ]);
  if ((memberCount ?? 0) + (counterCount ?? 0) + (ticketCount ?? 0) > 0) throw new Error("This branch has users, counters, or queue history. Deactivate it instead of deleting it.");
  const { error } = await supabase.from("branches").delete().eq("id", targetId).eq("organization_id", organizationId);
  if (error) throw new Error(error.message);
  return { branchId: targetId };
}

export async function saveManagementGroup(input: unknown) {
  const values = groupSchema.parse(input);
  const { supabase, organizationId } = await requireAdministrator();
  if (values.branchId) {
    const { data: branch } = await supabase.from("branches").select("id").eq("id", values.branchId).eq("organization_id", organizationId).maybeSingle();
    if (!branch) throw new Error("The selected branch is not available in this organization.");
  }
  const payload = { organization_id: organizationId, name: values.name, description: values.description, branch_id: values.branchId, is_active: values.isActive, updated_at: new Date().toISOString() };
  if (values.groupId) {
    const { error } = await supabase.from("groups").update(payload).eq("id", values.groupId).eq("organization_id", organizationId);
    if (error) throw new Error(error.message);
    return { groupId: values.groupId };
  }
  const { data, error } = await supabase.from("groups").insert(payload).select("id").single();
  if (error || !data) throw new Error(error?.message ?? "Unable to create group.");
  return { groupId: data.id };
}

export async function deleteManagementGroup(groupId: string) {
  const targetId = z.string().uuid().parse(groupId);
  const { supabase, organizationId } = await requireAdministrator();
  const { error } = await supabase.from("groups").delete().eq("id", targetId).eq("organization_id", organizationId);
  if (error) throw new Error(error.message);
  return { groupId: targetId };
}

export async function saveManagementCounter(input: unknown) {
  const values = counterSchema.parse(input);
  const { supabase, organizationId } = await requireAdministrator();
  const { data: branch } = await supabase.from("branches").select("id").eq("id", values.branchId).eq("organization_id", organizationId).maybeSingle();
  if (!branch) throw new Error("The selected branch is not available in this organization.");
  const payload = { organization_id: organizationId, name: values.name, counter_number: values.counterNumber, branch_id: values.branchId, status: values.status, is_active: values.isActive, updated_at: new Date().toISOString() };
  if (values.counterId) {
    const { error } = await supabase.from("counters").update(payload).eq("id", values.counterId).eq("organization_id", organizationId);
    if (error) throw new Error(error.message);
    return { counterId: values.counterId };
  }
  const { data, error } = await supabase.from("counters").insert(payload).select("id").single();
  if (error || !data) throw new Error(error?.message ?? "Unable to create counter.");
  return { counterId: data.id };
}

export async function deleteManagementCounter(counterId: string) {
  const targetId = z.string().uuid().parse(counterId);
  const { supabase, organizationId } = await requireAdministrator();
  const { count } = await supabase.from("profiles").select("id", { count: "exact", head: true }).eq("counter_id", targetId);
  if ((count ?? 0) > 0) throw new Error("Unassign this counter from users before deleting it.");
  const { error } = await supabase.from("counters").delete().eq("id", targetId).eq("organization_id", organizationId);
  if (error) throw new Error(error.message);
  return { counterId: targetId };
}