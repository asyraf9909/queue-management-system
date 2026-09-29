"use server";

import { createClient } from "@/lib/supabase/server";

const allowedTypes = new Set(["image/png", "image/jpeg", "image/webp"]);
const maxBytes = 2 * 1024 * 1024;

export async function uploadBrandImage(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File) || !allowedTypes.has(file.type)) {
    throw new Error("Upload a PNG, JPG, or WebP image.");
  }
  if (file.size > maxBytes) {
    throw new Error("Images must be 2 MB or smaller.");
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("Sign in as an administrator to upload branding.");

  const extension = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
  const path = `brand/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from("branding").upload(path, file, {
    cacheControl: "3600",
    contentType: file.type,
    upsert: false,
  });
  if (error) throw new Error(error.message);

  return supabase.storage.from("branding").getPublicUrl(path).data.publicUrl;
}
