"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const inviteSchema = z.object({
  email: z.string().trim().email(),
  fullName: z.string().trim().min(2).max(120),
  counterNumber: z.number().int().positive().nullable(),
});

export async function inviteStaff(input: unknown) {
  const values = inviteSchema.parse(input);
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("role, organization_id, branch_id").eq("id", (await supabase.auth.getUser()).data.user?.id ?? "").maybeSingle();
  if (!profile || !["ADMIN", "SUPERADMIN"].includes(profile.role)) throw new Error("Administrator access is required.");

  const admin = createAdminClient();
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(values.email);
  if (inviteError || !invited.user) throw new Error(inviteError?.message ?? "Unable to send the invitation.");

  let counterId: string | null = null;
  if (values.counterNumber) {
    const { data: counter } = await admin.from("counters").select("id").eq("counter_number", values.counterNumber).eq("branch_id", profile.branch_id).maybeSingle();
    counterId = counter?.id ?? null;
  }
  const { data: staffRole } = await admin.from("roles").select("id").eq("organization_id", profile.organization_id).eq("slug", "STAFF").maybeSingle();

  const { error: profileError } = await admin.from("profiles").insert({
    id: invited.user.id,
    email: values.email,
    full_name: values.fullName,
    role: "STAFF",
    role_id: staffRole?.id ?? null,
    organization_id: profile.organization_id,
    branch_id: profile.branch_id,
    counter_id: counterId,
    is_active: true,
  });
  if (profileError) throw new Error(profileError.message);

  return { email: values.email, fullName: values.fullName };
}
