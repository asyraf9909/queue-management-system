"use server";

import { createClient } from "@/lib/supabase/server";

export type QueueReport = {
  ticketsIssued: number;
  waiting: number;
  serving: number;
  completed: number;
  skipped: number;
  averageWaitSeconds: number;
  averageServiceSeconds: number;
  hourly: number[];
};

type ReportTicket = {
  status: string;
  created_at: string;
  called_at: string | null;
  serving_at: string | null;
  completed_at: string | null;
};

export async function getQueueReport(): Promise<QueueReport> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("queue_tickets")
    .select("status, created_at, called_at, serving_at, completed_at")
    .eq("queue_date", new Date().toISOString().slice(0, 10));
  if (error) throw new Error(error.message);

  const tickets = (data ?? []) as ReportTicket[];
  const duration = (start: string | null, end: string | null) => start && end ? Math.max(0, (new Date(end).getTime() - new Date(start).getTime()) / 1000) : 0;
  const waits = tickets.map((ticket) => duration(ticket.created_at, ticket.called_at)).filter(Boolean);
  const services = tickets.map((ticket) => duration(ticket.serving_at, ticket.completed_at)).filter(Boolean);
  const average = (values: number[]) => values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
  const hourly = Array.from({ length: 12 }, (_, index) => tickets.filter((ticket) => new Date(ticket.created_at).getHours() === index + 8).length);

  return {
    ticketsIssued: tickets.length,
    waiting: tickets.filter((ticket) => ticket.status === "WAITING").length,
    serving: tickets.filter((ticket) => ["CALLED", "SERVING"].includes(ticket.status)).length,
    completed: tickets.filter((ticket) => ticket.status === "COMPLETED").length,
    skipped: tickets.filter((ticket) => ticket.status === "SKIPPED").length,
    averageWaitSeconds: average(waits),
    averageServiceSeconds: average(services),
    hourly,
  };
}
