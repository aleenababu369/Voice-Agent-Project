import type { OperationType, SessionOutcomeType, WorkflowType } from "../../../../packages/contracts/src/index.ts";

export function operationTypeForWorkflow(workflow: WorkflowType): OperationType {
  switch (workflow) {
    case "appointment_booking": return "appointment";
    case "institution_reception":
    case "general_enquiry": return "enquiry";
    case "frontdesk_reception": return "visitor_routing";
    case "fee_reminder": return "reminder_ack";
    case "follow_up_confirmation": return "follow_up";
    default: return "generic";
  }
}

export function outcomeTypeForOperation(type: OperationType): SessionOutcomeType {
  switch (type) {
    case "appointment": return "appointment_confirmed";
    case "enquiry": return "enquiry_forwarded";
    case "visitor_routing": return "visitor_routed";
    case "follow_up": return "callback_scheduled";
    default: return "closed_no_action";
  }
}

export function operationLabel(type: OperationType) {
  return type.replace(/_/g, " ");
}
