import type { WorkflowDefinition, WorkflowType } from "../../../../packages/contracts/src/index.ts";
import { agentProfileService } from "./agent-profile.service.ts";

class WorkflowRegistry {
  list(): WorkflowDefinition[] {
    return agentProfileService.list().map((profile) => ({
      type: profile.workflow,
      domain: profile.domain,
      title: profile.name,
      requiredSlots: profile.slots.filter((slot) => slot.required).map((slot) => slot.key),
      completionDescription: profile.description
    }));
  }

  get(type: WorkflowType) {
    const workflow = this.list().find((item) => item.type === type);
    if (!workflow) throw new Error(`Workflow not found: ${type}`);
    return workflow;
  }
}

export const workflowRegistry = new WorkflowRegistry();
