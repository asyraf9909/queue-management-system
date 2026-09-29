"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const settingsSchema = z.object({
  brandName: z.string().trim().min(1).max(80),
  schoolName: z.string().trim().min(1).max(120),
  branchName: z.string().trim().min(1).max(120),
  logoUrl: z.string().trim().url().or(z.literal("")),
  displayLogoUrl: z.string().trim().url().or(z.literal("")),
  primaryColor: z.string().regex(/^#[0-9a-f]{6}$/i),
  accentColor: z.string().regex(/^#[0-9a-f]{6}$/i),
  displayBackgroundColor: z.string().regex(/^#[0-9a-f]{6}$/i),
  welcomeTitle: z.string().trim().min(1).max(160),
  welcomeSubtitle: z.string().trim().min(1).max(240),
  kioskWaitingMessage: z.string().trim().min(1).max(160),
  kioskFootnote: z.string().trim().min(1).max(120),
  kioskWelcomeLabel: z.string().trim().min(1).max(60),
  kioskYourNumberLabel: z.string().trim().min(1).max(80),
  kioskGetNumberLabel: z.string().trim().min(1).max(60),
  kioskTakeAnotherLabel: z.string().trim().min(1).max(80),
  kioskPrintLabel: z.string().trim().min(1).max(60),
  displayNowServingLabel: z.string().trim().min(1).max(60),
  displayNextLabel: z.string().trim().min(1).max(60),
  displayFooterMessage: z.string().trim().min(1).max(120),
  displayProceedLabel: z.string().trim().min(1).max(80),
  displayVoiceTemplate: z.string().trim().min(1).max(240),
  displayVoiceEnabledLabel: z.string().trim().min(1).max(100),
  displayVoiceDisabledLabel: z.string().trim().min(1).max(100),
  helpTitle: z.string().trim().min(1).max(80),
  helpSubtitle: z.string().trim().min(1).max(120),
  supportEmail: z.string().trim().email(),
  queuePrefix: z.string().trim().min(1).max(3).regex(/^[A-Za-z0-9]+$/),
  maxQueueNumber: z.number().int().min(1).max(9999),
  displayNextCount: z.number().int().min(1).max(10),
  voiceEnabled: z.boolean(),
  soundEnabled: z.boolean(),
});

export async function updateSettings(input: unknown) {
  const settings = settingsSchema.parse(input);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("update_queue_settings", {
    p_settings: settings,
  });

  if (error) throw new Error(error.message);
  return data;
}
