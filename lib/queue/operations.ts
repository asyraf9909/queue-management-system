"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { QueueOperationResult } from "@/lib/queue/types";

const queueIdSchema = z.object({ queueId: z.string().uuid() });
const takeQueueSchema = z.object({ queueDate: z.string().date().optional() });

async function rpc<T>(name: string, args: Record<string, unknown> = {}) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.message);
  return (Array.isArray(data) ? data[0] : data) as T;
}

export async function takeQueue(input: unknown = {}) {
  const { queueDate } = takeQueueSchema.parse(input);
  return rpc<QueueOperationResult>("take_queue_ticket", { p_queue_date: queueDate ?? null });
}

export async function nextQueue() {
  return rpc<QueueOperationResult>("next_queue_ticket");
}

export async function callQueue(input: unknown) {
  const { queueId } = queueIdSchema.parse(input);
  return rpc<QueueOperationResult>("call_queue_ticket", { p_queue_id: queueId });
}

export async function recallQueue(input: unknown) {
  const { queueId } = queueIdSchema.parse(input);
  return rpc<QueueOperationResult>("recall_queue_ticket", { p_queue_id: queueId });
}

export async function skipQueue(input: unknown) {
  const { queueId } = queueIdSchema.parse(input);
  return rpc<QueueOperationResult>("skip_queue_ticket", { p_queue_id: queueId });
}

export async function completeQueue(input: unknown) {
  const { queueId } = queueIdSchema.parse(input);
  return rpc<QueueOperationResult>("complete_queue_ticket", { p_queue_id: queueId });
}

export async function cancelQueue(input: unknown) {
  const { queueId } = queueIdSchema.parse(input);
  return rpc<QueueOperationResult>("cancel_queue_ticket", { p_queue_id: queueId });
}
