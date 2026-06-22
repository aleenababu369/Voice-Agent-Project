import type { OperationStatusDto, OperationTypeDto } from "../../features/platform/types";

// Friendly "use case" name for each operation type produced when a call completes.
export const OPERATION_USE_CASE_LABELS: Record<OperationTypeDto, string> = {
  appointment: "Appointment",
  enquiry: "Enquiry",
  reminder_ack: "Reminder",
  follow_up: "Follow-up",
  visitor_routing: "Visitor routing",
  generic: "Other"
};

export const OPERATION_TYPES: OperationTypeDto[] = ["appointment", "enquiry", "reminder_ack", "follow_up", "visitor_routing", "generic"];
export const OPERATION_STATUSES: OperationStatusDto[] = ["created", "scheduled", "in_progress", "completed", "cancelled"];

export function useCaseLabel(type: OperationTypeDto): string {
  return OPERATION_USE_CASE_LABELS[type] ?? type;
}

export function statusVariant(status: OperationStatusDto): "success" | "destructive" | "muted" {
  if (status === "completed") return "success";
  if (status === "cancelled") return "destructive";
  return "muted";
}
