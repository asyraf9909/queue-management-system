export const queueStatuses = ["WAITING", "CALLED", "SERVING", "COMPLETED", "SKIPPED", "CANCELLED"] as const;
export type QueueStatus = (typeof queueStatuses)[number];

export type QueueTicket = {
  id: string;
  queue_number: string;
  queue_date: string;
  sequence: number;
  status: QueueStatus;
  counter_id: string | null;
  created_at: string;
  called_at: string | null;
  serving_at: string | null;
  completed_at: string | null;
  updated_at: string;
};

export type QueueOperationResult = {
  queue_id: string;
  queue_number: string;
  queue_status: QueueStatus;
  counter_number: number | null;
};
